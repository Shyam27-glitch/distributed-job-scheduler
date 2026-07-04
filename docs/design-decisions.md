# Design Decisions

## SKIP LOCKED vs. a message broker (Redis/SQS/RabbitMQ)

**Chosen: `SELECT ... FOR UPDATE SKIP LOCKED` directly against Postgres.**

A message broker (Redis Streams/BullMQ, SQS, RabbitMQ) would offload queueing
concerns from the database, but it introduces a second stateful system that must
stay consistent with the relational data (queues, retry policies, job history) —
either via dual writes or an outbox pattern, both of which add real operational
and correctness complexity for a scheduler that already needs Postgres as the
system of record for configuration, history, and DLQ entries.

`FOR UPDATE SKIP LOCKED` gives the one guarantee that actually matters here — two
workers racing the same query never lock/return the same row — using
infrastructure the project already has. The trade-off is throughput ceiling: this
approach comfortably handles thousands of jobs/sec on a single Postgres instance
but doesn't horizontally shard the way a dedicated broker would at very large
scale. For an assignment-scoped scheduler (single Postgres instance, a handful of
worker replicas), that ceiling is far above the actual load, so the simpler
single-system design wins. Queue sharding and a message broker are explicitly out
of scope (see CLAUDE.md).

## Polling vs. WebSockets for the dashboard

**Chosen: polling on an interval (no WebSockets).**

The dashboard's data (queue stats, worker status, job lists) changes on the order
of seconds, not milliseconds, and every value already has a natural "pull" model:
a `GET` that reflects current state. WebSockets would require a persistent
connection layer, reconnect/backoff handling, and a way to push invalidations from
the API/worker to connected clients — meaningful additional infrastructure for a
UX improvement (lower latency updates) that isn't the grading priority here.
Polling with a `usePolling` hook and a sane interval (a few seconds) gives
"live-ish" updates with a fraction of the complexity, and is explicitly the
required approach per project scope (WebSockets are bonus-only, out of scope).

## At-least-once delivery vs. exactly-once

**Chosen: at-least-once delivery, with idempotency keys as the safety net.**

Exactly-once execution is not achievable in a system where a worker can crash
mid-handler with no way to atomically couple "job succeeded" with "handler side
effects committed" (the two-generals problem, applied to job execution). Instead:

- Every job has a unique `idempotency_key` per queue (enforced by
  `UNIQUE(queue_id, idempotency_key)`).
- The heartbeat reaper reclaims jobs from workers that stop heartbeating, which
  can — in the worst case (a worker that is merely slow, not dead, e.g. paused by
  the OS) — cause the same job to be picked up and run a second time.
- The system's guarantee is therefore **at-least-once**: a job may run more than
  once under worker failure, but never zero times, and callers are expected to
  write idempotent handlers (or use the idempotency key to dedupe on their side).

This is the standard trade-off for durable job queues (SQS, Sidekiq, Celery all
make the same choice) and is far simpler than building distributed consensus for
exactly-once semantics that the assignment doesn't call for.

## Heartbeat-based failure detection vs. lease/visibility-timeout-per-job

**Chosen: worker-level heartbeats (table-based, every 10s) + a reaper that reclaims
all of a stale worker's jobs at once, rather than a per-job visibility timeout.**

A per-job lease (like SQS's visibility timeout) requires each long-running job to
either finish within the lease window or actively renew it, which couples the
worker's job-execution loop to lease-renewal logic for every single job. A
worker-level heartbeat decouples "is this worker alive" from "how long will this
particular job take" — a worker can run jobs of any duration as long as it keeps
heartbeating, and if it dies, *all* of its in-flight jobs are reclaimed together
in one reaper pass. This matches the mandated design: heartbeats every 10s,
reclaim after a 30s stale threshold, both configurable.

The reaper query is itself `FOR UPDATE SKIP LOCKED`, so every worker instance can
run its own reaper tick independently and concurrently with no leader election —
consistent with "no distributed locking beyond SKIP LOCKED."

## Other notable decisions

- **node-pg-migrate over Prisma** for migrations: the claim query is raw SQL
  either way (`FOR UPDATE SKIP LOCKED` isn't expressible through Prisma's query
  builder), so an ORM's schema DSL and codegen step add ceremony without
  simplifying the one query that matters most.
- **Worker is a separate deployable service**, not a mode of the API process,
  sharing a `packages/shared` workspace package for DB access, types, and logging.
  This matches the docker-compose requirement (api/worker/postgres/web as
  independent containers) and lets the worker scale/restart/crash independently
  of HTTP traffic.
- **`docker compose stop`'s default grace period must exceed `DRAIN_TIMEOUT_MS`.**
  Discovered while testing graceful shutdown: the worker's drain logic (stop
  claiming, let in-flight jobs finish, mark itself offline) worked correctly, but
  the default Docker stop timeout was shorter than in-flight job runtime and
  SIGKILLed the container mid-drain (exit 137), silently losing the graceful
  shutdown entirely. Fixed by setting `stop_grace_period: 30s` (comfortably above
  `DRAIN_TIMEOUT_MS`) on the worker service in `docker-compose.yml`.
- **The DLQ insert is an upsert (`ON CONFLICT (job_id) DO UPDATE`), not a plain
  insert.** A job can be manually retried after being dead-lettered and then fail
  all its retries again; a plain insert would hit `dead_letter_queue.job_id`'s
  unique constraint on the second dead-lettering. Found via testing the manual
  retry endpoint end-to-end and fixed alongside making the worker's failure path
  crash-proof (a secondary error there must never crash the whole process via an
  unhandled promise rejection — see `worker/src/poller.ts`).
- **Enums as `CHECK` constraints, not native Postgres `ENUM` types** — adding a new
  status later is `ALTER TABLE ... DROP/ADD CONSTRAINT`, not a type migration.
