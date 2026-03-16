import { useState } from 'react';
import { workflowAPI } from '../services/api';
import { Play, AlertCircle } from 'lucide-react';
import Modal from './Modal';
import toast from 'react-hot-toast';

export default function ExecuteModal({ workflow, workflowId, onClose, onSuccess }) {
  const schema = workflow.input_schema || {};
  const fields = Object.keys(schema);

  const getFieldConfig = (key) => {
    const raw = schema[key];
    if (typeof raw === 'string') {
      return { type: raw, required: true, allowed_values: [] };
    }
    return {
      type: raw?.type || 'string',
      required: Boolean(raw?.required),
      allowed_values: Array.isArray(raw?.allowed_values) ? raw.allowed_values : []
    };
  };

  // Build initial form state from schema
  const [formData, setFormData] = useState(() =>
    fields.reduce((acc, key) => ({ ...acc, [key]: '' }), {})
  );
  const [jsonMode, setJsonMode] = useState(fields.length === 0);
  const [rawJson, setRawJson] = useState('{}');
  const [jsonError, setJsonError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFieldChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleJsonChange = (val) => {
    setRawJson(val);
    try { JSON.parse(val); setJsonError(''); } catch { setJsonError('Invalid JSON'); }
  };

  const handleExecute = async () => {
    setLoading(true);
    try {
      let data = {};
      if (jsonMode) {
        if (jsonError) return toast.error('Fix JSON errors first');
        data = JSON.parse(rawJson);
      } else {
        // Coerce types based on schema
        data = fields.reduce((acc, key) => {
          const config = getFieldConfig(key);
          const type = config.type;
          const val = formData[key];
          if (config.required && (val === '' || val === null || val === undefined)) {
            throw new Error(`"${key}" is required`);
          }
          if (!config.required && (val === '' || val === null || val === undefined)) {
            return acc;
          }
          if (type === 'number') acc[key] = Number(val);
          else if (type === 'boolean') acc[key] = val === 'true';
          else acc[key] = val;
          if (config.allowed_values.length > 0 && !config.allowed_values.map(String).includes(String(acc[key]))) {
            throw new Error(`"${key}" must be one of [${config.allowed_values.join(', ')}]`);
          }
          return acc;
        }, {});
      }
      const res = await workflowAPI.execute(workflowId, { data });
      toast.success('Execution started');
      onSuccess(res.data.data.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Execution failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Execute Workflow" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <Play size={16} className="text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900">{workflow.name}</p>
            <p className="text-xs text-blue-600 mt-0.5">v{workflow.version} · Provide input data below</p>
          </div>
        </div>

        {fields.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => setJsonMode(false)}
              className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${!jsonMode ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Form
            </button>
            <button
              onClick={() => { setJsonMode(true); setRawJson(JSON.stringify(formData, null, 2)); }}
              className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${jsonMode ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              JSON
            </button>
          </div>
        )}

        {!jsonMode && fields.length > 0 ? (
          <div className="space-y-3">
            {fields.map((key) => (
              <div key={key}>
                {(() => {
                  const config = getFieldConfig(key);
                  return (
                <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                  {key} <span className="text-gray-400 font-normal text-xs">({config.type}{config.required ? ', required' : ''})</span>
                </label>
                  );
                })()}
                {(() => {
                  const config = getFieldConfig(key);
                  if (config.allowed_values.length > 0) {
                    return (
                      <select
                        value={formData[key]}
                        onChange={(e) => handleFieldChange(key, e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select...</option>
                        {config.allowed_values.map((value) => (
                          <option key={`${key}-${value}`} value={String(value)}>{String(value)}</option>
                        ))}
                      </select>
                    );
                  }

                  if (config.type === 'boolean') {
                    return (
                  <select
                    value={formData[key]}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                    );
                  }

                  return (
                  <input
                    type={config.type === 'number' ? 'number' : 'text'}
                    value={formData[key]}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`Enter ${key}...`}
                  />
                  );
                })()}
              </div>
            ))}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Input Data (JSON)</label>
            <textarea
              rows={6}
              value={rawJson}
              onChange={(e) => handleJsonChange(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${jsonError ? 'border-red-300' : 'border-gray-300'}`}
              placeholder='{"amount": 250, "country": "US", "priority": "High"}'
            />
            {jsonError && (
              <div className="flex items-center gap-1.5 mt-1 text-red-500 text-xs">
                <AlertCircle size={12} /> {jsonError}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleExecute} disabled={loading}
            className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Play size={14} /> {loading ? 'Starting...' : 'Execute'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
