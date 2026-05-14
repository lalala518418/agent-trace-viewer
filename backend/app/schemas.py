from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class RunTraceRequest(BaseModel):
    user_input: str = Field(min_length=1, max_length=2000)
    execution_mode: Literal["mock", "llm"] = "mock"
    provider: str = Field(default="openai-compatible", max_length=100)
    model_name: str = Field(default="gpt-4.1-mini", max_length=100)
    prompt_version: str = Field(default="v0", max_length=50)


class TraceStepResponse(BaseModel):
    id: int
    step_index: int
    step_type: str
    title: str
    detail: str
    tool_name: str | None
    tool_input: str | None
    tool_output: str | None
    status: str
    latency_ms: float
    error_message: str | None

    model_config = {"from_attributes": True}


class TraceListItemResponse(BaseModel):
    id: str
    task_input: str
    task_type: str
    final_output: str
    status: str
    total_latency_ms: float
    execution_mode: str
    provider: str
    model_name: str
    prompt_version: str
    replay_source_trace_id: str | None
    quality_label: str | None
    quality_score: float | None
    quality_notes: str | None
    token_usage: int
    input_token_usage: int
    output_token_usage: int
    cached_token_usage: int
    created_at: datetime
    step_count: int
    tool_call_count: int
    error_count: int
    latest_step_title: str | None

    model_config = {"from_attributes": True}


class TraceDetailResponse(TraceListItemResponse):
    run_config_snapshot: dict[str, Any] | None
    steps: list[TraceStepResponse]


class PromptVersionResponse(BaseModel):
    version: str
    label: str
    description: str
    recommended_model: str
    focus: str


class TraceStatsPointResponse(BaseModel):
    date: str
    run_count: int
    completed_count: int
    failed_count: int
    avg_latency_ms: float
    total_tokens: int


class TraceBreakdownItemResponse(BaseModel):
    key: str
    count: int


class TraceStatsResponse(BaseModel):
    total_runs: int
    completed_runs: int
    failed_runs: int
    avg_latency_ms: float
    total_tokens: int
    time_range_days: int
    timeline: list[TraceStatsPointResponse]
    prompt_version_breakdown: list[TraceBreakdownItemResponse]
    provider_breakdown: list[TraceBreakdownItemResponse]


class TraceScoreUpdateRequest(BaseModel):
    quality_label: Literal["pass", "needs_review", "fail"]
    quality_score: float | None = Field(default=None, ge=0, le=100)
    quality_notes: str | None = Field(default=None, max_length=2000)


class EvaluationCaseCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    user_input: str = Field(min_length=1, max_length=4000)
    expected_output: str | None = Field(default=None, max_length=4000)
    ground_truth_type: Literal["keyword", "reference_answer", "manual_review"] = "keyword"
    judge_guidance: str | None = Field(default=None, max_length=2000)
    judge_config_json: str | None = Field(default=None, max_length=4000)
    score_rubric: str | None = Field(default=None, max_length=2000)


class EvaluationCaseResponse(BaseModel):
    id: int
    title: str
    user_input: str
    expected_output: str | None
    ground_truth_type: str
    judge_guidance: str | None
    judge_config_json: str | None
    score_rubric: str | None
    created_at: datetime


class EvaluationCaseResultResponse(BaseModel):
    id: int
    case_id: int
    case_title: str
    trace_id: str | None
    status: str
    quality_label: str | None
    quality_score: float | None
    judge_summary: str | None
    adjudication_label: str | None
    adjudication_score: float | None
    adjudication_notes: str | None
    adjudicated_by: str | None
    adjudicated_at: datetime | None
    latest_review_label: str | None
    latest_review_score: float | None
    review_count: int
    created_at: datetime


class EvaluationResultReviewCreateRequest(BaseModel):
    reviewer_name: str = Field(default="anonymous-reviewer", min_length=1, max_length=100)
    review_label: Literal["pass", "needs_review", "fail"] = "needs_review"
    review_score: float | None = Field(default=None, ge=0, le=100)
    review_notes: str | None = Field(default=None, max_length=2000)


class EvaluationResultReviewResponse(BaseModel):
    id: int
    result_id: int
    reviewer_name: str
    review_label: str
    review_score: float | None
    review_notes: str | None
    created_at: datetime


class EvaluationSuiteCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    cases: list[EvaluationCaseCreateRequest] = Field(default_factory=list, max_length=100)


class EvaluationSuiteListItemResponse(BaseModel):
    id: int
    name: str
    description: str | None
    status: str
    created_at: datetime
    case_count: int
    run_count: int


class EvaluationSuiteDetailResponse(EvaluationSuiteListItemResponse):
    cases: list[EvaluationCaseResponse]


class EvaluationRunCreateRequest(BaseModel):
    suite_id: int
    execution_mode: Literal["mock", "llm"] = "mock"
    provider: str = Field(default="openai-compatible", max_length=100)
    model_name: str = Field(default="gpt-4.1-mini", max_length=100)
    prompt_version: str = Field(default="v0", max_length=50)
    experiment_label: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)


class EvaluationRunResponse(BaseModel):
    id: int
    suite_id: int
    suite_name: str
    status: str
    execution_mode: str
    provider: str
    model_name: str
    prompt_version: str
    experiment_label: str | None
    total_cases: int
    completed_cases: int
    average_score: float | None
    result_count: int
    notes: str | None
    created_at: datetime


class EvaluationRunDetailResponse(EvaluationRunResponse):
    results: list[EvaluationCaseResultResponse]
    reviews: list[EvaluationResultReviewResponse]


class EvaluationRunCompareRowResponse(BaseModel):
    case_id: int
    case_title: str
    base_result_id: int
    compare_result_id: int
    base_label: str | None
    compare_label: str | None
    base_score: float | None
    compare_score: float | None
    score_delta: float | None
    base_review_count: int
    compare_review_count: int
    changed: bool


class EvaluationRunCompareResponse(BaseModel):
    base_run: EvaluationRunResponse
    compare_run: EvaluationRunResponse
    rows: list[EvaluationRunCompareRowResponse]


class EvaluationReviewQueueItemResponse(BaseModel):
    result_id: int
    run_id: int
    suite_id: int
    suite_name: str
    case_id: int
    case_title: str
    ground_truth_type: str
    quality_label: str | None
    quality_score: float | None
    latest_review_label: str | None
    latest_review_score: float | None
    review_count: int
    consensus_label: str | None
    consensus_score: float | None
    assignment_id: int | None
    assignee_name: str | None
    assignment_status: str | None
    priority: str | None
    due_at: datetime | None
    overdue: bool
    has_conflict: bool
    adjudication_label: str | None
    queue_reason: str
    created_at: datetime


class EvaluationReviewQueueResponse(BaseModel):
    pending_count: int
    reviewed_count: int
    items: list[EvaluationReviewQueueItemResponse]


class EvaluationReviewAssignmentCreateRequest(BaseModel):
    assignee_name: str = Field(min_length=1, max_length=100)
    assignment_status: Literal["pending", "in_progress", "done"] = "pending"
    priority: Literal["low", "medium", "high"] = "medium"
    assignment_notes: str | None = Field(default=None, max_length=2000)
    due_at: datetime | None = None


class EvaluationReviewAssignmentResponse(BaseModel):
    id: int
    result_id: int
    assignee_name: str
    assignment_status: str
    priority: str
    assignment_notes: str | None
    due_at: datetime | None
    created_at: datetime


class EvaluationResultAdjudicationCreateRequest(BaseModel):
    adjudicated_by: str = Field(default="lead-reviewer", min_length=1, max_length=100)
    adjudication_label: Literal["pass", "needs_review", "fail"] = "needs_review"
    adjudication_score: float | None = Field(default=None, ge=0, le=100)
    adjudication_notes: str | None = Field(default=None, max_length=2000)
    mark_latest_assignment_done: bool = True


class EvaluationResultAdjudicationResponse(BaseModel):
    result_id: int
    adjudicated_by: str
    adjudication_label: str
    adjudication_score: float | None
    adjudication_notes: str | None
    adjudicated_at: datetime


