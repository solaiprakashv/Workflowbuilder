import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { workflowAPI, stepAPI, ruleAPI } from '../services/api';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import WorkflowGraph from '../components/WorkflowGraph';
import { Plus, Trash2, ChevronDown, ChevronUp, Save, Play, ArrowLeft, Edit2, History, Zap, Settings, Share2, GripVertical } from 'lucide-react';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import ExecuteModal from '../components/ExecuteModal';
import VersionHistoryModal from '../components/VersionHistoryModal';
import toast from 'react-hot-toast';

const STEP_TYPES = ['task', 'approval', 'notification'];
const FIELD_TYPES = ['string', 'number', 'boolean'];
const TYPE_COLORS = {
  task: 'bg-purple-100 text-purple-700 border-purple-200',
  approval: 'bg-orange-100 text-orange-700 border-orange-200',
  notification: 'bg-teal-100 text-teal-700 border-teal-200'
};

const normalizeSchemaFields = (schema = {}) => Object.entries(schema).map(([name, config]) => {
  if (typeof config === 'string') {
    return { name, type: config, required: true, allowed_values: '' };
  }
  return {
    name,
    type: config?.type || 'string',
    required: Boolean(config?.required),
    allowed_values: Array.isArray(config?.allowed_values) ? config.allowed_values.join(', ') : ''
  };
});

const validateRuleCondition = (condition) => {
  if (!condition || condition.trim().toUpperCase() === 'DEFAULT') {
    return { valid: true, error: '' };
  }
  try {
    new Function('contains', 'startsWith', 'endsWith', `"use strict"; return (${condition});`);
    return { valid: true, error: '' };
  } catch (err) {
    return { valid: false, error: err.message };
  }
};

