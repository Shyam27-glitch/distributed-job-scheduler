export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RetryPolicy {
  id: string;
  organizationId: string;
  name: string;
  strategy: 'fixed' | 'linear' | 'exponential';
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  maxRetries: number;
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
}

export interface QueueStats {
  queueId: string;
  counts: Record<string, number>;
  total: number;
}

export type JobStatus =
  | 'scheduled'
  | 'queued'
  | 'claimed'
  | 'running'
  | 'completed'
  | 'failed'
  | 'pending_retry'
  | 'dead_lettered';

export interface Job {
  id: string;
  queueId: string;
  scheduledJobId: string | null;
  parentJobId: string | null;
  jobType: 'immediate' | 'delayed' | 'scheduled' | 'recurring' | 'batch';
  status: JobStatus;
  priority: number;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  runAt: string;
  retryCount: number;
  claimedByWorkerId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobExecution {
  id: string;
  jobId: string;
  attemptNumber: number;
  fromStatus: string | null;
  toStatus: string;
  workerId: string | null;
  reason: string | null;
  occurredAt: string;
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
}

export interface DeadLetterEntry {
  id: string;
  jobId: string;
  queueId: string;
  finalError: string | null;
  retryCount: number;
  resolved: boolean;
  movedAt: string;
}

export interface Worker {
  id: string;
  hostname: string;
  pid: number | null;
  status: 'online' | 'draining' | 'offline';
  concurrency: number;
  startedAt: string;
  lastHeartbeatAt: string | null;
}
