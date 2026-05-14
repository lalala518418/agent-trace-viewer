# 导出格式说明

## 当前支持

当前 Trace Detail 页面已经支持两种导出：

- JSON
- Markdown

这样设计的原因是两种格式分别覆盖两类典型场景：

- JSON 适合二次处理、自动化分析、归档和对接其它系统
- Markdown 适合直接发给同事、写复盘、贴到知识库或面试展示材料里

## JSON 导出内容

JSON 会保留完整 Trace 明细，适合做程序化消费。当前包含：

- Trace 基本信息：`id`、`task_input`、`task_type`、`status`、`created_at`
- 执行元数据：`execution_mode`、`provider`、`model_name`、`prompt_version`
- 统计指标：`total_latency_ms`、`step_count`、`tool_call_count`、`error_count`
- token 明细：`token_usage`、`input_token_usage`、`output_token_usage`、`cached_token_usage`
- 最终输出：`final_output`
- 全部步骤：每一步的标题、类型、状态、工具输入输出、错误信息和耗时

## Markdown 导出内容

Markdown 会把一次运行整理成更适合阅读的报告。当前会输出：

- Trace 概览
- 执行模式 / provider / model / prompt version
- 步骤数、错误数、延迟、token 明细
- 最终输出
- 时间线步骤列表

## 当前限制

下面这些能力还没有做成可配置导出模板：

- 自定义标题和品牌头图
- 选择导出字段
- 按客户或项目生成不同版式
- 直接导出 PDF

这些限制也对应了路线图里仍未完成的“导出报告模板定制”。