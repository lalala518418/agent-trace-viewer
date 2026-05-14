from dataclasses import dataclass


@dataclass(frozen=True)
class PromptVersionDefinition:
    version: str
    label: str
    description: str
    system_prompt: str
    recommended_model: str
    focus: str


PROMPT_VERSION_REGISTRY: dict[str, PromptVersionDefinition] = {
    "v0": PromptVersionDefinition(
        version="v0",
        label="工程化调试助手",
        description="先给结论，再给排查步骤，适合快速验证错误定位链路。",
        system_prompt="你是一个偏工程化的调试助手，需要先给结论，再给排查步骤。",
        recommended_model="deepseek-chat",
        focus="快速定位问题",
    ),
    "v1": PromptVersionDefinition(
        version="v1",
        label="可观测性分析助手",
        description="强调保留定位依据和后续验证建议，适合 trace 复盘。",
        system_prompt="你是一个 Agent 可观测性调试助手，需要在回答中保留问题定位依据和后续验证建议。",
        recommended_model="deepseek-chat",
        focus="复盘与解释",
    ),
    "v2": PromptVersionDefinition(
        version="v2",
        label="面试讲解版",
        description="强调原理、权衡与可讲述性，适合把一次 trace 整理成面试叙事。",
        system_prompt=(
            "你是一个面向面试讲解的 Agent 调试助手，需要按“结论、原因、验证、权衡”四段结构回答，"
            "并尽量把技术决策讲清楚。"
        ),
        recommended_model="deepseek-chat",
        focus="原理讲解与叙事",
    ),
}


def get_prompt_definition(prompt_version: str) -> PromptVersionDefinition:
    return PROMPT_VERSION_REGISTRY.get(prompt_version, PROMPT_VERSION_REGISTRY["v0"])


def list_prompt_definitions() -> list[PromptVersionDefinition]:
    return list(PROMPT_VERSION_REGISTRY.values())