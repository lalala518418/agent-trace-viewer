from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Trace(Base):
    __tablename__ = "traces"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_input: Mapped[str] = mapped_column(Text)
    task_type: Mapped[str] = mapped_column(String(64))
    final_output: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32))
    total_latency_ms: Mapped[float] = mapped_column(Float)
    # 这些字段让一次运行的执行模式和模型配置可以直接落库，后面做对比视图时不需要反推请求体。
    execution_mode: Mapped[str] = mapped_column(String(16), default="mock")
    provider: Mapped[str] = mapped_column(String(100), default="openai-compatible")
    model_name: Mapped[str] = mapped_column(String(100), default="gpt-4.1-mini")
    prompt_version: Mapped[str] = mapped_column(String(50), default="v0")
    # 保存 replay 来源，后面做复盘时可以直接知道这条 trace 是从哪次运行重跑出来的。
    replay_source_trace_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 保存运行快照而不只存版本号，目的是让后续 replay 和问题复现有稳定依据。
    run_config_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 评分先直接挂在 trace 上，目的是让单次运行复盘可以先闭环，后面再扩展到批量评测。
    quality_label: Mapped[str | None] = mapped_column(String(32), nullable=True)
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    quality_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_usage: Mapped[int] = mapped_column(Integer, default=0)
    input_token_usage: Mapped[int] = mapped_column(Integer, default=0)
    output_token_usage: Mapped[int] = mapped_column(Integer, default=0)
    cached_token_usage: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    steps: Mapped[list["TraceStep"]] = relationship(
        back_populates="trace",
        cascade="all, delete-orphan",
        order_by="TraceStep.step_index",
    )


class TraceStep(Base):
    __tablename__ = "trace_steps"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trace_id: Mapped[str] = mapped_column(ForeignKey("traces.id"))
    step_index: Mapped[int]
    step_type: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(128))
    detail: Mapped[str] = mapped_column(Text)
    tool_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tool_input: Mapped[str | None] = mapped_column(Text, nullable=True)
    tool_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32))
    latency_ms: Mapped[float] = mapped_column(Float)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    trace: Mapped[Trace] = relationship(back_populates="steps")


class ExternalIntegrationSource(Base):
    __tablename__ = "external_integration_sources"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))
    platform_name: Mapped[str] = mapped_column(String(100))
    access_mode: Mapped[str] = mapped_column(String(32), default="manual")
    provider: Mapped[str] = mapped_column(String(100), default="external")
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 只保存提示信息而不是完整密钥，避免把真实敏感值写进学习项目数据库。
    api_key_hint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    usage_records: Mapped[list["ExternalUsageRecord"]] = relationship(
        back_populates="source",
        cascade="all, delete-orphan",
        order_by="ExternalUsageRecord.recorded_at.desc()",
    )
    sync_jobs: Mapped[list["ExternalConnectorSyncJob"]] = relationship(
        back_populates="source",
        cascade="all, delete-orphan",
        order_by="ExternalConnectorSyncJob.created_at.desc()",
    )


class ExternalUsageRecord(Base):
    __tablename__ = "external_usage_records"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("external_integration_sources.id"))
    model_name: Mapped[str] = mapped_column(String(100), default="unknown")
    run_count: Mapped[int] = mapped_column(Integer, default=1)
    token_usage: Mapped[int] = mapped_column(Integer, default=0)
    input_token_usage: Mapped[int] = mapped_column(Integer, default=0)
    output_token_usage: Mapped[int] = mapped_column(Integer, default=0)
    cached_token_usage: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    external_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    source: Mapped[ExternalIntegrationSource] = relationship(back_populates="usage_records")


