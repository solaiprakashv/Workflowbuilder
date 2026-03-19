import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useState, useEffect } from 'react';
import { executionAPI } from '../services/api';
import {
  LayoutDashboard, GitBranch, Play, LogOut,
  Zap, Sun, Moon, BarChart2, LayoutTemplate, ChevronRight
} from 'lucide-react';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [runningCount, setRunningCount] = useState(0);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await executionAPI.list({ limit: 50 });
        setRunningCount(res.data.data.executions.filter((e) => e.status === 'in_progress').length);
      } catch {}
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, []);

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { path: '/workflows', label: 'Workflows', icon: GitBranch },
    { path: '/executions', label: 'Executions', icon: Play, badge: runningCount },
    { path: '/metrics', label: 'Metrics', icon: BarChart2 },
    { path: '/templates', label: 'Templates', icon: LayoutTemplate }
  ];

  const isActive = (path, exact) => exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <div className="flex h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Sidebar */}
      <aside className="w-60 flex flex-col shrink-0 border-r backdrop-blur-sm" style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--border)' }}>
        {/* Brand */}
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 via-violet-500 to-blue-500 rounded-lg flex items-center justify-center shadow-lg animate-float accent-glow">
              <Zap size={15} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-none">WorkflowOS</h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--sidebar-text)' }}>Automation Platform</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ path, label, icon: Icon, exact, badge }) => {
            const active = isActive(path, exact);
            return (
              <Link key={path} to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-md shadow-indigo-900/30'
                    : 'hover:bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span className="bg-gradient-to-r from-indigo-500 to-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center animate-pulse">
                    {badge}
                  </span>
                )}
                {active && !badge && <ChevronRight size={12} className="opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* New Workflow CTA */}
        <div className="px-3 pb-3">
          <Link to="/workflows/new"
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-blue-500 hover:from-indigo-400 hover:via-violet-400 hover:to-blue-400 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-indigo-900/30"
          >
            <GitBranch size={13} /> New Workflow
          </Link>
        </div>

        {/* User + theme */}
        <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white accent-glow">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
              <p className="text-xs truncate" style={{ color: 'var(--sidebar-text)' }}>{user?.email}</p>
            </div>
            <button onClick={toggle} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white" title="Toggle theme">
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
          <button onClick={() => { logout(); navigate('/login'); }}
            className="flex items-center gap-2 text-xs w-full py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors text-slate-500 hover:text-slate-300"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto page-enter">{children}</main>
    </div>
  );
}
