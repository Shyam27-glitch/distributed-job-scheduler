import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { StatusBadge } from '../components/StatusBadge';
import type { Job, JobExecution } from '../api/types';

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();

  const { data: job } = usePolling(async () => (await apiClient.get<Job>(`/api/jobs/${jobId}`)).data, 3000, [jobId]);

  const { data: executions } = usePolling(
    async () =>
      (await apiClient.get<{ executions: JobExecution[] }>(`/api/jobs/${jobId}/executions`)).data.executions,
    3000,
    [jobId],
  );

  if (!job) return <p className="muted">Loading…</p>;

  return (
    <div>
      <p>
        <Link to={`/queues/${job.queueId}`}>← Queue</Link>
      </p>
      <h1>
        Job <code>{job.idempotencyKey}</code>
      </h1>

      <div className="card">
        <h2>Details</h2>
        <table>
          <tbody>
            <tr>
              <th>Status</th>
              <td>
                <StatusBadge status={job.status} />
              </td>
            </tr>
            <tr>
              <th>Type</th>
              <td>{job.jobType}</td>
            </tr>
            <tr>
              <th>Priority</th>
              <td>{job.priority}</td>
            </tr>
            <tr>
              <th>Retry count</th>
              <td>{job.retryCount}</td>
            </tr>
            <tr>
              <th>Run at</th>
              <td>{new Date(job.runAt).toLocaleString()}</td>
            </tr>
            <tr>
              <th>Claimed by worker</th>
              <td className="muted">{job.claimedByWorkerId ?? '—'}</td>
            </tr>
            <tr>
              <th>Last error</th>
              <td className="error-text">{job.lastError ?? '—'}</td>
            </tr>
            <tr>
              <th>Payload</th>
              <td>
                <pre style={{ margin: 0 }}>{JSON.stringify(job.payload, null, 2)}</pre>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Execution history</h2>
        <table>
          <thead>
            <tr>
              <th>Attempt</th>
              <th>Transition</th>
              <th>Reason</th>
              <th>Worker</th>
              <th>Occurred at</th>
            </tr>
          </thead>
          <tbody>
            {executions?.map((e) => (
              <tr key={e.id}>
                <td>{e.attemptNumber}</td>
                <td>
                  {e.fromStatus ?? '(created)'} → {e.toStatus}
                </td>
                <td className="muted">{e.reason ?? '—'}</td>
                <td className="muted">{e.workerId ? e.workerId.slice(0, 8) + '…' : '—'}</td>
                <td className="muted">{new Date(e.occurredAt).toLocaleString()}</td>
              </tr>
            ))}
            {executions && executions.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No execution history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
