# 2026-05-13 实现日志

## 本轮目标

这一轮的目标不是继续堆调试字段，而是把前端从“开发者控制台”推进到“客户也能直接理解的工作台”，同时顺手清理 README 和路线图里已经不准确的占位项。

## 本轮完成的改动

### 1. 前端主界面重构

- 首页改成客户视角布局，不再是单列调试表单
- 新增自动结论区域，把成功率、最近运行、最常用 Prompt 和失败风险压缩成可读结论
- 新增客户场景模板，方便直接套用常见输入场景
- 新增趋势图表区，不再只显示文本列表
- 新增 provider 筛选和分页大小切换
- 默认自动选中最新 Trace，减少空白详情页

### 2. 联调问题修复

- 修复本地开发时的 CORS 端口问题
- 后端现在允许本机 `5173-5179` 范围内的 Vite 端口访问

这样做的原因很直接：Vite 在 `5173` 被占用时会自动切到 `5174` 甚至更高端口，如果后端只放行单一端口，页面看起来能打开，但实际所有接口都会被浏览器拦住。

### 3. 文档与占位同步

- README 已更新为当前真实能力状态
- 路线图里“分页大小切换”和“图表化趋势视图”已经从占位改为已完成
- 补充了导出格式说明文档，解决了“导出格式说明”这一项文档占位

### 4. 外部接入与长页面拆分

- 前端主界面已经拆成“总览 / 追踪页 / 外部接入”三个视图，不再把所有内容堆在一个超长页面里
- 后端新增外部来源和外部 usage 的数据模型，用来承载 Claude Code、自有 API 或其它平台的 token / run / cost 数据
- 新增外部来源列表、外部 usage 录入表单和外部 usage 趋势图
- 趋势统计现在会补齐时间范围内的每日点，即使某一天没有数据也会返回 0，图表不再只显示有记录的日期

### 5. 面向用户的定位说明与信息归类

- 总览页新增“这个项目给谁用，起什么作用”说明区，直接说明适用角色、典型场景和核心作用
- 总览页不再同时堆叠所有信息，而是切成“使用场景 / 内部运行 / 外部成本”三个分类视图
- 外部接入页新增“手动录入 / JSON 导入”两种录入方式，减少一次性暴露过多表单字段
- 已用一条示例 Claude Code usage 完成浏览器联调，验证来源自动创建、记录写入和 token / cost 汇总刷新

这样做的原因很直接：当前项目之前更像“功能已经有了，但用户需要自己理解页面”。这次调整的目标是先把“谁会用、什么时候用、应该先看哪一块”讲清楚，再让用户逐层进入具体数据。

这样做的原因是，用户真正想看的不是原始 trace 字段本身，而是“当前系统跑了多少、成本多少、外部平台用了多少、最近有没有波动”。先把统一统计口径和页面分层做出来，后面再接自动导入器才不会返工。

## 关键参数和设计选择

- `allow_origin_regex=r"https?://(localhost|127\\.0\\.0\\.1):517[3-9]"`

选择正则而不是继续枚举单个端口，是因为这更贴合 Vite 的真实行为，也更方便本地学习时反复重启和换端口。范围控制在 `5173-5179`，既能覆盖常见本地开发端口，又不会无边界放开。

- 分页大小先只提供 `4 / 8 / 12`

当前 Trace 卡片信息密度已经比较高，先给三个明确档位，足够演示和学习，也能保持页面节奏。后面如果要做企业级控制台，再补自定义页大小会更合理。

- 自动结论只做摘要，不直接替代人工判断

当前项目还在学习和 MVP 阶段，所以自动结论更适合作为“引导视图”，帮助客户先理解运行状态，而不是直接做带强业务语义的自动决策。

- 外部接入先采用 `manual / api / import` 三种 access mode

这里不是为了把字段做复杂，而是为了把未来扩展方向提前定清楚：
`manual` 适合人工登记，`import` 适合后续导入导出文件，`api` 适合未来接你自己的网关或第三方平台接口。第一版先把这三个入口统一到一个来源模型里，后续扩展不会打散数据结构。

- 外部 usage 第一版不保存真实密钥，只保存 `api_key_hint`

这是刻意做的安全取舍。学习项目更重要的是理解接入建模、数据流和统计展示，而不是把敏感值落到 SQLite 里造成新的安全问题。

- 趋势图在前端和后端两边都做“空数据保护”

后端负责补齐没有数据的日期，前端负责把全 0 的图表最大值至少保护到 1。这样做能避免浏览器里出现 `NaN` 柱高，空数据时也能稳定渲染完整时间窗。

## 本轮验证

- `frontend/src/App.tsx` 无编辑器报错
- `frontend/src/styles.css` 无编辑器报错
- `backend/app/main.py` 无编辑器报错
- 前端 `npm run build` 已成功
- 浏览器联调已验证：趋势、列表、详情、对比、时间线均可显示
- 浏览器联调过程中发现并修复了 CORS 问题
- 浏览器联调已验证：三视图导航可切换，外部接入页在 0 数据时不会再报 `NaN` 图表错误
- 浏览器联调已验证：JSON 导入一条 Claude Code 示例记录后，来源数变为 1，外部运行变为 3，外部 Tokens 变为 18240，外部成本变为 `$0.43`

## 基于原始设想的差距复盘

这次对照了最初设想的使用场景：AI 简历 Agent、AI 客服 Agent、AI Coding Agent、研发效能 Agent、嵌入式调试 Agent、机器人实验分析 Agent。

复盘结论是：

