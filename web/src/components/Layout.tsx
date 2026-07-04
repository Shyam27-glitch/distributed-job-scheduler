import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <nav className="nav">
        <strong>Job Scheduler</strong>
        <NavLink to="/projects">Projects</NavLink>
        <NavLink to="/retry-policies">Retry Policies</NavLink>
        <NavLink to="/workers">Workers</NavLink>
        <div className="spacer" />
        {user && <span className="muted" style={{ color: '#9ca3af' }}>{user.email}</span>}
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
        >
          Log out
        </button>
      </nav>
      <div className="content">
        <Outlet />
      </div>
    </div>
  );
}
