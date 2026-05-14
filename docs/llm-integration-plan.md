# LLM 接入规划

## 当前状态

当前项目已经预留了真实 LLM 接入所需的参数入口：

- `execution_mode`
- `provider`
- `model_name`
- `prompt_version`

后端当前会在 `execution_mode=llm` 时调用 OpenAI 兼容 `chat/completions` 接口，并把下面这些信息写进 trace：

- `provider`
- `model_name`
- `prompt_version`
- `token_usage`
- `input_token_usage`
- `output_token_usage`
- `cached_token_usage`
- 真实请求成功或失败的步骤详情

## 当前实现策略

- 请求协议：OpenAI 兼容 `chat/completions`
- provider 适配：当前支持 `deepseek` 和 `openai-compatible`
- 环境变量：`DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` 或 `OPENAI_API_KEY` / `OPENAI_BASE_URL`
- 默认温度：`0.2`
- Prompt 版本：当前内置 `v0`、`v1`、`v2`，并通过接口返回给前端下拉选择

之所以先把温度固定在较低值，是因为当前项目的目标是做 trace 和调试观测，不是追求发散式内容生成。输出更稳定，前端对比才更有意义。

## 为什么这样接

- 先把 trace 结构固定下来，后续接真实 API 时不会把前后端整体推翻
- 先把 provider、model_name 和 prompt_version 的输入路径确定下来
- DeepSeek 和 OpenAI 都兼容同一类 chat completions 协议，所以先做 provider 适配层，能减少重复代码
- 先把 UI、错误分类和导出逻辑接到真实返回的数据结构上

## 当前仍然保留的占位点

- 占位：按 provider 自动切换不同请求签名
- 占位：支持流式输出和分段 token 统计
- 占位：Prompt 模板管理后台和版本回放
- 占位：失败重试与熔断策略

## 建议的下一步补强

1. 继续补 provider 适配层
2. 增加流式输出和分段 token 统计
3. 补错误重试和错误码映射
4. 把 Prompt 注册表升级为可编辑模板文件
5. 增加 Prompt 版本回放