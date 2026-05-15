# 启动与使用速查

这份文档的目标是解决两个最常见的问题：

- 重启电脑后，怎么最快把前后端重新拉起来
- 项目已经接近完成后，平时应该怎么使用，而不是只把它当成一个 demo 页面

## 一、最快启动方式

如果你只是想恢复前后端并继续使用，优先执行一条命令：

```powershell
cd d:/llmlearning/agent-trace-viewer
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -NoBrowser
```

说明：

- `-NoBrowser` 适合你已经有固定标签页，不想每次都新开浏览器
- 脚本会自动启动 backend 和 frontend 两个窗口
- 默认地址仍然是前端 `http://127.0.0.1:5173`、后端 `http://127.0.0.1:8000`

如果你怀疑依赖丢了，或者换了新机器，改用：

```powershell
cd d:/llmlearning/agent-trace-viewer
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -InstallDeps -NoBrowser
```

## 二、启动后验证

服务起来后，不要只看页面能不能打开，建议马上跑一次 smoke-check：

```powershell
cd d:/llmlearning/agent-trace-viewer
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-check.ps1
```

它会检查：

- 前端首页
- 后端 `/docs`
- Trace 列表 API
- Prompt Registry API
- Usage Validation API

如果这一步通过，说明“前端能开 + 后端关键接口能响应”这两个最低要求都满足了。

## 三、手工启动指令集

如果一键脚本失效，或者你想单独控制前后端，用下面这组命令。

### 1. 后端

安装依赖：

```powershell
cd d:/llmlearning/agent-trace-viewer/backend
d:/llmlearning/.venv/Scripts/python.exe -m pip install -r requirements.txt
```

启动服务：

```powershell
cd d:/llmlearning/agent-trace-viewer/backend
d:/llmlearning/.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. 前端

安装依赖：

```powershell
cd d:/llmlearning/agent-trace-viewer/frontend
npm.cmd install
```

启动服务：

```powershell
cd d:/llmlearning/agent-trace-viewer/frontend
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

## 四、常用命令清单

### 1. 前端构建

```powershell
cd d:/llmlearning/agent-trace-viewer/frontend
npm.cmd run build
```

### 2. 后端单测

```powershell
cd d:/llmlearning/agent-trace-viewer
d:/llmlearning/.venv/Scripts/python.exe -m unittest discover -s backend/tests -v
```

### 3. 生成评审包

```powershell
cd d:/llmlearning/agent-trace-viewer
powershell -ExecutionPolicy Bypass -File .\scripts\package-demo.ps1
```

### 4. 启动中文页面

```powershell
cd d:/llmlearning/agent-trace-viewer
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -Language zh
```

或者直接访问：

```text
http://127.0.0.1:5173/?lang=zh
```

## 五、现在项目应该怎么使用

当前这个项目已经不只是“演示一次 agent trace 的页面”，更适合按下面四种方式使用。

### 1. 当作 Agent 运行观测台

适合场景：

- 你刚跑完一次 mock 或真实 LLM 请求
- 你想知道失败发生在哪一步
- 你想看 token、延迟、provider、prompt version 是否异常

推荐路径：

1. 先打开 Overview 看整体成功率、失败摘要和近期趋势
2. 再进入 Traces，看具体某一条 trace 的 timeline、error summary 和输出
3. 如果需要复跑，再从 trace detail 走 replay 或重新提交输入

### 2. 当作 Prompt / Provider 对照台

适合场景：

- 你想比较不同 prompt version 的效果
- 你想看 deepseek、mock 或不同模型组合在同一 case 下的差异

推荐路径：

1. 先在 Evaluations 建 suite 和 case
2. 再到 Labs 跑 matrix
3. 看聚合摘要、版本矩阵、多运行对照和 review queue

这样用的价值是：它把“直觉觉得哪个好”变成可复查的 run、case 和评分记录。

### 3. 当作外部 usage 和成本校验台

适合场景：

- 你想把 Claude Code、自有 API 网关或导出账单收进统一口径
- 你想核对 actual cost 和官方价格快照之间有没有漂移

推荐路径：

1. 先在 Integrations 建 source
2. 再手动录 usage 或导入 JSON
3. 看 usage validation 的 `matched / drift / missing_official_rate`

这样用的重点不是“算出一个漂亮数字”，而是确保成本口径有官方依据。

### 4. 当作客户或面试展示工作台

适合场景：

- 你要给别人演示这不是一个普通聊天页面
- 你要讲清楚 agent observability、质量回归和成本治理

推荐演示顺序：

1. Overview：讲整体稳定性和问题分布
2. Traces：讲一次具体运行如何定位失败
3. Integrations：讲外部 usage 和官方价格核对
4. Labs：讲矩阵评测、复核和裁决闭环

## 六、真实 LLM 模式怎么用

如果你要从 mock 切到真实模型调用，重点只看 backend/.env：

```text
DEEPSEEK_API_KEY=你的 key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

当前项目里：

- `deepseek` 已经是可直接使用的 provider 路径
- 没配 key 时，后端会生成失败 trace，而不是伪造成功结果
- `.env` 已被忽略，不会被 git 自动提交

这套设计的意义是：你可以在同一页面里观察“真实调用失败”与“业务逻辑失败”的区别。

## 七、我自己日常最建议的使用方式

如果你现在是“项目差不多完成，后面以维护、展示、微调为主”，最实用的习惯是：

1. 重启后先跑 `start-demo.ps1 -NoBrowser`
2. 紧跟着跑 `smoke-check.ps1`
3. 日常调页面时只开前端构建验证
4. 改 pricing、validation、seed 或后端逻辑时跑后端单测
5. 需要对外展示时按 `Overview -> Traces -> Integrations -> Labs` 这条顺序走

这样做的原因是：你当前项目已经过了“从零搭骨架”的阶段，后续最重要的是稳定复用，而不是每次都重新摸索启动和演示路径。