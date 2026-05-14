# 功能路线图

## 第一层：当前已经落地的框架

- Trace 创建与持久化
- Trace 列表、详情与时间线
- 筛选、分页大小切换、导出骨架
- mock 执行模式
- DeepSeek / OpenAI 兼容 LLM 第一版真实调用
- Prompt 版本注册表、版本说明和推荐模型展示
- 运行对比视图与错误分类摘要
- 时间范围趋势面板
- 图表化趋势视图
- 客户视角首页、自动结论卡片与场景模板
- 总览 / 追踪页 / 外部接入三视图导航
- 外部接入来源登记、使用量录入和跨平台 usage 汇总第一版

## 第二层：下一步优先补全的功能

### 1. 列表与对比能力

- 状态筛选和类型筛选已经有框架
- 已支持单次运行对比：延迟、步骤数、错误数、token 使用差异
- 已支持时间范围筛选：3 / 7 / 14 / 30 天
- 已支持分页大小切换：4 / 8 / 12 条
- 占位：增加多次运行并排 diff 视图

### 2. 详情与导出能力

- 已支持导出 Markdown / JSON
- 已支持错误分类摘要
- 占位：增加单次运行分享视图
- 占位：增加导出报告模板定制

### 3. LLM 接入能力

- 已有 execution_mode / provider / model_name / prompt_version 参数入口
- 已接入真实 OpenAI 兼容接口
- 已记录 token 消耗总数以及 input / output / cached 明细
- 已把 provider / model_name / prompt_version 持久化到数据库
- 已提供 Prompt 版本注册表接口
- 已提供外部来源登记和 usage 录入承载接口
- 占位：支持更多 provider 适配层

### 4. 可观测性增强

- 已增加 Prompt 版本记录和版本说明面板
- 已增加第一版错误分类：配置缺失 / 认证失败 / 配额限制 / 网络问题 / 工具执行 / 未分类
- 已增加客户视角自动结论摘要
- 已把趋势面板升级为图表化趋势视图，并补齐时间范围内无数据日期
- 已增加外部平台 token / run / cost 趋势图第一版
- 已增加 Agent Replay 第一版：支持从历史 trace 一键重跑，并记录 replay 来源

### 5. 复现与评测能力

- 已增加 Agent Replay 与历史 trace 一键重跑第一版
- 已增加批量评测执行第一版：评测集、评测 case、评测运行执行链路、case result 和前端结果展示
- 已增加任务成功评分第一版：trace 级 quality_label / quality_score / quality_notes，以及 case 级 ground truth_type / judge_guidance / judge_config_json
- 已增加矩阵评测入口第一版：支持按 suite 串行执行多组 provider / model / prompt_version 组合
- 已增加人工标注入口第一版：支持对 case result 记录 reviewer / label / score / notes
- 已增加 review 队列第一版：优先暴露 manual_review、未标注和 judge / 人工不一致结果
- 已增加多运行对照第一版：支持同一 suite 下两条 run 的 case 级 score / label / review 覆盖差异
- 已增加实验聚合摘要第一版：支持按 experiment_label 汇总 run 均分、case 分差和 review 覆盖，并导出 Markdown / JSON
- 已增加实验矩阵表格第一版：支持按 provider / prompt_version / case 标题过滤 run 列，并直接查看 case 级 score、review、adjudication
- 已增加 review 指派第一版：支持把结果分配给 assignee，并在队列中追踪 pending / in_progress / done
- 已增加 review 截止时间与最终裁决第一版：支持 due_at、overdue 队列标记和 lead reviewer 最终裁决
- 已把启发式 judge 升级到可读配置第一版：支持 preferred_tools / required_terms / forbidden_terms 打分修正
- 占位：继续补更强 judge、多人协作工作流和更强聚合对照表
- 已增加运行配置快照第一版：保存 user_input、provider、model、prompt_version、system prompt、temperature
- 占位：继续补完整复现元数据快照：路由决策、输入附件、artifact 与上下文来源

### 6. 安全与审计能力

- 已增加工具权限审计骨架第一版：audit event API、decision / risk_level / policy_name / target_name 字段和前端录入入口
- 占位：增加危险工具调用告警和审批记录

### 7. 外部连接器与场景化 Demo

- 已支持外部 usage 手动录入与 JSON 导入
- 已支持外部 usage 批量导入第一版：后端会自动复用来源并按 external_reference 去重
- 已增加自动连接器骨架第一版：支持 Claude Code、OpenAI Compatible Gateway、DeepSeek Export 三类模板的模拟同步
- 已增加连接器同步历史第一版：支持查看最近同步批次并重试历史 job
- 占位：继续补真实外部连接器：日志导入器、API 拉取、网关 usage 接入
- 已增加 Code Debug Agent Trace Demo 第一版：支持一键注入 demo traces、evaluation suite、evaluation run 和 audit events
- 已增加 Paper / RAG Agent Trace Demo 第一版：支持一键注入检索摘要、citation miss 和 reference answer judge 场景
- 已增加 Robotics / Embedded Log Analysis Agent Trace Demo 第一版：支持一键注入日志分析、导航异常定位和人工复核场景

## 第三层：文档需要补充的位置

- 已有：数据库字段设计图
- 已有：真实 LLM 接入说明
- 已有：导出格式说明
- 已有：设想场景与能力差距盘点
- 已有：前端页面截图与场景 walkthrough，见 [frontend-walkthrough.md](frontend-walkthrough.md)

设想场景与差距的详细分析见 [scenario-gap-analysis.md](scenario-gap-analysis.md)。

## 当前剩余未完成统计

- 平台核心未完成：3 项
- 场景 Demo 未完成：0 项
- 文档占位未完成：0 项
- 当前合计未完成：3 项

这 3 项平台核心未完成分别是：

- 更完整的多 provider 适配层
- Prompt 模板文件化管理与后台编辑
- 完整复现元数据快照

这批预设场景 Demo 已全部补齐，后续重点转向聚合对照、自动连接器和更强 judge。

前端页面截图与 walkthrough 已补齐，当前剩余工作集中在平台核心能力本身。