class EvaluationMatrixVariantRequest(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    provider: str = Field(default="openai-compatible", max_length=100)
    model_name: str = Field(default="gpt-4.1-mini", max_length=100)
    prompt_version: str = Field(default="v0", max_length=50)


class EvaluationMatrixRunCreateRequest(BaseModel):
    suite_id: int
    execution_mode: Literal["mock", "llm"] = "mock"
    experiment_label: str = Field(min_length=1, max_length=120)
    variants: list[EvaluationMatrixVariantRequest] = Field(min_length=1, max_length=10)
    notes: str | None = Field(default=None, max_length=2000)


class EvaluationMatrixVariantResultResponse(BaseModel):
    run_id: int
    label: str
    provider: str
    model_name: str
    prompt_version: str
    average_score: float | None
    result_count: int
    status: str


class EvaluationMatrixRunResponse(BaseModel):
    suite_id: int
    suite_name: str
    execution_mode: str
    experiment_label: str
    created_runs: list[EvaluationMatrixVariantResultResponse]


class EvaluationExperimentCaseSummaryResponse(BaseModel):
    case_id: int
    case_title: str
    average_score: float | None
    best_score: float | None
    worst_score: float | None
    score_spread: float | None
    pass_runs: int
    fail_runs: int
    needs_review_runs: int
    review_coverage: int


class EvaluationExperimentRunColumnResponse(BaseModel):
    run_id: int
    label: str
    provider: str
    model_name: str
    prompt_version: str
    average_score: float | None


class EvaluationExperimentMatrixCellResponse(BaseModel):
    run_id: int
    result_id: int | None
    trace_id: str | None
    quality_label: str | None
    quality_score: float | None
    judge_summary: str | None
    latest_review_label: str | None
    latest_review_score: float | None
    latest_review_notes: str | None
    review_count: int
    adjudication_label: str | None


class EvaluationExperimentMatrixRowResponse(BaseModel):
    case_id: int
    case_title: str
    score_spread: float | None
    cells: list[EvaluationExperimentMatrixCellResponse]


class EvaluationExperimentSummaryResponse(BaseModel):
    experiment_label: str
    suite_id: int
    suite_name: str
    run_count: int
    compared_case_count: int
    best_run_id: int | None
    best_run_label: str | None
    best_average_score: float | None
    average_run_score: float | None
    max_run_score_spread: float | None
    runs: list[EvaluationRunResponse]
    run_columns: list[EvaluationExperimentRunColumnResponse]
    case_summaries: list[EvaluationExperimentCaseSummaryResponse]
    matrix_rows: list[EvaluationExperimentMatrixRowResponse]


class DemoSeedRequest(BaseModel):
    scenario_id: Literal["code_debug", "paper_rag", "robotics_embedded", "all"] = "code_debug"


class DemoScenarioResponse(BaseModel):
    id: str
    title: str
    description: str
    capability_focus: str
    default_prompt_version: str


class DemoSeedResponse(BaseModel):
    scenario_id: str
    created_trace_ids: list[str]
    created_suite_id: int
    created_run_id: int
    created_audit_event_ids: list[int]


class AuditEventCreateRequest(BaseModel):
    trace_id: str | None = Field(default=None, max_length=64)
    step_index: int | None = Field(default=None, ge=1)
    event_type: str = Field(default="tool_call", max_length=32)
    decision: Literal["allow", "deny", "review"] = "review"
    risk_level: Literal["low", "medium", "high"] = "medium"
    policy_name: str = Field(default="default-policy", max_length=100)
    target_name: str = Field(default="unknown-target", max_length=120)
    reason: str | None = Field(default=None, max_length=2000)
    status: str = Field(default="logged", max_length=32)


class AuditEventResponse(BaseModel):
    id: int
    trace_id: str | None
    step_index: int | None
    event_type: str
    decision: str
    risk_level: str
    policy_name: str
    target_name: str
    reason: str | None
    status: str
    created_at: datetime


class ExternalIntegrationSourceCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    platform_name: str = Field(min_length=1, max_length=100)
    access_mode: Literal["manual", "api", "import"] = "manual"
    provider: str = Field(default="external", max_length=100)
    base_url: str | None = Field(default=None, max_length=255)
    api_key_hint: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=1000)


class ExternalIntegrationSourceResponse(BaseModel):
    id: int
    name: str
    platform_name: str
    access_mode: str
    provider: str
    base_url: str | None
    api_key_hint: str | None
    status: str
    notes: str | None
    created_at: datetime
    usage_record_count: int


class ExternalConnectorTemplateResponse(BaseModel):
    id: str
    title: str
    platform_name: str
    provider: str
    access_mode: str
    base_url: str | None
    api_key_hint: str | None
    default_model_name: str
    sync_frequency_hint: str
    description: str


