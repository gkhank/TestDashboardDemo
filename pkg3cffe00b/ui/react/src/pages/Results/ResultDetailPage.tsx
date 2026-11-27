import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bot, ChevronDown, ChevronRight, MessageSquare, Repeat, Sparkles } from 'lucide-react';
import { analyzeExecution, fetchExecutions, fetchSteps, filterLiteral, getExecution, isPassed } from '@/api/testEngine';
import { ExecutionAnalysis, TestExecution, TestStepResult } from '@/Interfaces';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import VerdictBadge from '@/components/common/VerdictBadge';
import Markdown from '@/components/common/Markdown';
import { durationBetween, formatDateTime, formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">{label}</span>
      <span className="text-c3-regular-body-p2 break-words">{value ?? '-'}</span>
    </div>
  );
}

function StepRow({ step }: { step: TestStepResult }) {
  const passed = isPassed(step.verdict);
  const [open, setOpen] = useState(!passed && step.verdict !== 'Skipped');
  return (
    <li className="flex flex-col gap-2 border-b border-[var(--c3-style-basic-border-border)] py-3 last:border-b-0">
      <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />}
        <span className="w-8 shrink-0 tabular-nums text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">#{step.testStepId}</span>
        <span className="flex-1 text-c3-bold-body-p2">{step.testStepName ?? 'Step'}</span>
        <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">{formatDateTime(step.executedAt)}</span>
        <VerdictBadge verdict={step.verdict} />
      </button>
      {open && step.details ? (
        <pre
          className={cn(
            'ml-7 overflow-x-auto whitespace-pre-wrap break-words rounded-[var(--c3-style-border-radius-4)] p-3 text-c3-regular-code-code',
            passed ? 'bg-[var(--c3-style-basic-bg-secondary)]' : 'bg-[var(--c3-style-basic-bg-danger)] text-[var(--c3-style-basic-fg-primary)]'
          )}
        >
          {step.details}
        </pre>
      ) : null}
    </li>
  );
}

