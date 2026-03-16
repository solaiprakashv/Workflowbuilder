import { useState, useEffect } from 'react';
import { workflowAPI } from '../services/api';
import { History, ChevronDown, ChevronUp, GitBranch } from 'lucide-react';
import Modal from './Modal';
import Spinner from './Spinner';
import toast from 'react-hot-toast';

export default function VersionHistoryModal({ workflowId, currentVersion, onClose }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  useEffect(() => {
    workflowAPI.getVersionHistory(workflowId)
      .then((res) => setVersions(res.data.data))
      .catch(() => toast.error('Failed to load version history'))
      .finally(() => setLoading(false));
  }, [workflowId]);

  const loadSnapshot = async (version) => {
    if (expanded === version) { setExpanded(null); setSnapshot(null); return; }
    setExpanded(version);
    setSnapshotLoading(true);
    try {
      const res = await workflowAPI.getVersionSnapshot(workflowId, version);
      setSnapshot(res.data.data);
    } catch { toast.error('Failed to load snapshot'); }
    finally { setSnapshotLoading(false); }
  };

  return (
    <Modal title="Version History" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-500 pb-2 border-b border-gray-100">
          <History size={14} />
          <span>Current version: <strong className="text-gray-900">v{currentVersion}</strong></span>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : versions.length === 0 ? (
          <p className="text-center text-gray-400 py-8">No version history yet</p>
        ) : (
          versions.map((v) => (
            <div key={v.id} className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                onClick={() => loadSnapshot(v.version)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    v.version === currentVersion ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    v{v.version}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Version {v.version}
                      {v.version === currentVersion && <span className="ml-2 text-xs text-blue-600 font-normal">current</span>}
                    </p>
                    <p className="text-xs text-gray-400">{new Date(v.created_at).toLocaleString()}</p>
                  </div>
                </div>
                {expanded === v.version ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
              </button>

              {expanded === v.version && (
                <div className="border-t border-gray-100 p-3 bg-gray-50">
                  {snapshotLoading ? (
                    <div className="flex justify-center py-4"><Spinner size="sm" /></div>
                  ) : snapshot ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <GitBranch size={12} />
                        <span>{snapshot.steps?.length || 0} steps · {snapshot.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
                      {(snapshot.steps || []).map((step) => (
                        <div key={step.id} className="flex items-center gap-2 text-xs">
                          <span className="w-4 h-4 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-500 shrink-0">{step.order + 1}</span>
                          <span className="font-medium text-gray-700">{step.name}</span>
                          <span className="text-gray-400 capitalize">({step.step_type})</span>
                          <span className="text-gray-300">· {step.rules?.length || 0} rules</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
