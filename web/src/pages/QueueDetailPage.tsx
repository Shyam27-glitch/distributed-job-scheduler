import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { StatusBadge } from '../components/StatusBadge';
import type { DeadLetterEntry, Job, JobStatus, Queue, QueueStats, RetryPolicy, ScheduledJob } from '../api/types';

function errorMessage(err: unknown): string {
  return (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Failed';
}

function QueueConfigCard({ queueId, queue, retryPolicies, onSaved }: {
  queueId: string;
  queue: Queue;
  retryPolicies: RetryPolicy[] | null;
  onSaved: () => Promise<void>;
}) {
  const [priority, setPriority] = useState(queue.priority);
  const [concurrencyLimit, setConcurrencyLimit] = useState(queue.concurrencyLimit);
  const [retryPolicyId, setRetryPolicyId] = useState(queue.retryPolicyId);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    try {
      await apiClient.patch(`/api/queues/${queueId}`, { priority, concurrencyLimit, retryPolicyId });
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const togglePause = async () => {
    setError(null);
    try {
      await apiClient.patch(`/api/queues/${queueId}`, { isPaused: !queue.isPaused });
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="card">
      <h2>Queue config</h2>
      <form className="inline" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <label>
          Priority
          <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
        </label>
        <label>
          Concurrency limit
          <input
            type="number"
            value={concurrencyLimit}
            onChange={(e) => setConcurrencyLimit(Number(e.target.value))}
            min={1}
          />
        </label>
        <label>
          Retry policy
          <select value={retryPolicyId} onChange={(e) => setRetryPolicyId(e.target.value)}>
            {retryPolicies?.map((rp) => (
              <option key={rp.id} value={rp.id}>
                {rp.name} ({rp.strategy})
              </option>
            ))}
          </select>
        </label>
        <button className="primary" type="submit">
          Save
        </button>
        <button type="button" className={queue.isPaused ? 'primary' : 'secondary'} onClick={() => void togglePause()}>
          {queue.isPaused ? 'Resume queue' : 'Pause queue'}
        </button>
      </form>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

function QueueStatsCard({ stats }: { stats: QueueStats | null }) {
  const entries = Object.entries(stats?.counts ?? {});
  const max = Math.max(1, ...entries.map(([, count]) => count));

  return (
    <div className="card">
      <h2>Job counts by status ({stats?.total ?? 0} total)</h2>
      <div className="bar-chart">
        {entries.map(([status, count]) => (
          <div className="bar-col" key={status}>
            <div>{count}</div>
            <div className="bar" style={{ height: `${(count / max) * 90 + 4}px` }} />
            <div>{status.replace('_', ' ')}</div>
          </div>
        ))}
        {entries.length === 0 && <div className="muted">No jobs yet.</div>}
      </div>
    </div>
  );
}

function CreateJobCard({ queueId, onCreated }: { queueId: string; onCreated: () => Promise<void> }) {
  const [jobType, setJobType] = useState<'immediate' | 'delayed' | 'scheduled'>('immediate');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [payload, setPayload] = useState('{}');
  const [delayMs, setDelayMs] = useState(5000);
  const [runAt, setRunAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let parsedPayload: Record<string, unknown>;
    try {
      parsedPayload = JSON.parse(payload || '{}');
    } catch {
      setError('Payload must be valid JSON');
      return;
    }
    try {
      await apiClient.post(`/api/queues/${queueId}/jobs`, {
        jobType,
        idempotencyKey,
        payload: parsedPayload,
        ...(jobType === 'delayed' ? { delayMs } : {}),
        ...(jobType === 'scheduled' ? { runAt: new Date(runAt).toISOString() } : {}),
      });
      setIdempotencyKey('');
      await onCreated();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="card">
      <h2>Create job</h2>
      <form className="inline" onSubmit={onSubmit}>
        <label>
          Type
          <select value={jobType} onChange={(e) => setJobType(e.target.value as typeof jobType)}>
            <option value="immediate">immediate</option>
            <option value="delayed">delayed</option>
            <option value="scheduled">scheduled</option>
          </select>
        </label>
        <label>
          Idempotency key
          <input value={idempotencyKey} onChange={(e) => setIdempotencyKey(e.target.value)} required />
        </label>
        {jobType === 'delayed' && (
          <label>
            Delay (ms)
            <input type="number" value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))} min={1} />
          </label>
        )}
        {jobType === 'scheduled' && (
          <label>
            Run at
            <input type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)} required />
          </label>
        )}
        <label style={{ minWidth: 220 }}>
          Payload (JSON)
          <input value={payload} onChange={(e) => setPayload(e.target.value)} />
        </label>
        <button className="primary" type="submit">
          Create
        </button>
      </form>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

function JobsCard({ queueId }: { queueId: string }) {
  const [status, setStatus] = useState<JobStatus | ''>('');

  const { data: jobs, refetch } = usePolling(
    async () =>
      (
        await apiClient.get<{ jobs: Job[] }>(`/api/queues/${queueId}/jobs`, {
          params: status ? { status, limit: 100 } : { limit: 100 },
        })
      ).data.jobs,
    3000,
    [queueId, status],
  );

  return (
    <div className="card">
      <h2>Jobs</h2>
      <div className="inline" style={{ marginBottom: '0.5rem' }}>
        <label>
          Filter by status
          <select value={status} onChange={(e) => setStatus(e.target.value as JobStatus | '')}>
            <option value="">all</option>
            {['scheduled', 'queued', 'claimed', 'running', 'completed', 'failed', 'pending_retry', 'dead_lettered'].map(
              (s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ),
            )}
          </select>
        </label>
        <button className="secondary" type="button" onClick={() => void refetch()}>
          Refresh
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Idempotency key</th>
            <th>Type</th>
            <th>Status</th>
            <th>Retries</th>
            <th>Run at</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {jobs?.map((j) => (
            <tr key={j.id}>
              <td>{j.idempotencyKey}</td>
              <td>{j.jobType}</td>
              <td>
                <StatusBadge status={j.status} />
              </td>
              <td>{j.retryCount}</td>
              <td className="muted">{new Date(j.runAt).toLocaleString()}</td>
              <td>
                <Link to={`/jobs/${j.id}`}>Details →</Link>
              </td>
            </tr>
          ))}
          {jobs && jobs.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No jobs match this filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ScheduledJobsCard({ queueId }: { queueId: string }) {
  const [name, setName] = useState('');
  const [cronExpression, setCronExpression] = useState('*/5 * * * *');
  const [payloadTemplate, setPayloadTemplate] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  const { data: scheduledJobs, refetch } = usePolling(
    async () =>
      (await apiClient.get<{ scheduledJobs: ScheduledJob[] }>(`/api/queues/${queueId}/scheduled-jobs`)).data
        .scheduledJobs,
    5000,
    [queueId],
  );

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let parsedPayload: Record<string, unknown>;
    try {
      parsedPayload = JSON.parse(payloadTemplate || '{}');
    } catch {
      setError('Payload template must be valid JSON');
      return;
    }
    try {
      await apiClient.post(`/api/queues/${queueId}/scheduled-jobs`, {
        name,
        cronExpression,
        payloadTemplate: parsedPayload,
      });
      setName('');
      await refetch();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const toggleEnabled = async (sj: ScheduledJob) => {
    await apiClient.patch(`/api/scheduled-jobs/${sj.id}`, { isEnabled: !sj.isEnabled });
    await refetch();
  };

  return (
    <div className="card">
      <h2>Recurring (cron) jobs</h2>
      <form className="inline" onSubmit={onCreate}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Cron expression
          <input value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} required />
        </label>
        <label style={{ minWidth: 200 }}>
          Payload template (JSON)
          <input value={payloadTemplate} onChange={(e) => setPayloadTemplate(e.target.value)} />
        </label>
        <button className="primary" type="submit">
          Create
        </button>
      </form>
      {error && <div className="error-text">{error}</div>}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Cron</th>
            <th>Next run</th>
            <th>Last run</th>
            <th>Enabled</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {scheduledJobs?.map((sj) => (
            <tr key={sj.id}>
              <td>{sj.name}</td>
              <td>
                <code>{sj.cronExpression}</code> ({sj.timezone})
              </td>
              <td className="muted">{new Date(sj.nextRunAt).toLocaleString()}</td>
              <td className="muted">{sj.lastRunAt ? new Date(sj.lastRunAt).toLocaleString() : '—'}</td>
              <td>{sj.isEnabled ? 'Yes' : 'No'}</td>
              <td>
                <button className="secondary" type="button" onClick={() => void toggleEnabled(sj)}>
                  {sj.isEnabled ? 'Disable' : 'Enable'}
                </button>
              </td>
            </tr>
          ))}
          {scheduledJobs && scheduledJobs.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No recurring jobs yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DeadLetterCard({ queueId }: { queueId: string }) {
  const { data, refetch } = usePolling(
    async () =>
      (await apiClient.get<{ deadLetterEntries: DeadLetterEntry[] }>(`/api/queues/${queueId}/dead-letter`)).data
        .deadLetterEntries,
    5000,
    [queueId],
  );

  const retry = async (jobId: string) => {
    await apiClient.post(`/api/jobs/${jobId}/retry`);
    await refetch();
  };

  const unresolved = data?.filter((e) => !e.resolved) ?? [];

  return (
    <div className="card">
      <h2>Dead letter queue ({unresolved.length} unresolved)</h2>
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Error</th>
            <th>Retries used</th>
            <th>Moved at</th>
            <th>Resolved</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.map((entry) => (
            <tr key={entry.id}>
              <td>
                <Link to={`/jobs/${entry.jobId}`}>{entry.jobId.slice(0, 8)}…</Link>
              </td>
              <td className="muted">{entry.finalError ?? '—'}</td>
              <td>{entry.retryCount}</td>
              <td className="muted">{new Date(entry.movedAt).toLocaleString()}</td>
              <td>{entry.resolved ? 'Yes' : 'No'}</td>
              <td>
                {!entry.resolved && (
                  <button className="danger" type="button" onClick={() => void retry(entry.jobId)}>
                    Retry failed job
                  </button>
                )}
              </td>
            </tr>
          ))}
          {data && data.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                Nothing here — no jobs have been dead-lettered.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function QueueDetailPage() {
  const { queueId } = useParams<{ queueId: string }>();

  const { data: queue, refetch: refetchQueue } = usePolling(
    async () => (await apiClient.get<Queue>(`/api/queues/${queueId}`)).data,
    5000,
    [queueId],
  );

  const { data: stats } = usePolling(
    async () => (await apiClient.get<QueueStats>(`/api/queues/${queueId}/stats`)).data,
    3000,
    [queueId],
  );

  const { data: retryPolicies } = usePolling(
    async () => (await apiClient.get<{ retryPolicies: RetryPolicy[] }>('/api/retry-policies')).data.retryPolicies,
    10000,
  );

  if (!queue || !queueId) return <p className="muted">Loading…</p>;

  return (
    <div>
      <p>
        <Link to={`/projects/${queue.projectId}`}>← Queues</Link>
      </p>
      <h1>{queue.name}</h1>

      <QueueConfigCard queueId={queueId} queue={queue} retryPolicies={retryPolicies} onSaved={refetchQueue} />
      <QueueStatsCard stats={stats} />
      <CreateJobCard queueId={queueId} onCreated={async () => {}} />
      <JobsCard queueId={queueId} />
      <ScheduledJobsCard queueId={queueId} />
      <DeadLetterCard queueId={queueId} />
    </div>
  );
}
