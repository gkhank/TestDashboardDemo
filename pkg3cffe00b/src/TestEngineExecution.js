/*
 * Aggregation and API sync for TestEngineFramework execution results.
 */
var log = Logger.for('TestEngineExecution');

var API_PAGE_SIZE = 100;
// Lines naming a concrete error win over lines that only say something "failed".
var STRONG_ERROR_HINT = /(exception|assert|timeout|timed out|refused|denied|not found|unauthori|forbidden|\berror\b)/i;
var WEAK_ERROR_HINT = /(fail|expected|invalid|null)/i;

function isPass(verdict) {
  return verdict === 'Passed' || verdict === 'Pass';
}

/*
 * Combines the optional spec conditions; each piece goes through the Filter builder.
 */
function specFilter(spec) {
  var parts = [];
  if (spec) {
    if (spec.testEnvironment) parts.push(Filter.eq('testEnvironment', spec.testEnvironment).toString());
    if (spec.testSuite) parts.push(Filter.eq('testSuite', spec.testSuite).toString());
    if (spec.dateFrom) parts.push(Filter.ge('startedAt', spec.dateFrom).toString());
    if (spec.dateTo) parts.push(Filter.lt('startedAt', spec.dateTo).toString());
  }
  return parts.length ? parts.join(' && ') : null;
}

function isoDay(dateTime) {
  return new Date(dateTime.millis).toISOString().substring(0, 10);
}

function dashboardSummary(spec) {
  var totals = { runs: 0, passed: 0, durSum: 0, durN: 0 };
  var verdicts = {};
  var suites = {};
  var days = {};
  var tests = {};
  var clusters = {};

  var fetchSpec = {
    include: 'id, testSuite, testCaseName, verdict, startedAt, completedAt, errorSignature',
    order: 'ascending(startedAt)',
  };
  var filter = specFilter(spec);
  if (filter) fetchSpec.filter = filter;

  TestEngineExecution.fetchObjStream(fetchSpec).each(function (e) {
    var pass = isPass(e.verdict);
    totals.runs++;
    if (pass) totals.passed++;
    if (e.startedAt && e.completedAt) {
      totals.durSum += (e.completedAt.millis - e.startedAt.millis) / 1000;
      totals.durN++;
    }

    verdicts[e.verdict] = (verdicts[e.verdict] || 0) + 1;

    var s = suites[e.testSuite] || (suites[e.testSuite] = { testSuite: e.testSuite, total: 0, passed: 0, failed: 0 });
    s.total++;
    if (pass) s.passed++;
    else s.failed++;

    if (e.startedAt) {
      var dayKey = isoDay(e.startedAt);
      var d = days[dayKey] || (days[dayKey] = { day: dayKey, total: 0, passed: 0, failed: 0 });
      d.total++;
      if (pass) d.passed++;
      else d.failed++;
    }

    var t =
      tests[e.testCaseName] ||
      (tests[e.testCaseName] = {
        testCaseName: e.testCaseName,
        testSuite: e.testSuite,
        failures: 0,
        runs: 0,
        passes: 0,
        transitions: 0,
        lastPassed: null,
      });
    t.runs++;
    if (t.lastPassed !== null && t.lastPassed !== pass) t.transitions++;
    t.lastPassed = pass;
    if (pass) {
      t.passes++;
    } else {
      t.failures++;
      t.lastFailedExecutionId = e.id;
      t.lastFailedAt = e.startedAt;
      t.lastErrorSignature = e.errorSignature;
      if (e.errorSignature) {
        var c = clusters[e.errorSignature] || (clusters[e.errorSignature] = { errorSignature: e.errorSignature, failures: 0, tests: {} });
        c.failures++;
        c.tests[e.testCaseName] = true;
      }
    }
  });

  var suiteStats = Object.keys(suites)
    .map(function (k) {
      var s = suites[k];
      s.passRate = s.total ? s.passed / s.total : 0;
      return s;
    })
    .sort(function (a, b) {
      return a.passRate - b.passRate;
    });

  var testList = Object.keys(tests).map(function (k) {
    return tests[k];
  });
  var currentlyFailing = testList.filter(function (t) {
    return !t.lastPassed;
  }).length;
  var failing = testList
    .filter(function (t) {
      return t.failures > 0;
    })
    .sort(function (a, b) {
      return b.failures - a.failures || b.failures / b.runs - a.failures / a.runs;
    })
    .slice(0, 10)
    .map(function (t) {
      return {
        testCaseName: t.testCaseName,
        testSuite: t.testSuite,
        failures: t.failures,
        runs: t.runs,
        flaky: t.transitions >= 2,
        lastFailedExecutionId: t.lastFailedExecutionId,
        lastFailedAt: t.lastFailedAt,
        lastErrorSignature: t.lastErrorSignature,
      };
    });

  var clusterList = Object.keys(clusters)
    .map(function (k) {
      var c = clusters[k];
      return { errorSignature: c.errorSignature, failures: c.failures, testCaseNames: Object.keys(c.tests).sort() };
    })
    .sort(function (a, b) {
      return b.failures - a.failures;
    })
    .slice(0, 8);

  return TestEngineExecution.DashboardSummary.make({
    totalRuns: totals.runs,
    passedRuns: totals.passed,
    failedRuns: totals.runs - totals.passed,
    passRate: totals.runs ? totals.passed / totals.runs : 0,
    testCaseCount: testList.length,
    currentlyFailingCount: currentlyFailing,
    avgDurationSeconds: totals.durN ? totals.durSum / totals.durN : 0,
    byVerdict: Object.keys(verdicts)
      .sort()
      .map(function (v) {
        return { verdict: v, runCount: verdicts[v] };
      }),
    bySuite: suiteStats,
    trend: Object.keys(days)
      .sort()
      .map(function (k) {
        return days[k];
      }),
    topFailingTests: failing,
    errorClusters: clusterList,
  });
}