export default function ResultDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { reportError } = useErrorBoundary();
  const [execution, setExecution] = useState<TestExecution | null>(null);
  const [steps, setSteps] = useState<TestStepResult[]>([]);
  const [history, setHistory] = useState<TestExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ExecutionAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const runAnalysis = useCallback(
    async (executionId: string, isCancelled: () => boolean = () => false) => {
      setAnalyzing(true);
      setAnalysisError(null);
      try {
        const a = await analyzeExecution(executionId);
        if (!isCancelled()) setAnalysis(a);
      } catch (err) {
        if (!isCancelled()) {
          setAnalysisError((err as Error).message);
          reportError(err);
        }
      } finally {
        if (!isCancelled()) setAnalyzing(false);
      }
    },
    [reportError]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAnalysis(null);
    (async () => {
      try {
        const [ex, st] = await Promise.all([getExecution(id), fetchSteps(id)]);
        if (cancelled) return;
        if (!ex) {
          setError('Execution not found.');
          return;
        }
        setExecution(ex);
        setSteps(st);
        setError(null);
        const hist = await fetchExecutions({
          filter: `testCaseName == ${filterLiteral(ex.testCaseName)}`,
          limit: 20,
          offset: 0,
        });
        if (!cancelled) setHistory([...(hist.objs ?? [])].reverse());
        if (!isPassed(ex.verdict) && !cancelled) {
          runAnalysis(ex.id, () => cancelled);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          reportError(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, reportError, runAnalysis]);

  if (loading && !execution) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label="Loading execution" />
      </div>
    );
  }

  if (error || !execution) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">{error ?? 'Execution not found.'}</p>
        <Button variant="outline" appearance="secondary" onClick={() => navigate('/results')}>
          Back to results
        </Button>
      </div>
    );
  }

  const followUp = `Help me troubleshoot test case ${execution.testCaseName} (suite ${execution.testSuite}). Its run at ${formatDateTime(
    execution.startedAt
  )} ended with ${execution.verdict}${execution.failedStepName ? ` at step "${execution.failedStepName}"` : ''}${
    execution.errorSignature ? ` with error: ${execution.errorSignature}` : ''
  }. Is this flaky or a real regression, and what should I check first?`;

  return (
    <div className="flex flex-col">
      <PageHeader
        breadcrumbs={[{ label: 'Results', href: '#/results' }, { label: execution.testCaseName }]}
        title={execution.testCaseName}
        description={`${execution.testSuite} · ${execution.testEnvironment} · ${formatDateTime(execution.startedAt)}`}
        badges={<VerdictBadge verdict={execution.verdict} size="md" />}
        actions={
          <Button variant="outline" appearance="secondary" leadingIcon={<MessageSquare />} onClick={() => navigate('/assistant', { state: { question: followUp } })}>
            Ask the assistant
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-5">
        <div className="flex flex-col gap-4 xl:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Execution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Field label="Verdict" value={execution.verdict} />
                <Field label="State" value={execution.executionState} />
                <Field label="Duration" value={formatDuration(durationBetween(execution.startedAt, execution.completedAt))} />
                <Field label="Executed by" value={execution.executedBy} />
                <Field label="Data reference" value={execution.dataReferenceId} />
                <Field label="Jira test case" value={execution.jiraTestCaseId} />
                <Field label="Execution id" value={execution.id} />
                <Field label="Source" value={execution.origin === 'DEMO' ? 'Demo data' : 'TestEngine API'} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent runs of this test case</CardTitle>
              <CardDescription>Oldest to newest - click a run to open it</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {history.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    title={`${h.verdict} · ${h.testEnvironment} · ${formatDateTime(h.startedAt)}`}
                    aria-label={`${h.verdict} run on ${formatDateTime(h.startedAt)}`}
                    onClick={() => navigate(`/results/${h.id}`)}
                    className={cn(
                      'h-7 w-4 rounded-[var(--c3-style-border-radius-4)]',
                      isPassed(h.verdict) ? 'bg-[var(--c3-style-basic-fg-success)]' : 'bg-[var(--c3-style-basic-fg-danger)]',
                      h.id === execution.id && 'ring-2 ring-offset-2 ring-[var(--c3-style-basic-border-accent)]'
                    )}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Steps ({steps.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {steps.length === 0 ? (
                <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">No step results were recorded for this execution.</p>
              ) : (
                <ul className="flex flex-col">
                  {steps.map((s) => (
                    <StepRow key={s.id} step={s} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {execution.extraLogs ? (
            <Card>
              <CardHeader>
                <CardTitle>Extra logs</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-[var(--c3-style-border-radius-4)] bg-[var(--c3-style-basic-bg-secondary)] p-3 text-c3-regular-code-code">
                  {execution.extraLogs}
                </pre>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Sparkles className="size-4 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
                  AI troubleshooting
                </span>
              </CardTitle>
              <CardDescription>Diagnosis from the step logs, run history and similar failures</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {analyzing ? (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" label="Analyzing" />
                  <span className="text-c3-regular-body-p2">Analyzing the failure...</span>
                </div>
              ) : null}
              {analysisError ? (
                <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">Analysis failed: {analysisError}</p>
              ) : null}
              {!analysis && !analyzing ? (
                <Button variant="solid" appearance="accent" leadingIcon={<Bot />} onClick={() => runAnalysis(execution.id)}>
                  Analyze this execution
                </Button>
              ) : null}
              {analysis && !analyzing ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {analysis.category ? (
                      <Badge variant="soft" appearance="accent" size="sm">
                        {analysis.category}
                      </Badge>
                    ) : null}
                    {analysis.flaky ? (
                      <Badge variant="outline" appearance="warning" size="sm" leadingIcon={<Repeat />}>
                        Flaky
                      </Badge>
                    ) : null}
                    {analysis.recentRuns ? (
                      <Badge variant="soft" appearance="secondary" size="sm">
                        {analysis.recentPasses}/{analysis.recentRuns} recent runs passed
                      </Badge>
                    ) : null}
                    {analysis.similarFailureCount ? (
                      <Badge variant="soft" appearance="danger" size="sm">
                        {analysis.similarFailureCount} similar failures
                      </Badge>
                    ) : null}
                  </div>
                  {!analysis.usedLlm && analysis.llmNotice ? (
                    <p className="rounded-[var(--c3-style-border-radius-4)] bg-[var(--c3-style-basic-bg-warning)] p-2 text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-warning)]">
                      {analysis.llmNotice}
                    </p>
                  ) : null}
                  <Markdown text={analysis.markdown} />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" appearance="secondary" onClick={() => runAnalysis(execution.id)}>
                      Re-analyze
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      appearance="accent"
                      leadingIcon={<MessageSquare />}
                      onClick={() => navigate('/assistant', { state: { question: followUp } })}
                    >
                      Continue in chat
                    </Button>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
