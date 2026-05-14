from collections.abc import Sequence
from uuid import uuid4

from sqlalchemy.orm import Session

from .models import Trace, TraceStep


def create_trace(
    db: Session,
    *,
    task_input: str,
    task_type: str,
    final_output: str,
    status: str,
    total_latency_ms: float,
    execution_mode: str,
    provider: str,
    model_name: str,
    prompt_version: str,
    replay_source_trace_id: str | None,
    run_config_json: str | None,
    token_usage: int,
    input_token_usage: int,
    output_token_usage: int,
    cached_token_usage: int,
    steps: Sequence[dict],
) -> Trace:
    trace = Trace(
        id=f"trace_{uuid4().hex[:12]}",
        task_input=task_input,
        task_type=task_type,
        final_output=final_output,
        status=status,
        total_latency_ms=total_latency_ms,
        execution_mode=execution_mode,
        provider=provider,
        model_name=model_name,
        prompt_version=prompt_version,
        replay_source_trace_id=replay_source_trace_id,
        run_config_json=run_config_json,
        token_usage=token_usage,
        input_token_usage=input_token_usage,
        output_token_usage=output_token_usage,
        cached_token_usage=cached_token_usage,
    )

    for index, step in enumerate(steps, start=1):
        trace.steps.append(
            TraceStep(
                step_index=index,
                step_type=step["step_type"],
                title=step["title"],
                detail=step["detail"],
                tool_name=step.get("tool_name"),
                tool_input=step.get("tool_input"),
                tool_output=step.get("tool_output"),
                status=step["status"],
                latency_ms=step["latency_ms"],
                error_message=step.get("error_message"),
            )
        )

    db.add(trace)
    db.commit()
    db.refresh(trace)
    return trace