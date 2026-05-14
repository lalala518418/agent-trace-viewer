export type ExecutionMode = 'mock' | 'llm'
export type QualityLabel = 'pass' | 'needs_review' | 'fail'

export interface CreateTracePayload {
  user_input: string
  execution_mode: ExecutionMode
  provider: string
  model_name: string
  prompt_version: string
}

export interface TraceListItem {
  id: string
  task_input: string
  task_type: string
  final_output: string
  status: string
  total_latency_ms: number
  execution_mode: ExecutionMode
  provider: string
  model_name: string
  prompt_version: string
  replay_source_trace_id: string | null
  quality_label: QualityLabel | null
  quality_score: number | null
  quality_notes: string | null
  token_usage: number
  input_token_usage: number
  output_token_usage: number
  cached_token_usage: number
  created_at: string
  step_count: number
  tool_call_count: number
  error_count: number
  latest_step_title: string | null
}

export interface RunConfigSnapshot {
  user_input: string
  execution_mode: ExecutionMode
  provider: string
  normalized_provider?: string
  model_name: string
  prompt_version: string
  base_url?: string
  temperature?: number
  api_key_env_name?: string
  system_prompt?: string
}

export interface TraceStep {
  id: number
  step_index: number
  step_type: string
  title: string
  detail: string
  tool_name: string | null
  tool_input: string | null
  tool_output: string | null
  status: string
  latency_ms: number
  error_message: string | null
}

export interface TraceDetail extends TraceListItem {
  run_config_snapshot: RunConfigSnapshot | null
  steps: TraceStep[]
}

export interface PromptVersionOption {
  version: string
  label: string
  label_zh: string
  description: string
  description_zh: string
  system_prompt: string
  system_prompt_zh: string
  recommended_model: string
  focus: string
  focus_zh: string
}

export interface UpdatePromptVersionPayload {
  version: string
  label: string
  label_zh: string
  description: string
  description_zh: string
  system_prompt: string
  system_prompt_zh: string
  recommended_model: string
  focus: string
  focus_zh: string
}

export interface TraceStatsPoint {
  date: string
  run_count: number
  completed_count: number
  failed_count: number
  avg_latency_ms: number
  total_tokens: number
}

export interface TraceBreakdownItem {
  key: string
  count: number
}

export interface TraceStats {
  total_runs: number
  completed_runs: number
  failed_runs: number
  avg_latency_ms: number
  total_tokens: number
  time_range_days: number
  timeline: TraceStatsPoint[]
  prompt_version_breakdown: TraceBreakdownItem[]
  provider_breakdown: TraceBreakdownItem[]
}

export type IntegrationAccessMode = 'manual' | 'api' | 'import'

export interface CreateIntegrationSourcePayload {
  name: string
  platform_name: string
  access_mode: IntegrationAccessMode
  provider: string
  base_url?: string | null
  api_key_hint?: string | null
  notes?: string | null
}

export interface IntegrationSource {
  id: number
  name: string
  platform_name: string
  access_mode: IntegrationAccessMode
  provider: string
  base_url: string | null
  api_key_hint: string | null
  status: string
  notes: string | null
  created_at: string
  usage_record_count: number
}

export interface CreateExternalUsagePayload {
  source_id: number
  model_name: string
  run_count: number
  token_usage: number
  input_token_usage: number
  output_token_usage: number
  cached_token_usage: number
  cost_usd: number
  external_reference?: string | null
  notes?: string | null
  recorded_at?: string | null
}

export interface ExternalUsageImportItem {
  source_name: string
  platform_name: string
  access_mode?: IntegrationAccessMode
  provider: string
  base_url?: string | null
  api_key_hint?: string | null
  model_name: string
  run_count: number
  token_usage: number
  input_token_usage?: number
  output_token_usage?: number
  cached_token_usage?: number
  cost_usd?: number
  external_reference?: string | null
  notes?: string | null
  recorded_at?: string | null
}

export interface ImportExternalUsagePayload {
  records: ExternalUsageImportItem[]
}

export interface ExternalUsageImportResult {
  created_source_count: number
  reused_source_count: number
  created_record_count: number
  skipped_duplicate_count: number
  created_records: ExternalUsageRecord[]
}

export interface ExternalUsageRecord {
  id: number
  source_id: number
  source_name: string
  platform_name: string
  access_mode: IntegrationAccessMode
  provider: string
  model_name: string
  run_count: number
  token_usage: number
  input_token_usage: number
  output_token_usage: number
  cached_token_usage: number
  cost_usd: number
  external_reference: string | null
  notes: string | null
  recorded_at: string
}

export interface ExternalUsageStatsPoint {
  date: string
  run_count: number
  token_usage: number
  cost_usd: number
}

export interface ExternalUsageStats {
  total_runs: number
  total_tokens: number
  total_cost_usd: number
  time_range_days: number
  timeline: ExternalUsageStatsPoint[]
  platform_breakdown: TraceBreakdownItem[]
  provider_breakdown: TraceBreakdownItem[]
}