function filterOptions() {
  var envs = {};
  var suites = {};
  var counts = { total: 0, api: 0 };
  TestEngineExecution.fetchObjStream({ include: 'id, testEnvironment, testSuite, origin' }).each(function (e) {
    envs[e.testEnvironment] = true;
    suites[e.testSuite] = true;
    counts.total++;
    if (e.origin === TestEngineExecution.Origin.API) counts.api++;
  });
  return TestEngineExecution.FilterOptions.make({
    environments: Object.keys(envs).sort(),
    testSuites: Object.keys(suites).sort(),
    totalExecutions: counts.total,
    apiExecutions: counts.api,
  });
}

/*
 * First meaningful error line of a failure, with volatile parts (GUIDs, numbers, quoted values) masked so that
 * the same failure in different runs groups together.
 */
function errorSignatureOf(text) {
  if (!text) return null;
  var lines = String(text)
    .split(/\r?\n/)
    .map(function (l) {
      return l.trim();
    })
    .filter(function (l) {
      return l.length > 0 && !/^at\s/.test(l);
    });
  if (!lines.length) return null;
  var line =
    lines.filter(function (l) {
      return STRONG_ERROR_HINT.test(l);
    })[0] ||
    lines.filter(function (l) {
      return WEAK_ERROR_HINT.test(l);
    })[0] ||
    lines[0];
  return line
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/'[^']*'|"[^"]*"/g, "'<v>'")
    .replace(/\d+(\.\d+)?/g, '<n>')
    .substring(0, 200);
}

function toDateTime(value) {
  return value ? DateTime.fromString(String(value)) : null;
}

function toApiDate(dateTime) {
  return dateTime ? isoDay(dateTime) : null;
}

function syncFromApi(testEnvironment, dateFrom, dateTo, testSuite) {
  if (!TestEngineApi.isUrlConfigured()) {
    throw new Error('The TestEngine API is not configured. Set its URL and token on the Settings page first.');
  }
  var result = { executions: 0, steps: 0, pages: 0, total: 0, truncated: false };
  var page = 1;
  var totalPages = 1;

  do {
    var raw = TestEngineApi.searchTestResults(
      testEnvironment,
      page,
      API_PAGE_SIZE,
      toApiDate(dateFrom),
      toApiDate(dateTo),
      testSuite || null,
      null
    );
    // The REST engine returns a platform JSON object; round-trip it into plain JS objects and arrays.
    var res = raw == null ? null : JSON.parse(JSON.stringify(raw));
    var items = (res && res.items) || [];
    totalPages = (res && res.totalPages) || 1;
    result.total = (res && res.totalCount) || result.total;
    result.pages++;

    var execs = TestEngineExecution.arrayBuilder();
    var steps = TestEngineExecution.Step.arrayBuilder();
    items.forEach(function (item) {
      var stepItems = (item.testStepResults || []).slice().sort(function (a, b) {
        return a.testStepId - b.testStepId;
      });
      var failedStep = stepItems.filter(function (s) {
        return !isPass(s.verdict);
      })[0];
      execs.add(
        TestEngineExecution.make({
          id: item.executionId,
          testEnvironment: item.testEnvironment || testEnvironment,
          testSuite: item.testSuite || '(none)',
          testCaseName: item.testCaseName || '(unnamed)',
          jiraTestCaseId: item.jiraTestCaseId,
          dataReferenceId: item.dataReferenceId,
          teamId: item.teamId,
          testCaseXmlId: item.testCaseXmlId,
          startedAt: toDateTime(item.startedAt),
          completedAt: toDateTime(item.completedAt),
          executionState: item.executionState,
          executedBy: item.executedBy,
          verdict: item.executionVerdict || 'Unknown',
          extraLogs: item.extraLogs,
          failedStepName: failedStep ? failedStep.testStepName : null,
          errorSignature: isPass(item.executionVerdict)
            ? null
            : errorSignatureOf((failedStep && failedStep.details) || item.extraLogs),
          origin: TestEngineExecution.Origin.API,
        })
      );
      stepItems.forEach(function (s) {
        steps.add(
          TestEngineExecution.Step.make({
            id: s.stepExecutionId || item.executionId + '_' + s.testStepId,
            execution: { id: item.executionId },
            testStepId: s.testStepId,
            testStepName: s.testStepName,
            verdict: s.verdict || 'Unknown',
            details: s.details,
            executedAt: toDateTime(s.executedAt),
          })
        );
      });
    });

    var execArr = execs.build();
    var stepArr = steps.build();
    if (execArr.length) TestEngineExecution.upsertBatch(execArr);
    if (stepArr.length) TestEngineExecution.Step.upsertBatch(stepArr);
    result.executions += execArr.length;
    result.steps += stepArr.length;
    page++;
  } while (page <= totalPages && page <= TestEngineExecution.MAX_SYNC_PAGES);

  result.truncated = page <= totalPages;
  log.info('Synced {} executions and {} steps from {} page(s)', result.executions, result.steps, result.pages);
  return TestEngineExecution.SyncResult.make({
    executionCount: result.executions,
    stepCount: result.steps,
    pageCount: result.pages,
    apiTotalCount: result.total,
    truncated: result.truncated,
  });
}