- 当前项目已经具备“黑匣子第一版”的骨架，能看单次运行链路、工具输入输出、Prompt 版本、token 和外部 usage
- 但离“可复现、可评测、可审计、可自动接外部平台”的工程目标还差一批关键能力
- 现有路线图原本只剩 5 项核心未完成，这个数字已经不足以覆盖最初设想的完整范围，已在路线图中扩展为更真实的 9 项平台能力缺口 + 3 项场景 Demo 缺口

这次新增了一份单独文档 [docs/scenario-gap-analysis.md](docs/scenario-gap-analysis.md)，专门记录：

- 当前已经覆盖哪些设想
- 哪些能力只有骨架
- 哪些能力还没开始做
- 最适合优先补的三个 Demo 场景

## 当前剩余未完成统计

按扩展后的路线图口径统计，还剩 13 项未完成：

- 平台核心未完成 9 项
- 场景 Demo 未完成 3 项
- 文档占位未完成 1 项

这 9 项平台核心未完成分别是：

1. 更完整的多 provider 适配
2. Prompt 模板文件化管理与后台编辑
3. provider 专属 token 统计和成本换算
4. 多运行并排 diff 视图
5. Agent Replay 与可复现重跑
6. 批量评测与版本对比
7. 任务成功质量指标
8. 完整复现元数据快照
9. 工具权限审计与安全日志

这 3 项场景 Demo 未完成分别是：

1. Code Debug Agent Trace Demo
2. Paper / RAG Agent Trace Demo
3. Robotics / Embedded Log Analysis Agent Trace Demo

当前文档层面仍缺 1 项：前端页面截图 / 场景 walkthrough

## 新增：Agent Replay 与运行配置快照第一版

这次开始按“依次把缺失能力做完”的顺序推进，先完成最基础的 replay 最小闭环，因为后面的批量评测、版本对比和审计都依赖它。

本次落地内容：

- 后端 traces 表新增 `replay_source_trace_id`，用于标记这条 trace 是从哪次运行 replay 出来的
- 后端 traces 表新增 `run_config_json`，用于保存运行配置快照，避免后续只能靠摘要字段反推
- 新增 `POST /api/traces/{trace_id}/replay`，可以直接从历史 trace 重建请求并重新执行
- 新增运行配置快照第一版，当前会保存 `user_input`、`execution_mode`、`provider`、`model_name`、`prompt_version`
- 对于 LLM 运行，还会额外保存 `base_url`、`temperature`、`api_key_env_name` 和 `system_prompt`
- 前端详情页新增 `Replay Run` 按钮
- 前端详情页新增 `Replay Source` 摘要卡和 `Run Config Snapshot` 面板

这次参数和设计选择说明：

## 新增：矩阵联动、来源预填与主动刷新交互

这次没有再扩展新的后端能力，重点是把已经存在的数据面真正串起来，让用户在页面里少做“先记住一个结果，再切页面找表单”的重复动作。

本次落地内容：

- 场景实验室里的版本矩阵单元格改成可点击，点击后会直接切换当前 run，并把 review / assignment / adjudication 三个表单同步到对应 result
- 外部接入页里的来源卡片改成可点击，点击后会预填来源表单，同时把 usage 录入表单的 `source_id` 切到当前来源
- 自动同步历史卡片改成可点击，点击后会把同步时间窗带回上方选择器，方便按相同窗口继续同步或重试
- 外部接入页新增“刷新接入数据”，场景实验室新增“刷新摘要”和“刷新评测数据”，减少必须依赖全页重载的情况
- 为来源卡片、同步历史卡片和矩阵单元格补了 active 态高亮，方便用户确认“当前正在操作哪个对象”

这次参数和设计选择说明：

- `selectedExperimentCellKey`：专门保存当前被点击的矩阵单元格键值，原因是矩阵展示的是“case x run”的交叉面，只靠 `selectedEvaluationRunId` 无法表达当前是哪个 case 的结果被聚焦
- `selectedIntegrationSourceId`：单独记录当前聚焦来源，原因是来源表单和 usage 录入表单都需要共享这个上下文，拆开保存比从多个表单反推更直接
- `selectedConnectorJobId`：保留最近一次点中的同步历史任务，目的是让“历史回看”和“继续操作”之间有清晰视觉反馈，而不是点完没有状态变化
- `connectorLookbackOptions = [1, 3, 7, ...history]` 再去重排序：这样做是因为历史任务里已经出现过 `2` 天窗口，如果选择器还只写死 `1 / 3 / 7`，点击历史卡片时就会把控件带到无效值
- 矩阵单元格继续使用按钮而不是普通 `div`：目的是保留键盘可访问性和明确的点击语义，也更适合后面继续扩展 hover / focus 行为

本地验证结果：

- `frontend/src/App.tsx` 无编辑器报错
- `frontend/src/styles.css` 无编辑器报错
- 前端 `npm.cmd run build` 已两次通过
- 浏览器联调已确认：点击版本矩阵单元格后，Base Run 会切到对应 run，当前结果裁决卡会同步更新
- 浏览器联调已确认：点击来源卡片后，Source Name / Access Mode / Base URL / API Key Hint 会同步预填，usage 录入表单的 Source 也会切到对应来源
- 浏览器联调已确认：点击“最近同步 2 天”的历史卡片后，同步时间窗会正确回填到 `2 days`，不再出现下拉值缺失

## 新增：外部 usage token 口径修正

这次主要不是补新功能，而是把外部 usage 这条链路里已经存在的口径错误纠正掉。问题根因是：页面默认示例、JSON 导入示例和自动连接器样本都把 `cached_token_usage` 当成额外 token 再加进 `token_usage`，导致 total token 被重复累计，连带把成本估算也一起抬高。

本次落地内容：

