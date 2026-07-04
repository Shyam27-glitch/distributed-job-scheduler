import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import type { Project } from '../api/types';

export function ProjectsPage() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, refetch } = usePolling(
    async () => (await apiClient.get<{ projects: Project[] }>('/api/projects')).data.projects,
    5000,
  );

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post('/api/projects', { name, description: description || undefined });
      setName('');
      setDescription('');
      await refetch();
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Failed';
      setError(message);
    }
  };

  return (
    <div>
      <h1>Projects</h1>

      <div className="card">
        <h2>New project</h2>
        <form className="inline" onSubmit={onCreate}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
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
              <th>Description</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="muted">{p.description ?? '—'}</td>
                <td className="muted">{new Date(p.createdAt).toLocaleString()}</td>
                <td>
                  <Link to={`/projects/${p.id}`}>View queues →</Link>
                </td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No projects yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
