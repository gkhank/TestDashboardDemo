import { useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFilters } from '@/contexts/FiltersContext';

/** Tells the user when only demo executions are loaded and links to the API connection settings. */
export default function DemoDataBanner() {
  const navigate = useNavigate();
  const { options, optionsError } = useFilters();

  if (optionsError) {
    return (
      <div className="rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-danger)] bg-[var(--c3-style-basic-bg-danger)] p-3 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">
        Could not load filter options: {optionsError}
      </div>
    );
  }
  if (!options || options.apiExecutions > 0 || options.totalExecutions === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-info)] bg-[var(--c3-style-basic-bg-info)] p-3">
      <div className="flex items-center gap-2 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-info)]">
        <Info className="size-4" aria-hidden />
        You are looking at demo data. Connect your TestEngineFramework API to load your real results.
      </div>
      <Button size="sm" variant="outline" appearance="accent" onClick={() => navigate('/settings')}>
        Connect API
      </Button>
    </div>
  );
}
