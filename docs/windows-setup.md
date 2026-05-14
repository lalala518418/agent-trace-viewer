# Windows 本地部署说明

## 零、推荐的一键启动方式

如果你的目标是先把页面跑起来，而不是手动拆开前后端命令，优先使用仓库内的一键启动脚本：

```powershell
cd d:/llmlearning/agent-trace-viewer
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -InstallDeps
```

也可以直接双击：

```text
scripts/start-demo.cmd
```

这个脚本会做三件事：

- 自动定位 Python 和 npm
- 在缺少依赖时补装前端依赖；如果显式带上 `-InstallDeps`，也会补装后端依赖
- 分别在两个 PowerShell 窗口里拉起 FastAPI 和 Vite，并默认打开浏览器

推荐参数：

- `-DryRun`：只打印命令，不真正启动。适合先确认解释器、npm、端口和工作目录。
- `-NoBrowser`：不自动打开浏览器。适合你已经有现成标签页。
- `-BackendPort 8010`：当本机 `8000` 被占用时使用。
- `-FrontendPort 5174`：当本机 `5173` 被占用时使用。
- `-PythonExe <path>`：显式切换解释器，适合多 Python 环境机器。

这样设计的原因是：体验者第一次接触项目时，最容易卡在“环境没装好”和“命令太分散”，所以先把启动入口收敛成一个脚本，再保留手工命令作为兜底。

## 零点五、生成 reviewer package

如果你想把项目打包给别人试用，而不是直接压整个工作目录，优先使用：

```powershell
cd d:/llmlearning/agent-trace-viewer
powershell -ExecutionPolicy Bypass -File .\scripts\package-demo.ps1
```

常用参数：

- `-NoZip`：只保留解压后的 package 目录，不额外生成 zip
- `-SkipBuild`：跳过前端 build，适合你确认 `frontend/dist` 已经是最新产物的时候
- `-DryRun`：只打印即将执行的命令和拷贝动作，先校验路径与工具链

这样做的原因是：体验者通常只需要一个可分享、可回放的评审包，不需要你本地的 SQLite、缓存、node_modules 和其它开发噪音。

## 零点七五、启动后的 smoke-check

项目启动后，可以直接执行：

```powershell
cd d:/llmlearning/agent-trace-viewer
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-check.ps1
```

它会检查：

- 前端首页是否返回 200 且包含 `Agent Trace Viewer`
- 后端 `/docs` 是否可访问
- `GET /api/traces`
- `GET /api/prompt-versions`
- `GET /api/integrations/usage/validation?time_range_days=7`

这样做的原因是：体验者启动完服务后，最常见的问题不是“页面完全打不开”，而是“首页能开，但关键接口其实已经坏了”。smoke-check 可以把这类问题提前挡住。

## 一、后端准备

当前工作区已经配置了本地虚拟环境：

```powershell
d:/llmlearning/.venv/Scripts/python.exe
```

安装后端依赖：

```powershell
cd d:/llmlearning/agent-trace-viewer/backend
d:/llmlearning/.venv/Scripts/python.exe -m pip install -r requirements.txt
```

启动后端服务：

```powershell
cd d:/llmlearning/agent-trace-viewer/backend
d:/llmlearning/.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

如果当前机器上的 `8000` 端口被系统或其它程序占用，可以直接改成：

```powershell
cd d:/llmlearning/agent-trace-viewer/backend
d:/llmlearning/.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

## 二、前端准备

如果本机没有 Node.js LTS，先安装：

```powershell
winget install -e --id OpenJS.NodeJS.LTS --scope user --silent --disable-interactivity --accept-package-agreements --accept-source-agreements
```

安装前端依赖：

```powershell
cd d:/llmlearning/agent-trace-viewer/frontend
powershell -ExecutionPolicy Bypass -File d:/llmlearning/.vscode/scripts/run-npm-from-winget.ps1 -NpmArgs install
```

启动前端：

```powershell
cd d:/llmlearning/agent-trace-viewer/frontend
powershell -ExecutionPolicy Bypass -File d:/llmlearning/.vscode/scripts/run-npm-from-winget.ps1 -NpmArgs run dev -- --host 127.0.0.1
```

默认访问地址：

- 前端：http://127.0.0.1:5173
- 后端：http://127.0.0.1:8000

前端当前会按下面的顺序自动尝试后端地址：

1. `VITE_API_BASE_URL`
2. `http://127.0.0.1:8000`
3. `http://127.0.0.1:8010`

这样做是因为当前代码已经把 `8000` 重新设回主默认端口，而 `8010` 只保留为旧环境兼容回退。

## 三、真实 LLM 模式环境变量

如果你当前不能使用 OpenAI API，项目现在支持直接切到 DeepSeek 兼容接口。推荐直接在 `backend/.env` 里配置：

```powershell
cd d:/llmlearning/agent-trace-viewer/backend
Copy-Item .env.example .env
```

然后把 `.env` 里的相关字段改成下面这样：

```powershell
DEEPSEEK_API_KEY=你的 API Key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

说明：

- `DEEPSEEK_API_KEY` 是走 DeepSeek 时的必需项，未配置时后端会生成一条失败 trace，方便你在页面里观察配置错误。
- `DEEPSEEK_BASE_URL` 是可选项，默认会走 DeepSeek 官方兼容地址。
- 后端启动时会自动读取 `backend/.env`，所以你不需要在多个终端里重复执行 `$env:...`。
- 如果你后面又能使用 OpenAI，项目仍然支持 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL`。
- 前端表单里的 `provider` 现在默认是 `deepseek`，也支持手动填完整 URL。这样做是为了方便学习“同一套请求结构如何切换不同兼容网关”。

## 四、VS Code 任务

工作区已经提供两个任务：

- `agent-trace-viewer: backend`
- `agent-trace-viewer: frontend`

前端任务会自动查找通过 winget 安装的 Node.js LTS，避免因为 PATH 还没刷新导致找不到 npm。

## 五、数据库自动补列说明

后端启动时会自动执行一次轻量补列逻辑：

- 新库：直接按当前 SQLAlchemy 模型建表
- 旧库：如果缺少 `execution_mode`、`provider`、`model_name`、`prompt_version`、`token_usage` 这些列，会在启动时自动补上

这样做的原因是当前项目优先服务本地学习和 Windows 演示，不想为了几列 SQLite 字段先引入 Alembic。

## 六、当前已知占位点

- 当前已补一键启动脚本，适合本地学习和演示
- 当前已补 reviewer package 生成脚本和 smoke-check 脚本
- 占位：仍未补完整的生产部署脚本或打包方案