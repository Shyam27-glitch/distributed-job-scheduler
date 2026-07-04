# Project: Distributed Job Scheduler (Intern Assignment)

## Deadline
July 5, 2026 EOD. Prioritize working core features + documentation over bonus features.

## Grading rubric (optimize for this)
- System Architecture: 20 | Database Design: 20 | Backend Engineering: 20
- Reliability & Concurrency: 15 | Frontend & UX: 10
- API Design: 5 | Documentation: 5 | Testing: 5
- Evaluators explicitly prioritize engineering quality, modular architecture, DB design, reliability, concurrency handling, observability, documentation, and maintainability over feature count.

## Tech stack (locked — do not change without asking)
- Backend: Node.js + Express (TypeScript)
- Database: PostgreSQL 16 (via Docker), migrations with node-pg-migrate or Prisma
- Frontend: React + Vite, polling-based live updates (NOT WebSockets — bonus only)
- Auth: JWT (access token only, keep simple)
- Containerization: Docker + docker-compose (API, worker, Postgres, frontend)
- CI: GitHub Actions (lint → test → docker build) — the user owns deployment/DevOps

## Core requirements (all must work)
1. Auth + project management; each project owns multiple job queues.
2. Queue config: priority, concurrency limits, retry policy, pause/resume, statistics.
3. Job types via REST: immediate, delayed, scheduled, recurring (cron), batch.
4. Worker service: polls queues, atomically claims jobs, executes concurrently,
   sends heartbeats, graceful shutdown (SIGTERM drains in-flight jobs).
5. Job lifecycle: Queued → Scheduled → Claimed → Running → Completed/Failed,
   with retries and Dead Letter Queue for permanent failures.
6. Retry strategies: fixed delay, linear backoff, exponential backoff (configurable per queue).
7. Persist execution logs, retry history, worker assignment, timestamps, metrics per job.
8. Dashboard: queue health, worker status, job explorer, execution logs,
   queue config UI, retry failed jobs button, throughput/health charts.

## Critical engineering decisions (follow these)
- Atomic job claiming: use `SELECT ... FOR UPDATE SKIP LOCKED` in a transaction.
  Never allow duplicate execution of the same job.
- Execution semantics: at-least-once delivery + idempotency keys on jobs.
- Worker heartbeats: table-based, every 10s; a reaper reclaims jobs from workers
  whose heartbeat is stale (>30s) by requeueing them.
- All state transitions must be recorded in a job_executions history table.
- Structured JSON logging everywhere; expose a /metrics endpoint (Prometheus format).

## Database entities (design full relational schema with indexes + FKs)
Users, Organizations, Projects, Queues, Jobs, JobExecutions, RetryPolicies,
Workers, WorkerHeartbeats, JobLogs, ScheduledJobs, DeadLetterQueue.
Document: PKs, FKs, indexes (especially on jobs(queue_id, status, run_at) for the
claim query), normalization choices, cascade behavior, performance considerations.

## Deliverables to generate
- Source code with a README containing setup instructions (docker compose up)
- Architecture diagram (Mermaid, in docs/architecture.md)
- ER diagram (Mermaid, in docs/er-diagram.md)
- API documentation (OpenAPI/Swagger, served at /api/docs)
- docs/design-decisions.md explaining major trade-offs
  (SKIP LOCKED vs Redis/message broker, polling vs WebSockets,
  at-least-once vs exactly-once, heartbeat-based failure detection)
- Tests (Jest + Supertest): atomic claiming under concurrency, retry/backoff logic,
  lifecycle transitions, DLQ routing, auth. Focus on critical paths, not coverage %.

## Out of scope (do NOT build unless explicitly asked)
Workflow dependencies, queue sharding, distributed locking beyond SKIP LOCKED,
event-driven execution, WebSockets, RBAC beyond basic auth, AI failure summaries.
Rate limiting is the ONLY bonus we may add at the end if time remains.

## Working style
- Work in small increments: schema → auth → queues/jobs CRUD → claiming/worker →
  retries/DLQ → scheduler → dashboard → tests → docs.
- After each increment, provide a one-line manual verification command (curl or npm script).
- Commit after each working increment with a descriptive message. Never push.
- Never read or write .env files; use .env.example with placeholders instead.
