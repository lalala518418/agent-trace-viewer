# 数据库结构占位文档

## 当前已存在的数据表

### traces

- `id`
- `task_input`
- `task_type`
- `final_output`
- `status`
- `total_latency_ms`
- `execution_mode`
- `provider`
- `model_name`
- `prompt_version`
- `token_usage`
- `input_token_usage`
- `output_token_usage`
- `cached_token_usage`
- `created_at`

### trace_steps

- `id`
- `trace_id`
- `step_index`
- `step_type`
- `title`
- `detail`
- `tool_name`
- `tool_input`
- `tool_output`
- `status`
- `latency_ms`
- `error_message`

这些字段的作用分别是：

- `execution_mode`：区分这条 trace 是 mock 还是 llm，方便列表筛选和对比。
- `provider`：记录当前实际走的是哪个兼容网关或标签。
- `model_name`：记录模型名，后面做效果对比时很关键。
- `prompt_version`：记录系统提示词版本，方便做 Prompt 实验。
- `token_usage`：记录总 token 数，用于概览和粗粒度对比。
- `input_token_usage`：记录输入 token 数，帮助识别 Prompt 膨胀。
- `output_token_usage`：记录输出 token 数，帮助比较模型回答长度。
- `cached_token_usage`：记录缓存命中 token 数，方便后续观察缓存收益。

## 当前迁移策略

- 新库：由 SQLAlchemy 模型直接建表
- 旧库：启动时通过 SQLite `ALTER TABLE` 自动补列

这样做的原因是当前项目优先保证本地演示和学习成本，不引入独立迁移工具。

## 后续预留字段

- 占位：`error_category`

## 后续补充位置

- 占位：ER 图
- 已补第一版迁移策略说明
- 占位：字段索引设计