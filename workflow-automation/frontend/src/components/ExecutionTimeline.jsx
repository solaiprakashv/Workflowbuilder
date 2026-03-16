import { CheckCircle, AlertCircle, Loader2, Clock } from 'lucide-react';

const STATUS_STYLES = {
	completed: {
		dot: 'bg-green-500 border-green-500',
		text: 'text-green-700',
		badge: 'bg-green-100 text-green-700',
		card: 'border-green-100 bg-green-50/40'
	},
	in_progress: {
		dot: 'bg-yellow-400 border-yellow-400',
		text: 'text-yellow-700',
		badge: 'bg-yellow-100 text-yellow-700',
		card: 'border-yellow-100 bg-yellow-50/40'
	},
	failed: {
		dot: 'bg-red-500 border-red-500',
		text: 'text-red-700',
		badge: 'bg-red-100 text-red-700',
		card: 'border-red-100 bg-red-50/40'
	},
	pending: {
		dot: 'bg-gray-300 border-gray-300',
		text: 'text-gray-600',
		badge: 'bg-gray-100 text-gray-600',
		card: 'border-gray-100 bg-gray-50'
	}
};

const normalizeStepStatus = ({ step, execution }) => {
	const stepLogs = (execution.logs || []).filter((log) => log.step_id === step.id);

	if (stepLogs.some((log) => log.status === 'failed')) {
		return 'failed';
	}

	if (stepLogs.some((log) => log.status === 'completed')) {
		return 'completed';
	}

	const hasStartedLog = stepLogs.some((log) => log.status === 'started');
	const isCurrent = execution.current_step_id === step.id;
	if (hasStartedLog || (isCurrent && ['in_progress', 'waiting_for_approval'].includes(execution.status))) {
		return 'in_progress';
	}

	return 'pending';
};

const statusIcon = (status) => {
	if (status === 'completed') return <CheckCircle size={13} className="text-white" />;
	if (status === 'failed') return <AlertCircle size={13} className="text-white" />;
	if (status === 'in_progress') return <Loader2 size={13} className="text-white animate-spin" />;
	return <Clock size={13} className="text-white" />;
};

export default function ExecutionTimeline({ execution, steps = [] }) {
	if (!execution) return null;

	if (!steps.length) {
		return (
			<div className="text-center py-10 text-gray-400">
				<Clock size={32} className="mx-auto mb-2 opacity-30" />
				<p className="text-sm">No workflow steps available for timeline</p>
			</div>
		);
	}

	const orderedSteps = [...steps].sort((a, b) => a.order - b.order);

	return (
		<div className="space-y-3">
			{orderedSteps.map((step, index) => {
				const status = normalizeStepStatus({ step, execution });
				const style = STATUS_STYLES[status];
				const isCurrent = execution.current_step_id === step.id && ['in_progress', 'waiting_for_approval'].includes(execution.status);
				const stepLogs = (execution.logs || []).filter((log) => log.step_id === step.id);

				return (
					<div key={step.id} className={`rounded-xl border p-4 ${style.card} ${isCurrent ? 'ring-2 ring-yellow-300' : ''}`}>
						<div className="flex items-start gap-3">
							<div className="flex flex-col items-center pt-0.5">
								<div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${style.dot}`}>
									{statusIcon(status)}
								</div>
								{index < orderedSteps.length - 1 && <div className="w-0.5 bg-gray-200 h-6 mt-1" />}
							</div>

							<div className="flex-1 min-w-0">
								<div className="flex items-center justify-between gap-2">
									<div className="flex items-center gap-2 min-w-0">
										<span className="text-xs font-semibold text-gray-500">Step {index + 1}</span>
										<p className="text-sm font-semibold text-gray-900 truncate">{step.name}</p>
										{isCurrent && <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">Current</span>}
									</div>
									<span className={`text-[11px] px-2 py-0.5 rounded-full font-medium capitalize ${style.badge}`}>
										{status === 'in_progress' ? 'In Progress' : status}
									</span>
								</div>

								<p className={`text-xs mt-1 capitalize ${style.text}`}>{step.step_type}</p>

								<div className="mt-3 space-y-2">
									{stepLogs.length === 0 ? (
										<p className="text-xs text-gray-400">No logs yet</p>
									) : (
										stepLogs.map((log, logIndex) => (
											<div key={`${step.id}-${log.timestamp}-${logIndex}`} className="text-xs bg-white/70 border border-gray-100 rounded-lg px-2.5 py-2">
												<div className="flex items-center justify-between gap-2">
													<span className="font-medium text-gray-700 capitalize">{log.status}</span>
													<span className="text-gray-400">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '—'}</span>
												</div>
												<p className="text-gray-600 mt-1">{log.message || '—'}</p>
											</div>
										))
									)}
								</div>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
