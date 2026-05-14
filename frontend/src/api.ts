import type {
  AuditEvent,
  CreateAuditEventPayload,
  CreateEvaluationAdjudicationPayload,
  CreateEvaluationMatrixPayload,
  CreateEvaluationReviewAssignmentPayload,
  CreateEvaluationReviewPayload,
  CreateEvaluationRunPayload,
  CreateEvaluationSuitePayload,
  CreateExternalUsagePayload,
  ExternalUsageImportResult,
  ImportExternalUsagePayload,
  CreateIntegrationSourcePayload,
  CreateTracePayload,
  DemoScenario,
  DemoSeedResult,
  EvaluationExperimentSummary,
  EvaluationResultAdjudication,
  EvaluationReviewQueue,
  EvaluationReviewAssignment,
  EvaluationMatrixRunResult,
  EvaluationRunComparison,
  EvaluationResultReview,
  EvaluationRun,
  EvaluationRunDetail,
  EvaluationSuiteDetail,
  EvaluationSuiteListItem,
  ExternalConnectorSyncJob,
  ExternalConnectorSyncResult,
  ExternalConnectorTemplate,
  ExternalUsageRecord,
  ExternalUsageStats,
  ExternalUsageValidation,
  IntegrationSource,
  PromptVersionOption,
  SyncExternalConnectorPayload,
  TraceDetail,
  TraceListItem,
  TraceScorePayload,
  TraceStats,
} from './types'

// 先尝试显式环境变量，其次匹配当前后端默认端口 8000，最后才回退旧的 8010，避免本地残留进程持续制造 CORS 噪音。
const API_BASE_URLS = [
  import.meta.env.VITE_API_BASE_URL,
  'http://127.0.0.1:8000',
  'http://127.0.0.1:8010',
].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)

async function fetchFromApi(path: string, init?: RequestInit): Promise<Response> {
  let lastError: Error | null = null

  for (const baseUrl of API_BASE_URLS) {
    try {
      return await fetch(`${baseUrl}${path}`, init)
    } catch (caughtError) {
      lastError = caughtError as Error
    }
  }

  throw lastError ?? new Error('All API endpoints are unavailable')
}

export async function listTraces(): Promise<TraceListItem[]> {
  const response = await fetchFromApi('/api/traces')
  if (!response.ok) {
    throw new Error('Failed to fetch trace list')
  }
  return response.json()
}

export async function createTrace(payload: CreateTracePayload): Promise<TraceDetail> {
  const response = await fetchFromApi('/api/traces', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('Failed to create trace')
  }
  return response.json()
}

