import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FolderOpen,
  CalendarCheck,
  Wrench,
  Clock,
  Plus,
  CalendarRange,
  ArrowRight,
} from 'lucide-react';
import Layout from '../components/Layout.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useApp } from '../context/AppContext.jsx';
import { getUpcomingBookings } from '../utils/scheduling.js';
import { formatDisplayDate, today, addDays } from '../utils/dates.js';

function SummaryCard({ title, value, icon: Icon, color, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-start gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <p className="text-3xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { projects, allBookings, equipment } = useApp();
  const navigate = useNavigate();

  const activeBookings = useMemo(
    () => allBookings.filter((b) => {
      const t = today();
      return b.startDate <= t && b.endDate >= t;
    }),
    [allBookings]
  );

  const upcomingBookings = useMemo(
    () => getUpcomingBookings(allBookings, 7),
    [allBookings]
  );

  const activeProjects = projects.filter((p) => p.status === 'Active');

  const recentProjects = useMemo(
    () => [...projects].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 6),
    [projects]
  );

  return (
    <Layout
      title="Dashboard"
      actions={
        <button
          onClick={() => navigate('/projects/new')}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
        >
          <Plus size={16} />
          New Project
        </button>
      }
    >
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          title="Total Projects"
          value={projects.length}
          icon={FolderOpen}
          color="bg-teal-600"
          sub={`${activeProjects.length} active`}
        />
        <SummaryCard
          title="Active Bookings"
          value={activeBookings.length}
          icon={CalendarCheck}
          color="bg-blue-600"
          sub="Currently running"
        />
        <SummaryCard
          title="Equipment Items"
          value={equipment.length}
          icon={Wrench}
          color="bg-violet-600"
          sub="Across 48 labs"
        />
        <SummaryCard
          title="Upcoming (7 days)"
          value={upcomingBookings.length}
          icon={Clock}
          color="bg-amber-500"
          sub="Starting soon"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Projects */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Recent Projects</h2>
              <Link
                to="/projects"
                className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
              >
                View all <ArrowRight size={12} />
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {recentProjects.length === 0 && (
                <p className="px-6 py-8 text-sm text-gray-400 text-center">No projects yet.</p>
              )}
              {recentProjects.map((project) => {
                const bookingCount = allBookings.filter((b) => b.projectId === project.id).length;
                return (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{project.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{project.client}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <span className="text-xs text-gray-400">{bookingCount} bookings</span>
                      <StatusBadge status={project.status} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Quick Actions + Upcoming */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
            <div className="space-y-2">
              <button
                onClick={() => navigate('/projects/new')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
              >
                <Plus size={16} />
                New Project
              </button>
              <button
                onClick={() => navigate('/calendar')}
                className="w-full flex items-center gap-3 px-4 py-3 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <CalendarRange size={16} className="text-teal-600" />
                View Equipment Calendar
              </button>
              <button
                onClick={() => navigate('/labs')}
                className="w-full flex items-center gap-3 px-4 py-3 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <Wrench size={16} className="text-violet-600" />
                Browse Labs & Equipment
              </button>
            </div>
          </div>

          {/* Upcoming bookings */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Upcoming Bookings</h2>
              <p className="text-xs text-gray-400 mt-0.5">Next 7 days</p>
            </div>
            <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {upcomingBookings.length === 0 && (
                <p className="px-5 py-4 text-xs text-gray-400 text-center">No upcoming bookings.</p>
              )}
              {upcomingBookings.slice(0, 8).map((booking) => {
                const project = projects.find((p) => p.id === booking.projectId);
                return (
                  <div key={booking.id} className="px-5 py-3">
                    <p className="text-xs font-medium text-gray-800 truncate">
                      {booking.projectName || project?.name || 'Unknown Project'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Starts {formatDisplayDate(booking.startDate)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
