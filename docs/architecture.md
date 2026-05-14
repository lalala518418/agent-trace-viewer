# 架构说明

## 一、当前架构目标

当前版本的目标是先把调用链观测系统的骨架搭稳，而不是一开始就接入复杂的多模型、多工具、多代理编排。

所以这一版优先解决三件事：

1. 一次任务如何形成一条可追踪的 Trace
2. Trace 如何被持久化和查询
3. 前端如何把 Trace 展示成可读的调试时间线

## 二、后端执行流

1. 前端提交一次任务输入和执行参数
2. FastAPI 接收请求并交给 `agent_runner.py`
3. Runner 根据 `execution_mode` 决定进入 mock 链路或 LLM 占位链路
4. Runner 返回标准化步骤列表、任务类型、最终输出和总耗时
5. `trace_logger.py` 把 Trace 和 Step 持久化到 SQLite
6. 列表接口返回摘要指标，详情接口返回完整步骤

## 三、前端展示流

1. 首页表单负责创建 Trace
2. 左侧列表展示 Trace 摘要、筛选和分页结果
3. 右侧详情区展示执行摘要、导出动作和时间线
4. 时间线按步骤类型展示输入、推理、工具调用和占位的 LLM 调用

## 四、当前占位点

- 已完成：真实 LLM API 调用逻辑已经接到 `backend/app/llm_runner.py`
- 已完成：数据库已经持久化 provider、model_name、prompt_version 和 token 明细
- 已完成：数据库已经增加批量评测骨架、trace 评分字段和审计事件骨架
- 占位：前端仍缺多次运行并排 diff 视图
- 已完成：前端已支持 Agent Replay 第一版和运行配置快照展示
- 占位：后端仍缺真正的批量执行编排、judge/ground truth、审批流和完整复现元数据快照

更贴近最初设想的场景差距盘点见 [docs/scenario-gap-analysis.md](docs/scenario-gap-analysis.md)。