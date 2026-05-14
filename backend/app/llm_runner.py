import json
import os
from dataclasses import dataclass
from time import perf_counter
from urllib import error, request

from .prompt_registry import get_prompt_definition


OPENAI_COMPATIBLE_BASE_URL = "https://api.openai.com/v1"
DEEPSEEK_COMPATIBLE_BASE_URL = "https://api.deepseek.com/v1"
DEFAULT_LLM_TEMPERATURE = 0.2


@dataclass
class LLMRunResult:
    task_type: str
    final_output: str
    status: str
    token_usage: int
    input_token_usage: int
    output_token_usage: int
    cached_token_usage: int
    steps: list[dict]


def build_system_prompt(prompt_version: str) -> str:
    return get_prompt_definition(prompt_version).system_prompt


def normalize_provider(provider: str) -> str:
    normalized_provider = provider.strip().lower()
    if normalized_provider in {"deepseek", "deepseek-chat", "deepseek-reasoner"}:
        return "deepseek"
    if normalized_provider in {"openai", "openai-compatible"}:
        return "openai-compatible"
    return normalized_provider


def resolve_base_url(provider: str) -> str:
    # provider 既作为展示标签，也作为选择不同兼容网关默认值的开关。
    if provider.startswith("http://") or provider.startswith("https://"):
        return provider.rstrip("/")

    normalized_provider = normalize_provider(provider)
    if normalized_provider == "deepseek":
        return os.getenv("DEEPSEEK_BASE_URL", DEEPSEEK_COMPATIBLE_BASE_URL).rstrip("/")
    return os.getenv("OPENAI_BASE_URL", OPENAI_COMPATIBLE_BASE_URL).rstrip("/")


def resolve_api_key(provider: str) -> tuple[str | None, str]:
    normalized_provider = normalize_provider(provider)
    if normalized_provider == "deepseek":
        return os.getenv("DEEPSEEK_API_KEY"), "DEEPSEEK_API_KEY"
    return os.getenv("OPENAI_API_KEY"), "OPENAI_API_KEY"


def parse_message_content(payload: dict) -> str:
    message = payload["choices"][0]["message"]["content"]
    if isinstance(message, str):
        return message

    parts: list[str] = []
    for item in message:
        if isinstance(item, dict) and item.get("type") == "text":
            parts.append(str(item.get("text", "")))
    return "\n".join(part for part in parts if part).strip()


def parse_token_usage(payload: dict) -> tuple[int, int, int, int]:
    usage = payload.get("usage", {})
    input_token_usage = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    output_token_usage = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)

    # DeepSeek / 兼容网关的缓存字段命名不完全一致，这里先兼容常见写法。
    prompt_tokens_details = usage.get("prompt_tokens_details") or {}
    cached_token_usage = int(
        usage.get("cached_tokens")
        or usage.get("prompt_cache_hit_tokens")
        or prompt_tokens_details.get("cached_tokens")
        or 0
    )
    token_usage = int(usage.get("total_tokens") or (input_token_usage + output_token_usage))
    return token_usage, input_token_usage, output_token_usage, cached_token_usage


def run_llm_request(
    *,
    user_input: str,
    provider: str,
    model_name: str,
    prompt_version: str,
) -> LLMRunResult:
    steps: list[dict] = []
    system_prompt = build_system_prompt(prompt_version)
    normalized_provider = normalize_provider(provider)
    base_url = resolve_base_url(provider)

    steps.append(
        {
            "step_type": "reasoning",
            "title": "检查 LLM 接入配置",
            "detail": (
                f"准备调用兼容 chat completions 接口，provider={normalized_provider}，model={model_name}，"
                f"prompt_version={prompt_version}，base_url={base_url}。"
            ),
            "status": "completed",
            "latency_ms": 3.0,
        }
    )

    steps.append(
        {
            "step_type": "reasoning",
            "title": "装配系统提示词",
            "detail": (
                f"当前使用 {prompt_version} 版系统提示词。这样做是为了把 Prompt 版本也纳入 trace，"
                "后续才能比较不同版本的输出差异。"
            ),
            "tool_input": system_prompt,
            "status": "completed",
            "latency_ms": 2.0,
        }
    )

    call_start = perf_counter()
    api_key, api_key_env_name = resolve_api_key(provider)
    if not api_key:
        error_message = f"缺少 {api_key_env_name}，真实 LLM 调用已终止。"
        steps.append(
            {
                "step_type": "llm_call",
                "title": "执行 LLM 调用",
                "detail": "真实调用前必须先配置 API Key，这里直接返回失败 trace，方便在界面中观察配置问题。",
                "tool_name": f"{normalized_provider}_chat_completions",
                "tool_input": user_input,
                "tool_output": "未发送请求",
                "status": "failed",
                "latency_ms": round((perf_counter() - call_start) * 1000, 2),
                "error_message": error_message,
            }
        )
        return LLMRunResult(
            task_type="llm_framework",
            final_output=error_message,
            status="failed",
            token_usage=0,
            input_token_usage=0,
            output_token_usage=0,
            cached_token_usage=0,
            steps=steps,
        )

    request_payload = {
        "model": model_name,
        # 调试类产品优先需要稳定输出，因此先把 temperature 控制在较低水平。
        "temperature": DEFAULT_LLM_TEMPERATURE,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input},
        ],
    }
    http_request = request.Request(
        url=f"{base_url}/chat/completions",
        data=json.dumps(request_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(http_request, timeout=60) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
        final_output = parse_message_content(response_payload)
        token_usage, input_token_usage, output_token_usage, cached_token_usage = parse_token_usage(response_payload)
        steps.append(
            {
                "step_type": "llm_call",
                "title": "执行真实 LLM 调用",
                "detail": (
                    "已向兼容 chat completions 接口发起请求，并解析首个候选回复。"
                    f"本次 token 明细：input={input_token_usage}，output={output_token_usage}，cached={cached_token_usage}。"
                ),
                "tool_name": f"{normalized_provider}_chat_completions",
                "tool_input": json.dumps(request_payload, ensure_ascii=False),
                "tool_output": final_output,
                "status": "completed",
                "latency_ms": round((perf_counter() - call_start) * 1000, 2),
            }
        )
        return LLMRunResult(
            task_type="llm_framework",
            final_output=final_output or "模型返回空内容。",
            status="completed",
            token_usage=token_usage,
            input_token_usage=input_token_usage,
            output_token_usage=output_token_usage,
            cached_token_usage=cached_token_usage,
            steps=steps,
        )
    except error.HTTPError as exc:
        response_text = exc.read().decode("utf-8", errors="replace")
        error_message = f"LLM 接口返回 HTTP {exc.code}：{response_text}"
    except Exception as exc:  # noqa: BLE001
        error_message = f"LLM 调用失败：{exc}"

    steps.append(
        {
            "step_type": "llm_call",
            "title": "执行真实 LLM 调用",
            "detail": "请求已经发起，但接口返回了错误。保留错误内容是为了让前端能直接分类展示配置或网络问题。",
            "tool_name": f"{normalized_provider}_chat_completions",
            "tool_input": json.dumps(request_payload, ensure_ascii=False),
            "tool_output": error_message,
            "status": "failed",
            "latency_ms": round((perf_counter() - call_start) * 1000, 2),
            "error_message": error_message,
        }
    )
    return LLMRunResult(
        task_type="llm_framework",
        final_output=error_message,
        status="failed",
        token_usage=0,
        input_token_usage=0,
        output_token_usage=0,
        cached_token_usage=0,
        steps=steps,
    )