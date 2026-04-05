import { Link } from 'react-router-dom';
import { Calendar, Layers, ChevronRight } from 'lucide-react';
import StatusBadge from './StatusBadge.jsx';
import { useApp } from '../context/AppContext.jsx';
import { formatDisplayDate } from '../utils/dates.js';

export default function ProjectCard({ project }) {
  const { allBookings } = useApp();

  const projectBookings = allBookings.filter((b) => b.projectId === project.id);
  const deliverableCount = (project.deliverables || []).length;
  const bookingCount = projectBookings.length;

  const startDates = projectBookings.map((b) => b.startDate).filter(Boolean);
  const endDates = projectBookings.map((b) => b.endDate).filter(Boolean);
  const minDate = startDates.length ? startDates.reduce((a, b) => (a < b ? a : b)) : null;
  const maxDate = endDates.length ? endDates.reduce((a, b) => (a > b ? a : b)) : null;

  return (
    <Link to={`/projects/${project.id}`} className="block group">
      <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-teal-300 transition-all duration-200">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-teal-700 transition-colors truncate">
              {project.name}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{project.client}</p>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <StatusBadge status={project.status} />
            <ChevronRight size={16} className="text-gray-400 group-hover:text-teal-500 transition-colors" />
          </div>
        </div>

        {project.description && (
          <p className="text-xs text-gray-500 mb-3 line-clamp-2">{project.description}</p>
        )}

        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Layers size={12} />
            {deliverableCount} deliverable{deliverableCount !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            {bookingCount} booking{bookingCount !== 1 ? 's' : ''}
          </span>
        </div>

        {minDate && maxDate && (
          <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
            {formatDisplayDate(minDate)} — {formatDisplayDate(maxDate)}
          </div>
        )}
      </div>
    </Link>
  );
}
