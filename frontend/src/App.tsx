import { FormEvent, useEffect, useState } from 'react'

import {
  adjudicateEvaluationResult,
  compareEvaluationRuns,
  createEvaluationReviewAssignment,
  createAuditEvent,
  createEvaluationMatrixRun,
  createEvaluationResultReview,
  createEvaluationRun,
  createEvaluationSuite,
  createExternalUsageRecord,
  createIntegrationSource,
  createTrace,
  getEvaluationExperimentSummary,
  getEvaluationReviewQueue,
  getEvaluationRun,
  getEvaluationSuite,
  getExternalUsageStats,
  getExternalUsageValidation,
  importExternalUsageRecords,
  getTrace,
  getTraceStats,
  listAuditEvents,
  listDemoScenarios,
  listExternalConnectors,
  listExternalConnectorSyncJobs,
  listEvaluationRuns,
  listEvaluationSuites,
  listExternalUsageRecords,
  listIntegrationSources,
  listPromptVersions,
  listTraces,
  replayTrace,
  retryExternalConnectorSyncJob,
  savePromptVersion,
  seedDemoScenarios,
  scoreTrace,
  syncExternalConnector,
} from './api'
import { TraceTimeline } from './components/TraceTimeline'
import { exportExperimentSummaryAsJson, exportExperimentSummaryAsMarkdown, exportTraceAsJson, exportTraceAsMarkdown } from './exporters'
import type {
  AuditEvent,
  CreateAuditEventPayload,
  CreateEvaluationAdjudicationPayload,
  CreateEvaluationReviewAssignmentPayload,
  CreateEvaluationReviewPayload,
  DemoScenario,
  CreateEvaluationRunPayload,
  CreateExternalUsagePayload,
  CreateTracePayload,
  ExecutionMode,
  EvaluationExperimentSummary,
  EvaluationMatrixRunResult,
  EvaluationReviewAssignment,
  EvaluationReviewQueue,
  EvaluationReviewQueueItem,
  EvaluationResultAdjudication,
  EvaluationResultReview,
  EvaluationRun,
  EvaluationRunComparison,
  EvaluationRunDetail,
  EvaluationSuiteDetail,
  EvaluationSuiteListItem,
  ExternalConnectorSyncJob,
  ExternalConnectorTemplate,
  ExternalUsageImportItem,
  ExternalUsageImportResult,
  ExternalUsageStatsPoint,
  ExternalUsageRecord,
  ExternalUsageStats,
  ExternalUsageValidation,
  IntegrationAccessMode,
  IntegrationSource,
  PromptVersionOption,
  QualityLabel,
  TraceDetail,
  TraceListItem,
  TraceStats,
  TraceStatsPoint,
  UpdatePromptVersionPayload,
} from './types'

const SAMPLE_PROMPT = ''
const PAGE_SIZE_OPTIONS = [4, 8, 12]
const KNOWN_TASK_TYPES = ['code_debug', 'calculation', 'search', 'llm_framework']

type TraceStatusFilter = 'all' | 'completed' | 'failed'
type TraceTaskTypeFilter = 'all' | 'code_debug' | 'calculation' | 'search' | 'llm_framework'
type AppView = 'overview' | 'traces' | 'integrations' | 'evaluations' | 'labs'
type TraceChartMetric = 'runs' | 'tokens' | 'latency'
type IntegrationChartMetric = 'runs' | 'tokens' | 'cost'
type OverviewCategory = 'scenarios' | 'traces' | 'external'
type IntegrationEntryMode = 'manual' | 'import'
type Locale = 'en' | 'zh'
type ErrorCategoryKey = 'missing_config' | 'auth_failed' | 'quota_limited' | 'network_issue' | 'tool_execution' | 'uncategorized'
type DerivedExternalUsageStatsPoint = ExternalUsageStatsPoint & {
  input_token_usage: number
  output_token_usage: number
  cached_token_usage: number
}

type DerivedExternalUsageStats = ExternalUsageStats & {
  timeline: DerivedExternalUsageStatsPoint[]
}

interface CustomerPlaybook {
  id: string
  title: string
  description: string
  userInput: string
  executionMode: ExecutionMode
  provider: string
  modelName: string
  promptVersion: string
}

const DEFAULT_LOCALE: Locale = 'en'
const LOCALE_STORAGE_KEY = 'agent-trace-viewer.locale'

const SAMPLE_EXTERNAL_IMPORT = ''

function pickLocaleText(locale: Locale, english: string, chinese: string): string {
  return locale === 'en' ? english : chinese
}

function parseLocale(value: string | null | undefined): Locale | null {
  if (value === 'en' || value === 'zh') {
    return value
  }
  return null
}

function resolveInitialLocale(): Locale {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE
  }

  const queryLocale = parseLocale(new URLSearchParams(window.location.search).get('lang'))
  if (queryLocale) {
    return queryLocale
  }

  const storedLocale = parseLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY))
  return storedLocale ?? DEFAULT_LOCALE
}

function classifyErrorCategory(message: string): ErrorCategoryKey {
  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes('api_key') || normalizedMessage.includes('api key') || normalizedMessage.includes('openai_api_key') || normalizedMessage.includes('deepseek_api_key')) {
    return 'missing_config'
  }
  if (normalizedMessage.includes('401') || normalizedMessage.includes('unauthorized') || normalizedMessage.includes('invalid api key')) {
    return 'auth_failed'
  }
  if (normalizedMessage.includes('429') || normalizedMessage.includes('quota') || normalizedMessage.includes('rate limit')) {
    return 'quota_limited'
  }
  if (normalizedMessage.includes('timeout') || normalizedMessage.includes('timed out') || normalizedMessage.includes('connection') || normalizedMessage.includes('network')) {
    return 'network_issue'
  }
  if (normalizedMessage.includes('tool')) {
    return 'tool_execution'
  }
  return 'uncategorized'
}

function localizeErrorCategory(category: ErrorCategoryKey, locale: Locale): string {
  switch (category) {
    case 'missing_config':
      return pickLocaleText(locale, 'Missing Config', '配置缺失')
    case 'auth_failed':
      return pickLocaleText(locale, 'Auth Failed', '认证失败')
    case 'quota_limited':
      return pickLocaleText(locale, 'Quota Limited', '配额限制')
    case 'network_issue':
      return pickLocaleText(locale, 'Network Issue', '网络问题')
    case 'tool_execution':
      return pickLocaleText(locale, 'Tool Execution', '工具执行')
    default:
      return pickLocaleText(locale, 'Uncategorized', '未分类')
  }
}

function formatDelta(currentValue: number, compareValue: number, unit = '', digits = 0): string {
  const delta = currentValue - compareValue
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(digits)}${unit}`
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, maxLength).trim()}...`
}

function pickPromptOption(options: PromptVersionOption[], version: string): PromptVersionOption | null {
  return options.find((item) => item.version === version) ?? null
}

function getLocalizedPromptCopy(option: PromptVersionOption, locale: Locale): {
  label: string
  description: string
  systemPrompt: string
  focus: string
} {
  if (locale === 'zh') {
    return {
      label: option.label_zh,
      description: option.description_zh,
      systemPrompt: option.system_prompt_zh,
      focus: option.focus_zh,
    }
  }

  return {
    label: option.label,
    description: option.description,
    systemPrompt: option.system_prompt,
    focus: option.focus,
  }
}

function buildLinePoints(values: number[], width: number, height: number): string {
  if (!values.length) {
    return ''
  }

  const maxValue = Math.max(...values, 1)
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
      const y = height - (value / maxValue) * height
      return `${x},${y}`
    })
    .join(' ')
}

function buildChartCoordinates(values: number[], width: number, height: number, paddingX = 20, paddingBottom = 10): Array<{ x: number, y: number }> {
  if (!values.length) {
    return []
  }

  const maxValue = Math.max(...values, 1)
  const usableWidth = width - paddingX * 2
  const usableHeight = height - paddingBottom

  return values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : paddingX + (index / Math.max(values.length - 1, 1)) * usableWidth,
    y: usableHeight - (value / maxValue) * Math.max(usableHeight - 14, 1),
  }))
}

function toUtcDayKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10)
}

function buildUtcDaySequence(timeRangeDays: number): string[] {
  const endDate = new Date()
  const endUtc = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()))
  return Array.from({ length: timeRangeDays }, (_, index) => {
    const current = new Date(endUtc)
    current.setUTCDate(current.getUTCDate() - (timeRangeDays - index - 1))
    return current.toISOString().slice(0, 10)
  })
}

function getStatusTone(status: string): string {
  if (status === 'completed') {
    return 'success'
  }
  if (status === 'failed') {
    return 'danger'
  }
  return 'neutral'
}

