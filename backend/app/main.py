from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import json
import re

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from sqlalchemy.orm import Session, selectinload

from .agent_runner import run_agent
from .database import Base, engine, ensure_schema_columns, get_db
from .models import AuditEvent, EvaluationCase, EvaluationCaseResult, EvaluationResultReview, EvaluationRun, EvaluationSuite, ExternalIntegrationSource, ExternalUsageRecord, Trace
from .models import EvaluationReviewAssignment, ExternalConnectorSyncJob
from .llm_runner import DEFAULT_LLM_TEMPERATURE, build_system_prompt, normalize_provider, resolve_api_key, resolve_base_url
from .provider_pricing import OFFICIAL_PRICING_REVIEWED_AT, estimate_usage_cost, find_provider_pricing_rule
from .prompt_registry import PromptVersionDefinition, list_prompt_definitions, save_prompt_definition
from .schemas import (
    AuditEventCreateRequest,
    AuditEventResponse,
    DemoScenarioResponse,
    DemoSeedRequest,
    DemoSeedResponse,
    EvaluationCaseResultResponse,
    EvaluationResultReviewCreateRequest,
    EvaluationResultReviewResponse,
    EvaluationMatrixRunCreateRequest,
    EvaluationMatrixRunResponse,
    EvaluationMatrixVariantResultResponse,
    EvaluationReviewQueueItemResponse,
    EvaluationReviewQueueResponse,
    EvaluationReviewAssignmentCreateRequest,
    EvaluationReviewAssignmentResponse,
    EvaluationResultAdjudicationCreateRequest,
    EvaluationResultAdjudicationResponse,
    EvaluationExperimentCaseSummaryResponse,
    EvaluationExperimentMatrixCellResponse,
    EvaluationExperimentMatrixRowResponse,
    EvaluationExperimentRunColumnResponse,
    EvaluationExperimentSummaryResponse,
    EvaluationRunCompareResponse,
    EvaluationRunCompareRowResponse,
    EvaluationRunCreateRequest,
    EvaluationRunDetailResponse,
    EvaluationRunResponse,
    EvaluationSuiteCreateRequest,
    EvaluationSuiteDetailResponse,
    EvaluationSuiteListItemResponse,
    ExternalIntegrationSourceCreateRequest,
    ExternalConnectorSyncRequest,
    ExternalConnectorSyncResponse,
    ExternalConnectorSyncJobResponse,
    ExternalConnectorTemplateResponse,
    ExternalIntegrationSourceResponse,
    ExternalUsageImportItemRequest,
    ExternalUsageImportRequest,
    ExternalUsageImportResponse,
    ExternalUsageRecordCreateRequest,
    ExternalUsageRecordResponse,
    ExternalUsageStatsPointResponse,
    ExternalUsageStatsResponse,
    ExternalUsageValidationCheckResponse,
    ExternalUsageValidationResponse,
    HealthResponse,
    PromptVersionResponse,
    PromptVersionUpsertRequest,
    RunTraceRequest,
    TraceScoreUpdateRequest,
    TraceBreakdownItemResponse,
    TraceDetailResponse,
    TraceListItemResponse,
    TraceStatsPointResponse,
    TraceStatsResponse,
)
from .trace_logger import create_trace

# 优先从 backend/.env 读取本地配置，目的是让学习阶段不必在多个终端里重复手敲环境变量。
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

app = FastAPI(title="Agent Trace Viewer API")

app.add_middleware(
    CORSMiddleware,
    # 允许 Vite 在本机常见开发端口范围内自动切换，避免 5173 被占用后前后端联调直接失效。
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1):517[3-9]",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    # Auto-create tables during MVP setup so local Windows runs stay frictionless.
    Base.metadata.create_all(bind=engine)
    ensure_schema_columns()


def build_day_sequence(time_range_days: int) -> list[str]:
    end_date = datetime.now(timezone.utc).replace(tzinfo=None).date()
    start_date = end_date - timedelta(days=time_range_days - 1)
    return [
        (start_date + timedelta(days=index)).isoformat()
        for index in range(time_range_days)
    ]


def build_trace_list_item(trace: Trace) -> TraceListItemResponse:
    tool_call_count = sum(1 for step in trace.steps if step.tool_name)
    error_count = sum(1 for step in trace.steps if step.error_message)
    latest_step_title = trace.steps[-1].title if trace.steps else None

    return TraceListItemResponse(
        id=trace.id,
        task_input=trace.task_input,
        task_type=trace.task_type,
        final_output=trace.final_output,
        status=trace.status,
        total_latency_ms=trace.total_latency_ms,
        execution_mode=trace.execution_mode,
        provider=trace.provider,
        model_name=trace.model_name,
        prompt_version=trace.prompt_version,
        replay_source_trace_id=trace.replay_source_trace_id,
        quality_label=trace.quality_label,
        quality_score=trace.quality_score,
        quality_notes=trace.quality_notes,
        token_usage=trace.token_usage,
        input_token_usage=trace.input_token_usage,
        output_token_usage=trace.output_token_usage,
        cached_token_usage=trace.cached_token_usage,
        created_at=trace.created_at,
        step_count=len(trace.steps),
        tool_call_count=tool_call_count,
        error_count=error_count,
        latest_step_title=latest_step_title,
    )

def build_trace_detail(trace: Trace) -> TraceDetailResponse:
    trace_summary = build_trace_list_item(trace)
    run_config_snapshot = json.loads(trace.run_config_json) if trace.run_config_json else None
    return TraceDetailResponse(
        **trace_summary.model_dump(),
        run_config_snapshot=run_config_snapshot,
        steps=[
            {
                "id": step.id,
                "step_index": step.step_index,
                "step_type": step.step_type,
                "title": step.title,
                "detail": step.detail,
                "tool_name": step.tool_name,
                "tool_input": step.tool_input,
                "tool_output": step.tool_output,
                "status": step.status,
                "latency_ms": step.latency_ms,
                "error_message": step.error_message,
            }
            for step in trace.steps
        ],
    )


def build_run_config_snapshot(request: RunTraceRequest) -> dict[str, object]:
    # 这里把一次运行的关键配置固化下来，目的是后续 replay/排障时不用再猜当时的模型和提示词环境。
    snapshot: dict[str, object] = {
        "user_input": request.user_input,
        "execution_mode": request.execution_mode,
        "provider": request.provider,
        "normalized_provider": normalize_provider(request.provider),
        "model_name": request.model_name,
        "prompt_version": request.prompt_version,
    }
    if request.execution_mode == "llm":
        snapshot.update(
            {
                "base_url": resolve_base_url(request.provider),
                "temperature": DEFAULT_LLM_TEMPERATURE,
                "api_key_env_name": resolve_api_key(request.provider)[1],
                "system_prompt": build_system_prompt(request.prompt_version),
            }
        )
    return snapshot


def build_run_request_from_trace(trace: Trace) -> RunTraceRequest:
    if trace.run_config_json:
        # replay 优先复用当时保存的快照，而不是只依赖 traces 表里的摘要字段，避免后续默认值变化带来偏差。
        snapshot = json.loads(trace.run_config_json)
        return RunTraceRequest(
            user_input=str(snapshot.get("user_input") or trace.task_input),
            execution_mode=str(snapshot.get("execution_mode") or trace.execution_mode),
            provider=str(snapshot.get("provider") or trace.provider),
            model_name=str(snapshot.get("model_name") or trace.model_name),
            prompt_version=str(snapshot.get("prompt_version") or trace.prompt_version),
        )

    return RunTraceRequest(
        user_input=trace.task_input,
        execution_mode=trace.execution_mode,
        provider=trace.provider,
        model_name=trace.model_name,
        prompt_version=trace.prompt_version,
    )


def execute_and_store_trace(
    request: RunTraceRequest,
    db: Session,
    *,
    replay_source_trace_id: str | None = None,
) -> Trace:
    # 创建和 replay 共用同一条落库链路，后面扩展评测或批量运行时可以继续复用这层能力。
    result = run_agent(
        request.user_input,
        execution_mode=request.execution_mode,
        provider=request.provider,
        model_name=request.model_name,
        prompt_version=request.prompt_version,
    )
    trace = create_trace(
        db,
        task_input=request.user_input,
        task_type=result.task_type,
        final_output=result.final_output,
        status=result.status,
        total_latency_ms=result.total_latency_ms,
        execution_mode=request.execution_mode,
        provider=request.provider,
        model_name=request.model_name,
        prompt_version=request.prompt_version,
        replay_source_trace_id=replay_source_trace_id,
        run_config_json=json.dumps(build_run_config_snapshot(request), ensure_ascii=False),
        token_usage=result.token_usage,
        input_token_usage=result.input_token_usage,
        output_token_usage=result.output_token_usage,
        cached_token_usage=result.cached_token_usage,
        steps=result.steps,
    )
    return (
        db.query(Trace)
        .options(selectinload(Trace.steps))
        .filter(Trace.id == trace.id)
        .one()
    )


def build_trace_stats(
    traces: list[Trace],
    *,
    time_range_days: int,
) -> TraceStatsResponse:
    completed_runs = sum(1 for trace in traces if trace.status == "completed")
    failed_runs = sum(1 for trace in traces if trace.status == "failed")
    avg_latency_ms = round(
        sum(trace.total_latency_ms for trace in traces) / len(traces), 2
    ) if traces else 0.0
    total_tokens = sum(trace.token_usage for trace in traces)

    timeline_by_day = {
        day: {
            "run_count": 0,
            "completed_count": 0,
            "failed_count": 0,
            "latency_total": 0.0,
            "total_tokens": 0,
        }
        for day in build_day_sequence(time_range_days)
    }
    for trace in traces:
        trace_day = trace.created_at.date().isoformat()
        if trace_day not in timeline_by_day:
            continue
        bucket = timeline_by_day[trace_day]
        bucket["run_count"] += 1
        bucket["completed_count"] += 1 if trace.status == "completed" else 0
        bucket["failed_count"] += 1 if trace.status == "failed" else 0
        bucket["latency_total"] += trace.total_latency_ms
        bucket["total_tokens"] += trace.token_usage

    timeline = [
        TraceStatsPointResponse(
            date=day,
            run_count=int(bucket["run_count"]),
            completed_count=int(bucket["completed_count"]),
            failed_count=int(bucket["failed_count"]),
            avg_latency_ms=round(bucket["latency_total"] / bucket["run_count"], 2) if bucket["run_count"] else 0.0,
            total_tokens=int(bucket["total_tokens"]),
        )
        for day, bucket in timeline_by_day.items()
    ]

    prompt_version_breakdown = [
        TraceBreakdownItemResponse(key=key, count=count)
        for key, count in Counter(trace.prompt_version for trace in traces).most_common()
    ]
    provider_breakdown = [
        TraceBreakdownItemResponse(key=key, count=count)
        for key, count in Counter(trace.provider for trace in traces).most_common()
    ]

    return TraceStatsResponse(
        total_runs=len(traces),
        completed_runs=completed_runs,
        failed_runs=failed_runs,
        avg_latency_ms=avg_latency_ms,
        total_tokens=total_tokens,
        time_range_days=time_range_days,
        timeline=timeline,
        prompt_version_breakdown=prompt_version_breakdown,
        provider_breakdown=provider_breakdown,
    )


