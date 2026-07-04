# Entity-Relationship Diagram

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ USERS : has
    ORGANIZATIONS ||--o{ PROJECTS : has
    ORGANIZATIONS ||--o{ RETRY_POLICIES : has
    PROJECTS ||--o{ QUEUES : has
    USERS ||--o{ PROJECTS : "created_by (nullable)"
    RETRY_POLICIES ||--o{ QUEUES : "used by"
    QUEUES ||--o{ JOBS : contains
    QUEUES ||--o{ SCHEDULED_JOBS : contains
    QUEUES ||--o{ DEAD_LETTER_QUEUE : contains
    SCHEDULED_JOBS ||--o{ JOBS : "materializes occurrences"
    JOBS ||--o{ JOBS : "parent_job_id (batch/recurring)"
    JOBS ||--o{ JOB_EXECUTIONS : "state-transition history"
    JOBS ||--o{ JOB_LOGS : "execution output"
    JOBS ||--o| DEAD_LETTER_QUEUE : "moved to (1:1)"
    WORKERS ||--o{ WORKER_HEARTBEATS : reports
    WORKERS ||--o{ JOBS : "claims (nullable FK)"
    WORKERS ||--o{ JOB_EXECUTIONS : "performs (nullable FK)"

    ORGANIZATIONS {
        uuid id PK
        text name UK
        timestamptz created_at
        timestamptz updated_at
    }
    USERS {
        uuid id PK
        uuid organization_id FK
        text email UK
        text password_hash
        text name
    }
    PROJECTS {
        uuid id PK
        uuid organization_id FK
        text name
        text description
        uuid created_by FK
    }
    RETRY_POLICIES {
        uuid id PK
        uuid organization_id FK
        text name
        text strategy "fixed|linear|exponential"
        int base_delay_ms
        int max_delay_ms
        numeric multiplier
        int max_retries
    }
    QUEUES {
        uuid id PK
        uuid project_id FK
        text name
        int priority
        int concurrency_limit
        uuid retry_policy_id FK
        boolean is_paused
    }
    WORKERS {
        uuid id PK
        text hostname
        int pid
        text status "online|draining|offline"
        int concurrency
        timestamptz last_heartbeat_at
        jsonb metadata
    }
    WORKER_HEARTBEATS {
        bigserial id PK
        uuid worker_id FK
        timestamptz reported_at
        int active_job_count
        float cpu_load
        int memory_mb
    }
    SCHEDULED_JOBS {
        uuid id PK
        uuid queue_id FK
        text name
        text cron_expression
        text timezone
        jsonb payload_template
        boolean is_enabled
        timestamptz next_run_at
        timestamptz last_run_at
    }
    JOBS {
        uuid id PK
        uuid queue_id FK
        uuid scheduled_job_id FK "nullable"
        uuid parent_job_id FK "nullable, self-ref"
        text job_type "immediate|delayed|scheduled|recurring|batch"
        text status "scheduled|queued|claimed|running|completed|failed|pending_retry|dead_lettered"
        int priority
        jsonb payload
        text idempotency_key "unique per queue"
        timestamptz run_at
        int retry_count
        uuid claimed_by_worker_id FK "nullable"
        text last_error
    }
    JOB_EXECUTIONS {
        uuid id PK
        uuid job_id FK
        int attempt_number
        text from_status "nullable"
        text to_status
        uuid worker_id FK "nullable"
        text reason
        jsonb metadata
        timestamptz occurred_at
    }
    JOB_LOGS {
        bigserial id PK
        uuid job_id FK
        uuid execution_id FK "nullable"
        text level "debug|info|warn|error"
        text message
        jsonb metadata
    }
    DEAD_LETTER_QUEUE {
        uuid id PK
        uuid job_id FK "unique, 1:1 with jobs"
        uuid queue_id FK
        text final_error
        int retry_count
        jsonb payload_snapshot
        boolean resolved
    }
```

## Notes on normalization and indexing

- **`scheduled_jobs` is a separate table from `jobs`**: it models a recurring
  *template* (cron expression, timezone, payload template, `next_run_at`) that
  spawns many `jobs` rows over time. A plain delayed/scheduled one-off job is just
  a `jobs` row with a future `run_at` — no separate table needed for that case.
- **`job_executions`** is the append-only state-transition audit trail (one row per
  transition). **`job_logs`** is a separate table for arbitrary handler-emitted log
  lines — a distinct concern from lifecycle transitions.
- **`workers.last_heartbeat_at`** is denormalized from `worker_heartbeats` (which
  keeps full history for health charts) so the reaper's "find stale workers" query
  is a single indexed column comparison, not an aggregate over a time-series table.
- **The composite index `jobs(queue_id, status, run_at)`** exists specifically for
  the claim query's `WHERE queue_id = $1 AND status = 'queued' AND run_at <= now()
  ORDER BY priority DESC, run_at ASC` — the hottest query path in the system.
- **Cascade behavior**: deleting an organization cascades through projects, queues,
  jobs, job_executions, job_logs, and dead_letter_queue. Deleting a `retry_policies`
  row is `ON DELETE RESTRICT` (a queue must always have a valid policy). Deleting a
  `workers` row sets `jobs.claimed_by_worker_id` / `job_executions.worker_id` to
  `NULL` rather than cascading, since job history must outlive the worker that ran
  it.
- **Enums are `CHECK` constraints**, not native Postgres `ENUM` types, so adding a
  new status later is `ALTER TABLE ... DROP/ADD CONSTRAINT`, not a type migration.
