import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { workflowAPI } from '../services/api';
import { Plus, Search, Edit, Play, Trash2, GitBranch, ToggleLeft, ToggleRight, X } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import ExecuteModal from '../components/ExecuteModal';
import toast from 'react-hot-toast';

export default function Workflows() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, total_pages: 1, total: 0 });
  const [executeTarget, setExecuteTarget] = useState(null); // { id, name, version, input_schema }

  const fetchWorkflows = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 10, search };
      if (statusFilter !== 'all') {
        params.is_active = statusFilter === 'active';
      }
      const res = await workflowAPI.list(params);
      setWorkflows(res.data.data || []);
      setPagination({
        page: res.data.page || 1,
        total_pages: res.data.total_pages || 1,
        total: res.data.total || 0
      });
    } catch {
      toast.error('Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { fetchWorkflows(); }, [fetchWorkflows]);

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}" and all its steps/rules?`)) return;
    try {
      await workflowAPI.delete(id);
      toast.success('Workflow deleted');
      fetchWorkflows();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleToggleActive = async (wf) => {
    try {
      await workflowAPI.update(wf.id, { is_active: !wf.is_active });
      toast.success(wf.is_active ? 'Workflow deactivated' : 'Workflow activated');
      fetchWorkflows();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="text-gray-500 text-sm mt-1">{pagination.total} total workflows</p>
        </div>
        <Link
          to="/workflows/new"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} /> New Workflow
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search workflows by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Spinner /></div>
        ) : workflows.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <GitBranch size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium text-gray-500">{search ? 'No workflows match your search' : 'No workflows yet'}</p>
            {!search && (
              <Link to="/workflows/new" className="text-blue-600 text-sm hover:underline mt-2 inline-block">
                Create your first workflow →
              </Link>
            )}
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['ID', 'Name', 'Version', 'Status', 'Steps', 'Created', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {workflows.map((wf) => (
                  <tr key={wf.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-400">{wf.id.slice(0, 8)}…</td>
                    <td className="px-5 py-3.5">
                      <Link to={`/workflows/${wf.id}`} className="font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                        {wf.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">v{wf.version}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={wf.is_active ? 'active' : 'inactive'} />
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs">—</td>
                    <td className="px-5 py-3.5 text-gray-400 text-xs">{new Date(wf.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <Link
                          to={`/workflows/${wf.id}`}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit size={15} />
                        </Link>
                        <button
                          onClick={() => setExecuteTarget(wf)}
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Execute"
                        >
                          <Play size={15} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(wf)}
                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title={wf.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {wf.is_active ? <ToggleRight size={15} className="text-green-500" /> : <ToggleLeft size={15} />}
                        </button>
                        <button
                          onClick={() => handleDelete(wf.id, wf.name)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {pagination.total_pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">Page {pagination.page} of {pagination.total_pages} · {pagination.total} workflows</p>
                <div className="flex gap-2">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => fetchWorkflows(pagination.page - 1)}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >← Prev</button>
                  <button
                    disabled={pagination.page >= pagination.total_pages}
                    onClick={() => fetchWorkflows(pagination.page + 1)}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >Next →</button>
                </div>
              </div>
            )}
          </>
        )}
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
