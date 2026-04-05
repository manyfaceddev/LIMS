import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, Calendar, DollarSign } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useApp } from '../context/AppContext.jsx';
import { formatDisplayDate, today, addDays } from '../utils/dates.js';

function EquipmentRow({ eq, lab, bookings, allProjects }) {
  const todayStr = today();
  const nextSevenDays = addDays(todayStr, 7);

  const activeBooking = bookings.find(
    (b) => b.startDate <= todayStr && b.endDate >= todayStr
  );
  const upcomingBooking = bookings.find(
    (b) => b.startDate > todayStr && b.startDate <= nextSevenDays
  );

  const totalBookings = bookings.length;

  let status = 'Available';
  let statusColor = 'bg-emerald-100 text-emerald-700';

  if (activeBooking) {
    status = 'In Use';
    statusColor = 'bg-red-100 text-red-700';
  } else if (upcomingBooking) {
    status = 'Upcoming';
    statusColor = 'bg-amber-100 text-amber-700';
  }

  const activeProject = activeBooking
    ? allProjects.find((p) => p.id === activeBooking.projectId)
    : null;

  return (
    <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
          status === 'In Use' ? 'bg-red-500' : status === 'Upcoming' ? 'bg-amber-500' : 'bg-emerald-500'
        }`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{eq.name}</p>
          {activeProject && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              In use: {activeProject.name} (until {formatDisplayDate(activeBooking.endDate)})
            </p>
          )}
          {upcomingBooking && !activeBooking && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              Starting {formatDisplayDate(upcomingBooking.startDate)}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 ml-4 shrink-0">
        <span className="text-xs text-gray-400">{totalBookings} booking{totalBookings !== 1 ? 's' : ''}</span>
        <span className="text-xs font-medium text-gray-600">
          <DollarSign size={11} className="inline -mt-0.5" />{eq.costPerDay.toLocaleString()}/day
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
          {status}
        </span>
      </div>
    </div>
  );
}

function LabCard({ lab, equipment, allBookings, allProjects }) {
  const [expanded, setExpanded] = useState(false);

  const labEquipment = equipment.filter((e) => e.labId === lab.id);
  const labBookings = allBookings.filter((b) => labEquipment.some((e) => e.id === b.equipmentId));

  const todayStr = today();
  const inUseCount = labEquipment.filter((eq) =>
    allBookings.some(
      (b) => b.equipmentId === eq.id && b.startDate <= todayStr && b.endDate >= todayStr
    )
  ).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {expanded ? (
            <ChevronUp size={16} className="text-gray-400 shrink-0" />
          ) : (
            <ChevronDown size={16} className="text-gray-400 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{lab.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          {inUseCount > 0 && (
            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              {inUseCount} in use
            </span>
          )}
          <span className="text-xs text-gray-400">{labEquipment.length} items</span>
          <span className="text-xs text-gray-400">{labBookings.length} bookings</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {labEquipment.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">No equipment in this lab.</p>
          ) : (
            labEquipment.map((eq) => {
              const eqBookings = allBookings.filter((b) => b.equipmentId === eq.id);
              return (
                <EquipmentRow
                  key={eq.id}
                  eq={eq}
                  lab={lab}
                  bookings={eqBookings}
                  allProjects={allProjects}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function LabsEquipment() {
  const { labs, equipment, allBookings, projects } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandAll, setExpandAll] = useState(false);

  const todayStr = today();

  // Filter labs by search
  const filteredLabs = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q && filterStatus === 'all') return labs;

    return labs.filter((lab) => {
      const labEquipment = equipment.filter((e) => e.labId === lab.id);

      const matchesSearch =
        !q ||
        lab.name.toLowerCase().includes(q) ||
        labEquipment.some((e) => e.name.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (filterStatus === 'available') {
        return labEquipment.some(
          (eq) =>
            !allBookings.some(
              (b) => b.equipmentId === eq.id && b.startDate <= todayStr && b.endDate >= todayStr
            )
        );
      }
      if (filterStatus === 'in-use') {
        return labEquipment.some((eq) =>
          allBookings.some(
            (b) => b.equipmentId === eq.id && b.startDate <= todayStr && b.endDate >= todayStr
          )
        );
      }

      return true;
    });
  }, [labs, equipment, allBookings, searchQuery, filterStatus, todayStr]);

  // Summary stats
  const stats = useMemo(() => {
    const inUse = equipment.filter((eq) =>
      allBookings.some(
        (b) => b.equipmentId === eq.id && b.startDate <= todayStr && b.endDate >= todayStr
      )
    ).length;
    return {
      total: equipment.length,
      inUse,
      available: equipment.length - inUse,
      labs: labs.length,
    };
  }, [equipment, allBookings, todayStr, labs]);

  return (
    <Layout title="Labs & Equipment">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 font-medium">Total Labs</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.labs}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 font-medium">Total Equipment</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 font-medium">Currently In Use</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{stats.inUse}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 font-medium">Available Now</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.available}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-48">
          <Search size={15} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search labs or equipment..."
            className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400"
          />
        </div>

        <div className="flex gap-1">
          {[
            { value: 'all', label: 'All' },
            { value: 'available', label: 'Available' },
            { value: 'in-use', label: 'In Use' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilterStatus(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterStatus === value
                  ? 'bg-teal-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="space-y-3">
        {filteredLabs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
            <p className="text-sm text-gray-400">No labs found matching your filters.</p>
          </div>
        ) : (
          filteredLabs.map((lab) => (
            <LabCard
              key={lab.id}
              lab={lab}
              equipment={equipment}
              allBookings={allBookings}
              allProjects={projects}
            />
          ))
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Showing {filteredLabs.length} of {labs.length} labs
      </p>
    </Layout>
  );
}
