import { Combobox } from '@/components/ui/combobox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DATE_RANGE_LABELS, DateRange, useFilters } from '@/contexts/FiltersContext';

const RANGES: DateRange[] = ['7d', '14d', '30d', 'all'];
const ALL = '__all__';

/** Environment / suite / date-range filters bound to the shared {@link useFilters} state. */
export default function FilterBar() {
  const { filters, setFilters, options } = useFilters();

  const envOptions = [
    { value: ALL, label: 'All environments' },
    ...(options?.environments ?? []).map((e) => ({ value: e, label: e })),
  ];
  const suiteOptions = [
    { value: ALL, label: 'All suites' },
    ...(options?.testSuites ?? []).map((s) => ({ value: s, label: s })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-48">
        <Combobox
          id="filter-environment"
          size="md"
          options={envOptions}
          value={filters.testEnvironment ?? ALL}
          onValueChange={(v) => setFilters({ ...filters, testEnvironment: !v || v === ALL ? null : v })}
          placeholder="Environment"
        />
      </div>
      <div className="w-64">
        <Combobox
          id="filter-suite"
          size="md"
          options={suiteOptions}
          value={filters.testSuite ?? ALL}
          onValueChange={(v) => setFilters({ ...filters, testSuite: !v || v === ALL ? null : v })}
          placeholder="Test suite"
        />
      </div>
      <Tabs
        variant="boxed"
        size="md"
        value={filters.range}
        onValueChange={(v) => setFilters({ ...filters, range: v as DateRange })}
      >
        <TabsList>
          {RANGES.map((r) => (
            <TabsTrigger key={r} value={r}>
              {DATE_RANGE_LABELS[r]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
