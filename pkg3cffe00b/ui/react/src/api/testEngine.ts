/*
 * Typed wrappers around the C3 backend calls used by the TestEngine dashboard.
 */
import { c3Call } from '@/c3Action';
import {
  AgentMessage,
  AgentReply,
  ConnectionStatus,
  DashboardSpec,
  DashboardSummary,
  ExecutionAnalysis,
  FetchResult,
  FilterOptions,
  SyncResult,
  TestExecution,
  TestStepResult,
} from '@/Interfaces';

const EXEC = 'TestEngineExecution';

export const EXECUTION_LIST_INCLUDE =
  'id, testEnvironment, testSuite, testCaseName, verdict, startedAt, completedAt, failedStepName, errorSignature, executedBy, origin';

export function fetchDashboardSummary(spec: DashboardSpec): Promise<DashboardSummary> {
  return c3Call(EXEC, 'dashboardSummary', null, [spec]);
}

export function fetchFilterOptions(): Promise<FilterOptions> {
  return c3Call(EXEC, 'filterOptions', null, []);
}

export interface ExecutionQuery {
  filter?: string;
  limit: number;
  offset: number;
}

export function fetchExecutions(q: ExecutionQuery): Promise<FetchResult<TestExecution>> {
  return c3Call(EXEC, 'fetch', null, [
    {
      include: EXECUTION_LIST_INCLUDE,
      filter: q.filter,
      order: 'descending(startedAt)',
      limit: q.limit,
      offset: q.offset,
    },
  ]);
}

export async function countExecutions(filter?: string): Promise<number> {
  return c3Call(EXEC, 'fetchCount', null, [{ filter }]);
}

export async function getExecution(id: string): Promise<TestExecution | null> {
  return c3Call(EXEC, 'get', { id }, ['this']);
}

export async function fetchSteps(executionId: string): Promise<TestStepResult[]> {
  const res: FetchResult<TestStepResult> = await c3Call('TestEngineExecution.Step', 'fetch', null, [
    {
      filter: `execution.id == ${filterLiteral(executionId)}`,
      include: 'id, testStepId, testStepName, verdict, details, executedAt',
      order: 'ascending(testStepId)',
      limit: 200,
      offset: 0,
    },
  ]);
  return res.objs ?? [];
}

export function analyzeExecution(executionId: string): Promise<ExecutionAnalysis> {
  return c3Call('TestEngineAgent', 'analyzeExecution', null, [executionId]);
}

export function askAgent(question: string, history: AgentMessage[], spec: DashboardSpec): Promise<AgentReply> {
  return c3Call('TestEngineAgent', 'ask', null, [question, history, spec]);
}

export function syncFromApi(
  testEnvironment: string,
  dateFrom?: string,
  dateTo?: string,
  testSuite?: string
): Promise<SyncResult> {
  return c3Call(EXEC, 'syncFromApi', null, [testEnvironment, dateFrom ?? null, dateTo ?? null, testSuite ?? null]);
}

export function connectionStatus(): Promise<ConnectionStatus> {
  return c3Call('TestEngineApi', 'connectionStatus', null, []);
}

export function configureConnection(baseUrl: string, token: string | null): Promise<ConnectionStatus> {
  return c3Call('TestEngineApi', 'configureConnection', null, [baseUrl, token]);
}

/** Escapes a value for a C3 filter string literal. */
export function filterLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function isPassed(verdict?: string): boolean {
  return verdict === 'Passed' || verdict === 'Pass';
}