def build_external_integration_source(source: ExternalIntegrationSource) -> ExternalIntegrationSourceResponse:
    return ExternalIntegrationSourceResponse(
        id=source.id,
        name=source.name,
        platform_name=source.platform_name,
        access_mode=source.access_mode,
        provider=source.provider,
        base_url=source.base_url,
        api_key_hint=source.api_key_hint,
        status=source.status,
        notes=source.notes,
        created_at=source.created_at,
        usage_record_count=len(source.usage_records),
    )


def build_external_usage_record(record: ExternalUsageRecord) -> ExternalUsageRecordResponse:
    return ExternalUsageRecordResponse(
        id=record.id,
        source_id=record.source_id,
        source_name=record.source.name,
        platform_name=record.source.platform_name,
        access_mode=record.source.access_mode,
        provider=record.source.provider,
        model_name=record.model_name,
        run_count=record.run_count,
        token_usage=record.token_usage,
        input_token_usage=record.input_token_usage,
        output_token_usage=record.output_token_usage,
        cached_token_usage=record.cached_token_usage,
        cost_usd=record.cost_usd,
        external_reference=record.external_reference,
        notes=record.notes,
        recorded_at=record.recorded_at,
    )


def normalize_external_usage_values(
    *,
    token_usage: int,
    input_token_usage: int,
    output_token_usage: int,
    cached_token_usage: int,
    cost_usd: float,
) -> dict[str, int | float]:
    # 这里统一约定 total tokens = input + output。
    # cached tokens 只是输入侧的子集，单独展示即可，不能再叠加到 total 上，否则会把缓存命中重复算一遍。
    normalized_input = max(input_token_usage, 0)
    normalized_output = max(output_token_usage, 0)
    normalized_cached = max(cached_token_usage, 0)
    derived_total_tokens = normalized_input + normalized_output
    normalized_total_tokens = derived_total_tokens if derived_total_tokens else max(token_usage, 0)

    return {
        "token_usage": normalized_total_tokens,
        "input_token_usage": normalized_input,
        "output_token_usage": normalized_output,
        "cached_token_usage": normalized_cached,
        "cost_usd": round(max(cost_usd, 0.0), 6),
    }


def build_external_usage_stats(
    records: list[ExternalUsageRecord],
    *,
    time_range_days: int,
) -> ExternalUsageStatsResponse:
    timeline_by_day = {
        day: {
            "run_count": 0,
            "token_usage": 0,
            "cost_usd": 0.0,
        }
        for day in build_day_sequence(time_range_days)
    }

    total_runs = 0
    total_tokens = 0
    total_cost_usd = 0.0
    platform_counter: Counter[str] = Counter()
    provider_counter: Counter[str] = Counter()

    for record in records:
        record_day = record.recorded_at.date().isoformat()
        if record_day not in timeline_by_day:
            continue

        bucket = timeline_by_day[record_day]
        bucket["run_count"] += record.run_count
        bucket["token_usage"] += record.token_usage
        bucket["cost_usd"] += record.cost_usd

        total_runs += record.run_count
        total_tokens += record.token_usage
        total_cost_usd += record.cost_usd
        platform_counter[record.source.platform_name] += record.run_count
        provider_counter[record.source.provider] += record.run_count

    timeline = [
        ExternalUsageStatsPointResponse(
            date=day,
            run_count=int(bucket["run_count"]),
            token_usage=int(bucket["token_usage"]),
            cost_usd=round(bucket["cost_usd"], 4),
        )
        for day, bucket in timeline_by_day.items()
    ]

    return ExternalUsageStatsResponse(
        total_runs=total_runs,
        total_tokens=total_tokens,
        total_cost_usd=round(total_cost_usd, 4),
        time_range_days=time_range_days,
        timeline=timeline,
        platform_breakdown=[
            TraceBreakdownItemResponse(key=key, count=count)
            for key, count in platform_counter.most_common()
        ],
        provider_breakdown=[
            TraceBreakdownItemResponse(key=key, count=count)
            for key, count in provider_counter.most_common()
        ],
    )


def build_external_usage_validation(
    records: list[ExternalUsageRecord],
    *,
    time_range_days: int,
    source_id: int | None,
) -> ExternalUsageValidationResponse:
    grouped_records: dict[tuple[str, str], dict[str, int | float | str]] = {}

    for record in records:
        group_key = (record.source.provider, record.model_name)
        bucket = grouped_records.setdefault(group_key, {
            "provider": record.source.provider,
            "model_name": record.model_name,
            "record_count": 0,
            "total_runs": 0,
            "token_usage": 0,
            "input_token_usage": 0,
            "output_token_usage": 0,
            "cached_token_usage": 0,
            "actual_cost_usd": 0.0,
        })
        bucket["record_count"] += 1
        bucket["total_runs"] += record.run_count
        bucket["token_usage"] += record.token_usage
        bucket["input_token_usage"] += record.input_token_usage
        bucket["output_token_usage"] += record.output_token_usage
        bucket["cached_token_usage"] += record.cached_token_usage
        bucket["actual_cost_usd"] += record.cost_usd

    checks: list[ExternalUsageValidationCheckResponse] = []
    supported_check_count = 0
    unsupported_check_count = 0
    total_estimated_cost_usd = 0.0
    total_actual_cost_usd = 0.0

    for (provider, model_name), bucket in sorted(grouped_records.items(), key=lambda item: (item[0][0], item[0][1])):
        actual_cost_usd = round(float(bucket["actual_cost_usd"]), 6)
        total_actual_cost_usd += actual_cost_usd
        pricing_rule = find_provider_pricing_rule(provider, model_name)
        estimation = estimate_usage_cost(
            provider=provider,
            model_name=model_name,
            input_token_usage=int(bucket["input_token_usage"]),
            output_token_usage=int(bucket["output_token_usage"]),
            cached_token_usage=int(bucket["cached_token_usage"]),
        )

        if pricing_rule is None or estimation is None:
            unsupported_check_count += 1
            checks.append(
                ExternalUsageValidationCheckResponse(
                    provider=provider,
                    model_name=model_name,
                    display_name=model_name,
                    record_count=int(bucket["record_count"]),
                    total_runs=int(bucket["total_runs"]),
                    token_usage=int(bucket["token_usage"]),
                    input_token_usage=int(bucket["input_token_usage"]),
                    output_token_usage=int(bucket["output_token_usage"]),
                    cached_token_usage=int(bucket["cached_token_usage"]),
                    actual_cost_usd=actual_cost_usd,
                    estimated_cost_usd=None,
                    delta_cost_usd=None,
                    status="missing_official_rate",
                    official_source_url=None,
                    official_source_label=None,
                    billing_formula=None,
                    reviewed_at=None,
                    notes="当前 provider/model 组合还没有纳入仓库里的官方价格快照，先不要把本地 cost 当成已验证结果。",
                )
            )
            continue

        supported_check_count += 1
        estimated_cost_usd = round(float(estimation["estimated_cost_usd"]), 6)
        total_estimated_cost_usd += estimated_cost_usd
        delta_cost_usd = round(actual_cost_usd - estimated_cost_usd, 6)
        # 这里把 0.0005 美元以内视为舍入噪音，原因是数据库和 UI 都做了 4-6 位小数截断。
        status = "matched" if abs(delta_cost_usd) <= 0.0005 else "drift"
        checks.append(
            ExternalUsageValidationCheckResponse(
                provider=provider,
                model_name=model_name,
                display_name=pricing_rule.display_name,
                record_count=int(bucket["record_count"]),
                total_runs=int(bucket["total_runs"]),
                token_usage=int(bucket["token_usage"]),
                input_token_usage=int(bucket["input_token_usage"]),
                output_token_usage=int(bucket["output_token_usage"]),
                cached_token_usage=int(bucket["cached_token_usage"]),
                actual_cost_usd=actual_cost_usd,
                estimated_cost_usd=estimated_cost_usd,
                delta_cost_usd=delta_cost_usd,
                status=status,
                official_source_url=pricing_rule.official_source_url,
                official_source_label=pricing_rule.official_source_label,
                billing_formula=str(estimation["billing_formula"]),
                reviewed_at=OFFICIAL_PRICING_REVIEWED_AT,
                notes=pricing_rule.notes,
            )
        )

    all_supported = unsupported_check_count == 0
    total_delta_cost_usd = round(total_actual_cost_usd - total_estimated_cost_usd, 6) if all_supported else None
    return ExternalUsageValidationResponse(
        time_range_days=time_range_days,
        source_id=source_id,
        checked_record_count=len(records),
        supported_check_count=supported_check_count,
        unsupported_check_count=unsupported_check_count,
        total_actual_cost_usd=round(total_actual_cost_usd, 6),
        total_estimated_cost_usd=round(total_estimated_cost_usd, 6) if all_supported else None,
        total_delta_cost_usd=total_delta_cost_usd,
        checks=checks,
    )


def build_evaluation_suite_list_item(suite: EvaluationSuite) -> EvaluationSuiteListItemResponse:
    return EvaluationSuiteListItemResponse(
        id=suite.id,
        name=suite.name,
        description=suite.description,
        status=suite.status,
        created_at=suite.created_at,
        case_count=len(suite.cases),
        run_count=len(suite.runs),
    )


def build_evaluation_suite_detail(suite: EvaluationSuite) -> EvaluationSuiteDetailResponse:
    return EvaluationSuiteDetailResponse(
        **build_evaluation_suite_list_item(suite).model_dump(),
        cases=[
            {
                "id": case.id,
                "title": case.title,
                "user_input": case.user_input,
                "expected_output": case.expected_output,
                "ground_truth_type": case.ground_truth_type,
                "judge_guidance": case.judge_guidance,
                "judge_config_json": case.judge_config_json,
                "score_rubric": case.score_rubric,
                "created_at": case.created_at,
            }
            for case in suite.cases
        ],
    )


