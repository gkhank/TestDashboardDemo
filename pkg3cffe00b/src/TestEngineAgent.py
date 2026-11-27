"""
Troubleshooting assistant over TestEngineExecution data: rule-based diagnosis enriched by an LLM when available.
"""

import json
import re

_log = c3.log()

_HISTORY_LIMIT = 20
_STEP_DETAIL_CHARS = 1500
_EXTRA_LOG_CHARS = 3000

# Ordered: the first category whose pattern matches the error text wins.
_CATEGORIES = [
    ("Timeout", r"timeout|timed out|time-out|deadline exceeded"),
    ("Authentication", r"\b401\b|\b403\b|unauthori[sz]ed|forbidden|access denied|authentication|token (has )?expired|login failed"),
    ("Connectivity", r"connection (refused|reset|closed)|unreachable|no such host|socket|\b50[234]\b|network|name resolution|ssl|tls handshake"),
    ("Null reference", r"nullreference|nullpointer|object reference not set|cannot read propert|is null"),
    ("Test data", r"not found|\b404\b|no data|test data|does not exist|duplicate|invalid (data|input)|data reference"),
    ("Assertion", r"assert|expected|but was|mismatch|verification failed|should (be|have)|actual"),
    ("Environment/setup", r"setup|initiali[sz]|configuration|deploy|environment|driver|could not start|missing dependency"),
]

_NEXT_STEPS = {
    "Timeout": [
        "Check whether the system under test was slow or down at the time of the run (compare with other runs that hour).",
        "Review the step's wait/timeout settings; increase only if the operation is legitimately slow.",
        "Replace fixed sleeps with explicit waits on the expected condition.",
    ],
    "Authentication": [
        "Verify the credentials/token used by the test environment have not expired or been rotated.",
        "Confirm the test user still has the required roles in the target environment.",
    ],
    "Connectivity": [
        "Check the availability of the endpoint/service called by the failing step (health checks, recent deployments).",
        "Look for the same error in other test cases at the same time - a shared outage points to infrastructure, not the test.",
    ],
    "Null reference": [
        "Inspect the step's inputs: a missing field in the test data or API response often causes this.",
        "Check recent changes to the test module method used by the failing step.",
    ],
    "Test data": [
        "Verify the data reference used by the run still exists and is enabled in the TestCaseDataSet.",
        "Check whether another test consumed or modified the shared test data (parallel runs).",
    ],
    "Assertion": [
        "Compare the expected vs actual values in the step details - decide whether the product or the expectation changed.",
        "Check recent releases of the system under test for intended behaviour changes before updating the test.",
    ],
    "Environment/setup": [
        "Re-run the test case alone to rule out ordering/parallelism effects.",
        "Check environment configuration and dependencies used during setup.",
    ],
    "Unclassified": [
        "Read the full step details and extra logs for the first error.",
        "Re-run the test case to see whether the failure reproduces.",
    ],
}

_SYSTEM_PROMPT = (
    "You are a senior test-automation engineer helping a team troubleshoot automated test results from their "
    "TestEngineFramework. Use only the data provided. Be concise and specific, cite step names, error lines, "
    "dates and counts from the data, and say clearly when the data is not enough to be sure. Answer in markdown."
)


def _is_pass(verdict):
    return verdict in ("Passed", "Pass")


def _clip(text, limit):
    if not text:
        return ""
    text = str(text)
    return text if len(text) <= limit else text[:limit] + " ...[truncated]"


def _categorize(text):
    for name, pattern in _CATEGORIES:
        if re.search(pattern, text or "", re.IGNORECASE):
            return name
    return "Unclassified"


def _error_lines(text, limit=5):
    lines = [l.strip() for l in (text or "").splitlines() if l.strip() and not re.match(r"at\s", l.strip())]
    strong = [l for l in lines if re.search(r"exception|assert|timeout|timed out|refused|denied|not found|unauthori|forbidden|\berror\b", l, re.IGNORECASE)]
    weak = [l for l in lines if l not in strong and re.search(r"fail|expected|invalid|null", l, re.IGNORECASE)]
    return [l[:300] for l in ((strong + weak) or lines)[:limit]]


def _transitions(history):
    """Number of pass/fail flips between consecutive runs."""
    results = [_is_pass(h.verdict) for h in history]
    return sum(1 for a, b in zip(results, results[1:]) if a != b)