class ExternalConnectorSyncRequest(BaseModel):
    connector_id: str = Field(min_length=1, max_length=100)
    lookback_days: int = Field(default=3, ge=1, le=30)


class ExternalConnectorSyncResponse(BaseModel):
    connector: ExternalConnectorTemplateResponse
    source: ExternalIntegrationSourceResponse
    created_records: list["ExternalUsageRecordResponse"]


class ExternalConnectorSyncJobResponse(BaseModel):
    id: int
    connector_id: str
    connector_title: str
    source_id: int | None
    source_name: str | None
    status: str
    lookback_days: int
    created_record_count: int
    error_message: str | None
    created_at: datetime


class ExternalUsageImportItemRequest(BaseModel):
    source_name: str = Field(min_length=1, max_length=100)
    platform_name: str = Field(min_length=1, max_length=100)
    access_mode: Literal["manual", "api", "import"] = "import"
    provider: str = Field(default="external", max_length=100)
    base_url: str | None = Field(default=None, max_length=255)
    api_key_hint: str | None = Field(default=None, max_length=64)
    model_name: str = Field(default="unknown", max_length=100)
    run_count: int = Field(default=1, ge=1, le=100000)
    token_usage: int = Field(default=0, ge=0)
    input_token_usage: int = Field(default=0, ge=0)
    output_token_usage: int = Field(default=0, ge=0)
    cached_token_usage: int = Field(default=0, ge=0)
    cost_usd: float = Field(default=0.0, ge=0)
    external_reference: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)
    recorded_at: datetime | None = None


class ExternalUsageImportRequest(BaseModel):
    records: list[ExternalUsageImportItemRequest] = Field(min_length=1, max_length=200)


class ExternalUsageImportResponse(BaseModel):
    created_source_count: int
    reused_source_count: int
    created_record_count: int
    skipped_duplicate_count: int
    created_records: list["ExternalUsageRecordResponse"]


class ExternalUsageRecordCreateRequest(BaseModel):
    source_id: int
    model_name: str = Field(default="unknown", max_length=100)
    run_count: int = Field(default=1, ge=1, le=100000)
    token_usage: int = Field(default=0, ge=0)
    input_token_usage: int = Field(default=0, ge=0)
    output_token_usage: int = Field(default=0, ge=0)
    cached_token_usage: int = Field(default=0, ge=0)
    cost_usd: float = Field(default=0.0, ge=0)
    external_reference: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)
    recorded_at: datetime | None = None


class ExternalUsageRecordResponse(BaseModel):
    id: int
    source_id: int
    source_name: str
    platform_name: str
    access_mode: str
    provider: str
    model_name: str
    run_count: int
    token_usage: int
    input_token_usage: int
    output_token_usage: int
    cached_token_usage: int
    cost_usd: float
    external_reference: str | None
    notes: str | None
    recorded_at: datetime


class ExternalUsageStatsPointResponse(BaseModel):
    date: str
    run_count: int
    token_usage: int
    cost_usd: float


class ExternalUsageStatsResponse(BaseModel):
    total_runs: int
    total_tokens: int
    total_cost_usd: float
    time_range_days: int
    timeline: list[ExternalUsageStatsPointResponse]
    platform_breakdown: list[TraceBreakdownItemResponse]
    provider_breakdown: list[TraceBreakdownItemResponse]


class ExternalUsageValidationCheckResponse(BaseModel):
    provider: str
    model_name: str
    display_name: str
    record_count: int
    total_runs: int
    token_usage: int
    input_token_usage: int
    output_token_usage: int
    cached_token_usage: int
    actual_cost_usd: float
    estimated_cost_usd: float | None
    delta_cost_usd: float | None
    status: str
    official_source_url: str | None
    official_source_label: str | None
    billing_formula: str | None
    reviewed_at: str | None
    notes: str


class ExternalUsageValidationResponse(BaseModel):
    time_range_days: int
    source_id: int | None
    checked_record_count: int
    supported_check_count: int
    unsupported_check_count: int
    total_actual_cost_usd: float
    total_estimated_cost_usd: float | None
    total_delta_cost_usd: float | None
    checks: list[ExternalUsageValidationCheckResponse]


class HealthResponse(BaseModel):
    status: str