class ExternalConnectorSyncJob(Base):
    __tablename__ = "external_connector_sync_jobs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    connector_id: Mapped[str] = mapped_column(String(100))
    source_id: Mapped[int | None] = mapped_column(ForeignKey("external_integration_sources.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="success")
    lookback_days: Mapped[int] = mapped_column(Integer, default=3)
    created_record_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    source: Mapped[ExternalIntegrationSource | None] = relationship(back_populates="sync_jobs")


class EvaluationSuite(Base):
    __tablename__ = "evaluation_suites"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    cases: Mapped[list["EvaluationCase"]] = relationship(
        back_populates="suite",
        cascade="all, delete-orphan",
        order_by="EvaluationCase.id",
    )
    runs: Mapped[list["EvaluationRun"]] = relationship(
        back_populates="suite",
        cascade="all, delete-orphan",
        order_by="EvaluationRun.created_at.desc()",
    )


class EvaluationCase(Base):
    __tablename__ = "evaluation_cases"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    suite_id: Mapped[int] = mapped_column(ForeignKey("evaluation_suites.id"))
    title: Mapped[str] = mapped_column(String(120))
    user_input: Mapped[str] = mapped_column(Text)
    expected_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 先保留 ground truth 类型，后面就能从 keyword judge 逐步升级到 reference answer 或人工复核流。
    ground_truth_type: Mapped[str] = mapped_column(String(32), default="keyword")
    # 这里保存给 judge 的说明，目的是让学习时能看到 case 为什么会按这个方向判分。
    judge_guidance: Mapped[str | None] = mapped_column(Text, nullable=True)
    judge_config_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    score_rubric: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    suite: Mapped[EvaluationSuite] = relationship(back_populates="cases")
    results: Mapped[list["EvaluationCaseResult"]] = relationship(
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="EvaluationCaseResult.id",
    )


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    suite_id: Mapped[int] = mapped_column(ForeignKey("evaluation_suites.id"))
    status: Mapped[str] = mapped_column(String(32), default="draft")
    execution_mode: Mapped[str] = mapped_column(String(16), default="mock")
    provider: Mapped[str] = mapped_column(String(100), default="openai-compatible")
    model_name: Mapped[str] = mapped_column(String(100), default="gpt-4.1-mini")
    prompt_version: Mapped[str] = mapped_column(String(50), default="v0")
    # 评测矩阵先靠 experiment_label 归组，优点是简单、够学，也不需要额外 group 表。
    experiment_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    total_cases: Mapped[int] = mapped_column(Integer, default=0)
    completed_cases: Mapped[int] = mapped_column(Integer, default=0)
    average_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    suite: Mapped[EvaluationSuite] = relationship(back_populates="runs")
    results: Mapped[list["EvaluationCaseResult"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="EvaluationCaseResult.id",
    )


class EvaluationCaseResult(Base):
    __tablename__ = "evaluation_case_results"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    evaluation_run_id: Mapped[int] = mapped_column(ForeignKey("evaluation_runs.id"))
    case_id: Mapped[int] = mapped_column(ForeignKey("evaluation_cases.id"))
    trace_id: Mapped[str | None] = mapped_column(ForeignKey("traces.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    quality_label: Mapped[str | None] = mapped_column(String(32), nullable=True)
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    judge_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 裁决结果单独保存，原因是 judge 结论和多人复核后的最终口径都值得保留。
    adjudication_label: Mapped[str | None] = mapped_column(String(32), nullable=True)
    adjudication_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    adjudication_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    adjudicated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    adjudicated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    run: Mapped[EvaluationRun] = relationship(back_populates="results")
    case: Mapped[EvaluationCase] = relationship(back_populates="results")
    trace: Mapped[Trace | None] = relationship()
    reviews: Mapped[list["EvaluationResultReview"]] = relationship(
        back_populates="result",
        cascade="all, delete-orphan",
        order_by="EvaluationResultReview.created_at.desc()",
    )
    review_assignments: Mapped[list["EvaluationReviewAssignment"]] = relationship(
        back_populates="result",
        cascade="all, delete-orphan",
        order_by="EvaluationReviewAssignment.created_at.desc()",
    )


class EvaluationResultReview(Base):
    __tablename__ = "evaluation_result_reviews"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    evaluation_case_result_id: Mapped[int] = mapped_column(ForeignKey("evaluation_case_results.id"))
    reviewer_name: Mapped[str] = mapped_column(String(100), default="anonymous-reviewer")
    review_label: Mapped[str] = mapped_column(String(32), default="needs_review")
    review_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    result: Mapped[EvaluationCaseResult] = relationship(back_populates="reviews")


class EvaluationReviewAssignment(Base):
    __tablename__ = "evaluation_review_assignments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    evaluation_case_result_id: Mapped[int] = mapped_column(ForeignKey("evaluation_case_results.id"))
    assignee_name: Mapped[str] = mapped_column(String(100))
    assignment_status: Mapped[str] = mapped_column(String(32), default="pending")
    priority: Mapped[str] = mapped_column(String(32), default="medium")
    assignment_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 截止时间先挂在指派层，方便队列直接判断 overdue，而不需要额外工作流表。
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    result: Mapped[EvaluationCaseResult] = relationship(back_populates="review_assignments")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trace_id: Mapped[str | None] = mapped_column(ForeignKey("traces.id"), nullable=True)
    step_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    event_type: Mapped[str] = mapped_column(String(32), default="tool_call")
    decision: Mapped[str] = mapped_column(String(32), default="review")
    risk_level: Mapped[str] = mapped_column(String(32), default="medium")
    policy_name: Mapped[str] = mapped_column(String(100), default="default-policy")
    target_name: Mapped[str] = mapped_column(String(120), default="unknown-target")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="logged")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    trace: Mapped[Trace | None] = relationship()