def _llm_complete(messages):
    """Returns (text, notice). text is None when the configured LLM client cannot answer; notice says why."""
    name = c3.TestEngineAgent.Config.inst().configValue("llmClientName") or "gpt_4o"
    try:
        client = c3.GenaiCore.Llm.Completion.Client.forName(name)
        if client is None:
            return None, "No LLM client named '{}' is configured.".format(name)
        response = client.completion(
            messages=messages, options={"returnJson": True, "temperature": 0.2, "max_tokens": 1500}
        )
        return response["choices"][0]["message"]["content"], None
    except Exception as e:  # the notice is returned to the caller and shown in the UI
        first_line = str(e).strip().splitlines()[0] if str(e).strip() else type(e).__name__
        _log.warn("LLM client {} failed: {}", name, first_line)
        return None, "LLM client '{}' is not available ({}). Showing rule-based analysis.".format(name, first_line[:240])


def _spec_filter(spec):
    parts = []
    if spec is not None:
        if spec.testEnvironment:
            parts.append(str(c3.Filter.eq("testEnvironment", spec.testEnvironment)))
        if spec.testSuite:
            parts.append(str(c3.Filter.eq("testSuite", spec.testSuite)))
        if spec.dateFrom:
            parts.append(str(c3.Filter.ge("startedAt", spec.dateFrom)))
        if spec.dateTo:
            parts.append(str(c3.Filter.lt("startedAt", spec.dateTo)))
    return " && ".join(parts) if parts else None


def analyzeExecution(cls, executionId):
    ex = c3.TestEngineExecution.forId(executionId)
    if ex is None:
        raise ValueError("Execution not found: {}".format(executionId))

    steps = c3.TestEngineExecution.Step.fetch(
        filter=c3.Filter.eq("execution.id", executionId),
        include="testStepId, testStepName, verdict, details, executedAt",
        order="ascending(testStepId)",
        limit=200,
    ).objs or []
    failed_step = next((s for s in steps if not _is_pass(s.verdict)), None)
    error_text = "\n".join(filter(None, [failed_step.details if failed_step else None, ex.extraLogs]))

    history = c3.TestEngineExecution.fetch(
        filter=c3.Filter.eq("testCaseName", ex.testCaseName),
        include="id, verdict, startedAt, errorSignature",
        order="descending(startedAt)",
        limit=_HISTORY_LIMIT,
    ).objs or []
    passes = sum(1 for h in history if _is_pass(h.verdict))

    similar_count = 0
    similar_tests = []
    if ex.errorSignature:
        similar_filter = c3.Filter.eq("errorSignature", ex.errorSignature).and_().ne("id", ex.id)
        similar_count = c3.TestEngineExecution.fetchCount(filter=similar_filter)
        similar = c3.TestEngineExecution.fetch(filter=similar_filter, include="testCaseName", limit=200).objs or []
        similar_tests = sorted({s.testCaseName for s in similar if s.testCaseName != ex.testCaseName})[:5]

    passed = _is_pass(ex.verdict)
    category = "Passed" if passed else _categorize(error_text)
    key_lines = [] if passed else _error_lines(error_text)
    flaky = _transitions(history) >= 2

    facts = {
        "executionId": ex.id,
        "testCaseName": ex.testCaseName,
        "testSuite": ex.testSuite,
        "testEnvironment": ex.testEnvironment,
        "verdict": ex.verdict,
        "executionState": ex.executionState,
        "startedAt": str(ex.startedAt),
        "completedAt": str(ex.completedAt),
        "dataReferenceId": ex.dataReferenceId,
        "jiraTestCaseId": ex.jiraTestCaseId,
        "ruleBasedCategory": category,
        "steps": [
            {
                "step": s.testStepId,
                "name": s.testStepName,
                "verdict": s.verdict,
                "details": _clip(s.details, _STEP_DETAIL_CHARS),
            }
            for s in steps[:25]
        ],
        "extraLogs": _clip(ex.extraLogs, _EXTRA_LOG_CHARS),
        "recentHistory": [{"verdict": h.verdict, "startedAt": str(h.startedAt)} for h in history],
        "otherFailuresWithSameError": similar_count,
        "otherTestCasesWithSameError": similar_tests,
    }

    text, notice = _llm_complete(
        [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": "Diagnose this test execution. Use the sections: **Summary**, **Likely root cause**, "
                "**Evidence**, **Is it flaky or a regression?**, **Next steps**.\n\n```json\n"
                + json.dumps(facts, indent=1, default=str)
                + "\n```",
            },
        ]
    )
    if text is None:
        text = _fallback_analysis(ex, category, failed_step, key_lines, history, passes, similar_count, similar_tests)

    return c3.TestEngineAgent.Analysis(
        executionId=ex.id,
        category=category,
        failedStepName=failed_step.testStepName if failed_step else None,
        keyErrorLines=key_lines,
        recentRuns=len(history),
        recentPasses=passes,
        flaky=flaky,
        similarFailureCount=similar_count,
        similarTestCases=similar_tests,
        markdown=text,
        usedLlm=notice is None,
        llmNotice=notice,
    )


