# Workspace Summary

> Work-to-date map of this workspace. Keep it concise; update after meaningful changes.
> (Summaries live in `src/` in this workspace, not `resource/`.)

## Current state

**Test Results Insights** app: dashboard of TestEngineFramework (external .NET API, swagger v2.4.9 in
`.attachments/.../swagger__1_.json`) test executions + an AI troubleshooting agent.

## Backend types (`src/`)

- `TestEngineApi` (mixes REST) — outbound client. Abstract GETs: `searchTestResults` (/TestResult, snake_case query
  params on purpose), `testResult`, `statistics`, `testSuites`, `executionEnvironment`. JS helpers
  `configureConnection(baseUrl, token)` (stores url + `Bearer` secret via `setApiUrlAndAuth`, APP override) and
  `connectionStatus()`. User configured `https://localhost:5002/`; a live read-only connection check confirmed
  loopback targeting and connection refusal. This is the C3 server's loopback, not the user's computer.
  No connection setting or credential was changed during diagnosis; the corrective code edit was interrupted.
- `TestEngineExecution` (entity, id = API executionId) + `TestEngineExecution.Step` (entity, `execution` FK; parent
  inverse `steps`). Derived at load: `failedStepName`, `errorSignature` (normalized first error line; JS
  `errorSignatureOf`). `origin` enum `TestEngineExecution.Origin` (API/DEMO).
  Methods (JS): `dashboardSummary(spec)` → `DashboardSummary` (+ inner VerdictCount/SuiteStat/DayStat/FailingTest/
  ErrorCluster; flaky = ≥2 pass/fail flips), `filterOptions()`, `syncFromApi(env, dateFrom, dateTo, suite)` (pages
  of 100, `MAX_SYNC_PAGES` 50, upsertBatch).
- `TestEngineAgent` (Python): `analyzeExecution(id)` → `Analysis`, `ask(question, history, spec)` → `Reply`. Uses
  `GenaiCore.Llm.Completion.Client.forName(TestEngineAgent.Config.llmClientName)` (default `gpt_4o`); on failure
  returns rule-based markdown + `llmNotice`. On the user's request to switch to a working LLM, rechecked all seven
  currently listed clients with a minimal completion: `gpt_4o`, `gemini_2.5_pro`, `gemini_2.0_flash`, `mew3`,
  `langchain_agent`, `rubric_metric`, `deepeval_metric`. All failed with missing authentication configuration;
  no `default` client exists. No working replacement was found, so the selection remains `gpt_4o`.
  An administrator must configure provider authentication via C3 Settings/Console before switching/testing again.
  No credentials were read, displayed, or changed during these checks.

## Data

- Demo data (dev/test overlay only): `test/data/TestEngineExecution/` (385 runs, 24 tests, 6 suites, SYS+ACC, 14 days
  ending 2026-11-27) and `test/data/TestEngineExecution.Step/` (1620). Generated deterministically by a throwaway
  script (scenarios: payments 503 outage 4 days ago, expired token 9 days ago, InvoiceTotals regression since 5 days,
  flaky KYC upload timeouts, chromedriver setup error). Upserted via `C3.pkg().upsertAllSeed()`.

## UI (`ui/react/src/`)

- Routes (App.tsx, wrapped in `FiltersProvider`): `/` Dashboard, `/results`, `/results/:id`, `/assistant`, `/settings`.
  Nav items in `config/navigation.ts`. TopNav title "Test Results Insights".
- `api/testEngine.ts` — all typed `c3Call` wrappers. `Interfaces.tsx` — matching TS interfaces.
- `contexts/FiltersContext.tsx` — shared env/suite/date-range filters → `DashboardSpec`; `specToFilter` for fetch.
- `components/charts/C3Chart.tsx` — React 18 eCharts wrapper with the C3 theme (`lib/echarts*.ts`, `lib/css-var.ts`
  vendored from the skill helpers). The skill's `ui/chart.tsx` needs React 19 (`useEffectEvent`) — don't vendor it.
- `components/common/` — `VerdictBadge`, `Markdown` (react-markdown + gfm), `FilterBar` (Combobox + boxed Tabs),
  `DemoDataBanner`.
- `lib/format.ts` — percent/duration/date helpers.
- Status colors in charts via `readColor('--c3-style-basic-fg-success|danger|warning')`.

## Notes / conventions learned

- `npm run build` needs `VITE_C3_PKG=pkg3cffe00b` in the shell (lint + tsc run without it).
- `c3Action.ts` replaced with the skill's canonical `c3Call` version.
- C3 `DateTime` in JS: `.millis` is a property; REST `json` results are TurboJSObject → `JSON.parse(JSON.stringify())`.
- Playwright browser is not authenticated (API calls 401) → UI data verification is backend-replay only.
- Preview URL: `http://localhost:9000/gscaf4d229/liveapp/uiservice/#/`.
- Local frontend configuration (`ui/react/vite.config.mts`): needs `VITE_C3_PKG`, `VITE_C3_BASE_URL` (C3 server,
  not TestEngine), `VITE_C3_ENV`, `VITE_C3_APP`; default port 9000 and URL `/<env>/<app>/uiservice/`.
  `/api` is proxied to C3; optional local-development authentication uses a server-side proxy fallback.
  Running the UI on the user's computer does not relocate `TestEngineExecution.syncFromApi` or make the
  user's loopback reachable from C3. Local instructions await the user's OS; no local server was started here.
