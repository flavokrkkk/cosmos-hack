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
enumeration of the 70 four-of-eight portfolios with A/B/C modes, maximin selection,
and separate deterministic sensitivity scenarios) and
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

## Submission documents

**Freeze: no commits to code or documents after 12.09.2026 23:30 MSK** (the stop-code). The tracker was explicit that any change after it — «ни точки, ни запятой» — is grounds for disqualification. Only the presentation may change, until 13.09 10:00.

The scored deliverables are settled. Maintain them; do not rewrite them, do not
restructure them, and do not start a parallel version in a new file.

| Document | What it is |
|---|---|
| `docs/23-management-note.md` | the management note. Sections 1–11 map one-to-one onto product criteria П1–П9 plus reproducibility; appendices А–Г hold the risk register, the RACI and KPI tables, the per-lot calculation, and the sources |
| `docs/24-stress-summary.md` | the mandatory one-page stress summary; it answers all eight questions listed in §11 of the case instructions |
| `docs/22-hybrid-selection.md` | the accepted selection method `hybrid_maximin_v1` |

The criteria-to-section table on the note's first page is part of the contract with
the expert: if you add, drop, or reorder a section, update that table in the same
edit. Old plans, draft notes and superseded methods were deliberately removed during
the user-approved cleanup. Do not restore them or create a parallel archive; Git keeps
their history. The current map is `docs/README.md`.

### Figures are generated, never typed

The portfolio is computed by `hybrid_maximin_v1`; `config/decision.json` carries
parameters, alternatives, and assumptions, never the winner. To change a figure,
change its source — case inputs, the method, or the config — then:

```bash
backend/.venv/bin/python -m backend.app.core.services.portfolio_engine export
backend/.venv/bin/python scripts/sync_documents.py --fix
backend/.venv/bin/python scripts/render_pdf.py
backend/.venv/bin/python scripts/build_submission.py --skip-export
```

- **Editing a number in a document by hand is the one thing that loses points for
  free.** The case requires the note, the slides, and the tool output to agree, and
  an expert who finds one mismatch stops trusting the rest.
- A new figure in a report must be registered in `collect()` in
  `scripts/sync_documents.py`, or nothing guards it. A new claim about a ratio
  («перекрывают разрыв двенадцатикратно», «четыре ограничения из девяти») goes into
  `relations()` with the band the wording actually means — those phrases rot
  silently and cannot be substituted automatically.
- `document_values` in `results/team_decision_config.json` stores the registered values. Automatic replacement
  requires an explicit `<!-- fact: NAME -->VALUE<!-- /fact -->` binding; bare numerical
  tokens are checked but never replaced globally. Ambiguous or stale unmarked values
  block both edits and snapshot updates. A registered value occurring elsewhere does
  not prove the meaning of every numerical claim: review its context separately.
- `export_provenance` in that same configuration binds the calculation to the inputs,
  implementation and four generated outputs. Export once after source changes; document
  checks and `build_submission.py --skip-export` verify hashes without repeating the search.
- Both repository and submission `results/` contain exactly four files: `portfolio_detail.csv`,
  `portfolio_metrics.json`, `team_decision_config.json`, `hybrid_analysis.json`. Checks and compact
  comparisons belong in the last file. Never restore separate space, sensitivity or constraint dumps.
- The root `engine/` wrapper was deliberately removed. Use the backend module above;
  the standalone submission uses `python run.py ...` and its generated `src/engine`.
- PDFs come only from `scripts/render_pdf.py`. It measures the real page count and
  fails unless the note's sections 1–11 fit 8–12 pages and the summary fits one.
  The note sits at the top of its budget, so run the script before and after any
  addition: half a page added means half a page cut. The output is byte-reproducible
  — the render stamp is normalised and links to repository files are flattened to
  plain text, so a PDF never carries an absolute path from someone's machine. A test
  re-renders and compares, so an edited document with an unrebuilt PDF fails the suite.
  `--check` renders into a temporary directory and never removes or overwrites final PDFs.
- `team-submission/` is generated by `scripts/build_submission.py`. Never edit a
  file inside it; change the source and rebuild. A test compares every bundled file
  against the `source_sha256` recorded in `manifest.json`, so a bundle left unbuilt
  after a source change fails the suite instead of shipping quietly.

### Map of the management note — read before touching it

Source: `docs/23-management-note.md` (one markdown file). Rendered by `scripts/render_pdf.py` into
`docs/management-note.pdf` (sections 1–11, must stay 8–12 pages; the tracker said «двенадцать
максимум») and `docs/management-note-appendices.pdf` (appendices А–Г). Both go to
`team-submission/docs/` via `scripts/build_submission.py`. The one-page stress summary is
`docs/24-stress-summary.md` → `docs/stress-summary.pdf`. The 12-slide skeleton for the defence is
`docs/25-presentation-skeleton.md`; its registered figures use the same check as the note.
The final designer-exported presentation still needs a separate comparison with those sources.

