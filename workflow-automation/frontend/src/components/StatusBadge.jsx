const colors = {
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  canceled: 'bg-gray-100 text-gray-800',
  task: 'bg-purple-100 text-purple-800',
  approval: 'bg-orange-100 text-orange-800',
  notification: 'bg-teal-100 text-teal-800',
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600'
};

export default function StatusBadge({ status }) {
  const label = status?.replace('_', ' ') || 'unknown';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  );
}
