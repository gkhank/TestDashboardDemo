import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, ListChecks, Repeat, Settings } from 'lucide-react';
import { fetchDashboardSummary } from '@/api/testEngine';
import { DashboardSummary } from '@/Interfaces';
import { useFilters } from '@/contexts/FiltersContext';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard, MetricCardCaption, MetricCardHeader, MetricCardLabel, MetricCardValue } from '@/components/ui/metric-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import FilterBar from '@/components/common/FilterBar';
import DemoDataBanner from '@/components/common/DemoDataBanner';
import C3Chart from '@/components/charts/C3Chart';
import { readColor } from '@/lib/echarts-theme';
import { formatDateTime, formatDuration, formatPercent } from '@/lib/format';

function statusColors() {
  return {
    pass: readColor('--c3-style-basic-fg-success'),
    fail: readColor('--c3-style-basic-fg-danger'),
    warn: readColor('--c3-style-basic-fg-warning'),
    neutral: readColor('--c3-style-basic-fg-neutral'),
  };
}

function verdictColor(verdict: string, c: ReturnType<typeof statusColors>): string {
  const v = verdict.toLowerCase();
  if (v === 'passed' || v === 'pass') return c.pass;
  if (v === 'failed' || v === 'fail') return c.fail;
  if (v === 'error') return c.warn;
  return c.neutral;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { reportError } = useErrorBoundary();
  const { spec, filters, setFilters } = useFilters();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDashboardSummary(spec)
      .then((s) => {
        if (!cancelled) {
          setSummary(s);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          reportError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [spec, reportError]);

  const colors = useMemo(statusColors, []);

  const donutOption = useMemo(() => {
    const data = (summary?.byVerdict ?? []).map((v) => ({
      name: v.verdict,
      value: v.runCount,
      itemStyle: { color: verdictColor(v.verdict, colors) },
    }));
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} runs ({d}%)' },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['55%', '78%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          label: {
            show: true,
            position: 'center',
            formatter: () => (summary ? formatPercent(summary.passRate) + '\npassed' : ''),
            fontSize: 20,
            fontWeight: 600,
            lineHeight: 26,
          },
          labelLine: { show: false },
          data,
        },
      ],
    };
  }, [summary, colors]);

  const trendOption = useMemo(() => {
    const trend = summary?.trend ?? [];
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { left: 40, right: 48, top: 16, bottom: 48 },
      xAxis: { type: 'category', data: trend.map((d) => d.day.substring(5)) },
      yAxis: [
        { type: 'value', name: 'Runs', minInterval: 1 },
        { type: 'value', name: 'Pass %', min: 0, max: 100, axisLabel: { formatter: '{value}%' } },
      ],
      series: [
        { name: 'Passed', type: 'bar', stack: 'runs', data: trend.map((d) => d.passed), itemStyle: { color: colors.pass } },
        { name: 'Failed', type: 'bar', stack: 'runs', data: trend.map((d) => d.failed), itemStyle: { color: colors.fail } },
        {
          name: 'Pass rate',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: trend.map((d) => (d.total ? Math.round((d.passed / d.total) * 1000) / 10 : null)),
        },
      ],
    };
  }, [summary, colors]);

  const suiteOption = useMemo(() => {
    const suites = [...(summary?.bySuite ?? [])].reverse();
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0 },
      grid: { left: 150, right: 24, top: 8, bottom: 40 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: suites.map((s) => s.testSuite), axisLabel: { width: 140, overflow: 'truncate' } },
      series: [
        { name: 'Passed', type: 'bar', stack: 's', data: suites.map((s) => s.passed), itemStyle: { color: colors.pass } },
        { name: 'Failed', type: 'bar', stack: 's', data: suites.map((s) => s.failed), itemStyle: { color: colors.fail } },
      ],
    };
  }, [summary, colors]);

  const askAbout = (question: string) => navigate('/assistant', { state: { question } });

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Test Results Dashboard"
        description="Overall success and failure of your TestEngineFramework executions."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" appearance="secondary" leadingIcon={<ListChecks />} onClick={() => navigate('/results')}>
              All results
            </Button>
            <Button variant="solid" appearance="accent" leadingIcon={<Bot />} onClick={() => navigate('/assistant')}>
              Ask the assistant
            </Button>
          </div>
        }
      />
      <div className="flex flex-col gap-4 p-6">
        <DemoDataBanner />
        <FilterBar />

        {error && !loading ? (
          <Card>
            <CardContent className="text-[var(--c3-style-basic-fg-danger)]">Could not load the dashboard: {error}</CardContent>
          </Card>
        ) : null}

        {loading && !summary ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner label="Loading test results" />
          </div>
        ) : null}

        {summary && summary.totalRuns === 0 && !loading ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3">
              <p className="text-c3-regular-body-p2">No test executions match the current filters.</p>
              <Button variant="outline" appearance="secondary" leadingIcon={<Settings />} onClick={() => navigate('/settings')}>
                Connect / sync the TestEngine API
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {summary && summary.totalRuns > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <MetricCard>
                <MetricCardHeader>
                  <MetricCardLabel>Pass rate</MetricCardLabel>
                </MetricCardHeader>
                <MetricCardValue
                  className={
                    summary.passRate >= 0.95
                      ? 'text-[var(--c3-style-basic-fg-success)]'
                      : summary.passRate >= 0.8
                        ? 'text-[var(--c3-style-basic-fg-warning)]'
                        : 'text-[var(--c3-style-basic-fg-danger)]'
                  }
                >
                  {formatPercent(summary.passRate)}
                </MetricCardValue>
                <MetricCardCaption>
                  {summary.passedRuns} of {summary.totalRuns} runs passed
                </MetricCardCaption>
              </MetricCard>
              <MetricCard>
                <MetricCardHeader>
                  <MetricCardLabel>Total runs</MetricCardLabel>
                </MetricCardHeader>
                <MetricCardValue>{summary.totalRuns.toLocaleString()}</MetricCardValue>
                <MetricCardCaption>{summary.testCaseCount} distinct test cases</MetricCardCaption>
              </MetricCard>
              <MetricCard interactive onClick={() => navigate('/results?status=failed')}>
                <MetricCardHeader>
                  <MetricCardLabel>Failed runs</MetricCardLabel>
                </MetricCardHeader>
                <MetricCardValue className="text-[var(--c3-style-basic-fg-danger)]">{summary.failedRuns}</MetricCardValue>
                <MetricCardCaption>Failed, error or other non-pass verdicts</MetricCardCaption>
              </MetricCard>
              <MetricCard>
                <MetricCardHeader>
                  <MetricCardLabel>Currently failing</MetricCardLabel>
                </MetricCardHeader>
                <MetricCardValue>{summary.currentlyFailingCount}</MetricCardValue>
                <MetricCardCaption>Test cases whose latest run did not pass</MetricCardCaption>
              </MetricCard>
              <MetricCard>
                <MetricCardHeader>
                  <MetricCardLabel>Avg duration</MetricCardLabel>
                </MetricCardHeader>
                <MetricCardValue>{formatDuration(summary.avgDurationSeconds)}</MetricCardValue>
                <MetricCardCaption>Per execution</MetricCardCaption>
              </MetricCard>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Overall success / fail</CardTitle>
                  <CardDescription>Runs by verdict</CardDescription>
                </CardHeader>
                <CardContent>
                  <C3Chart option={donutOption} ariaLabel="Runs by verdict" heightClass="h-72" />
                </CardContent>
              </Card>
              <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle>Daily trend</CardTitle>
                  <CardDescription>Passed and failed runs per day with pass rate</CardDescription>
                </CardHeader>
                <CardContent>
                  <C3Chart option={trendOption} ariaLabel="Daily pass and fail trend" heightClass="h-72" />
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Suites</CardTitle>
                  <CardDescription>Worst pass rate at the top - click a suite to filter</CardDescription>
                </CardHeader>
                <CardContent>
                  <C3Chart
                    option={suiteOption}
                    ariaLabel="Pass and fail per test suite"
                    heightClass="h-72"
                    onClick={(p) => p.name && setFilters({ ...filters, testSuite: p.name })}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Most failing test cases</CardTitle>
                  <CardDescription>Open the latest failure to troubleshoot it with the agent</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Test case</TableHead>
                        <TableHead>Failed</TableHead>
                        <TableHead>Last failure</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(summary.topFailingTests ?? []).slice(0, 8).map((t) => (
                        <TableRow key={t.testCaseName}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                className="text-left text-c3-bold-body-p3 text-[var(--c3-style-basic-fg-accent)] hover:underline"
                                onClick={() => t.lastFailedExecutionId && navigate(`/results/${t.lastFailedExecutionId}`)}
                              >
                                {t.testCaseName}
                              </button>
                              <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">{t.testSuite}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="tabular-nums">
                                {t.failures}/{t.runs}
                              </span>
                              {t.flaky ? (
                                <Badge variant="outline" appearance="warning" size="sm" leadingIcon={<Repeat />}>
                                  Flaky
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-c3-regular-body-p3">{formatDateTime(t.lastFailedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Common errors</CardTitle>
                <CardDescription>Failures grouped by normalized error message - shared causes affect several tests</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Error signature</TableHead>
                      <TableHead>Failures</TableHead>
                      <TableHead>Affected test cases</TableHead>
                      <TableHead> </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(summary.errorClusters ?? []).map((c) => (
                      <TableRow key={c.errorSignature}>
                        <TableCell className="max-w-xl">
                          <code className="text-c3-regular-code-code break-words">{c.errorSignature}</code>
                        </TableCell>
                        <TableCell className="tabular-nums">{c.failures}</TableCell>
                        <TableCell className="text-c3-regular-body-p3">
                          {(c.testCaseNames ?? []).slice(0, 3).join(', ')}
                          {(c.testCaseNames ?? []).length > 3 ? ` +${(c.testCaseNames ?? []).length - 3} more` : ''}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            appearance="accent"
                            leadingIcon={<Bot />}
                            onClick={() =>
                              askAbout(
                                `What is the likely root cause of this error and how do I fix it? "${c.errorSignature}" (affects ${(c.testCaseNames ?? []).join(', ')})`
                              )
                            }
                          >
                            Troubleshoot
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
