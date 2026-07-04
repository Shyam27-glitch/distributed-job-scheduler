# Distributed Job Scheduler

A multi-tenant job scheduler: organizations own projects, projects own queues, queues run jobs
(immediate, delayed, scheduled, recurring, batch) with configurable retry policies, atomic
worker claiming via `SELECT ... FOR UPDATE SKIP LOCKED`, heartbeat-based failure detection, and
a dead letter queue for permanent failures.

## Stack

Node.js + Express (TypeScript) API, a separate worker service, PostgreSQL 16, React + Vite
dashboard (polling-based live updates), JWT auth, Docker Compose.

## Setup

```bash
cp .env.example .env    # adjust values as needed
docker compose up -d postgres
npm install
npm run migrate
docker compose up        # or: npm run dev in api/, worker/, web/ individually
```

- API: http://localhost:3000 (health check: `curl localhost:3000/health`)
- API docs: http://localhost:3000/api/docs (added in a later increment)
- Metrics: http://localhost:3000/metrics (added in a later increment)
- Web dashboard: http://localhost:5173

## Repository layout

- `packages/shared` — DB pool, migrations, structured logger, env config, shared types
- `api` — REST API (auth, projects, queues, jobs, dashboard endpoints)
- `worker` — polls queues, claims jobs atomically, executes them, sends heartbeats
- `web` — React/Vite dashboard
- `docs` — architecture diagram, ER diagram, design decisions

## Development

```bash
npm run build   # builds all workspaces
npm run lint     # typechecks all workspaces
npm test         # runs tests in all workspaces
```

See `docs/design-decisions.md` for the reasoning behind SKIP LOCKED vs. a message broker,
polling vs. WebSockets, at-least-once delivery, and heartbeat-based failure detection.