- 后端新增 `normalize_external_usage_values(...)`，统一把外部 usage 归一到 `total tokens = input tokens + output tokens`
- `cached_token_usage` 继续保留，但只作为单独观察字段，不再重复叠加到 `token_usage`
- 手动录入接口和批量导入接口在落库前都会经过同一套归一化逻辑，避免前端或导入文件传来矛盾参数时直接污染数据库
- 自动连接器样本的 token 总量和演示成本公式也改为基于归一后的 total token，不再对 cached 再收费一遍
- 前端手动录入默认值、JSON 导入示例和提示文案全部改成同一口径
- 前端在编辑 `input_token_usage` / `output_token_usage` 时会自动同步 `token_usage`，减少再次录错的概率

这次参数和设计选择说明：

- `token_usage = input_token_usage + output_token_usage`：这里是明确的口径选择，因为当前系统里 `cached_token_usage` 被定义为输入侧缓存命中量的观察字段，而不是额外新增的一组 token
- `cached_token_usage` 仍然保留单独字段：原因不是计费，而是后面做缓存命中率、提示词优化和 provider 差异分析时仍然有价值
- 归一化放在后端而不是只放前端：原因是 JSON 导入和未来 API 接入都可能绕过前端，真正的数据边界必须在后端守住
- 前端仍允许手动编辑 `token_usage`：原因是有些外部平台只给 total，不给 input/output；但一旦用户补了 input/output，系统就会优先按更细的拆分口径归一

本地验证结果：

- 编辑器检查通过：`backend/app/main.py`、`frontend/src/App.tsx` 无报错
- 前端 `npm.cmd run build` 已通过
- 使用 FastAPI `TestClient` 精准验证：当导入 `token_usage=12000`、`input=4000`、`output=7600`、`cached=400` 时，后端落库结果会被纠正为 `token_usage=11600`
- 浏览器已确认：外部 usage 表单默认值显示为 `11600 / 4000 / 7600 / 400`，并新增了“cached 不应重复加到 total”提示
- 验证过程中插入的 `normalization-check-001` 测试记录已从数据库清理，未保留在演示数据中

- `replay_source_trace_id`：用来建立“原始运行 -> replay 运行”的直接关联，后面做 diff 时不用再靠时间和内容猜测
- `run_config_json`：先用单字段 JSON 存快照，原因是当前项目还在快速迭代期，这样比马上拆多张表更轻量，也更适合学习阶段理解结构演进
- `DEFAULT_LLM_TEMPERATURE = 0.2`：保持和原有稳定调试取向一致，Replay 时也能尽量减少采样波动带来的噪声
- Replay 复用 `execute_and_store_trace(...)`：创建和 replay 共用同一条落库链路，后面扩展批量评测时可以继续复用

本地验证结果：

- 前端 `npm run build` 已通过
- 使用 FastAPI `TestClient` 验证了创建 trace -> replay trace -> 获取 replay 详情的完整链路
- 验证结果确认：replay 新 trace 已正确写入 `replay_source_trace_id`
- 验证结果确认：`run_config_snapshot` 已存在，并包含 `execution_mode`、`provider`、`model_name`、`prompt_version`、`user_input`

当前剩余未完成统计已更新为：

- 平台核心未完成 8 项
- 场景 Demo 未完成 3 项
- 文档占位未完成 1 项
- 当前合计未完成 12 项

## 新增：批量评测骨架、Trace 评分字段、权限审计骨架

这次按“先把框架搭好，后面再逐步细化”的原则，继续把第二批核心能力补成第一版骨架。

本次落地内容：

- 新增 `evaluation_suites`、`evaluation_cases`、`evaluation_runs` 三张表，作为批量评测的最小数据面
- 新增评测集 API：支持创建评测集、写入 case、查看 suite 详情和列出 suite
- 新增评测运行 API：支持创建 draft run，保存 suite + provider + model + prompt_version 的组合
- 在 `traces` 表上新增 `quality_label`、`quality_score`、`quality_notes`
- 新增 `POST /api/traces/{trace_id}/score`，先让单次 trace 可以人工评分
- 新增 `audit_events` 表和 API，支持记录 `allow / deny / review`、`risk_level`、`policy_name`、`target_name`、`reason`
- 前端新增“评测与审计”视图，包含评测集骨架、评测运行骨架、审计事件录入入口
- 前端 Trace 详情新增评分入口，可以直接给当前 trace 打标签和分数

这次参数和设计选择说明：

- `evaluation_runs.status = draft`：先只创建运行骨架，不直接触发批量执行，目的是把数据结构和入口先稳定下来
- `quality_label / quality_score / quality_notes`：先放在 trace 上，而不是单独拆评分表，原因是第一阶段主要服务“单次运行复盘”
- `audit_events.decision` 先限定为 `allow / deny / review`：目的是先沉淀最基本的策略结果口径，后面再扩展审批状态和自动触发链路
- `risk_level` 先限定为 `low / medium / high`：保持最简单的风险分层，方便后面做图表和过滤

本地验证结果：

- 前端 `npm run build` 已通过
- 使用 FastAPI `TestClient` 验证了完整链路：创建评测集 -> 创建评测运行 -> 创建 trace -> trace 打分 -> 创建 audit event
- 验证结果确认：suite `case_count = 2`
- 验证结果确认：run `total_cases = 2`
- 验证结果确认：trace `quality_label = pass`、`quality_score = 88`
- 验证结果确认：audit event `decision = review`、`risk_level = medium`
- 浏览器已确认“评测与审计”导航和三块骨架表单已渲染

当前剩余未完成统计更新为：

- 平台核心未完成 5 项
- 场景 Demo 未完成 3 项
- 文档占位未完成 1 项

## 新增：矩阵 hover drill-down、来源联动过滤、连接器向导、折线 hover 命中

