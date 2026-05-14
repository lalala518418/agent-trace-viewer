from dataclasses import dataclass
from time import perf_counter

from .llm_runner import run_llm_request
from .tools import calculator_tool, code_scan_tool, search_tool


@dataclass
class AgentRunResult:
    task_type: str
    final_output: str
    status: str
    total_latency_ms: float
    token_usage: int
    input_token_usage: int
    output_token_usage: int
    cached_token_usage: int
    steps: list[dict]


def run_agent(
    user_input: str,
    *,
    execution_mode: str = "mock",
    provider: str = "openai-compatible",
    model_name: str = "gpt-4.1-mini",
    prompt_version: str = "v0",
) -> AgentRunResult:
    start_time = perf_counter()
    steps: list[dict] = []

    steps.append(
        {
            "step_type": "input",
            "title": "接收任务输入",
            "detail": (
                f"收到用户请求，execution_mode={execution_mode}，provider={provider}，"
                f"model_name={model_name}，prompt_version={prompt_version}。"
            ),
            "status": "completed",
            "latency_ms": 5.0,
        }
    )

    if execution_mode == "llm":
        llm_result = run_llm_request(
            user_input=user_input,
            provider=provider,
            model_name=model_name,
            prompt_version=prompt_version,
        )
        steps.extend(llm_result.steps)
        total_latency_ms = round((perf_counter() - start_time) * 1000, 2)
        return AgentRunResult(
            task_type=llm_result.task_type,
            final_output=llm_result.final_output,
            status=llm_result.status,
            total_latency_ms=total_latency_ms,
            token_usage=llm_result.token_usage,
            input_token_usage=llm_result.input_token_usage,
            output_token_usage=llm_result.output_token_usage,
            cached_token_usage=llm_result.cached_token_usage,
            steps=steps,
        )

    if "unsupported operand type" in user_input.lower():
        task_type = "code_debug"
        tool_start = perf_counter()
        tool_result = code_scan_tool.run(user_input)
        steps.append(
            {
                "step_type": "reasoning",
                "title": "识别任务类型",
                "detail": "当前请求更像 Python 类型错误分析任务，因此进入代码扫描链路。",
                "status": "completed",
                "latency_ms": 6.0,
            }
        )
        steps.append(
            {
                "step_type": "tool_call",
                "title": "调用代码扫描工具",
                "detail": "使用本地演示工具返回一个稳定可复现的错误原因说明。",
                "tool_name": "code_scan_tool",
                "tool_input": user_input,
                "tool_output": tool_result,
                "status": "completed",
                "latency_ms": round((perf_counter() - tool_start) * 1000, 2),
            }
        )
        final_output = f"Likely cause: {tool_result}"
        status = "completed"
    elif "calculate" in user_input.lower() or "21 * 2" in user_input:
        task_type = "calculation"
        tool_start = perf_counter()
        tool_result = calculator_tool.run("21 * 2")
        steps.append(
            {
                "step_type": "tool_call",
                "title": "调用计算工具",
                "detail": "使用本地确定性计算工具输出稳定结果，方便前期验证 trace 展示。",
                "tool_name": "calculator_tool",
                "tool_input": "21 * 2",
                "tool_output": tool_result,
                "status": "completed",
                "latency_ms": round((perf_counter() - tool_start) * 1000, 2),
            }
        )
        final_output = f"Calculation result: {tool_result}"
        status = "completed"
    else:
        task_type = "search"
        tool_start = perf_counter()
        tool_result = search_tool.run(user_input)
        steps.append(
            {
                "step_type": "tool_call",
                "title": "调用本地搜索工具",
                "detail": "使用离线 mock 搜索工具，保证 MVP 在 Windows 本地可运行且结果稳定。",
                "tool_name": "search_tool",
                "tool_input": user_input,
                "tool_output": tool_result,
                "status": "completed",
                "latency_ms": round((perf_counter() - tool_start) * 1000, 2),
            }
        )
        final_output = f"Search result: {tool_result}"
        status = "completed"

    total_latency_ms = round((perf_counter() - start_time) * 1000, 2)
    return AgentRunResult(
        task_type=task_type,
        final_output=final_output,
        status=status,
        total_latency_ms=total_latency_ms,
        token_usage=0,
        input_token_usage=0,
        output_token_usage=0,
        cached_token_usage=0,
        steps=steps,
    )