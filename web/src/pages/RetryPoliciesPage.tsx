import { useState } from 'react';
import { apiClient } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import type { RetryPolicy } from '../api/types';

export function RetryPoliciesPage() {
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState<'fixed' | 'linear' | 'exponential'>('fixed');
  const [baseDelayMs, setBaseDelayMs] = useState(1000);
  const [maxRetries, setMaxRetries] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const { data, refetch } = usePolling(
    async () => (await apiClient.get<{ retryPolicies: RetryPolicy[] }>('/api/retry-policies')).data.retryPolicies,
    8000,
  );

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post('/api/retry-policies', { name, strategy, baseDelayMs, maxRetries });
      setName('');
      await refetch();
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Failed';
      setError(message);
    }
  };

  return (
    <div>
      <h1>Retry Policies</h1>
      <p className="muted">Queues reference one of these to configure their backoff strategy.</p>

      <div className="card">
        <h2>New retry policy</h2>
        <form className="inline" onSubmit={onCreate}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Strategy
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)}>
              <option value="fixed">fixed</option>
              <option value="linear">linear</option>
              <option value="exponential">exponential</option>
            </select>
          </label>
          <label>
            Base delay (ms)
            <input
              type="number"
              value={baseDelayMs}
              onChange={(e) => setBaseDelayMs(Number(e.target.value))}
              min={1}
            />
          </label>
          <label>
            Max retries
            <input type="number" value={maxRetries} onChange={(e) => setMaxRetries(Number(e.target.value))} min={0} />
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
              <th>Strategy</th>
              <th>Base delay</th>
              <th>Max delay</th>
              <th>Multiplier</th>
              <th>Max retries</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((rp) => (
              <tr key={rp.id}>
                <td>{rp.name}</td>
                <td>{rp.strategy}</td>
                <td>{rp.baseDelayMs}ms</td>
                <td>{rp.maxDelayMs}ms</td>
                <td>{rp.multiplier}x</td>
                <td>{rp.maxRetries}</td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No retry policies yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
