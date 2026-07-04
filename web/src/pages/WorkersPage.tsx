import { apiClient } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { StatusBadge } from '../components/StatusBadge';
import type { Worker } from '../api/types';

function secondsAgo(iso: string | null): string {
  if (!iso) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return `${seconds}s ago`;
}

export function WorkersPage() {
  const { data } = usePolling(
    async () => (await apiClient.get<{ workers: Worker[] }>('/api/workers')).data.workers,
    3000,
  );

  const online = data?.filter((w) => w.status === 'online').length ?? 0;

  return (
    <div>
      <h1>Workers</h1>

      <div className="stat-row" style={{ marginBottom: '1rem' }}>
        <div className="stat-tile">
          <div className="value">{data?.length ?? '—'}</div>
          <div className="label">Total workers</div>
        </div>
        <div className="stat-tile">
          <div className="value">{online}</div>
          <div className="label">Online</div>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Hostname</th>
              <th>Status</th>
              <th>Concurrency</th>
              <th>Last heartbeat</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((w) => (
              <tr key={w.id}>
                <td>{w.hostname}</td>
                <td>
                  <StatusBadge status={w.status} />
                </td>
                <td>{w.concurrency}</td>
                <td className="muted">{secondsAgo(w.lastHeartbeatAt)}</td>
                <td className="muted">{new Date(w.startedAt).toLocaleString()}</td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No workers registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
