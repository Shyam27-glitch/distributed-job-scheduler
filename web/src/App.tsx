import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { QueueDetailPage } from './pages/QueueDetailPage';
import { JobDetailPage } from './pages/JobDetailPage';
import { WorkersPage } from './pages/WorkersPage';
import { RetryPoliciesPage } from './pages/RetryPoliciesPage';

function ProtectedLayout() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/queues/:queueId" element={<QueueDetailPage />} />
        <Route path="/jobs/:jobId" element={<JobDetailPage />} />
        <Route path="/workers" element={<WorkersPage />} />
        <Route path="/retry-policies" element={<RetryPoliciesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