function toDatetimeLocalValue(date: Date): string {
  const offset = date.getTimezoneOffset()
  const normalized = new Date(date.getTime() - offset * 60_000)
  return normalized.toISOString().slice(0, 16)
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function isDefaultLocalizedCopy(value: string | null | undefined, english: string, chinese: string): boolean {
  return value === english || value === chinese
}

function getIntegrationSourceDefaultNotes(locale: Locale): string {
  return pickLocaleText(locale, 'Used to record token, cost, and run data from external platforms or custom APIs.', '用于记录外部平台或自有 API 的 token、成本与运行数据。')
}

function getExternalUsageDefaultNotes(locale: Locale): string {
  return pickLocaleText(locale, 'Can be entered manually now and reused later for JSON or API imports. Total tokens default to input + output, while cached tokens stay separate.', '现在可以先手动录入，后续再复用到 JSON 或 API 导入。Total tokens 默认取 input + output，cached tokens 单独观察。')
}

function getEvaluationRunDefaultNotes(locale: Locale): string {
  return pickLocaleText(locale, 'Start with a draft evaluation run first, then connect batch execution and aggregate scoring.', '第一版先只创建评测运行骨架，后面再接整批执行与聚合评分。')
}

function getMatrixDefaultNotes(locale: Locale): string {
  return pickLocaleText(locale, 'First make the multi-version comparison entry usable, then add finer filters, aggregation, and matrix analysis.', '先把多版本对照入口跑通，后面再补更细的筛选、聚合和版本矩阵。')
}

function getReviewDefaultNotes(locale: Locale): string {
  return pickLocaleText(locale, 'Add one manual review record first, then expand to queue-based and multi-reviewer collaboration.', '先补一条人工复核记录，后面再扩展成标注队列和多人协作。')
}

function getAssignmentDefaultNotes(locale: Locale): string {
  return pickLocaleText(locale, 'Assign the result to an owner first, then add notifications, due dates, and multi-reviewer coordination.', '先指派给负责人复核，后面再补通知、截止时间和多人协作。')
}

function getAdjudicationDefaultNotes(locale: Locale): string {
  return pickLocaleText(locale, 'Store the final adjudication here so conflicts and owner conclusions are fixed in one place.', '这里保存最终裁决，目的是把冲突结果和负责人的结论固定下来。')
}

function getTraceScoreDefaultNotes(locale: Locale): string {
  return pickLocaleText(locale, 'Use a manual score as a placeholder first, then connect judge scoring and ground truth later.', '先做人工评分占位，后面再接 judge score 和 ground truth。')
}

function getAuditReasonDefault(locale: Locale): string {
  return pickLocaleText(locale, 'Record the risk point and decision result first, then connect a real approval flow.', '第一版先记录风险点和决策结果，后面再接审批流。')
}
const KNOWN_LOCALIZED_COPY: Array<{ english: string, chinese: string }> = [
  {
    english: 'Used to demo log analysis, navigation anomaly diagnosis, and manual review labeling quickly.',
    chinese: '用于快速演示日志分析、导航异常定位和人工复核标注链路。',
  },
  {
    english: 'Used to demo reference-answer judging, retrieval-miss review, and citation-coverage evaluation quickly.',
    chinese: '用于快速演示 reference answer judge、检索失败复盘和引用覆盖评测。',
  },
  {
    english: 'Used to demo batch evaluation, judge scaffolding, and trace scoring results quickly.',
    chinese: '用于快速演示批量评测、judge 骨架和 trace 评分结果。',
  },
  {
    english: 'Show the first end-to-end loop for error analysis, tool-failure explanation, batch evaluation, and audit events.',
    chinese: '展示报错分析、工具失败解释、批量评测和审计事件的第一版闭环。',
  },
  {
    english: 'Show the first framework for retrieval summaries, citation hits, and reference-answer judging.',
    chinese: '展示检索摘要、引用命中和 reference answer judge 的第一版框架。',
  },
  {
    english: 'Show the first scenario for device-log analysis, navigation anomaly diagnosis, and manual review labeling.',
    chinese: '展示设备日志分析、导航异常定位和人工复核标注的第一版场景。',
  },
  {
    english: 'Code debugging / tool-failure review / audit events',
    chinese: '代码调试 / 工具失败复盘 / 审计事件',
  },
  {
    english: 'Paper Q&A / citation coverage / reference answer judge',
    chinese: '检索问答 / 引用覆盖 / reference answer judge',
  },
  {
    english: 'Log analysis / navigation anomaly diagnosis / manual review',
    chinese: '日志分析 / 导航异常定位 / 人工复核',
  },
  {
    english: 'Used to demo syncing workspace usage from Claude Code or similar tools into one cost panel.',
    chinese: '用于演示从 Claude Code 或相似工作台拉 usage 汇总，再落到统一成本面板。',
  },
  {
    english: 'Used to demo routing your own API gateway, proxy layer, or platform logs into one unified usage hub.',
    chinese: '用于演示把自有 API 网关、代理层或平台聚合日志接入到统一 usage 中心。',
  },
  {
    english: 'Pull workspace usage every 6 hours',
    chinese: '每 6 小时拉一次 workspace usage',
  },
  {
    english: 'Poll gateway metrics every hour',
    chinese: '每 1 小时轮询一次网关统计',
  },
  {
    english: 'Receive Task Input',
    chinese: '接收任务输入',
  },
  {
    english: 'Received user request with execution_mode=mock, provider=deepseek, model_name=deepseek-chat, prompt_version=v1.',
    chinese: '收到用户请求，execution_mode=mock，provider=deepseek，model_name=deepseek-chat，prompt_version=v1。',
  },
  {
    english: 'Call Local Search Tool',
    chinese: '调用本地搜索工具',
  },
  {
    english: 'Use an offline mock search tool so the MVP runs locally on Windows with stable results.',
    chinese: '使用离线 mock 搜索工具，保证 MVP 在 Windows 本地可运行且结果稳定。',
  },
  {
    english: 'No manual review yet. Add the first review here.',
    chinese: '还没有人工标注，适合先补首条 review。',
  },
  {
    english: 'No review yet or the judge and manual review still disagree.',
    chinese: '还没有 review 或 judge/人工不一致',
  },
  {
    english: 'Multiple reviews or judge results have not converged yet.',
    chinese: '多人 review 或 judge 结论仍未收敛',
  },
  {
    english: 'Assignments already past due_at.',
    chinese: '已经超过 due_at 的复核任务',
  },
  {
    english: 'Quickly open the result\'s review history.',
    chinese: '方便直接查看该结果的复核历史',
  },
  {
    english: 'No adjudication note yet.',
    chinese: '暂无裁决备注。',
  },
  {
    english: 'No adjudication time yet.',
    chinese: '暂无时间',
  },
  {
    english: 'There is no review on the current result yet. Add one review sample first.',
    chinese: '当前结果还没有人工标注，可以先补一条 review 样本。',
  },
]

function localizeKnownCopy(locale: Locale, value: string | null | undefined): string | null | undefined {
  if (!value) {
    return value
  }

  const match = KNOWN_LOCALIZED_COPY.find((item) => item.english === value || item.chinese === value)
  return match ? pickLocaleText(locale, match.english, match.chinese) : value
}

function App() {
  const [locale, setLocale] = useState<Locale>(() => resolveInitialLocale())
  const [activeView, setActiveView] = useState<AppView>('overview')
  const [overviewCategory, setOverviewCategory] = useState<OverviewCategory>('scenarios')
  const [userInput, setUserInput] = useState(SAMPLE_PROMPT)
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<TraceStatusFilter>('all')
  const [taskTypeFilter, setTaskTypeFilter] = useState<TraceTaskTypeFilter>('all')
  const [providerFilter, setProviderFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0])
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('llm')
  const [provider, setProvider] = useState('deepseek')
  const [modelName, setModelName] = useState('deepseek-chat')
  const [promptVersion, setPromptVersion] = useState('v0')
  const [promptVersions, setPromptVersions] = useState<PromptVersionOption[]>([])
  const [promptEditorForm, setPromptEditorForm] = useState<UpdatePromptVersionPayload>({
    version: 'v0',
    label: '',
    label_zh: '',
    description: '',
    description_zh: '',
    system_prompt: '',
    system_prompt_zh: '',
    recommended_model: 'deepseek-chat',
    focus: '',
    focus_zh: '',
  })
  const [promptSaving, setPromptSaving] = useState(false)
  const [stats, setStats] = useState<TraceStats | null>(null)
  const [timeRangeDays, setTimeRangeDays] = useState(7)
  const [traces, setTraces] = useState<TraceListItem[]>([])
  const [selectedTrace, setSelectedTrace] = useState<TraceDetail | null>(null)
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)
  const [compareTraceId, setCompareTraceId] = useState<string | null>(null)
  const [compareTrace, setCompareTrace] = useState<TraceDetail | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [replayingTrace, setReplayingTrace] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [traceChartMetric, setTraceChartMetric] = useState<TraceChartMetric>('runs')

  const [integrationSources, setIntegrationSources] = useState<IntegrationSource[]>([])
  const [connectorTemplates, setConnectorTemplates] = useState<ExternalConnectorTemplate[]>([])
  const [connectorSyncJobs, setConnectorSyncJobs] = useState<ExternalConnectorSyncJob[]>([])
  const [externalUsageRecords, setExternalUsageRecords] = useState<ExternalUsageRecord[]>([])
  const [externalUsageStats, setExternalUsageStats] = useState<ExternalUsageStats | null>(null)
  const [externalUsageValidation, setExternalUsageValidation] = useState<ExternalUsageValidation | null>(null)
  const [integrationTimeRangeDays, setIntegrationTimeRangeDays] = useState(7)
  const [integrationChartMetric, setIntegrationChartMetric] = useState<IntegrationChartMetric>('tokens')
  const [integrationEntryMode, setIntegrationEntryMode] = useState<IntegrationEntryMode>('manual')
  const [integrationRefreshing, setIntegrationRefreshing] = useState(false)
  const [integrationValidationLoading, setIntegrationValidationLoading] = useState(false)
  const [connectorLookbackDays, setConnectorLookbackDays] = useState(3)
  const [syncingConnectorId, setSyncingConnectorId] = useState<string | null>(null)
  const [retryingConnectorJobId, setRetryingConnectorJobId] = useState<number | null>(null)
  const [selectedIntegrationSourceId, setSelectedIntegrationSourceId] = useState<number | null>(null)
  const [selectedConnectorJobId, setSelectedConnectorJobId] = useState<number | null>(null)
  const [lastSyncedConnectorId, setLastSyncedConnectorId] = useState<string | null>(null)
  const [importingUsage, setImportingUsage] = useState(false)
  const [integrationImportSummary, setIntegrationImportSummary] = useState<ExternalUsageImportResult | null>(null)
  const [importJsonText, setImportJsonText] = useState(SAMPLE_EXTERNAL_IMPORT)
  const [integrationSourceForm, setIntegrationSourceForm] = useState({
    name: '',
    platform_name: '',
    access_mode: 'import' as IntegrationAccessMode,
    provider: '',
    base_url: '',
    api_key_hint: '',
    notes: getIntegrationSourceDefaultNotes(locale),
  })
  const [externalUsageForm, setExternalUsageForm] = useState<CreateExternalUsagePayload>({
    source_id: 0,
    model_name: '',
    run_count: 1,
    token_usage: 0,
    input_token_usage: 0,
    output_token_usage: 0,
    cached_token_usage: 0,
    cost_usd: 0,
    external_reference: '',
    notes: getExternalUsageDefaultNotes(locale),
    recorded_at: toDatetimeLocalValue(new Date()),
  })
  const [integrationError, setIntegrationError] = useState<string | null>(null)
  const [evaluationSuites, setEvaluationSuites] = useState<EvaluationSuiteListItem[]>([])
  const [selectedEvaluationSuiteId, setSelectedEvaluationSuiteId] = useState<number | null>(null)
  const [selectedEvaluationSuite, setSelectedEvaluationSuite] = useState<EvaluationSuiteDetail | null>(null)
  const [selectedEvaluationRunId, setSelectedEvaluationRunId] = useState<number | null>(null)
  const [selectedEvaluationRun, setSelectedEvaluationRun] = useState<EvaluationRunDetail | null>(null)
  const [evaluationRuns, setEvaluationRuns] = useState<EvaluationRun[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [demoScenarios, setDemoScenarios] = useState<DemoScenario[]>([])
  const [selectedDemoScenarioId, setSelectedDemoScenarioId] = useState<DemoScenario['id']>('code_debug')
  const [matrixResult, setMatrixResult] = useState<EvaluationMatrixRunResult | null>(null)
  const [experimentSummary, setExperimentSummary] = useState<EvaluationExperimentSummary | null>(null)
  const [experimentSummaryLoading, setExperimentSummaryLoading] = useState(false)
  const [runComparison, setRunComparison] = useState<EvaluationRunComparison | null>(null)
  const [comparisonRunId, setComparisonRunId] = useState(0)
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [matrixRunning, setMatrixRunning] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [evaluationRefreshing, setEvaluationRefreshing] = useState(false)
  const [evaluationReviewQueue, setEvaluationReviewQueue] = useState<EvaluationReviewQueue | null>(null)
  const [reviewQueueOnlyPending, setReviewQueueOnlyPending] = useState(true)
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false)
  const [adjudicationSubmitting, setAdjudicationSubmitting] = useState(false)
  const [seedingDemo, setSeedingDemo] = useState(false)
  const [hoveredTracePoint, setHoveredTracePoint] = useState<TraceStatsPoint | null>(null)
  const [hoveredExternalPoint, setHoveredExternalPoint] = useState<DerivedExternalUsageStatsPoint | null>(null)
  const [evaluationError, setEvaluationError] = useState<string | null>(null)
  const [experimentProviderFilter, setExperimentProviderFilter] = useState('all')
  const [experimentPromptFilter, setExperimentPromptFilter] = useState('all')
  const [experimentCaseSearch, setExperimentCaseSearch] = useState('')
  const [selectedExperimentCellKey, setSelectedExperimentCellKey] = useState<string | null>(null)
  const [activeSidebarSectionId, setActiveSidebarSectionId] = useState('overview-summary')
  const [pendingScrollTargetId, setPendingScrollTargetId] = useState<string | null>(null)
  const [showEvaluationInsights, setShowEvaluationInsights] = useState(false)
  const [showOfficialValidationDetails, setShowOfficialValidationDetails] = useState(false)
  const [showReviewQueueDetails, setShowReviewQueueDetails] = useState(false)
  const [showExperimentMatrixDetails, setShowExperimentMatrixDetails] = useState(false)
  const [showSelectedSuiteCases, setShowSelectedSuiteCases] = useState(false)
  const [showSelectedRunResults, setShowSelectedRunResults] = useState(false)
  const [showAuditEventHistory, setShowAuditEventHistory] = useState(false)
  const [showExperimentCaseSummaries, setShowExperimentCaseSummaries] = useState(false)
  const [evaluationSuiteForm, setEvaluationSuiteForm] = useState({
    name: '',
    description: '',
    casesText: '',
  })
  const [evaluationRunForm, setEvaluationRunForm] = useState<CreateEvaluationRunPayload>({
    suite_id: 0,
    execution_mode: 'mock',
    provider: 'deepseek',
    model_name: 'deepseek-chat',
    prompt_version: 'v0',
    experiment_label: 'single-run',
    notes: getEvaluationRunDefaultNotes(locale),
  })
  const [matrixForm, setMatrixForm] = useState({
    suite_id: 0,
    execution_mode: 'mock' as ExecutionMode,
    experiment_label: '',
    variantsText: '',
    notes: getMatrixDefaultNotes(locale),
  })
  const [reviewForm, setReviewForm] = useState({
    result_id: 0,
    reviewer_name: 'ops-reviewer',
    review_label: 'needs_review' as QualityLabel,
    review_score: '',
    review_notes: getReviewDefaultNotes(locale),
  })
  const [reviewAssignmentForm, setReviewAssignmentForm] = useState({
    result_id: 0,
    assignee_name: 'qa-owner',
    assignment_status: 'pending' as 'pending' | 'in_progress' | 'done',
    priority: 'high' as 'low' | 'medium' | 'high',
    assignment_notes: getAssignmentDefaultNotes(locale),
    due_at: toDatetimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  })
  const [adjudicationForm, setAdjudicationForm] = useState({
    result_id: 0,
    adjudicated_by: 'review-lead',
    adjudication_label: 'needs_review' as QualityLabel,
    adjudication_score: '',
    adjudication_notes: getAdjudicationDefaultNotes(locale),
    mark_latest_assignment_done: true,
  })
  const [traceScoreForm, setTraceScoreForm] = useState({
    quality_label: 'needs_review' as QualityLabel,
    quality_score: '',
    quality_notes: getTraceScoreDefaultNotes(locale),
  })
  const [auditEventForm, setAuditEventForm] = useState<CreateAuditEventPayload>({
    trace_id: null,
    step_index: null,
    event_type: 'tool_call',
    decision: 'review',
    risk_level: 'medium',
    policy_name: 'default-policy',
    target_name: 'shell-command',
    reason: getAuditReasonDefault(locale),
    status: 'logged',
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void refreshTraces()
  }, [])

  useEffect(() => {
    void refreshPromptVersions()
  }, [])

  useEffect(() => {
    if (!promptVersions.length) {
      return
    }

    const nextPrompt = pickPromptOption(promptVersions, promptVersion) ?? promptVersions[0]
    // Mirror the selected prompt into the editor form so the same payload can be sent back to the file-backed backend registry.
    setPromptEditorForm({
      version: nextPrompt.version,
      label: nextPrompt.label,
      label_zh: nextPrompt.label_zh,
      description: nextPrompt.description,
      description_zh: nextPrompt.description_zh,
      system_prompt: nextPrompt.system_prompt,
      system_prompt_zh: nextPrompt.system_prompt_zh,
      recommended_model: nextPrompt.recommended_model,
      focus: nextPrompt.focus,
      focus_zh: nextPrompt.focus_zh,
    })
  }, [promptVersion, promptVersions])

  useEffect(() => {
    void refreshStats()
  }, [timeRangeDays, providerFilter, statusFilter, taskTypeFilter])

  useEffect(() => {
    void refreshIntegrationHub()
  }, [integrationTimeRangeDays])

  useEffect(() => {
    if (!externalUsageRecords.length && !externalUsageValidation) {
      return
    }

    void refreshIntegrationValidation()
  }, [selectedIntegrationSourceId])

  useEffect(() => {
    void refreshEvaluationHub()
  }, [reviewQueueOnlyPending])

  useEffect(() => {
    void refreshDemoScenarios()
  }, [])

  useEffect(() => {
    // 只在字段仍然是默认演示文案时跟随语言切换，避免覆盖用户手动输入的内容。
    setIntegrationSourceForm((current) => ({
      ...current,
      notes: isDefaultLocalizedCopy(current.notes, getIntegrationSourceDefaultNotes('en'), getIntegrationSourceDefaultNotes('zh')) ? getIntegrationSourceDefaultNotes(locale) : current.notes,
    }))
    setExternalUsageForm((current) => ({
      ...current,
      notes: isDefaultLocalizedCopy(current.notes ?? '', getExternalUsageDefaultNotes('en'), getExternalUsageDefaultNotes('zh')) ? getExternalUsageDefaultNotes(locale) : current.notes,
    }))
    setEvaluationRunForm((current) => ({
      ...current,
      notes: isDefaultLocalizedCopy(current.notes ?? '', getEvaluationRunDefaultNotes('en'), getEvaluationRunDefaultNotes('zh')) ? getEvaluationRunDefaultNotes(locale) : current.notes,
    }))
    setMatrixForm((current) => ({
      ...current,
      notes: isDefaultLocalizedCopy(current.notes, getMatrixDefaultNotes('en'), getMatrixDefaultNotes('zh')) ? getMatrixDefaultNotes(locale) : current.notes,
    }))
    setReviewForm((current) => ({
      ...current,
      review_notes: isDefaultLocalizedCopy(current.review_notes ?? '', getReviewDefaultNotes('en'), getReviewDefaultNotes('zh')) ? getReviewDefaultNotes(locale) : current.review_notes,
    }))
    setReviewAssignmentForm((current) => ({
      ...current,
      assignment_notes: isDefaultLocalizedCopy(current.assignment_notes ?? '', getAssignmentDefaultNotes('en'), getAssignmentDefaultNotes('zh')) ? getAssignmentDefaultNotes(locale) : current.assignment_notes,
    }))
    setAdjudicationForm((current) => ({
      ...current,
      adjudication_notes: isDefaultLocalizedCopy(current.adjudication_notes ?? '', getAdjudicationDefaultNotes('en'), getAdjudicationDefaultNotes('zh')) ? getAdjudicationDefaultNotes(locale) : current.adjudication_notes,
    }))
    setTraceScoreForm((current) => ({
      ...current,
      quality_notes: isDefaultLocalizedCopy(current.quality_notes, getTraceScoreDefaultNotes('en'), getTraceScoreDefaultNotes('zh')) ? getTraceScoreDefaultNotes(locale) : current.quality_notes,
    }))
    setAuditEventForm((current) => ({
      ...current,
      reason: isDefaultLocalizedCopy(current.reason ?? '', getAuditReasonDefault('en'), getAuditReasonDefault('zh')) ? getAuditReasonDefault(locale) : current.reason,
    }))
  }, [locale])

  useEffect(() => {
    if (!selectedTrace) {
      return
    }

    setTraceScoreForm({
      quality_label: selectedTrace.quality_label ?? 'needs_review',
      quality_score: selectedTrace.quality_score !== null ? String(selectedTrace.quality_score) : '',
      quality_notes: selectedTrace.quality_notes ?? getTraceScoreDefaultNotes(locale),
    })
    setAuditEventForm((current) => ({
      ...current,
      trace_id: selectedTrace.id,
    }))
  }, [selectedTrace])

  useEffect(() => {
    if (!selectedEvaluationRun?.results.length) {
      setReviewForm((current) => ({
        ...current,
        result_id: 0,
      }))
      setReviewAssignmentForm((current) => ({
        ...current,
        result_id: 0,
      }))
      setAdjudicationForm((current) => ({
        ...current,
        result_id: 0,
      }))
      return
    }

    setReviewForm((current) => ({
      ...current,
      result_id: selectedEvaluationRun.results.some((result) => result.id === current.result_id)
        ? current.result_id
        : selectedEvaluationRun.results[0].id,
    }))
    setReviewAssignmentForm((current) => ({
      ...current,
      result_id: selectedEvaluationRun.results.some((result) => result.id === current.result_id)
        ? current.result_id
        : selectedEvaluationRun.results[0].id,
    }))
    setAdjudicationForm((current) => ({
      ...current,
      result_id: selectedEvaluationRun.results.some((result) => result.id === current.result_id)
        ? current.result_id
        : selectedEvaluationRun.results[0].id,
    }))
  }, [selectedEvaluationRun])

  useEffect(() => {
    const experimentLabel = matrixResult?.experiment_label ?? selectedEvaluationRun?.experiment_label ?? null
    if (!experimentLabel) {
      setExperimentSummary(null)
      return
    }

    void loadExperimentSummary(experimentLabel)
  }, [matrixResult?.experiment_label, selectedEvaluationRun?.experiment_label])

  useEffect(() => {
    if (!selectedEvaluationRunId || !comparisonRunId || comparisonRunId === selectedEvaluationRunId) {
      setRunComparison(null)
      return
    }

    const baseRun = evaluationRuns.find((run) => run.id === selectedEvaluationRunId)
    const targetRun = evaluationRuns.find((run) => run.id === comparisonRunId)
    if (!baseRun || !targetRun || baseRun.suite_id !== targetRun.suite_id) {
      setRunComparison(null)
      return
    }

    void handleLoadRunComparison(selectedEvaluationRunId, comparisonRunId)
  }, [selectedEvaluationRunId, comparisonRunId, evaluationRuns])

  async function refreshTraces() {
    setRefreshing(true)
    try {
      const items = await listTraces()
      setTraces(items)

      if (items.length && (!selectedTraceId || !items.some((trace) => trace.id === selectedTraceId))) {
        await handleSelectTrace(items[0].id)
      }
    } catch (caughtError) {
      setError((caughtError as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  async function refreshPromptVersions() {
    try {
      const items = await listPromptVersions()
      setPromptVersions(items)

      if (items.length && !items.some((item) => item.version === promptVersion)) {
        setPromptVersion(items[0].version)
        setModelName(items[0].recommended_model)
      }
    } catch (caughtError) {
      setError((caughtError as Error).message)
    }
  }

  async function refreshStats() {
    try {
      const data = await getTraceStats({
        timeRangeDays,
        provider: providerFilter,
        status: statusFilter,
        taskType: taskTypeFilter,
      })
      setStats(data)
    } catch (caughtError) {
      setError((caughtError as Error).message)
    }
  }

  async function refreshIntegrationHub() {
    setIntegrationRefreshing(true)
    try {
      const [sources, usageRecords, usageStats, usageValidation, connectors, syncJobs] = await Promise.all([
        listIntegrationSources(),
        listExternalUsageRecords(),
        getExternalUsageStats(integrationTimeRangeDays),
        getExternalUsageValidation({ timeRangeDays: integrationTimeRangeDays, sourceId: selectedIntegrationSourceId }),
        listExternalConnectors(),
        listExternalConnectorSyncJobs(),
      ])
      setIntegrationSources(sources)
      setExternalUsageRecords(usageRecords)
      setExternalUsageStats(usageStats)
      setExternalUsageValidation(usageValidation)
      setConnectorTemplates(connectors)
      setConnectorSyncJobs(syncJobs)

      if (sources.length && !sources.some((source) => source.id === externalUsageForm.source_id)) {
        setExternalUsageForm((current) => ({
          ...current,
          source_id: sources[0].id,
        }))
      }
    } catch (caughtError) {
      setIntegrationError((caughtError as Error).message)
    } finally {
      setIntegrationRefreshing(false)
    }
  }

  async function refreshIntegrationValidation() {
    setIntegrationValidationLoading(true)
    try {
      const validation = await getExternalUsageValidation({
        timeRangeDays: integrationTimeRangeDays,
        sourceId: selectedIntegrationSourceId,
      })
      setExternalUsageValidation(validation)
    } catch (caughtError) {
      setIntegrationError((caughtError as Error).message)
    } finally {
      setIntegrationValidationLoading(false)
    }
  }

  async function refreshEvaluationHub() {
    setEvaluationRefreshing(true)
    try {
      const [suites, runs, events, reviewQueue] = await Promise.all([
        listEvaluationSuites(),
        listEvaluationRuns(),
        listAuditEvents(),
        getEvaluationReviewQueue(reviewQueueOnlyPending),
      ])
      setEvaluationSuites(suites)
      setEvaluationRuns(runs)
      setAuditEvents(events)
      setEvaluationReviewQueue(reviewQueue)

      const nextSuiteId = suites.length
        ? (selectedEvaluationSuiteId && suites.some((suite) => suite.id === selectedEvaluationSuiteId) ? selectedEvaluationSuiteId : suites[0].id)
        : null

      setSelectedEvaluationSuiteId(nextSuiteId)
      if (nextSuiteId !== null) {
        const suiteDetail = await getEvaluationSuite(nextSuiteId)
        setSelectedEvaluationSuite(suiteDetail)
        setEvaluationRunForm((current) => ({
          ...current,
          suite_id: current.suite_id && suites.some((suite) => suite.id === current.suite_id) ? current.suite_id : nextSuiteId,
        }))
        setMatrixForm((current) => ({
          ...current,
          suite_id: current.suite_id && suites.some((suite) => suite.id === current.suite_id) ? current.suite_id : nextSuiteId,
        }))
      } else {
        setSelectedEvaluationSuite(null)
        setEvaluationRunForm((current) => ({
          ...current,
          suite_id: 0,
        }))
        setMatrixForm((current) => ({
          ...current,
          suite_id: 0,
        }))
      }

      const nextRunId = runs.length
        ? (selectedEvaluationRunId && runs.some((run) => run.id === selectedEvaluationRunId) ? selectedEvaluationRunId : runs[0].id)
        : null

      setSelectedEvaluationRunId(nextRunId)
      if (nextRunId !== null) {
        const runDetail = await getEvaluationRun(nextRunId)
        setSelectedEvaluationRun(runDetail)
      } else {
        setSelectedEvaluationRun(null)
        setRunComparison(null)
      }
    } catch (caughtError) {
      setEvaluationError((caughtError as Error).message)
    } finally {
      setEvaluationRefreshing(false)
    }
  }

  async function refreshDemoScenarios() {
    try {
      const items = await listDemoScenarios()
      setDemoScenarios(items)
      if (items.length && !items.some((item) => item.id === selectedDemoScenarioId)) {
        setSelectedDemoScenarioId(items[0].id)
      }
    } catch (caughtError) {
      setEvaluationError((caughtError as Error).message)
    }
  }

  async function handleSelectTrace(traceId: string) {
    try {
      setSelectedTraceId(traceId)
      const trace = await getTrace(traceId)
      setSelectedTrace(trace)
    } catch (caughtError) {
      setError((caughtError as Error).message)
    }
  }

  async function handleCompareTrace(traceId: string) {
    if (!traceId || !selectedTrace || traceId === selectedTrace.id) {
      setCompareTraceId(null)
      setCompareTrace(null)
      return
    }

    setCompareTraceId(traceId)
    setCompareLoading(true)
    try {
      const trace = await getTrace(traceId)
      setCompareTrace(trace)
    } catch (caughtError) {
      setError((caughtError as Error).message)
    } finally {
      setCompareLoading(false)
    }
  }

  async function handleSelectEvaluationSuite(suiteId: number) {
    try {
      setSelectedEvaluationSuiteId(suiteId)
      const suite = await getEvaluationSuite(suiteId)
      setSelectedEvaluationSuite(suite)
    } catch (caughtError) {
      setEvaluationError((caughtError as Error).message)
    }
  }

  async function handleSelectEvaluationRun(runId: number) {
    try {
      setSelectedEvaluationRunId(runId)
      const run = await getEvaluationRun(runId)
      setSelectedEvaluationRun(run)
      if (comparisonRunId === runId) {
        setComparisonRunId(0)
      }
    } catch (caughtError) {
      setEvaluationError((caughtError as Error).message)
    }
  }

  function handleFocusIntegrationSource(source: IntegrationSource) {
    // 点击来源卡片后直接切回手动录入并预填 source，减少在长表单里重复查找。
    setSelectedIntegrationSourceId(source.id)
    setIntegrationEntryMode('manual')
    setExternalUsageForm((current) => ({
      ...current,
      source_id: source.id,
      model_name: current.model_name || 'unknown',
    }))
    setIntegrationSourceForm({
      name: source.name,
      platform_name: source.platform_name,
      access_mode: source.access_mode,
      provider: source.provider,
      base_url: source.base_url ?? '',
      api_key_hint: source.api_key_hint ?? '',
      notes: source.notes ?? '',
    })
  }

  function handleClearIntegrationSourceFilter() {
    setSelectedIntegrationSourceId(null)
  }

  function handleFocusConnectorJob(job: ExternalConnectorSyncJob) {
    // 历史批次点击后先把时间窗和选中态带回页面，方便立即重试或继续导入验证。
    setSelectedConnectorJobId(job.id)
    setConnectorLookbackDays(job.lookback_days)
  }

  function handleChangeExternalUsageTokenBreakdown(field: 'input_token_usage' | 'output_token_usage' | 'cached_token_usage', value: number) {
    // 前端先把 total 与 input/output 保持同一口径，减少用户手动录入时把 cached 重复算进 total 的机会。
    setExternalUsageForm((current) => {
      const next = {
        ...current,
        [field]: value,
      }
      return {
        ...next,
        token_usage: next.input_token_usage + next.output_token_usage,
      }
    })
  }

  async function handleLoadRunComparison(baseRunId: number, compareRunId: number) {
    setComparisonLoading(true)
    try {
      const comparison = await compareEvaluationRuns(baseRunId, compareRunId)
      setRunComparison(comparison)
    } catch (caughtError) {
      setEvaluationError((caughtError as Error).message)
    } finally {
      setComparisonLoading(false)
    }
  }

  async function loadExperimentSummary(experimentLabel: string) {
    setExperimentSummaryLoading(true)
    try {
      const summary = await getEvaluationExperimentSummary(experimentLabel)
      setExperimentSummary(summary)
    } catch (caughtError) {
      setEvaluationError((caughtError as Error).message)
    } finally {
      setExperimentSummaryLoading(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const payload: CreateTracePayload = {
        user_input: userInput,
        execution_mode: executionMode,
        provider,
        model_name: modelName,
        prompt_version: promptVersion,
      }
      const trace = await createTrace(payload)
      setSelectedTraceId(trace.id)
      setSelectedTrace(trace)
      await refreshTraces()
      await refreshStats()
      setActiveView('traces')
    } catch (caughtError) {
      setError((caughtError as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSavePromptVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPromptSaving(true)
    setError(null)

    try {
      const updatedPromptVersions = await savePromptVersion(promptEditorForm.version, promptEditorForm)
      setPromptVersions(updatedPromptVersions)

      const currentPrompt = pickPromptOption(updatedPromptVersions, promptEditorForm.version)
      if (currentPrompt) {
        setPromptVersion(currentPrompt.version)
        setModelName(currentPrompt.recommended_model)
      }
    } catch (caughtError) {
      setError((caughtError as Error).message)
    } finally {
      setPromptSaving(false)
    }
  }

  async function handleCreateIntegrationSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIntegrationError(null)

    try {
      const source = await createIntegrationSource({
        ...integrationSourceForm,
        base_url: normalizeOptionalText(integrationSourceForm.base_url),
        api_key_hint: normalizeOptionalText(integrationSourceForm.api_key_hint),
        notes: normalizeOptionalText(integrationSourceForm.notes),
      })
      await refreshIntegrationHub()
      setExternalUsageForm((current) => ({
        ...current,
        source_id: source.id,
      }))
      setIntegrationSourceForm((current) => ({
        ...current,
        name: '',
        base_url: '',
        api_key_hint: '',
        notes: current.notes,
      }))
    } catch (caughtError) {
      setIntegrationError((caughtError as Error).message)
    }
  }

  async function handleImportExternalUsage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIntegrationError(null)
    setImportingUsage(true)
    setIntegrationImportSummary(null)

    try {
      const parsed = JSON.parse(importJsonText) as ExternalUsageImportItem | ExternalUsageImportItem[]
      const records = Array.isArray(parsed) ? parsed : [parsed]

      if (!records.length) {
        throw new Error('导入内容不能为空，至少需要一条 usage 记录。')
      }

      for (const record of records) {
        if (!record.source_name || !record.platform_name || !record.provider || !record.model_name) {
          throw new Error('每条导入记录都必须包含 source_name、platform_name、provider 和 model_name。')
        }
      }

      // 批量导入交给后端做，原因是来源复用、去重和统计摘要更适合放在同一事务边界里处理。
      const summary = await importExternalUsageRecords({
        records: records.map((record) => ({
          ...record,
          access_mode: record.access_mode ?? 'import',
          base_url: normalizeOptionalText(record.base_url),
          api_key_hint: normalizeOptionalText(record.api_key_hint),
          notes: normalizeOptionalText(record.notes ?? '通过 JSON 导入创建的外部来源。'),
          external_reference: normalizeOptionalText(record.external_reference),
          recorded_at: record.recorded_at ? new Date(record.recorded_at).toISOString() : null,
        })),
      })

      await refreshIntegrationHub()
      setIntegrationImportSummary(summary)
      setIntegrationEntryMode('manual')
    } catch (caughtError) {
      setIntegrationError((caughtError as Error).message)
    } finally {
      setImportingUsage(false)
    }
  }

  async function handleSyncConnector(connectorId: string) {
    setIntegrationError(null)
    setSyncingConnectorId(connectorId)
    try {
      const result = await syncExternalConnector({
        connector_id: connectorId,
        lookback_days: connectorLookbackDays,
      })
      await refreshIntegrationHub()
      setLastSyncedConnectorId(connectorId)
      handleFocusIntegrationSource(result.source)
      setIntegrationEntryMode('manual')
    } catch (caughtError) {
      setIntegrationError((caughtError as Error).message)
    } finally {
      setSyncingConnectorId(null)
    }
  }

  async function handleRetryConnectorJob(jobId: number) {
    setIntegrationError(null)
    setRetryingConnectorJobId(jobId)
    try {
      await retryExternalConnectorSyncJob(jobId)
      await refreshIntegrationHub()
    } catch (caughtError) {
      setIntegrationError((caughtError as Error).message)
    } finally {
      setRetryingConnectorJobId(null)
    }
  }

  async function handleCreateExternalUsage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIntegrationError(null)

    try {
      await createExternalUsageRecord({
        ...externalUsageForm,
        recorded_at: externalUsageForm.recorded_at ? new Date(externalUsageForm.recorded_at).toISOString() : null,
      })
      await refreshIntegrationHub()
      setExternalUsageForm((current) => ({
        ...current,
        run_count: 1,
        token_usage: 0,
        input_token_usage: 0,
        output_token_usage: 0,
        cached_token_usage: 0,
        cost_usd: 0,
        external_reference: '',
        notes: '可手动录入，也可作为后续 JSON / API 导入的承载结构。',
        recorded_at: toDatetimeLocalValue(new Date()),
      }))
    } catch (caughtError) {
      setIntegrationError((caughtError as Error).message)
    }
  }

  async function handleReplayTrace() {
    if (!selectedTrace) {
      return
    }

    setReplayingTrace(true)
    setError(null)
    try {
      const trace = await replayTrace(selectedTrace.id)
      setSelectedTraceId(trace.id)
      setSelectedTrace(trace)
      await refreshTraces()
      await refreshStats()
      setActiveView('traces')
    } catch (caughtError) {
      setError((caughtError as Error).message)
    } finally {
      setReplayingTrace(false)
    }
  }

  async function handleCreateEvaluationSuite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEvaluationError(null)

    const caseInputs = evaluationSuiteForm.casesText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)

    if (!caseInputs.length) {
      setEvaluationError('至少需要一条 case 输入，后续批量评测才有运行对象。')
      return
    }

    try {
      const suite = await createEvaluationSuite({
        name: evaluationSuiteForm.name,
        description: normalizeOptionalText(evaluationSuiteForm.description),
        cases: caseInputs.map((userInput, index) => ({
          title: `Case ${index + 1}`,
          user_input: userInput,
          score_rubric: '回答是否完成任务、结构是否清晰、是否使用正确信息。',
        })),
      })
      setSelectedEvaluationSuiteId(suite.id)
      setSelectedEvaluationSuite(suite)
      await refreshEvaluationHub()
    } catch (caughtError) {
      setEvaluationError((caughtError as Error).message)
    }
  }

  async function handleCreateEvaluationRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEvaluationError(null)

    if (!evaluationRunForm.suite_id) {
      setEvaluationError(pickLocaleText(locale, 'Select a suite before creating an evaluation run.', '先选择一个评测集，再创建评测运行骨架。'))
      return
    }

    try {
      const run = await createEvaluationRun({
        ...evaluationRunForm,
        experiment_label: normalizeOptionalText(evaluationRunForm.experiment_label),
        notes: normalizeOptionalText(evaluationRunForm.notes),
      })
      setSelectedEvaluationRunId(run.id)
      setSelectedEvaluationRun(run)
      await refreshEvaluationHub()
    } catch (caughtError) {
      setEvaluationError((caughtError as Error).message)
    }
  }

  async function handleSeedDemoData(scenarioId: DemoScenario['id'] = selectedDemoScenarioId) {
    setEvaluationError(null)
    setSeedingDemo(true)
    try {
      const seeded = await seedDemoScenarios(scenarioId)
      await Promise.all([
        refreshTraces(),
        refreshStats(),
        refreshEvaluationHub(),
      ])
      setSelectedEvaluationSuiteId(seeded.created_suite_id)
      setSelectedEvaluationRunId(seeded.created_run_id)
      setActiveView('labs')
    } catch (caughtError) {
      setEvaluationError((caughtError as Error).message)
    } finally {
      setSeedingDemo(false)
    }
  }

  async function handleCreateEvaluationMatrixRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEvaluationError(null)

    if (!matrixForm.suite_id) {
      setEvaluationError('先选择一个评测集，再执行矩阵评测。')
      return
    }

    const variants = matrixForm.variantsText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [label, providerName, nextModelName, nextPromptVersion] = item.split('|').map((part) => part.trim())
        if (!label || !providerName || !nextModelName || !nextPromptVersion) {
          throw new Error('每条矩阵变体都必须使用 label|provider|model|prompt_version 格式。')
        }
        return {
          label,
          provider: providerName,
          model_name: nextModelName,
          prompt_version: nextPromptVersion,
        }
      })

    if (!variants.length) {
      setEvaluationError('至少需要一条矩阵变体。')
      return
    }

    setMatrixRunning(true)
    try {
      const result = await createEvaluationMatrixRun({
        suite_id: matrixForm.suite_id,
        execution_mode: matrixForm.execution_mode,
        experiment_label: matrixForm.experiment_label,
        variants,
        notes: normalizeOptionalText(matrixForm.notes),
      })
      setMatrixResult(result)
      await refreshEvaluationHub()
      if (result.created_runs.length) {
        await handleSelectEvaluationRun(result.created_runs[0].run_id)
      }
    } catch (caughtError) {
      setEvaluationError((caughtError as Error).message)
    } finally {
      setMatrixRunning(false)
    }
  }

  async function handleScoreSelectedTrace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTrace) {
      return
    }

    setError(null)
    try {
      const trace = await scoreTrace(selectedTrace.id, {
        quality_label: traceScoreForm.quality_label,
        quality_score: traceScoreForm.quality_score ? Number(traceScoreForm.quality_score) : null,
        quality_notes: normalizeOptionalText(traceScoreForm.quality_notes),
      })
      setSelectedTrace(trace)
      await refreshTraces()
    } catch (caughtError) {
      setError((caughtError as Error).message)
    }
  }

  async function handleCreateAuditEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEvaluationError(null)

    try {
      await createAuditEvent({
        ...auditEventForm,
        trace_id: normalizeOptionalText(auditEventForm.trace_id),
        reason: normalizeOptionalText(auditEventForm.reason),
      })
      await refreshEvaluationHub()
    } catch (caughtError) {
      setEvaluationError((caughtError as Error).message)
    }
  }

  async function handleCreateEvaluationReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEvaluationError(null)

    if (!reviewForm.result_id) {
      setEvaluationError('先选择一条评测结果，再提交人工标注。')
      return
    }

    setReviewSubmitting(true)
    try {
      const payload: CreateEvaluationReviewPayload = {
        reviewer_name: reviewForm.reviewer_name,
        review_label: reviewForm.review_label,
        review_score: reviewForm.review_score ? Number(reviewForm.review_score) : null,
        review_notes: normalizeOptionalText(reviewForm.review_notes),
      }
      await createEvaluationResultReview(reviewForm.result_id, payload)
      if (selectedEvaluationRunId !== null) {
        await handleSelectEvaluationRun(selectedEvaluationRunId)
      }
      await refreshEvaluationHub()
    } catch (caughtError) {
      setEvaluationError((caughtError as Error).message)
    } finally {
      setReviewSubmitting(false)
    }
  }

  async function handleCreateReviewAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEvaluationError(null)

    if (!reviewAssignmentForm.result_id) {
      setEvaluationError('先选择一条评测结果，再创建 review 指派。')
      return
    }

    setAssignmentSubmitting(true)
    try {
      const payload: CreateEvaluationReviewAssignmentPayload = {
        assignee_name: reviewAssignmentForm.assignee_name,
        assignment_status: reviewAssignmentForm.assignment_status,
        priority: reviewAssignmentForm.priority,
        assignment_notes: normalizeOptionalText(reviewAssignmentForm.assignment_notes),
        due_at: reviewAssignmentForm.due_at ? new Date(reviewAssignmentForm.due_at).toISOString() : null,
      }
      await createEvaluationReviewAssignment(reviewAssignmentForm.result_id, payload)
      await refreshEvaluationHub()
    } catch (caughtError) {
      setEvaluationError((caughtError as Error).message)
    } finally {
      setAssignmentSubmitting(false)
    }
  }

  async function handleAdjudicateResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEvaluationError(null)

    if (!adjudicationForm.result_id) {
      setEvaluationError('先选择一条评测结果，再提交最终裁决。')
      return
    }

    setAdjudicationSubmitting(true)
    try {
      const payload: CreateEvaluationAdjudicationPayload = {
        adjudicated_by: adjudicationForm.adjudicated_by,
        adjudication_label: adjudicationForm.adjudication_label,
        adjudication_score: adjudicationForm.adjudication_score ? Number(adjudicationForm.adjudication_score) : null,
        adjudication_notes: normalizeOptionalText(adjudicationForm.adjudication_notes),
        mark_latest_assignment_done: adjudicationForm.mark_latest_assignment_done,
      }
      await adjudicateEvaluationResult(adjudicationForm.result_id, payload)
      if (selectedEvaluationRunId !== null) {
        await handleSelectEvaluationRun(selectedEvaluationRunId)
      }
      await refreshEvaluationHub()
    } catch (caughtError) {
      setEvaluationError((caughtError as Error).message)
    } finally {
      setAdjudicationSubmitting(false)
    }
  }

  function handleFocusReviewQueueItem(item: EvaluationReviewQueueItem) {
    void handleSelectEvaluationRun(item.run_id)
    setReviewForm((current) => ({
      ...current,
      result_id: item.result_id,
    }))
    setReviewAssignmentForm((current) => ({
      ...current,
      result_id: item.result_id,
      assignee_name: item.assignee_name ?? current.assignee_name,
      priority: item.priority ?? current.priority,
      assignment_status: item.assignment_status ?? current.assignment_status,
      due_at: item.due_at ? toDatetimeLocalValue(new Date(item.due_at)) : current.due_at,
    }))
    setAdjudicationForm((current) => ({
      ...current,
      result_id: item.result_id,
      adjudication_label: item.adjudication_label ?? current.adjudication_label,
    }))
    setActiveView('labs')
  }

  function handleFocusExperimentCell(runId: number, resultId: number | null, cellKey: string) {
    setSelectedExperimentCellKey(cellKey)
    void handleSelectEvaluationRun(runId)
    if (resultId !== null) {
      setReviewForm((current) => ({
        ...current,
        result_id: resultId,
      }))
      setReviewAssignmentForm((current) => ({
        ...current,
        result_id: resultId,
      }))
      setAdjudicationForm((current) => ({
        ...current,
        result_id: resultId,
      }))
    }
    setActiveView('labs')
  }

  function handleOpenTraceFromMatrixCell(traceId: string) {
    setActiveView('traces')
    void handleSelectTrace(traceId)
  }

  function handleExportExperimentSummary(format: 'json' | 'markdown') {
    if (!experimentSummary) {
      return
    }

    if (format === 'json') {
      exportExperimentSummaryAsJson(experimentSummary)
      return
    }
    exportExperimentSummaryAsMarkdown(experimentSummary)
  }

  function applyPlaybook(playbook: CustomerPlaybook) {
    setUserInput(playbook.userInput)
    setExecutionMode(playbook.executionMode)
    setProvider(playbook.provider)
    setModelName(playbook.modelName)
    setPromptVersion(playbook.promptVersion)
  }

  const providerFilterOptions = ['all', ...Array.from(new Set(traces.map((trace) => trace.provider).filter(Boolean)))]
  const taskTypeOptions = ['all', ...Array.from(new Set([...KNOWN_TASK_TYPES, ...traces.map((trace) => trace.task_type)]))]

  const filteredTraces = traces.filter((trace) => {
    const normalizedSearch = searchText.trim().toLowerCase()
    const matchesSearch = [trace.id, trace.task_type, trace.task_input, trace.latest_step_title ?? '', trace.provider, trace.model_name]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch)

    const matchesStatus = statusFilter === 'all' ? true : trace.status === statusFilter
    const matchesTaskType = taskTypeFilter === 'all' ? true : trace.task_type === taskTypeFilter
    const matchesProvider = providerFilter === 'all' ? true : trace.provider === providerFilter

    return matchesSearch && matchesStatus && matchesTaskType && matchesProvider
  })

  const totalPages = Math.max(1, Math.ceil(filteredTraces.length / pageSize))
  const paginatedTraces = filteredTraces.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const completedRuns = traces.filter((trace) => trace.status === 'completed').length
  const failedRuns = traces.filter((trace) => trace.status === 'failed').length
  const successRate = traces.length ? (completedRuns / traces.length) * 100 : 0
  const averageLatency = traces.length
    ? (traces.reduce((sum, trace) => sum + trace.total_latency_ms, 0) / traces.length).toFixed(0)
    : '0'

  const selectedPromptOption = pickPromptOption(promptVersions, promptVersion)
  const localizedSelectedPrompt = selectedPromptOption ? getLocalizedPromptCopy(selectedPromptOption, locale) : null
  const latestTrace = traces[0] ?? null
  const latestCompletedTrace = traces.find((trace) => trace.status === 'completed') ?? null
  const comparisonCandidates = selectedTrace ? traces.filter((trace) => trace.id !== selectedTrace.id) : []
  const errorSteps = selectedTrace?.steps.filter((step) => step.error_message) ?? []
  const integrationRuns = externalUsageStats?.total_runs ?? 0
  const integrationTokens = externalUsageStats?.total_tokens ?? 0
  const integrationCost = externalUsageStats?.total_cost_usd ?? 0
  const selectedIntegrationSource = integrationSources.find((source) => source.id === selectedIntegrationSourceId) ?? null
  const connectorSourceMap = new Map(connectorTemplates.map((connector) => {
    const matchedSource = integrationSources.find((source) => source.name === connector.title && source.platform_name === connector.platform_name && source.provider === connector.provider) ?? null
    return [connector.id, matchedSource]
  }))
  const latestConnectorJobMap = new Map(connectorTemplates.map((connector) => {
    const matchedJob = connectorSyncJobs.find((job) => job.connector_id === connector.id) ?? null
    return [connector.id, matchedJob]
  }))
  const filteredExternalUsageRecords = selectedIntegrationSourceId
    ? externalUsageRecords.filter((record) => record.source_id === selectedIntegrationSourceId)
    : externalUsageRecords
  const integrationPanelStats: DerivedExternalUsageStats = (() => {
    const days = buildUtcDaySequence(externalUsageStats?.time_range_days ?? integrationTimeRangeDays)
    const timelineMap = new Map(days.map((day) => [day, {
      date: day,
      run_count: 0,
      token_usage: 0,
      cost_usd: 0,
      input_token_usage: 0,
      output_token_usage: 0,
      cached_token_usage: 0,
    }]))
    const platformCounter = new Map<string, number>()
    const providerCounter = new Map<string, number>()
    let totalRuns = 0
    let totalTokens = 0
    let totalCost = 0

    filteredExternalUsageRecords.forEach((record) => {
      const dayKey = toUtcDayKey(record.recorded_at)
      const bucket = timelineMap.get(dayKey)
      if (!bucket) {
        return
      }

      bucket.run_count += record.run_count
      bucket.token_usage += record.token_usage
      bucket.cost_usd += record.cost_usd
      bucket.input_token_usage += record.input_token_usage
      bucket.output_token_usage += record.output_token_usage
      bucket.cached_token_usage += record.cached_token_usage

      totalRuns += record.run_count
      totalTokens += record.token_usage
      totalCost += record.cost_usd
      platformCounter.set(record.platform_name, (platformCounter.get(record.platform_name) ?? 0) + record.run_count)
      providerCounter.set(record.provider, (providerCounter.get(record.provider) ?? 0) + record.run_count)
    })

    const toBreakdown = (counter: Map<string, number>) => Array.from(counter.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([key, count]) => ({ key, count }))

    return {
      total_runs: totalRuns,
      total_tokens: totalTokens,
      total_cost_usd: Number(totalCost.toFixed(4)),
      time_range_days: externalUsageStats?.time_range_days ?? integrationTimeRangeDays,
      timeline: Array.from(timelineMap.values()).map((point) => ({
        ...point,
        cost_usd: Number(point.cost_usd.toFixed(4)),
      })),
      platform_breakdown: toBreakdown(platformCounter),
      provider_breakdown: toBreakdown(providerCounter),
    }
  })()
  const integrationDisplayRuns = integrationPanelStats.total_runs
  const integrationDisplayTokens = integrationPanelStats.total_tokens
  const integrationDisplayCost = integrationPanelStats.total_cost_usd

  const errorCategoryEntries = Object.entries(
    errorSteps.reduce<Record<string, number>>((summary, step) => {
      const category = classifyErrorCategory(`${step.error_message ?? ''} ${step.detail}`)
      summary[category] = (summary[category] ?? 0) + 1
      return summary
    }, {})
  ).map(([category, count]) => [localizeErrorCategory(category as ErrorCategoryKey, locale), count] as const)

  const selectedTraceSummary = selectedTrace
    ? [
        { label: pickLocaleText(locale, 'Steps', '步骤数'), value: String(selectedTrace.step_count) },
        { label: pickLocaleText(locale, 'Tool Calls', '工具调用'), value: String(selectedTrace.tool_call_count) },
        { label: pickLocaleText(locale, 'Errors', '错误数'), value: String(selectedTrace.error_count) },
        { label: pickLocaleText(locale, 'Total Tokens', '总 Tokens'), value: String(selectedTrace.token_usage) },
        { label: pickLocaleText(locale, 'Input Tokens', '输入 Tokens'), value: String(selectedTrace.input_token_usage) },
        { label: pickLocaleText(locale, 'Output Tokens', '输出 Tokens'), value: String(selectedTrace.output_token_usage) },
        { label: pickLocaleText(locale, 'Cached Tokens', '缓存 Tokens'), value: String(selectedTrace.cached_token_usage) },
        { label: pickLocaleText(locale, 'Total Latency', '总延迟'), value: `${selectedTrace.total_latency_ms} ms` },
      ]
    : []

  const compareMetrics = selectedTrace && compareTrace
    ? [
        { label: 'Latency Δ', value: formatDelta(selectedTrace.total_latency_ms, compareTrace.total_latency_ms, ' ms') },
        { label: 'Steps Δ', value: formatDelta(selectedTrace.step_count, compareTrace.step_count) },
        { label: 'Errors Δ', value: formatDelta(selectedTrace.error_count, compareTrace.error_count) },
        { label: 'Tokens Δ', value: formatDelta(selectedTrace.token_usage, compareTrace.token_usage) },
        { label: 'Input Δ', value: formatDelta(selectedTrace.input_token_usage, compareTrace.input_token_usage) },
        { label: 'Output Δ', value: formatDelta(selectedTrace.output_token_usage, compareTrace.output_token_usage) },
        { label: 'Cached Δ', value: formatDelta(selectedTrace.cached_token_usage, compareTrace.cached_token_usage) },
      ]
    : []

  const trendCards = stats
    ? [
        { label: `最近 ${stats.time_range_days} 天运行`, value: String(stats.total_runs), hint: '自动汇总所选筛选条件下的运行量' },
        { label: '成功率', value: formatPercent(stats.total_runs ? (stats.completed_runs / stats.total_runs) * 100 : 0), hint: '客户最关心当前流程是否稳定' },
        { label: '趋势均值延迟', value: `${stats.avg_latency_ms} ms`, hint: '定位体验是否卡顿' },
        { label: '趋势总 Tokens', value: String(stats.total_tokens), hint: '观察成本和输出规模' },
      ]
    : []

  const traceChartConfig = stats ? {
    runs: {
      title: '运行量图表',
      subtitle: '按天观察运行次数变化',
      values: stats.timeline.map((point) => point.run_count),
      labels: stats.timeline.map((point) => point.date),
      formatter: (value: number) => String(value),
    },
    tokens: {
      title: 'Token 图表',
      subtitle: '按天观察 token 使用量',
      values: stats.timeline.map((point) => point.total_tokens),
      labels: stats.timeline.map((point) => point.date),
      formatter: (value: number) => String(value),
    },
    latency: {
      title: '延迟图表',
      subtitle: '按天观察平均延迟变化',
      values: stats.timeline.map((point) => point.avg_latency_ms),
      labels: stats.timeline.map((point) => point.date),
      formatter: (value: number) => `${value.toFixed(0)} ms`,
    },
  }[traceChartMetric] : null

  const integrationChartConfig = integrationPanelStats ? {
    runs: {
      title: '外部运行量',
      subtitle: selectedIntegrationSource ? `正在查看 ${selectedIntegrationSource.name} 的 run 记录` : '其它平台或自有 API 的 run 记录',
      values: integrationPanelStats.timeline.map((point) => point.run_count),
      labels: integrationPanelStats.timeline.map((point) => point.date),
      formatter: (value: number) => String(value),
    },
    tokens: {
      title: '外部 Token',
      subtitle: selectedIntegrationSource ? `正在查看 ${selectedIntegrationSource.name} 的 token 口径` : '统一汇总外部来源 token',
      values: integrationPanelStats.timeline.map((point) => point.token_usage),
      labels: integrationPanelStats.timeline.map((point) => point.date),
      formatter: (value: number) => String(value),
    },
    cost: {
      title: '外部成本',
      subtitle: selectedIntegrationSource ? `正在查看 ${selectedIntegrationSource.name} 的成本波动` : '按天观察外部成本波动',
      values: integrationPanelStats.timeline.map((point) => point.cost_usd),
      labels: integrationPanelStats.timeline.map((point) => point.date),
      formatter: (value: number) => formatCurrency(value),
    },
  }[integrationChartMetric] : null

  const promptBreakdownMax = Math.max(1, ...(stats?.prompt_version_breakdown.map((item) => item.count) ?? [0]))
  const providerBreakdownMax = Math.max(1, ...(stats?.provider_breakdown.map((item) => item.count) ?? [0]))
  const externalPlatformBreakdownMax = Math.max(1, ...(integrationPanelStats.platform_breakdown.map((item) => item.count) ?? [0]))
  const externalProviderBreakdownMax = Math.max(1, ...(integrationPanelStats.provider_breakdown.map((item) => item.count) ?? [0]))

  const chartWidth = 640
  const chartHeight = 220
  const traceChartValues = traceChartConfig?.values ?? []
  const traceChartMax = Math.max(1, ...(traceChartValues.length ? traceChartValues : [0]))
  const traceChartLine = buildLinePoints(traceChartValues, chartWidth - 40, 120)
  const integrationChartValues = integrationChartConfig?.values ?? []
  const integrationChartMax = Math.max(1, ...(integrationChartValues.length ? integrationChartValues : [0]))
  const integrationChartCoordinates = buildChartCoordinates(integrationChartValues, chartWidth, 120)
  const integrationChartLine = integrationChartCoordinates.map((point) => `${point.x},${point.y}`).join(' ')
  const activeTraceTooltipPoint = hoveredTracePoint ?? (stats && stats.timeline.length ? stats.timeline[stats.timeline.length - 1] : null)
  const activeExternalTooltipPoint = hoveredExternalPoint ?? (integrationPanelStats.timeline.length ? integrationPanelStats.timeline[integrationPanelStats.timeline.length - 1] : null)

  const customerInsights = [
    successRate >= 80
      ? pickLocaleText(locale, `Current success rate is ${formatPercent(successRate)}. The workspace is stable enough for a guided demo.`, `当前整体成功率 ${formatPercent(successRate)}，系统已具备演示级稳定性。`)
      : pickLocaleText(locale, `Current success rate is ${formatPercent(successRate)}. Failure handling and fallback paths still need more work.`, `当前整体成功率 ${formatPercent(successRate)}，还需要继续补失败处理和兜底逻辑。`),
    latestTrace
      ? pickLocaleText(locale, `The latest run is ${latestTrace.task_type} with status ${latestTrace.status}. Open the trace detail to review the chain.`, `最近一条运行是 ${latestTrace.task_type}，状态为 ${latestTrace.status}，可直接进入详情做复盘。`)
      : pickLocaleText(locale, 'No runs yet. Start with one of the scenario templates below to create the first trace.', '当前还没有运行数据，建议先使用下方场景模板发起第一条 trace。'),
    stats?.prompt_version_breakdown[0]
      ? pickLocaleText(locale, `The most used prompt version recently is ${stats.prompt_version_breakdown[0].key}, used ${stats.prompt_version_breakdown[0].count} times.`, `近期最常用的 Prompt 版本是 ${stats.prompt_version_breakdown[0].key}，共 ${stats.prompt_version_breakdown[0].count} 次。`)
      : pickLocaleText(locale, 'No prompt distribution is available under the current filters.', '当前筛选条件下没有 Prompt 分布数据。'),
    failedRuns
      ? pickLocaleText(locale, `${failedRuns} runs failed recently. Start with the error summary and compare panel.`, `最近累计失败 ${failedRuns} 次，建议优先查看错误摘要与 Compare 面板。`)
      : pickLocaleText(locale, 'No recent failed runs. This is a good time to compare prompts or models.', '最近没有失败运行，可以开始做 Prompt 或模型对比。'),
  ]

  const selectedTraceNarrative = selectedTrace
    ? selectedTrace.error_count
      ? pickLocaleText(locale, 'This run includes failed or exceptional steps. Start with the error categories and the failed timeline nodes.', '本次运行包含失败或异常步骤，优先查看错误分类和时间线中的失败节点。')
      : selectedTrace.token_usage > 700
        ? pickLocaleText(locale, 'This run succeeded, but the output cost is relatively high, so it is a good candidate for prompt or model cost comparison.', '本次运行成功，但输出成本偏高，适合拿去和其它 Prompt / Model 做成本效果对比。')
        : pickLocaleText(locale, 'This run completed stably and can be used as a customer demo or retrospective sample.', '本次运行稳定完成，适合作为客户演示或问题复盘样本。')
    : pickLocaleText(locale, 'Select a trace to generate a more readable run conclusion here.', '选择一条 trace 后，这里会自动生成可读性更强的运行结论。')

  const selectedTraceConfig = selectedTrace?.run_config_snapshot
  const selectedTraceConfigEntries = selectedTraceConfig ? [
    { label: 'Execution Mode', value: selectedTraceConfig.execution_mode },
    { label: 'Provider', value: selectedTraceConfig.provider },
    { label: 'Normalized Provider', value: selectedTraceConfig.normalized_provider ?? 'n/a' },
    { label: 'Model Name', value: selectedTraceConfig.model_name },
    { label: 'Prompt Version', value: selectedTraceConfig.prompt_version },
    { label: 'Base URL', value: selectedTraceConfig.base_url ?? 'n/a' },
    { label: 'Temperature', value: selectedTraceConfig.temperature !== undefined ? String(selectedTraceConfig.temperature) : 'n/a' },
    { label: 'API Key Env', value: selectedTraceConfig.api_key_env_name ?? 'n/a' },
  ] : []

  const integrationInsights = [
    connectorTemplates.length
      ? pickLocaleText(locale, `There are already ${connectorTemplates.length} connector templates, which is enough to prove the connect-and-sync product path.`, `当前已有 ${connectorTemplates.length} 个自动连接器模板，可以先用模拟同步把产品路径跑通。`)
      : pickLocaleText(locale, 'No connector template exists yet.', '当前还没有自动连接器模板。'),
    integrationSources.length
      ? pickLocaleText(locale, `${integrationSources.length} external sources are registered already, so Claude Code, custom APIs, and other platforms can be tracked together.`, `当前已经登记 ${integrationSources.length} 个外部来源，可统一沉淀 Claude Code、自有 API 或其它平台的使用量。`)
      : pickLocaleText(locale, 'No external source exists yet. Start by adding a Claude Code or custom API source.', '当前还没有外部来源，建议先在“接入来源”里登记一个 Claude Code 或自有 API。'),
    integrationDisplayRuns
      ? pickLocaleText(locale, `${integrationDisplayRuns} external runs and ${integrationDisplayTokens} tokens were aggregated in the last ${integrationPanelStats.time_range_days} days.`, `最近 ${integrationPanelStats.time_range_days} 天已汇总 ${integrationDisplayRuns} 次外部运行，累计 ${integrationDisplayTokens} tokens。`)
      : pickLocaleText(locale, 'No external usage record exists in the current time range.', '当前时间范围内还没有外部使用量记录。'),
    integrationPanelStats.platform_breakdown[0]
      ? pickLocaleText(locale, `${integrationPanelStats.platform_breakdown[0].key} is currently the busiest external platform.`, `当前外部运行最多的平台是 ${integrationPanelStats.platform_breakdown[0].key}。`)
      : pickLocaleText(locale, 'No platform breakdown is available yet.', '还没有平台分布可以分析。'),
    integrationDisplayCost
      ? pickLocaleText(locale, `External cost has reached ${formatCurrency(integrationDisplayCost)}, so cross-platform cost comparisons are now meaningful.`, `当前外部成本累计 ${formatCurrency(integrationDisplayCost)}，已经可以开始观察跨平台成本。`)
      : pickLocaleText(locale, 'No cost data is recorded yet. Start with tokens and run counts first.', '当前没有录入成本数据，可以先只录 token 和 run 数。'),
    externalUsageValidation?.unsupported_check_count
      ? pickLocaleText(locale, `${externalUsageValidation.unsupported_check_count} provider/model pairs are still missing official pricing snapshots, so conclusions should stay manual-review only.`, `当前还有 ${externalUsageValidation.unsupported_check_count} 组 provider/model 没有纳入官方价格快照，结论应标记为待人工核对。`)
      : pickLocaleText(locale, 'All provider/model pairs in the current window are covered by official pricing snapshots.', '当前时间窗内的 provider/model 都已进入官方价格快照，可直接查看偏差。'),
  ]

  const scoredTraceCount = traces.filter((trace) => Boolean(trace.quality_label)).length
  const passedTraceCount = traces.filter((trace) => trace.quality_label === 'pass').length
  const evaluationInsights = [
    evaluationSuites.length
      ? pickLocaleText(locale, `${evaluationSuites.length} evaluation suites already exist, so regression samples can start accumulating.`, `当前已有 ${evaluationSuites.length} 个评测集骨架，可以开始沉淀回归样本。`)
      : pickLocaleText(locale, 'No evaluation suite exists yet. Start with a minimal regression pack built from two or three real task inputs.', '当前还没有评测集，建议先用两三条真实任务输入搭一个最小回归集。'),
    evaluationRuns.length
      ? pickLocaleText(locale, `${evaluationRuns.length} evaluation runs already exist, so batch execution can be added next.`, `当前已有 ${evaluationRuns.length} 条评测运行骨架，后续可以直接接批量执行。`)
      : pickLocaleText(locale, 'No evaluation run exists yet. Start by creating one draft run.', '当前还没有评测运行骨架，建议先创建一条 draft run。'),
    scoredTraceCount
      ? pickLocaleText(locale, `${scoredTraceCount} traces have already been scored, and ${passedTraceCount} of them are marked pass.`, `当前已有 ${scoredTraceCount} 条 trace 被评分，其中 ${passedTraceCount} 条标记为 pass。`)
      : pickLocaleText(locale, 'No trace has been scored yet. Start from the most recent run.', '当前还没有 trace 评分记录，可以先从最近一条运行开始打分。'),
    auditEvents.length
      ? pickLocaleText(locale, `${auditEvents.length} audit events are already recorded, so allow/deny/review decision samples are accumulating.`, `当前已记录 ${auditEvents.length} 条审计事件，可以开始积累 allow / deny / review 决策样本。`)
      : pickLocaleText(locale, 'No audit event exists yet. Add one review record to a tool call first.', '当前还没有审计事件，建议先对一个工具调用补一条 review 记录。'),
    evaluationReviewQueue?.pending_count
      ? pickLocaleText(locale, `${evaluationReviewQueue.pending_count} pending review results remain in the queue and can be handled directly in Labs.`, `当前 review 队列里还有 ${evaluationReviewQueue.pending_count} 条待复核结果，可直接在实验室页处理。`)
      : pickLocaleText(locale, 'No pending review result remains in the queue.', '当前 review 队列里没有待复核结果。'),
    selectedEvaluationRun
      ? pickLocaleText(locale, `The selected evaluation run produced ${selectedEvaluationRun.result_count} case results with an average score of ${selectedEvaluationRun.average_score ?? 'n/a'}.`, `当前选中的评测运行已产出 ${selectedEvaluationRun.result_count} 条 case 结果，平均分 ${selectedEvaluationRun.average_score ?? 'n/a'}。`)
      : pickLocaleText(locale, 'Select an evaluation run to display case-level judge results here.', '选择一条评测运行后，这里会展示 case 级 judge 结果。'),
  ]

  const matrixBestRun = matrixResult?.created_runs.reduce((best, current) => {
    const currentScore = current.average_score ?? -1
    const bestScore = best?.average_score ?? -1
    return currentScore > bestScore ? current : best
  }, matrixResult.created_runs[0]) ?? null
  const matrixLowestRun = matrixResult?.created_runs.reduce((lowest, current) => {
    const currentScore = current.average_score ?? Number.POSITIVE_INFINITY
    const lowestScore = lowest?.average_score ?? Number.POSITIVE_INFINITY
    return currentScore < lowestScore ? current : lowest
  }, matrixResult.created_runs[0]) ?? null
  const matrixScoreSpread = matrixBestRun && matrixLowestRun && matrixBestRun.average_score !== null && matrixLowestRun.average_score !== null
    ? (matrixBestRun.average_score - matrixLowestRun.average_score).toFixed(2)
    : 'n/a'
  const selectedResult = selectedEvaluationRun?.results.find((result) => result.id === reviewForm.result_id) ?? null
  const selectedResultReviews = selectedEvaluationRun?.reviews.filter((review) => review.result_id === reviewForm.result_id) ?? []
  const selectedResultLatestReviewNote = selectedResultReviews[0]?.review_notes ?? null
  const runComparisonCandidates = selectedEvaluationRun
    ? evaluationRuns.filter((run) => run.id !== selectedEvaluationRun.id && run.suite_id === selectedEvaluationRun.suite_id)
    : []
  const comparisonChangedCount = runComparison?.rows.filter((row) => row.changed).length ?? 0
  const comparisonImprovedCount = runComparison?.rows.filter((row) => (row.score_delta ?? 0) > 0).length ?? 0
  const comparisonRegressedCount = runComparison?.rows.filter((row) => (row.score_delta ?? 0) < 0).length ?? 0
  const reviewQueueItems = evaluationReviewQueue?.items ?? []
  const selectedQueueItem = reviewQueueItems.find((item) => item.result_id === reviewForm.result_id) ?? null
  const connectorLookbackOptions = Array.from(new Set([1, 3, 7, ...connectorSyncJobs.map((job) => job.lookback_days)])).sort((left, right) => left - right)
  const experimentProviderOptions = experimentSummary
    ? ['all', ...Array.from(new Set(experimentSummary.run_columns.map((item) => item.provider)))]
    : ['all']
  const experimentPromptOptions = experimentSummary
    ? ['all', ...Array.from(new Set(experimentSummary.run_columns.map((item) => item.prompt_version)))]
    : ['all']
  const filteredExperimentRunColumns = experimentSummary?.run_columns.filter((column) => {
    const matchesProvider = experimentProviderFilter === 'all' ? true : column.provider === experimentProviderFilter
    const matchesPrompt = experimentPromptFilter === 'all' ? true : column.prompt_version === experimentPromptFilter
    return matchesProvider && matchesPrompt
  }) ?? []
  const filteredExperimentRunIds = new Set(filteredExperimentRunColumns.map((item) => item.run_id))
  const filteredExperimentMatrixRows = experimentSummary?.matrix_rows.filter((row) => {
    const matchesSearch = row.case_title.toLowerCase().includes(experimentCaseSearch.trim().toLowerCase())
    return matchesSearch
  }).map((row) => ({
    ...row,
    cells: row.cells.filter((cell) => filteredExperimentRunIds.has(cell.run_id)),
  })) ?? []
  const unresolvedConflictCount = reviewQueueItems.filter((item) => item.has_conflict && !item.adjudication_label).length
  const overdueReviewCount = reviewQueueItems.filter((item) => item.overdue).length

  const audienceProfiles = [
    {
      title: pickLocaleText(locale, 'AI application engineers / agent builders', 'AI 应用研发 / Agent 开发'),
      scenario: pickLocaleText(locale, 'Debug multi-step agents, prompt revisions, and tool-call failures.', '调试多步 Agent、Prompt 版本和工具调用失败。'),
      value: pickLocaleText(locale, 'Break a run into steps, error categories, tokens, and latency so issues can be isolated quickly.', '把一次运行拆成步骤、错误类别、token 和延迟，快速定位问题。'),
    },
    {
      title: pickLocaleText(locale, 'Quality engineering / test owners', '质量效能 / 测试工程师'),
      scenario: pickLocaleText(locale, 'Run regression checks and compare different models, prompts, and providers.', '做回归验证，对比不同模型、Prompt 和 provider。'),
      value: pickLocaleText(locale, 'Use trends, comparisons, and error summaries to judge whether the system became more stable, slower, or more expensive.', '用趋势、对比和错误摘要判断系统是否变稳、变慢或变贵。'),
    },
    {
      title: pickLocaleText(locale, 'Team leads / operators / cost owners', '负责人 / 运营 / 成本观察者'),
      scenario: pickLocaleText(locale, 'Combine internal runs with Claude Code and custom API usage in one view.', '把内部运行和 Claude Code、自有 API 的 usage 汇总到一起。'),
      value: pickLocaleText(locale, 'Track run volume, external cost, and operational risks without switching across platforms.', '同时看运行量、外部成本和风险点，不必在多个平台来回切换。'),
    },
  ]

  const valueGroups = [
    {
      title: pickLocaleText(locale, 'What this workspace answers', '它主要回答什么'),
      description: pickLocaleText(locale, 'It is not a chat replacement. It answers whether the run worked, why it failed, and where the cost went.', '不是替代聊天，而是回答“跑没跑通、为什么没跑通、成本花在哪”。'),
    },
    {
      title: pickLocaleText(locale, 'How to read internal runs', '内部运行怎么读'),
      description: pickLocaleText(locale, 'Use success rate, failure categories, the timeline, and compare views to judge whether the agent itself is stable.', '看成功率、失败分类、时间线和 compare 面板，判断 Agent 本身是否稳定。'),
    },
    {
      title: pickLocaleText(locale, 'How to read external usage', '外部平台怎么读'),
      description: pickLocaleText(locale, 'Review source, run count, tokens, and cost so Claude Code or custom gateway usage follows the same measurement model.', '看来源、run、token、cost，把 Claude Code 或自有网关 usage 放在统一口径下。'),
    },
  ]

  const workflowSteps = [
    { title: pickLocaleText(locale, 'Start with a scenario', '先定场景'), description: pickLocaleText(locale, 'Choose a customer scenario template so the goal is clearly debug, summary, or demo.', '选一个客户场景模板，明确是排错、总结还是演示。') },
    { title: pickLocaleText(locale, 'Review the run', '再看运行'), description: pickLocaleText(locale, 'Use the overview and trace screens to inspect success rate, latency, failed nodes, and token changes.', '用总览和追踪页判断成功率、延迟、失败节点和 token 变化。') },
    { title: pickLocaleText(locale, 'Finish with cost', '最后看成本'), description: pickLocaleText(locale, 'After importing external usage, validate whether cross-platform run, token, and cost numbers look reasonable.', '把外部 usage 导入后，再看跨平台 run / token / cost 是否合理。') },
  ]

  const overviewCategories = [
    { id: 'scenarios' as const, label: pickLocaleText(locale, 'Scenarios', '使用场景'), summary: pickLocaleText(locale, 'Start with who this workspace helps, when it should be used, and what questions it answers.', '先理解这个工具给谁用、在什么场景下用、能回答哪些问题。') },
    { id: 'traces' as const, label: pickLocaleText(locale, 'Internal Runs', '内部运行'), summary: pickLocaleText(locale, 'Focus on agent trace stability, failure reasons, and trends inside the system.', '聚焦内部 Agent trace 的稳定性、失败原因和趋势。') },
    { id: 'external' as const, label: pickLocaleText(locale, 'External Cost', '外部成本'), summary: pickLocaleText(locale, 'Focus on usage rollups from Claude Code, custom APIs, or other platforms.', '聚焦 Claude Code、自有 API 或其它平台的 usage 汇总。') },
  ]
  const activeOverviewCategory = overviewCategories.find((item) => item.id === overviewCategory) ?? overviewCategories[0]
  const recentExternalRecords = externalUsageRecords.slice(0, 3)

  const customerPlaybooks: CustomerPlaybook[] = [
    {
      id: 'issue-triage-template',
      title: pickLocaleText(locale, 'Issue Triage Template', '问题分诊模板'),
      description: pickLocaleText(locale, 'Start from the observed issue, expected result, and customer impact.', '从观测到的问题、预期结果和客户影响开始组织输入。'),
      userInput: pickLocaleText(locale, 'Describe the issue, the observed failure, the expected behavior, and the customer impact.', '描述问题、观测到的失败、预期行为以及客户影响。'),
      executionMode: 'llm',
      provider: 'deepseek',
      modelName: 'deepseek-chat',
      promptVersion: 'v2',
    },
    {
      id: 'incident-summary-template',
      title: pickLocaleText(locale, 'Incident Summary Template', '事件总结模板'),
      description: pickLocaleText(locale, 'Use this when you already have timeline, evidence, and stakeholder context.', '适用于你已经准备好时间线、证据和角色背景的情况。'),
      userInput: pickLocaleText(locale, 'Summarize the incident timeline, identify the probable root cause, and propose the next actions from the supplied evidence.', '基于提供的证据总结事件时间线、判断可能根因，并提出下一步动作。'),
      executionMode: 'llm',
      provider: 'deepseek',
      modelName: 'deepseek-chat',
      promptVersion: 'v1',
    },
    {
      id: 'workflow-review-template',
      title: pickLocaleText(locale, 'Workflow Review Template', '流程复盘模板'),
      description: pickLocaleText(locale, 'A no-API starter for reviewing steps, risks, and customer-facing summaries.', '不依赖外部 API，适合先复盘步骤、风险点和对客摘要。'),
      userInput: pickLocaleText(locale, 'Review the workflow steps, identify the riskiest stage, and produce a customer-facing summary.', '复盘工作流步骤，指出风险最高的阶段，并产出面向客户的摘要。'),
      executionMode: 'mock',
      provider: 'deepseek',
      modelName: 'deepseek-chat',
      promptVersion: 'v0',
    },
  ]

  useEffect(() => {
    setCurrentPage(1)
  }, [searchText, statusFilter, taskTypeFilter, providerFilter, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (!selectedTrace) {
      setCompareTraceId(null)
      setCompareTrace(null)
      return
    }

    const defaultCandidate = traces.find((trace) => trace.id !== selectedTrace.id && trace.task_type === selectedTrace.task_type)
      ?? traces.find((trace) => trace.id !== selectedTrace.id)

    if (!defaultCandidate) {
      setCompareTraceId(null)
      setCompareTrace(null)
      return
    }

    if (!compareTraceId || compareTraceId === selectedTrace.id) {
      void handleCompareTrace(defaultCandidate.id)
    }
  }, [selectedTrace, traces])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.set('lang', locale)
    window.history.replaceState({}, '', nextUrl.toString())
  }, [locale])

  const defaultSidebarSectionByView: Record<AppView, string> = {
    overview: 'overview-summary',
    traces: 'traces-workspace',
    integrations: 'integrations-sources',
    evaluations: 'evaluations-suites',
    labs: 'labs-scenarios',
  }

  const sidebarGroups = [
    {
      view: 'overview' as const,
      label: pickLocaleText(locale, 'Overview', '总览'),
      items: [
        { id: 'overview-summary', label: pickLocaleText(locale, 'Workspace Summary', '工作台总览') },
        { id: 'overview-launch', label: pickLocaleText(locale, 'Launch Scenario', '发起场景') },
        { id: 'overview-context', label: pickLocaleText(locale, 'Audience & Context', '适用对象与场景') },
      ],
    },
    {
      view: 'traces' as const,
      label: pickLocaleText(locale, 'Traces', '追踪页'),
      items: [
        { id: 'traces-workspace', label: pickLocaleText(locale, 'Trace Workspace', 'Trace 工作台') },
        { id: 'traces-detail', label: pickLocaleText(locale, 'Trace Detail', 'Trace 详情') },
      ],
    },
    {
      view: 'integrations' as const,
      label: pickLocaleText(locale, 'Integrations', '外部接入'),
      items: [
        { id: 'integrations-sources', label: pickLocaleText(locale, 'Source Setup', '来源配置') },
        { id: 'integrations-entry', label: pickLocaleText(locale, 'Usage Entry', '使用量录入') },
        { id: 'integrations-trends', label: pickLocaleText(locale, 'Usage Trends', '趋势与校验') },
      ],
    },
    {
      view: 'evaluations' as const,
      label: pickLocaleText(locale, 'Evaluations', '评测与审计'),
      items: [
        { id: 'evaluations-suites', label: pickLocaleText(locale, 'Suite Scaffold', '评测集骨架') },
        { id: 'evaluations-runs', label: pickLocaleText(locale, 'Run Scaffold', '评测运行骨架') },
        { id: 'evaluations-audit', label: pickLocaleText(locale, 'Scoring & Audit', '评分与审计') },
      ],
    },
    {
      view: 'labs' as const,
      label: pickLocaleText(locale, 'Labs', '场景实验室'),
      items: [
        { id: 'labs-scenarios', label: pickLocaleText(locale, 'Scenario Lab', '场景实验室') },
        { id: 'labs-matrix', label: pickLocaleText(locale, 'Matrix Evaluation', '矩阵评测') },
        { id: 'labs-review', label: pickLocaleText(locale, 'Review Workspace', '判分与复核') },
      ],
    },
  ]
  const activeSidebarGroup = sidebarGroups.find((group) => group.view === activeView) ?? sidebarGroups[0]

  function handleSidebarNavigate(view: AppView, sectionId?: string) {
    const nextSectionId = sectionId ?? defaultSidebarSectionByView[view]
    setActiveView(view)
    setActiveSidebarSectionId(nextSectionId)
    setPendingScrollTargetId(nextSectionId)
  }

  useEffect(() => {
    const nextDefaultSectionId = defaultSidebarSectionByView[activeView]
    if (!activeSidebarSectionId.startsWith(`${activeView}-`)) {
      setActiveSidebarSectionId(nextDefaultSectionId)
    }
  }, [activeSidebarSectionId, activeView])

  useEffect(() => {
    if (!pendingScrollTargetId || typeof document === 'undefined') {
      return
    }

    const target = document.getElementById(pendingScrollTargetId)
    if (!target) {
      return
    }

    // 等待目标视图渲染完成后再滚动，避免切换主视图时找不到对应区块。
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setPendingScrollTargetId(null)
  }, [activeView, pendingScrollTargetId])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return
    }

    const sectionElements = activeSidebarGroup.items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => element instanceof HTMLElement)

    if (!sectionElements.length) {
      return
    }

    // 用可见高度和距离顶部的组合来判断“当前读到哪一段”，比只看点击状态更符合侧边目录预期。
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => {
            if (right.intersectionRatio !== left.intersectionRatio) {
              return right.intersectionRatio - left.intersectionRatio
            }
            return Math.abs(left.boundingClientRect.top) - Math.abs(right.boundingClientRect.top)
          })

        if (!visibleEntries.length) {
          return
        }

        const nextSectionId = visibleEntries[0].target.id
        setActiveSidebarSectionId((current) => (current === nextSectionId ? current : nextSectionId))
      },
      {
        root: null,
        rootMargin: '-10% 0px -55% 0px',
        threshold: [0.2, 0.45, 0.7],
      },
    )

    sectionElements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [activeView])

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">{pickLocaleText(locale, 'Customer-Facing Agent Ops', '客户视角 Agent 运维台')}</p>
          <h1 className="app-title">Agent Trace Viewer</h1>
          <p className="app-subtitle">{pickLocaleText(locale, 'Bring internal agent runs, external API usage, and cross-platform token cost into one workspace.', '把内部 Agent 运行、外部 API 使用量和跨平台 token 成本收进同一个工作台。')}</p>
        </div>
        <div className="app-header__actions">
          <div className="locale-toggle" aria-label="Language switch">
            <button className={locale === 'en' ? 'app-nav__button app-nav__button--active' : 'app-nav__button'} onClick={() => setLocale('en')} type="button">EN</button>
            <button className={locale === 'zh' ? 'app-nav__button app-nav__button--active' : 'app-nav__button'} onClick={() => setLocale('zh')} type="button">中文</button>
          </div>
        </div>
      </header>

      <div className="app-layout">
        <aside className="app-sidebar panel" aria-label="Workspace navigation">
          <div className="app-sidebar__header">
            <span className="section-kicker">{pickLocaleText(locale, 'Navigate', '导航')}</span>
            <h2>{pickLocaleText(locale, 'Workspace Map', '工作台目录')}</h2>
          </div>
          <nav className="app-sidebar__nav" aria-label="Primary and secondary navigation">
            {sidebarGroups.map((group) => (
              <section key={group.view} className="app-sidebar__group">
                <button
                  className={activeView === group.view ? 'app-sidebar__primary app-sidebar__primary--active' : 'app-sidebar__primary'}
                  onClick={() => handleSidebarNavigate(group.view)}
                  type="button"
                >
                  {group.label}
                </button>
                {activeView === group.view ? (
                  <div className="app-sidebar__secondary-list">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        className={activeSidebarSectionId === item.id ? 'app-sidebar__secondary app-sidebar__secondary--active' : 'app-sidebar__secondary'}
                        onClick={() => handleSidebarNavigate(group.view, item.id)}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </nav>
        </aside>

        <div className="app-content">

      {activeView === 'overview' ? (
        <>
          <section className="hero-card hero-card--split" id="overview-summary">
            <div className="hero-intro">
              <h2 className="hero-headline">{pickLocaleText(locale, 'Help customers understand the outcome of an agent system, not just the raw debug fields.', '让客户从结果视角理解 Agent，而不是盯着调试字段。')}</h2>
              <p className="hero-copy">
                {pickLocaleText(locale, 'This workspace turns one agent run into something observable, explainable, and comparable: start from a task, then review stability, trends, failure causes, and external token and cost signals in one place.', '这个工作台会把一次 Agent 运行自动转成可观察、可解释、可对比的视图：先发起任务，再看稳定性、趋势、失败原因，并把外部平台的 token 与成本统一汇总进来。')}
              </p>

              <div className="hero-kpi-grid">
                <article className="hero-kpi-card hero-kpi-card--primary">
                  <span>{pickLocaleText(locale, 'Total Runs', '总运行数')}</span>
                  <strong>{traces.length}</strong>
                  <small>{pickLocaleText(locale, 'Covers both mock and real LLM execution paths', '覆盖 mock 和真实 LLM 两类执行路径')}</small>
                </article>
                <article className="hero-kpi-card">
                  <span>{pickLocaleText(locale, 'Success Rate', '整体成功率')}</span>
                  <strong>{formatPercent(successRate)}</strong>
                  <small>{completedRuns} completed / {traces.length || 0} total</small>
                </article>
                <article className="hero-kpi-card">
                  <span>{pickLocaleText(locale, 'Average Latency', '平均延迟')}</span>
                  <strong>{averageLatency} ms</strong>
                  <small>{pickLocaleText(locale, 'Aggregated from historical traces', '从历史 trace 自动聚合')}</small>
                </article>
                <article className="hero-kpi-card">
                  <span>{pickLocaleText(locale, 'External Tokens', '外部 Tokens')}</span>
                  <strong>{integrationTokens}</strong>
                  <small>{pickLocaleText(locale, 'Aggregated across Claude Code, custom APIs, and other platforms', '聚合 Claude Code / 自有 API / 其它平台')}</small>
                </article>
              </div>

              <section className="insight-panel">
                <div className="panel__header panel__header--compact">
                  <h3>{pickLocaleText(locale, 'Auto Insights', '自动结论')}</h3>
                  <span>{pickLocaleText(locale, 'Customer-facing summary', '给客户看的摘要')}</span>
                </div>
                <div className="insight-list">
                  {customerInsights.map((item) => (
                    <article key={item} className="insight-card">
                      <p>{item}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <div className="hero-workbench" id="overview-launch">
              <form className="trace-form" onSubmit={handleSubmit}>
                <div className="trace-form__heading">
                  <div>
                    <span className="section-kicker">{pickLocaleText(locale, 'Launch', '发起')}</span>
                    <h2>{pickLocaleText(locale, 'Launch a customer scenario', '发起客户场景')}</h2>
                  </div>
                  <button disabled={loading} type="submit">
                    {loading ? pickLocaleText(locale, 'Running...', '运行中...') : pickLocaleText(locale, 'Run Trace', '运行 Trace')}
                  </button>
                </div>

                <label htmlFor="user-input">{pickLocaleText(locale, 'Task Input', '任务输入')}</label>
                <textarea
                  id="user-input"
                  value={userInput}
                  onChange={(event) => setUserInput(event.target.value)}
                  placeholder={pickLocaleText(locale, 'Describe the real task, issue, or workflow you want the agent to analyze.', '输入真实任务、问题或需要 Agent 复盘的工作流。')}
                  rows={5}
                />

                <div className="playbook-grid">
                  {customerPlaybooks.map((playbook) => (
                    <button key={playbook.id} className="playbook-card" onClick={() => applyPlaybook(playbook)} type="button">
                      <strong>{playbook.title}</strong>
                      <span>{playbook.description}</span>
                      <small>{playbook.executionMode} · {playbook.promptVersion}</small>
                    </button>
                  ))}
                </div>

                <div className="trace-form__grid">
                  <label className="trace-form__field">
                    <span>{pickLocaleText(locale, 'Execution Mode', '执行模式')}</span>
                    <select value={executionMode} onChange={(event) => setExecutionMode(event.target.value as ExecutionMode)}>
                      <option value="mock">mock</option>
                      <option value="llm">llm</option>
                    </select>
                  </label>
                  <label className="trace-form__field">
                    <span>{pickLocaleText(locale, 'Provider', '服务提供方')}</span>
                    <input value={provider} onChange={(event) => setProvider(event.target.value)} />
                  </label>
                  <label className="trace-form__field">
                    <span>{pickLocaleText(locale, 'Model Name', '模型名称')}</span>
                    <input value={modelName} onChange={(event) => setModelName(event.target.value)} />
                  </label>
                  <label className="trace-form__field">
                    <span>{pickLocaleText(locale, 'Prompt Version', 'Prompt 版本')}</span>
                    <select
                      value={promptVersion}
                      onChange={(event) => {
                        const nextVersion = event.target.value
                        setPromptVersion(nextVersion)
                        const nextPrompt = pickPromptOption(promptVersions, nextVersion)
                        if (nextPrompt) {
                          setModelName(nextPrompt.recommended_model)
                        }
                      }}
                    >
                      {promptVersions.map((option) => (
                        <option key={option.version} value={option.version}>
                          {option.version} · {getLocalizedPromptCopy(option, locale).label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </form>

              {selectedPromptOption ? (
                <section className="prompt-version-panel">
                  <div className="panel__header panel__header--compact prompt-version-panel__header">
                    <div>
                      <strong>{localizedSelectedPrompt?.label}</strong>
                      <p>{localizedSelectedPrompt?.description}</p>
                    </div>
                    <span className="prompt-version-panel__version">{pickLocaleText(locale, `Editing ${selectedPromptOption.version}`, `正在编辑 ${selectedPromptOption.version}`)}</span>
                  </div>
                  <div className="prompt-version-panel__tags">
                    <span>{pickLocaleText(locale, 'Focus', '侧重点')}: {localizedSelectedPrompt?.focus}</span>
                    <span>{pickLocaleText(locale, 'Recommended', '推荐模型')}: {selectedPromptOption.recommended_model}</span>
                  </div>
                  <form className="prompt-editor" onSubmit={handleSavePromptVersion}>
                    <label className="trace-form__field">
                      <span>{pickLocaleText(locale, 'English Label', '英文标签')}</span>
                      <input value={promptEditorForm.label} onChange={(event) => setPromptEditorForm((current) => ({ ...current, label: event.target.value }))} />
                    </label>
                    <label className="trace-form__field">
                      <span>{pickLocaleText(locale, 'Chinese Label', '中文标签')}</span>
                      <input value={promptEditorForm.label_zh} onChange={(event) => setPromptEditorForm((current) => ({ ...current, label_zh: event.target.value }))} />
                    </label>
                    <label className="trace-form__field">
                      <span>{pickLocaleText(locale, 'Recommended Model', '推荐模型')}</span>
                      <input value={promptEditorForm.recommended_model} onChange={(event) => setPromptEditorForm((current) => ({ ...current, recommended_model: event.target.value }))} />
                    </label>
                    <label className="trace-form__field">
                      <span>{pickLocaleText(locale, 'English Focus', '英文侧重点')}</span>
                      <input value={promptEditorForm.focus} onChange={(event) => setPromptEditorForm((current) => ({ ...current, focus: event.target.value }))} />
                    </label>
                    <label className="trace-form__field">
                      <span>{pickLocaleText(locale, 'Chinese Focus', '中文侧重点')}</span>
                      <input value={promptEditorForm.focus_zh} onChange={(event) => setPromptEditorForm((current) => ({ ...current, focus_zh: event.target.value }))} />
                    </label>
                    <label className="trace-form__field prompt-editor__field--wide">
                      <span>{pickLocaleText(locale, 'English Description', '英文描述')}</span>
                      <textarea value={promptEditorForm.description} onChange={(event) => setPromptEditorForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
                    </label>
                    <label className="trace-form__field prompt-editor__field--wide">
                      <span>{pickLocaleText(locale, 'Chinese Description', '中文描述')}</span>
                      <textarea value={promptEditorForm.description_zh} onChange={(event) => setPromptEditorForm((current) => ({ ...current, description_zh: event.target.value }))} rows={3} />
                    </label>
                    <label className="trace-form__field prompt-editor__field--wide">
                      <span>{pickLocaleText(locale, 'English System Prompt', '英文系统 Prompt')}</span>
                      <textarea value={promptEditorForm.system_prompt} onChange={(event) => setPromptEditorForm((current) => ({ ...current, system_prompt: event.target.value }))} rows={5} />
                    </label>
                    <label className="trace-form__field prompt-editor__field--wide">
                      <span>{pickLocaleText(locale, 'Chinese System Prompt', '中文系统 Prompt')}</span>
                      <textarea value={promptEditorForm.system_prompt_zh} onChange={(event) => setPromptEditorForm((current) => ({ ...current, system_prompt_zh: event.target.value }))} rows={5} />
                    </label>
                    <div className="detail-actions">
                      <button disabled={promptSaving} type="submit">
                        {promptSaving ? pickLocaleText(locale, 'Saving Prompt...', '保存 Prompt 中...') : pickLocaleText(locale, 'Save Prompt Version', '保存 Prompt 版本')}
                      </button>
                      <span className="placeholder-text">{pickLocaleText(locale, 'Changes are persisted to the backend JSON registry with both English and Chinese fields, so each language mode keeps its own prompt copy.', '改动会以中英文字段一起持久化到后端 JSON 注册表，英文模式和中文模式会各自使用自己的 Prompt 文案。')}</span>
                    </div>
                  </form>
                </section>
              ) : null}

              <div className="detail-actions detail-actions--hero">
                <button className="secondary-button" disabled={seedingDemo} onClick={() => void handleSeedDemoData(selectedDemoScenarioId)} type="button">
                  {seedingDemo ? pickLocaleText(locale, 'Seeding Demo...', '注入演示数据中...') : pickLocaleText(locale, 'Seed Demo Scenario Data', '注入 Demo 场景数据')}
                </button>
                <span className="placeholder-text">{pickLocaleText(locale, 'Create demo traces, evaluation suites, runs, and audit events in one step.', '一键生成演示 trace、评测集、评测运行和审计事件。')}</span>
              </div>

              {error ? <p className="error-banner">{error}</p> : null}
            </div>
          </section>

          <section className="panel context-panel" id="overview-context">
            <div className="panel__header">
              <div>
                <span className="section-kicker">{pickLocaleText(locale, 'Orient', '定位')}</span>
                <h2>{pickLocaleText(locale, 'Who this workspace is for and what it helps them do', '这个工作台适合谁，以及它能解决什么问题')}</h2>
              </div>
              <span>{activeOverviewCategory.label}</span>
            </div>

            <div className="context-grid">
              {audienceProfiles.map((profile) => (
                <article key={profile.title} className="context-card">
                  <strong>{profile.title}</strong>
                  <p>{profile.scenario}</p>
                  <small>{profile.value}</small>
                </article>
              ))}
            </div>

            <div className="category-switch" role="tablist" aria-label="Overview category">
              {overviewCategories.map((item) => (
                <button
                  key={item.id}
                  className={overviewCategory === item.id ? 'category-switch__button category-switch__button--active' : 'category-switch__button'}
                  onClick={() => setOverviewCategory(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <p className="context-lead">{activeOverviewCategory.summary}</p>
          </section>

          {overviewCategory === 'scenarios' ? (
            <section className="panel overview-secondary-grid">
              <section className="integration-summary-card">
                <div className="panel__header panel__header--compact">
                  <h3>{pickLocaleText(locale, 'Core Value', '核心作用')}</h3>
                  <span>{pickLocaleText(locale, 'Start with purpose, then move into the data', '先看目的，再看数据')}</span>
                </div>
                <div className="context-grid context-grid--compact">
                  {valueGroups.map((item) => (
                    <article key={item.title} className="context-card context-card--compact">
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="integration-summary-card">
                <div className="panel__header panel__header--compact">
                  <h3>{pickLocaleText(locale, 'Suggested Reading Order', '建议使用顺序')}</h3>
                  <span>{pickLocaleText(locale, 'This sequence makes the page easier to explain', '按这个顺序读页面更清晰')}</span>
                </div>
                <div className="context-grid context-grid--compact">
                  {workflowSteps.map((item) => (
                    <article key={item.title} className="context-card context-card--compact">
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </article>
                  ))}
                </div>
              </section>
            </section>
          ) : null}

          {overviewCategory === 'traces' ? (
            <section className="panel trend-panel">
            <div className="panel__header">
              <div>
                <span className="section-kicker">Observe</span>
                <h2>{pickLocaleText(locale, 'Run Trend Overview', '运行趋势总览')}</h2>
              </div>
              <div className="panel__header-actions">
                <select className="trace-filter trend-panel__range" value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}>
                  {providerFilterOptions.map((option) => (
                    <option key={option} value={option}>{option === 'all' ? 'All Providers' : option}</option>
                  ))}
                </select>
                <select className="trace-filter trend-panel__range" value={traceChartMetric} onChange={(event) => setTraceChartMetric(event.target.value as TraceChartMetric)}>
                  <option value="runs">{pickLocaleText(locale, 'By Runs', '按运行量')}</option>
                  <option value="tokens">{pickLocaleText(locale, 'By Tokens', '按 Tokens')}</option>
                  <option value="latency">{pickLocaleText(locale, 'By Latency', '按延迟')}</option>
                </select>
                <select className="trace-filter trend-panel__range" value={timeRangeDays} onChange={(event) => setTimeRangeDays(Number(event.target.value))}>
                  <option value={3}>Last 3 days</option>
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                </select>
              </div>
            </div>

            <div className="trend-panel__cards">
              {trendCards.map((item) => (
                <article key={item.label} className="detail-metric-card detail-metric-card--glow">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.hint}</small>
                </article>
              ))}
            </div>

            {stats && traceChartConfig ? (
              <div className="trend-visual-grid">
                <section className="trend-visual-card">
                  <div className="trend-visual-card__header">
                    <div>
                      <h3>{traceChartConfig.title}</h3>
                      <span>{traceChartConfig.subtitle}</span>
                    </div>
                  </div>
                  <svg className="trend-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={traceChartConfig.title}>
                    <line x1="20" y1={chartHeight - 20} x2={chartWidth - 10} y2={chartHeight - 20} className="trend-chart__axis" />
                    {traceChartConfig.values.map((value, index) => {
                      const point = stats.timeline[index]
                      const slotWidth = (chartWidth - 60) / Math.max(traceChartConfig.values.length, 1)
                      const barHeight = (value / traceChartMax) * (chartHeight - 60)
                      const x = 24 + index * slotWidth
                      const y = chartHeight - 20 - barHeight
                      const barWidth = Math.max(20, slotWidth - 12)
                      return (
                        <g key={traceChartConfig.labels[index]}>
                          <rect
                            className={hoveredTracePoint?.date === point.date ? 'trend-chart__bar trend-chart__bar--active' : 'trend-chart__bar'}
                            height={barHeight}
                            rx="10"
                            width={barWidth}
                            x={x}
                            y={y}
                            onMouseEnter={() => setHoveredTracePoint(point)}
                            onMouseLeave={() => setHoveredTracePoint(null)}
                          >
                            <title>{`${point.date}: ${traceChartConfig.formatter(value)}`}</title>
                          </rect>
                          <text className="trend-chart__label" x={x + barWidth / 2} y={chartHeight - 4}>{traceChartConfig.labels[index].slice(5)}</text>
                          <text className="trend-chart__value" x={x + barWidth / 2} y={Math.max(18, y - 8)}>{traceChartConfig.formatter(value)}</text>
                        </g>
                      )
                    })}
                  </svg>
                  {activeTraceTooltipPoint ? (
                    <div className="chart-tooltip">
                      <strong>{activeTraceTooltipPoint.date}</strong>
                      <span>{activeTraceTooltipPoint.run_count} runs</span>
                      <span>{activeTraceTooltipPoint.completed_count} completed</span>
                      <span>{activeTraceTooltipPoint.failed_count} failed</span>
                      <span>{activeTraceTooltipPoint.avg_latency_ms} ms avg</span>
                      <span>{activeTraceTooltipPoint.total_tokens} tokens</span>
                    </div>
                  ) : null}
                </section>

                <section className="trend-visual-card">
                  <div className="trend-visual-card__header">
                    <div>
                      <h3>{pickLocaleText(locale, 'Line Trend', '折线走势')}</h3>
                      <span>{pickLocaleText(locale, 'Daily movement within the selected window.', '时间窗口内逐日变化')}</span>
                    </div>
                  </div>
                  <svg className="trend-chart trend-chart--line" viewBox={`0 0 ${chartWidth} 120`} role="img" aria-label="Trace line chart">
                    <polyline className="trend-chart__line-shadow" points={traceChartLine} />
                    <polyline className="trend-chart__line" points={traceChartLine} />
                    {stats.timeline.map((point, index) => {
                      const x = stats.timeline.length === 1 ? (chartWidth - 40) / 2 : 20 + (index / Math.max(stats.timeline.length - 1, 1)) * (chartWidth - 40)
                      const y = 120 - (traceChartConfig.values[index] / traceChartMax) * 120
                      return (
                        <circle
                          key={point.date}
                          className={hoveredTracePoint?.date === point.date ? 'trend-chart__point trend-chart__point--active' : 'trend-chart__point'}
                          cx={x}
                          cy={y}
                          r="5"
                          onMouseEnter={() => setHoveredTracePoint(point)}
                          onMouseLeave={() => setHoveredTracePoint(null)}
                        >
                          <title>{`${point.date}: ${traceChartConfig.formatter(traceChartConfig.values[index])}`}</title>
                        </circle>
                      )
                    })}
                  </svg>
                  <div className="trend-timeline trend-timeline--compact">
                    {stats.timeline.map((point) => (
                      <article key={point.date} className="trend-timeline__item trend-timeline__item--stacked">
                        <strong>{point.date}</strong>
                        <span>{point.run_count} runs</span>
                        <span>{point.completed_count} completed</span>
                        <span>{point.failed_count} failed</span>
                        <span>{point.avg_latency_ms} ms avg</span>
                        <span>{point.total_tokens} tokens</span>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="trend-breakdown-card trend-breakdown-card--wide">
                    <h3>{pickLocaleText(locale, 'Prompt Breakdown', 'Prompt 分布')}</h3>
                  {stats.prompt_version_breakdown.map((item) => (
                    <div key={item.key} className="breakdown-row">
                      <div className="breakdown-row__label">
                        <strong>{item.key}</strong>
                        <span>{item.count} runs</span>
                      </div>
                      <div className="breakdown-row__bar-track">
                        <div className="breakdown-row__bar" style={{ width: `${(item.count / promptBreakdownMax) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </section>

                <section className="trend-breakdown-card trend-breakdown-card--wide">
                    <h3>{pickLocaleText(locale, 'Provider Breakdown', 'Provider 分布')}</h3>
                  {stats.provider_breakdown.map((item) => (
                    <div key={item.key} className="breakdown-row">
                      <div className="breakdown-row__label">
                        <strong>{item.key}</strong>
                        <span>{item.count} runs</span>
                      </div>
                      <div className="breakdown-row__bar-track">
                        <div className="breakdown-row__bar breakdown-row__bar--secondary" style={{ width: `${(item.count / providerBreakdownMax) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </section>
              </div>
            ) : (
              <p className="placeholder-text">Loading trend statistics...</p>
            )}
            </section>
          ) : null}

          {overviewCategory === 'traces' ? (
            <section className="panel overview-secondary-grid">
            <section className="integration-summary-card">
              <div className="panel__header panel__header--compact">
                <h3>{pickLocaleText(locale, 'External Platform Summary', '外部平台汇总')}</h3>
                <button className="secondary-button" onClick={() => setActiveView('integrations')} type="button">{pickLocaleText(locale, 'Open Integrations', '去接入页')}</button>
              </div>
              <div className="integration-summary-grid">
                <article className="detail-metric-card">
                  <span>{pickLocaleText(locale, 'External Runs', '外部运行')}</span>
                  <strong>{integrationRuns}</strong>
                </article>
                <article className="detail-metric-card">
                  <span>外部 Tokens</span>
                  <strong>{integrationTokens}</strong>
                </article>
                <article className="detail-metric-card">
                  <span>{pickLocaleText(locale, 'External Cost', '外部成本')}</span>
                  <strong>{formatCurrency(integrationCost)}</strong>
                </article>
              </div>
              <div className="insight-list insight-list--compact">
                {integrationInsights.map((item) => (
                  <article key={item} className="insight-card">
                    <p>{item}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="integration-summary-card">
              <div className="panel__header panel__header--compact">
                <h3>{pickLocaleText(locale, 'Latest Successful Sample', '最近成功样本')}</h3>
                <button className="secondary-button" onClick={() => setActiveView('traces')} type="button">{pickLocaleText(locale, 'Open Traces', '去追踪页')}</button>
              </div>
              {latestCompletedTrace ? (
                <div className="latest-trace-card">
                  <strong>{latestCompletedTrace.id}</strong>
                  <p>{truncateText(latestCompletedTrace.task_input, 180)}</p>
                  <div className="trace-list__item-metadata">
                    <span>{latestCompletedTrace.provider}</span>
                    <span>{latestCompletedTrace.model_name}</span>
                    <span>{latestCompletedTrace.prompt_version}</span>
                  </div>
                </div>
              ) : (
                <p className="placeholder-text">{pickLocaleText(locale, 'No successful sample yet.', '还没有成功样本。')}</p>
              )}
            </section>
            </section>
          ) : null}

          {overviewCategory === 'external' ? (
            <section className="panel overview-secondary-grid">
              <section className="integration-summary-card">
                <div className="panel__header panel__header--compact">
                  <h3>{pickLocaleText(locale, 'External Platform Summary', '外部平台汇总')}</h3>
                  <button className="secondary-button" onClick={() => setActiveView('integrations')} type="button">{pickLocaleText(locale, 'Open Integrations', '去接入页')}</button>
                </div>
                <div className="integration-summary-grid">
                  <article className="detail-metric-card">
                    <span>{pickLocaleText(locale, 'External Runs', '外部运行')}</span>
                    <strong>{integrationRuns}</strong>
                  </article>
                  <article className="detail-metric-card">
                    <span>外部 Tokens</span>
                    <strong>{integrationTokens}</strong>
                  </article>
                  <article className="detail-metric-card">
                    <span>{pickLocaleText(locale, 'External Cost', '外部成本')}</span>
                    <strong>{formatCurrency(integrationCost)}</strong>
                  </article>
                </div>
                <div className="insight-list insight-list--compact">
                  {integrationInsights.map((item) => (
                    <article key={item} className="insight-card">
                      <p>{item}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="integration-summary-card">
                <div className="panel__header panel__header--compact">
                  <h3>{pickLocaleText(locale, 'Latest External Records', '最近外部记录')}</h3>
                  <span>{integrationRefreshing ? pickLocaleText(locale, 'Refreshing...', '刷新中...') : `${externalUsageRecords.length} ${pickLocaleText(locale, 'records', '条记录')}`}</span>
                </div>
                <div className="source-list">
                  {recentExternalRecords.map((record) => (
                    <article key={record.id} className="source-card">
                      <div className="trace-list__item-topline">
                        <strong>{record.source_name}</strong>
                        <span className="trace-status-badge">{record.platform_name}</span>
                      </div>
                      <p>{record.model_name} · {record.run_count} runs · {record.token_usage} tokens</p>
                      <small>{formatCurrency(record.cost_usd)} · {new Date(record.recorded_at).toLocaleString()}</small>
                    </article>
                  ))}
                  {!recentExternalRecords.length ? <p className="placeholder-text">{pickLocaleText(locale, 'No external usage record exists yet. Enter one manually or import JSON in Integrations.', '还没有外部使用记录，可以去接入页手动录入或导入 JSON。')}</p> : null}
                </div>
              </section>
            </section>
          ) : null}
        </>
      ) : null}

      {activeView === 'traces' ? (
        <section className="content-grid content-grid--fullpage">
          <aside className="panel panel--list" id="traces-workspace">
            <div className="panel__header">
              <div>
                <span className="section-kicker">Explore</span>
                <h2>{pickLocaleText(locale, 'Trace Workspace', 'Trace 工作台')}</h2>
              </div>
              <span>{filteredTraces.length} runs</span>
            </div>

            <div className="panel__toolbar panel__toolbar--dense">
              <input
                aria-label="Filter traces"
                className="trace-filter"
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search by trace id, type, provider, or step title"
                value={searchText}
              />
              <select className="trace-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TraceStatusFilter)}>
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
              <select className="trace-filter" value={taskTypeFilter} onChange={(event) => setTaskTypeFilter(event.target.value as TraceTaskTypeFilter)}>
                {taskTypeOptions.map((option) => (
                  <option key={option} value={option}>{option === 'all' ? 'All Types' : option}</option>
                ))}
              </select>
              <select className="trace-filter" value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}>
                {providerFilterOptions.map((option) => (
                  <option key={option} value={option}>{option === 'all' ? 'All Providers' : option}</option>
                ))}
              </select>
              <select className="trace-filter" value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))}>
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={String(option)}>{option} / page</option>
                ))}
              </select>
              <button className="secondary-button" onClick={() => void refreshTraces()} type="button">
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            <div className="trace-list">
              {paginatedTraces.map((trace) => (
                <button
                  key={trace.id}
                  className={selectedTraceId === trace.id ? 'trace-list__item trace-list__item--active' : 'trace-list__item'}
                  onClick={() => void handleSelectTrace(trace.id)}
                  type="button"
                >
                  <div className="trace-list__item-topline">
                    <strong>{trace.task_type}</strong>
                    <span className={`trace-status-badge trace-status-badge--${getStatusTone(trace.status)}`}>{trace.status}</span>
                  </div>
                  <span className="trace-list__item-id">{trace.id}</span>
                  <p>{truncateText(trace.task_input, 92)}</p>
                  <div className="trace-list__item-metrics">
                    <span>{trace.step_count} steps</span>
                    <span>{trace.tool_call_count} tools</span>
                    <span>{trace.error_count} errors</span>
                    <span>{trace.token_usage} tokens</span>
                  </div>
                  <div className="trace-list__item-metadata">
                    <span>{trace.execution_mode}</span>
                    <span>{trace.provider}</span>
                    <span>{trace.model_name}</span>
                  </div>
                  <small>{trace.latest_step_title ?? 'No step summary yet'}</small>
                </button>
              ))}
              {!filteredTraces.length ? <p className="placeholder-text">No traces match the current filter.</p> : null}
              {filteredTraces.length ? (
                <div className="pagination-row">
                  <button className="secondary-button" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} type="button">
                    Prev
                  </button>
                  <span>Page {currentPage} / {totalPages}</span>
                  <button className="secondary-button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} type="button">
                    Next
                  </button>
                </div>
              ) : null}
            </div>
          </aside>

          <section className="panel panel--detail" id="traces-detail">
            <div className="panel__header">
              <div>
                <span className="section-kicker">Explain</span>
                <h2>Trace Detail</h2>
              </div>
              <span>{selectedTrace ? selectedTrace.status : 'No trace selected'}</span>
            </div>
            {selectedTrace ? (
              <>
                <div className="detail-actions">
                  <button className="secondary-button" disabled={replayingTrace} onClick={() => void handleReplayTrace()} type="button">
                    {replayingTrace ? 'Replaying...' : 'Replay Run'}
                  </button>
                  <button className="secondary-button" onClick={() => exportTraceAsMarkdown(selectedTrace)} type="button">
                    Export Markdown
                  </button>
                  <button className="secondary-button" onClick={() => exportTraceAsJson(selectedTrace)} type="button">
                    Export JSON
                  </button>
                </div>

                <section className="detail-story-card">
                  <span className="section-kicker">Customer Summary</span>
                  <p>{selectedTraceNarrative}</p>
                </section>

                <div className="detail-summary-grid">
                  <article className="detail-summary-card detail-summary-card--wide">
                    <span>Trace ID</span>
                    <strong>{selectedTrace.id}</strong>
                    <small>{new Date(selectedTrace.created_at).toLocaleString()}</small>
                  </article>
                  <article className="detail-summary-card">
                    <span>Task Type</span>
                    <strong>{selectedTrace.task_type}</strong>
                  </article>
                  <article className="detail-summary-card">
                    <span>Execution Mode</span>
                    <strong>{selectedTrace.execution_mode}</strong>
                  </article>
                  <article className="detail-summary-card">
                    <span>Provider</span>
                    <strong>{selectedTrace.provider}</strong>
                  </article>
                  <article className="detail-summary-card">
                    <span>Model Name</span>
                    <strong>{selectedTrace.model_name}</strong>
                  </article>
                  <article className="detail-summary-card">
                    <span>Prompt Version</span>
                    <strong>{selectedTrace.prompt_version}</strong>
                  </article>
                  <article className="detail-summary-card">
                    <span>Quality</span>
                    <strong>{selectedTrace.quality_label ?? 'unrated'}</strong>
                    <small>{selectedTrace.quality_score !== null ? `${selectedTrace.quality_score} / 100` : 'No score yet'}</small>
                  </article>
                  <article className="detail-summary-card">
                    <span>Replay Source</span>
                    <strong>{selectedTrace.replay_source_trace_id ?? 'Original Run'}</strong>
                  </article>
                </div>

                <section className="compare-panel">
                  <div className="panel__header panel__header--compact">
                    <h3>{pickLocaleText(locale, 'Trace Scoring', 'Trace 评分')}</h3>
                    <span>{pickLocaleText(locale, 'Keep a manual scoring entry first, then connect judge scoring and ground truth.', '先保留人工评分入口，后面再接 judge 和 ground truth')}</span>
                  </div>
                  <form className="integration-form" onSubmit={handleScoreSelectedTrace}>
                    <div className="trace-form__grid">
                      <label className="trace-form__field">
                        <span>Quality Label</span>
                        <select value={traceScoreForm.quality_label} onChange={(event) => setTraceScoreForm((current) => ({ ...current, quality_label: event.target.value as QualityLabel }))}>
                          <option value="pass">pass</option>
                          <option value="needs_review">needs_review</option>
                          <option value="fail">fail</option>
                        </select>
                      </label>
                      <label className="trace-form__field">
                        <span>Quality Score</span>
                        <input type="number" min={0} max={100} value={traceScoreForm.quality_score} onChange={(event) => setTraceScoreForm((current) => ({ ...current, quality_score: event.target.value }))} />
                      </label>
                    </div>
                    <label className="trace-form__field">
                      <span>Reviewer Notes</span>
                      <textarea rows={3} value={traceScoreForm.quality_notes} onChange={(event) => setTraceScoreForm((current) => ({ ...current, quality_notes: event.target.value }))} />
                    </label>
                    <button className="secondary-button" type="submit">Save Score</button>
                  </form>
                </section>

                <section className="compare-panel">
                  <div className="panel__header panel__header--compact">
                    <h3>{pickLocaleText(locale, 'Run Config Snapshot', '运行配置快照')}</h3>
                    <span>{pickLocaleText(locale, 'Keep a stable runtime context for replay and issue reproduction.', '为 replay 和问题复现保留稳定的运行上下文')}</span>
                  </div>
                  <div className="compare-panel__grid">
                    {selectedTraceConfigEntries.map((item) => (
                      <article key={item.label} className="compare-card">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </article>
                    ))}
                  </div>
                  {selectedTraceConfig?.system_prompt ? (
                    <div className="timeline-card__payload">
                      <span className="timeline-card__payload-label">System Prompt Snapshot</span>
                      <pre>{selectedTraceConfig.system_prompt}</pre>
                    </div>
                  ) : null}
                </section>

                <section className="detail-output-card">
                  <div className="panel__header panel__header--compact">
                    <h3>{pickLocaleText(locale, 'Final Output', '最终输出')}</h3>
                    <span>{selectedTrace.status}</span>
                  </div>
                  <p>{selectedTrace.final_output}</p>
                </section>

                <div className="detail-metrics-grid">
                  {selectedTraceSummary.map((item) => (
                    <article key={item.label} className="detail-metric-card">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </article>
                  ))}
                </div>

                <section className="detail-error-panel">
                  <h3>Error Summary</h3>
                  {errorCategoryEntries.length ? (
                    <div className="error-category-grid">
                      {errorCategoryEntries.map(([category, count]) => (
                        <article key={category} className="error-category-card">
                          <span>{category}</span>
                          <strong>{count}</strong>
                        </article>
                      ))}
                    </div>
                  ) : null}
                  {errorSteps.length ? (
                    <ul>
                      {errorSteps.map((step) => (
                        <li key={step.id}>{step.title}: {step.error_message}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="placeholder-text">No error steps were recorded in this trace.</p>
                  )}
                </section>

                <section className="compare-panel">
                  <div className="compare-panel__header">
                    <h3>Trace Compare</h3>
                    <select
                      className="trace-filter"
                      onChange={(event) => void handleCompareTrace(event.target.value)}
                      value={compareTraceId ?? ''}
                    >
                      {!comparisonCandidates.length ? <option value="">No compare candidate</option> : null}
                      {comparisonCandidates.map((trace) => (
                        <option key={trace.id} value={trace.id}>
                          {trace.id} · {trace.task_type} · {trace.model_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {compareLoading ? <p className="placeholder-text">{pickLocaleText(locale, 'Loading compare trace...', '正在加载对照 Trace...')}</p> : null}
                  {compareTrace ? (
                    <>
                      <div className="compare-panel__meta">
                        <p><strong>Compare Trace:</strong> {compareTrace.id}</p>
                        <p><strong>Provider:</strong> {compareTrace.provider}</p>
                        <p><strong>Model:</strong> {compareTrace.model_name}</p>
                        <p><strong>Prompt:</strong> {compareTrace.prompt_version}</p>
                      </div>
                      <div className="compare-panel__grid">
                        {compareMetrics.map((item) => (
                          <article key={item.label} className="compare-card">
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="placeholder-text">Select another trace to compare latency, errors, and token usage.</p>
                  )}
                </section>

                <TraceTimeline locale={locale} steps={selectedTrace.steps} />
              </>
            ) : (
              <p className="placeholder-text">Run a trace to inspect the execution timeline.</p>
            )}
          </section>
        </section>
      ) : null}

      {activeView === 'integrations' ? (
        <section className="integration-grid">
          <section className="panel integration-panel" id="integrations-sources">
            <div className="panel__header">
              <div>
                <span className="section-kicker">Connect</span>
                <h2>{pickLocaleText(locale, 'External Sources', '外部接入来源')}</h2>
              </div>
              <div className="panel__header-actions">
                <span>{integrationSources.length} sources</span>
                <button className="secondary-button" disabled={integrationRefreshing} onClick={() => void refreshIntegrationHub()} type="button">
                  {integrationRefreshing ? pickLocaleText(locale, 'Refreshing...', '刷新中...') : pickLocaleText(locale, 'Refresh Sources', '刷新接入数据')}
                </button>
              </div>
            </div>
            <p className="integration-lead">{pickLocaleText(locale, 'Real keys are not stored here. Instead, the workspace records the source, platform, base URL, and a key hint so integration design can be learned without persisting secrets.', '这里不直接保存真实密钥，而是登记来源、平台、Base URL 和密钥提示。这样既能学习外部接入设计，也能避免把敏感值落库。')}</p>
            <form className="integration-form" onSubmit={handleCreateIntegrationSource}>
              <div className="trace-form__grid">
                <label className="trace-form__field">
                  <span>Source Name</span>
                  <input value={integrationSourceForm.name} onChange={(event) => setIntegrationSourceForm((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label className="trace-form__field">
                  <span>Platform</span>
                  <input value={integrationSourceForm.platform_name} onChange={(event) => setIntegrationSourceForm((current) => ({ ...current, platform_name: event.target.value }))} />
                </label>
                <label className="trace-form__field">
                  <span>Access Mode</span>
                  <select value={integrationSourceForm.access_mode} onChange={(event) => setIntegrationSourceForm((current) => ({ ...current, access_mode: event.target.value as IntegrationAccessMode }))}>
                    <option value="manual">manual</option>
                    <option value="api">api</option>
                    <option value="import">import</option>
                  </select>
                </label>
                <label className="trace-form__field">
                  <span>Provider</span>
                  <input value={integrationSourceForm.provider} onChange={(event) => setIntegrationSourceForm((current) => ({ ...current, provider: event.target.value }))} />
                </label>
                <label className="trace-form__field">
                  <span>Base URL</span>
                  <input value={integrationSourceForm.base_url} onChange={(event) => setIntegrationSourceForm((current) => ({ ...current, base_url: event.target.value }))} />
                </label>
                <label className="trace-form__field">
                  <span>API Key Hint</span>
                  <input value={integrationSourceForm.api_key_hint} onChange={(event) => setIntegrationSourceForm((current) => ({ ...current, api_key_hint: event.target.value }))} placeholder={pickLocaleText(locale, 'Optional masked hint such as team-shared-key', '可选的脱敏提示，如 team-shared-key')} />
                </label>
              </div>
              <label className="trace-form__field">
                <span>Notes</span>
                <textarea rows={3} value={integrationSourceForm.notes} onChange={(event) => setIntegrationSourceForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <button type="submit">Add Source</button>
            </form>

            <div className="source-list">
              <section className="detail-output-card">
                <div className="panel__header panel__header--compact">
                  <h3>{pickLocaleText(locale, 'Connector Skeletons', '自动连接器骨架')}</h3>
                  <span>{connectorTemplates.length} templates</span>
                </div>
                <p className="integration-lead">{pickLocaleText(locale, 'These fixed templates simulate how different platforms would be connected and synced. The goal is not to fake real integrations, but to build the actual customer-facing connect-and-sync path first.', '这里先用固定模板模拟不同平台的自动同步路径，目的不是伪造真实接入，而是先把客户真正会点的“连接并同步”流程搭出来。')}</p>
                <div className="detail-actions detail-actions--hero">
                  <label className="trace-form__field connector-lookback-field">
                    <span>{pickLocaleText(locale, 'Sync Window', '同步时间窗')}</span>
                    <select value={connectorLookbackDays} onChange={(event) => setConnectorLookbackDays(Number(event.target.value))}>
                      {connectorLookbackOptions.map((option) => (
                        <option key={option} value={option}>{option} day{option > 1 ? 's' : ''}</option>
                      ))}
                    </select>
                  </label>
                  <span className="placeholder-text">{pickLocaleText(locale, 'Each sync will create or reuse a source automatically and backfill usage samples for the recent days.', '每次同步会自动创建或复用来源，并补入最近几天的 usage 样本。')}</span>
                </div>
                <div className="connector-template-grid">
                  {connectorTemplates.map((connector) => {
                    const matchedSource = connectorSourceMap.get(connector.id) ?? null
                    const latestJob = latestConnectorJobMap.get(connector.id) ?? null
                    const connectorSteps = [
                      {
                        title: pickLocaleText(locale, 'Register Source', '登记来源'),
                        status: matchedSource ? 'done' : 'pending',
                        description: matchedSource
                          ? pickLocaleText(locale, `Created source ${matchedSource.name}.`, `已建立 ${matchedSource.name} 来源。`)
                          : pickLocaleText(locale, 'The first sync creates a source automatically and stores its platform settings.', '首次同步时会自动创建来源并保存平台参数。'),
                      },
                      {
                        title: pickLocaleText(locale, 'Pull Usage', '拉取 Usage'),
                        status: syncingConnectorId === connector.id ? 'active' : latestJob?.status === 'success' ? 'done' : 'pending',
                        description: syncingConnectorId === connector.id
                          ? pickLocaleText(locale, `Syncing usage for the last ${connectorLookbackDays} days.`, `正在同步最近 ${connectorLookbackDays} 天 usage。`)
                          : latestJob
                            ? pickLocaleText(locale, `The latest sync created ${latestJob.created_record_count} records.`, `最近一次同步创建 ${latestJob.created_record_count} 条记录。`)
                            : pickLocaleText(locale, 'No sync history yet. Run connect-and-sync once first.', '还没有同步历史，先执行一次连接并同步。'),
                      },
                      {
                        title: pickLocaleText(locale, 'Verify Result', '核对结果'),
                        status: matchedSource && selectedIntegrationSourceId === matchedSource.id ? 'active' : matchedSource && latestJob?.status === 'success' ? 'done' : 'pending',
                        description: matchedSource && selectedIntegrationSourceId === matchedSource.id
                          ? pickLocaleText(locale, 'The trend and record table below are already filtered to this source.', '当前已把下方趋势和记录表切到这个来源。')
                          : matchedSource && latestJob?.status === 'success'
                            ? pickLocaleText(locale, 'Next, open the source and verify its trend, tokens, and cost.', '下一步建议点击“查看来源”，核对趋势、token 和成本。')
                            : pickLocaleText(locale, 'After sync finishes, verify the source card and usage records.', '同步完成后，再检查来源卡片和 usage 记录是否符合预期。'),
                      },
                    ]

                    return (
                      <article key={connector.id} className={lastSyncedConnectorId === connector.id ? 'connector-template-card connector-template-card--active' : 'connector-template-card'}>
                        <div className="trace-list__item-topline">
                          <strong>{connector.title}</strong>
                          <span className="trace-status-badge">{connector.access_mode}</span>
                        </div>
                        <p>{localizeKnownCopy(locale, connector.description)}</p>
                        <div className="trace-list__item-metadata">
                          <span>{connector.platform_name}</span>
                          <span>{connector.provider}</span>
                          <span>{connector.default_model_name}</span>
                        </div>
                        <small>{localizeKnownCopy(locale, connector.sync_frequency_hint)}</small>
                        <div className="connector-step-list">
                          {connectorSteps.map((step) => (
                            <article key={`${connector.id}-${step.title}`} className={step.status === 'done' ? 'connector-step connector-step--done' : step.status === 'active' ? 'connector-step connector-step--active' : 'connector-step'}>
                              <strong>{step.title}</strong>
                              <small>{step.description}</small>
                            </article>
                          ))}
                        </div>
                        <p className="connector-next-step">
                          {latestJob?.status === 'success' && matchedSource
                            ? pickLocaleText(locale, `Next: inspect ${matchedSource.name} and confirm whether token and cost for the last ${latestJob.lookback_days} days match the official pricing view.`, `下一步：查看 ${matchedSource.name}，确认最近 ${latestJob.lookback_days} 天 token 与成本是否符合官方口径。`)
                            : pickLocaleText(locale, 'Next: run connect-and-sync first, then verify the usage result in the source cards below.', '下一步：先执行连接并同步，再到下方来源卡片核对 usage 结果。')}
                        </p>
                        <div className="detail-actions">
                          <button className="secondary-button" disabled={syncingConnectorId === connector.id} onClick={() => void handleSyncConnector(connector.id)} type="button">
                            {syncingConnectorId === connector.id ? pickLocaleText(locale, 'Syncing...', '同步中...') : pickLocaleText(locale, 'Connect and Sync', '连接并同步')}
                          </button>
                          {matchedSource ? <button className="secondary-button" onClick={() => handleFocusIntegrationSource(matchedSource)} type="button">{pickLocaleText(locale, 'Open Source', '查看来源')}</button> : null}
                          {latestJob ? <button className="secondary-button" onClick={() => handleFocusConnectorJob(latestJob)} type="button">{pickLocaleText(locale, 'Open Latest Batch', '查看最近批次')}</button> : null}
                        </div>
                      </article>
                    )
                  })}
                </div>
                <div className="review-queue-list connector-history-list">
                  {connectorSyncJobs.slice(0, 6).map((job) => (
                    <article
                      key={job.id}
                      className={selectedConnectorJobId === job.id ? 'review-queue-card review-queue-card--active' : 'review-queue-card'}
                      onClick={() => handleFocusConnectorJob(job)}
                    >
                      <div className="trace-list__item-topline">
                        <strong>{job.connector_title}</strong>
                        <span className="trace-status-badge">{job.status}</span>
                      </div>
                      <p>{job.source_name ?? pickLocaleText(locale, 'No source yet', '暂无来源')} · {pickLocaleText(locale, `Synced last ${job.lookback_days} days`, `最近同步 ${job.lookback_days} 天`)}</p>
                      <div className="trace-list__item-metadata">
                        <span>{job.created_record_count} records</span>
                        <span>{new Date(job.created_at).toLocaleString()}</span>
                      </div>
                      <button className="secondary-button" disabled={retryingConnectorJobId === job.id} onClick={() => void handleRetryConnectorJob(job.id)} type="button">
                        {retryingConnectorJobId === job.id ? pickLocaleText(locale, 'Retrying...', '重试中...') : pickLocaleText(locale, 'Retry Sync', '重试同步')}
                      </button>
                    </article>
                  ))}
                  {!connectorSyncJobs.length ? <p className="placeholder-text">{pickLocaleText(locale, 'No sync history yet. Start with one connect-and-sync run.', '还没有自动同步历史，先点一次“连接并同步”。')}</p> : null}
                </div>
              </section>

              {integrationSources.map((source) => (
                <article
                  key={source.id}
                  className={selectedIntegrationSourceId === source.id ? 'source-card source-card--active' : 'source-card'}
                  onClick={() => handleFocusIntegrationSource(source)}
                >
                  <div className="trace-list__item-topline">
                    <strong>{source.name}</strong>
                    <span className="trace-status-badge">{source.access_mode}</span>
                  </div>
                  <p>{source.platform_name} · {source.provider}</p>
                  <small>{source.base_url || 'No base URL'}</small>
                  <div className="trace-list__item-metadata">
                    <span>{source.api_key_hint || 'No key hint'}</span>
                    <span>{source.usage_record_count} records</span>
                  </div>
                </article>
              ))}
              {!integrationSources.length ? <p className="placeholder-text">{pickLocaleText(locale, 'No external source yet. Add a Claude Code or custom API source first.', '还没有外部来源，先新建一个 Claude Code 或自有 API 来源。')}</p> : null}
            </div>
          </section>

          <section className="panel integration-panel" id="integrations-entry">
            <div className="panel__header">
              <div>
                <span className="section-kicker">{pickLocaleText(locale, 'Ingest', '录入')}</span>
                <h2>{pickLocaleText(locale, 'External Usage Entry', '外部使用量录入')}</h2>
              </div>
              <span>{externalUsageRecords.length} records</span>
            </div>
            <p className="integration-lead">{pickLocaleText(locale, 'Start with manual entry and JSON import first, then connect Claude Code, other platforms, or your own API gateway into the same layer.', '第一版先支持手动录入和导入承载结构。后面可以继续把 Claude Code、其它平台或你自己的 API 网关接到这一层。')}</p>
            <div className="category-switch" role="tablist" aria-label="Integration entry mode">
              <button
                className={integrationEntryMode === 'manual' ? 'category-switch__button category-switch__button--active' : 'category-switch__button'}
                onClick={() => setIntegrationEntryMode('manual')}
                type="button"
              >
                {pickLocaleText(locale, 'Manual Entry', '手动录入')}
              </button>
              <button
                className={integrationEntryMode === 'import' ? 'category-switch__button category-switch__button--active' : 'category-switch__button'}
                onClick={() => setIntegrationEntryMode('import')}
                type="button"
              >
                {pickLocaleText(locale, 'JSON Import', 'JSON 导入')}
              </button>
            </div>

            {integrationEntryMode === 'manual' ? (
            <form className="integration-form" onSubmit={handleCreateExternalUsage}>
              <div className="trace-form__grid">
                <label className="trace-form__field">
                  <span>Source</span>
                  <select value={String(externalUsageForm.source_id)} onChange={(event) => setExternalUsageForm((current) => ({ ...current, source_id: Number(event.target.value) }))}>
                    {!integrationSources.length ? <option value="0">No source available</option> : null}
                    {integrationSources.map((source) => (
                      <option key={source.id} value={String(source.id)}>{source.name} · {source.platform_name}</option>
                    ))}
                  </select>
                </label>
                <label className="trace-form__field">
                  <span>Model Name</span>
                  <input value={externalUsageForm.model_name} onChange={(event) => setExternalUsageForm((current) => ({ ...current, model_name: event.target.value }))} />
                </label>
                <label className="trace-form__field">
                  <span>Run Count</span>
                  <input type="number" min={1} value={externalUsageForm.run_count} onChange={(event) => setExternalUsageForm((current) => ({ ...current, run_count: Number(event.target.value) }))} />
                </label>
                <label className="trace-form__field">
                  <span>Total Tokens</span>
                  <input type="number" min={0} value={externalUsageForm.token_usage} onChange={(event) => setExternalUsageForm((current) => ({ ...current, token_usage: Number(event.target.value) }))} />
                </label>
                <label className="trace-form__field">
                  <span>Input Tokens</span>
                  <input type="number" min={0} value={externalUsageForm.input_token_usage} onChange={(event) => handleChangeExternalUsageTokenBreakdown('input_token_usage', Number(event.target.value))} />
                </label>
                <label className="trace-form__field">
                  <span>Output Tokens</span>
                  <input type="number" min={0} value={externalUsageForm.output_token_usage} onChange={(event) => handleChangeExternalUsageTokenBreakdown('output_token_usage', Number(event.target.value))} />
                </label>
                <label className="trace-form__field">
                  <span>Cached Tokens</span>
                  <input type="number" min={0} value={externalUsageForm.cached_token_usage} onChange={(event) => handleChangeExternalUsageTokenBreakdown('cached_token_usage', Number(event.target.value))} />
                </label>
                <label className="trace-form__field">
                  <span>Cost USD</span>
                  <input type="number" min={0} step="0.0001" value={externalUsageForm.cost_usd} onChange={(event) => setExternalUsageForm((current) => ({ ...current, cost_usd: Number(event.target.value) }))} />
                </label>
                <label className="trace-form__field">
                  <span>Reference</span>
                  <input value={externalUsageForm.external_reference ?? ''} onChange={(event) => setExternalUsageForm((current) => ({ ...current, external_reference: event.target.value }))} />
                </label>
                <label className="trace-form__field">
                  <span>Recorded At</span>
                  <input type="datetime-local" value={externalUsageForm.recorded_at ?? ''} onChange={(event) => setExternalUsageForm((current) => ({ ...current, recorded_at: event.target.value }))} />
                </label>
              </div>
              <p className="placeholder-text">{pickLocaleText(locale, 'Total Tokens should usually be input + output. Cached Tokens are tracked separately and should not be added again.', 'Total Tokens 建议使用 input + output。Cached Tokens 仅用于单独观察缓存命中，不应再重复加到 total 里。')}</p>
              <p className="placeholder-text">{pickLocaleText(locale, 'If cost is not exported from the official bill directly, verify it in the official pricing panel below after saving.', '如果成本不是从官方账单直接导出，建议录入后看下方“官方口径校验”面板，确认实际 cost 没有偏离官方规则。')}</p>
              <label className="trace-form__field">
                <span>Notes</span>
                <textarea rows={3} value={externalUsageForm.notes ?? ''} onChange={(event) => setExternalUsageForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <button disabled={!integrationSources.length || externalUsageForm.source_id === 0} type="submit">{pickLocaleText(locale, 'Save Usage Record', '保存使用记录')}</button>
            </form>
            ) : (
            <form className="integration-form" onSubmit={handleImportExternalUsage}>
              <label className="trace-form__field">
                <span>Import JSON</span>
                <textarea
                  className="json-textarea"
                  rows={16}
                  value={importJsonText}
                  onChange={(event) => setImportJsonText(event.target.value)}
                  placeholder={pickLocaleText(locale, '[\n  {\n    "source_name": "...",\n    "platform_name": "...",\n    "provider": "...",\n    "model_name": "...",\n    "run_count": 1,\n    "input_token_usage": 0,\n    "output_token_usage": 0,\n    "cached_token_usage": 0,\n    "cost_usd": 0\n  }\n]', '[\n  {\n    "source_name": "...",\n    "platform_name": "...",\n    "provider": "...",\n    "model_name": "...",\n    "run_count": 1,\n    "input_token_usage": 0,\n    "output_token_usage": 0,\n    "cached_token_usage": 0,\n    "cost_usd": 0\n  }\n]')}
                />
              </label>
              <p className="integration-lead">{pickLocaleText(locale, 'Each record should at least include source_name, platform_name, provider, model_name, run_count, and token_usage. Missing sources will be created automatically.', '每条记录至少包含 source_name、platform_name、provider、model_name、run_count、token_usage。来源不存在时会自动创建。')}</p>
              <button disabled={importingUsage} type="submit">{importingUsage ? pickLocaleText(locale, 'Importing...', '导入中...') : pickLocaleText(locale, 'Import Usage JSON', '导入 Usage JSON')}</button>
            </form>
            )}

            {integrationImportSummary ? (
              <div className="detail-summary-grid">
                <article className="detail-summary-card">
                  <span>新建来源</span>
                  <strong>{integrationImportSummary.created_source_count}</strong>
                </article>
                <article className="detail-summary-card">
                  <span>复用来源</span>
                  <strong>{integrationImportSummary.reused_source_count}</strong>
                </article>
                <article className="detail-summary-card">
                  <span>新建记录</span>
                  <strong>{integrationImportSummary.created_record_count}</strong>
                </article>
                <article className="detail-summary-card">
                  <span>跳过重复</span>
                  <strong>{integrationImportSummary.skipped_duplicate_count}</strong>
                </article>
              </div>
            ) : null}

            {integrationError ? <p className="error-banner">{integrationError}</p> : null}
          </section>

          <section className="panel integration-panel integration-panel--wide" id="integrations-trends">
            <div className="panel__header">
              <div>
                <span className="section-kicker">Observe</span>
                <h2>{pickLocaleText(locale, 'External Usage Trends', '外部使用量趋势')}</h2>
              </div>
              <div className="panel__header-actions">
                <select className="trace-filter trend-panel__range" value={integrationChartMetric} onChange={(event) => setIntegrationChartMetric(event.target.value as IntegrationChartMetric)}>
                  <option value="runs">{pickLocaleText(locale, 'By Runs', '按运行量')}</option>
                  <option value="tokens">{pickLocaleText(locale, 'By Tokens', '按 Tokens')}</option>
                  <option value="cost">{pickLocaleText(locale, 'By Cost', '按成本')}</option>
                </select>
                <select className="trace-filter trend-panel__range" value={integrationTimeRangeDays} onChange={(event) => setIntegrationTimeRangeDays(Number(event.target.value))}>
                  <option value={3}>Last 3 days</option>
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                </select>
              </div>
            </div>

            <div className="trend-panel__cards integration-kpis">
              <article className="detail-metric-card">
                <span>{pickLocaleText(locale, 'External Runs', '外部运行')}</span>
                <strong>{integrationDisplayRuns}</strong>
                <small>{pickLocaleText(locale, 'Accumulated runs from external platforms.', '其它平台累计运行量')}</small>
              </article>
              <article className="detail-metric-card">
                <span>外部 Tokens</span>
                <strong>{integrationDisplayTokens}</strong>
                <small>跨平台 token 汇总</small>
              </article>
              <article className="detail-metric-card">
                <span>{pickLocaleText(locale, 'External Cost', '外部成本')}</span>
                <strong>{formatCurrency(integrationDisplayCost)}</strong>
                <small>{pickLocaleText(locale, 'Accumulated cost within the current time window.', '当前时间窗口内累计成本')}</small>
              </article>
            </div>

            {selectedIntegrationSource ? (
              <div className="chart-tooltip chart-tooltip--secondary">
                <strong>{pickLocaleText(locale, 'Currently Filtered by Source', '当前按来源过滤')}</strong>
                <span>{selectedIntegrationSource.name}</span>
                <span>{selectedIntegrationSource.platform_name} · {selectedIntegrationSource.provider}</span>
                <button className="secondary-button" onClick={handleClearIntegrationSourceFilter} type="button">{pickLocaleText(locale, 'View All Sources', '查看全部来源')}</button>
              </div>
            ) : null}

            {integrationValidationLoading && !externalUsageValidation ? <p className="placeholder-text">{pickLocaleText(locale, 'Checking current-window cost against official pricing references...', '正在按官方价格页核对当前时间窗内的成本...')}</p> : null}
            {externalUsageValidation ? (
              <section className="detail-output-card">
                <div className="panel__header panel__header--compact">
                  <h3>{pickLocaleText(locale, 'Official Pricing Check', '官方口径校验')}</h3>
                  <span>{externalUsageValidation.supported_check_count} verified · {externalUsageValidation.unsupported_check_count} pending</span>
                </div>
                <p className="integration-lead">{pickLocaleText(locale, 'This compares provider/model cost in the current window against the official pricing snapshots stored in the repo. Models without an official source stay manual-review only instead of receiving overconfident estimates.', '这里把当前时间窗内的 provider/model 成本与仓库保存的官方价格快照对照。没有官方来源的模型会直接标成待人工核对，而不是继续给出自信但站不住脚的估算。')}</p>
                <div className="detail-summary-grid">
                  <article className="detail-summary-card">
                    <span>{pickLocaleText(locale, 'Recorded Cost', '记录成本')}</span>
                    <strong>{formatCurrency(externalUsageValidation.total_actual_cost_usd)}</strong>
                    <small>{externalUsageValidation.checked_record_count} records</small>
                  </article>
                  <article className="detail-summary-card">
                    <span>{pickLocaleText(locale, 'Official Estimate', '官方估算')}</span>
                    <strong>{externalUsageValidation.total_estimated_cost_usd === null ? 'n/a' : formatCurrency(externalUsageValidation.total_estimated_cost_usd)}</strong>
                    <small>{externalUsageValidation.total_estimated_cost_usd === null ? '存在未覆盖模型' : `${externalUsageValidation.time_range_days} 天时间窗`}</small>
                  </article>
                  <article className="detail-summary-card">
                    <span>{pickLocaleText(locale, 'Cost Delta', '成本偏差')}</span>
                    <strong>{externalUsageValidation.total_delta_cost_usd === null ? 'n/a' : formatCurrency(externalUsageValidation.total_delta_cost_usd)}</strong>
                    <small>actual - estimated</small>
                  </article>
                  <article className="detail-summary-card">
                    <span>{pickLocaleText(locale, 'Missing Official Pricing', '待补官方价')}</span>
                    <strong>{externalUsageValidation.unsupported_check_count}</strong>
                    <small>需要先补官方来源再下结论</small>
                  </article>
                </div>
                <div className="detail-actions detail-actions--hero">
                  <button className="secondary-button" onClick={() => setShowOfficialValidationDetails((current) => !current)} type="button">
                    {showOfficialValidationDetails ? pickLocaleText(locale, 'Hide Check Details', '收起校验详情') : pickLocaleText(locale, 'Show Check Details', '展开校验详情')}
                  </button>
                </div>
                {showOfficialValidationDetails ? (
                <div className="usage-list">
                  {externalUsageValidation.checks.map((check) => (
                    <article key={`${check.provider}-${check.model_name}`} className="trace-list__item usage-record-card">
                      <div className="trace-list__item-topline">
                        <strong>{check.display_name}</strong>
                        <span className="trace-status-badge">
                          {check.status === 'matched' ? 'official match' : check.status === 'drift' ? 'needs review' : 'missing official rate'}
                        </span>
                      </div>
                      <p>{check.provider} · {check.model_name}</p>
                      <div className="trace-list__item-metrics">
                        <span>{check.total_runs} runs</span>
                        <span>{check.token_usage} tokens</span>
                        <span>input {check.input_token_usage} · output {check.output_token_usage} · cached {check.cached_token_usage}</span>
                        <span>actual {formatCurrency(check.actual_cost_usd)}</span>
                        <span>estimated {check.estimated_cost_usd === null ? 'n/a' : formatCurrency(check.estimated_cost_usd)}</span>
                        <span>delta {check.delta_cost_usd === null ? 'n/a' : formatCurrency(check.delta_cost_usd)}</span>
                      </div>
                      <small>{localizeKnownCopy(locale, check.billing_formula) ?? pickLocaleText(locale, 'There is no reviewable formula yet because an official pricing snapshot is missing.', '当前还没有可复查的公式，因为缺少官方价格快照。')}</small>
                      <small>{check.notes}</small>
                      {check.official_source_url ? (
                        <small>
                          <a href={check.official_source_url} rel="noreferrer" target="_blank">{check.official_source_label ?? pickLocaleText(locale, 'Official Source', '官方来源')}</a>
                          {check.reviewed_at ? ` · snapshot ${check.reviewed_at}` : ''}
                        </small>
                      ) : null}
                    </article>
                  ))}
                  {!externalUsageValidation.checks.length ? <p className="placeholder-text">{pickLocaleText(locale, 'No verifiable usage record exists under the current time window and source filter.', '当前时间窗和来源筛选下没有可核验的 usage 记录。')}</p> : null}
                </div>
                ) : null}
              </section>
            ) : null}

            <div className="trend-visual-grid">
              <section className="trend-visual-card">
                <div className="trend-visual-card__header">
                  <div>
                    <h3>{integrationChartConfig?.title ?? pickLocaleText(locale, 'External Trend Chart', '外部趋势图表')}</h3>
                    <span>{integrationChartConfig?.subtitle ?? pickLocaleText(locale, 'Waiting for data', '等待数据')}</span>
                  </div>
                </div>
                {integrationChartConfig ? (
                  <>
                    <svg className="trend-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={integrationChartConfig.title}>
                      <line x1="20" y1={chartHeight - 20} x2={chartWidth - 10} y2={chartHeight - 20} className="trend-chart__axis" />
                      {integrationChartConfig.values.map((value, index) => {
                        const point = integrationPanelStats.timeline[index] as DerivedExternalUsageStatsPoint
                        const slotWidth = (chartWidth - 60) / Math.max(integrationChartConfig.values.length, 1)
                        const barHeight = (value / integrationChartMax) * (chartHeight - 60)
                        const x = 24 + index * slotWidth
                        const y = chartHeight - 20 - barHeight
                        const barWidth = Math.max(20, slotWidth - 12)
                        return (
                          <g key={integrationChartConfig.labels[index]}>
                            <rect
                              className={hoveredExternalPoint?.date === point.date ? 'trend-chart__bar trend-chart__bar--secondary trend-chart__bar--active' : 'trend-chart__bar trend-chart__bar--secondary'}
                              height={barHeight}
                              rx="10"
                              width={barWidth}
                              x={x}
                              y={y}
                              onMouseEnter={() => setHoveredExternalPoint(point)}
                              onMouseLeave={() => setHoveredExternalPoint(null)}
                            >
                              <title>{`${point.date}: ${integrationChartConfig.formatter(value)}`}</title>
                            </rect>
                            <text className="trend-chart__label" x={x + barWidth / 2} y={chartHeight - 4}>{integrationChartConfig.labels[index].slice(5)}</text>
                            <text className="trend-chart__value" x={x + barWidth / 2} y={Math.max(18, y - 8)}>{integrationChartConfig.formatter(value)}</text>
                          </g>
                        )
                      })}
                    </svg>
                    {activeExternalTooltipPoint ? (
                      <div className="chart-tooltip chart-tooltip--secondary">
                        <strong>{activeExternalTooltipPoint.date}</strong>
                        <span>{activeExternalTooltipPoint.run_count} runs</span>
                        <span>{activeExternalTooltipPoint.token_usage} tokens</span>
                        <span>input {activeExternalTooltipPoint.input_token_usage} · output {activeExternalTooltipPoint.output_token_usage}</span>
                        <span>cached {activeExternalTooltipPoint.cached_token_usage}</span>
                        <span>{formatCurrency(activeExternalTooltipPoint.cost_usd)}</span>
                      </div>
                    ) : null}
                  </>
                ) : <p className="placeholder-text">Loading external usage statistics...</p>}
              </section>

              <section className="trend-visual-card">
                <div className="trend-visual-card__header">
                  <div>
                    <h3>{pickLocaleText(locale, 'External Line Trend', '外部折线走势')}</h3>
                    <span>{pickLocaleText(locale, 'Helps reveal external-platform usage volatility.', '帮助看出其它平台使用波动')}</span>
                  </div>
                </div>
                {integrationChartConfig ? (
                  <>
                    <svg className="trend-chart trend-chart--line" viewBox={`0 0 ${chartWidth} 120`} role="img" aria-label="External usage line chart">
                      <polyline className="trend-chart__line-shadow" points={integrationChartLine} />
                      <polyline className="trend-chart__line trend-chart__line--secondary" points={integrationChartLine} />
                      {integrationPanelStats.timeline.map((rawPoint, index) => {
                        const point = rawPoint as DerivedExternalUsageStatsPoint
                        const coordinate = integrationChartCoordinates[index]
                        const slotWidth = (chartWidth - 40) / Math.max(integrationPanelStats.timeline.length, 1)
                        return (
                          <g key={point.date}>
                            <rect
                              className="trend-chart__hit-area"
                              x={Math.max(0, coordinate.x - slotWidth / 2)}
                              y={0}
                              width={slotWidth}
                              height={120}
                              onMouseEnter={() => setHoveredExternalPoint(point)}
                              onMouseLeave={() => setHoveredExternalPoint(null)}
                            />
                            <circle
                              className={hoveredExternalPoint?.date === point.date ? 'trend-chart__point trend-chart__point--secondary trend-chart__point--active' : 'trend-chart__point trend-chart__point--secondary'}
                              cx={coordinate.x}
                              cy={coordinate.y}
                              r="5"
                            >
                              <title>{`${point.date}: ${integrationChartConfig.formatter(integrationChartConfig.values[index])}`}</title>
                            </circle>
                          </g>
                        )
                      })}
                    </svg>
                    <div className="trend-timeline trend-timeline--compact">
                      {integrationPanelStats.timeline.map((rawPoint) => {
                        const point = rawPoint as DerivedExternalUsageStatsPoint
                        return (
                        <article key={point.date} className="trend-timeline__item trend-timeline__item--stacked">
                          <strong>{point.date}</strong>
                          <span>{point.run_count} runs</span>
                          <span>{point.token_usage} tokens</span>
                          <span>input {point.input_token_usage} · output {point.output_token_usage}</span>
                          <span>{formatCurrency(point.cost_usd)}</span>
                        </article>
                        )
                      })}
                    </div>
                  </>
                ) : <p className="placeholder-text">Loading external usage statistics...</p>}
              </section>

              <section className="trend-breakdown-card trend-breakdown-card--wide">
                <h3>Platform Breakdown</h3>
                {integrationPanelStats.platform_breakdown.map((item) => (
                  <div key={item.key} className="breakdown-row">
                    <div className="breakdown-row__label">
                      <strong>{item.key}</strong>
                      <span>{item.count} runs</span>
                    </div>
                    <div className="breakdown-row__bar-track">
                      <div className="breakdown-row__bar" style={{ width: `${(item.count / externalPlatformBreakdownMax) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </section>

              <section className="trend-breakdown-card trend-breakdown-card--wide">
                <h3>Provider Breakdown</h3>
                {integrationPanelStats.provider_breakdown.map((item) => (
                  <div key={item.key} className="breakdown-row">
                    <div className="breakdown-row__label">
                      <strong>{item.key}</strong>
                      <span>{item.count} runs</span>
                    </div>
                    <div className="breakdown-row__bar-track">
                      <div className="breakdown-row__bar breakdown-row__bar--secondary" style={{ width: `${(item.count / externalProviderBreakdownMax) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </section>
            </div>

            <div className="insight-list insight-list--compact">
              {integrationInsights.map((item) => (
                <article key={item} className="insight-card">
                  <p>{item}</p>
                </article>
              ))}
            </div>

            <div className="usage-list">
              {integrationRefreshing ? <p className="placeholder-text">Refreshing integration data...</p> : null}
              {filteredExternalUsageRecords.map((record) => (
                <article key={record.id} className="trace-list__item usage-record-card">
                  <div className="trace-list__item-topline">
                    <strong>{record.source_name}</strong>
                    <span className="trace-status-badge">{record.access_mode}</span>
                  </div>
                  <p>{record.platform_name} · {record.provider} · {record.model_name}</p>
                  <div className="trace-list__item-metrics">
                    <span>{record.run_count} runs</span>
                    <span>{record.token_usage} tokens</span>
                    <span>input {record.input_token_usage} · output {record.output_token_usage} · cached {record.cached_token_usage}</span>
                    <span>{formatCurrency(record.cost_usd)}</span>
                  </div>
                  <small>{record.external_reference || 'No external reference'} · {new Date(record.recorded_at).toLocaleString()}</small>
                </article>
              ))}
              {!filteredExternalUsageRecords.length ? <p className="placeholder-text">当前来源筛选下还没有外部使用量记录。</p> : null}
            </div>
          </section>
        </section>
      ) : null}

      {activeView === 'evaluations' ? (
        <section className="integration-grid">
          <section className="panel integration-panel" id="evaluations-suites">
            <div className="panel__header">
              <div>
                <span className="section-kicker">{pickLocaleText(locale, 'Evaluate', '评测')}</span>
                <h2>{pickLocaleText(locale, 'Evaluation Suite Scaffold', '评测集骨架')}</h2>
              </div>
              <span>{evaluationSuites.length} suites</span>
            </div>
            <p className="integration-lead">{pickLocaleText(locale, 'Start by wiring the suite, case inputs, and run configuration together, then add batch execution, comparison, and aggregate reporting.', '第一版先把评测集、样本输入和运行配置关系搭起来，后面再接批量执行、结果对照和聚合统计。')}</p>
            <form className="integration-form" onSubmit={handleCreateEvaluationSuite}>
              <div className="trace-form__grid">
                <label className="trace-form__field">
                  <span>Suite Name</span>
                  <input value={evaluationSuiteForm.name} onChange={(event) => setEvaluationSuiteForm((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label className="trace-form__field">
                  <span>Description</span>
                  <input value={evaluationSuiteForm.description} onChange={(event) => setEvaluationSuiteForm((current) => ({ ...current, description: event.target.value }))} />
                </label>
              </div>
              <label className="trace-form__field">
                <span>Case Inputs</span>
                <textarea rows={6} value={evaluationSuiteForm.casesText} onChange={(event) => setEvaluationSuiteForm((current) => ({ ...current, casesText: event.target.value }))} placeholder={pickLocaleText(locale, 'One case per line. Use real production tasks or review scenarios.', '每行一个 case，建议填写真实生产任务或复核场景。')} />
              </label>
              <p className="integration-lead">{pickLocaleText(locale, 'Use one line per case input for now so the suite dataset can be scaffolded before a richer case editor exists.', '当前用一行一条 case 输入，目的是先把评测集数据面搭起来，后面再细化为完整 case 编辑器。')}</p>
              <button className="secondary-button" type="submit">{pickLocaleText(locale, 'Create Suite Skeleton', '创建评测集骨架')}</button>
            </form>

            <div className="source-list">
              {evaluationSuites.map((suite) => (
                <button key={suite.id} className="source-card source-card--button" onClick={() => void handleSelectEvaluationSuite(suite.id)} type="button">
                  <div className="trace-list__item-topline">
                    <strong>{suite.name}</strong>
                    <span className="trace-status-badge">{suite.status}</span>
                  </div>
                  <p>{localizeKnownCopy(locale, suite.description) ?? pickLocaleText(locale, 'No description', '暂无描述')}</p>
                  <div className="trace-list__item-metadata">
                    <span>{suite.case_count} {pickLocaleText(locale, 'cases', 'cases')}</span>
                    <span>{suite.run_count} {pickLocaleText(locale, 'runs', 'runs')}</span>
                  </div>
                </button>
              ))}
              {!evaluationSuites.length ? <p className="placeholder-text">{pickLocaleText(locale, 'No suite exists yet. Create a minimal regression pack first.', '还没有评测集，先创建一个最小 regression pack。')}</p> : null}
            </div>
          </section>

          <section className="panel integration-panel" id="evaluations-runs">
            <div className="panel__header">
              <div>
                <span className="section-kicker">{pickLocaleText(locale, 'Run', '运行')}</span>
                <h2>{pickLocaleText(locale, 'Evaluation Run Scaffold', '评测运行骨架')}</h2>
              </div>
              <span>{evaluationRuns.length} runs</span>
            </div>
            <p className="integration-lead">{pickLocaleText(locale, 'Create a draft run first to store the provider, model, and prompt version for this evaluation, then connect the real batch executor.', '这里先创建 draft 运行，保存当次评测将使用的 provider、model 和 prompt 版本，后面再接真正的批量执行器。')}</p>
            <div className="detail-actions detail-actions--hero">
              <button className="secondary-button" disabled={seedingDemo} onClick={() => void handleSeedDemoData()} type="button">
                {seedingDemo ? pickLocaleText(locale, 'Seeding Demo...', '注入 Demo 数据中...') : pickLocaleText(locale, 'Seed Demo Data', '一键注入 Demo 数据')}
              </button>
              <span className="placeholder-text">{pickLocaleText(locale, 'This creates demo traces, suites, runs, and audit events automatically.', '会自动生成演示 trace、评测集、评测运行和审计事件。')}</span>
            </div>
            <form className="integration-form" onSubmit={handleCreateEvaluationRun}>
              <div className="trace-form__grid">
                <label className="trace-form__field">
                  <span>Suite</span>
                  <select value={String(evaluationRunForm.suite_id)} onChange={(event) => setEvaluationRunForm((current) => ({ ...current, suite_id: Number(event.target.value) }))}>
                    {!evaluationSuites.length ? <option value="0">{pickLocaleText(locale, 'No suite available', '暂无可用评测集')}</option> : null}
                    {evaluationSuites.map((suite) => (
                      <option key={suite.id} value={String(suite.id)}>{suite.name}</option>
                    ))}
                  </select>
                </label>
                <label className="trace-form__field">
                  <span>Execution Mode</span>
                  <select value={evaluationRunForm.execution_mode} onChange={(event) => setEvaluationRunForm((current) => ({ ...current, execution_mode: event.target.value as ExecutionMode }))}>
                    <option value="mock">mock</option>
                    <option value="llm">llm</option>
                  </select>
                </label>
                <label className="trace-form__field">
                  <span>Provider</span>
                  <input value={evaluationRunForm.provider} onChange={(event) => setEvaluationRunForm((current) => ({ ...current, provider: event.target.value }))} />
                </label>
                <label className="trace-form__field">
                  <span>Model Name</span>
                  <input value={evaluationRunForm.model_name} onChange={(event) => setEvaluationRunForm((current) => ({ ...current, model_name: event.target.value }))} />
                </label>
                <label className="trace-form__field">
                  <span>Prompt Version</span>
                  <select value={evaluationRunForm.prompt_version} onChange={(event) => setEvaluationRunForm((current) => ({ ...current, prompt_version: event.target.value }))}>
                    {promptVersions.map((option) => (
                      <option key={option.version} value={option.version}>{option.version} · {getLocalizedPromptCopy(option, locale).label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="trace-form__field">
                <span>{pickLocaleText(locale, 'Notes', '备注')}</span>
                <textarea rows={3} value={evaluationRunForm.notes ?? ''} onChange={(event) => setEvaluationRunForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <button className="secondary-button" disabled={!evaluationSuites.length} type="submit">{pickLocaleText(locale, 'Execute Evaluation Run', '执行评测运行')}</button>
            </form>

            <div className="source-list">
              {evaluationRuns.map((run) => (
                <button key={run.id} className="source-card source-card--button" onClick={() => void handleSelectEvaluationRun(run.id)} type="button">
                  <div className="trace-list__item-topline">
                    <strong>{run.suite_name}</strong>
                    <span className="trace-status-badge">{run.status}</span>
                  </div>
                  <p>{run.execution_mode} · {run.provider} · {run.model_name}</p>
                  <div className="trace-list__item-metadata">
                    <span>{run.total_cases} {pickLocaleText(locale, 'cases', 'cases')}</span>
                    <span>{run.result_count} {pickLocaleText(locale, 'results', 'results')}</span>
                    <span>{run.prompt_version}</span>
                  </div>
                </button>
              ))}
              {!evaluationRuns.length ? <p className="placeholder-text">{pickLocaleText(locale, 'No evaluation run exists yet. Execute one suite to inspect the first judge result.', '还没有评测运行，先执行一个 suite 看第一版 judge 结果。')}</p> : null}
            </div>
          </section>

          <section className="panel integration-panel integration-panel--wide" id="evaluations-audit">
            <div className="panel__header">
              <div>
                <span className="section-kicker">Audit</span>
                <h2>{pickLocaleText(locale, 'Scoring and Audit Entry', '评分与审计入口')}</h2>
              </div>
              <span>{auditEvents.length} events</span>
            </div>

            <div className="integration-summary-grid">
              <article className="detail-metric-card">
                <span>Scored Traces</span>
                <strong>{scoredTraceCount}</strong>
                <small>{pickLocaleText(locale, 'Runs that already received manual scoring.', '已有人工作业评分的运行数')}</small>
              </article>
              <article className="detail-metric-card">
                <span>Passed Traces</span>
                <strong>{passedTraceCount}</strong>
                <small>{pickLocaleText(locale, 'Runs currently marked as pass.', '当前被标记为 pass 的运行数')}</small>
              </article>
              <article className="detail-metric-card">
                <span>Audit Events</span>
                <strong>{auditEvents.length}</strong>
                <small>{pickLocaleText(locale, 'allow / deny / review decision samples.', 'allow / deny / review 决策样本')}</small>
              </article>
            </div>

            <div className="detail-actions detail-actions--hero">
              <button className="secondary-button" onClick={() => setShowEvaluationInsights((current) => !current)} type="button">
                {showEvaluationInsights ? pickLocaleText(locale, 'Hide Insights', '收起结论') : pickLocaleText(locale, 'Show Insights', '展开结论')}
              </button>
            </div>
            <div className="insight-list insight-list--compact">
              {(showEvaluationInsights ? evaluationInsights : evaluationInsights.slice(0, 2)).map((item) => (
                <article key={item} className="insight-card">
                  <p>{item}</p>
                </article>
              ))}
            </div>

            {selectedEvaluationSuite ? (
              <section className="detail-output-card">
                <div className="panel__header panel__header--compact">
                  <h3>{pickLocaleText(locale, 'Selected Suite', '当前评测集')}</h3>
                  <div className="detail-actions">
                    <span>{selectedEvaluationSuite.case_count} cases</span>
                    <button className="secondary-button" onClick={() => setShowSelectedSuiteCases((current) => !current)} type="button">
                      {showSelectedSuiteCases ? pickLocaleText(locale, 'Hide Cases', '收起 cases') : pickLocaleText(locale, 'Show Cases', '展开 cases')}
                    </button>
                  </div>
                </div>
                {showSelectedSuiteCases ? (
                <div className="source-list">
                  {selectedEvaluationSuite.cases.map((item) => (
                    <article key={item.id} className="source-card">
                      <strong>{item.title}</strong>
                      <p>{truncateText(item.user_input, 140)}</p>
                      <small>{item.score_rubric ?? 'No rubric yet'}</small>
                    </article>
                  ))}
                </div>
                ) : null}
              </section>
            ) : null}

            {selectedEvaluationRun ? (
              <section className="detail-output-card">
                <div className="panel__header panel__header--compact">
                  <h3>{pickLocaleText(locale, 'Selected Run Results', '当前运行结果')}</h3>
                  <div className="detail-actions">
                    <span>{selectedEvaluationRun.average_score ?? 'n/a'} avg score</span>
                    <button className="secondary-button" onClick={() => setShowSelectedRunResults((current) => !current)} type="button">
                      {showSelectedRunResults ? pickLocaleText(locale, 'Hide Results', '收起结果') : pickLocaleText(locale, 'Show Results', '展开结果')}
                    </button>
                  </div>
                </div>
                {showSelectedRunResults ? (
                <div className="source-list">
                  {selectedEvaluationRun.results.map((result) => (
                    <article key={result.id} className="source-card">
                      <div className="trace-list__item-topline">
                        <strong>{result.case_title}</strong>
                        <span className="trace-status-badge">{result.quality_label ?? result.status}</span>
                      </div>
                      <p>{result.judge_summary ?? 'No judge summary yet.'}</p>
                      <div className="trace-list__item-metadata">
                        <span>{result.quality_score !== null ? `${result.quality_score} / 100` : 'No score'}</span>
                        <span>{result.trace_id ?? 'No trace linked'}</span>
                        <span>{result.review_count} reviews</span>
                        <span>{result.latest_review_label ?? 'No manual review'}</span>
                      </div>
                    </article>
                  ))}
                </div>
                ) : null}
              </section>
            ) : null}

            <form className="integration-form" onSubmit={handleCreateAuditEvent}>
              <div className="trace-form__grid">
                <label className="trace-form__field">
                  <span>Trace ID</span>
                  <input value={auditEventForm.trace_id ?? ''} onChange={(event) => setAuditEventForm((current) => ({ ...current, trace_id: event.target.value }))} placeholder="可关联当前 trace" />
                </label>
                <label className="trace-form__field">
                  <span>Step Index</span>
                  <input type="number" min={1} value={auditEventForm.step_index ?? ''} onChange={(event) => setAuditEventForm((current) => ({ ...current, step_index: event.target.value ? Number(event.target.value) : null }))} />
                </label>
                <label className="trace-form__field">
                  <span>Decision</span>
                  <select value={auditEventForm.decision} onChange={(event) => setAuditEventForm((current) => ({ ...current, decision: event.target.value as CreateAuditEventPayload['decision'] }))}>
                    <option value="allow">allow</option>
                    <option value="deny">deny</option>
                    <option value="review">review</option>
                  </select>
                </label>
                <label className="trace-form__field">
                  <span>Risk Level</span>
                  <select value={auditEventForm.risk_level} onChange={(event) => setAuditEventForm((current) => ({ ...current, risk_level: event.target.value as CreateAuditEventPayload['risk_level'] }))}>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </label>
                <label className="trace-form__field">
                  <span>Policy Name</span>
                  <input value={auditEventForm.policy_name} onChange={(event) => setAuditEventForm((current) => ({ ...current, policy_name: event.target.value }))} />
                </label>
                <label className="trace-form__field">
                  <span>Target</span>
                  <input value={auditEventForm.target_name} onChange={(event) => setAuditEventForm((current) => ({ ...current, target_name: event.target.value }))} />
                </label>
              </div>
              <label className="trace-form__field">
                <span>Reason</span>
                <textarea rows={3} value={auditEventForm.reason ?? ''} onChange={(event) => setAuditEventForm((current) => ({ ...current, reason: event.target.value }))} />
              </label>
              <button className="secondary-button" type="submit">Log Audit Event</button>
            </form>

            {evaluationError ? <p className="error-banner">{evaluationError}</p> : null}
            {evaluationRefreshing ? <p className="placeholder-text">Loading evaluation and audit data...</p> : null}

            <div className="detail-actions detail-actions--hero">
              <button className="secondary-button" onClick={() => setShowAuditEventHistory((current) => !current)} type="button">
                {showAuditEventHistory ? pickLocaleText(locale, 'Hide Audit History', '收起审计历史') : pickLocaleText(locale, 'Show Audit History', '展开审计历史')}
              </button>
            </div>
            {showAuditEventHistory ? (
            <div className="source-list">
              {auditEvents.map((event) => (
                <article key={event.id} className="source-card">
                  <div className="trace-list__item-topline">
                    <strong>{event.policy_name}</strong>
                    <span className="trace-status-badge">{event.decision}</span>
                  </div>
                  <p>{event.target_name} · {event.risk_level} risk</p>
                  <div className="trace-list__item-metadata">
                    <span>{event.trace_id ?? 'No trace'}</span>
                    <span>{new Date(event.created_at).toLocaleString()}</span>
                  </div>
                </article>
              ))}
              {!auditEvents.length ? <p className="placeholder-text">{pickLocaleText(locale, 'No audit event exists yet. Record one review or deny sample first.', '还没有审计事件，先记录一条 review/deny 样本。')}</p> : null}
            </div>
            ) : null}
          </section>
        </section>
      ) : null}

      {activeView === 'labs' ? (
        <section className="integration-grid">
          <section className="panel integration-panel" id="labs-scenarios">
            <div className="panel__header">
              <div>
                <span className="section-kicker">Scenarios</span>
                <h2>{pickLocaleText(locale, 'Scenario Lab', '场景实验室')}</h2>
              </div>
              <span>{demoScenarios.length} scenarios</span>
            </div>
            <p className="integration-lead">{pickLocaleText(locale, 'This page is dedicated to demoable scenarios and multi-version experiments so those entry points do not all pile into the evaluation page. It currently supports Code Debug, Paper / RAG, and Robotics / Embedded.', '这个页面专门承接可演示场景和多版本实验，避免把所有入口都堆在评测页里。当前已支持 Code Debug、Paper / RAG 和 Robotics / Embedded 三个场景。')}</p>

            <div className="lab-card-grid">
              {demoScenarios.map((scenario) => (
                <article key={scenario.id} className={selectedDemoScenarioId === scenario.id ? 'lab-card lab-card--active' : 'lab-card'}>
                  <div className="trace-list__item-topline">
                    <strong>{scenario.title}</strong>
                    <span className="trace-status-badge">{scenario.default_prompt_version}</span>
                  </div>
                  <p>{localizeKnownCopy(locale, scenario.description)}</p>
                  <small>{localizeKnownCopy(locale, scenario.capability_focus)}</small>
                  <div className="detail-actions">
                    <button className="secondary-button" onClick={() => setSelectedDemoScenarioId(scenario.id)} type="button">{pickLocaleText(locale, 'Select Scenario', '选中场景')}</button>
                    <button className="secondary-button" disabled={seedingDemo} onClick={() => void handleSeedDemoData(scenario.id)} type="button">
                      {seedingDemo && selectedDemoScenarioId === scenario.id ? pickLocaleText(locale, 'Seeding...', '注入中...') : pickLocaleText(locale, 'Seed Scenario', '注入该场景')}
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <section className="detail-output-card">
              <div className="panel__header panel__header--compact">
                <h3>{pickLocaleText(locale, 'Current Scenario Notes', '当前场景说明')}</h3>
                <span>{selectedDemoScenarioId}</span>
              </div>
              <p>
                {selectedDemoScenarioId === 'paper_rag'
                  ? pickLocaleText(locale, 'The Paper / RAG demo emphasizes reference-answer judging, citation coverage, and retrieval-miss review.', 'Paper / RAG Demo 会强调 reference answer judge、引用覆盖和 retrieval miss 的复盘。')
                  : selectedDemoScenarioId === 'robotics_embedded'
                    ? pickLocaleText(locale, 'The Robotics / Embedded demo emphasizes log-based diagnosis, navigation anomaly explanation, and manual review.', 'Robotics / Embedded Demo 会强调日志定位、导航异常解释和人工复核标注。')
                    : pickLocaleText(locale, 'The Code Debug demo emphasizes error analysis, tool-failure explanation, trace review, and audit events.', 'Code Debug Demo 会强调报错分析、工具失败解释、trace 复盘与审计事件。')}
              </p>
            </section>
          </section>

          <section className="panel integration-panel" id="labs-matrix">
            <div className="panel__header">
              <div>
                <span className="section-kicker">{pickLocaleText(locale, 'Matrix', '矩阵')}</span>
                <h2>{pickLocaleText(locale, 'Matrix Evaluation Entry', '矩阵评测入口')}</h2>
              </div>
              <span>{matrixResult ? `${matrixResult.created_runs.length} runs` : 'ready'}</span>
            </div>
            <p className="integration-lead">{pickLocaleText(locale, 'Start by running multiple provider/model/prompt combinations serially within one suite so the comparison path is proven end to end.', '第一版矩阵评测先按 suite 串行执行多组 provider/model/prompt 组合，目的是把多版本对照路径跑通。')}</p>

            {matrixResult ? (
              <div className="integration-summary-grid matrix-summary-grid">
                <article className="detail-metric-card">
                  <span>{pickLocaleText(locale, 'Experiment Label', '实验标签')}</span>
                  <strong>{matrixResult.experiment_label}</strong>
                  <small>{pickLocaleText(locale, `${matrixResult.created_runs.length} variants`, `${matrixResult.created_runs.length} 个变体`)}</small>
                </article>
                <article className="detail-metric-card">
                  <span>{pickLocaleText(locale, 'Best Variant', '最佳变体')}</span>
                  <strong>{matrixBestRun?.label ?? 'n/a'}</strong>
                  <small>{matrixBestRun?.average_score ?? 'n/a'} avg score</small>
                </article>
                <article className="detail-metric-card">
                  <span>{pickLocaleText(locale, 'Largest Score Spread', '最大分差')}</span>
                  <strong>{matrixScoreSpread}</strong>
                  <small>{pickLocaleText(locale, 'Helps verify whether prompt or model choices actually create separation.', '帮助快速判断 Prompt / Model 是否真的拉开差距')}</small>
                </article>
              </div>
            ) : null}

            <form className="integration-form" onSubmit={handleCreateEvaluationMatrixRun}>
              <div className="trace-form__grid">
                <label className="trace-form__field">
                  <span>Suite</span>
                  <select value={String(matrixForm.suite_id)} onChange={(event) => setMatrixForm((current) => ({ ...current, suite_id: Number(event.target.value) }))}>
                    {!evaluationSuites.length ? <option value="0">No suite available</option> : null}
                    {evaluationSuites.map((suite) => (
                      <option key={suite.id} value={String(suite.id)}>{suite.name}</option>
                    ))}
                  </select>
                </label>
                <label className="trace-form__field">
                  <span>Execution Mode</span>
                  <select value={matrixForm.execution_mode} onChange={(event) => setMatrixForm((current) => ({ ...current, execution_mode: event.target.value as ExecutionMode }))}>
                    <option value="mock">mock</option>
                    <option value="llm">llm</option>
                  </select>
                </label>
                <label className="trace-form__field">
                  <span>Experiment Label</span>
                  <input value={matrixForm.experiment_label} onChange={(event) => setMatrixForm((current) => ({ ...current, experiment_label: event.target.value }))} />
                </label>
                <label className="trace-form__field">
                  <span>{pickLocaleText(locale, 'Notes', '备注')}</span>
                  <input value={matrixForm.notes} onChange={(event) => setMatrixForm((current) => ({ ...current, notes: event.target.value }))} />
                </label>
              </div>
              <label className="trace-form__field">
                <span>Variants</span>
                <textarea rows={8} value={matrixForm.variantsText} onChange={(event) => setMatrixForm((current) => ({ ...current, variantsText: event.target.value }))} placeholder={pickLocaleText(locale, 'One variant per line using label|provider|model|prompt_version.', '每行一个变体，格式为 label|provider|model|prompt_version。')} />
              </label>
              <p className="integration-lead">{pickLocaleText(locale, 'One variant per line using label|provider|model|prompt_version.', '每行一个变体，格式为 label|provider|model|prompt_version。')}</p>
              <button className="secondary-button" disabled={matrixRunning || !evaluationSuites.length} type="submit">
                {matrixRunning ? pickLocaleText(locale, 'Running Matrix...', '矩阵评测执行中...') : pickLocaleText(locale, 'Run Matrix Evaluation', '执行矩阵评测')}
              </button>
            </form>

            {matrixResult ? (
              <div className="matrix-result-list">
                {matrixResult.created_runs.map((item) => (
                  <article key={item.run_id} className="source-card">
                    <div className="trace-list__item-topline">
                      <strong>{item.label}</strong>
                      <span className="trace-status-badge">{item.status}</span>
                    </div>
                    <p>{item.provider} · {item.model_name} · {item.prompt_version}</p>
                    <div className="trace-list__item-metadata">
                      <span>{item.average_score ?? 'n/a'} avg</span>
                      <span>{item.result_count} results</span>
                      <span>run #{item.run_id}</span>
                    </div>
                    <button className="secondary-button" onClick={() => void handleSelectEvaluationRun(item.run_id)} type="button">{pickLocaleText(locale, 'Open Run Detail', '查看运行详情')}</button>
                  </article>
                ))}
              </div>
            ) : null}

            <section className="detail-output-card">
              <div className="panel__header panel__header--compact">
                <h3>{pickLocaleText(locale, 'Experiment Summary', '实验聚合摘要')}</h3>
                <div className="detail-actions">
                  <button className="secondary-button" disabled={!experimentSummary} onClick={() => handleExportExperimentSummary('markdown')} type="button">{pickLocaleText(locale, 'Export Markdown', '导出 Markdown')}</button>
                  <button className="secondary-button" disabled={!experimentSummary} onClick={() => handleExportExperimentSummary('json')} type="button">{pickLocaleText(locale, 'Export JSON', '导出 JSON')}</button>
                  <button className="secondary-button" disabled={experimentSummaryLoading || !selectedEvaluationRun?.experiment_label} onClick={() => selectedEvaluationRun?.experiment_label ? void loadExperimentSummary(selectedEvaluationRun.experiment_label) : undefined} type="button">{experimentSummaryLoading ? pickLocaleText(locale, 'Refreshing...', '刷新中...') : pickLocaleText(locale, 'Refresh Summary', '刷新摘要')}</button>
                </div>
              </div>
              {experimentSummaryLoading ? <p className="placeholder-text">{pickLocaleText(locale, 'Refreshing experiment summary...', '正在汇总实验摘要...')}</p> : null}
              {experimentSummary ? (
                <>
                  <div className="integration-summary-grid matrix-summary-grid">
                    <article className="detail-metric-card">
                      <span>{pickLocaleText(locale, 'Experiment Label', '实验标签')}</span>
                      <strong>{experimentSummary.experiment_label}</strong>
                      <small>{experimentSummary.run_count} runs</small>
                    </article>
                    <article className="detail-metric-card">
                      <span>{pickLocaleText(locale, 'Average Run Score', '平均运行分')}</span>
                      <strong>{experimentSummary.average_run_score ?? 'n/a'}</strong>
                      <small>{experimentSummary.compared_case_count} cases</small>
                    </article>
                    <article className="detail-metric-card">
                      <span>{pickLocaleText(locale, 'Max Run Score Spread', '最大运行分差')}</span>
                      <strong>{experimentSummary.max_run_score_spread ?? 'n/a'}</strong>
                      <small>{experimentSummary.best_run_label ?? pickLocaleText(locale, 'No best run yet', '暂无最佳 run')}</small>
                    </article>
                  </div>
                  <div className="trace-form__grid experiment-filter-grid">
                    <label className="trace-form__field">
                      <span>Provider Filter</span>
                      <select value={experimentProviderFilter} onChange={(event) => setExperimentProviderFilter(event.target.value)}>
                        {experimentProviderOptions.map((item) => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <label className="trace-form__field">
                      <span>Prompt Filter</span>
                      <select value={experimentPromptFilter} onChange={(event) => setExperimentPromptFilter(event.target.value)}>
                        {experimentPromptOptions.map((item) => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <label className="trace-form__field">
                      <span>Case Search</span>
                      <input value={experimentCaseSearch} onChange={(event) => setExperimentCaseSearch(event.target.value)} placeholder={pickLocaleText(locale, 'Filter by case title', '按 case 标题过滤')} />
                    </label>
                  </div>
                  <div className="comparison-row-list">
                    {(showExperimentCaseSummaries ? experimentSummary.case_summaries : experimentSummary.case_summaries.slice(0, 4)).map((item) => (
                      <article key={item.case_id} className="comparison-row-card">
                        <div className="trace-list__item-topline">
                          <strong>{item.case_title}</strong>
                          <span className="delta-badge">spread {item.score_spread ?? 'n/a'}</span>
                        </div>
                        <div className="comparison-row-card__grid">
                          <div>
                            <span className="comparison-row-card__label">Scores</span>
                            <p>avg {item.average_score ?? 'n/a'} · best {item.best_score ?? 'n/a'} · worst {item.worst_score ?? 'n/a'}</p>
                          </div>
                          <div>
                            <span className="comparison-row-card__label">Labels</span>
                            <p>pass {item.pass_runs} · review {item.needs_review_runs} · fail {item.fail_runs}</p>
                          </div>
                        </div>
                        <small>review coverage {item.review_coverage}/{experimentSummary.run_count}</small>
                      </article>
                    ))}
                  </div>
                  <div className="detail-actions detail-actions--hero">
                    <button className="secondary-button" onClick={() => setShowExperimentCaseSummaries((current) => !current)} type="button">
                      {showExperimentCaseSummaries ? pickLocaleText(locale, 'Hide Case Summaries', '收起 case 摘要') : pickLocaleText(locale, 'Show All Case Summaries', '展开全部 case 摘要')}
                    </button>
                  </div>
                  <div className="experiment-matrix-card">
                    <div className="panel__header panel__header--compact">
                      <h3>{pickLocaleText(locale, 'Version Matrix', '版本矩阵')}</h3>
                      <div className="detail-actions">
                        <span>{filteredExperimentRunColumns.length} runs · {filteredExperimentMatrixRows.length} cases</span>
                        <button className="secondary-button" onClick={() => setShowExperimentMatrixDetails((current) => !current)} type="button">
                          {showExperimentMatrixDetails ? pickLocaleText(locale, 'Hide Matrix', '收起矩阵') : pickLocaleText(locale, 'Show Matrix', '展开矩阵')}
                        </button>
                      </div>
                    </div>
                    <p className="integration-lead">{pickLocaleText(locale, 'This table places each case across runs side by side with score, review, and adjudication so stability and conflicts are easy to spot.', '这里直接把每个 case 在各 run 下的 score、review 和 adjudication 并排展开，方便看稳定性和冲突点。')}</p>
                    {showExperimentMatrixDetails ? (
                    <div className="experiment-matrix-table">
                      <div className="experiment-matrix-row experiment-matrix-row--header">
                        <div className="experiment-matrix-cell experiment-matrix-cell--sticky">Case</div>
                        {filteredExperimentRunColumns.map((column) => (
                          <div key={column.run_id} className="experiment-matrix-cell">
                            <strong>{column.label}</strong>
                            <small>{column.model_name} · avg {column.average_score ?? 'n/a'}</small>
                          </div>
                        ))}
                      </div>
                      {filteredExperimentMatrixRows.map((row) => (
                        <div key={row.case_id} className="experiment-matrix-row">
                          <div className="experiment-matrix-cell experiment-matrix-cell--sticky">
                            <strong>{row.case_title}</strong>
                            <small>spread {row.score_spread ?? 'n/a'}</small>
                          </div>
                          {row.cells.map((cell) => (
                            <div
                              key={`${row.case_id}-${cell.run_id}`}
                              className={selectedExperimentCellKey === `${row.case_id}-${cell.run_id}` ? 'experiment-matrix-cell experiment-matrix-cell--interactive experiment-matrix-cell--active' : 'experiment-matrix-cell experiment-matrix-cell--interactive'}
                              onClick={() => handleFocusExperimentCell(cell.run_id, cell.result_id, `${row.case_id}-${cell.run_id}`)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  handleFocusExperimentCell(cell.run_id, cell.result_id, `${row.case_id}-${cell.run_id}`)
                                }
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <span>{cell.quality_label ?? 'n/a'} · {cell.quality_score ?? 'n/a'}</span>
                              <small>review {cell.latest_review_label ?? 'n/a'} · {cell.review_count}</small>
                              <small>adjudication {cell.adjudication_label ?? 'n/a'}</small>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                    ) : null}

                    {showExperimentMatrixDetails && selectedExperimentCellKey && selectedResult ? (
                      <section className="experiment-matrix-inspector">
                        <div className="panel__header panel__header--compact">
                          <h4>{pickLocaleText(locale, 'Selected Matrix Cell', '当前矩阵单元')}</h4>
                          <span>{selectedResult.case_title}</span>
                        </div>
                        <div className="comparison-row-card__grid">
                          <article className="detail-summary-card">
                            <span>{pickLocaleText(locale, 'Judge Summary', 'Judge 摘要')}</span>
                            <strong>{selectedResult.quality_label ?? 'n/a'} · {selectedResult.quality_score ?? 'n/a'}</strong>
                            <small>{selectedResult.judge_summary ?? pickLocaleText(locale, 'No judge summary yet.', '暂无 judge 摘要')}</small>
                          </article>
                          <article className="detail-summary-card">
                            <span>{pickLocaleText(locale, 'Review Status', '复核状态')}</span>
                            <strong>{selectedResult.latest_review_label ?? 'n/a'}</strong>
                            <small>{selectedResultLatestReviewNote ?? pickLocaleText(locale, 'No manual review summary yet.', '暂无人工复核摘要')}</small>
                          </article>
                        </div>
                        <div className="detail-actions">
                          <span className="placeholder-text">{pickLocaleText(locale, `Run #${selectedEvaluationRun?.id ?? 'n/a'} · ${selectedEvaluationRun?.provider ?? 'n/a'} · ${selectedEvaluationRun?.prompt_version ?? 'n/a'}`, `运行 #${selectedEvaluationRun?.id ?? 'n/a'} · ${selectedEvaluationRun?.provider ?? 'n/a'} · ${selectedEvaluationRun?.prompt_version ?? 'n/a'}`)}</span>
                          {selectedResult.trace_id ? (
                            <button className="secondary-button" onClick={() => handleOpenTraceFromMatrixCell(selectedResult.trace_id as string)} type="button">
                              {pickLocaleText(locale, 'Open Trace', '打开 Trace')} {truncateText(selectedResult.trace_id as string, 16)}
                            </button>
                          ) : null}
                        </div>
                      </section>
                    ) : null}
                  </div>
                </>
              ) : <p className="placeholder-text">{pickLocaleText(locale, 'Run a matrix evaluation or select a run with experiment_label to see the aggregate summary here.', '执行矩阵评测或选中带 experiment_label 的 run 后，这里会出现聚合摘要。')}</p>}
            </section>

            {selectedEvaluationRun ? (
              <section className="detail-output-card">
                <div className="panel__header panel__header--compact">
                  <h3>{pickLocaleText(locale, 'Multi-Run Compare Panel', '多运行对照面板')}</h3>
                  <span>{runComparison ? `${comparisonChangedCount} changed rows` : 'pick compare run'}</span>
                </div>
                <p className="integration-lead">{pickLocaleText(locale, 'Compare two runs within the same suite at case level. The first version emphasizes score changes, label changes, and review coverage differences.', '这里直接对同一 suite 的两次运行做 case 级对照。第一版先突出分数变化、标签变化和 review 覆盖差异。')}</p>
                <div className="trace-form__grid">
                  <label className="trace-form__field">
                    <span>Base Run</span>
                    <input disabled value={`#${selectedEvaluationRun.id} · ${selectedEvaluationRun.provider} · ${selectedEvaluationRun.prompt_version}`} />
                  </label>
                  <label className="trace-form__field">
                    <span>Compare Run</span>
                    <select value={String(comparisonRunId)} onChange={(event) => setComparisonRunId(Number(event.target.value))}>
                      <option value="0">{pickLocaleText(locale, 'Choose another run from the same suite', '请选择同 suite 的另一条 run')}</option>
                      {runComparisonCandidates.map((run) => (
                        <option key={run.id} value={String(run.id)}>{`#${run.id} · ${run.provider} · ${run.prompt_version} · ${run.average_score ?? 'n/a'}`}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {comparisonLoading ? <p className="placeholder-text">{pickLocaleText(locale, 'Loading run comparison...', '正在加载运行对照...')}</p> : null}

                {runComparison ? (
                  <>
                    <div className="integration-summary-grid matrix-summary-grid">
                      <article className="detail-metric-card">
                        <span>{pickLocaleText(locale, 'Changed Cases', '变化样本')}</span>
                        <strong>{comparisonChangedCount}</strong>
                        <small>{pickLocaleText(locale, 'Cases whose label or score changed.', '标签或分数出现变化的 case')}</small>
                      </article>
                      <article className="detail-metric-card">
                        <span>{pickLocaleText(locale, 'Improved Cases', '改善样本')}</span>
                        <strong>{comparisonImprovedCount}</strong>
                        <small>{pickLocaleText(locale, 'Cases where the compare run scored higher.', 'compare run 分数更高')}</small>
                      </article>
                      <article className="detail-metric-card">
                        <span>{pickLocaleText(locale, 'Regressed Cases', '回退样本')}</span>
                        <strong>{comparisonRegressedCount}</strong>
                        <small>{pickLocaleText(locale, 'Cases where the compare run scored lower.', 'compare run 分数更低')}</small>
                      </article>
                    </div>
                    <div className="comparison-row-list">
                      {runComparison.rows.map((row) => (
                        <article key={row.case_id} className={row.changed ? 'comparison-row-card comparison-row-card--changed' : 'comparison-row-card'}>
                          <div className="trace-list__item-topline">
                            <strong>{row.case_title}</strong>
                            <span className={row.score_delta === null ? 'trace-status-badge' : row.score_delta > 0 ? 'delta-badge delta-badge--positive' : row.score_delta < 0 ? 'delta-badge delta-badge--negative' : 'delta-badge'}>
                              {row.score_delta === null ? 'n/a' : row.score_delta > 0 ? `+${row.score_delta}` : `${row.score_delta}`}
                            </span>
                          </div>
                          <div className="comparison-row-card__grid">
                            <div>
                              <span className="comparison-row-card__label">Base</span>
                              <p>{row.base_label ?? 'n/a'} · {row.base_score ?? 'n/a'} · {row.base_review_count} reviews</p>
                            </div>
                            <div>
                              <span className="comparison-row-card__label">Compare</span>
                              <p>{row.compare_label ?? 'n/a'} · {row.compare_score ?? 'n/a'} · {row.compare_review_count} reviews</p>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="placeholder-text">选择同一个 suite 下的另一条 run 后，这里会展示 case 级差异。</p>
                )}
              </section>
            ) : null}
          </section>

          <section className="panel integration-panel integration-panel--wide" id="labs-review">
            <div className="panel__header">
              <div>
                <span className="section-kicker">Ground Truth</span>
                <h2>{pickLocaleText(locale, 'Case Scoring Scaffold', 'Case 判分骨架')}</h2>
              </div>
              <div className="panel__header-actions">
                <span>{selectedEvaluationSuite ? `${selectedEvaluationSuite.case_count} cases` : 'no suite selected'}</span>
                <button className="secondary-button" disabled={evaluationRefreshing} onClick={() => void refreshEvaluationHub()} type="button">
                  {evaluationRefreshing ? pickLocaleText(locale, 'Refreshing...', '刷新中...') : pickLocaleText(locale, 'Refresh Evaluation Data', '刷新评测数据')}
                </button>
              </div>
            </div>
            <p className="integration-lead">{pickLocaleText(locale, 'Expose each case\'s ground_truth_type, judge_guidance, and judge config first, then refine toward stronger judges and a fuller manual-review workflow.', '这里把 case 的 ground truth_type、judge_guidance 和 judge config 露出来，后面继续往更强 judge 和人工标注流细化。')}</p>

            {selectedEvaluationSuite ? (
              <div className="lab-card-grid">
                {selectedEvaluationSuite.cases.map((item) => (
                  <article key={item.id} className="lab-card">
                    <strong>{item.title}</strong>
                    <p>{truncateText(item.user_input, 140)}</p>
                    <small>{item.ground_truth_type} · {item.score_rubric ?? pickLocaleText(locale, 'No rubric yet', '暂无 rubric')}</small>
                    <span className="lab-card__meta">{item.judge_guidance ?? pickLocaleText(locale, 'No judge guidance yet', '暂无 judge guidance')}</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="placeholder-text">{pickLocaleText(locale, 'Select or create a suite in Evaluations before ground-truth configuration appears here.', '先在评测页选择或创建一个 suite，这里才会显示 case 的 ground truth 配置。')}</p>
            )}

            {selectedEvaluationRun ? (
              <section className="detail-output-card">
                <div className="panel__header panel__header--compact">
                  <h3>{pickLocaleText(locale, 'Manual Review Entry', '人工标注入口')}</h3>
                  <span>{selectedEvaluationRun.reviews.length} reviews</span>
                </div>
                <div className="integration-summary-grid matrix-summary-grid">
                  <article className="detail-metric-card">
                    <span>{pickLocaleText(locale, 'Pending Review', '待复核')}</span>
                    <strong>{evaluationReviewQueue?.pending_count ?? 0}</strong>
                    <small>{pickLocaleText(locale, 'No review yet or the judge and manual review still disagree.', '还没有 review 或 judge/人工不一致')}</small>
                  </article>
                  <article className="detail-metric-card">
                    <span>{pickLocaleText(locale, 'Pending Adjudication', '冲突待裁决')}</span>
                    <strong>{unresolvedConflictCount}</strong>
                    <small>{pickLocaleText(locale, 'Multiple reviews or judge results have not converged yet.', '多人 review 或 judge 结论仍未收敛')}</small>
                  </article>
                  <article className="detail-metric-card">
                    <span>{pickLocaleText(locale, 'Overdue Assignments', '超时指派')}</span>
                    <strong>{overdueReviewCount}</strong>
                    <small>{pickLocaleText(locale, 'Assignments already past due_at.', '已经超过 due_at 的复核任务')}</small>
                  </article>
                  <article className="detail-metric-card">
                    <span>{pickLocaleText(locale, 'Current Result Reviews', '当前结果 Reviews')}</span>
                    <strong>{selectedResultReviews.length}</strong>
                    <small>{pickLocaleText(locale, 'Quickly open the result\'s review history.', '方便直接查看该结果的复核历史')}</small>
                  </article>
                </div>

                <div className="detail-actions detail-actions--hero">
                  <label className="trace-form__field connector-lookback-field">
                    <span>{pickLocaleText(locale, 'Queue Filter', '队列过滤')}</span>
                    <select value={reviewQueueOnlyPending ? 'pending' : 'all'} onChange={(event) => setReviewQueueOnlyPending(event.target.value === 'pending')}>
                      <option value="pending">{pickLocaleText(locale, 'Pending only', '仅看待处理')}</option>
                      <option value="all">{pickLocaleText(locale, 'All items', '查看全部')}</option>
                    </select>
                  </label>
                  <span className="placeholder-text">{pickLocaleText(locale, 'Pending items prioritize manual_review, unreviewed results, and unfinished assignments.', '待处理会优先包含 manual_review、无人标注和指派未完成的结果。')}</span>
                </div>

                <div className="detail-actions detail-actions--hero">
                  <button className="secondary-button" onClick={() => setShowReviewQueueDetails((current) => !current)} type="button">
                    {showReviewQueueDetails ? pickLocaleText(locale, 'Hide Review Queue', '收起复核队列') : pickLocaleText(locale, 'Show Review Queue', '展开复核队列')}
                  </button>
                </div>

                {showReviewQueueDetails ? (
                <div className="review-queue-list">
                  {reviewQueueItems.slice(0, 6).map((item) => (
                    <article key={item.result_id} className="review-queue-card">
                      <div className="trace-list__item-topline">
                        <strong>{item.case_title}</strong>
                        <span className="trace-status-badge">{item.ground_truth_type}</span>
                      </div>
                      <p>{localizeKnownCopy(locale, item.queue_reason) ?? item.queue_reason}</p>
                      <div className="trace-list__item-metadata">
                        <span>{item.suite_name}</span>
                        <span>{item.quality_label ?? 'no judge'}</span>
                        <span>{item.review_count} reviews</span>
                        <span>{item.consensus_label ?? 'no consensus'}</span>
                        <span>{item.assignee_name ?? 'unassigned'}</span>
                      </div>
                      <div className="detail-actions">
                        {item.has_conflict ? <span className="delta-badge delta-badge--negative">{pickLocaleText(locale, 'Conflict', '冲突')}</span> : null}
                        {item.overdue ? <span className="delta-badge delta-badge--negative">{pickLocaleText(locale, 'Overdue', '已超时')}</span> : null}
                        {item.adjudication_label ? <span className="delta-badge delta-badge--positive">{pickLocaleText(locale, 'Adjudicated', '已裁决')} {item.adjudication_label}</span> : null}
                        {item.due_at ? <span className="delta-badge">{pickLocaleText(locale, 'Due', '截止')} {new Date(item.due_at).toLocaleString()}</span> : null}
                      </div>
                      <button className="secondary-button" onClick={() => handleFocusReviewQueueItem(item)} type="button">{pickLocaleText(locale, 'Focus Result', '定位到该结果')}</button>
                    </article>
                  ))}
                  {!reviewQueueItems.length ? <p className="placeholder-text">{pickLocaleText(locale, 'The review queue is empty, which means the first-pass manual review has caught up.', '当前 review 队列为空，说明至少第一版人工复核已经跟上了。')}</p> : null}
                </div>
                ) : null}

                <form className="integration-form" onSubmit={handleCreateEvaluationReview}>
                  <div className="trace-form__grid">
                    <label className="trace-form__field">
                      <span>Result</span>
                      <select value={String(reviewForm.result_id)} onChange={(event) => setReviewForm((current) => ({ ...current, result_id: Number(event.target.value) }))}>
                        {selectedEvaluationRun.results.map((result) => (
                          <option key={result.id} value={String(result.id)}>{result.case_title} · {result.quality_label ?? result.status}</option>
                        ))}
                      </select>
                    </label>
                    <label className="trace-form__field">
                      <span>Reviewer</span>
                      <input value={reviewForm.reviewer_name} onChange={(event) => setReviewForm((current) => ({ ...current, reviewer_name: event.target.value }))} />
                    </label>
                    <label className="trace-form__field">
                      <span>Review Label</span>
                      <select value={reviewForm.review_label} onChange={(event) => setReviewForm((current) => ({ ...current, review_label: event.target.value as QualityLabel }))}>
                        <option value="pass">pass</option>
                        <option value="needs_review">needs_review</option>
                        <option value="fail">fail</option>
                      </select>
                    </label>
                    <label className="trace-form__field">
                      <span>Review Score</span>
                      <input type="number" min={0} max={100} value={reviewForm.review_score} onChange={(event) => setReviewForm((current) => ({ ...current, review_score: event.target.value }))} />
                    </label>
                  </div>
                  <label className="trace-form__field">
                    <span>Review Notes</span>
                    <textarea rows={4} value={reviewForm.review_notes} onChange={(event) => setReviewForm((current) => ({ ...current, review_notes: event.target.value }))} />
                  </label>
                  <button className="secondary-button" disabled={reviewSubmitting} type="submit">
                    {reviewSubmitting ? pickLocaleText(locale, 'Submitting Review...', '提交人工标注中...') : pickLocaleText(locale, 'Submit Manual Review', '提交人工标注')}
                  </button>
                </form>

                <form className="integration-form" onSubmit={handleCreateReviewAssignment}>
                  <div className="panel__header panel__header--compact">
                    <h3>{pickLocaleText(locale, 'Review Assignment', '复核指派')}</h3>
                    <span>{selectedQueueItem?.assignee_name ?? pickLocaleText(locale, 'Unassigned', '未指派')}</span>
                  </div>
                  <div className="trace-form__grid">
                    <label className="trace-form__field">
                      <span>Result</span>
                      <select value={String(reviewAssignmentForm.result_id)} onChange={(event) => setReviewAssignmentForm((current) => ({ ...current, result_id: Number(event.target.value) }))}>
                        {selectedEvaluationRun.results.map((result) => (
                          <option key={result.id} value={String(result.id)}>{result.case_title} · {result.quality_label ?? result.status}</option>
                        ))}
                      </select>
                    </label>
                    <label className="trace-form__field">
                      <span>Assignee</span>
                      <input value={reviewAssignmentForm.assignee_name} onChange={(event) => setReviewAssignmentForm((current) => ({ ...current, assignee_name: event.target.value }))} />
                    </label>
                    <label className="trace-form__field">
                      <span>Status</span>
                      <select value={reviewAssignmentForm.assignment_status} onChange={(event) => setReviewAssignmentForm((current) => ({ ...current, assignment_status: event.target.value as 'pending' | 'in_progress' | 'done' }))}>
                        <option value="pending">pending</option>
                        <option value="in_progress">in_progress</option>
                        <option value="done">done</option>
                      </select>
                    </label>
                    <label className="trace-form__field">
                      <span>Priority</span>
                      <select value={reviewAssignmentForm.priority} onChange={(event) => setReviewAssignmentForm((current) => ({ ...current, priority: event.target.value as 'low' | 'medium' | 'high' }))}>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </label>
                    <label className="trace-form__field">
                      <span>Due At</span>
                      <input type="datetime-local" value={reviewAssignmentForm.due_at} onChange={(event) => setReviewAssignmentForm((current) => ({ ...current, due_at: event.target.value }))} />
                    </label>
                  </div>
                  <label className="trace-form__field">
                    <span>Assignment Notes</span>
                    <textarea rows={3} value={reviewAssignmentForm.assignment_notes} onChange={(event) => setReviewAssignmentForm((current) => ({ ...current, assignment_notes: event.target.value }))} />
                  </label>
                  <button className="secondary-button" disabled={assignmentSubmitting} type="submit">
                    {assignmentSubmitting ? pickLocaleText(locale, 'Assigning...', '指派中...') : pickLocaleText(locale, 'Create Review Assignment', '创建复核指派')}
                  </button>
                </form>

                <form className="integration-form" onSubmit={handleAdjudicateResult}>
                  <div className="panel__header panel__header--compact">
                    <h3>{pickLocaleText(locale, 'Final Adjudication', '最终裁决')}</h3>
                    <span>{selectedResult?.adjudication_label ?? pickLocaleText(locale, 'Not adjudicated', '未裁决')}</span>
                  </div>
                  <div className="trace-form__grid">
                    <label className="trace-form__field">
                      <span>Result</span>
                      <select value={String(adjudicationForm.result_id)} onChange={(event) => setAdjudicationForm((current) => ({ ...current, result_id: Number(event.target.value) }))}>
                        {selectedEvaluationRun.results.map((result) => (
                          <option key={result.id} value={String(result.id)}>{result.case_title} · {result.quality_label ?? result.status}</option>
                        ))}
                      </select>
                    </label>
                    <label className="trace-form__field">
                      <span>Adjudicator</span>
                      <input value={adjudicationForm.adjudicated_by} onChange={(event) => setAdjudicationForm((current) => ({ ...current, adjudicated_by: event.target.value }))} />
                    </label>
                    <label className="trace-form__field">
                      <span>Final Label</span>
                      <select value={adjudicationForm.adjudication_label} onChange={(event) => setAdjudicationForm((current) => ({ ...current, adjudication_label: event.target.value as QualityLabel }))}>
                        <option value="pass">pass</option>
                        <option value="needs_review">needs_review</option>
                        <option value="fail">fail</option>
                      </select>
                    </label>
                    <label className="trace-form__field">
                      <span>Final Score</span>
                      <input type="number" min={0} max={100} value={adjudicationForm.adjudication_score} onChange={(event) => setAdjudicationForm((current) => ({ ...current, adjudication_score: event.target.value }))} />
                    </label>
                  </div>
                  <label className="trace-form__field">
                    <span>Adjudication Notes</span>
                    <textarea rows={3} value={adjudicationForm.adjudication_notes} onChange={(event) => setAdjudicationForm((current) => ({ ...current, adjudication_notes: event.target.value }))} />
                  </label>
                  <label className="trace-form__field review-checkbox-field">
                    <span>{pickLocaleText(locale, 'Close the latest assignment automatically after adjudication', '完成后自动关闭最新指派')}</span>
                    <input checked={adjudicationForm.mark_latest_assignment_done} onChange={(event) => setAdjudicationForm((current) => ({ ...current, mark_latest_assignment_done: event.target.checked }))} type="checkbox" />
                  </label>
                  <button className="secondary-button" disabled={adjudicationSubmitting} type="submit">
                    {adjudicationSubmitting ? pickLocaleText(locale, 'Adjudicating...', '裁决提交中...') : pickLocaleText(locale, 'Submit Final Adjudication', '提交最终裁决')}
                  </button>
                </form>

                {selectedResult?.adjudication_label ? (
                  <article className="detail-summary-card detail-summary-card--wide">
                    <span>{pickLocaleText(locale, 'Current Result Adjudication', '当前结果裁决')}</span>
                    <strong>{selectedResult.adjudication_label} · {selectedResult.adjudication_score ?? 'n/a'}</strong>
                    <small>{selectedResult.adjudicated_by ?? 'unknown'} · {selectedResult.adjudicated_at ? new Date(selectedResult.adjudicated_at).toLocaleString() : pickLocaleText(locale, 'No adjudication time yet.', '暂无时间')}</small>
                    <p>{selectedResult.adjudication_notes ?? pickLocaleText(locale, 'No adjudication note yet.', '暂无裁决备注。')}</p>
                  </article>
                ) : null}

                <div className="source-list review-list">
                  {selectedResultReviews.map((review: EvaluationResultReview) => (
                    <article key={review.id} className="source-card">
                      <div className="trace-list__item-topline">
                        <strong>{review.reviewer_name}</strong>
                        <span className="trace-status-badge">{review.review_label}</span>
                      </div>
                      <p>{review.review_notes ?? 'No review notes yet.'}</p>
                      <div className="trace-list__item-metadata">
                        <span>{review.review_score !== null ? `${review.review_score} / 100` : 'No score'}</span>
                        <span>{new Date(review.created_at).toLocaleString()}</span>
                      </div>
                    </article>
                  ))}
                  {!selectedResultReviews.length ? <p className="placeholder-text">{pickLocaleText(locale, 'There is no review on the current result yet. Add one review sample first.', '当前结果还没有人工标注，可以先补一条 review 样本。')}</p> : null}
                </div>
              </section>
            ) : null}

            {evaluationError ? <p className="error-banner">{evaluationError}</p> : null}
          </section>
        </section>
      ) : null}
        </div>
      </div>
    </main>
  )
}

export default App