def build_evaluation_run(run: EvaluationRun) -> EvaluationRunResponse:
    return EvaluationRunResponse(
        id=run.id,
        suite_id=run.suite_id,
        suite_name=run.suite.name,
        status=run.status,
        execution_mode=run.execution_mode,
        provider=run.provider,
        model_name=run.model_name,
        prompt_version=run.prompt_version,
        experiment_label=run.experiment_label,
        total_cases=run.total_cases,
        completed_cases=run.completed_cases,
        average_score=run.average_score,
        result_count=len(run.results),
        notes=run.notes,
        created_at=run.created_at,
    )


def build_evaluation_run_detail(run: EvaluationRun) -> EvaluationRunDetailResponse:
    return EvaluationRunDetailResponse(
        **build_evaluation_run(run).model_dump(),
        results=[
            EvaluationCaseResultResponse(
                id=result.id,
                case_id=result.case_id,
                case_title=result.case.title,
                trace_id=result.trace_id,
                status=result.status,
                quality_label=result.quality_label,
                quality_score=result.quality_score,
                judge_summary=result.judge_summary,
                adjudication_label=result.adjudication_label,
                adjudication_score=result.adjudication_score,
                adjudication_notes=result.adjudication_notes,
                adjudicated_by=result.adjudicated_by,
                adjudicated_at=result.adjudicated_at,
                latest_review_label=result.reviews[0].review_label if result.reviews else None,
                latest_review_score=result.reviews[0].review_score if result.reviews else None,
                review_count=len(result.reviews),
                created_at=result.created_at,
            )
            for result in run.results
        ],
        reviews=[
            EvaluationResultReviewResponse(
                id=review.id,
                result_id=review.evaluation_case_result_id,
                reviewer_name=review.reviewer_name,
                review_label=review.review_label,
                review_score=review.review_score,
                review_notes=review.review_notes,
                created_at=review.created_at,
            )
            for result in run.results
            for review in result.reviews
        ],
    )


def build_evaluation_run_compare(run: EvaluationRun, compare_run: EvaluationRun) -> EvaluationRunCompareResponse:
    base_results_by_case = {result.case_id: result for result in run.results}
    compare_results_by_case = {result.case_id: result for result in compare_run.results}
    shared_case_ids = sorted(set(base_results_by_case) & set(compare_results_by_case))

    rows = []
    for case_id in shared_case_ids:
        base_result = base_results_by_case[case_id]
        next_result = compare_results_by_case[case_id]
        score_delta = None
        if base_result.quality_score is not None and next_result.quality_score is not None:
            score_delta = round(next_result.quality_score - base_result.quality_score, 2)

        rows.append(
            EvaluationRunCompareRowResponse(
                case_id=case_id,
                case_title=base_result.case.title,
                base_result_id=base_result.id,
                compare_result_id=next_result.id,
                base_label=base_result.quality_label,
                compare_label=next_result.quality_label,
                base_score=base_result.quality_score,
                compare_score=next_result.quality_score,
                score_delta=score_delta,
                base_review_count=len(base_result.reviews),
                compare_review_count=len(next_result.reviews),
                changed=(base_result.quality_label != next_result.quality_label) or (score_delta is not None and abs(score_delta) >= 0.01),
            )
        )

    return EvaluationRunCompareResponse(
        base_run=build_evaluation_run(run),
        compare_run=build_evaluation_run(compare_run),
        rows=rows,
    )


def build_review_queue_item(result: EvaluationCaseResult) -> EvaluationReviewQueueItemResponse:
    latest_review = result.reviews[0] if result.reviews else None
    latest_assignment = result.review_assignments[0] if result.review_assignments else None
    review_scores = [review.review_score for review in result.reviews if review.review_score is not None]
    consensus_score = round(sum(review_scores) / len(review_scores), 2) if review_scores else None
    label_counter = Counter(review.review_label for review in result.reviews)
    consensus_label = label_counter.most_common(1)[0][0] if label_counter else None
    has_conflict = len(label_counter) >= 2 or bool(consensus_label and result.quality_label and consensus_label != result.quality_label)
    overdue = bool(
        latest_assignment
        and latest_assignment.due_at
        and latest_assignment.assignment_status != "done"
        and latest_assignment.due_at < datetime.utcnow()
    )
    if overdue:
        queue_reason = "该结果已超过指派截止时间，应该优先处理。"
    elif has_conflict and not result.adjudication_label:
        queue_reason = "多人标注或 judge 结论出现冲突，建议由负责人做最终裁决。"
    elif not result.reviews:
        queue_reason = "还没有人工标注，适合先补首条 review。"
    elif result.quality_label != latest_review.review_label and not result.adjudication_label:
        queue_reason = "judge 结果与最新人工标注不一致，建议优先复核。"
    elif latest_assignment and latest_assignment.assignment_status != "done":
        queue_reason = f"当前已经指派给 {latest_assignment.assignee_name}，但还没有完成复核。"
    elif result.adjudication_label:
        queue_reason = "该结果已经完成裁决，当前主要用于回看结论和复盘依据。"
    else:
        queue_reason = "已有人工标注，但仍可作为多人复核样本继续查看。"

    return EvaluationReviewQueueItemResponse(
        result_id=result.id,
        run_id=result.evaluation_run_id,
        suite_id=result.run.suite_id,
        suite_name=result.run.suite.name,
        case_id=result.case_id,
        case_title=result.case.title,
        ground_truth_type=result.case.ground_truth_type,
        quality_label=result.quality_label,
        quality_score=result.quality_score,
        latest_review_label=latest_review.review_label if latest_review else None,
        latest_review_score=latest_review.review_score if latest_review else None,
        review_count=len(result.reviews),
        consensus_label=consensus_label,
        consensus_score=consensus_score,
        assignment_id=latest_assignment.id if latest_assignment else None,
        assignee_name=latest_assignment.assignee_name if latest_assignment else None,
        assignment_status=latest_assignment.assignment_status if latest_assignment else None,
        priority=latest_assignment.priority if latest_assignment else None,
        due_at=latest_assignment.due_at if latest_assignment else None,
        overdue=overdue,
        has_conflict=has_conflict,
        adjudication_label=result.adjudication_label,
        queue_reason=queue_reason,
        created_at=result.created_at,
    )


def build_connector_sync_job(job: ExternalConnectorSyncJob) -> ExternalConnectorSyncJobResponse:
    connector = next((item for item in build_connector_catalog() if item.id == job.connector_id), None)
    return ExternalConnectorSyncJobResponse(
        id=job.id,
        connector_id=job.connector_id,
        connector_title=connector.title if connector else job.connector_id,
        source_id=job.source_id,
        source_name=job.source.name if job.source else None,
        status=job.status,
        lookback_days=job.lookback_days,
        created_record_count=job.created_record_count,
        error_message=job.error_message,
        created_at=job.created_at,
    )


def build_experiment_summary(runs: list[EvaluationRun]) -> EvaluationExperimentSummaryResponse:
    base_run = runs[0]
    sorted_runs = sorted(runs, key=lambda item: item.id)
    grouped_results: defaultdict[int, list[EvaluationCaseResult]] = defaultdict(list)
    results_by_run_and_case: dict[tuple[int, int], EvaluationCaseResult] = {}
    for run in sorted_runs:
        for result in run.results:
            grouped_results[result.case_id].append(result)
            results_by_run_and_case[(run.id, result.case_id)] = result

    case_summaries: list[EvaluationExperimentCaseSummaryResponse] = []
    matrix_rows: list[EvaluationExperimentMatrixRowResponse] = []
    for case_id, results in grouped_results.items():
        scores = [result.quality_score for result in results if result.quality_score is not None]
        labels = Counter(result.quality_label for result in results if result.quality_label)
        score_spread = round(max(scores) - min(scores), 2) if len(scores) >= 2 else None
        case_summary = EvaluationExperimentCaseSummaryResponse(
            case_id=case_id,
            case_title=results[0].case.title,
            average_score=round(sum(scores) / len(scores), 2) if scores else None,
            best_score=max(scores) if scores else None,
            worst_score=min(scores) if scores else None,
            score_spread=score_spread,
            pass_runs=labels.get("pass", 0),
            fail_runs=labels.get("fail", 0),
            needs_review_runs=labels.get("needs_review", 0),
            review_coverage=sum(1 for result in results if result.reviews),
        )
        case_summaries.append(case_summary)
        matrix_rows.append(
            EvaluationExperimentMatrixRowResponse(
                case_id=case_id,
                case_title=results[0].case.title,
                score_spread=score_spread,
                cells=[
                    EvaluationExperimentMatrixCellResponse(
                        run_id=run.id,
                        result_id=results_by_run_and_case[(run.id, case_id)].id if (run.id, case_id) in results_by_run_and_case else None,
                        trace_id=results_by_run_and_case[(run.id, case_id)].trace_id if (run.id, case_id) in results_by_run_and_case else None,
                        quality_label=results_by_run_and_case[(run.id, case_id)].quality_label if (run.id, case_id) in results_by_run_and_case else None,
                        quality_score=results_by_run_and_case[(run.id, case_id)].quality_score if (run.id, case_id) in results_by_run_and_case else None,
                        judge_summary=results_by_run_and_case[(run.id, case_id)].judge_summary if (run.id, case_id) in results_by_run_and_case else None,
                        latest_review_label=results_by_run_and_case[(run.id, case_id)].reviews[0].review_label if (run.id, case_id) in results_by_run_and_case and results_by_run_and_case[(run.id, case_id)].reviews else None,
                        latest_review_score=results_by_run_and_case[(run.id, case_id)].reviews[0].review_score if (run.id, case_id) in results_by_run_and_case and results_by_run_and_case[(run.id, case_id)].reviews else None,
                        latest_review_notes=results_by_run_and_case[(run.id, case_id)].reviews[0].review_notes if (run.id, case_id) in results_by_run_and_case and results_by_run_and_case[(run.id, case_id)].reviews else None,
                        review_count=len(results_by_run_and_case[(run.id, case_id)].reviews) if (run.id, case_id) in results_by_run_and_case else 0,
                        adjudication_label=results_by_run_and_case[(run.id, case_id)].adjudication_label if (run.id, case_id) in results_by_run_and_case else None,
                    )
                    for run in sorted_runs
                ],
            )
        )

    scored_runs = [run for run in sorted_runs if run.average_score is not None]
    best_run = max(scored_runs, key=lambda item: item.average_score or 0, default=None)
    run_scores = [run.average_score for run in scored_runs if run.average_score is not None]
    run_labels = [f"#{run.id} · {run.provider} · {run.prompt_version}" for run in sorted_runs]
    return EvaluationExperimentSummaryResponse(
        experiment_label=base_run.experiment_label or "unknown",
        suite_id=base_run.suite_id,
        suite_name=base_run.suite.name,
        run_count=len(sorted_runs),
        compared_case_count=len(case_summaries),
        best_run_id=best_run.id if best_run else None,
        best_run_label=run_labels[sorted_runs.index(best_run)] if best_run else None,
        best_average_score=best_run.average_score if best_run else None,
        average_run_score=round(sum(run_scores) / len(run_scores), 2) if run_scores else None,
        max_run_score_spread=round(max(run_scores) - min(run_scores), 2) if len(run_scores) >= 2 else None,
        runs=[build_evaluation_run(run) for run in sorted_runs],
        run_columns=[
            EvaluationExperimentRunColumnResponse(
                run_id=run.id,
                label=f"#{run.id} · {run.provider} · {run.prompt_version}",
                provider=run.provider,
                model_name=run.model_name,
                prompt_version=run.prompt_version,
                average_score=run.average_score,
            )
            for run in sorted_runs
        ],
        case_summaries=sorted(case_summaries, key=lambda item: item.score_spread or -1, reverse=True),
        matrix_rows=sorted(matrix_rows, key=lambda item: item.score_spread or -1, reverse=True),
    )


