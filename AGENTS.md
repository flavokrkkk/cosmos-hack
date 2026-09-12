# Project guidance

## Purpose

This repository is a reusable starter for the Cosmos Hackathon. The team has
accepted **Case 02 «Сервисная модель космической экономики»** (Nizhny Novgorod,
11–13 September 2026, case holder АНО «КЭП»). Preserve the generic
infrastructure; add case-specific product behavior, data pipelines, thresholds,
and models in separate commits so the work completed during the event is easy
to identify. Everything the team knows about the event and the case lives in
`docs/` — see "Documentation and knowledge base" below. Two people and their AI
agents work in this repository; the rules below apply to all of them.

## Repository layout

- `frontend/`: React, TypeScript, and Vite application.
- `backend/`: FastAPI application, PostgreSQL access, authentication, Ollama
  integration, and Taskiq worker configuration.
- `flowers_store/`: local reference checkout. Never edit, import, or commit it.
- `docs/`: team knowledge base — event, case brief, hypotheses, strategy,
  rubric/delivery, and the deep research (`docs/research/`). Start at
  `docs/README.md`.
- `PREEXISTING.md`: inventory of components created before the event.

## Frontend conventions

Follow the same Feature-Sliced structure as `flowers_store`:

```text
app -> pages -> widgets -> features -> entities -> shared
```

Higher layers may import lower layers. `shared` must not contain domain logic;
`entities` must not import `features`, `widgets`, or `pages`. Keep application
providers in `src/shared/lib/providers`, routes in `src/pages/routes.tsx`, API
clients in `src/shared/api`, and entity-specific requests, hooks, types, and UI
inside the relevant entity directory. Use configured aliases instead of long
relative imports.

Use React Query for server state and Axios for API calls. The existing token
refresh interceptor is the single refresh implementation. Do not add WebSocket
or SSE infrastructure for job progress; use HTTP polling unless the case has a
real bidirectional realtime requirement.

## Backend conventions

Keep the layer boundaries inherited from `flowers_store`:

- `app/api`: HTTP routers and FastAPI dependencies only.
- `app/core/dto`: request and response schemas.
- `app/core/services`: application logic.
- `app/core/repositories`: persistence operations.
- `app/infrastructure`: configuration, database models, logging, middleware,
  errors, and external implementations.
- `app/tasks`: Taskiq broker and long-running jobs.

Routers call services; services call repositories. Do not access SQLAlchemy
directly from routers. Use Python 3.12 typing and async database operations.
Prefix environment variables with `COSMOS_` to avoid collisions with system
variables.

Keep external LLM HTTP details in `app/core/clients/ollama_client.py`. Put
prompt assembly and case-specific LLM behavior in
`app/core/services/ollama_service.py`; routers and tasks must call the service,
not Ollama directly. Do not expose a generic prompt proxy endpoint. Add narrow
case-specific endpoints after the official case is accepted.

The intentional initial API surface is:

```text
POST /admin/auth/login
POST /admin/auth/refresh
GET  /admin/auth/current_user
GET  /health
```

Add new endpoints only for an accepted case requirement. Keep short operations
inside FastAPI. Send durable or long-running processing to Taskiq through Redis.
PostgreSQL remains the source of truth for job state; Redis is the broker and an
optional cache. Do not put imagery, GeoTIFF files, models, or large results in
Redis.

The default `docker compose up --build` must keep the whole development stack
runnable: frontend, backend, worker, PostgreSQL, Redis, Ollama, and model pull.
Keep Ollama weights in the named volume and make the model configurable through
`COSMOS_OLLAMA_MODEL`.

Use `docker-compose.server.yml` when FastAPI and frontend run on a remote server
while Ollama runs on a Mac through ngrok. Keep ngrok Basic Auth credentials in
an untracked env file. The browser must call FastAPI only; never expose ngrok
credentials or the Ollama URL to the frontend bundle.

## Computation and data

Case 02 needs no machine learning: there is nothing to train on and no automated
metric. The portfolio engine is deterministic arithmetic (yearly cash flows,
enumeration of the 70 four-of-eight portfolios, Pareto front, Monte Carlo) and
belongs in `backend/app/core/services`, called synchronously from the API. Do not
introduce a separate ML service, GPU dependency, or queue for it. Use Taskiq only
if a computation actually exceeds a couple of seconds.

