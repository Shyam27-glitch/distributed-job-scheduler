export const JOB_TYPES = ['immediate', 'delayed', 'scheduled', 'recurring', 'batch'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = [
  'scheduled',
  'queued',
  'claimed',
  'running',
  'completed',
  'failed',
  'pending_retry',
  'dead_lettered',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const RETRY_STRATEGIES = ['fixed', 'linear', 'exponential'] as const;
export type RetryStrategy = (typeof RETRY_STRATEGIES)[number];

export const WORKER_STATUSES = ['online', 'draining', 'offline'] as const;
export type WorkerStatus = (typeof WORKER_STATUSES)[number];

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type JobLogLevel = (typeof LOG_LEVELS)[number];

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RetryPolicy {
  id: string;
  organizationId: string;
  name: string;
  strategy: RetryStrategy;
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

export interface Queue {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  priority: number;
  concurrencyLimit: number;
  retryPolicyId: string;
  isPaused: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Worker {
  id: string;
  hostname: string;
  pid: number | null;
  status: WorkerStatus;
  concurrency: number;
  startedAt: string;
  lastHeartbeatAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledJob {
  id: string;
  queueId: string;
  name: string;
  cronExpression: string;
  timezone: string;
  payloadTemplate: Record<string, unknown>;
  priority: number;
  isEnabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Job {
  id: string;
  queueId: string;
  scheduledJobId: string | null;
  parentJobId: string | null;
  jobType: JobType;
  status: JobStatus;
  priority: number;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  runAt: string;
  retryCount: number;
  claimedByWorkerId: string | null;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobExecution {
  id: string;
  jobId: string;
  attemptNumber: number;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  workerId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

export interface JobLog {
  id: number;
  jobId: string;
  executionId: string | null;
  level: JobLogLevel;
  message: string;
  metadata: Record<string, unknown> | null;
  loggedAt: string;
}

export interface DeadLetterEntry {
  id: string;
  jobId: string;
  queueId: string;
  finalError: string | null;
  retryCount: number;
  payloadSnapshot: Record<string, unknown>;
  resolved: boolean;
  resolvedAt: string | null;
  movedAt: string;
}
