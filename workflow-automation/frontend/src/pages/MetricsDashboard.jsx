import { useState, useEffect } from 'react';
import { metricsAPI } from '../services/api';
import { BarChart2, CheckCircle, XCircle, Clock, TrendingUp, Zap, Activity, RefreshCw } from 'lucide-react';
import Spinner from '../components/Spinner';
import toast from 'react-hot-toast';

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="rounded-2xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{value}</p>
          {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
    </div>
  );
}

function MiniBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-24 shrink-0 capitalize" style={{ color: 'var(--text-secondary)' }}>{label.replace('_', ' ')}</span>
      <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--border)' }}>
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right" style={{ color: 'var(--text-muted)' }}>{value}</span>
    </div>
  );
}

function TrendChart({ data }) {
  if (!data || data.length === 0) return (
    <div className="flex items-center justify-center h-32" style={{ color: 'var(--text-muted)' }}>
      <p className="text-sm">No trend data yet</p>
    </div>
  );
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1.5 h-32">
      {data.map((d) => (
        <div key={d._id} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex flex-col gap-0.5 justify-end" style={{ height: '100px' }}>
            <div
              className="w-full bg-green-500 rounded-t opacity-80"
              style={{ height: `${(d.completed / maxCount) * 100}%`, minHeight: d.completed > 0 ? '3px' : '0' }}
            />
            <div
              className="w-full bg-red-500 rounded-t opacity-80"
              style={{ height: `${(d.failed / maxCount) * 100}%`, minHeight: d.failed > 0 ? '3px' : '0' }}
            />
          </div>
          <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
            {d._id?.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatDuration(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default function MetricsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await metricsAPI.get();
      setData(res.data.data);
    } catch {
      toast.error('Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Spinner size="lg" />
    </div>
  );

  const { overview, statusBreakdown, dailyTrend, recentExecutions } = data || {};
  const totalStatus = Object.values(statusBreakdown || {}).reduce((a, b) => a + b, 0);

  const statusColors = {
    completed: 'bg-green-500',
    failed: 'bg-red-500',
    in_progress: 'bg-blue-500',
    pending: 'bg-yellow-500',
    canceled: 'bg-gray-500'
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Execution Metrics</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Real-time performance overview</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl border transition-colors hover:bg-white/5"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Workflows" value={overview?.totalWorkflows ?? 0} sub={`${overview?.activeWorkflows ?? 0} active`} icon={Zap} color="bg-blue-600" />
        <StatCard label="Total Executions" value={overview?.totalExecutions ?? 0} sub="all time" icon={Activity} color="bg-violet-600" />
        <StatCard label="Success Rate" value={`${overview?.successRate ?? 0}%`} sub="completed vs failed" icon={TrendingUp} color="bg-green-600" />
        <StatCard label="Avg Duration" value={formatDuration(overview?.avgDurationMs)} sub={`max ${formatDuration(overview?.maxDurationMs)}`} icon={Clock} color="bg-orange-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Status breakdown */}
        <div className="rounded-2xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-blue-500" />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Status Breakdown</h2>
          </div>
          <div className="space-y-3">
            {Object.entries(statusBreakdown || {}).map(([status, count]) => (
              <MiniBar key={status} label={status} value={count} max={totalStatus} color={statusColors[status] || 'bg-gray-500'} />
            ))}
            {Object.keys(statusBreakdown || {}).length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>No data yet</p>
            )}
          </div>
        </div>

        {/* Daily trend */}
        <div className="lg:col-span-2 rounded-2xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-green-500" />
              <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>7-Day Execution Trend</h2>
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full inline-block" />Completed</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full inline-block" />Failed</span>
            </div>
          </div>
          <TrendChart data={dailyTrend} />
        </div>
      </div>

      {/* Recent executions table */}
      <div className="rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
          <Activity size={16} className="text-violet-500" />
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Recent Executions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid var(--border)` }}>
                {['ID', 'Workflow', 'Status', 'Retries', 'Started'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(recentExecutions || []).map((ex) => (
                <tr key={ex._id} className="border-b transition-colors hover:bg-white/5" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{ex.id?.slice(0, 12) ?? '—'}…</td>
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{ex.workflow_id?.slice(0, 8)}…</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${
                      ex.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      ex.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                      ex.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>{ex.status?.replace('_', ' ')}</span>
                  </td>
                  <td className="px-5 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{ex.retries}</td>
                  <td className="px-5 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {ex.started_at ? new Date(ex.started_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
              {(recentExecutions || []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                    No executions yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