这次的目标不是再堆一批独立卡片，而是把已经落地的数据面真正串成“客户顺着页面就能走完”的交互路径。重点是三条线：矩阵里的结果能直接 drill down，外部来源选择能带动趋势和记录表，连接器卡片能告诉用户“同步完下一步该做什么”。

本次落地内容：

- 矩阵摘要接口补充 `trace_id`、`judge_summary`、`latest_review_score`、`latest_review_notes`，让前端 hover 时不必再二次查结果详情
- 版本矩阵单元格补了 hover 浮层，直接展示 judge 摘要、review 摘要、裁决状态和 Trace 入口
- 外部接入页新增按来源过滤的联动面板，点来源卡片后会同时切换趋势图、KPI、breakdown 和 usage 记录列表
- 外部折线图改为复用同一套坐标计算，避免折线和点因为各自算坐标而错位
- 折线图新增 `trend-chart__hit-area`，原因是只给圆点绑定 hover 时命中范围太小，用户把鼠标放在线上不会触发摘要更新
- 连接器卡片改成分步向导，显式展示“登记来源 -> 拉取 Usage -> 核对结果”的状态流，并补“下一步建议”文案
- 同步成功后会自动聚焦对应来源，减少用户还要自己再去来源卡片里找一次
- 外部 usage 手动录入表单新增 input/output 改动时自动回填 total token，继续保持 `total = input + output` 的统一口径

这次参数和设计选择说明：

- `DerivedExternalUsageStatsPoint`：单独补 `input_token_usage` / `output_token_usage` / `cached_token_usage`，原因是趋势 tooltip 和时间线需要比后端原始统计点更细的拆分字段
- `buildChartCoordinates(...)`：柱图和折线图统一走同一套坐标函数，原因是之前两边各自算 `x/y`，点和线一旦公式不一致就会视觉错位
- `selectedIntegrationSourceId` 继续作为过滤上下文中心：来源卡片、趋势图、breakdown、usage list 都依赖同一个来源选择，集中保存最直接
- `lastSyncedConnectorId`：单独保存最近同步的连接器，原因是“刚同步成功的是哪张卡”这件事只靠 job history 很难给用户即时反馈
- `cell.trace_id` 直接放进矩阵摘要：这是为了让 hover 浮层和“打开 Trace”按钮在当前视图内闭环，不必要求用户先点进 run 再找结果

本地验证结果：

- 编辑器检查通过：`backend/app/main.py`、`backend/app/schemas.py`、`frontend/src/types.ts`、`frontend/src/App.tsx`、`frontend/src/styles.css` 均无报错
- 前端 `npm.cmd run build` 已通过
- 使用 FastAPI `TestClient` 验证 experiment summary 已返回 `trace_id`、`judge_summary`、`latest_review_notes`
- 浏览器已确认：点击外部来源 `Validation Import Source` 后，趋势 KPI 变成 `2 runs / 1200 tokens / $0.12`，并且 usage 记录列表同步收敛到 1 条
- 浏览器已确认：给折线图 hit area 触发 mouseover 后，摘要会从 `2026-05-14 / 0 runs` 切到 `2026-05-13 / 2 runs / 1200 tokens`
- 浏览器已确认：矩阵浮层已显示 judge 摘要和 `打开 Trace trace_ceb1ad...` 按钮，点击后会直接跳到对应 Trace 详情页 `trace_ceb1adb6e27d`
- 浏览器验证时发现本地 8000 端口上原有 FastAPI 进程仍在跑旧代码，导致接口短暂返回旧字段；重启后端服务后，矩阵 hover 数据与当前代码一致
- 当前合计未完成 9 项

## 新增：可执行评测运行、Demo 场景种子与交互反馈修复

这次主要把“已经有骨架”的能力往前推了一步，目标不是做细，而是让它真正能跑、能演示、能给用户明确反馈。

本次落地内容：

- 评测运行从 `draft skeleton` 升级为可执行第一版：创建 run 后会按 suite 的 case 逐条执行，并生成 case result
- 新增 `evaluation_case_results`，保存 case、trace、quality_label、quality_score、judge_summary 的关联结果
- 新增启发式 judge 第一版：会根据 expected_output 关键词覆盖率给出 `pass / needs_review / fail` 和 score
- 新增 `POST /api/demo/seed`，可以一键生成 demo traces、demo evaluation suite、demo evaluation run 和 demo audit events
- 前端“评测与审计”页现在会展示 selected run 的 case 级结果
- 首页和评测页都新增了“一键注入 Demo 数据”入口
- 修复了客户场景卡片错误继承提交按钮样式的问题，解决橙色圆卡和文字溢出
- 图表新增 hover 数据反馈：鼠标经过柱状图/折线点时会刷新 tooltip 数据
- 增加了更明确的 hover / active 动作反馈和轻量入场动画

这次参数和设计选择说明：

- `evaluation_case_results` 单独成表：原因是评测运行结果天然是“一次 run 对多条 case”的结构，继续塞到 run 或 trace 上会让后续版本对比很难扩展
- judge 先用启发式关键词覆盖率：原因是现在优先目标是把评测闭环跑起来，而不是一开始就把 judge 做复杂
- `POST /api/demo/seed`：目的是降低演示和测试门槛，避免每次都手工造 trace / suite / run / audit data
- 图表 tooltip 先用 hover 更新下方摘要卡：比直接上复杂浮层更稳，也更适合当前学习项目的维护成本

本地验证结果：

- 前端 `npm run build` 已通过
- 使用 FastAPI `TestClient` 验证了 `POST /api/demo/seed`
- 验证结果确认：seed 成功创建 3 条 trace、1 个 suite、1 条 evaluation run
- 验证结果确认：最新 evaluation run `status=completed`、`total_cases=2`、`completed_cases=2`、`average_score=100`、`result_count=2`
- 验证结果确认：第一条 result `quality_label=pass`、`quality_score=100`
- 浏览器已确认：场景卡片不再是橙色圆形溢出布局，hover 图表会切换 tooltip 数据