export interface ExternalUsageValidationCheck {
  provider: string
  model_name: string
  display_name: string
  record_count: number
  total_runs: number
  token_usage: number
  input_token_usage: number
  output_token_usage: number
  cached_token_usage: number
  actual_cost_usd: number
  estimated_cost_usd: number | null
  delta_cost_usd: number | null
  status: string
  official_source_url: string | null
  official_source_label: string | null
  billing_formula: string | null
  reviewed_at: string | null
  notes: string
}

export interface ExternalUsageValidation {
  time_range_days: number
  source_id: number | null
  checked_record_count: number
  supported_check_count: number
  unsupported_check_count: number
  total_actual_cost_usd: number
  total_estimated_cost_usd: number | null
  total_delta_cost_usd: number | null
  checks: ExternalUsageValidationCheck[]
}

export interface ExternalConnectorTemplate {
  id: string
  title: string
  platform_name: string
  provider: string
  access_mode: IntegrationAccessMode
  base_url: string | null
  api_key_hint: string | null
  default_model_name: string
  sync_frequency_hint: string
  description: string
}

export interface SyncExternalConnectorPayload {
  connector_id: string
  lookback_days: number
}

export interface ExternalConnectorSyncResult {
  connector: ExternalConnectorTemplate
  source: IntegrationSource
  created_records: ExternalUsageRecord[]
}

export interface ExternalConnectorSyncJob {
  id: number
  connector_id: string
  connector_title: string
  source_id: number | null
  source_name: string | null
  status: string
  lookback_days: number
  created_record_count: number
  error_message: string | null
  created_at: string
}

export interface TraceScorePayload {
  quality_label: QualityLabel
  quality_score?: number | null
  quality_notes?: string | null
}

export interface EvaluationCase {
  id: number
  title: string
  user_input: string
  expected_output: string | null
  ground_truth_type: 'keyword' | 'reference_answer' | 'manual_review'
  judge_guidance: string | null
  judge_config_json: string | null
  score_rubric: string | null
  created_at: string
}

export interface EvaluationCaseResult {
  id: number
  case_id: number
  case_title: string
  trace_id: string | null
  status: string
  quality_label: QualityLabel | null
  quality_score: number | null
  judge_summary: string | null
  adjudication_label: QualityLabel | null
  adjudication_score: number | null
  adjudication_notes: string | null
  adjudicated_by: string | null
  adjudicated_at: string | null
  latest_review_label: QualityLabel | null
  latest_review_score: number | null
  review_count: number
  created_at: string
}

export interface EvaluationResultReview {
  id: number
  result_id: number
  reviewer_name: string
  review_label: QualityLabel
  review_score: number | null
  review_notes: string | null
  created_at: string
}

export interface CreateEvaluationSuitePayload {
  name: string
  description?: string | null
  cases: Array<{
    title: string
    user_input: string
    expected_output?: string | null
    ground_truth_type?: 'keyword' | 'reference_answer' | 'manual_review'
    judge_guidance?: string | null
    judge_config_json?: string | null
    score_rubric?: string | null
  }>
}

export interface EvaluationSuiteListItem {
  id: number
  name: string
  description: string | null
  status: string
  created_at: string
  case_count: number
  run_count: number
}

export interface EvaluationSuiteDetail extends EvaluationSuiteListItem {
  cases: EvaluationCase[]
}

export interface CreateEvaluationRunPayload {
  suite_id: number
  execution_mode: ExecutionMode
  provider: string
  model_name: string
  prompt_version: string
  experiment_label?: string | null
  notes?: string | null
}

export interface EvaluationRun {
  id: number
  suite_id: number
  suite_name: string
  status: string
  execution_mode: ExecutionMode
  provider: string
  model_name: string
  prompt_version: string
  experiment_label: string | null
  total_cases: number
  completed_cases: number
  average_score: number | null
  result_count: number
  notes: string | null
  created_at: string
}

export interface EvaluationRunDetail extends EvaluationRun {
  results: EvaluationCaseResult[]
  reviews: EvaluationResultReview[]
}

export interface EvaluationRunComparisonRow {
  case_id: number
  case_title: string
  base_result_id: number
  compare_result_id: number
  base_label: QualityLabel | null
  compare_label: QualityLabel | null
  base_score: number | null
  compare_score: number | null
  score_delta: number | null
  base_review_count: number
  compare_review_count: number
  changed: boolean
}

export interface EvaluationRunComparison {
  base_run: EvaluationRun
  compare_run: EvaluationRun
  rows: EvaluationRunComparisonRow[]
}