def _fallback_analysis(ex, category, failed_step, key_lines, history, passes, similar_count, similar_tests):
    if _is_pass(ex.verdict):
        return "### Summary\nThis execution **passed** - there is nothing to troubleshoot. {} of the last {} runs of `{}` passed.".format(
            passes, len(history), ex.testCaseName
        )

    out = ["### Summary"]
    step_txt = (
        "at step {} *{}*".format(failed_step.testStepId, failed_step.testStepName)
        if failed_step
        else "before any step result was recorded (setup failure)"
    )
    out.append("`{}` ended with verdict **{}** {}. Failure category: **{}**.".format(ex.testCaseName, ex.verdict, step_txt, category))
    if key_lines:
        out.append("\n### Key error lines\n```\n" + "\n".join(key_lines) + "\n```")

    out.append("\n### Flaky or regression?")
    flips = _transitions(history)
    if not history:
        out.append("No run history is available.")
    elif passes == 0:
        out.append("All {} recent runs failed - this looks like a **consistent failure**, not flakiness.".format(len(history)))
    elif flips >= 2:
        out.append(
            "{} of the last {} runs passed and the verdict flipped {} times - the test looks **flaky/intermittent**.".format(
                passes, len(history), flips
            )
        )
    elif _is_pass(history[0].verdict):
        out.append(
            "The latest run of this test case passed ({} of the last {} passed) - this failure looks fixed or was a one-off.".format(
                passes, len(history)
            )
        )
    else:
        streak = next((i for i, h in enumerate(history) if _is_pass(h.verdict)), len(history))
        since = str(history[streak - 1].startedAt)[:16] if streak else "-"
        out.append(
            "The test passed before and has failed in the last {} run(s) since {} - this looks like a **regression** "
            "(a product, environment or test-data change around that time).".format(streak, since)
        )

    if similar_count and similar_tests:
        others = ", ".join("`{}`".format(t) for t in similar_tests)
        out.append(
            "\n### Similar failures\n{} other failed run(s) share this error signature, including other test cases: {}. "
            "A shared cause (environment, service or data) is likely.".format(similar_count, others)
        )
    elif similar_count:
        out.append(
            "\n### Similar failures\n{} other failed run(s) of this same test case share this error signature - "
            "it is a recurring failure specific to this test.".format(similar_count)
        )

    out.append("\n### Next steps")
    out.extend("- " + s for s in _NEXT_STEPS.get(category, _NEXT_STEPS["Unclassified"]))
    return "\n".join(out)


