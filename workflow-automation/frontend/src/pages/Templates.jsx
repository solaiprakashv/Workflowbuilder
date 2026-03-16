import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { templateAPI, workflowAPI, stepAPI, ruleAPI } from '../services/api';
import { LayoutTemplate, Zap, Users, Ticket, Package, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';
import Spinner from '../components/Spinner';
import toast from 'react-hot-toast';

const ICONS = { receipt: Zap, users: Users, ticket: Ticket, package: Package };

const TYPE_COLORS = {
  task: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  approval: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  notification: 'bg-teal-500/20 text-teal-400 border-teal-500/30'
};

const getSchemaTypeLabel = (value) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const base = value.type || 'string';
    const required = value.required ? 'required' : 'optional';
    const allowed = Array.isArray(value.allowed_values) && value.allowed_values.length > 0
      ? ` [${value.allowed_values.join('|')}]`
      : '';
    return `${base} (${required})${allowed}`;
  }
  return 'string';
};

export default function Templates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(null);

  useEffect(() => {
    templateAPI.list()
      .then((res) => setTemplates(res.data.data))
      .catch(() => toast.error('Failed to load templates'))
      .finally(() => setLoading(false));
  }, []);

  const applyTemplate = async (template) => {
    setApplying(template.id);
    try {
      // 1. Create workflow
      const wfRes = await workflowAPI.create({
        name: template.name,
        input_schema: template.input_schema,
        is_active: false
      });
      const wf = wfRes.data.data;

      // 2. Create steps and collect their IDs
      const createdSteps = [];
      for (const s of template.steps) {
        const res = await stepAPI.add(wf.id, {
          name: s.name,
          step_type: s.step_type,
          order: s.order,
          metadata: s.metadata || {}
        });
        createdSteps.push(res.data.data);
      }

      // 3. Set start step
      await workflowAPI.update(wf.id, { start_step_id: createdSteps[0]?.id });

      // 4. Create rules using step index mapping
      for (const rule of template.rules) {
        const stepId = createdSteps[rule.step_index]?.id;
        const nextStepId = rule.next_step_index != null ? createdSteps[rule.next_step_index]?.id : null;
        if (stepId) {
          await ruleAPI.add(stepId, {
            condition: rule.condition,
            next_step_id: nextStepId || null,
            priority: rule.priority
          });
        }
      }

      toast.success(`"${template.name}" created from template`);
      navigate(`/workflows/${wf.id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to apply template');
    } finally {
      setApplying(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>
  );

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Workflow Templates</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Start from a pre-built template — steps, rules and schema are all set up for you
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {templates.map((t) => {
          const Icon = ICONS[t.icon] || Zap;
          const isApplying = applying === t.id;
          return (
            <div
              key={t.id}
              className="rounded-2xl border p-6 flex flex-col gap-4 transition-all hover:border-blue-500/50 group"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              {/* Header */}
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shrink-0 shadow-lg">
                  <Icon size={20} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t.name}</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
                </div>
              </div>

              {/* Input schema */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Input Fields</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(t.input_schema || {}).map(([k, v]) => (
                    <span key={k} className="text-xs px-2 py-0.5 rounded-full border font-mono"
                      style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                      {k}: <span className="text-blue-400">{getSchemaTypeLabel(v)}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Steps preview */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                  Steps ({t.steps.length})
                </p>
                <div className="flex items-center gap-1 flex-wrap">
                  {t.steps.map((s, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full border capitalize font-medium ${TYPE_COLORS[s.step_type]}`}>
                        {s.name}
                      </span>
                      {i < t.steps.length - 1 && <ArrowRight size={10} style={{ color: 'var(--text-muted)' }} />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Rules count */}
              <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t.rules.length} routing rules included
                </span>
                <button
                  onClick={() => applyTemplate(t)}
                  disabled={!!applying}
                  className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-500 hover:to-violet-500 disabled:opacity-50 transition-all shadow-md"
                >
                  {isApplying ? (
                    <><Loader2 size={14} className="animate-spin" /> Creating…</>
                  ) : (
                    <><CheckCircle size={14} /> Use Template</>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