def find_or_create_import_source(record: ExternalUsageImportItemRequest, db: Session) -> tuple[ExternalIntegrationSource, bool]:
    source = (
        db.query(ExternalIntegrationSource)
        .filter(
            ExternalIntegrationSource.name == record.source_name,
            ExternalIntegrationSource.platform_name == record.platform_name,
            ExternalIntegrationSource.provider == record.provider,
        )
        .first()
    )
    if source is not None:
        return source, False

    source = ExternalIntegrationSource(
        name=record.source_name,
        platform_name=record.platform_name,
        access_mode=record.access_mode,
        provider=record.provider,
        base_url=record.base_url,
        api_key_hint=record.api_key_hint,
        notes=record.notes or "通过批量导入创建的外部来源。",
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source, True


def build_connector_catalog() -> list[ExternalConnectorTemplateResponse]:
    # 先提供固定模板而不直接接真实第三方 OAuth，目的是让“自动同步”这条产品路径先能演示和学习。
    return [
        ExternalConnectorTemplateResponse(
            id="claude_code_importer",
            title="Claude Code Workspace Sync",
            platform_name="claude-code",
            provider="anthropic",
            access_mode="api",
            base_url="https://api.anthropic.com",
            api_key_hint="ANTHROPIC_API_KEY",
            default_model_name="claude-sonnet-4",
            sync_frequency_hint="每 6 小时拉一次 workspace usage",
            description="用于演示从 Claude Code 或相似工作台拉 usage 汇总，再落到统一成本面板。",
        ),
        ExternalConnectorTemplateResponse(
            id="openai_gateway_importer",
            title="OpenAI Compatible Gateway Sync",
            platform_name="custom-gateway",
            provider="openai-compatible",
            access_mode="api",
            base_url="https://gateway.example.internal/v1",
            api_key_hint="GATEWAY_API_KEY",
            default_model_name="gpt-5.4-mini",
            sync_frequency_hint="每 1 小时轮询一次网关统计",
            description="用于演示把自有 API 网关、代理层或平台聚合日志接入到统一 usage 中心。",
        ),
        ExternalConnectorTemplateResponse(
            id="deepseek_export_importer",
            title="DeepSeek Export Sync",
            platform_name="deepseek-console",
            provider="deepseek",
            access_mode="import",
            base_url="https://api.deepseek.com",
            api_key_hint="DEEPSEEK_API_KEY",
            default_model_name="deepseek-chat",
            sync_frequency_hint="每天导入一次账单/usage 导出",
            description="用于演示半自动导入路径，适合还没有直接 API 但已有 usage 导出文件的平台。",
        ),
    ]


def ensure_connector_source(template: ExternalConnectorTemplateResponse, db: Session) -> ExternalIntegrationSource:
    source = (
        db.query(ExternalIntegrationSource)
        .filter(
            ExternalIntegrationSource.name == template.title,
            ExternalIntegrationSource.platform_name == template.platform_name,
            ExternalIntegrationSource.provider == template.provider,
        )
        .first()
    )
    if source:
        return source

    source = ExternalIntegrationSource(
        name=template.title,
        platform_name=template.platform_name,
        access_mode=template.access_mode,
        provider=template.provider,
        base_url=template.base_url,
        api_key_hint=template.api_key_hint,
        notes=template.description,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


def build_connector_records(template: ExternalConnectorTemplateResponse, source_id: int, lookback_days: int) -> list[ExternalUsageRecord]:
    now = datetime.utcnow()
    records: list[ExternalUsageRecord] = []
    for index in range(lookback_days):
        run_count = 3 + index * 2
        input_tokens = 2400 + index * 800
        output_tokens = 5200 + index * 1100
        cached_tokens = 400 if template.id != "openai_gateway_importer" else 900
        normalized_usage = normalize_external_usage_values(
            token_usage=0,
            input_token_usage=input_tokens,
            output_token_usage=output_tokens,
            cached_token_usage=cached_tokens,
            cost_usd=0.0,
        )
        token_usage = int(normalized_usage["token_usage"])
        estimated_cost = estimate_usage_cost(
            provider=template.provider,
            model_name=template.default_model_name,
            input_token_usage=int(normalized_usage["input_token_usage"]),
            output_token_usage=int(normalized_usage["output_token_usage"]),
            cached_token_usage=int(normalized_usage["cached_token_usage"]),
        )
        # 自动连接器样本优先复用官方价格快照，原因是这批记录本来就承担“演示标准口径”的职责。
        cost_usd = round(float(estimated_cost["estimated_cost_usd"]), 4) if estimated_cost else 0.0
        records.append(
            ExternalUsageRecord(
                source_id=source_id,
                model_name=template.default_model_name,
                run_count=run_count,
                token_usage=token_usage,
                input_token_usage=int(normalized_usage["input_token_usage"]),
                output_token_usage=int(normalized_usage["output_token_usage"]),
                cached_token_usage=int(normalized_usage["cached_token_usage"]),
                cost_usd=cost_usd,
                external_reference=f"{template.id}-{(now - timedelta(days=index)).date().isoformat()}",
                notes=f"自动同步样本：{template.sync_frequency_hint}。",
                recorded_at=now - timedelta(days=index),
            )
        )
    return records


def create_connector_sync_job(
    connector_id: str,
    lookback_days: int,
    db: Session,
    *,
    source_id: int | None = None,
    status: str = "success",
    created_record_count: int = 0,
    error_message: str | None = None,
) -> ExternalConnectorSyncJob:
    job = ExternalConnectorSyncJob(
        connector_id=connector_id,
        source_id=source_id,
        status=status,
        lookback_days=lookback_days,
        created_record_count=created_record_count,
        error_message=error_message,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def build_audit_event(event: AuditEvent) -> AuditEventResponse:
    return AuditEventResponse(
        id=event.id,
        trace_id=event.trace_id,
        step_index=event.step_index,
        event_type=event.event_type,
        decision=event.decision,
        risk_level=event.risk_level,
        policy_name=event.policy_name,
        target_name=event.target_name,
        reason=event.reason,
        status=event.status,
        created_at=event.created_at,
    )


def tokenize_text(value: str) -> list[str]:
    return [
        token
        for token in re.split(r"[^a-zA-Z0-9\u4e00-\u9fff]+", value.lower())
        if len(token) >= 2
    ]


def resolve_case_keywords(case: EvaluationCase) -> list[str]:
    if case.judge_config_json:
        try:
            config = json.loads(case.judge_config_json)
            configured_keywords = config.get("keywords")
            if isinstance(configured_keywords, list):
                return [str(item).lower() for item in configured_keywords if str(item).strip()]
        except json.JSONDecodeError:
            pass
    if case.expected_output:
        return tokenize_text(case.expected_output)
    return []


def judge_trace_for_case(case: EvaluationCase, trace: Trace) -> tuple[str, float, str]:
    # 这里继续保持启发式 judge，而不是直接接 LLM-as-a-judge，原因是学习阶段更适合先看清每个分值来自哪里。
    if trace.status != "completed":
        return (
            "fail",
            30.0,
            "运行未完成，当前先按失败样本处理，后续可接更细的错误类型评分。",
        )

    if case.ground_truth_type == "manual_review":
        return (
            "needs_review",
            60.0,
            f"该 case 标记为人工复核类型，judge_guidance={case.judge_guidance or '未提供'}。",
        )

    if not case.expected_output:
        return (
            "pass",
            85.0,
            "当前 case 没有 expected_output，第一版默认按成功完成且可复盘来评分。",
        )

    judge_config: dict[str, object] = {}
    if case.judge_config_json:
        try:
            parsed_config = json.loads(case.judge_config_json)
            if isinstance(parsed_config, dict):
                judge_config = parsed_config
        except json.JSONDecodeError:
            judge_config = {}

    expected_keywords = resolve_case_keywords(case)
    if not expected_keywords:
        return (
            "needs_review",
            70.0,
            "expected_output 没有拆出稳定关键词，因此先给人工复核分。",
        )

    output_text = trace.final_output.lower()
    trace_text = " ".join(
        filter(
            None,
            [
                trace.task_input,
                trace.final_output,
                *[step.title for step in trace.steps],
                *[step.detail for step in trace.steps],
                *[step.tool_name or "" for step in trace.steps],
                *[step.error_message or "" for step in trace.steps],
            ],
        )
    ).lower()
    matched_count = sum(1 for keyword in set(expected_keywords) if keyword in output_text)
    coverage = matched_count / max(len(set(expected_keywords)), 1)
    base_score = 45 if case.ground_truth_type == "keyword" else 52

    preferred_tools = [str(item).lower() for item in judge_config.get("preferred_tools", [])] if isinstance(judge_config.get("preferred_tools"), list) else []
    required_terms = [str(item).lower() for item in judge_config.get("required_terms", [])] if isinstance(judge_config.get("required_terms"), list) else []
    forbidden_terms = [str(item).lower() for item in judge_config.get("forbidden_terms", [])] if isinstance(judge_config.get("forbidden_terms"), list) else []

    tool_names = {step.tool_name.lower() for step in trace.steps if step.tool_name}
    preferred_tool_hits = sum(1 for tool_name in preferred_tools if tool_name in tool_names)
    required_hits = sum(1 for term in required_terms if term in trace_text)
    forbidden_hits = sum(1 for term in forbidden_terms if term in trace_text)
    error_penalty = min(sum(1 for step in trace.steps if step.error_message) * 8, 20)
    config_bonus = preferred_tool_hits * 6 + required_hits * 5
    config_penalty = forbidden_hits * 10 + error_penalty

    score = round(max(0.0, min(100.0, base_score + coverage * (100 - base_score) + config_bonus - config_penalty)), 2)
    label = "pass" if score >= 80 else "needs_review" if score >= 55 else "fail"
    summary = (
        f"ground_truth_type={case.ground_truth_type}，命中 {matched_count}/{len(set(expected_keywords))} 个关键词，"
        f"preferred_tools 命中 {preferred_tool_hits}/{len(preferred_tools)}，required_terms 命中 {required_hits}/{len(required_terms)}，"
        f"forbidden_terms 命中 {forbidden_hits}/{len(forbidden_terms)}，judge_guidance={case.judge_guidance or '未提供'}，score_rubric={case.score_rubric or '未提供'}。"
    )
    return label, score, summary


def run_evaluation_cases(run: EvaluationRun, suite: EvaluationSuite, db: Session) -> EvaluationRun:
    run.status = "running"
    db.commit()
    db.refresh(run)

    total_score = 0.0
    completed_cases = 0
    for case in suite.cases:
        request = RunTraceRequest(
            user_input=case.user_input,
            execution_mode=run.execution_mode,
            provider=run.provider,
            model_name=run.model_name,
            prompt_version=run.prompt_version,
        )
        trace = execute_and_store_trace(request, db)
        quality_label, quality_score, judge_summary = judge_trace_for_case(case, trace)

        trace.quality_label = quality_label
        trace.quality_score = quality_score
        trace.quality_notes = judge_summary
        run.results.append(
            EvaluationCaseResult(
                case_id=case.id,
                trace_id=trace.id,
                status=trace.status,
                quality_label=quality_label,
                quality_score=quality_score,
                judge_summary=judge_summary,
            )
        )
        total_score += quality_score
        completed_cases += 1

    run.status = "completed"
    run.completed_cases = completed_cases
    run.average_score = round(total_score / completed_cases, 2) if completed_cases else None
    suite.status = "active"
    db.commit()
    return (
        db.query(EvaluationRun)
        .options(
            selectinload(EvaluationRun.suite),
            selectinload(EvaluationRun.results).selectinload(EvaluationCaseResult.case),
        )
        .filter(EvaluationRun.id == run.id)
        .one()
    )


def build_demo_catalog() -> list[DemoScenarioResponse]:
    return [
        DemoScenarioResponse(
            id="code_debug",
            title="Operational Workflow Review",
            description="展示问题分诊、步骤复盘、批量评测和审计事件的基础闭环。",
            capability_focus="问题分诊 / 工作流复盘 / 审计事件",
            default_prompt_version="v2",
        ),
        DemoScenarioResponse(
            id="paper_rag",
            title="Research Retrieval Review",
            description="展示检索摘要、证据覆盖和参考答案评估的基础框架。",
            capability_focus="检索问答 / 证据覆盖 / 参考答案评估",
            default_prompt_version="v1",
        ),
        DemoScenarioResponse(
            id="robotics_embedded",
            title="Device Operations Log Review",
            description="展示设备日志分析、异常定位和人工复核标注的基础场景。",
            capability_focus="日志分析 / 异常定位 / 人工复核",
            default_prompt_version="v2",
        ),
    ]


def build_demo_seed_bundles(scenario_id: str) -> list[dict[str, object]]:
    code_debug_bundle = {
        "trace_inputs": [
            {
                "user_input": "Review an operational issue report, summarize the failure symptoms, and identify the most likely root cause.",
                "execution_mode": "mock",
                "provider": "deepseek",
                "model_name": "deepseek-chat",
                "prompt_version": "v2",
            },
            {
                "user_input": "Summarize an incident timeline from the provided notes and identify the most important escalation point.",
                "execution_mode": "mock",
                "provider": "deepseek",
                "model_name": "deepseek-chat",
                "prompt_version": "v1",
            },
            {
                "user_input": "Review a workflow step that failed, explain the likely cause, and propose the safest next action.",
                "execution_mode": "mock",
                "provider": "deepseek",
                "model_name": "deepseek-chat",
                "prompt_version": "v0",
            },
        ],
        "suite_name": "Operational Review Demo Pack",
        "suite_description": "用于快速演示批量评测、judge 骨架和 trace 评分结果。",
        "cases": [
            {
                "title": "Issue Triage Summary",
                "user_input": "Review an operational issue report, summarize the failure symptoms, and identify the most likely root cause.",
                "expected_output": "failure symptoms root cause impact",
                "ground_truth_type": "keyword",
                "judge_guidance": "检查是否概括失败现象、根因判断和影响范围。",
                "judge_config_json": json.dumps({"keywords": ["failure", "symptoms", "root", "impact"]}, ensure_ascii=False),
                "score_rubric": "是否概括失败现象、根因判断和影响范围。",
            },
            {
                "title": "Workflow Recovery Step",
                "user_input": "Review a workflow step that failed, explain the likely cause, and propose the safest next action.",
                "expected_output": "workflow failed cause next action safe",
                "ground_truth_type": "keyword",
                "judge_guidance": "检查是否解释失败原因并给出安全后续动作。",
                "judge_config_json": json.dumps({"keywords": ["workflow", "failed", "next", "safe"]}, ensure_ascii=False),
                "score_rubric": "是否解释失败原因并给出安全后续动作。",
            },
        ],
        "prompt_version": "v2",
        "audit_reason": "Demo seed event used to show operational risk review flow.",
    }
    paper_rag_bundle = {
        "trace_inputs": [
            {
                "user_input": "Read three paper abstracts and summarize the core benchmark finding in one paragraph.",
                "execution_mode": "mock",
                "provider": "deepseek",
                "model_name": "deepseek-chat",
                "prompt_version": "v1",
            },
            {
                "user_input": "Explain why the retrieval step missed a relevant citation and what query rewrite should happen next.",
                "execution_mode": "mock",
                "provider": "deepseek",
                "model_name": "deepseek-chat",
                "prompt_version": "v1",
            },
        ],
        "suite_name": "Paper / RAG Demo Pack",
        "suite_description": "用于快速演示 reference answer judge、检索失败复盘和引用覆盖评测。",
        "cases": [
            {
                "title": "Benchmark Summary",
                "user_input": "Read three paper abstracts and summarize the core benchmark finding in one paragraph.",
                "expected_output": "benchmark finding retrieval accuracy summary citation",
                "ground_truth_type": "reference_answer",
                "judge_guidance": "检查回答是否包含 benchmark 结论、retrieval accuracy 和 citation 线索。",
                "judge_config_json": json.dumps({"keywords": ["benchmark", "retrieval", "accuracy", "citation"]}, ensure_ascii=False),
                "score_rubric": "是否提到 benchmark 结论，并保留 citation 线索。",
            },
            {
                "title": "Citation Miss Recovery",
                "user_input": "Explain why the retrieval step missed a relevant citation and what query rewrite should happen next.",
                "expected_output": "retrieval missed citation query rewrite next step",
                "ground_truth_type": "keyword",
                "judge_guidance": "检查是否解释 missed citation 原因，并给出 query rewrite 建议。",
                "judge_config_json": json.dumps({"keywords": ["retrieval", "citation", "rewrite", "next"]}, ensure_ascii=False),
                "score_rubric": "是否说明漏召回原因，并给出安全的下一步检索策略。",
            },
        ],
        "prompt_version": "v1",
        "audit_reason": "Demo seed event used to show retrieval-miss review flow.",
    }
    robotics_bundle = {
        "trace_inputs": [
            {
                "user_input": "Inspect a robot navigation log and identify the most likely root cause of repeated localization drift.",
                "execution_mode": "mock",
                "provider": "deepseek",
                "model_name": "deepseek-chat",
                "prompt_version": "v2",
            },
            {
                "user_input": "Explain why an embedded device watchdog reset happened after a sensor timeout and what safe recovery step should run next.",
                "execution_mode": "mock",
                "provider": "deepseek",
                "model_name": "deepseek-chat",
                "prompt_version": "v2",
            },
        ],
        "suite_name": "Robotics / Embedded Demo Pack",
        "suite_description": "用于快速演示日志分析、导航异常定位和人工复核标注链路。",
        "cases": [
            {
                "title": "Localization Drift",
                "user_input": "Inspect a robot navigation log and identify the most likely root cause of repeated localization drift.",
                "expected_output": "localization drift root cause sensor mismatch map alignment",
                "ground_truth_type": "reference_answer",
                "judge_guidance": "检查是否指出定位漂移、传感器不一致或地图对齐问题。",
                "judge_config_json": json.dumps({"keywords": ["localization", "drift", "sensor", "map"]}, ensure_ascii=False),
                "score_rubric": "是否定位到导航漂移根因，并给出可复盘解释。",
            },
            {
                "title": "Watchdog Recovery",
                "user_input": "Explain why an embedded device watchdog reset happened after a sensor timeout and what safe recovery step should run next.",
                "expected_output": "watchdog reset sensor timeout safe recovery",
                "ground_truth_type": "manual_review",
                "judge_guidance": "这个 case 先走人工复核，重点看恢复动作是否足够保守。",
                "judge_config_json": json.dumps({"keywords": ["watchdog", "timeout", "recovery"]}, ensure_ascii=False),
                "score_rubric": "是否解释 reset 原因，并给出保守的恢复流程。",
            },
        ],
        "prompt_version": "v2",
        "audit_reason": "Demo seed event used to show robotics safety review flow.",
    }

    if scenario_id == "paper_rag":
        return [paper_rag_bundle]
    if scenario_id == "robotics_embedded":
        return [robotics_bundle]
    if scenario_id == "all":
        return [code_debug_bundle, paper_rag_bundle, robotics_bundle]
    return [code_debug_bundle]


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/api/prompt-versions", response_model=list[PromptVersionResponse])
def list_prompt_versions() -> list[PromptVersionResponse]:
    return [
        PromptVersionResponse(
            version=item.version,
            label=item.label,
            label_zh=item.label_zh,
            description=item.description,
            description_zh=item.description_zh,
            system_prompt=item.system_prompt,
            system_prompt_zh=item.system_prompt_zh,
            recommended_model=item.recommended_model,
            focus=item.focus,
            focus_zh=item.focus_zh,
        )
        for item in list_prompt_definitions()
    ]


@app.put("/api/prompt-versions/{prompt_version}", response_model=list[PromptVersionResponse])
def upsert_prompt_version(prompt_version: str, request: PromptVersionUpsertRequest) -> list[PromptVersionResponse]:
    # Require the path version to match the payload version so frontend saves cannot silently rename records by mistake.
    if prompt_version != request.version:
        raise HTTPException(status_code=400, detail="Prompt version path and payload version must match")

    definitions = save_prompt_definition(
        PromptVersionDefinition(
            version=request.version,
            label=request.label,
            label_zh=request.label_zh,
            description=request.description,
            description_zh=request.description_zh,
            system_prompt=request.system_prompt,
            system_prompt_zh=request.system_prompt_zh,
            recommended_model=request.recommended_model,
            focus=request.focus,
            focus_zh=request.focus_zh,
        )
    )

    return [
        PromptVersionResponse(
            version=item.version,
            label=item.label,
            label_zh=item.label_zh,
            description=item.description,
            description_zh=item.description_zh,
            system_prompt=item.system_prompt,
            system_prompt_zh=item.system_prompt_zh,
            recommended_model=item.recommended_model,
            focus=item.focus,
            focus_zh=item.focus_zh,
        )
        for item in definitions
    ]


@app.get("/api/integrations", response_model=list[ExternalIntegrationSourceResponse])
def list_integration_sources(db: Session = Depends(get_db)) -> list[ExternalIntegrationSourceResponse]:
    sources = (
        db.query(ExternalIntegrationSource)
        .options(selectinload(ExternalIntegrationSource.usage_records))
        .order_by(ExternalIntegrationSource.created_at.desc())
        .all()
    )
    return [build_external_integration_source(source) for source in sources]


@app.get("/api/integrations/connectors", response_model=list[ExternalConnectorTemplateResponse])
def list_external_connectors() -> list[ExternalConnectorTemplateResponse]:
    return build_connector_catalog()


@app.get("/api/integrations/connectors/history", response_model=list[ExternalConnectorSyncJobResponse])
def list_external_connector_history(db: Session = Depends(get_db)) -> list[ExternalConnectorSyncJobResponse]:
    jobs = (
        db.query(ExternalConnectorSyncJob)
        .options(selectinload(ExternalConnectorSyncJob.source))
        .order_by(ExternalConnectorSyncJob.created_at.desc())
        .all()
    )
    return [build_connector_sync_job(job) for job in jobs]


@app.post("/api/integrations", response_model=ExternalIntegrationSourceResponse)
def create_integration_source(
    request: ExternalIntegrationSourceCreateRequest,
    db: Session = Depends(get_db),
) -> ExternalIntegrationSourceResponse:
    source = ExternalIntegrationSource(
        name=request.name,
        platform_name=request.platform_name,
        access_mode=request.access_mode,
        provider=request.provider,
        base_url=request.base_url,
        api_key_hint=request.api_key_hint,
        notes=request.notes,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    source = (
        db.query(ExternalIntegrationSource)
        .options(selectinload(ExternalIntegrationSource.usage_records))
        .filter(ExternalIntegrationSource.id == source.id)
        .one()
    )
    return build_external_integration_source(source)


@app.get("/api/integrations/usage", response_model=list[ExternalUsageRecordResponse])
def list_external_usage_records(db: Session = Depends(get_db)) -> list[ExternalUsageRecordResponse]:
    records = (
        db.query(ExternalUsageRecord)
        .options(selectinload(ExternalUsageRecord.source))
        .order_by(ExternalUsageRecord.recorded_at.desc())
        .all()
    )
    return [build_external_usage_record(record) for record in records]


@app.post("/api/integrations/usage", response_model=ExternalUsageRecordResponse)
def create_external_usage_record(
    request: ExternalUsageRecordCreateRequest,
    db: Session = Depends(get_db),
) -> ExternalUsageRecordResponse:
    source = (
        db.query(ExternalIntegrationSource)
        .filter(ExternalIntegrationSource.id == request.source_id)
        .first()
    )
    if source is None:
        raise HTTPException(status_code=404, detail="Integration source not found")

    normalized_usage = normalize_external_usage_values(
        token_usage=request.token_usage,
        input_token_usage=request.input_token_usage,
        output_token_usage=request.output_token_usage,
        cached_token_usage=request.cached_token_usage,
        cost_usd=request.cost_usd,
    )

    record = ExternalUsageRecord(
        source_id=request.source_id,
        model_name=request.model_name,
        run_count=request.run_count,
        token_usage=int(normalized_usage["token_usage"]),
        input_token_usage=int(normalized_usage["input_token_usage"]),
        output_token_usage=int(normalized_usage["output_token_usage"]),
        cached_token_usage=int(normalized_usage["cached_token_usage"]),
        cost_usd=float(normalized_usage["cost_usd"]),
        external_reference=request.external_reference,
        notes=request.notes,
        recorded_at=request.recorded_at or datetime.utcnow(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    record = (
        db.query(ExternalUsageRecord)
        .options(selectinload(ExternalUsageRecord.source))
        .filter(ExternalUsageRecord.id == record.id)
        .one()
    )
    return build_external_usage_record(record)


@app.post("/api/integrations/usage/import", response_model=ExternalUsageImportResponse)
def import_external_usage_records(
    request: ExternalUsageImportRequest,
    db: Session = Depends(get_db),
) -> ExternalUsageImportResponse:
    created_source_count = 0
    reused_source_count = 0
    skipped_duplicate_count = 0
    created_records: list[ExternalUsageRecord] = []

    for item in request.records:
        source, created = find_or_create_import_source(item, db)
        if created:
            created_source_count += 1
        else:
            reused_source_count += 1

        if item.external_reference:
            duplicate = (
                db.query(ExternalUsageRecord)
                .filter(
                    ExternalUsageRecord.source_id == source.id,
                    ExternalUsageRecord.external_reference == item.external_reference,
                )
                .first()
            )
            if duplicate is not None:
                skipped_duplicate_count += 1
                continue

        normalized_usage = normalize_external_usage_values(
            token_usage=item.token_usage,
            input_token_usage=item.input_token_usage,
            output_token_usage=item.output_token_usage,
            cached_token_usage=item.cached_token_usage,
            cost_usd=item.cost_usd,
        )

        record = ExternalUsageRecord(
            source_id=source.id,
            model_name=item.model_name,
            run_count=item.run_count,
            token_usage=int(normalized_usage["token_usage"]),
            input_token_usage=int(normalized_usage["input_token_usage"]),
            output_token_usage=int(normalized_usage["output_token_usage"]),
            cached_token_usage=int(normalized_usage["cached_token_usage"]),
            cost_usd=float(normalized_usage["cost_usd"]),
            external_reference=item.external_reference,
            notes=item.notes,
            recorded_at=item.recorded_at or datetime.utcnow(),
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        created_records.append(record)

    persisted_records = []
    if created_records:
        persisted_records = (
            db.query(ExternalUsageRecord)
            .options(selectinload(ExternalUsageRecord.source))
            .filter(ExternalUsageRecord.id.in_([record.id for record in created_records]))
            .order_by(ExternalUsageRecord.recorded_at.desc())
            .all()
        )

    return ExternalUsageImportResponse(
        created_source_count=created_source_count,
        reused_source_count=reused_source_count,
        created_record_count=len(created_records),
        skipped_duplicate_count=skipped_duplicate_count,
        created_records=[build_external_usage_record(record) for record in persisted_records],
    )


@app.get("/api/integrations/stats", response_model=ExternalUsageStatsResponse)
def get_external_usage_stats(
    time_range_days: int = 7,
    db: Session = Depends(get_db),
) -> ExternalUsageStatsResponse:
    normalized_days = min(max(time_range_days, 1), 30)
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=normalized_days - 1)

    records = (
        db.query(ExternalUsageRecord)
        .options(selectinload(ExternalUsageRecord.source))
        .filter(ExternalUsageRecord.recorded_at >= cutoff)
        .order_by(ExternalUsageRecord.recorded_at.asc())
        .all()
    )
    return build_external_usage_stats(records, time_range_days=normalized_days)


@app.get("/api/integrations/usage/validation", response_model=ExternalUsageValidationResponse)
def get_external_usage_validation(
    time_range_days: int = 7,
    source_id: int | None = None,
    db: Session = Depends(get_db),
) -> ExternalUsageValidationResponse:
    normalized_days = min(max(time_range_days, 1), 30)
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=normalized_days - 1)

    query = (
        db.query(ExternalUsageRecord)
        .options(selectinload(ExternalUsageRecord.source))
        .filter(ExternalUsageRecord.recorded_at >= cutoff)
    )
    if source_id is not None:
        query = query.filter(ExternalUsageRecord.source_id == source_id)

    records = query.order_by(ExternalUsageRecord.recorded_at.asc()).all()
    return build_external_usage_validation(records, time_range_days=normalized_days, source_id=source_id)


@app.post("/api/integrations/connectors/sync", response_model=ExternalConnectorSyncResponse)
def sync_external_connector(
    request: ExternalConnectorSyncRequest,
    db: Session = Depends(get_db),
) -> ExternalConnectorSyncResponse:
    connector = next((item for item in build_connector_catalog() if item.id == request.connector_id), None)
    if connector is None:
        create_connector_sync_job(request.connector_id, request.lookback_days, db, status="failed", error_message="Connector template not found")
        raise HTTPException(status_code=404, detail="Connector template not found")

    source = ensure_connector_source(connector, db)
    created_records = build_connector_records(connector, source.id, request.lookback_days)
    db.add_all(created_records)
    db.commit()
    create_connector_sync_job(connector.id, request.lookback_days, db, source_id=source.id, created_record_count=len(created_records))

    persisted_records = (
        db.query(ExternalUsageRecord)
        .options(selectinload(ExternalUsageRecord.source))
        .filter(ExternalUsageRecord.external_reference.in_([record.external_reference for record in created_records]))
        .order_by(ExternalUsageRecord.recorded_at.desc())
        .all()
    )
    hydrated_source = (
        db.query(ExternalIntegrationSource)
        .options(selectinload(ExternalIntegrationSource.usage_records))
        .filter(ExternalIntegrationSource.id == source.id)
        .one()
    )
    return ExternalConnectorSyncResponse(
        connector=connector,
        source=build_external_integration_source(hydrated_source),
        created_records=[build_external_usage_record(record) for record in persisted_records],
    )


@app.post("/api/integrations/connectors/jobs/{job_id}/retry", response_model=ExternalConnectorSyncResponse)
def retry_external_connector_job(job_id: int, db: Session = Depends(get_db)) -> ExternalConnectorSyncResponse:
    job = (
        db.query(ExternalConnectorSyncJob)
        .options(selectinload(ExternalConnectorSyncJob.source))
        .filter(ExternalConnectorSyncJob.id == job_id)
        .first()
    )
    if job is None:
        raise HTTPException(status_code=404, detail="Connector sync job not found")
    return sync_external_connector(ExternalConnectorSyncRequest(connector_id=job.connector_id, lookback_days=job.lookback_days), db)


@app.post("/api/traces", response_model=TraceDetailResponse)
def create_trace_run(request: RunTraceRequest, db: Session = Depends(get_db)) -> TraceDetailResponse:
    trace = execute_and_store_trace(request, db)
    return build_trace_detail(trace)


@app.post("/api/traces/{trace_id}/replay", response_model=TraceDetailResponse)
def replay_trace(trace_id: str, db: Session = Depends(get_db)) -> TraceDetailResponse:
    source_trace = (
        db.query(Trace)
        .options(selectinload(Trace.steps))
        .filter(Trace.id == trace_id)
        .first()
    )
    if source_trace is None:
        raise HTTPException(status_code=404, detail="Trace not found")

    replay_request = build_run_request_from_trace(source_trace)
    replayed_trace = execute_and_store_trace(replay_request, db, replay_source_trace_id=source_trace.id)
    return build_trace_detail(replayed_trace)


@app.post("/api/traces/{trace_id}/score", response_model=TraceDetailResponse)
def score_trace(
    trace_id: str,
    request: TraceScoreUpdateRequest,
    db: Session = Depends(get_db),
) -> TraceDetailResponse:
    trace = (
        db.query(Trace)
        .options(selectinload(Trace.steps))
        .filter(Trace.id == trace_id)
        .first()
    )
    if trace is None:
        raise HTTPException(status_code=404, detail="Trace not found")

    trace.quality_label = request.quality_label
    trace.quality_score = request.quality_score
    trace.quality_notes = request.quality_notes
    db.commit()
    db.refresh(trace)
    return build_trace_detail(trace)


@app.get("/api/traces", response_model=list[TraceListItemResponse])
def list_traces(db: Session = Depends(get_db)) -> list[TraceListItemResponse]:
    traces = db.query(Trace).options(selectinload(Trace.steps)).order_by(Trace.created_at.desc()).all()
    return [build_trace_list_item(trace) for trace in traces]


@app.get("/api/traces/stats", response_model=TraceStatsResponse)
def get_trace_stats(
    time_range_days: int = 7,
    provider: str | None = None,
    task_type: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
) -> TraceStatsResponse:
    normalized_days = min(max(time_range_days, 1), 30)
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=normalized_days - 1)

    query = db.query(Trace).filter(Trace.created_at >= cutoff)
    if provider and provider != "all":
        query = query.filter(Trace.provider == provider)
    if task_type and task_type != "all":
        query = query.filter(Trace.task_type == task_type)
    if status and status != "all":
        query = query.filter(Trace.status == status)

    traces = query.order_by(Trace.created_at.asc()).all()
    return build_trace_stats(traces, time_range_days=normalized_days)


@app.get("/api/traces/{trace_id}", response_model=TraceDetailResponse)
def get_trace(trace_id: str, db: Session = Depends(get_db)) -> TraceDetailResponse:
    trace = (
        db.query(Trace)
        .options(selectinload(Trace.steps))
        .filter(Trace.id == trace_id)
        .first()
    )
    if trace is None:
        raise HTTPException(status_code=404, detail="Trace not found")
    return build_trace_detail(trace)


@app.get("/api/evaluations/suites", response_model=list[EvaluationSuiteListItemResponse])
def list_evaluation_suites(db: Session = Depends(get_db)) -> list[EvaluationSuiteListItemResponse]:
    suites = (
        db.query(EvaluationSuite)
        .options(selectinload(EvaluationSuite.cases), selectinload(EvaluationSuite.runs))
        .order_by(EvaluationSuite.created_at.desc())
        .all()
    )
    return [build_evaluation_suite_list_item(suite) for suite in suites]


@app.post("/api/evaluations/suites", response_model=EvaluationSuiteDetailResponse)
def create_evaluation_suite(
    request: EvaluationSuiteCreateRequest,
    db: Session = Depends(get_db),
) -> EvaluationSuiteDetailResponse:
    suite = EvaluationSuite(
        name=request.name,
        description=request.description,
        status="draft",
    )
    for case in request.cases:
        suite.cases.append(
            EvaluationCase(
                title=case.title,
                user_input=case.user_input,
                expected_output=case.expected_output,
                ground_truth_type=case.ground_truth_type,
                judge_guidance=case.judge_guidance,
                judge_config_json=case.judge_config_json,
                score_rubric=case.score_rubric,
            )
        )
    db.add(suite)
    db.commit()
    db.refresh(suite)
    suite = (
        db.query(EvaluationSuite)
        .options(selectinload(EvaluationSuite.cases), selectinload(EvaluationSuite.runs))
        .filter(EvaluationSuite.id == suite.id)
        .one()
    )
    return build_evaluation_suite_detail(suite)


@app.get("/api/evaluations/suites/{suite_id}", response_model=EvaluationSuiteDetailResponse)
def get_evaluation_suite(suite_id: int, db: Session = Depends(get_db)) -> EvaluationSuiteDetailResponse:
    suite = (
        db.query(EvaluationSuite)
        .options(selectinload(EvaluationSuite.cases), selectinload(EvaluationSuite.runs))
        .filter(EvaluationSuite.id == suite_id)
        .first()
    )
    if suite is None:
        raise HTTPException(status_code=404, detail="Evaluation suite not found")
    return build_evaluation_suite_detail(suite)


@app.get("/api/evaluations/runs", response_model=list[EvaluationRunResponse])
def list_evaluation_runs(db: Session = Depends(get_db)) -> list[EvaluationRunResponse]:
    runs = (
        db.query(EvaluationRun)
        .options(selectinload(EvaluationRun.suite), selectinload(EvaluationRun.results))
        .order_by(EvaluationRun.created_at.desc())
        .all()
    )
    return [build_evaluation_run(run) for run in runs]


@app.get("/api/evaluations/runs/{run_id}", response_model=EvaluationRunDetailResponse)
def get_evaluation_run(run_id: int, db: Session = Depends(get_db)) -> EvaluationRunDetailResponse:
    run = (
        db.query(EvaluationRun)
        .options(
            selectinload(EvaluationRun.suite),
            selectinload(EvaluationRun.results).selectinload(EvaluationCaseResult.case),
            selectinload(EvaluationRun.results).selectinload(EvaluationCaseResult.reviews),
        )
        .filter(EvaluationRun.id == run_id)
        .first()
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Evaluation run not found")
    return build_evaluation_run_detail(run)


@app.get("/api/evaluations/review-queue", response_model=EvaluationReviewQueueResponse)
def get_evaluation_review_queue(
    only_pending: bool = True,
    db: Session = Depends(get_db),
) -> EvaluationReviewQueueResponse:
    results = (
        db.query(EvaluationCaseResult)
        .options(
            selectinload(EvaluationCaseResult.case),
            selectinload(EvaluationCaseResult.reviews),
            selectinload(EvaluationCaseResult.review_assignments),
            selectinload(EvaluationCaseResult.run).selectinload(EvaluationRun.suite),
        )
        .order_by(EvaluationCaseResult.created_at.desc())
        .all()
    )

    queue_items = []
    reviewed_count = 0
    for result in results:
        latest_assignment = result.review_assignments[0] if result.review_assignments else None
        review_labels = {review.review_label for review in result.reviews}
        has_conflict = len(review_labels) >= 2 or bool(result.reviews and result.quality_label and result.reviews[0].review_label != result.quality_label)
        overdue = bool(
            latest_assignment
            and latest_assignment.due_at
            and latest_assignment.assignment_status != "done"
            and latest_assignment.due_at < datetime.utcnow()
        )
        unresolved = has_conflict and not result.adjudication_label
        needs_review = overdue or result.case.ground_truth_type == "manual_review" or not result.reviews or unresolved or (latest_assignment is not None and latest_assignment.assignment_status != "done")
        if result.reviews:
            reviewed_count += 1
        if needs_review or not only_pending:
            queue_items.append(build_review_queue_item(result))

    return EvaluationReviewQueueResponse(
        pending_count=len(queue_items),
        reviewed_count=reviewed_count,
        items=queue_items,
    )


@app.post("/api/evaluations/results/{result_id}/assignments", response_model=EvaluationReviewAssignmentResponse)
def create_review_assignment(
    result_id: int,
    request: EvaluationReviewAssignmentCreateRequest,
    db: Session = Depends(get_db),
) -> EvaluationReviewAssignmentResponse:
    result = (
        db.query(EvaluationCaseResult)
        .filter(EvaluationCaseResult.id == result_id)
        .first()
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Evaluation result not found")

    assignment = EvaluationReviewAssignment(
        evaluation_case_result_id=result_id,
        assignee_name=request.assignee_name,
        assignment_status=request.assignment_status,
        priority=request.priority,
        assignment_notes=request.assignment_notes,
        due_at=request.due_at,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return EvaluationReviewAssignmentResponse(
        id=assignment.id,
        result_id=assignment.evaluation_case_result_id,
        assignee_name=assignment.assignee_name,
        assignment_status=assignment.assignment_status,
        priority=assignment.priority,
        assignment_notes=assignment.assignment_notes,
        due_at=assignment.due_at,
        created_at=assignment.created_at,
    )


@app.post("/api/evaluations/results/{result_id}/adjudications", response_model=EvaluationResultAdjudicationResponse)
def adjudicate_review_result(
    result_id: int,
    request: EvaluationResultAdjudicationCreateRequest,
    db: Session = Depends(get_db),
) -> EvaluationResultAdjudicationResponse:
    result = (
        db.query(EvaluationCaseResult)
        .options(selectinload(EvaluationCaseResult.review_assignments))
        .filter(EvaluationCaseResult.id == result_id)
        .first()
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Evaluation result not found")

    result.adjudicated_by = request.adjudicated_by
    result.adjudication_label = request.adjudication_label
    result.adjudication_score = request.adjudication_score
    result.adjudication_notes = request.adjudication_notes
    result.adjudicated_at = datetime.utcnow()

    if request.mark_latest_assignment_done and result.review_assignments:
        result.review_assignments[0].assignment_status = "done"

    db.commit()
    db.refresh(result)
    return EvaluationResultAdjudicationResponse(
        result_id=result.id,
        adjudicated_by=result.adjudicated_by or request.adjudicated_by,
        adjudication_label=result.adjudication_label or request.adjudication_label,
        adjudication_score=result.adjudication_score,
        adjudication_notes=result.adjudication_notes,
        adjudicated_at=result.adjudicated_at or datetime.utcnow(),
    )


@app.get("/api/evaluations/compare-runs", response_model=EvaluationRunCompareResponse)
def compare_evaluation_runs(
    base_run_id: int,
    compare_run_id: int,
    db: Session = Depends(get_db),
) -> EvaluationRunCompareResponse:
    runs = (
        db.query(EvaluationRun)
        .options(
            selectinload(EvaluationRun.suite),
            selectinload(EvaluationRun.results).selectinload(EvaluationCaseResult.case),
            selectinload(EvaluationRun.results).selectinload(EvaluationCaseResult.reviews),
        )
        .filter(EvaluationRun.id.in_([base_run_id, compare_run_id]))
        .all()
    )
    if len(runs) != 2:
        raise HTTPException(status_code=404, detail="One or both evaluation runs were not found")

    run_by_id = {run.id: run for run in runs}
    base_run = run_by_id[base_run_id]
    compare_run = run_by_id[compare_run_id]
    if base_run.suite_id != compare_run.suite_id:
        raise HTTPException(status_code=400, detail="Only runs from the same suite can be compared")
    return build_evaluation_run_compare(base_run, compare_run)


@app.get("/api/evaluations/experiments/{experiment_label}/summary", response_model=EvaluationExperimentSummaryResponse)
def get_evaluation_experiment_summary(
    experiment_label: str,
    db: Session = Depends(get_db),
) -> EvaluationExperimentSummaryResponse:
    runs = (
        db.query(EvaluationRun)
        .options(
            selectinload(EvaluationRun.suite),
            selectinload(EvaluationRun.results).selectinload(EvaluationCaseResult.case),
            selectinload(EvaluationRun.results).selectinload(EvaluationCaseResult.reviews),
        )
        .filter(EvaluationRun.experiment_label == experiment_label)
        .order_by(EvaluationRun.created_at.asc())
        .all()
    )
    if not runs:
        raise HTTPException(status_code=404, detail="Experiment summary not found")
    return build_experiment_summary(runs)


@app.post("/api/evaluations/runs", response_model=EvaluationRunDetailResponse)
def create_evaluation_run(
    request: EvaluationRunCreateRequest,
    db: Session = Depends(get_db),
) -> EvaluationRunDetailResponse:
    suite = (
        db.query(EvaluationSuite)
        .options(selectinload(EvaluationSuite.cases))
        .filter(EvaluationSuite.id == request.suite_id)
        .first()
    )
    if suite is None:
        raise HTTPException(status_code=404, detail="Evaluation suite not found")

    # 第一版直接执行整套 case，目的是让评测链路从“能建壳”升级成“能跑出结果”。
    run = EvaluationRun(
        suite_id=request.suite_id,
        status="draft",
        execution_mode=request.execution_mode,
        provider=request.provider,
        model_name=request.model_name,
        prompt_version=request.prompt_version,
        experiment_label=request.experiment_label,
        total_cases=len(suite.cases),
        completed_cases=0,
        notes=request.notes,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    executed_run = run_evaluation_cases(run, suite, db)
    return build_evaluation_run_detail(executed_run)


@app.post("/api/evaluations/results/{result_id}/reviews", response_model=EvaluationResultReviewResponse)
def create_evaluation_result_review(
    result_id: int,
    request: EvaluationResultReviewCreateRequest,
    db: Session = Depends(get_db),
) -> EvaluationResultReviewResponse:
    result = (
        db.query(EvaluationCaseResult)
        .filter(EvaluationCaseResult.id == result_id)
        .first()
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Evaluation result not found")

    review = EvaluationResultReview(
        evaluation_case_result_id=result_id,
        reviewer_name=request.reviewer_name,
        review_label=request.review_label,
        review_score=request.review_score,
        review_notes=request.review_notes,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return EvaluationResultReviewResponse(
        id=review.id,
        result_id=review.evaluation_case_result_id,
        reviewer_name=review.reviewer_name,
        review_label=review.review_label,
        review_score=review.review_score,
        review_notes=review.review_notes,
        created_at=review.created_at,
    )


@app.post("/api/evaluations/matrix-runs", response_model=EvaluationMatrixRunResponse)
def create_evaluation_matrix_run(
    request: EvaluationMatrixRunCreateRequest,
    db: Session = Depends(get_db),
) -> EvaluationMatrixRunResponse:
    suite = (
        db.query(EvaluationSuite)
        .options(selectinload(EvaluationSuite.cases))
        .filter(EvaluationSuite.id == request.suite_id)
        .first()
    )
    if suite is None:
        raise HTTPException(status_code=404, detail="Evaluation suite not found")

    created_runs: list[EvaluationMatrixVariantResultResponse] = []
    for variant in request.variants:
        # 先逐个串行执行矩阵变体，目的是把多版本对照路径跑通，再决定是否引入后台队列。
        run = EvaluationRun(
            suite_id=request.suite_id,
            status="draft",
            execution_mode=request.execution_mode,
            provider=variant.provider,
            model_name=variant.model_name,
            prompt_version=variant.prompt_version,
            experiment_label=request.experiment_label,
            total_cases=len(suite.cases),
            completed_cases=0,
            notes=request.notes,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        executed_run = run_evaluation_cases(run, suite, db)
        created_runs.append(
            EvaluationMatrixVariantResultResponse(
                run_id=executed_run.id,
                label=variant.label,
                provider=executed_run.provider,
                model_name=executed_run.model_name,
                prompt_version=executed_run.prompt_version,
                average_score=executed_run.average_score,
                result_count=len(executed_run.results),
                status=executed_run.status,
            )
        )

    return EvaluationMatrixRunResponse(
        suite_id=suite.id,
        suite_name=suite.name,
        execution_mode=request.execution_mode,
        experiment_label=request.experiment_label,
        created_runs=created_runs,
    )


@app.get("/api/audit-events", response_model=list[AuditEventResponse])
def list_audit_events(db: Session = Depends(get_db)) -> list[AuditEventResponse]:
    events = db.query(AuditEvent).order_by(AuditEvent.created_at.desc()).all()
    return [build_audit_event(event) for event in events]


@app.post("/api/audit-events", response_model=AuditEventResponse)
def create_audit_event(
    request: AuditEventCreateRequest,
    db: Session = Depends(get_db),
) -> AuditEventResponse:
    if request.trace_id:
        trace_exists = db.query(Trace.id).filter(Trace.id == request.trace_id).first()
        if trace_exists is None:
            raise HTTPException(status_code=404, detail="Trace not found")

    event = AuditEvent(
        trace_id=request.trace_id,
        step_index=request.step_index,
        event_type=request.event_type,
        decision=request.decision,
        risk_level=request.risk_level,
        policy_name=request.policy_name,
        target_name=request.target_name,
        reason=request.reason,
        status=request.status,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return build_audit_event(event)


@app.get("/api/demo/scenarios", response_model=list[DemoScenarioResponse])
def list_demo_scenarios() -> list[DemoScenarioResponse]:
    return build_demo_catalog()


@app.post("/api/demo/seed", response_model=DemoSeedResponse)
def seed_demo_scenarios(
    request: DemoSeedRequest,
    db: Session = Depends(get_db),
) -> DemoSeedResponse:
    bundles = build_demo_seed_bundles(request.scenario_id)

    created_traces: list[Trace] = []
    created_suite_ids: list[int] = []
    created_run_ids: list[int] = []
    created_event_ids: list[int] = []

    for bundle in bundles:
        bundle_traces: list[Trace] = []
        for item in bundle["trace_inputs"]:
            trace = execute_and_store_trace(RunTraceRequest(**item), db)
            created_traces.append(trace)
            bundle_traces.append(trace)

        suite = EvaluationSuite(
            name=str(bundle["suite_name"]),
            description=str(bundle["suite_description"]),
            status="draft",
        )
        for case in bundle["cases"]:
            suite.cases.append(
                EvaluationCase(
                    title=str(case["title"]),
                    user_input=str(case["user_input"]),
                    expected_output=str(case["expected_output"]),
                    ground_truth_type=str(case["ground_truth_type"]),
                    judge_guidance=str(case["judge_guidance"]),
                    judge_config_json=str(case["judge_config_json"]),
                    score_rubric=str(case["score_rubric"]),
                )
            )
        db.add(suite)
        db.commit()
        db.refresh(suite)
        created_suite_ids.append(suite.id)
        suite = (
            db.query(EvaluationSuite)
            .options(selectinload(EvaluationSuite.cases))
            .filter(EvaluationSuite.id == suite.id)
            .one()
        )

        evaluation_run = EvaluationRun(
            suite_id=suite.id,
            status="draft",
            execution_mode="mock",
            provider="deepseek",
            model_name="deepseek-chat",
            prompt_version=str(bundle["prompt_version"]),
            experiment_label=f"demo:{request.scenario_id}",
            total_cases=len(suite.cases),
            notes="Demo seed run for onboarding and UI walkthrough.",
        )
        db.add(evaluation_run)
        db.commit()
        db.refresh(evaluation_run)
        evaluation_run = run_evaluation_cases(evaluation_run, suite, db)
        created_run_ids.append(evaluation_run.id)

        for index, trace in enumerate(bundle_traces[:2], start=1):
            event = AuditEvent(
                trace_id=trace.id,
                step_index=index,
                event_type="tool_call",
                decision="review" if index == 1 else "allow",
                risk_level="medium" if index == 1 else "low",
                policy_name="demo-policy",
                target_name="mock-tool-chain",
                reason=str(bundle["audit_reason"]),
                status="logged",
            )
            db.add(event)
            db.commit()
            db.refresh(event)
            created_event_ids.append(event.id)

    return DemoSeedResponse(
        scenario_id=request.scenario_id,
        created_trace_ids=[trace.id for trace in created_traces],
        created_suite_id=created_suite_ids[-1],
        created_run_id=created_run_ids[-1],
        created_audit_event_ids=created_event_ids,
    )