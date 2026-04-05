export default function StatusBadge({ status }) {
  const map = {
    Active: 'bg-emerald-100 text-emerald-800',
    Scheduled: 'bg-blue-100 text-blue-800',
    Draft: 'bg-gray-100 text-gray-600',
    Completed: 'bg-purple-100 text-purple-800',
    'In Progress': 'bg-amber-100 text-amber-800',
    Pending: 'bg-slate-100 text-slate-600',
    Cancelled: 'bg-red-100 text-red-700',
  };

  const cls = map[status] || 'bg-gray-100 text-gray-600';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
