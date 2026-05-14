# 2026-05-12 实现日志

## 本轮目标

按照当前学习计划，这一轮同时推进三件事：

1. 把 LLM 从占位链路推进到兼容接口真实调用，并补 DeepSeek provider 适配
2. 把运行元数据真正落库，便于后续做筛选、对比和复盘
3. 把前端详情页补成更像观测面板的形态，增加错误分类和单次运行对比

## 代码改动摘要

### 1. 后端

- `Trace` 表新增 `execution_mode`、`provider`、`model_name`、`prompt_version`、`token_usage` 以及 input / output / cached token 字段
- 启动时增加 SQLite 自动补列逻辑，兼容旧演示库
- `execution_mode=llm` 时不再走纯占位，而是调用兼容 `chat/completions`
- provider 现在支持 `deepseek` 和 `openai-compatible`
- 后端现在会自动读取 `backend/.env`
- 当当前 provider 对应的 API Key 缺失时，直接生成失败 trace，而不是悄悄回退成假成功
- 真实 LLM 响应里的 token 现在会拆分成 input / output / cached 三段写入 trace
- 已新增 Prompt 版本注册表接口和趋势统计接口

### 2. 前端

- 列表项新增执行模式、provider、model 标签
- 详情页新增执行元数据展示
- 详情页新增错误分类摘要
- 详情页新增单次运行对比，可比较 latency、steps、errors、tokens
- 导出 Markdown 时把执行元数据一起导出
- API 请求现在会优先尝试 `8010`，再回退到 `8000`
- 详情页和对比面板现在会展示 token 明细，而不只是一项总 token
- Prompt Version 现在由后端注册表驱动，并会显示版本说明和推荐模型
- 已新增时间范围趋势面板和 Prompt / Provider 分布摘要

## 关键参数为什么这样选

- `temperature=0.2`

当前页面主要用于调试与可观测性学习。温度较低时，模型输出更稳定，运行对比更容易讲清楚“Prompt 变化”和“模型变化”带来的差异。

- `DEEPSEEK_BASE_URL` / `OPENAI_BASE_URL` 作为环境变量而不是写死在代码里

这样做是为了兼容官方地址、本地代理、公司网关和其它兼容平台，适合 Windows 本地调试。

- 前端默认 provider 改成 `deepseek`

这是根据你当前的可用条件做的。这样一打开页面就能直接走 DeepSeek，不需要每次手改表单。

- 启动期自动补列而不是直接上 Alembic

当前项目规模还小，而且目标是本地学习和演示。对 SQLite 来说，先用轻量补列逻辑可以降低学习负担，后面如果表更多、变更更频繁，再切到正式迁移工具更合适。

## 本轮验证

- 后端修改文件静态检查通过
- 前端修改文件静态检查通过
- 页面已恢复正常热更新
- 浏览器里已看到 provider 默认值切到 `deepseek`
- 已验证 `deepseek` 会选择 `DEEPSEEK_API_KEY` 和 `https://api.deepseek.com/v1`
- 已验证选择 `v2` 后，会生成 `prompt_version=v2` 的真实 trace
- 已验证趋势面板中的 Prompt Breakdown 出现 `v2: 1`

## 仍然保留的占位点

- 当前只有第一版 provider 适配层，还没有更完整的签名差异处理
- 趋势面板还是卡片和列表视图，还没有升级成图表
- 对比视图目前是单次运行对比，不是完整 diff 面板