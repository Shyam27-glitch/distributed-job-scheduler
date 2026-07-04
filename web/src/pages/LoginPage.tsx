import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(organizationName, email, password);
      }
      navigate('/projects');
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Something went wrong';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="content" style={{ maxWidth: 380, margin: '4rem auto' }}>
      <div className="card">
        <h1>{mode === 'login' ? 'Log in' : 'Register'}</h1>
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {mode === 'register' && (
            <label>
              Organization name
              <input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </label>
          {error && <div className="error-text">{error}</div>}
          <button className="primary" type="submit" disabled={submitting}>
            {mode === 'login' ? 'Log in' : 'Register'}
          </button>
        </form>
        <p className="muted" style={{ marginTop: '1rem' }}>
          {mode === 'login' ? (
            <>
              No account?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); }}>
                Register
              </a>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); }}>
                Log in
              </a>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
