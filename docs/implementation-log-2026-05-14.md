# 2026-05-14 实现日志

## 本轮目标

这一轮不再继续往页面里堆内容，而是先解决两个直接影响可用性的问题：

- 顶部导航过于扁平，用户很难快速定位具体功能区
- 版本矩阵依赖 hover 弹层展示详情，但弹层会被下方内容和滚动容器裁切

## 本轮完成的改动

### 1. 顶部导航改为侧边栏目录

- 前端主导航从顶部按钮组改成左侧固定目录
- 一级目录继续保留 `Overview / Traces / Integrations / Evaluations / Labs`
- 二级目录改成每个主视图下的具体功能区锚点，例如 `Trace Workspace / Trace Detail`、`Source Setup / Usage Entry / Usage Trends`
- 点击二级目录会先切换主视图，再平滑滚动到对应区块

这样做的原因是：当前页面已经不再是单块 dashboard，而是多个工作区拼起来的产品页。如果还继续用顶部一排按钮，用户只能先记住页面结构，再自己往下找模块；改成侧边栏后，信息架构会直接暴露出来，查找成本更低。

### 2. 版本矩阵改为“点击单元格 + 固定详情区”

- 移除了矩阵单元格里的 hover popover
- 点击矩阵单元格后，仍然会聚焦对应 run / result
- 详情信息改到矩阵下方的固定详情区展示
- 详情区保留 `judge summary`、`review status` 和 `Open Trace` 操作
- 版本矩阵新增“展开矩阵 / 收起矩阵”按钮，默认先收起，减少长页面堆叠

这样做的原因不是单纯调高 `z-index`。原问题的根因是矩阵本身在可滚动容器里，hover 弹层天然容易被裁切或与其它层叠上下文冲突。把说明信息移到固定详情区后，交互成本更低，也更稳定，后续继续扩展字段时不用再和 CSS 裁切问题反复拉扯。

## 关键参数和设计选择

- `defaultSidebarSectionByView`

这个映射专门用来定义每个一级视图的默认二级锚点。这样做的目的是保证用户只点击一级目录时，页面也会落到一个明确的起始区块，而不是停在随机滚动位置。

- `pendingScrollTargetId`

这个状态专门保存“下一次需要滚动到哪个区块”。选择单独保存，而不是在点击时直接滚动，是因为切换一级视图后目标区块需要先渲染出来，否则滚动会找不到节点。

- `showExperimentMatrixDetails`

这个开关现在真正接入了矩阵显示逻辑。选择默认收起，是因为版本矩阵信息密度最高，如果一进入 Labs 页面就完整展开，会再次回到“内容过多、功能难找”的问题。

## 本轮验证

- 编辑器检查通过：`frontend/src/App.tsx`、`frontend/src/styles.css` 无报错
- 前端 `npm.cmd run build` 已成功
- 浏览器快照已确认：左侧出现一级/二级目录，Overview 下可见 `Workspace Summary / Launch Scenario / Audience & Context`

## 后续影响

- 如果下一步还要继续细分页面，可以在现有侧边栏模型里继续增加二级项，而不必再重做导航骨架
- 如果后面要把矩阵详情升级为右侧 inspector 或抽屉，也可以直接复用当前“选中单元格 -> 固定详情”的状态流，不需要再回到 hover popover 模式

## 同日追加：单列阅读流与滚动联动

用户继续提出一个更直接的判断：既然已经有了侧边栏，主内容区就没必要再保留多块并排布局。并列卡片会让页面再次变成“需要自己扫视线”的控制台，而不是“按目录往下读”的产品页。

本次追加落地内容：

- `hero-card--split` 改成单列，Overview 入口先讲清楚，再进入操作区
- `content-grid`、`overview-secondary-grid`、`integration-grid` 全部改成单列 section 栈
- 各锚点 section 增加 `scroll-margin-top`，避免点击目录后内容贴边
- 侧边栏新增基于 `IntersectionObserver` 的滚动高亮，不再只在点击后高亮

这次参数和设计选择说明：

- `rootMargin: '-10% 0px -55% 0px'`

这里不是为了追求特别复杂的滚动算法，而是让“接近视口上半部分、且已进入主体阅读区”的 section 更容易成为当前高亮项。上边保留一点提前量，下边压掉较大的尾部区域，可以减少两个区块同时大面积可见时的抖动。

- `threshold: [0.2, 0.45, 0.7]`

这里用多阈值而不是单一阈值，是为了让较高和较低可见比例都能触发回调，再用可见比例和顶部距离排序，选出最符合当前阅读位置的 section。

本地验证结果追加：

- 编辑器检查通过：`frontend/src/App.tsx`、`frontend/src/styles.css` 无报错
- 前端 `npm.cmd run build` 再次通过

## 同日追加：英文残留修复与准确性验证

这一轮没有再继续改页面风格，重点回到两个更实际的问题：

- 英文模式下仍有一批硬编码标题和说明会直接漏出中文
- 页面结构基本稳定后，需要开始验证功能是否真的按设计和官方口径工作，而不是只看界面是否能打开

本次追加落地内容：