当前剩余未完成统计更新为：

- 平台核心未完成 5 项
- 场景 Demo 未完成 2 项
- 文档占位未完成 1 项
- 当前合计未完成 8 项

## 新增：场景实验室、Paper/RAG Demo 与矩阵评测入口

这次继续按“先把框架搭起来，再往下细化”的原则，主要补的是第二个 Demo 场景、多版本矩阵评测入口，以及 case 级 ground truth 元数据。

本次落地内容：

- 后端为 `evaluation_cases` 增加 `ground_truth_type`、`judge_guidance`、`judge_config_json`
- 后端为 `evaluation_runs` 增加 `experiment_label`，方便把一批矩阵运行先用同一个实验标签归组
- `judge_trace_for_case(...)` 从单一关键词评分升级为可配置第一版：支持 `keyword`、`reference_answer`、`manual_review`
- 新增 `POST /api/evaluations/matrix-runs`，支持按同一个 suite 串行执行多组 provider / model / prompt_version 组合
- 新增 `GET /api/demo/scenarios`，前端可以先拿到可用 Demo 场景目录
- `POST /api/demo/seed` 现在支持按 `scenario_id` 注入不同场景，已接入 `paper_rag`
- 前端新增“场景实验室”页面，用来承接 Demo 场景目录、矩阵评测入口和 case 判分骨架展示
- 已增加 Paper / RAG Demo 第一版：包含 benchmark summary 和 citation miss recovery 两类样例

这次参数和设计选择说明：

- `experiment_label` 先直接挂在 run 上：原因是当前目标是先跑通多版本对照，而不是一开始就引入更复杂的 experiment group 表
- `ground_truth_type` 先只做三类：`keyword`、`reference_answer`、`manual_review`，原因是这三类已经足够覆盖演示和学习阶段最常见的判分路径
- 矩阵评测先串行执行：这样实现最稳，后面如果 run 量明显增大，再单独把队列和后台调度拆出来
- “场景实验室”单独成页：原因是评测与审计页已经承担单次 run 和审计入口，再继续堆 Demo 和矩阵会让页面语义混乱

本地验证结果：

- 前端 `npm run build` 已通过
- 使用 FastAPI `TestClient` 验证了 `GET /api/demo/scenarios`，返回包含 `code_debug` 和 `paper_rag`
- 使用 FastAPI `TestClient` 验证了 `POST /api/demo/seed` 发送 `scenario_id=paper_rag` 成功
- 使用 FastAPI `TestClient` 验证了 `POST /api/evaluations/matrix-runs`，确认一次创建 2 条 completed run
- 使用 FastAPI `TestClient` 验证了 `GET /api/evaluations/suites/{suite_id}`，确认 case 详情里能返回 `ground_truth_type`、`judge_guidance`、`judge_config_json`
- 浏览器已确认：导航栏出现“场景实验室”，页面内已渲染 2 个场景卡片、矩阵评测表单和 case 判分骨架区块

当前剩余未完成统计更新为：

- 平台核心未完成 5 项
- 场景 Demo 未完成 1 项
- 文档占位未完成 1 项
- 当前合计未完成 7 项

## 新增：Robotics Demo、人工标注入口与首页 Hero 收敛

这次主要做了三件事：把首页 Hero/Launch 区收回总览页，补完第三个 Demo 场景，以及把人工标注从“设计上要有”推进到“能提交样本”。

本次落地内容：

- 首页 Hero/Launch 区现在只在总览页显示，不再在追踪页、评测页和实验室页重复出现
- 已增加 Robotics / Embedded Log Analysis Demo 第一版：支持一键注入日志分析、导航异常定位和 watchdog recovery 场景
- 新增 `evaluation_result_reviews`，支持给 case result 记录 reviewer、review_label、review_score、review_notes
- 新增 `POST /api/evaluations/results/{result_id}/reviews`
- `GET /api/evaluations/runs/{run_id}` 现在会返回结果级 `review_count`、`latest_review_label`、`latest_review_score`，以及 run 范围内 reviews 列表
- 场景实验室页新增矩阵聚合摘要卡：可直接看实验标签、最佳变体和当前分差
- 场景实验室页新增人工标注入口，可以对选中的 result 提交第一条 review 样本

这次参数和设计选择说明：

- `evaluation_result_reviews` 单独成表：原因是人工标注天然存在多人、多轮复核的可能，直接塞回 result 字段会把历史覆盖掉
- Robotics Demo 里的 `Watchdog Recovery` 先标成 `manual_review`：因为这类安全恢复场景更适合先走保守的人工判断，再逐步总结成自动 judge 规则
- 首页 Hero 只留在总览：原因是它承担的是产品解释和发起任务，不应该在其它工作页重复占据可视空间

本地验证结果：

- 前端 `npm run build` 已通过
- 使用 FastAPI `TestClient` 验证了 `GET /api/demo/scenarios`，返回包含 `code_debug`、`paper_rag`、`robotics_embedded`
- 使用 FastAPI `TestClient` 验证了 `POST /api/demo/seed` 发送 `scenario_id=robotics_embedded` 成功
- 使用 FastAPI `TestClient` 验证了 `POST /api/evaluations/matrix-runs`，确认能创建 2 条 matrix run
- 使用 FastAPI `TestClient` 验证了 `POST /api/evaluations/results/{result_id}/reviews`，确认 review_count 和 latest_review_label 会回写到 run detail
- 浏览器已确认：场景实验室显示 3 个场景卡片，且首页 Hero 不再出现在其它页面

