# Agent Trace Viewer

Agent Trace Viewer 是一个面向 AI Agent 的轻量级调用链追踪与可视化项目。

这个项目的目标不是单纯做一个聊天界面，而是把一次 Agent 任务从输入、推理、工具调用、错误处理到最终输出的全过程记录下来，并以可查询、可导出、可解释的方式展示出来。

## 项目定位

- 面向 AI Agent 开发、AI 应用研发、AI 质量效能、大模型测试和研发效能岗位
- 强调调用链可观测性，而不是单次回答效果
- 优先保证 Windows 本地可运行、可演示、可解释

## 具体适用场景

这个项目更适合下面三类人和使用场景：

- AI 应用研发 / Agent 开发：当你在排查多步 Agent、工具调用、Prompt 版本或模型切换带来的问题时，用它看整条运行链路。
- 质量效能 / 测试工程师：当你要做回归验证，比较不同 Prompt、provider、model 的稳定性、延迟和 token 消耗时，用它看趋势和差异。
- 团队负责人 / 运营 / 成本观察者：当你想把内部 Agent 运行和 Claude Code、自有 API、其它平台的 usage 放到同一套统计口径里时，用它看 run、token 和 cost。

它的核心作用不是替代聊天界面，而是统一回答三个问题：

- 这次运行有没有跑通
- 如果没跑通，失败发生在哪一步、属于哪类问题
- 这套流程在内部和外部平台上一共花了多少 token 和成本

## 当前阶段

当前版本已经完成以下基础框架：

- 后端 Trace 记录与 SQLite 持久化
- Trace 列表与详情接口
- 前端客户视角工作台、分页式多视图导航、时间线展示与自动摘要
- 本地 mock 执行模式
- DeepSeek / OpenAI 兼容 LLM 第一版真实调用
- Prompt 版本注册表与前端版本切换
- Trace 列表筛选、分页大小切换与单次运行对比
- 错误分类摘要
- token 总量与 input / output / cached 明细展示
- 时间范围趋势面板与按天补齐的动态图表趋势视图
- 外部接入来源登记与外部 usage 汇总第一版
- Trace 明细导出 Markdown / JSON
- 会话结束自动生成日志与修改报告

## 当前技术栈

- 后端：Python 3.11、FastAPI、SQLAlchemy 2、SQLite、Pydantic 2
- 前端：React、Vite、TypeScript
- 执行模式：mock 模式 + DeepSeek / OpenAI 兼容 LLM 模式

之所以这样选，是因为这套组合更适合 Windows 本地开发，依赖少，运行稳定，也更适合在面试中讲清楚系统设计和关键数据流。

## 本地开发说明

如果你只是想快速体验页面和主流程，优先使用仓库内的一键启动脚本：

```powershell
cd d:/llmlearning/agent-trace-viewer
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -InstallDeps
```

也可以直接双击 [scripts/start-demo.cmd](scripts/start-demo.cmd)。这样做的目的，是把“首次体验需要记住的命令”收敛成一个入口，而不是让体验者先理解前后端各自怎么启动。

如果你想给别人发一个更干净的评审包，而不是直接把整个工作目录打包，也可以生成 reviewer package：

```powershell
cd d:/llmlearning/agent-trace-viewer
powershell -ExecutionPolicy Bypass -File .\scripts\package-demo.ps1
```

生成后的产物默认位于 `dist/reviewer-package/agent-trace-viewer-reviewer`，并会额外输出 zip 归档。这个脚本会先构建前端，再复制 backend、frontend、docs、examples 和必要脚本，避免把本地数据库、缓存和 node_modules 一起带进分享包。

项目启动后，可以直接跑一条 smoke-check 验证前后端和关键 API：

```powershell
cd d:/llmlearning/agent-trace-viewer
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-check.ps1
```

这样做的目的，是让体验者不用手工点完整个页面，也能快速确认“服务是不是起来了、关键接口是不是活着”。

### 后端

1. 使用工作区现有虚拟环境 `d:/llmlearning/.venv`
2. 安装 `backend/requirements.txt` 中的依赖
3. 在 `backend/` 目录启动 FastAPI 服务

### 前端

1. 通过 `winget` 安装 Node.js LTS
2. 使用工作区脚本 `.vscode/scripts/run-npm-from-winget.ps1` 安装依赖和启动 Vite
3. 默认访问地址为 `http://127.0.0.1:5173`

更详细的 Windows 本地说明见 [docs/windows-setup.md](docs/windows-setup.md)。

页面截图和推荐演示顺序见 [docs/frontend-walkthrough.md](docs/frontend-walkthrough.md)。

