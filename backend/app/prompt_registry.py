from dataclasses import asdict, dataclass
import json
from pathlib import Path


@dataclass(frozen=True)
class PromptVersionDefinition:
    version: str
    label: str
    label_zh: str
    description: str
    description_zh: str
    system_prompt: str
    system_prompt_zh: str
    recommended_model: str
    focus: str
    focus_zh: str


DEFAULT_PROMPT_DEFINITIONS: list[PromptVersionDefinition] = [
    PromptVersionDefinition(
        version="v0",
        label="Engineering Debug Assistant",
        label_zh="工程化调试助手",
        description="Leads with a conclusion and then gives a short troubleshooting path for quick validation.",
        description_zh="先给结论，再给排查步骤，适合快速验证错误定位链路。",
        system_prompt="You are an engineering-focused debugging assistant. Start with the conclusion, then give the troubleshooting steps.",
        system_prompt_zh="你是一个偏工程化的调试助手，需要先给结论，再给排查步骤。",
        recommended_model="deepseek-chat",
        focus="Fast issue isolation",
        focus_zh="快速定位问题",
    ),
    PromptVersionDefinition(
        version="v1",
        label="Observability Analyst",
        label_zh="可观测性分析助手",
        description="Keeps the reasoning trail and next validation steps visible for trace review.",
        description_zh="强调保留定位依据和后续验证建议，适合做 trace 复盘。",
        system_prompt="You are an observability-focused agent debugging assistant. Preserve the evidence trail and the next validation steps in your answer.",
        system_prompt_zh="你是一个 Agent 可观测性调试助手，需要在回答中保留问题定位依据和后续验证建议。",
        recommended_model="deepseek-chat",
        focus="Review and explanation",
        focus_zh="复盘与解释",
    ),
    PromptVersionDefinition(
        version="v2",
        label="Interview Narrator",
        label_zh="面试讲解版",
        description="Explains principles, tradeoffs, and validation in a way that is easy to present in an interview.",
        description_zh="强调原理、权衡与可讲述性，适合把一次 trace 整理成面试叙事。",
        system_prompt=(
            "You are an agent debugging assistant optimized for interview storytelling. "
            "Answer in four parts: conclusion, cause, validation, and tradeoff."
        ),
        system_prompt_zh="你是一个面向面试讲解的 Agent 调试助手，需要按“结论、原因、验证、权衡”四段结构回答，并尽量把技术决策讲清楚。",
        recommended_model="deepseek-chat",
        focus="Principles and narrative",
        focus_zh="原理讲解与叙事",
    ),
]

PROMPT_DATA_PATH = Path(__file__).with_name("prompt_versions.json")


def _write_prompt_file(definitions: list[PromptVersionDefinition]) -> None:
    # Keep prompt versions in a plain JSON file so the learning project can inspect and edit them without a database migration.
    payload = [asdict(item) for item in definitions]
    PROMPT_DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _load_prompt_file() -> list[PromptVersionDefinition]:
    if not PROMPT_DATA_PATH.exists():
        _write_prompt_file(DEFAULT_PROMPT_DEFINITIONS)
        return DEFAULT_PROMPT_DEFINITIONS

    raw_items = json.loads(PROMPT_DATA_PATH.read_text(encoding="utf-8"))
    normalized_items = []
    for item in raw_items:
        default_match = next((definition for definition in DEFAULT_PROMPT_DEFINITIONS if definition.version == item.get("version")), None)
        normalized_items.append(
            PromptVersionDefinition(
                version=item["version"],
                label=item["label"],
                label_zh=item.get("label_zh") or (default_match.label_zh if default_match else item["label"]),
                description=item["description"],
                description_zh=item.get("description_zh") or (default_match.description_zh if default_match else item["description"]),
                system_prompt=item["system_prompt"],
                system_prompt_zh=item.get("system_prompt_zh") or (default_match.system_prompt_zh if default_match else item["system_prompt"]),
                recommended_model=item["recommended_model"],
                focus=item["focus"],
                focus_zh=item.get("focus_zh") or (default_match.focus_zh if default_match else item["focus"]),
            )
        )

    return normalized_items


def get_prompt_definition(prompt_version: str) -> PromptVersionDefinition:
    definitions = list_prompt_definitions()
    return next((item for item in definitions if item.version == prompt_version), definitions[0])


def list_prompt_definitions() -> list[PromptVersionDefinition]:
    return _load_prompt_file()


def save_prompt_definition(definition: PromptVersionDefinition) -> list[PromptVersionDefinition]:
    definitions = list_prompt_definitions()
    updated_definitions: list[PromptVersionDefinition] = []
    replaced = False

    for item in definitions:
        if item.version == definition.version:
            updated_definitions.append(definition)
            replaced = True
            continue
        updated_definitions.append(item)

    if not replaced:
        updated_definitions.append(definition)

    updated_definitions.sort(key=lambda item: item.version)
    _write_prompt_file(updated_definitions)
    return updated_definitions