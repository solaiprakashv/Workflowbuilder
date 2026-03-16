import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { executionAPI } from '../services/api';
import { Eye, XCircle, RefreshCw, Play, Filter, X } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = ['all', 'pending', 'in_progress', 'completed', 'failed', 'canceled'];

const statusDot = {
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  in_progress: 'bg-blue-500 animate-pulse',
  pending: 'bg-yellow-400',
  canceled: 'bg-gray-400'
};

function duration(start, end) {
  if (!start) return '—';
  const ms = new Date(end || Date.now()) - new Date(start);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default function Executions() {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchExecutions = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await executionAPI.list(params);
      setExecutions(res.data.data.executions);
      setPagination({ page: res.data.data.page, pages: res.data.data.pages, total: res.data.data.total });
    } catch {
      toast.error('Failed to load executions');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchExecutions(); }, [fetchExecutions]);

  // Auto-refresh every 3s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => fetchExecutions(pagination.page), 3000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchExecutions, pagination.page]);

  const handleCancel = async (id) => {
    try {
      await executionAPI.cancel(id);
      toast.success('Execution canceled');
      fetchExecutions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cancel failed');
    }
  };

  const handleRetry = async (id) => {
    try {
      await executionAPI.retry(id);
      toast.success('Execution retried');
      fetchExecutions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Retry failed');
    }
  };

  const runningCount = executions.filter((e) => e.status === 'in_progress').length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Executions</h1>
          <p className="text-gray-500 text-sm mt-1">
            {pagination.total} total
            {runningCount > 0 && <span className="ml-2 text-blue-600 font-medium">· {runningCount} running</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors ${
              autoRefresh ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <RefreshCw size={14} className={autoRefresh ? 'animate-spin' : ''} />
            {autoRefresh ? 'Live' : 'Auto-refresh'}
          </button>
          <button
            onClick={() => fetchExecutions()}
            className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${
              statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex justify-center p-12"><Spinner /></div>
        ) : executions.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Play size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium text-gray-500">
              {statusFilter !== 'all' ? `No ${statusFilter.replace('_', ' ')} executions` : 'No executions yet'}
            </p>
            {statusFilter !== 'all' && (
              <button onClick={() => setStatusFilter('all')} className="text-blue-600 text-sm hover:underline mt-1">
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['', 'Execution ID', 'Workflow ID', 'Version', 'Status', 'Duration', 'Retries', 'Start Time', 'Actions'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {executions.map((ex) => (
                    <tr key={ex.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="pl-4 py-3.5">
                        <div className={`w-2 h-2 rounded-full ${statusDot[ex.status] || 'bg-gray-300'}`} />
                      </td>
                      <td className="px-4 py-3.5">
                        <Link to={`/executions/${ex.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {ex.id.slice(0, 12)}…
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-gray-400">{ex.workflow_id.slice(0, 8)}…</td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">v{ex.workflow_version}</span>
                      </td>
                      <td className="px-4 py-3.5"><StatusBadge status={ex.status} /></td>
                      <td className="px-4 py-3.5 text-xs text-gray-500 font-mono">
                        {duration(ex.started_at, ex.ended_at)}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-500">{ex.retries}</td>
                      <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                        {ex.started_at ? new Date(ex.started_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1">
                          <Link
                            to={`/executions/${ex.id}`}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Logs"
                          >
                            <Eye size={14} />
                          </Link>
                          {['pending', 'in_progress'].includes(ex.status) && (
                            <button
                              onClick={() => handleCancel(ex.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Cancel"
                            >
                              <XCircle size={14} />
                            </button>
                          )}
                          {ex.status === 'failed' && (
                            <button
                              onClick={() => handleRetry(ex.id)}
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Retry"
                            >
                              <RefreshCw size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">Page {pagination.page} of {pagination.pages} · {pagination.total} executions</p>
                <div className="flex gap-2">
                  <button disabled={pagination.page <= 1} onClick={() => fetchExecutions(pagination.page - 1)}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">← Prev</button>
                  <button disabled={pagination.page >= pagination.pages} onClick={() => fetchExecutions(pagination.page + 1)}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