如果你后面要发布到 GitHub，需要注意一个现实约束：当前这个目录还不是 git 仓库，也没有配置 remote，所以现在只能先准备好代码和文档，不能直接 push。拿到 GitHub 仓库 URL 或确认要新建哪个仓库之后，再执行 `git init`、`git remote add origin ...`、commit 和 push 才能真正上传。

## 项目结构

```text
agent-trace-viewer/
├── backend/
├── docs/
├── examples/
├── frontend/
└── README.md
```

## 当前开发工作流

- 先做一个聚焦的功能切片
- 对应跑一次本地验证
- 更新自动生成的会话摘要草稿
- 让 hook 在结束时写出最终会话报告

更完整的流程见 [docs/development-workflow.md](docs/development-workflow.md)。

## 已预留但尚未完全写实的能力

以下内容已经搭了框架，但仍属于占位或第一版骨架：

- 更完整的多 provider 适配
- Prompt 模板文件化管理与后台编辑
- provider 专属 token 统计和成本换算已完成第一版：外部接入页会按官方价格快照核对 actual / estimated / delta，并对缺少官方来源的模型直接标记待人工核对
- Agent Replay 已完成第一版，仍缺 replay diff 与批量回放
- 批量评测、Trace 评分和权限审计已完成第一版可执行链路，现已支持矩阵评测入口、case 级 ground truth 元数据、人工标注入口、review 队列和多运行对照第一版，仍缺更强 judge 和审批流
- 外部接入已支持自动连接器骨架第一版，可模拟 Claude Code、自有 API 网关和导出账单的同步路径
- Code Debug Demo 已完成第一版，可一键注入演示 trace、evaluation run 和 audit event
- Paper / RAG Demo 已完成第一版，可一键注入检索摘要与 citation miss 场景
- Robotics / Embedded Demo 已完成第一版，可一键注入日志分析、导航异常和人工复核场景

如果按最初设想的“黑匣子 / 调试后台 / 评测平台”完整目标来算，当前路线图已经扩展为：

- 平台核心未完成 3 项
- 场景 Demo 未完成 0 项
- 文档占位未完成 0 项

完整差距盘点见 [docs/scenario-gap-analysis.md](docs/scenario-gap-analysis.md)。

本轮实现说明见 [docs/implementation-log-2026-05-12.md](docs/implementation-log-2026-05-12.md)。

最新一轮界面和联调修复说明见 [docs/implementation-log-2026-05-13.md](docs/implementation-log-2026-05-13.md)。

这些未完成项已经整理到 [docs/feature-roadmap.md](docs/feature-roadmap.md) 和 [docs/llm-integration-plan.md](docs/llm-integration-plan.md)。

## 本轮新增说明

- 页面已经拆成“总览 / 追踪页 / 外部接入”三个视图，解决单页过长的问题。
- 总览页进一步按“使用场景 / 内部运行 / 外部成本”分类切换，避免把所有信息一次性堆给用户。
- 外部接入页当前支持登记来源、平台、接入方式、Base URL 和密钥提示，不直接保存真实密钥。
- 外部 usage 当前支持手动录入和导入承载结构，适合先把 Claude Code、自有 API 或其它平台的 token / run / cost 收进统一数据面。
- 外部 usage 现在已经支持最小 JSON 导入，可直接用一条示例 Claude Code 记录验证来源创建和统计刷新。
- 外部接入页现在额外提供自动连接器骨架，可一键同步 Claude Code、OpenAI Compatible Gateway、DeepSeek Export 这三类示例来源。
- 外部接入页现在额外提供同步历史和重试入口，方便把“自动同步是否成功”也纳入同一个工作台观察面。
- 外部接入页现在支持后端批量 usage 导入，会自动复用来源并按 external_reference 去重，适合导入平台导出日志或账单样本。
- 场景实验室现在提供实验聚合摘要，可按 experiment_label 汇总 run 均分、case 分差，并导出 Markdown / JSON。
- 场景实验室现在提供可筛选版本矩阵，可按 provider、prompt_version 和 case 标题过滤每个 run 的分数、review 与 adjudication。
- 场景实验室现在提供多运行对照面板，可按同一 suite 对比两条 run 的 case 分数、标签和 review 覆盖变化。
- 场景实验室现在提供 review 队列入口、复核指派截止时间和最终裁决表单，可优先处理 manual_review、未标注、超时或多人冲突结果。

之所以先做“来源登记 + 使用量承载”，而不是直接硬接第三方平台 API，是因为这更适合学习项目的第一阶段：先把统一数据模型、统计口径和展示链路打通，后面再逐步补自动采集器。