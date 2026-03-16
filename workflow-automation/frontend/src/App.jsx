import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import Layout from './components/Layout';
import Spinner from './components/Spinner';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Workflows from './pages/Workflows';
import WorkflowBuilder from './pages/WorkflowBuilder';
import Executions from './pages/Executions';
import ExecutionLogs from './pages/ExecutionLogs';
import MetricsDashboard from './pages/MetricsDashboard';
import Templates from './pages/Templates';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)]"><Spinner size="lg" /></div>;
  return user ? <Layout>{children}</Layout> : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)]"><Spinner size="lg" /></div>;
  return user ? <Navigate to="/" replace /> : children;
};

function AppRoutes() {
  const { dark } = useTheme();
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: dark ? '#1e293b' : '#fff',
          color: dark ? '#f1f5f9' : '#0f172a',
          border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
          borderRadius: '10px',
          fontSize: '13px'
        }
      }}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/workflows" element={<ProtectedRoute><Workflows /></ProtectedRoute>} />
            <Route path="/workflows/:id" element={<ProtectedRoute><WorkflowBuilder /></ProtectedRoute>} />
            <Route path="/executions" element={<ProtectedRoute><Executions /></ProtectedRoute>} />
            <Route path="/executions/:id" element={<ProtectedRoute><ExecutionLogs /></ProtectedRoute>} />
            <Route path="/metrics" element={<ProtectedRoute><MetricsDashboard /></ProtectedRoute>} />
            <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