export interface EvaluationReviewQueueItem {
  result_id: number
  run_id: number
  suite_id: number
  suite_name: string
  case_id: number
  case_title: string
  ground_truth_type: 'keyword' | 'reference_answer' | 'manual_review'
  quality_label: QualityLabel | null
  quality_score: number | null
  latest_review_label: QualityLabel | null
  latest_review_score: number | null
  review_count: number
  consensus_label: QualityLabel | null
  consensus_score: number | null
  assignment_id: number | null
  assignee_name: string | null
  assignment_status: 'pending' | 'in_progress' | 'done' | null
  priority: 'low' | 'medium' | 'high' | null
  due_at: string | null
  overdue: boolean
  has_conflict: boolean
  adjudication_label: QualityLabel | null
  queue_reason: string
  created_at: string
}

export interface EvaluationReviewQueue {
  pending_count: number
  reviewed_count: number
  items: EvaluationReviewQueueItem[]
}

export interface CreateEvaluationReviewAssignmentPayload {
  assignee_name: string
  assignment_status: 'pending' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  assignment_notes?: string | null
  due_at?: string | null
}

export interface EvaluationReviewAssignment {
  id: number
  result_id: number
  assignee_name: string
  assignment_status: 'pending' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  assignment_notes: string | null
  due_at: string | null
  created_at: string
}

export interface CreateEvaluationAdjudicationPayload {
  adjudicated_by: string
  adjudication_label: QualityLabel
  adjudication_score?: number | null
  adjudication_notes?: string | null
  mark_latest_assignment_done: boolean
}

export interface EvaluationResultAdjudication {
  result_id: number
  adjudicated_by: string
  adjudication_label: QualityLabel
  adjudication_score: number | null
  adjudication_notes: string | null
  adjudicated_at: string
}

export interface CreateEvaluationMatrixPayload {
  suite_id: number
  execution_mode: ExecutionMode
  experiment_label: string
  variants: Array<{
    label: string
    provider: string
    model_name: string
    prompt_version: string
  }>
  notes?: string | null
}

export interface EvaluationMatrixRunResult {
  suite_id: number
  suite_name: string
  execution_mode: ExecutionMode
  experiment_label: string
  created_runs: Array<{
    run_id: number
    label: string
    provider: string
    model_name: string
    prompt_version: string
    average_score: number | null
    result_count: number
    status: string
  }>
}

export interface EvaluationExperimentCaseSummary {
  case_id: number
  case_title: string
  average_score: number | null
  best_score: number | null
  worst_score: number | null
  score_spread: number | null
  pass_runs: number
  fail_runs: number
  needs_review_runs: number
  review_coverage: number
}

export interface EvaluationExperimentRunColumn {
  run_id: number
  label: string
  provider: string
  model_name: string
  prompt_version: string
  average_score: number | null
}

export interface EvaluationExperimentMatrixCell {
  run_id: number
  result_id: number | null
  trace_id: string | null
  quality_label: QualityLabel | null
  quality_score: number | null
  judge_summary: string | null
  latest_review_label: QualityLabel | null
  latest_review_score: number | null
  latest_review_notes: string | null
  review_count: number
  adjudication_label: QualityLabel | null
}

export interface EvaluationExperimentMatrixRow {
  case_id: number
  case_title: string
  score_spread: number | null
  cells: EvaluationExperimentMatrixCell[]
}

export interface EvaluationExperimentSummary {
  experiment_label: string
  suite_id: number
  suite_name: string
  run_count: number
  compared_case_count: number
  best_run_id: number | null
  best_run_label: string | null
  best_average_score: number | null
  average_run_score: number | null
  max_run_score_spread: number | null
  runs: EvaluationRun[]
  run_columns: EvaluationExperimentRunColumn[]
  case_summaries: EvaluationExperimentCaseSummary[]
  matrix_rows: EvaluationExperimentMatrixRow[]
}

export interface DemoScenario {
  id: 'code_debug' | 'paper_rag' | 'robotics_embedded'
  title: string
  description: string
  capability_focus: string
  default_prompt_version: string
}

export interface DemoSeedResult {
  scenario_id: 'code_debug' | 'paper_rag' | 'robotics_embedded' | 'all'
  created_trace_ids: string[]
  created_suite_id: number
  created_run_id: number
  created_audit_event_ids: number[]
}

export interface CreateEvaluationReviewPayload {
  reviewer_name: string
  review_label: QualityLabel
  review_score?: number | null
  review_notes?: string | null
}

export interface CreateAuditEventPayload {
  trace_id?: string | null
  step_index?: number | null
  event_type: string
  decision: 'allow' | 'deny' | 'review'
  risk_level: 'low' | 'medium' | 'high'
  policy_name: string
  target_name: string
  reason?: string | null
  status: string
}

export interface AuditEvent {
  id: number
  trace_id: string | null
  step_index: number | null
  event_type: string
  decision: 'allow' | 'deny' | 'review'
  risk_level: 'low' | 'medium' | 'high'
  policy_name: string
  target_name: string
  reason: string | null
  status: string
  created_at: string
}