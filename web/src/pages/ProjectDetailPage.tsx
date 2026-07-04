import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import type { Queue, RetryPolicy } from '../api/types';

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(0);
  const [concurrencyLimit, setConcurrencyLimit] = useState(5);
  const [retryPolicyId, setRetryPolicyId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: queues, refetch } = usePolling(
    async () => (await apiClient.get<{ queues: Queue[] }>(`/api/projects/${projectId}/queues`)).data.queues,
    5000,
    [projectId],
  );

  const { data: retryPolicies } = usePolling(
    async () => (await apiClient.get<{ retryPolicies: RetryPolicy[] }>('/api/retry-policies')).data.retryPolicies,
    10000,
  );

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!retryPolicyId) {
      setError('Select a retry policy (create one on the Retry Policies page if none exist).');
      return;
    }
    try {
      await apiClient.post(`/api/projects/${projectId}/queues`, {
        name,
        priority,
        concurrencyLimit,
        retryPolicyId,
      });
      setName('');
      await refetch();
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Failed';
      setError(message);
    }
  };

  return (
    <div>
      <p>
        <Link to="/projects">← Projects</Link>
      </p>
      <h1>Queues</h1>

      <div className="card">
        <h2>New queue</h2>
        <form className="inline" onSubmit={onCreate}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
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
              <option value="">Select…</option>
              {retryPolicies?.map((rp) => (
                <option key={rp.id} value={rp.id}>
                  {rp.name} ({rp.strategy})
                </option>
              ))}
            </select>
          </label>
          <button className="primary" type="submit">
            Create
          </button>
        </form>
        {error && <div className="error-text">{error}</div>}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Priority</th>
              <th>Concurrency</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {queues?.map((q) => (
              <tr key={q.id}>
                <td>{q.name}</td>
                <td>{q.priority}</td>
                <td>{q.concurrencyLimit}</td>
                <td>{q.isPaused ? 'Paused' : 'Active'}</td>
                <td>
                  <Link to={`/queues/${q.id}`}>Manage →</Link>
                </td>
              </tr>
            ))}
            {queues && queues.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No queues yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
