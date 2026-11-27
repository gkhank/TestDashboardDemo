/*
 * Dashboard filters shared by the Dashboard, Results and Assistant pages, so the agent analyzes what the user sees.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchFilterOptions } from '@/api/testEngine';
import { DashboardSpec, FilterOptions } from '@/Interfaces';

export type DateRange = '7d' | '14d' | '30d' | 'all';

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  '7d': 'Last 7 days',
  '14d': 'Last 14 days',
  '30d': 'Last 30 days',
  all: 'All time',
};

export interface Filters {
  testEnvironment: string | null;
  testSuite: string | null;
  range: DateRange;
}

interface FiltersContextValue {
  filters: Filters;
  setFilters: (f: Filters) => void;
  spec: DashboardSpec;
  options: FilterOptions | null;
  optionsError: string | null;
  reloadOptions: () => void;
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

function rangeStart(range: DateRange): string | undefined {
  if (range === 'all') return undefined;
  const days = parseInt(range, 10);
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>({ testEnvironment: null, testSuite: null, range: '14d' });
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchFilterOptions()
      .then((o) => {
        if (!cancelled) {
          setOptions(o);
          setOptionsError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setOptionsError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reloadOptions = useCallback(() => setReloadKey((k) => k + 1), []);

  const spec = useMemo<DashboardSpec>(() => {
    const s: DashboardSpec = {};
    if (filters.testEnvironment) s.testEnvironment = filters.testEnvironment;
    if (filters.testSuite) s.testSuite = filters.testSuite;
    const from = rangeStart(filters.range);
    if (from) s.dateFrom = from;
    return s;
  }, [filters]);

  const value = useMemo(
    () => ({ filters, setFilters, spec, options, optionsError, reloadOptions }),
    [filters, spec, options, optionsError, reloadOptions]
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters(): FiltersContextValue {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters must be used inside <FiltersProvider>');
  return ctx;
}

/** Builds a C3 filter string equivalent to the spec (for `fetch` calls). */
export function specToFilter(spec: DashboardSpec, literal: (v: string) => string): string[] {
  const parts: string[] = [];
  if (spec.testEnvironment) parts.push(`testEnvironment == ${literal(spec.testEnvironment)}`);
  if (spec.testSuite) parts.push(`testSuite == ${literal(spec.testSuite)}`);
  if (spec.dateFrom) parts.push(`startedAt >= dateTime(${literal(spec.dateFrom)})`);
  return parts;
}