export async function getTrace(traceId: string): Promise<TraceDetail> {
  const response = await fetchFromApi(`/api/traces/${traceId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch trace detail')
  }
  return response.json()
}

export async function replayTrace(traceId: string): Promise<TraceDetail> {
  const response = await fetchFromApi(`/api/traces/${traceId}/replay`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error('Failed to replay trace')
  }
  return response.json()
}

export async function scoreTrace(traceId: string, payload: TraceScorePayload): Promise<TraceDetail> {
  const response = await fetchFromApi(`/api/traces/${traceId}/score`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('Failed to score trace')
  }
  return response.json()
}

export async function listPromptVersions(): Promise<PromptVersionOption[]> {
  const response = await fetchFromApi('/api/prompt-versions')
  if (!response.ok) {
    throw new Error('Failed to fetch prompt versions')
  }
  return response.json()
}

export async function getTraceStats(params: {
  timeRangeDays: number
  provider?: string
  status?: string
  taskType?: string
}): Promise<TraceStats> {
  const searchParams = new URLSearchParams({
    time_range_days: String(params.timeRangeDays),
  })
  if (params.provider && params.provider !== 'all') {
    searchParams.set('provider', params.provider)
  }
  if (params.status && params.status !== 'all') {
    searchParams.set('status', params.status)
  }
  if (params.taskType && params.taskType !== 'all') {
    searchParams.set('task_type', params.taskType)
  }

  const response = await fetchFromApi(`/api/traces/stats?${searchParams.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to fetch trace stats')
  }
  return response.json()
}

export async function listIntegrationSources(): Promise<IntegrationSource[]> {
  const response = await fetchFromApi('/api/integrations')
  if (!response.ok) {
    throw new Error('Failed to fetch integration sources')
  }
  return response.json()
}

export async function listExternalConnectors(): Promise<ExternalConnectorTemplate[]> {
  const response = await fetchFromApi('/api/integrations/connectors')
  if (!response.ok) {
    throw new Error('Failed to fetch external connectors')
  }
  return response.json()
}

export async function listExternalConnectorSyncJobs(): Promise<ExternalConnectorSyncJob[]> {
  const response = await fetchFromApi('/api/integrations/connectors/history')
  if (!response.ok) {
    throw new Error('Failed to fetch connector sync history')
  }
  return response.json()
}

export async function createIntegrationSource(payload: CreateIntegrationSourcePayload): Promise<IntegrationSource> {
  const response = await fetchFromApi('/api/integrations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('Failed to create integration source')
  }
  return response.json()
}

export async function listExternalUsageRecords(): Promise<ExternalUsageRecord[]> {
  const response = await fetchFromApi('/api/integrations/usage')
  if (!response.ok) {
    throw new Error('Failed to fetch external usage records')
  }
  return response.json()
}

export async function createExternalUsageRecord(payload: CreateExternalUsagePayload): Promise<ExternalUsageRecord> {
  const response = await fetchFromApi('/api/integrations/usage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('Failed to create external usage record')
  }
  return response.json()
}

export async function importExternalUsageRecords(payload: ImportExternalUsagePayload): Promise<ExternalUsageImportResult> {
  const response = await fetchFromApi('/api/integrations/usage/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('Failed to import external usage records')
  }
  return response.json()
}

export async function getExternalUsageStats(timeRangeDays: number): Promise<ExternalUsageStats> {
  const searchParams = new URLSearchParams({
    time_range_days: String(timeRangeDays),
  })
  const response = await fetchFromApi(`/api/integrations/stats?${searchParams.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to fetch external usage stats')
  }
  return response.json()
}

export async function getExternalUsageValidation(params: { timeRangeDays: number, sourceId?: number | null }): Promise<ExternalUsageValidation> {
  const searchParams = new URLSearchParams({
    time_range_days: String(params.timeRangeDays),
  })
  if (params.sourceId !== undefined && params.sourceId !== null) {
    searchParams.set('source_id', String(params.sourceId))
  }

  const response = await fetchFromApi(`/api/integrations/usage/validation?${searchParams.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to fetch external usage validation')
  }
  return response.json()
}

export async function syncExternalConnector(payload: SyncExternalConnectorPayload): Promise<ExternalConnectorSyncResult> {
  const response = await fetchFromApi('/api/integrations/connectors/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('Failed to sync external connector')
  }
  return response.json()
}

export async function retryExternalConnectorSyncJob(jobId: number): Promise<ExternalConnectorSyncResult> {
  const response = await fetchFromApi(`/api/integrations/connectors/jobs/${jobId}/retry`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error('Failed to retry connector sync job')
  }
  return response.json()
}

export async function listEvaluationSuites(): Promise<EvaluationSuiteListItem[]> {
  const response = await fetchFromApi('/api/evaluations/suites')
  if (!response.ok) {
    throw new Error('Failed to fetch evaluation suites')
  }
  return response.json()
}

export async function createEvaluationSuite(payload: CreateEvaluationSuitePayload): Promise<EvaluationSuiteDetail> {
  const response = await fetchFromApi('/api/evaluations/suites', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('Failed to create evaluation suite')
  }
  return response.json()
}

export async function getEvaluationSuite(suiteId: number): Promise<EvaluationSuiteDetail> {
  const response = await fetchFromApi(`/api/evaluations/suites/${suiteId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch evaluation suite detail')
  }
  return response.json()
}

export async function listEvaluationRuns(): Promise<EvaluationRun[]> {
  const response = await fetchFromApi('/api/evaluations/runs')
  if (!response.ok) {
    throw new Error('Failed to fetch evaluation runs')
  }
  return response.json()
}

export async function getEvaluationRun(runId: number): Promise<EvaluationRunDetail> {
  const response = await fetchFromApi(`/api/evaluations/runs/${runId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch evaluation run detail')
  }
  return response.json()
}

export async function getEvaluationExperimentSummary(experimentLabel: string): Promise<EvaluationExperimentSummary> {
  const response = await fetchFromApi(`/api/evaluations/experiments/${encodeURIComponent(experimentLabel)}/summary`)
  if (!response.ok) {
    throw new Error('Failed to fetch evaluation experiment summary')
  }
  return response.json()
}

export async function compareEvaluationRuns(baseRunId: number, compareRunId: number): Promise<EvaluationRunComparison> {
  const searchParams = new URLSearchParams({
    base_run_id: String(baseRunId),
    compare_run_id: String(compareRunId),
  })
  const response = await fetchFromApi(`/api/evaluations/compare-runs?${searchParams.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to compare evaluation runs')
  }
  return response.json()
}

export async function getEvaluationReviewQueue(onlyPending = true): Promise<EvaluationReviewQueue> {
  const searchParams = new URLSearchParams({
    only_pending: String(onlyPending),
  })
  const response = await fetchFromApi(`/api/evaluations/review-queue?${searchParams.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to fetch evaluation review queue')
  }
  return response.json()
}

export async function createEvaluationReviewAssignment(resultId: number, payload: CreateEvaluationReviewAssignmentPayload): Promise<EvaluationReviewAssignment> {
  const response = await fetchFromApi(`/api/evaluations/results/${resultId}/assignments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('Failed to create evaluation review assignment')
  }
  return response.json()
}

export async function adjudicateEvaluationResult(resultId: number, payload: CreateEvaluationAdjudicationPayload): Promise<EvaluationResultAdjudication> {
  const response = await fetchFromApi(`/api/evaluations/results/${resultId}/adjudications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('Failed to adjudicate evaluation result')
  }
  return response.json()
}

export async function createEvaluationRun(payload: CreateEvaluationRunPayload): Promise<EvaluationRunDetail> {
  const response = await fetchFromApi('/api/evaluations/runs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('Failed to create evaluation run')
  }
  return response.json()
}

export async function createEvaluationMatrixRun(payload: CreateEvaluationMatrixPayload): Promise<EvaluationMatrixRunResult> {
  const response = await fetchFromApi('/api/evaluations/matrix-runs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('Failed to create evaluation matrix run')
  }
  return response.json()
}

export async function createEvaluationResultReview(resultId: number, payload: CreateEvaluationReviewPayload): Promise<EvaluationResultReview> {
  const response = await fetchFromApi(`/api/evaluations/results/${resultId}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('Failed to create evaluation result review')
  }
  return response.json()
}

export async function listAuditEvents(): Promise<AuditEvent[]> {
  const response = await fetchFromApi('/api/audit-events')
  if (!response.ok) {
    throw new Error('Failed to fetch audit events')
  }
  return response.json()
}

export async function createAuditEvent(payload: CreateAuditEventPayload): Promise<AuditEvent> {
  const response = await fetchFromApi('/api/audit-events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('Failed to create audit event')
  }
  return response.json()
}

export async function listDemoScenarios(): Promise<DemoScenario[]> {
  const response = await fetchFromApi('/api/demo/scenarios')
  if (!response.ok) {
    throw new Error('Failed to fetch demo scenarios')
  }
  return response.json()
}

export async function seedDemoScenarios(scenarioId: DemoSeedResult['scenario_id'] = 'code_debug'): Promise<DemoSeedResult> {
  const response = await fetchFromApi('/api/demo/seed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scenario_id: scenarioId }),
  })
  if (!response.ok) {
    throw new Error('Failed to seed demo scenarios')
  }
  return response.json()
}