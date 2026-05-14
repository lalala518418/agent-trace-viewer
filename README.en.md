# Agent Trace Viewer

Chinese overview: [README.md](README.md)

Agent Trace Viewer is a lightweight observability workspace for AI agent runs. Instead of behaving like a chat UI, it records one run from input to final output and makes the chain reviewable, comparable, and exportable.

## What It Is For

This project is aimed at three practical learning and delivery scenarios:

- AI application engineers and agent builders who need to debug multi-step agent flows, prompt changes, and tool failures.
- Quality engineers who need to compare prompts, models, providers, latency, and token usage across repeated runs.
- Team leads or operators who want internal runs and external platform usage in one place.

The core value is to answer three questions quickly:

- Did the run succeed?
- If not, where and why did it fail?
- How much token and cost did the workflow consume across internal and external systems?

## Current Capabilities

The current workspace already includes:

- FastAPI backend with SQLite trace persistence.
- React and Vite frontend with customer-facing overview, traces, integrations, evaluations, and labs views.
- Mock execution and first-pass real LLM execution via DeepSeek or OpenAI-compatible APIs.
- Prompt version registry with file-backed JSON persistence and in-app editing on the overview page.
- Trace filters, pagination, compare view, timeline detail, and export to Markdown or JSON.
- External usage import, connector simulation, usage validation against official pricing references, and sync history.
- Evaluation suites, review queue, adjudication entry points, and multi-run comparison.
- Demo scenario seeding, walkthrough screenshots, smoke-check scripts, and reviewer packaging scripts.

## Tech Stack

- Backend: Python 3.11, FastAPI, SQLAlchemy 2, SQLite, Pydantic 2
- Frontend: React 18, Vite 5, TypeScript
- Runtime modes: mock execution and real LLM execution

This stack was chosen because it stays stable on Windows, is easy to run locally, and is straightforward to explain in interviews or learning notes.

## Quick Start

For the fastest local demo on Windows:

```powershell
cd d:/llmlearning/agent-trace-viewer
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -InstallDeps
```

To verify the project after changes:

```powershell
cd d:/llmlearning/agent-trace-viewer
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-check.ps1
```

To produce a cleaner reviewer package:

```powershell
cd d:/llmlearning/agent-trace-viewer
powershell -ExecutionPolicy Bypass -File .\scripts\package-demo.ps1
```

## Project Structure

```text
agent-trace-viewer/
├── backend/
├── docs/
├── examples/
├── frontend/
├── scripts/
├── README.md
└── README.en.md
```

## Remaining Gaps

Several roadmap items are still first-pass implementations rather than finished product features:

- Deeper multi-provider support and richer provider-specific usage normalization.
- Stronger replay diff workflows and batch replay tooling.
- More complete evaluation judge logic and approval workflow design.
- More realistic external connector implementations beyond the current simulation-oriented first version.

See [docs/feature-roadmap.md](docs/feature-roadmap.md), [docs/scenario-gap-analysis.md](docs/scenario-gap-analysis.md), and [docs/frontend-walkthrough.md](docs/frontend-walkthrough.md) for more detail.