import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plug, RefreshCw, XCircle } from 'lucide-react';
import { configureConnection, connectionStatus, syncFromApi } from '@/api/testEngine';
import { ConnectionStatus, SyncResult } from '@/Interfaces';
import { useFilters } from '@/contexts/FiltersContext';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';

type SyncWindow = '7' | '30' | '90' | 'all';

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export default function SettingsPage() {
  const { reportError } = useErrorBoundary();
  const { reloadOptions } = useFilters();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [env, setEnv] = useState('SYS');
  const [syncWindow, setSyncWindow] = useState<SyncWindow>('30');
  const [suite, setSuite] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const check = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      setChecking(true);
      try {
        const s = await connectionStatus();
        if (isCancelled()) return;
        setStatus(s);
        if (s.baseUrl) setBaseUrl((cur) => cur || s.baseUrl || '');
        if (s.serverEnvironment) setEnv(s.serverEnvironment);
      } catch (err) {
        if (!isCancelled()) reportError(err);
      } finally {
        if (!isCancelled()) setChecking(false);
      }
    },
    [reportError]
  );

  useEffect(() => {
    let cancelled = false;
    check(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [check]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const s = await configureConnection(baseUrl.trim(), token.trim() || null);
      setStatus(s);
      setToken('');
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const res = await syncFromApi(env, syncWindow === 'all' ? undefined : daysAgoIso(parseInt(syncWindow, 10)), undefined, suite.trim() || undefined);
      setSyncResult(res);
      reloadOptions();
    } catch (err) {
      setSyncError((err as Error).message);
      reportError(err);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-col">
      <PageHeader title="Settings" description="Connect the TestEngineFramework API and load its execution results." />
      <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>TestEngine API connection</CardTitle>
            <CardDescription>
              Base URL of your TestEngineFramework API (v2.4.9) and a JWT bearer token. The token is stored as an encrypted secret and
              never shown again.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-c3-regular-body-p2">
              {checking ? (
                <Spinner size="sm" label="Checking" />
              ) : status?.reachable ? (
                <CheckCircle2 className="size-4 text-[var(--c3-style-basic-fg-success)]" aria-hidden />
              ) : (
                <XCircle className="size-4 text-[var(--c3-style-basic-fg-danger)]" aria-hidden />
              )}
              <span>
                {status?.reachable
                  ? `Connected to ${status.baseUrl}${status.serverEnvironment ? ` (server environment ${status.serverEnvironment})` : ''}`
                  : status?.message ?? 'Checking connection...'}
              </span>
            </div>
            <form className="flex flex-col gap-3" onSubmit={save}>
              <div className="flex flex-col gap-1">
                <label htmlFor="api-url" className="text-c3-bold-label-l3">
                  API base URL
                </label>
                <Input
                  id="api-url"
                  placeholder="https://testengine.example.com/"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="api-token" className="text-c3-bold-label-l3">
                  Bearer token (JWT)
                </label>
                <Input
                  id="api-token"
                  type="password"
                  autoComplete="off"
                  placeholder={status?.configured ? 'Leave empty to keep the stored token' : 'Paste the JWT here'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="solid" appearance="accent" leadingIcon={<Plug />} loading={saving} disabled={!baseUrl.trim()}>
                  Save and test
                </Button>
                <Button type="button" variant="outline" appearance="secondary" onClick={() => check()} disabled={checking}>
                  Test connection
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Load results from the API</CardTitle>
            <CardDescription>
              Pulls executions with their step results from GET /TestResult (paged) into the app. Re-running is safe: existing executions are
              updated, not duplicated.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-c3-bold-label-l3">Test environment</span>
              <Tabs variant="boxed" value={env} onValueChange={setEnv}>
                <TabsList>
                  <TabsTrigger value="SYS">SYS</TabsTrigger>
                  <TabsTrigger value="ACC">ACC</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-c3-bold-label-l3">Executions since</span>
              <Tabs variant="boxed" value={syncWindow} onValueChange={(v) => setSyncWindow(v as SyncWindow)}>
                <TabsList>
                  <TabsTrigger value="7">7 days</TabsTrigger>
                  <TabsTrigger value="30">30 days</TabsTrigger>
                  <TabsTrigger value="90">90 days</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="sync-suite" className="text-c3-bold-label-l3">
                Test suite (optional)
              </label>
              <Input id="sync-suite" placeholder="All suites" value={suite} onChange={(e) => setSuite(e.target.value)} />
            </div>
            <div>
              <Button
                variant="solid"
                appearance="accent"
                leadingIcon={<RefreshCw />}
                loading={syncing}
                disabled={!status?.configured || syncing}
                onClick={sync}
              >
                Sync now
              </Button>
            </div>
            {!status?.configured ? (
              <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">Configure the API connection first.</p>
            ) : null}
            {syncResult ? (
              <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-success)]">
                Loaded {syncResult.executionCount} executions and {syncResult.stepCount} steps from {syncResult.pageCount} page(s)
                {syncResult.truncated ? ` - stopped at the page limit; ${syncResult.apiTotalCount} results exist, narrow the window and sync again` : ''}.
              </p>
            ) : null}
            {syncError ? <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">Sync failed: {syncError}</p> : null}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Troubleshooting agent</CardTitle>
            <CardDescription>
              The agent uses the GenAI completion client named in TestEngineAgent.Config (default gpt_4o). Until that client has model
              credentials, it answers with rule-based analysis (failure categorization, flakiness and similar-failure detection).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
