import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { countExecutions, fetchExecutions, filterLiteral } from '@/api/testEngine';
import { TestExecution } from '@/Interfaces';
import { specToFilter, useFilters } from '@/contexts/FiltersContext';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataGrid, DataGridBody, DataGridCell, DataGridHead, DataGridHeader, DataGridRow } from '@/components/ui/data-grid';
import { Pagination } from '@/components/ui/pagination';
import { Spinner } from '@/components/ui/spinner';
import FilterBar from '@/components/common/FilterBar';
import VerdictBadge from '@/components/common/VerdictBadge';
import { durationBetween, formatDateTime, formatDuration } from '@/lib/format';

const PAGE_SIZE = 25;
type Status = 'all' | 'failed' | 'passed';

export default function ResultsPage() {
  const navigate = useNavigate();
  const { reportError } = useErrorBoundary();
  const { spec } = useFilters();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as Status) || 'all';
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TestExecution[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const filter = useMemo(() => {
    const parts = specToFilter(spec, filterLiteral);
    if (status === 'failed') parts.push("verdict != 'Passed'");
    if (status === 'passed') parts.push("verdict == 'Passed'");
    if (debounced) parts.push(`contains(lowerCase(testCaseName), ${filterLiteral(debounced.toLowerCase())})`);
    return parts.length ? parts.join(' && ') : undefined;
  }, [spec, status, debounced]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // fetch() reports only the page size as count, so the total comes from fetchCount
    Promise.all([fetchExecutions({ filter, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), countExecutions(filter)])
      .then(([res, n]) => {
        if (cancelled) return;
        setRows(res.objs ?? []);
        setTotal(n);
        setError(null);
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
  }, [filter, page, reportError]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col">
      <PageHeader title="Test results" description="Every execution, newest first. Click a row to see steps, logs and an AI diagnosis." />
      <div className="flex flex-col gap-4 p-6">
        <FilterBar />
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            variant="boxed"
            value={status}
            onValueChange={(v) => {
              const next = new URLSearchParams(params);
              if (v === 'all') next.delete('status');
              else next.set('status', v);
              setParams(next, { replace: true });
            }}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="failed">Not passed</TabsTrigger>
              <TabsTrigger value="passed">Passed</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="w-72">
            <Input
              aria-label="Search test case"
              placeholder="Search test case name"
              leftIcon={<Search />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {loading ? <Spinner size="sm" label="Loading" /> : null}
        </div>

        {error ? <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">Could not load results: {error}</p> : null}

        <DataGrid className="w-full">
          <DataGridHeader>
            <DataGridRow>
              <DataGridHead>Verdict</DataGridHead>
              <DataGridHead>Test case</DataGridHead>
              <DataGridHead>Suite</DataGridHead>
              <DataGridHead>Env</DataGridHead>
              <DataGridHead>Started</DataGridHead>
              <DataGridHead>Duration</DataGridHead>
              <DataGridHead>Failed step / error</DataGridHead>
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody>
            {rows.map((r) => (
              <DataGridRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/results/${r.id}`)}>
                <DataGridCell>
                  <VerdictBadge verdict={r.verdict} />
                </DataGridCell>
                <DataGridCell>
                  <button
                    type="button"
                    className="text-left text-c3-bold-body-p3 text-[var(--c3-style-basic-fg-accent)] hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/results/${r.id}`);
                    }}
                  >
                    {r.testCaseName}
                  </button>
                </DataGridCell>
                <DataGridCell>{r.testSuite}</DataGridCell>
                <DataGridCell>{r.testEnvironment}</DataGridCell>
                <DataGridCell>{formatDateTime(r.startedAt)}</DataGridCell>
                <DataGridCell>{formatDuration(durationBetween(r.startedAt, r.completedAt))}</DataGridCell>
                <DataGridCell className="max-w-md">
                  {r.failedStepName || r.errorSignature ? (
                    <div className="flex flex-col">
                      {r.failedStepName ? <span className="text-c3-bold-body-p3">{r.failedStepName}</span> : null}
                      {r.errorSignature ? (
                        <span className="truncate text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]" title={r.errorSignature}>
                          {r.errorSignature}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-[var(--c3-style-basic-fg-secondary)]">-</span>
                  )}
                </DataGridCell>
              </DataGridRow>
            ))}
            {!loading && rows.length === 0 ? (
              <DataGridRow>
                <DataGridCell colSpan={7} className="text-center text-[var(--c3-style-basic-fg-secondary)]">
                  No executions match these filters.
                </DataGridCell>
              </DataGridRow>
            ) : null}
          </DataGridBody>
        </DataGrid>
        <Pagination type="full" page={page} pageCount={pageCount} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>
    </div>
  );
}