def ask(cls, question, history=None, spec=None):
    summary = c3.TestEngineExecution.dashboardSummary(spec)
    flt = _spec_filter(spec)
    fail_filter = str(c3.Filter.ne("verdict", "Passed"))
    recent_failures = c3.TestEngineExecution.fetch(
        filter=fail_filter if not flt else flt + " && " + fail_filter,
        include="id, testCaseName, testSuite, verdict, startedAt, failedStepName, errorSignature",
        order="descending(startedAt)",
        limit=20,
    ).objs or []

    mentioned = [t.testCaseName for t in (summary.topFailingTests or []) if t.testCaseName.lower() in question.lower()]
    test_runs = {}
    for name in mentioned[:3]:
        runs = c3.TestEngineExecution.fetch(
            filter=c3.Filter.eq("testCaseName", name),
            include="verdict, startedAt, failedStepName, errorSignature",
            order="descending(startedAt)",
            limit=10,
        ).objs or []
        test_runs[name] = [
            {"verdict": r.verdict, "startedAt": str(r.startedAt), "failedStep": r.failedStepName, "error": r.errorSignature}
            for r in runs
        ]

    context = {
        "filters": {
            "testEnvironment": spec.testEnvironment if spec else None,
            "testSuite": spec.testSuite if spec else None,
            "dateFrom": str(spec.dateFrom) if spec and spec.dateFrom else None,
            "dateTo": str(spec.dateTo) if spec and spec.dateTo else None,
        },
        "kpis": {
            "totalRuns": summary.totalRuns,
            "passedRuns": summary.passedRuns,
            "failedRuns": summary.failedRuns,
            "passRate": round(summary.passRate or 0, 3),
            "testCases": summary.testCaseCount,
            "testCasesCurrentlyFailing": summary.currentlyFailingCount,
        },
        "verdicts": [{"verdict": v.verdict, "runs": v.runCount} for v in (summary.byVerdict or [])],
        "suites": [
            {"suite": s.testSuite, "runs": s.total, "failed": s.failed, "passRate": round(s.passRate or 0, 3)}
            for s in (summary.bySuite or [])
        ],
        "dailyTrend": [{"day": d.day, "runs": d.total, "failed": d.failed} for d in (summary.trend or [])],
        "topFailingTests": [
            {
                "testCase": t.testCaseName,
                "suite": t.testSuite,
                "failures": t.failures,
                "runs": t.runs,
                "flaky": t.flaky,
                "lastError": t.lastErrorSignature,
            }
            for t in (summary.topFailingTests or [])
        ],
        "errorClusters": [
            {"error": c.errorSignature, "failures": c.failures, "testCases": list(c.testCaseNames or [])}
            for c in (summary.errorClusters or [])
        ],
        "recentFailures": [
            {
                "executionId": f.id,
                "testCase": f.testCaseName,
                "suite": f.testSuite,
                "verdict": f.verdict,
                "startedAt": str(f.startedAt),
                "failedStep": f.failedStepName,
                "error": f.errorSignature,
            }
            for f in recent_failures
        ],
        "runsOfMentionedTests": test_runs,
    }

    messages = [{"role": "system", "content": _SYSTEM_PROMPT}]
    for m in (history or [])[-10:]:
        messages.append({"role": "assistant" if m.role == "assistant" else "user", "content": m.content})
    messages.append(
        {
            "role": "user",
            "content": "Test result data for the current filters:\n```json\n"
            + json.dumps(context, indent=1, default=str)
            + "\n```\n\nQuestion: "
            + question,
        }
    )

    text, notice = _llm_complete(messages)
    if text is None:
        text = _fallback_answer(question, summary, recent_failures)
    return c3.TestEngineAgent.Reply(answer=text, usedLlm=notice is None, llmNotice=notice)


def _fallback_answer(question, summary, recent_failures):
    q = question.lower()
    out = []
    if not summary.totalRuns:
        return "There are no test executions for the current filters."

    if "flaky" in q or "intermittent" in q:
        flaky = [t for t in (summary.topFailingTests or []) if t.flaky]
        out.append("### Possibly flaky tests")
        out.extend(
            "- `{}` ({}) - failed {} of {} runs".format(t.testCaseName, t.testSuite, t.failures, t.runs) for t in flaky
        )
        if not flaky:
            out.append("No test case both passed and failed in this period.")
        return "\n".join(out)

    if "suite" in q:
        out.append("### Suites by pass rate (worst first)")
        out.extend(
            "- **{}**: {:.0%} pass ({} failed of {})".format(s.testSuite, s.passRate or 0, s.failed, s.total)
            for s in (summary.bySuite or [])
        )
        return "\n".join(out)

    out.append("### Overview")
    out.append(
        "{} runs of {} test cases: **{:.0%} passed**, {} failed. {} test case(s) are failing on their latest run.".format(
            summary.totalRuns, summary.testCaseCount, summary.passRate or 0, summary.failedRuns, summary.currentlyFailingCount
        )
    )
    if summary.topFailingTests:
        out.append("\n### Most failing tests")
        out.extend(
            "- `{}` ({}) - {} of {} runs failed{}".format(
                t.testCaseName, t.testSuite, t.failures, t.runs, ", flaky" if t.flaky else ""
            )
            for t in summary.topFailingTests[:5]
        )
    if summary.errorClusters:
        out.append("\n### Most common errors")
        out.extend(
            "- {} failure(s): `{}` - {}".format(c.failures, c.errorSignature, ", ".join(list(c.testCaseNames or [])[:3]))
            for c in summary.errorClusters[:5]
        )
    if recent_failures:
        f = recent_failures[0]
        out.append(
            "\nThe latest failure is `{}` at {} (step: {}). Open it in **Results** and click **Analyze** for a diagnosis.".format(
                f.testCaseName, str(f.startedAt)[:16], f.failedStepName or "setup"
            )
        )
    return "\n".join(out)
