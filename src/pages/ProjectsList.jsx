import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useApp } from '../context/AppContext.jsx';
import { formatDisplayDate } from '../utils/dates.js';
import { computeTotalCost } from '../utils/scheduling.js';

const STATUSES = ['All', 'Active', 'Scheduled', 'Draft', 'Completed', 'Cancelled'];

export default function ProjectsList() {
  const { projects, allBookings, equipmentMap, deleteProject } = useApp();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const filtered = useMemo(() => {
    let list = projects;
    if (statusFilter !== 'All') list = list.filter((p) => p.status === statusFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.client || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      let va = a[sortKey] || '';
      let vb = b[sortKey] || '';
      if (sortKey === 'bookingCount') {
        va = allBookings.filter((bk) => bk.projectId === a.id).length;
        vb = allBookings.filter((bk) => bk.projectId === b.id).length;
      }
      if (sortKey === 'cost') {
        va = computeTotalCost(allBookings.filter((bk) => bk.projectId === a.id), equipmentMap);
        vb = computeTotalCost(allBookings.filter((bk) => bk.projectId === b.id), equipmentMap);
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [projects, query, statusFilter, sortKey, sortDir, allBookings, equipmentMap]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function handleDelete(id) {
    deleteProject(id);
    setDeleteConfirm(null);
  }

  function SortIcon({ k }) {
    if (sortKey !== k) return <ChevronUp size={14} className="text-gray-300" />;
    return sortDir === 'asc' ? (
      <ChevronUp size={14} className="text-teal-600" />
    ) : (
      <ChevronDown size={14} className="text-teal-600" />
    );
  }

  return (
    <Layout
      title="Projects"
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
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-48">
          <Search size={15} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects..."
            className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400"
          />
        </div>
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-teal-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                <button
                  onClick={() => handleSort('name')}
                  className="flex items-center gap-1 hover:text-gray-900"
                >
                  Project <SortIcon k="name" />
                </button>
              </th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                <button
                  onClick={() => handleSort('client')}
                  className="flex items-center gap-1 hover:text-gray-900"
                >
                  Client <SortIcon k="client" />
                </button>
              </th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                Status
              </th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                <button
                  onClick={() => handleSort('bookingCount')}
                  className="flex items-center gap-1 hover:text-gray-900 ml-auto"
                >
                  Bookings <SortIcon k="bookingCount" />
                </button>
              </th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                <button
                  onClick={() => handleSort('cost')}
                  className="flex items-center gap-1 hover:text-gray-900 ml-auto"
                >
                  Est. Cost <SortIcon k="cost" />
                </button>
              </th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                <button
                  onClick={() => handleSort('createdAt')}
                  className="flex items-center gap-1 hover:text-gray-900"
                >
                  Created <SortIcon k="createdAt" />
                </button>
              </th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-400">
                  No projects found.{' '}
                  <button
                    onClick={() => navigate('/projects/new')}
                    className="text-teal-600 font-medium hover:underline"
                  >
                    Create one
                  </button>
                </td>
              </tr>
            )}
            {filtered.map((project) => {
              const projBookings = allBookings.filter((b) => b.projectId === project.id);
              const cost = computeTotalCost(projBookings, equipmentMap);

              return (
                <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-medium text-gray-900">{project.name}</div>
                    {project.description && (
                      <div className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">
                        {project.description}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-600">{project.client || '—'}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={project.status} />
                  </td>
                  <td className="px-5 py-4 text-right text-gray-600">
                    {projBookings.length}
                  </td>
                  <td className="px-5 py-4 text-right font-medium text-gray-900">
                    ${cost.toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">
                    {project.createdAt ? formatDisplayDate(project.createdAt) : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <Link
                        to={`/projects/${project.id}`}
                        className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        title="View project"
                      >
                        <ExternalLink size={15} />
                      </Link>
                      {deleteConfirm === project.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(project.id)}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded font-medium hover:bg-red-700"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-1 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(project.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete project"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Showing {filtered.length} of {projects.length} projects
      </p>
    </Layout>
  );
}
