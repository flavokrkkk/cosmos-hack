# Project guidance

## Purpose

This repository is a reusable starter for the Cosmos Hackathon. Preserve the
generic infrastructure until the official case is published. Add case-specific
product behavior, data pipelines, thresholds, and models in separate commits so
the work completed during the event is easy to identify.

## Repository layout

- `frontend/`: React, TypeScript, and Vite application.
- `backend/`: FastAPI application, PostgreSQL access, authentication, Ollama
  integration, and Taskiq worker configuration.
- `ml/`: standalone training and evaluation code prepared from the Rostov NDVI
  case. It is not part of the backend runtime.
- `flowers_store/`: local reference checkout. Never edit, import, or commit it.
- `PLAYBOOK.md`: hackathon strategy and case assumptions.
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

## ML and data

Treat `ml/sample_data` as public Rostov reference data for rehearsing the NDVI
pipeline. It is useful only for a vegetation or compatible time-series case.
Do not load it during API startup or assume its schema matches a new case.

Keep ML code independently runnable from the web application. If a case needs
long processing, a Taskiq worker may import a stable ML package or invoke its
pipeline. Create a separate HTTP ML service only when GPU isolation, conflicting
dependencies, or independent scaling requires it.

Never commit private event datasets, generated submissions, model weights,
secrets, `.env`, virtual environments, `node_modules`, or runtime storage.
Document every external dataset, model, repository, and license in the README
and update `PREEXISTING.md` when the pre-event template changes.

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

For ML changes, run `python ml/selfcheck.py` and the relevant local evaluation
command documented in `ml/README.md`. Do not report Docker verification unless
the containers were actually built and started.
