# Provider Pricing Reference

这份文档只记录“当前已经核过官方来源”的 provider 成本口径，目的是给项目里的成本估算、校验接口和人工 review 提供统一标准。

## 使用原则

- 先看官方来源，再接受本地 cost 结论
- 如果某个 provider / model 没有出现在这里，就把它视为“待人工核对”，不要把估算结果写成已验证事实
- 当官方定价页更新后，优先更新本文件和 backend/app/provider_pricing.py，再重跑校验面板

## 当前快照

- 快照日期：2026-05-14

### Anthropic

- 官方来源：https://platform.claude.com/docs/en/docs/about-claude/pricing
- 当前采用模型：Claude Sonnet 4.x
- Input：$3.00 / 1M tokens
- Cached input read：$0.30 / 1M tokens
- Output：$15.00 / 1M tokens
- 说明：Prompt caching 的 cache read 按 base input 的 0.1x 计费，因此项目里的 cached_token_usage 会按 cache hit/read 口径估算。

### OpenAI

- 官方来源：https://openai.com/api/pricing
- 当前采用模型：GPT-5.4 mini
- Input：$0.75 / 1M tokens
- Cached input：$0.075 / 1M tokens
- Output：$4.50 / 1M tokens
- 说明：当前抓到的官方页面稳定包含 GPT-5.4 mini。仓库里历史 gpt-4.1-mini 记录不会被自动套进这组价格，而是会在校验面板里标记为待人工核对。

### DeepSeek

- 官方来源：https://api-docs.deepseek.com/quick_start/pricing
- 当前采用模型：DeepSeek-V4-Flash / deepseek-chat 兼容别名
- Input（cache miss）：$0.14 / 1M tokens
- Cached input（cache hit）：$0.0028 / 1M tokens
- Output：$0.28 / 1M tokens
- 说明：DeepSeek 文档说明 deepseek-chat / deepseek-reasoner 与 DeepSeek-V4-Flash 的兼容模式对应，因此项目里先共用这一组价格。

## 当前已知限制

- gpt-4.1-mini 这类未出现在当前官方抓取快照里的模型，不会被项目自动估算成本
- 这里的估算只覆盖 token 计费，不覆盖搜索调用、容器运行、托管 Agent runtime 等附加收费项
- 如果外部平台导出的 cached_token_usage 语义不是 cache hit/read，而是别的缓存统计口径，需要先单独核对再接入