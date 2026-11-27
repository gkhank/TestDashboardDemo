/*
 * Types for the TestEngine dashboard. Field names mirror the C3 types in `src/` of the package.
 */

/** C3 `TestEngineExecution` — one execution of a test case. */
export interface TestExecution {
  id: string;
  testEnvironment: string;
  testSuite: string;
  testCaseName: string;
  jiraTestCaseId?: string;
  dataReferenceId?: string;
  teamId?: number;
  testCaseXmlId?: number;
  startedAt?: string;
  completedAt?: string;
  executionState?: string;
  executedBy?: string;
  verdict: string;
  extraLogs?: string;
  failedStepName?: string;
  errorSignature?: string;
  origin?: 'API' | 'DEMO';
}

/** C3 `TestEngineExecution.Step` — one step result of an execution. */
export interface TestStepResult {
  id: string;
  testStepId: number;
  testStepName?: string;
  verdict: string;
  details?: string;
  executedAt?: string;
}

/** C3 `TestEngineExecution.DashboardSpec` — filters sent to the backend. */
export interface DashboardSpec {
  testEnvironment?: string;
  testSuite?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface VerdictCount {
  verdict: string;
  runCount: number;
}

export interface SuiteStat {
  testSuite: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

export interface DayStat {
  day: string;
  total: number;
  passed: number;
  failed: number;
}

export interface FailingTest {
  testCaseName: string;
  testSuite: string;
  failures: number;
  runs: number;
  flaky?: boolean;
  lastFailedExecutionId?: string;
  lastFailedAt?: string;
  lastErrorSignature?: string;
}

export interface ErrorCluster {
  errorSignature: string;
  failures: number;
  testCaseNames?: string[];
}

/** C3 `TestEngineExecution.DashboardSummary`. */
export interface DashboardSummary {
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number;
  testCaseCount: number;
  currentlyFailingCount: number;
  avgDurationSeconds: number;
  byVerdict?: VerdictCount[];
  bySuite?: SuiteStat[];
  trend?: DayStat[];
  topFailingTests?: FailingTest[];
  errorClusters?: ErrorCluster[];
}

/** C3 `TestEngineExecution.FilterOptions`. */
export interface FilterOptions {
  environments?: string[];
  testSuites?: string[];
  totalExecutions: number;
  apiExecutions: number;
}

/** C3 `TestEngineExecution.SyncResult`. */
export interface SyncResult {
  executionCount: number;
  stepCount: number;
  pageCount: number;
  apiTotalCount?: number;
  truncated?: boolean;
}

/** C3 `TestEngineApi.ConnectionStatus`. */
export interface ConnectionStatus {
  configured?: boolean;
  baseUrl?: string;
  reachable?: boolean;
  serverEnvironment?: string;
  message?: string;
}

/** C3 `TestEngineAgent.Message`. */
export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** C3 `TestEngineAgent.Reply`. */
export interface AgentReply {
  answer: string;
  usedLlm?: boolean;
  llmNotice?: string;
}

/** C3 `TestEngineAgent.Analysis`. */
export interface ExecutionAnalysis {
  executionId: string;
  category?: string;
  failedStepName?: string;
  keyErrorLines?: string[];
  recentRuns?: number;
  recentPasses?: number;
  flaky?: boolean;
  similarFailureCount?: number;
  similarTestCases?: string[];
  markdown: string;
  usedLlm?: boolean;
  llmNotice?: string;
}

/** C3 `fetch` result. */
export interface FetchResult<T> {
  objs?: T[];
  count?: number;
  hasMore?: boolean;
}