当前剩余未完成统计更新为：

- 平台核心未完成 3 项
- 场景 Demo 未完成 0 项
- 文档占位未完成 1 项
- 当前合计未完成 4 项

## 新增：provider 官方价格快照、成本校验面板与验证 agent

这次补的不是另一套“看起来更像真的”成本算法，而是把外部 usage 成本真正收束到可复查的官方来源上。目标很直接：以后再看到 token / cost，不再只相信本地常量，而是能回答“这个数是按哪条官方规则算的，哪些还没有官方证据”。

本次落地内容：

- 后端新增 [../backend/app/provider_pricing.py](../backend/app/provider_pricing.py)，集中维护 Anthropic、OpenAI、DeepSeek 的官方价格快照、来源 URL 和说明
- 新增 `GET /api/integrations/usage/validation`，按 provider/model 汇总当前时间窗内的 actual cost、official estimate 和 delta
- 外部接入页新增“官方口径校验”面板，直接展示 `official match / needs review / missing official rate`
- OpenAI Compatible connector 示例模型改成 `gpt-5.4-mini`，原因是当前抓到的 OpenAI 官方 pricing 页稳定包含这一组价格
- 补充 [provider-pricing-reference.md](provider-pricing-reference.md)，把当前官方来源和快照日期落成文档
- 新增 workspace custom agent [../.github/agents/official-validation-auditor.agent.md](../.github/agents/official-validation-auditor.agent.md)，专门负责“先找官方来源，再做功能和数据验收”
- 已把历史 Anthropic 演示记录按官方口径回填，避免校验面板长期显示我们自己 earlier demo 造成的假 drift

这次参数和设计选择说明：

- `OFFICIAL_PRICING_REVIEWED_AT = "2026-05-14"`：显式记录快照日期，原因是定价页会变化，没有日期的规则很快就不可追溯
- `cached_token_usage` 在 Anthropic / DeepSeek 校验里按 cache hit/read 处理：原因是这两个官方来源都给了 cache read 或 cache hit 的单独价格，继续把它并回 input 会把缓存收益抹掉
- `delta_cost_usd` 以 `actual - estimated` 计算：这样页面一眼就能看出当前录入值是偏高还是偏低
- `0.0005` 美元以内视为 matched：原因是当前数据库和 UI 都会做小数截断，不需要把舍入噪音误报成 drift
- OpenAI 只录入当前抓到官方快照的 `gpt-5.4-mini`：原因是用户明确要求“不能盲信自己算法”，所以没有官方来源的 `gpt-4.1-mini` 不再强行估算，而是明确标记 `missing official rate`
- `Official Validation Auditor` 只给校验结论，不负责自我圆场：目的是把“发现不一致”这件事单独角色化，避免实现 agent 一边写代码一边替自己放宽标准

本地验证结果：

- 编辑器检查通过：`backend/app/provider_pricing.py`、`backend/app/main.py`、`backend/app/schemas.py`、`frontend/src/api.ts`、`frontend/src/types.ts`、`frontend/src/App.tsx` 均无报错
- 前端 `npm.cmd run build` 已通过
- 使用 FastAPI `TestClient` 验证 `GET /api/integrations/usage/validation`，确认返回 `supported_check_count`、`unsupported_check_count`、`billing_formula`、`official_source_url`
- 首次校验发现历史 Anthropic 演示记录与官方估算相差 `$1.03696`，随后已将 13 条 Anthropic demo record 回填为官方估算成本
- 再次使用 FastAPI `TestClient` 验证后，Anthropic `claude-sonnet-4` 状态已变为 `matched`，`delta_cost_usd = 0.0`
- 浏览器已确认：外部接入页出现“官方口径校验”面板，Anthropic 显示 `official match`，Validation Import Source 因缺少官方价格快照显示 `missing official rate`
- 浏览器已确认：按来源过滤到 `Validation Import Source` 后，趋势、记录列表和官方校验面板都会一起收敛到该来源

## 新增：多运行对照、自动连接器与 review 队列

这次继续按“先把框架搭起来，再逐步细化”的原则，把上一轮列出来的 1、2、3 都推进到了可用第一版：多运行对照面板、自动外部连接器骨架，以及更强一点的 judge + review 队列。

本次落地内容：

- 新增 `GET /api/evaluations/compare-runs`，支持同一 suite 下两条 run 做 case 级对照
- 前端实验室页新增“多运行对照面板”，直接展示 score delta、label 变化和 review 覆盖差异
- 新增 `GET /api/evaluations/review-queue`，把 `manual_review`、未标注结果和 judge / 人工不一致结果集中成待处理队列
- 前端实验室页新增 review 队列卡片，可一键定位到对应 run/result 继续人工复核
- 启发式 judge 从单纯关键词命中升级为可读配置第一版：支持 `preferred_tools`、`required_terms`、`forbidden_terms`
- 新增 `GET /api/integrations/connectors` 和 `POST /api/integrations/connectors/sync`
- 外部接入页新增自动连接器骨架，先提供 Claude Code、OpenAI Compatible Gateway、DeepSeek Export 三类模板和模拟同步入口

这次参数和设计选择说明：

- compare 路由改成 `/api/evaluations/compare-runs`：原因是如果继续挂在 `/api/evaluations/runs/...` 下，会和 `/{run_id}` 动态路由冲突
- 自动连接器先做“模板 + 模拟同步”：原因是当前目标是把客户实际会用的“连接并同步”动作跑通，而不是在学习阶段过早处理 OAuth、限流和第三方 API 差异
- judge config 先只支持 `preferred_tools`、`required_terms`、`forbidden_terms`：原因是这三类规则最容易解释，也最适合从人工标准逐步过渡到自动打分

本地验证结果：

