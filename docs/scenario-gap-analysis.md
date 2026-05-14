# 设想场景与能力差距盘点

## 一句话定位

Agent-Trace-Viewer 的核心定位不是聊天前台，而是 Agent 系统的黑匣子、调试后台和运行日志平台。

它最应该回答的问题是：

- 为什么这个 Agent 会这么做
- 它中间调用了什么工具
- 哪一步出错了
- 这次问题以后怎么复现、比较和修复

## 当前已经覆盖的能力

下面这些能力已经能支撑第一版调试与演示：

- Trace ID、任务输入、任务类型、最终输出、状态、总延迟
- Step 级时间线
- 工具名称、tool_input、tool_output、error_message
- provider、model_name、prompt_version 持久化
- token 总量与 input / output / cached 明细
- 单次运行对比
- 按时间范围的趋势统计
- 外部平台 usage 的手动录入、JSON 导入和趋势汇总

这意味着现在已经能支撑“单次问题排查”和“轻量成本观察”两类工作。

## 当前只有部分覆盖的能力

下面这些方向已经有骨架，但还不能算完整落地：

- 外部平台接入：当前已有自动连接器骨架、同步历史和重试入口，也支持批量 usage 导入去重，但还没有真正自动拉取 Claude Code、网关日志或第三方平台 API
- 运行评估：当前已经支持矩阵评测、多运行对照、实验聚合摘要、可筛选版本矩阵、启发式 judge、review 队列、复核指派、截止时间与最终裁决，但还没有完整的聚合实验分析与多人协作闭环
- 复现信息：当前能看到 provider / model / prompt_version，但还没有完整冻结 system prompt 文本、temperature、路由决策、附件上下文

## 按原始设想仍缺的核心能力

### 1. Agent Replay 与可复现重跑

- 当前状态：已完成第一版
- 为什么需要：当线上 Agent 出错时，不能只看当次 trace，还要能拿同一份上下文重新跑，验证是 Prompt、模型、工具还是环境问题
- 已完成什么：Replay API、冻结运行配置第一版、从历史 trace 一键重跑、Replay Source 关联展示
- 还缺什么：Replay 结果与原 trace diff、批量 replay、按场景回放

### 2. 批量评测与版本对比

- 当前状态：已完成第一版可执行链路
- 为什么需要：原始设想里强调 Prompt v1 / v2 / v3 的比较，但现在只有“单次 compare”，没有“同一批任务跑多版”的实验能力
- 已完成什么：评测集、评测 case、评测运行执行链路、case result、前端结果展示、矩阵评测入口第一版、多运行对照面板第一版、实验聚合摘要第一版、Markdown / JSON 导出
- 还缺什么：更强聚合统计面板、批量筛选能力、版本矩阵导出定制化

### 3. 任务成功质量指标

- 当前状态：已完成第一版 judge 闭环
- 为什么需要：现在统计的是运行量、延迟、错误数、token；但评测 Agent 时还需要知道“答对没有”“是否命中标准答案”“是否正确使用工具结果”
- 已完成什么：trace 级 `quality_label`、`quality_score`、`quality_notes`、case 级启发式 judge、ground_truth_type / judge_guidance / judge_config_json、前端打分入口、人工标注入口第一版、review 队列第一版、review 指派第一版
- 还缺什么：多人标注协作、更强 judge、任务级 success/fail 聚合与冲突裁决

### 4. 完整复现元数据快照

- 当前状态：部分完成
- 为什么需要：只记录 `prompt_version` 不足以真正复现一次运行；真实排障还需要 system prompt 文本、temperature、路由模式、附件和上下文来源
- 已完成什么：运行配置快照第一版，已保存 user_input、execution_mode、provider、model_name、prompt_version、base_url、temperature、system prompt
- 还缺什么：路由决策、输入附件 / artifact、上下文来源、外部依赖版本

### 5. 工具权限审计与安全日志

- 当前状态：已完成第一版骨架
- 为什么需要：原始设想里提到防止 Agent 被 Prompt 注入后乱调用工具，但当前 trace 只有“调用了什么”，没有“是否被拦截、为什么被拦截、是否需要审批”
- 已完成什么：`audit_events` 数据模型、allow / deny / review 决策字段、risk level、policy/target/reason 和前端录入入口
- 还缺什么：tool policy 执行器、审批状态、危险操作告警、自动审计日志采集

### 6. 多运行并排 diff 视图

- 当前状态：已完成第一版
- 为什么需要：现在只能两条 trace 做轻量 compare，不足以支撑多版本、多样本的工程对比
- 已完成什么：同一 suite 下两条 run 的 case 级 score / label / review 覆盖对照
- 还缺什么：多选 trace、批量差异表、关键字段高亮、版本矩阵视图

### 7. provider 专属成本与 token 口径

- 当前状态：未完成
- 为什么需要：原始设想里很强调成本控制，但不同 provider 的计费口径并不一致，当前只是统一展示 token 和 cost
- 还缺什么：provider 价格配置、计费规则、缓存命中收益计算、成本趋势拆解

### 8. 自动外部连接器

- 当前状态：已完成第一版骨架
- 为什么需要：当前外部平台链路仍以人工录入和 JSON 导入为主，离“真实企业使用”还差自动采集
- 已完成什么：自动连接器模板目录、模拟同步入口、来源自动复用与 usage 样本落库、同步历史与重试入口、批量 usage 导入与 external_reference 去重
- 还缺什么：日志文件导入器模板、API polling、网关 usage connector、失败重试策略细化

### 9. 场景化 Demo 套件

- 当前状态：部分完成
- 为什么需要：原始设想里已经有 AI 简历 Agent、AI 客服 Agent、Coding Agent、嵌入式调试 Agent、机器人实验分析 Agent 等具体故事，但当前 UI 还是以通用 trace 为主
- 已完成什么：Code Debug Agent Trace Demo 第一版、Paper / RAG Demo 第一版、Robotics / Embedded Demo 第一版，可一键注入示例 trace、评测集、评测运行和审计事件
- 还缺什么：场景级讲解文档

## 最适合当前项目继续补的 Demo 场景

从学习价值和你当前背景来看，优先级最高的是这三个：

1. Code Debug Agent Trace：贴近 AI Coding Agent 场景，也最容易展示文件读取、代码修改、测试重跑的 Trace 价值
2. Paper / RAG Agent Trace：适合展示检索、引用、总结链路，能补足“检索失败时怎么排查”
3. Robotics / Embedded Log Analysis Agent Trace：最贴合你的嵌入式与 Robotics-Nav-Eval 背景，能把 Agent 工程和原背景连接起来

## 最新未完成统计

- 平台核心未完成：3 项
- 场景 Demo 未完成：0 项
- 文档占位未完成：0 项
- 当前合计未完成：3 项

这 3 项平台核心未完成分别是：

1. 更完整的多 provider 适配层
2. Prompt 模板文件化管理与后台编辑
3. 完整复现元数据快照

当前预设场景 Demo 已经齐了，文档占位也已经补齐，后续主要缺口回到平台核心能力本身。

前端页面截图 / 场景 walkthrough 已补齐，当前主要缺口回到平台核心能力：多 provider 适配、Prompt 模板后台编辑、完整复现元数据快照。