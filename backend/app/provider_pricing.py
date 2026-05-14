from dataclasses import dataclass


OFFICIAL_PRICING_REVIEWED_AT = "2026-05-14"


@dataclass(frozen=True)
class ProviderPricingRule:
    provider: str
    model_aliases: tuple[str, ...]
    display_name: str
    input_cost_per_million_usd: float
    output_cost_per_million_usd: float
    cached_input_cost_per_million_usd: float | None
    official_source_url: str
    official_source_label: str
    notes: str

    def matches(self, provider: str, model_name: str) -> bool:
        normalized_provider = provider.strip().lower()
        normalized_model = model_name.strip().lower()
        return normalized_provider == self.provider and normalized_model in self.model_aliases


# 这里把“项目当前明确核过的官方口径”集中放到一处，目的是让成本估算、校验接口和文档引用同一份标准。
# 如果官方页面更新，只需要改这里，再重新跑校验即可，不必到前后端多处追常量。
PROVIDER_PRICING_RULES: tuple[ProviderPricingRule, ...] = (
    ProviderPricingRule(
        provider="anthropic",
        model_aliases=("claude-sonnet-4", "claude-sonnet-4.5", "claude-sonnet-4.6", "claude-sonnet-4-6"),
        display_name="Anthropic Claude Sonnet",
        input_cost_per_million_usd=3.0,
        output_cost_per_million_usd=15.0,
        cached_input_cost_per_million_usd=0.3,
        official_source_url="https://platform.claude.com/docs/en/docs/about-claude/pricing",
        official_source_label="Anthropic Claude API Pricing",
        notes="按 Anthropic 官方 pricing 页的 Sonnet 4.x 与 cache read 口径估算；cached_token_usage 视为 cache hit/read。",
    ),
    ProviderPricingRule(
        provider="deepseek",
        model_aliases=("deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash"),
        display_name="DeepSeek V4 Flash / Chat",
        input_cost_per_million_usd=0.14,
        output_cost_per_million_usd=0.28,
        cached_input_cost_per_million_usd=0.0028,
        official_source_url="https://api-docs.deepseek.com/quick_start/pricing",
        official_source_label="DeepSeek Models & Pricing",
        notes="官方文档说明 deepseek-chat / deepseek-reasoner 兼容映射到 DeepSeek-V4-Flash 的非 thinking / thinking 模式，因此先共用这一组价格。",
    ),
    ProviderPricingRule(
        provider="openai-compatible",
        model_aliases=("gpt-5.4-mini", "gpt-5.4 mini"),
        display_name="OpenAI GPT-5.4 mini",
        input_cost_per_million_usd=0.75,
        output_cost_per_million_usd=4.5,
        cached_input_cost_per_million_usd=0.075,
        official_source_url="https://openai.com/api/pricing",
        official_source_label="OpenAI API Pricing",
        notes="当前仓库只把 OpenAI 官方页里可稳定抓取到的 GPT-5.4 mini 录成标准快照。历史 gpt-4.1-mini 记录会在校验面板里标记为待人工核对。",
    ),
)


def find_provider_pricing_rule(provider: str, model_name: str) -> ProviderPricingRule | None:
    for rule in PROVIDER_PRICING_RULES:
        if rule.matches(provider, model_name):
            return rule
    return None


def estimate_usage_cost(
    *,
    provider: str,
    model_name: str,
    input_token_usage: int,
    output_token_usage: int,
    cached_token_usage: int,
) -> dict[str, float | str] | None:
    rule = find_provider_pricing_rule(provider, model_name)
    if rule is None:
        return None

    normalized_input = max(input_token_usage, 0)
    normalized_output = max(output_token_usage, 0)
    normalized_cached = min(max(cached_token_usage, 0), normalized_input)
    uncached_input = max(normalized_input - normalized_cached, 0)
    cached_rate = rule.cached_input_cost_per_million_usd if rule.cached_input_cost_per_million_usd is not None else rule.input_cost_per_million_usd
    estimated_cost_usd = round(
        (
            uncached_input * rule.input_cost_per_million_usd
            + normalized_cached * cached_rate
            + normalized_output * rule.output_cost_per_million_usd
        ) / 1_000_000,
        6,
    )

    return {
        "estimated_cost_usd": estimated_cost_usd,
        "billing_formula": (
            f"(uncached_input x ${rule.input_cost_per_million_usd}/MTok) + "
            f"(cached_input x ${cached_rate}/MTok) + "
            f"(output x ${rule.output_cost_per_million_usd}/MTok)"
        ),
    }