- 前端 `npm run build` 已通过
- 使用 FastAPI `TestClient` 验证了 `GET /api/integrations/connectors`，返回 3 个模板
- 使用 FastAPI `TestClient` 验证了 `POST /api/integrations/connectors/sync`，请求成功并落入 connector usage 记录
- 使用 FastAPI `TestClient` 验证了 `GET /api/evaluations/compare-runs`，确认返回 case 级 rows
- 使用 FastAPI `TestClient` 验证了 `GET /api/evaluations/review-queue`，确认返回 pending_count 和 items
- 浏览器已确认：外部接入页出现自动连接器骨架；场景实验室出现多运行对照面板和 review 队列入口

当前剩余未完成统计更新为：

- 平台核心未完成 4 项
- 场景 Demo 未完成 0 项
- 文档占位未完成 1 项
- 当前合计未完成 5 项

## 新增：实验聚合摘要、连接器历史重试与 review 指派

这次继续沿着上一轮已经搭好的 1、2、3 往下推进，不再另起炉灶，而是把它们从“入口可用”往“更像真实产品控制面板”推了一步。

本次落地内容：

- 新增 `GET /api/evaluations/experiments/{experiment_label}/summary`，支持按 experiment_label 聚合 runs 和 case summaries
- 实验室页新增“实验聚合摘要”，会汇总 run 均分、最大分差、case 级 score spread 和 review coverage
- 实验室页支持导出实验摘要到 Markdown / JSON，便于学习阶段保存对比样本
- 新增 `external_connector_sync_jobs`，用于记录 connector 同步历史
- 新增 `GET /api/integrations/connectors/history` 和 `POST /api/integrations/connectors/jobs/{job_id}/retry`
- 外部接入页新增同步历史与重试入口，可以直接查看最近批次并重跑同一类 connector job
- 新增 `evaluation_review_assignments`，用于记录结果级 review 指派
- 新增 `POST /api/evaluations/results/{result_id}/assignments`
- review 队列现在支持 `only_pending` 过滤，且会把 assignee / assignment_status / priority / consensus 信息一起带回前端

这次参数和设计选择说明：

- experiment summary 仍然按 `experiment_label` 聚合：原因是现阶段不需要再引入更复杂的 experiment group 表，先把工程对照摘要跑通更重要
- connector retry 直接复用历史 job 的 `connector_id` 和 `lookback_days`：原因是这两个参数已经足够表达一次同步批次的最小重放条件
- review assignment 先只做 `assignee_name`、`assignment_status`、`priority`：原因是学习阶段先把分工流跑通，比一开始就引入通知、截止时间和审批更有价值

本地验证结果：

- 前端 `npm run build` 已通过
- 使用 FastAPI `TestClient` 验证了 `GET /api/evaluations/experiments/debug-experiment-summary/summary`，确认返回 runs 和 case_summaries
- 使用 FastAPI `TestClient` 验证了 `GET /api/integrations/connectors/history`，确认能返回 connector sync jobs
- 使用 FastAPI `TestClient` 验证了 `POST /api/integrations/connectors/jobs/{job_id}/retry`，确认能复用历史 job 重新同步
- 使用 FastAPI `TestClient` 验证了 `POST /api/evaluations/results/{result_id}/assignments`，并在 `GET /api/evaluations/review-queue?only_pending=false` 中确认 assignee 会回到对应队列项
- 浏览器已确认：外部接入页有连接器历史重试区块；实验室页已出现实验聚合摘要与复核指派入口

## 新增：矩阵筛选表、批量导入去重和最终裁决

这次继续把上一轮说的 1、2、3 真正补到可操作层，而不是停留在“接口存在”。

本次落地内容：

- 实验聚合摘要新增 `run_columns` 和 `matrix_rows`，前端可以直接渲染 case x run 的版本矩阵
- 实验室页新增 provider / prompt_version / case title 三个过滤入口，方便从客户视角快速缩小问题范围
- 实验摘要导出逻辑从 `App.tsx` 抽到 [frontend/src/exporters.ts](frontend/src/exporters.ts)，原因是导出格式已经不再只是简单字符串拼接
- 新增 `POST /api/integrations/usage/import`，后端统一处理来源复用、usage 批量落库和 `external_reference` 去重
- 外部接入页新增导入摘要卡片，会显示新建来源数、复用来源数、新建记录数和跳过重复数
- review assignment 新增 `due_at`，队列项会直接标记 overdue
- 新增 `POST /api/evaluations/results/{result_id}/adjudications`，支持负责人记录最终裁决并可选择自动关闭最新 assignment
- review 队列现在会返回 `has_conflict`、`due_at`、`overdue`、`adjudication_label`

这次参数和设计选择说明：

- 批量导入仍然使用 JSON，而不是现在就做 CSV：原因是当前学习项目先强调结构稳定和来源映射，JSON 更容易表达平台差异字段
- 去重只使用 `source_id + external_reference`：原因是这个键足够解释、也足够稳定，避免一开始引入过度复杂的模糊去重规则
- 裁决不覆盖原始 judge 字段，而是单独保存 `adjudication_*`：原因是学习阶段需要同时保留“模型怎么判”和“人最终怎么定”
- `due_at` 放在 assignment 上，而不是单独任务表：原因是这一层已经足够支撑 overdue 队列和负责人视角，不需要提前做完整工单系统

本地验证结果：