- 修复了 Overview、Trace Detail、Integrations、Evaluations、Labs 中一批直接写死的中英文混合标题和提示文案
- 为 `Selected Suite`、`Selected Run Results`、`Audit Event History`、`Experiment Case Summaries` 增加默认收起逻辑，进一步压缩长页面首屏长度
- 保留原有 `Official Pricing Check`、`Review Queue`、`Version Matrix` 折叠方式，形成更一致的“默认摘要，按需展开”模式

这次验证结果：

- 编辑器检查通过：`frontend/src/App.tsx` 无报错
- 前端 `npm.cmd run build` 通过
- `scripts/smoke-check.ps1` 全部通过：frontend root、backend docs、`/api/traces`、`/api/prompt-versions`、`/api/integrations/usage/validation` 都返回正常
- 官方价格口径已重新对照：
	- Anthropic Claude Sonnet 4.x 官方页支持 `input $3 / MTok`、`cache read $0.3 / MTok`、`output $15 / MTok`
	- DeepSeek 官方页支持 `deepseek-v4-flash / deepseek-chat` 对应 `cache hit $0.0028 / MTok`、`input $0.14 / MTok`、`output $0.28 / MTok`
	- OpenAI 官方页支持 `GPT-5.4 mini` 对应 `input $0.75 / MTok`、`cache input $0.075 / MTok`、`output $4.5 / MTok`
- 本地 `/api/integrations/usage/validation?time_range_days=7` 返回结果显示：
	- `anthropic / claude-sonnet-4` 的 `actual_cost_usd` 与 `estimated_cost_usd` 完全一致
	- `openai-compatible / gpt-5.4-mini` 存在 `-0.00066` 的轻微偏差，当前更像舍入或历史记录口径差异，而不是规则常量错误

这次参数和设计选择说明：

- `showSelectedSuiteCases` / `showSelectedRunResults` / `showAuditEventHistory` / `showExperimentCaseSummaries`

这些状态的目的不是把信息藏起来，而是把高密度明细改成“先看摘要，再决定是否展开”。在当前项目阶段，这比继续拆页面更省改动，也更适合保留一条完整的工作流。

- 价格准确性验证优先采用“本地接口 + 官方页面”双重校验

原因是只看前端展示无法判断算法是否正确，只看代码常量又无法确认运行中接口有没有把这些常量真正用起来。把官方文档、后端规则和实际 API 返回三者串起来，才能更接近“算法功能性和精确性”的验证。

## 同日追加：去掉默认测试样例并补自动化回归

这一轮开始把项目从“适合演示”进一步收紧到“适合交付和公开仓库”。核心目标有两个：

- 不再让前端默认带着历史测试文案和导入样例，避免用户一打开就把演示数据误当成真实业务输入
- 把价格规则和 usage validation 的关键行为固化成后端自动化测试，后续再调 pricing 或 validation 逻辑时能第一时间发现偏差

本次追加落地内容：

- 清空了 `frontend/src/App.tsx` 中 `SAMPLE_PROMPT`、`SAMPLE_EXTERNAL_IMPORT`，并同步移除了外部接入、评测、实验矩阵表单里的默认演示值
- 保留表单结构，但把 `user-input`、导入 JSON、评测 case、矩阵 variant、API key hint 都改成更中性的 placeholder，避免示例文本继续影响真实录入
- 将首页快速操作卡改成通用模板，不再直接塞入“Python 报错”“客户支持 incident”这类旧测试案例
- 删除仓库中的 `examples/sample_trace.json`，不再把旧 trace 样例作为默认公开内容
- 新增 `backend/tests/test_usage_validation.py`，覆盖 Anthropic、DeepSeek、OpenAI-compatible 三类官方定价规则，以及 `matched / drift / missing_official_rate` 三种校验结果

这次参数和设计选择说明：

- 前端默认值改为空字符串或 `0`

这里不是为了让界面“更空”，而是为了把默认状态和真实录入状态对齐。用户如果没有明确填值，系统就不应该替他假设一个测试场景。

- 自动化测试选择 `unittest` + `SimpleNamespace`

这里优先选标准库，是为了减少新增依赖，也方便在当前 Windows + venv 环境里直接执行。`SimpleNamespace` 用来构造最小 usage record，目标是只测试 pricing 和 validation 逻辑本身，不把数据库初始化一起拖进来。

- `matched` 与 `drift` 分别固定成 `0.0004` 和 `0.00066`

这里不是任意挑两个数，而是直接对齐当前后端容差边界附近的行为：一个留在“可接受的小偏差”范围内，一个明确越界，方便后续有人调整阈值时立刻看到行为是否改变。

本轮验证追加：

- 编辑器检查通过：`frontend/src/App.tsx`、`backend/tests/test_usage_validation.py` 无报错
- 后端 `d:/llmlearning/.venv/Scripts/python.exe -m unittest discover -s backend/tests -v` 通过，5 个测试全部为 `OK`
- 前端 `npm.cmd run build` 再次通过

这一轮完成后，仓库默认打开时不再自带旧测试用例，关键价格校验逻辑也有了可重复执行的回归保护，后续再 push 到 GitHub 时更适合作为对外展示和继续迭代的基础版本。