| Section | Criterion | What it holds |
|---|---|---|
| 1 | — | portfolio `FIRE:A, AGRI:C, TRANS:C, ENV:A`, thesis, nine constraints with STRESS slack, glossary |
| 2 | П1 | need → user → service → action → measurable effect → public value; anchor shares describe financing, not the selection rule; CASH and VPUB remain separate; contracts-and-money diagram |
| 3 | П2 | data provenance by hashes; formulas; method = MCDA without weights (maximin), Q = 0,5, Δ = 9,5; choice sensitivity over 16 scenarios; model limits; assumptions A1–A7 |
| 4 | П3 | launch split and operating surplus; 40% operator share is a planning assumption, 46% a conditional bound; separate transition reserve before pilot; cross-coverage and fallback subsidy |
| 5 | П4 | 5670 → 1031 → 143 → 11 → 1; mode ladder; FLOOD loses on Q/scale, C0 headroom is an additional benefit; both alternatives pass portfolio t_rep |
| 6 | П5 | access modes and roles; service contract and subscription; offset/PPP applicability must be confirmed; optional emergency service adds to statutory duties and is outside both revenue and cost calculations |
| 7 | П6 | stress: 9/9 PASS, where it breaks (six limits, two are team thresholds), decision |
| 8 | П7 | demand risk 58,9% commercial; four anti-lock-in measures; six supplier-switch triggers |
| 9 | П8 | replicable core vs local adaptation; `scale_1_5` carries replication talk, `t_rep` only as a constraint; next waves FarEast, UralVolga |
| 10 | П9 | roadmap 0–60 months, six fields per stage; payment for service level |
| 11 | — | reproduction commands |
| А–Г | П7, П9, П2, sources | risk register (7 fields), RACI + KPI verification, per-lot tables, 29 sources — every number-bearing precedent has one |

Mistakes already made and fixed — do not repeat them:

- calling `t_rep` «тиражируемость» (the instructions forbid guessing its meaning; use `scale_1_5`);
- calling a territorial archetype a region («Сибирь») — it is a class of territory;
- payback computed from revenue instead of net flow (199,92 / 92,25 = 2,2 years, not «about a year»);
- «треть ограничений не работает» — it is four of nine, «ровно 4 лота» holds by construction;
- 1370,0 − 1199,0 is 171,0, not 171,4; the OPEX/C0 headroom ratio is «вчетверо», not «втрое»;
- a precedent cited without a source in appendix Г (CLPS +171 млн $, IRIS²) — now sources 28–29;
- IRIS² has its checkpoint at 12 months, not mid-term — cite the mechanism, not the timing;
- a page-1 declaration («12 страниц») that drifts from the measured count — `render_pdf.py` now fails on it;
- adding text without cutting: the note sits at its page budget, so measure after each change;
- presenting `k_vpub` as proof that effects cannot overlap, or a tariff as proof of demand;
- calling the fifth-year review expiry of a ten-year contract; return of investment remains conditional;
- explaining the winner by an individual lot's `t_rep` or anchor share instead of the implemented Q → S rule.

### Wording the organisers constrain

- `t_rep` has no published meaning and the instructions explicitly forbid guessing
  it. Use it only as the constraint we satisfy, never as «тиражируемость».
  Replicability arguments go through `scale_1_5`, which the instructions do call the
  scalability index.
- `VPUB` never adds to `CASH`. `KCASH` is cost coverage — not profit, not ROI, not
  payback. The surplus `S` is not profit: it ignores the return of `C0`, taxes, and
  the cost of capital. Every document repeats these three caveats on purpose.
- Payback of the operator's co-financing is computed from net cash flow, not from
  revenue.
- Never "fix" the stress scenario by lowering lot costs. The official stress changes
  the budget limit only.

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

When engine numbers or the submission documents change, run `sync_documents.py`,
`render_pdf.py` and `build_submission.py` as described under *Submission documents*.

## Documentation and knowledge base

`docs/` is the single source of truth for everything the team knows about the
event and the case. Knowledge must land in `docs/` in the agreed structure — not
in chat, an agent's private memory, commit messages, or new root-level files.
Whenever you learn something new (from a teammate, the platform, the web, a
briefing, or research), write it into the owning file in the same working
session.

Routing — keep the compact current set; do not recreate removed numbered plans:

| What | Where |
|---|---|
| Final solution, financing, roles, risks and roadmap | `docs/23-management-note.md` |
| Selection policy and assumptions | `docs/22-hybrid-selection.md` |
| Official stress and the team's response | `docs/24-stress-summary.md` |
| Defence content and timing | `docs/25-presentation-skeleton.md` |
| Field definitions and output files | glossary in `docs/22-hybrid-selection.md` |
| Case literature and input provenance | `docs/research/case-literature.md` |
| Ollama model, configuration and license | `backend/README.md` |
| Statements from experts and tracker, including deadlines | `docs/notes/consultations.md` |
| Official case and rubric | `case/source/README.md`, `case/statement.pdf`, `case/criteria.pdf` (read-only) |

Rules:

- The repository root holds only `README.md`, `AGENTS.md`, `CLAUDE.md`, and
  `PREEXISTING.md`. Do not create other top-level Markdown files.
- One file, one topic. Link instead of duplicating. When adding or renaming a
  file, update the map in `docs/README.md` and keep relative links valid.
- Mark every statement: **ФАКТ** (with a URL), **ГИПОТЕЗА** (with how to
  verify), **НАХОДКА** (research result, with a URL). A number without a source
  is written as an estimate («≈») together with its basis. Never invent URLs or
  figures.
- When a hypothesis is verified, record the verdict next to it; do not delete it.
- Docs are written in Russian; quotations may keep the source language.
- A new clarification is recorded in the relevant retained source note and reflected
  in the existing final document if it changes a decision. Superseded Markdown remains in Git history.
- Edit only your own sections of shared files (`README.md`, this file); preserve
  other people's sections verbatim.
- Code conventions stay in this file; component READMEs document their own
  component. Do not move code documentation into `docs/`.