Every model parameter carries its origin: `постановка` (given by the organisers),
`ресерч` (external source with a URL), or `допущение` (ours, with a stated basis).
Numbers without a source are marked as estimates. The LLM never produces numbers —
it only renders text from values the engine already computed.

Calculations must be deterministic and reproducible: same inputs, same outputs,
plus a self-check that asserts this. The NDVI kit removed from `ml/` (tag
`ndvi-kit`) is the reference for that pattern — config-driven parameters and a
`selfcheck.py` battery.

Never commit private event datasets, secrets, `.env`, virtual environments,
`node_modules`, or runtime storage. Document every external dataset, model,
repository, and license in the README, and update `PREEXISTING.md` when the
pre-event template changes.

## Verification

Run the checks relevant to every changed area:

```bash
cd frontend
npm run lint
npm run build
```

```bash
cd backend
PYTHONPYCACHEPREFIX=/tmp/cosmos-hack-pycache \
  .venv/bin/python -m compileall -q app migrations
.venv/bin/python -c "from app.main import app; print(sorted(app.openapi()['paths']))"
```

For changes to the portfolio engine, run its self-check and confirm the numbers
are reproducible. Do not report Docker verification unless the containers were
actually built and started.

When engine numbers or the documents change, run from the repo root:

```bash
backend/.venv/bin/python scripts/sync_documents.py   # --fix substitutes new values
backend/.venv/bin/python scripts/render_pdf.py       # fails if the note leaves 8-12 pages
```

`sync_documents.py` keeps the registry of every figure the reports state; phrases about
ratios ("twelvefold", "a third of the constraints") are range-checked and reported for a
human to rewrite. Never hand-edit a figure without re-running it.

## Documentation and knowledge base

`docs/` is the single source of truth for everything the team knows about the
event and the case. Knowledge must land in `docs/` in the agreed structure — not
in chat, an agent's private memory, commit messages, or new root-level files.
Whenever you learn something new (from a teammate, the platform, the web, a
briefing, or research), write it into the owning file in the same working
session.

Routing — put new information in the file that owns the topic:

| What | Where |
|---|---|
| Event logistics, deadlines, platform (ЛК) | `docs/00-event.md` |
| Case text, decode, jury profile | `docs/01-case02-brief.md` |
| Hypotheses (each with "how to verify") and briefing questions | `docs/02-hypotheses.md` |
| What we build and why, roles | `docs/03-strategy.md` |
| Rubric, delivery requirements, timeline, anti-patterns | `docs/04-rubric-and-delivery.md` |
| Decisions taken (date, decision, why, alternatives, status) | `docs/05-decisions.md` |
| Sourced research findings, one topic per file | `docs/research/<topic>.md` + a row in `docs/research/README.md` |
| Dated notes: briefing, standups, expert or tracker consultations | `docs/notes/YYYY-MM-DD-<topic>.md` |
| Outdated documents still relevant to Case 02 | `docs/archive/` with a deprecation note at the top | 

Rules:

- The repository root holds only `README.md`, `AGENTS.md`, `CLAUDE.md`, and
  `PREEXISTING.md`. Do not create other top-level Markdown files.
- One file, one topic. Link instead of duplicating. When adding or renaming a
  file, update the map in `docs/README.md` (and `docs/research/README.md` for
  research) and keep relative links valid.
- Mark every statement: **ФАКТ** (with a URL), **ГИПОТЕЗА** (with how to
  verify), **НАХОДКА** (research result, with a URL). A number without a source
  is written as an estimate («≈») together with its basis. Never invent URLs or
  figures.
- When a hypothesis is verified, record the verdict next to it; do not delete it.
- Docs are written in Russian; quotations may keep the source language.
- After the case briefing, update in this order: `docs/02-hypotheses.md`
  (verdicts, official definitions of access modes), `docs/research/engine-parameters.md`
  (real lots and budget), `docs/00-event.md` (deadlines), `docs/05-decisions.md`.
- Edit only your own sections of shared files (`README.md`, this file); preserve
  other people's sections verbatim.
- Code conventions stay in this file; component READMEs document their own
  component. Do not move code documentation into `docs/`.