- 前端 `frontend/npm run build` 已通过
- 使用 FastAPI `TestClient` 验证了 `POST /api/integrations/usage/import`，确认 `created_record_count=1` 且 `skipped_duplicate_count=1`
- 使用 FastAPI `TestClient` 验证了矩阵运行与 `GET /api/evaluations/experiments/validation-matrix-experiment/summary`，确认 `run_columns=2`、`matrix_rows=2`
- 使用 FastAPI `TestClient` 验证了 assignment + adjudication 链路，确认 review queue 对应项返回 `assignment_status=done` 和 `adjudication_label=pass`
- 浏览器已确认：外部接入页存在同步历史重试区块；场景实验室出现 Provider Filter / Prompt Filter / 版本矩阵 / Due At / 最终裁决 表单

## 新增：前端截图 walkthrough 与一键启动脚本

这次收尾不是继续加业务接口，而是把体验者真正第一次会遇到的两类问题补上：第一类是“页面很多，但我该按什么顺序看”，第二类是“项目功能不少，但启动入口太散，不够一键”。

本次落地内容：

- 新增 [frontend-walkthrough.md](frontend-walkthrough.md)，把总览、追踪页、外部接入、场景实验室四个主视图串成一条推荐演示路径
- 新增 4 张前端真实截图，落在 [assets/screenshots](assets/screenshots)
- 新增 [../scripts/start-demo.ps1](../scripts/start-demo.ps1) 和 [../scripts/start-demo.cmd](../scripts/start-demo.cmd)，支持一键拉起本地前后端
- `start-demo.ps1` 支持 `-InstallDeps`、`-DryRun`、`-NoBrowser`、`-BackendPort`、`-FrontendPort`、`-BindHost`、`-PythonExe`
- 更新 [windows-setup.md](windows-setup.md) 和 [../README.md](../README.md)，把启动方式、参数理由和 walkthrough 入口统一到当前代码状态
- 修正文档漂移：Windows 启动说明里的 API fallback 顺序已改回 `VITE_API_BASE_URL -> 8000 -> 8010`

这次参数和设计选择说明：

- `-BindHost` 默认保留 `127.0.0.1`：原因是学习和演示阶段优先本机可控，不默认暴露到局域网
- `-InstallDeps` 不默认打开：原因是老用户重复启动时不需要每次都重装依赖；首次体验时再显式开启更合理
- `-DryRun` 单独保留：原因是启动脚本一旦同时拉两个新窗口，排错成本会变高，先预演命令更容易定位环境问题
- 脚本内容改为 ASCII 输出：原因是 Windows PowerShell 5.1 对非 ASCII 脚本内容更容易出现编码解析问题，启动脚本必须优先兼容性

本地验证结果：

- 使用浏览器真实页面生成 4 张截图：总览、追踪页、外部接入、场景实验室
- 使用 PowerShell 执行 `scripts/start-demo.ps1 -DryRun -NoBrowser`，确认能正确解析 Python、npm、backend 命令和 frontend 命令
- 文档回读确认：路线图、README、Windows 启动说明和 walkthrough 已对齐同一套剩余统计与启动参数

当前剩余未完成统计更新为：

- 平台核心未完成 3 项
- 场景 Demo 未完成 0 项
- 文档占位未完成 0 项
- 当前合计未完成 3 项

## 新增：reviewer package 与 smoke-check

这次补的是体验者真正会用到的两条操作链：一条是“把项目打成更干净的分享包”，另一条是“启动后不要靠肉眼点页面，而是先做一条自动探活”。它们不改变业务能力，但会明显降低别人第一次接手项目时的摩擦。

本次落地内容：

- 新增 [../scripts/package-demo.ps1](../scripts/package-demo.ps1) 和 [../scripts/package-demo.cmd](../scripts/package-demo.cmd)
- `package-demo.ps1` 支持 `-SkipBuild`、`-NoZip`、`-DryRun`、`-PythonExe`
- 实际打包时会先构建前端，再复制 backend、frontend、docs、examples、README 和关键脚本，生成 reviewer package
- 新增 [../scripts/smoke-check.ps1](../scripts/smoke-check.ps1) 和 [../scripts/smoke-check.cmd](../scripts/smoke-check.cmd)
- `smoke-check.ps1` 会依次探活前端首页、后端 `/docs`、`/api/traces`、`/api/prompt-versions`、`/api/integrations/usage/validation`
- 更新 [windows-setup.md](windows-setup.md) 和 [../README.md](../README.md)，把打包和探活入口写进当前使用说明

这次参数和设计选择说明：

- `package-demo.ps1` 默认先 build frontend：原因是 reviewer package 必须尽量自带最新前端产物，不能假设分享前手工 build 过
- `-NoZip` 单独保留：原因是本地反复调试打包时，更常见需求是先检查目录内容，而不是每次都生成 zip
- `smoke-check.ps1` 默认检查 usage validation route：原因是这个项目现在已经把外部成本校验当成关键能力之一，只查首页和 traces 已经不够
- smoke-check 断言使用真实返回字段 `checks` 和 `supported_check_count`：原因是首次验证时发现我把接口结构想当然地写成了 `summary`，已按真实 API 返回修正

本地验证结果：

- 使用 `powershell -ExecutionPolicy Bypass -File .\scripts\package-demo.ps1 -DryRun` 验证脚本解析和命令拼装通过
- 使用 `powershell -ExecutionPolicy Bypass -File .\scripts\package-demo.ps1 -NoZip` 实际生成 package，确认包含 `backend/app`、`frontend/dist`、`docs/frontend-walkthrough.md`、`scripts/smoke-check.ps1`
- 使用 `powershell -ExecutionPolicy Bypass -File .\scripts\smoke-check.ps1` 实际探活通过，前端首页、后端 docs、trace list、prompt registry 和 usage validation API 均返回 200

补充约束说明：

- 当前目录还不是 git 仓库，也没有配置 remote，所以这一步还不能直接上传到 GitHub
- 真正 push 之前还需要确定目标仓库 URL 或是否由我这边帮你初始化一个新仓库