export default function WorkflowBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [workflow, setWorkflow] = useState({ name: '', is_active: false, input_schema: {} });
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [expandedStep, setExpandedStep] = useState(null);
  const [activeTab, setActiveTab] = useState('steps');

  const [stepModal, setStepModal] = useState({ open: false, editing: null });
  const [ruleModal, setRuleModal] = useState({ open: false, stepId: null, editing: null });
  const [executeModal, setExecuteModal] = useState(false);
  const [versionModal, setVersionModal] = useState(false);
  const [stepForm, setStepForm] = useState({ name: '', step_type: 'task', order: 0, metadata: {} });
  const [ruleForm, setRuleForm] = useState({ condition: '', next_step_id: '', priority: 1 });
  const [schemaFields, setSchemaFields] = useState([]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showOrderSaved, setShowOrderSaved] = useState(false);
  const [savingOrderStepId, setSavingOrderStepId] = useState(null);
  const orderSavedTimeoutRef = useRef(null);

  useEffect(() => {
    if (!isNew) {
      workflowAPI.getById(id)
        .then((res) => {
          const d = res.data.data;
          setWorkflow({ name: d.name, is_active: d.is_active, input_schema: d.input_schema || {}, start_step_id: d.start_step_id, version: d.version });
          setSchemaFields(normalizeSchemaFields(d.input_schema || {}));
          setSteps(d.steps || []);
        })
        .catch(() => toast.error('Failed to load workflow'))
        .finally(() => setLoading(false));
    }
  }, [id, isNew]);

  useEffect(() => {
    if (isNew) {
      setSchemaFields([]);
    }
  }, [isNew]);

  useEffect(() => {
    return () => {
      if (orderSavedTimeoutRef.current) {
        clearTimeout(orderSavedTimeoutRef.current);
      }
    };
  }, []);

  const buildInputSchema = () => {
    return schemaFields.reduce((acc, field) => {
      const key = field.name?.trim();
      if (!key) {
        return acc;
      }
      const allowedValues = field.allowed_values
        ? field.allowed_values.split(',').map((value) => value.trim()).filter(Boolean)
        : [];
      acc[key] = {
        type: field.type,
        required: Boolean(field.required),
        ...(allowedValues.length > 0 ? { allowed_values: allowedValues } : {})
      };
      return acc;
    }, {});
  };

  const saveWorkflow = async () => {
    if (!workflow.name.trim()) return toast.error('Workflow name is required');
    const payload = { ...workflow, input_schema: buildInputSchema() };
    setSaving(true);
    try {
      if (isNew) {
        const res = await workflowAPI.create(payload);
        toast.success('Workflow created');
        navigate(`/workflows/${res.data.data.id}`);
      } else {
        const res = await workflowAPI.update(id, payload);
        setWorkflow((w) => ({ ...w, version: res.data.data.version }));
        toast.success(`Saved — now v${res.data.data.version}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const openAddStep = () => {
    setStepForm({ name: '', step_type: 'task', order: steps.length, metadata: {} });
    setStepModal({ open: true, editing: null });
  };
  const openEditStep = (step) => {
    setStepForm({ name: step.name, step_type: step.step_type, order: step.order, metadata: step.metadata || {} });
    setStepModal({ open: true, editing: step });
  };
  const submitStep = async () => {
    if (!stepForm.name.trim()) return toast.error('Step name required');
    try {
      if (stepModal.editing) {
        const res = await stepAPI.update(stepModal.editing.id, stepForm);
        setSteps(steps.map((s) => s.id === stepModal.editing.id ? { ...res.data.data, rules: s.rules } : s));
        toast.success('Step updated');
      } else {
        const res = await stepAPI.add(id, stepForm);
        setSteps([...steps, { ...res.data.data, rules: [] }]);
        toast.success('Step added');
      }
      setStepModal({ open: false, editing: null });
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };
  const deleteStep = async (stepId) => {
    if (!confirm('Delete this step and all its rules?')) return;
    try {
      await stepAPI.delete(stepId);
      setSteps(steps.filter((s) => s.id !== stepId));
      toast.success('Step deleted');
    } catch { toast.error('Failed to delete step'); }
  };

  const openAddRule = (stepId) => {
    const step = steps.find((s) => s.id === stepId);
    setRuleForm({ condition: '', next_step_id: '', priority: (step?.rules?.length || 0) + 1 });
    setRuleModal({ open: true, stepId, editing: null });
  };
  const openEditRule = (rule, stepId) => {
    setRuleForm({ condition: rule.condition, next_step_id: rule.next_step_id || '', priority: rule.priority });
    setRuleModal({ open: true, stepId, editing: rule });
  };
  const submitRule = async () => {
    if (!ruleForm.condition.trim()) return toast.error('Condition required');
    const syntaxCheck = validateRuleCondition(ruleForm.condition);
    if (!syntaxCheck.valid) {
      return toast.error(`Invalid condition syntax: ${syntaxCheck.error}`);
    }
    const payload = { ...ruleForm, next_step_id: ruleForm.next_step_id || null, priority: Number(ruleForm.priority) };
    try {
      if (ruleModal.editing) {
        const res = await ruleAPI.update(ruleModal.editing.id, payload);
        setSteps(steps.map((s) => s.id === ruleModal.stepId ? { ...s, rules: s.rules.map((r) => r.id === ruleModal.editing.id ? res.data.data : r) } : s));
        toast.success('Rule updated');
      } else {
        const res = await ruleAPI.add(ruleModal.stepId, payload);
        setSteps(steps.map((s) => s.id === ruleModal.stepId ? { ...s, rules: [...(s.rules || []), res.data.data] } : s));
        toast.success('Rule added');
      }
      setRuleModal({ open: false, stepId: null, editing: null });
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const reorderRules = async (stepId, sourceIndex, destinationIndex) => {
    if (sourceIndex === destinationIndex) {
      return;
    }

    const step = steps.find((s) => s.id === stepId);
    if (!step) {
      return;
    }

    const sortedRules = [...(step.rules || [])].sort((a, b) => a.priority - b.priority);
    if (sourceIndex < 0 || sourceIndex >= sortedRules.length || destinationIndex < 0 || destinationIndex >= sortedRules.length) {
      return;
    }

    const reordered = [...sortedRules];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(destinationIndex, 0, moved);
    const reprioritized = reordered.map((rule, index) => ({ ...rule, priority: index + 1 }));

    setSteps((prev) => prev.map((s) => s.id === stepId ? { ...s, rules: reprioritized } : s));
    setSavingOrderStepId(stepId);
    setIsSavingOrder(true);
    setSaveError('');
    setShowOrderSaved(false);
    if (orderSavedTimeoutRef.current) {
      clearTimeout(orderSavedTimeoutRef.current);
    }

    try {
      await Promise.all(reprioritized.map((rule) => ruleAPI.update(rule.id, { priority: rule.priority })));
      setIsSavingOrder(false);
      setSaveError('');
      setShowOrderSaved(true);
      orderSavedTimeoutRef.current = setTimeout(() => {
        setShowOrderSaved(false);
      }, 2500);
    } catch {
      setIsSavingOrder(false);
      setShowOrderSaved(false);
      setSaveError('Failed to save order');
    }
  };

  const handleRuleDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) {
      return;
    }
    if (source.droppableId !== destination.droppableId) {
      return;
    }

    const stepId = source.droppableId.replace('rules-', '');
    reorderRules(stepId, source.index, destination.index);
  };

  const addSchemaField = () => {
    setSchemaFields((prev) => [...prev, { name: '', type: 'string', required: false, allowed_values: '' }]);
  };

  const updateSchemaField = (index, key, value) => {
    setSchemaFields((prev) => prev.map((field, i) => i === index ? { ...field, [key]: value } : field));
  };

  const removeSchemaField = (index) => {
    setSchemaFields((prev) => prev.filter((_, i) => i !== index));
  };
  const deleteRule = async (ruleId, stepId) => {
    try {
      await ruleAPI.delete(ruleId);
      setSteps(steps.map((s) => s.id === stepId ? { ...s, rules: s.rules.filter((r) => r.id !== ruleId) } : s));
      toast.success('Rule deleted');
    } catch { toast.error('Failed to delete rule'); }
  };
  const setStartStep = async (stepId) => {
    try {
      const res = await workflowAPI.update(id, { ...workflow, start_step_id: stepId });
      setWorkflow((w) => ({ ...w, start_step_id: stepId, version: res.data.data.version }));
      toast.success('Start step set');
    } catch { toast.error('Failed'); }
  };

  if (loading) return <div className="flex justify-center items-center h-full"><Spinner size="lg" /></div>;

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

  return (
    <div className="p-8 max-w-4xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/workflows')} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{isNew ? 'New Workflow' : 'Edit Workflow'}</h1>
          {!isNew && workflow.version && <p className="text-sm text-gray-400 mt-0.5">Version {workflow.version}</p>}
        </div>
        <div className="flex gap-2">
          {!isNew && (
            <button onClick={() => setVersionModal(true)} className="flex items-center gap-2 text-sm border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              <History size={15} /> History
            </button>
          )}
          {!isNew && (
            <button onClick={() => setExecuteModal(true)} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
              <Play size={15} /> Execute
            </button>
          )}
          <button onClick={saveWorkflow} disabled={saving} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
            <Save size={15} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Workflow Details ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={16} className="text-gray-400" />
          <h2 className="font-semibold text-gray-900">Workflow Details</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={workflow.name}
              onChange={(e) => setWorkflow({ ...workflow, name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Invoice Approval Workflow"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Input Schema</label>
              <button
                type="button"
                onClick={addSchemaField}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                + Add Field
              </button>
            </div>
            <div className="space-y-2">
              {schemaFields.length === 0 ? (
                <div className="text-xs text-gray-400 border border-dashed border-gray-300 rounded-lg px-3 py-3">
                  No input fields defined
                </div>
              ) : schemaFields.map((field, index) => (
                <div key={`schema-${index}`} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={field.name}
                    onChange={(e) => updateSchemaField(index, 'name', e.target.value)}
                    className="col-span-4 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="field_name"
                  />
                  <select
                    value={field.type}
                    onChange={(e) => updateSchemaField(index, 'type', e.target.value)}
                    className="col-span-2 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={field.allowed_values}
                    onChange={(e) => updateSchemaField(index, 'allowed_values', e.target.value)}
                    className="col-span-4 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="allowed values: High, Medium, Low"
                  />
                  <label className="col-span-1 flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateSchemaField(index, 'required', e.target.checked)}
                      className="w-4 h-4"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeSchemaField(index)}
                    className="col-span-1 text-red-500 hover:text-red-600 flex justify-center"
                    title="Delete field"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">Columns: name, type, allowed values (optional), required</p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setWorkflow({ ...workflow, is_active: !workflow.is_active })}
              className={`relative w-10 h-5 rounded-full transition-colors ${workflow.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${workflow.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm font-medium text-gray-700">
              {workflow.is_active ? 'Active — can be executed' : 'Inactive — cannot be executed'}
            </span>
          </label>
        </div>
      </div>

      {/* ── Steps + Graph (only after workflow is saved) ── */}
      {!isNew && (
        <DragDropContext onDragEnd={handleRuleDragEnd}>
          <div className="bg-white rounded-xl border border-gray-200">

          {/* Tab bar */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('steps')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'steps' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Zap size={13} /> Steps
              </button>
              <button
                onClick={() => setActiveTab('graph')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'graph' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Share2 size={13} /> Graph View
              </button>
            </div>
            {activeTab === 'steps' && (
              <button onClick={openAddStep} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                <Plus size={15} /> Add Step
              </button>
            )}
          </div>

          {/* Graph View */}
          {activeTab === 'graph' && (
            <div className="p-4 relative">
              <WorkflowGraph steps={sortedSteps} height={460} />
            </div>
          )}

          {/* Steps View */}
          {activeTab === 'steps' && (
            <div>
              {steps.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Zap size={20} className="text-gray-400" />
                  </div>
                  <p className="text-gray-500 font-medium">No steps yet</p>
                  <p className="text-gray-400 text-sm mt-1">Add your first step to build the workflow</p>
                  <button onClick={openAddStep} className="mt-4 text-blue-600 text-sm hover:underline">+ Add Step</button>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {sortedSteps.map((step, idx) => (
                    <div key={step.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${workflow.start_step_id === step.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 text-sm">{step.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${TYPE_COLORS[step.step_type]}`}>{step.step_type}</span>
                            {workflow.start_step_id === step.id && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Start</span>}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{step.rules?.length || 0} routing rules · order {step.order}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {workflow.start_step_id !== step.id && (
                            <button onClick={() => setStartStep(step.id)} className="text-xs text-gray-400 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors">Set Start</button>
                          )}
                          <button onClick={() => openAddRule(step.id)} className="text-xs text-gray-400 hover:text-green-600 px-2 py-1 rounded hover:bg-green-50 transition-colors">+ Rule</button>
                          <button onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors">
                            {expandedStep === step.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </button>
                          <button onClick={() => openEditStep(step)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors"><Edit2 size={14} /></button>
                          <button onClick={() => deleteStep(step.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </div>

                      {/* Rules */}
                      {expandedStep === step.id && (
                        <div className="mt-3 ml-10">
                          {savingOrderStepId === step.id && (
                            <div className={`mb-2 text-xs ${isSavingOrder ? 'text-gray-500' : saveError ? 'text-red-500' : showOrderSaved ? 'text-green-600' : 'text-gray-500'}`}>
                              {isSavingOrder ? 'Saving order...' : saveError || (showOrderSaved ? 'Order saved' : '')}
                            </div>
                          )}
                          {(step.rules || []).length === 0 ? (
                            <div className="text-xs text-gray-400 py-2 px-3 bg-gray-50 rounded-lg">No rules — step will end workflow.</div>
                          ) : (
                            <Droppable droppableId={`rules-${step.id}`}>
                              {(provided) => (
                                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                                  {[...(step.rules || [])].sort((a, b) => a.priority - b.priority).map((rule, index) => {
                                    const nextStep = steps.find((s) => s.id === rule.next_step_id);
                                    return (
                                      <Draggable key={rule.id} draggableId={rule.id} index={index}>
                                        {(draggableProvided) => (
                                          <div
                                            ref={draggableProvided.innerRef}
                                            {...draggableProvided.draggableProps}
                                            className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 group"
                                          >
                                            <span {...draggableProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                                              <GripVertical size={12} className="text-gray-400" />
                                            </span>
                                            <span className="text-xs font-bold text-gray-400 w-6 shrink-0">P{rule.priority}</span>
                                            <code className="text-xs text-gray-700 flex-1 font-mono truncate">{rule.condition}</code>
                                            <span className="text-xs text-gray-400 shrink-0">
                                              {nextStep ? <span className="text-blue-600 font-medium">→ {nextStep.name}</span> : <span className="text-red-500">→ END</span>}
                                            </span>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <button onClick={() => openEditRule(rule, step.id)} className="p-1 text-gray-400 hover:text-blue-600 rounded"><Edit2 size={12} /></button>
                                              <button onClick={() => deleteRule(rule.id, step.id)} className="p-1 text-gray-400 hover:text-red-500 rounded"><Trash2 size={12} /></button>
                                            </div>
                                          </div>
                                        )}
                                      </Draggable>
                                    );
                                  })}
                                  {provided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        </DragDropContext>
      )}

      {/* ── Step Modal ── */}
      {stepModal.open && (
        <Modal title={stepModal.editing ? 'Edit Step' : 'Add Step'} onClose={() => setStepModal({ open: false, editing: null })}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" autoFocus value={stepForm.name} onChange={(e) => setStepForm({ ...stepForm, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Finance Notification" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <div className="grid grid-cols-3 gap-2">
                {STEP_TYPES.map((t) => (
                  <button key={t} onClick={() => setStepForm({ ...stepForm, step_type: t })}
                    className={`py-2 px-3 rounded-lg text-sm font-medium border capitalize transition-colors ${stepForm.step_type === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
              <input type="number" min={0} value={stepForm.order} onChange={(e) => setStepForm({ ...stepForm, order: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStepModal({ open: false, editing: null })} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={submitStep} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 font-medium">{stepModal.editing ? 'Update Step' : 'Add Step'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Rule Modal ── */}
      {ruleModal.open && (
        <Modal title={ruleModal.editing ? 'Edit Rule' : 'Add Rule'} onClose={() => setRuleModal({ open: false, stepId: null, editing: null })}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
              <input type="text" autoFocus value={ruleForm.condition} onChange={(e) => setRuleForm({ ...ruleForm, condition: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="amount > 100 && country == 'US'" />
              <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-500 mb-1">Quick examples:</p>
                {["amount > 100 && country == 'US'", "amount <= 100", "priority == 'High'", "DEFAULT"].map((ex) => (
                  <button key={ex} onClick={() => setRuleForm({ ...ruleForm, condition: ex })} className="block text-xs font-mono text-blue-600 hover:underline mt-0.5">{ex}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Route to Step</label>
              <select value={ruleForm.next_step_id} onChange={(e) => setRuleForm({ ...ruleForm, next_step_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— End workflow —</option>
                {steps.filter((s) => s.id !== ruleModal.stepId).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.step_type})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority (lower = first)</label>
              <input type="number" min={1} value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setRuleModal({ open: false, stepId: null, editing: null })} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={submitRule} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 font-medium">{ruleModal.editing ? 'Update Rule' : 'Add Rule'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Execute Modal ── */}
      {executeModal && (
        <ExecuteModal workflow={workflow} workflowId={id} onClose={() => setExecuteModal(false)} onSuccess={(execId) => navigate(`/executions/${execId}`)} />
      )}

      {/* ── Version History Modal ── */}
      {versionModal && (
        <VersionHistoryModal workflowId={id} currentVersion={workflow.version} onClose={() => setVersionModal(false)} />
      )}
    </div>
  );
}
