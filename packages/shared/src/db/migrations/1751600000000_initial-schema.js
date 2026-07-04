exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    -- Organizations / Users / Projects
    CREATE TABLE organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_users_org ON users(organization_id);

    CREATE TABLE projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(organization_id, name)
    );
    CREATE INDEX idx_projects_org ON projects(organization_id);

    -- Retry Policies / Queues
    CREATE TABLE retry_policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      strategy TEXT NOT NULL CHECK (strategy IN ('fixed','linear','exponential')),
      base_delay_ms INT NOT NULL DEFAULT 1000 CHECK (base_delay_ms > 0),
      max_delay_ms INT NOT NULL DEFAULT 3600000 CHECK (max_delay_ms >= base_delay_ms),
      multiplier NUMERIC(5,2) NOT NULL DEFAULT 2.0 CHECK (multiplier > 0),
      max_retries INT NOT NULL DEFAULT 3 CHECK (max_retries >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_retry_policies_org ON retry_policies(organization_id);

    CREATE TABLE queues (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      priority INT NOT NULL DEFAULT 0,
      concurrency_limit INT NOT NULL DEFAULT 5 CHECK (concurrency_limit > 0),
      retry_policy_id UUID NOT NULL REFERENCES retry_policies(id) ON DELETE RESTRICT,
      is_paused BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(project_id, name)
    );
    CREATE INDEX idx_queues_project ON queues(project_id);

    -- Workers / Heartbeats
    CREATE TABLE workers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      hostname TEXT NOT NULL,
      pid INT,
      status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online','draining','offline')),
      concurrency INT NOT NULL DEFAULT 5 CHECK (concurrency > 0),
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_heartbeat_at TIMESTAMPTZ,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_workers_stale ON workers(status, last_heartbeat_at);

    CREATE TABLE worker_heartbeats (
      id BIGSERIAL PRIMARY KEY,
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      active_job_count INT NOT NULL DEFAULT 0,
      cpu_load DOUBLE PRECISION,
      memory_mb INT
    );
    CREATE INDEX idx_heartbeats_worker_time ON worker_heartbeats(worker_id, reported_at DESC);

    -- Scheduled Jobs (recurring templates)
    CREATE TABLE scheduled_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      payload_template JSONB NOT NULL DEFAULT '{}',
      priority INT NOT NULL DEFAULT 0,
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      next_run_at TIMESTAMPTZ NOT NULL,
      last_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_scheduled_jobs_due ON scheduled_jobs(is_enabled, next_run_at);

    -- Jobs
    CREATE TABLE jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
      scheduled_job_id UUID REFERENCES scheduled_jobs(id) ON DELETE SET NULL,
      parent_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
      job_type TEXT NOT NULL CHECK (job_type IN ('immediate','delayed','scheduled','recurring','batch')),
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN
        ('scheduled','queued','claimed','running','completed','failed','pending_retry','dead_lettered')),
      priority INT NOT NULL DEFAULT 0,
      payload JSONB NOT NULL DEFAULT '{}',
      idempotency_key TEXT NOT NULL,
      run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      retry_count INT NOT NULL DEFAULT 0,
      claimed_by_worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
      claimed_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(queue_id, idempotency_key)
    );
    CREATE INDEX idx_jobs_queue_status_runat ON jobs(queue_id, status, run_at);
    CREATE INDEX idx_jobs_status ON jobs(status);
    CREATE INDEX idx_jobs_claimed_worker ON jobs(claimed_by_worker_id);
    CREATE INDEX idx_jobs_parent ON jobs(parent_job_id);
    CREATE INDEX idx_jobs_scheduled_job ON jobs(scheduled_job_id);

    -- Job Executions (state-transition audit trail)
    CREATE TABLE job_executions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      attempt_number INT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL CHECK (to_status IN
        ('scheduled','queued','claimed','running','completed','failed','pending_retry','dead_lettered')),
      worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
      reason TEXT,
      metadata JSONB,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_executions_job_time ON job_executions(job_id, occurred_at);
    CREATE INDEX idx_executions_worker ON job_executions(worker_id);

    -- Job Logs (execution output, not state transitions)
    CREATE TABLE job_logs (
      id BIGSERIAL PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      execution_id UUID REFERENCES job_executions(id) ON DELETE CASCADE,
      level TEXT NOT NULL CHECK (level IN ('debug','info','warn','error')),
      message TEXT NOT NULL,
      metadata JSONB,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_job_logs_job_time ON job_logs(job_id, logged_at);

    -- Dead Letter Queue
    CREATE TABLE dead_letter_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
      queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
      final_error TEXT,
      retry_count INT NOT NULL,
      payload_snapshot JSONB NOT NULL,
      resolved BOOLEAN NOT NULL DEFAULT false,
      resolved_at TIMESTAMPTZ,
      moved_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_dlq_queue ON dead_letter_queue(queue_id, resolved);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS
      dead_letter_queue,
      job_logs,
      job_executions,
      jobs,
      scheduled_jobs,
      worker_heartbeats,
      workers,
      queues,
      retry_policies,
      projects,
      users,
      organizations
    CASCADE;
  `);
};
