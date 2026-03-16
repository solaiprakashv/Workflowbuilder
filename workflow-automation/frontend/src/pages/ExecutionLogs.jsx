import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { executionAPI, workflowAPI } from '../services/api';
import { sendApprovalEmail } from '../services/email';
import {
  ArrowLeft, RefreshCw, XCircle, RotateCcw,
  CheckCircle, AlertCircle, Clock, Loader2, GitBranch
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import ExecutionTimeline from '../components/ExecutionTimeline';
import toast from 'react-hot-toast';

function duration(start, end) {
  if (!start) return null;
  const ms = new Date(end || Date.now()) - new Date(start);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default function ExecutionLogs() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [execution, setExecution] = useState(null);
  const [workflowName, setWorkflowName] = useState('Workflow');
  const [workflowSteps, setWorkflowSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);
  const emailedApprovalKeys = useRef(new Set());

  const resolveApproverName = ({ stepName, amount, existingApprover }) => {
    if (existingApprover) return existingApprover;
    if ((stepName || '').toLowerCase().includes('ceo')) return 'CEO';
    if ((stepName || '').toLowerCase().includes('finance')) return 'Finance Officer';
    if (Number(amount) < 100) return 'Manager';
    return 'Finance Officer';
  };

  const fetchExecution = useCallback(async () => {
    try {
      const res = await executionAPI.getById(id);
      setExecution(res.data.data);
    } catch {
      toast.error('Failed to load execution');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    intervalRef.current = setInterval(fetchExecution, 2000);
  }, [fetchExecution, stopPolling]);

  useEffect(() => { fetchExecution(); }, [fetchExecution]);

  useEffect(() => {
    if (!execution?.workflow_id) return;
    workflowAPI.getById(execution.workflow_id)
      .then((res) => {
        setWorkflowName(res.data.data?.name || 'Workflow');
        setWorkflowSteps(res.data.data?.steps || []);
      })
      .catch(() => {
        setWorkflowName('Workflow');
        setWorkflowSteps([]);
      });
  }, [execution?.workflow_id]);

  useEffect(() => {
    if (!execution?.logs?.length) return;

    const pendingApprovalLogs = execution.logs.filter((log) => {
      const isApproval = log.step_type === 'approval';
      const isPendingApproval = log.metadata?.approval_state === 'pending_approval' || log.status === 'started';
      return isApproval && isPendingApproval;
    });

    pendingApprovalLogs.forEach(async (log) => {
      const dedupeKey = `${execution.id}:${log.step_id}:${log.started_at || log.timestamp}`;
      if (emailedApprovalKeys.current.has(dedupeKey)) return;

      const amount = execution.data?.amount;
      const approverName = resolveApproverName({
        stepName: log.step_name,
        amount,
        existingApprover: log.approver_id
      });

      const instructions = log.metadata?.instructions || 'Please review and approve this workflow step.';
      const message = `${instructions}\n\nWorkflow: ${workflowName}\nStep: ${log.step_name}\nAmount: ${amount != null ? amount : 'N/A'}`;

      try {
        await sendApprovalEmail({
          toName: approverName,
          workflowName,
          stepName: log.step_name,
          amount,
          message
        });
        emailedApprovalKeys.current.add(dedupeKey);
        toast.success(`Approval email sent to ${approverName}`);
      } catch {
        toast.error(`Failed to send approval email for ${log.step_name}`);
      }
    });
  }, [execution, workflowName]);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  useEffect(() => {
    if (!execution?.status) return;
    if (execution.status === 'in_progress') {
      startPolling();
      return;
    }
    if (['completed', 'failed', 'canceled'].includes(execution.status)) {
      stopPolling();
      return;
    }
    startPolling();
  }, [execution?.status, startPolling, stopPolling]);

  const handleCancel = async () => {
    try { await executionAPI.cancel(id); toast.success('Canceled'); fetchExecution(); }
    catch (err) { toast.error(err.response?.data?.message || 'Cancel failed'); }
  };

  const handleRetry = async () => {
    try {
      await executionAPI.retry(id);
      toast.success('Retried');
      startPolling();
      fetchExecution();
    }
    catch (err) { toast.error(err.response?.data?.message || 'Retry failed'); }
  };

  if (loading) return <div className="flex justify-center items-center h-full"><Spinner size="lg" /></div>;
  if (!execution) return <div className="p-8 text-gray-500">Execution not found</div>;

  const dur = duration(execution.started_at, execution.ended_at);

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/executions')} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Execution Logs</h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{execution.id}</p>
        </div>
        <div className="flex gap-2">
          <span className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border bg-blue-50 border-blue-200 text-blue-600">
            <RefreshCw size={14} className="animate-spin" />
            Live (2s)
          </span>
          {['pending', 'in_progress'].includes(execution.status) && (
            <button onClick={handleCancel} className="flex items-center gap-2 text-sm bg-red-50 text-red-600 border border-red-200 px-3 py-2 rounded-lg hover:bg-red-100">
              <XCircle size={14} /> Cancel
            </button>
          )}
          {execution.status === 'failed' && (
            <button onClick={handleRetry} className="flex items-center gap-2 text-sm bg-green-50 text-green-600 border border-green-200 px-3 py-2 rounded-lg hover:bg-green-100">
              <RotateCcw size={14} /> Retry
            </button>
          )}
        </div>
      </div>

      {/* Summary card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Status</p>
            <StatusBadge status={execution.status} />
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Version</p>
            <p className="text-sm font-semibold text-gray-900">v{execution.workflow_version}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Duration</p>
            <p className="text-sm font-semibold text-gray-900 font-mono">{dur || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Retries</p>
            <p className="text-sm font-semibold text-gray-900">{execution.retries}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Steps</p>
            <p className="text-sm font-semibold text-gray-900">{execution.logs?.length || 0} logged</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Started</p>
            <p className="text-xs text-gray-700">{execution.started_at ? new Date(execution.started_at).toLocaleString() : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Ended</p>
            <p className="text-xs text-gray-700">{execution.ended_at ? new Date(execution.ended_at).toLocaleString() : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Workflow</p>
            <Link to={`/workflows/${execution.workflow_id}`} className="text-xs text-blue-600 hover:underline font-mono">
              {execution.workflow_id.slice(0, 10)}…
            </Link>
          </div>
        </div>

        {/* Input data */}
        {Object.keys(execution.data || {}).length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Input Data</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(execution.data).map(([k, v]) => (
                <span key={k} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full font-mono">
                  {k}: <strong>{String(v)}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Step Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900">Step Timeline</h2>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{workflowSteps.length || 0}</span>
          </div>
          {['in_progress', 'waiting_for_approval'].includes(execution.status) && (
            <span className="flex items-center gap-1.5 text-xs text-blue-600">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              Running…
            </span>
          )}
        </div>

        <div className="p-5">
          <ExecutionTimeline execution={execution} steps={workflowSteps} />
        </div>
      </div>
    </div>
  );
}
