import { useMemo } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap,
  Handle, Position, MarkerType, useNodesState, useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';

// ── Step status colors ──────────────────────────────────────
const STATUS_STYLE = {
  completed: { bg: '#16a34a', border: '#15803d', text: '#fff', glow: '0 0 16px rgba(22,163,74,0.5)' },
  running:   { bg: '#2563eb', border: '#1d4ed8', text: '#fff', glow: '0 0 16px rgba(37,99,235,0.5)' },
  failed:    { bg: '#dc2626', border: '#b91c1c', text: '#fff', glow: '0 0 16px rgba(220,38,38,0.5)' },
  pending:   { bg: '#374151', border: '#4b5563', text: '#9ca3af', glow: 'none' },
  default:   { bg: '#1e293b', border: '#334155', text: '#94a3b8', glow: 'none' }
};

const TYPE_ICON = { task: '⚙', approval: '✓', notification: '🔔' };

// ── Custom Step Node ────────────────────────────────────────
function StepNode({ data }) {
  const s = STATUS_STYLE[data.execStatus] || STATUS_STYLE.default;
  return (
    <div style={{
      background: s.bg,
      border: `2px solid ${s.border}`,
      borderRadius: 14,
      padding: '10px 16px',
      minWidth: 160,
      boxShadow: s.glow,
      transition: 'all 0.3s ease',
      cursor: 'default'
    }}>
      <Handle type="target" position={Position.Left} style={{ background: s.border, width: 8, height: 8 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{TYPE_ICON[data.step_type] || '⚙'}</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: s.text, lineHeight: 1.2 }}>{data.label}</div>
          <div style={{ fontSize: 10, color: s.text, opacity: 0.7, marginTop: 2, textTransform: 'capitalize' }}>
            {data.step_type}
            {data.execStatus && data.execStatus !== 'default' && (
              <span style={{ marginLeft: 6, fontWeight: 600 }}>· {data.execStatus}</span>
            )}
          </div>
        </div>
      </div>

      {data.isStart && (
        <div style={{
          position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
          background: '#3b82f6', color: '#fff', fontSize: 9, fontWeight: 700,
          padding: '1px 8px', borderRadius: 99, whiteSpace: 'nowrap'
        }}>START</div>
      )}

      <Handle type="source" position={Position.Right} style={{ background: s.border, width: 8, height: 8 }} />
    </div>
  );
}

// ── Custom Edge Label ───────────────────────────────────────
function RuleEdge({ id, sourceX, sourceY, targetX, targetY, data, markerEnd }) {
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const path = `M${sourceX},${sourceY} C${sourceX + 60},${sourceY} ${targetX - 60},${targetY} ${targetX},${targetY}`;

  return (
    <>
      <path id={id} d={path} fill="none" stroke="#475569" strokeWidth={1.5} markerEnd={markerEnd} />
      {data?.label && (
        <foreignObject x={midX - 60} y={midY - 14} width={120} height={28}>
          <div style={{
            background: '#0f172a', border: '1px solid #334155', borderRadius: 6,
            padding: '2px 6px', fontSize: 9, color: '#94a3b8', textAlign: 'center',
            fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }} title={data.label}>
            {data.label.length > 22 ? data.label.slice(0, 22) + '…' : data.label}
          </div>
        </foreignObject>
      )}
    </>
  );
}

const nodeTypes = { stepNode: StepNode };
const edgeTypes = { ruleEdge: RuleEdge };

// ── Build nodes & edges from workflow data ──────────────────
function buildGraph(steps, executionLogs, currentStepId) {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const COLS = 3;
  const X_GAP = 260, Y_GAP = 140;

  // Determine execution status per step
  const stepStatus = {};
  if (executionLogs) {
    executionLogs.forEach((log) => {
      stepStatus[log.step_id] = log.status === 'completed' ? 'completed' : 'failed';
    });
  }
  if (currentStepId) stepStatus[currentStepId] = 'running';

  const nodes = sorted.map((step, i) => ({
    id: step.id,
    type: 'stepNode',
    position: { x: (i % COLS) * X_GAP + 40, y: Math.floor(i / COLS) * Y_GAP + 40 },
    data: {
      label: step.name,
      step_type: step.step_type,
      isStart: step.id === steps[0]?.id,
      execStatus: stepStatus[step.id] || (executionLogs ? 'pending' : 'default')
    }
  }));

  const edges = [];
  steps.forEach((step) => {
    (step.rules || []).sort((a, b) => a.priority - b.priority).forEach((rule, ri) => {
      if (rule.next_step_id) {
        edges.push({
          id: `${step.id}-${rule.next_step_id}-${ri}`,
          source: step.id,
          target: rule.next_step_id,
          type: 'ruleEdge',
          markerEnd: { type: MarkerType.ArrowClosed, color: '#475569' },
          data: { label: rule.condition === 'DEFAULT' ? 'DEFAULT' : rule.condition }
        });
      }
    });
  });

  return { nodes, edges };
}

// ── Main Component ──────────────────────────────────────────
export default function WorkflowGraph({ steps, executionLogs, currentStepId, height = 420 }) {
  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => buildGraph(steps, executionLogs, currentStepId),
    [steps, executionLogs, currentStepId]
  );

  const [nodes, , onNodesChange] = useNodesState(initNodes);
  const [edges, , onEdgesChange] = useEdgesState(initEdges);

  if (!steps || steps.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0f1e', borderRadius: 16, border: '1px solid #1f2937' }}>
        <p style={{ color: '#475569', fontSize: 14 }}>No steps to visualize</p>
      </div>
    );
  }

  return (
    <div style={{ height, borderRadius: 16, overflow: 'hidden', border: '1px solid #1f2937', background: '#060b14' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={20} size={1} />
        <Controls style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
        <MiniMap
          style={{ background: '#0f172a', border: '1px solid #1f2937', borderRadius: 8 }}
          nodeColor={(n) => {
            const s = n.data?.execStatus;
            return s === 'completed' ? '#16a34a' : s === 'running' ? '#2563eb' : s === 'failed' ? '#dc2626' : '#374151';
          }}
        />
      </ReactFlow>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 10,
        background: 'rgba(6,11,20,0.9)', border: '1px solid #1f2937',
        borderRadius: 8, padding: '6px 10px', pointerEvents: 'none'
      }}>
        {[
          { color: '#16a34a', label: 'Completed' },
          { color: '#2563eb', label: 'Running' },
          { color: '#dc2626', label: 'Failed' },
          { color: '#374151', label: 'Pending' }
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 10, color: '#64748b' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
