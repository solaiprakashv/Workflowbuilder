import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { workflowAPI, executionAPI } from '../services/api';
import { GitBranch, Play, CheckCircle, XCircle, Clock, Plus, TrendingUp, Activity, ArrowRight } from 'lucide-react';
import Spinner from '../components/Spinner';
import ExecuteModal from '../components/ExecuteModal';
import toast from 'react-hot-toast';

const StatCard = ({ label, value, icon: Icon, color, sub }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-all page-enter">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
    </div>
  </div>
);

const statusColor = {
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  in_progress: 'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-700',
  canceled: 'bg-gray-100 text-gray-600'
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ workflows: 0, active: 0, executions: 0, completed: 0, failed: 0, in_progress: 0 });
  const [recentExecutions, setRecentExecutions] = useState([]);
  const [recentWorkflows, setRecentWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [executeTarget, setExecuteTarget] = useState(null);

  useEffect(() => {
    Promise.all([
      workflowAPI.list({ limit: 5 }),
      executionAPI.list({ limit: 10 })
    ]).then(([wfRes, exRes]) => {
      const wfs = {
        workflows: wfRes.data.data || [],
        total: wfRes.data.total || 0
      };
      const exs = exRes.data.data.executions;
      setStats({
        workflows: wfs.total,
        active: wfs.workflows.filter((w) => w.is_active).length,
        executions: exRes.data.data.total,
        completed: exs.filter((e) => e.status === 'completed').length,
        failed: exs.filter((e) => e.status === 'failed').length,
        in_progress: exs.filter((e) => e.status === 'in_progress').length
      });
      setRecentExecutions(exs.slice(0, 6));
      setRecentWorkflows(wfs.workflows);
    }).catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Spinner size="lg" />
    </div>
  );

  return (
    <div className="p-8 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Overview of your workflow automation platform</p>
        </div>
        <Link
          to="/workflows/new"
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:from-indigo-400 hover:via-violet-400 hover:to-blue-400 transition-all shadow-sm accent-glow"
        >
          <Plus size={16} /> New Workflow
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Workflows" value={stats.workflows} icon={GitBranch} color="bg-gradient-to-br from-indigo-500 to-blue-500" sub={`${stats.active} active`} />
        <StatCard label="Total Executions" value={stats.executions} icon={Activity} color="bg-gradient-to-br from-violet-500 to-indigo-500" sub="all time" />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle} color="bg-gradient-to-br from-emerald-500 to-teal-500" sub="last 10" />
        <StatCard label="Failed" value={stats.failed} icon={XCircle} color="bg-gradient-to-br from-rose-500 to-orange-500" sub={stats.in_progress > 0 ? `${stats.in_progress} running` : 'none running'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Executions */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900">Recent Executions</h2>
            </div>
            <Link to="/executions" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              View all <ArrowRight size={13} />
            </Link>
          </div>
          {recentExecutions.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <Clock size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No executions yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentExecutions.map((ex) => (
                <Link
                  key={ex.id}
                  to={`/executions/${ex.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    ex.status === 'completed' ? 'bg-green-500' :
                    ex.status === 'failed' ? 'bg-red-500' :
                    ex.status === 'in_progress' ? 'bg-blue-500 animate-pulse' :
                    'bg-gray-300'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 font-mono truncate">{ex.id.slice(0, 16)}…</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {ex.started_at ? new Date(ex.started_at).toLocaleString() : 'Not started'}
                    </p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize shrink-0 ${statusColor[ex.status] || 'bg-gray-100 text-gray-600'}`}>
                    {ex.status.replace('_', ' ')}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Workflows */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch size={16} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900">Workflows</h2>
            </div>
            <Link to="/workflows" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              All <ArrowRight size={13} />
            </Link>
          </div>
          {recentWorkflows.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <GitBranch size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No workflows yet</p>
              <Link to="/workflows/new" className="text-blue-600 text-xs hover:underline mt-1 inline-block">Create one →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentWorkflows.map((wf) => (
                <div key={wf.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${wf.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <Link to={`/workflows/${wf.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block">
                      {wf.name}
                    </Link>
                    <p className="text-xs text-gray-400">v{wf.version}</p>
                  </div>
                  <button
                    onClick={() => setExecuteTarget(wf)}
                    disabled={!wf.is_active}
                    className="p-1.5 text-gray-300 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                    title={wf.is_active ? 'Execute' : 'Activate workflow first'}
                  >
                    <Play size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {executeTarget && (
        <ExecuteModal
          workflow={executeTarget}
          workflowId={executeTarget.id}
          onClose={() => setExecuteTarget(null)}
          onSuccess={(execId) => { setExecuteTarget(null); navigate(`/executions/${execId}`); }}
        />
      )}
    </div>
  );
}
