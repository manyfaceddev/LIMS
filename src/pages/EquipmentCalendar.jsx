import { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import GanttChart from '../components/GanttChart.jsx';
import { useApp } from '../context/AppContext.jsx';
import { addDays, formatDate, formatDisplayDate, monthLabel } from '../utils/dates.js';

export default function EquipmentCalendar() {
  const { labs, equipment, equipmentMap, labsMap, allBookings } = useApp();

  const [selectedLabId, setSelectedLabId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [monthOffset, setMonthOffset] = useState(0); // months from today's month start

  // Compute date range: show 3 months from offset
  const { chartStart, chartEnd } = useMemo(() => {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const endMonth = new Date(startMonth.getFullYear(), startMonth.getMonth() + 3, 0); // last day of 3rd month
    return {
      chartStart: formatDate(startMonth),
      chartEnd: formatDate(endMonth),
    };
  }, [monthOffset]);

  // Filter equipment
  const filteredEquipment = useMemo(() => {
    let list = equipment;
    if (selectedLabId !== 'all') {
      list = list.filter((e) => e.labId === selectedLabId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (labsMap[e.labId]?.name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [equipment, selectedLabId, searchQuery, labsMap]);

  // Filter bookings for visible equipment and date range
  const visibleBookings = useMemo(() => {
    const eqIds = new Set(filteredEquipment.map((e) => e.id));
    return allBookings.filter(
      (b) =>
        eqIds.has(b.equipmentId) &&
        b.endDate >= chartStart &&
        b.startDate <= chartEnd
    );
  }, [allBookings, filteredEquipment, chartStart, chartEnd]);

  // Row labels
  const rowLabels = useMemo(() => {
    const map = {};
    for (const eq of filteredEquipment) {
      const lab = labsMap[eq.labId];
      map[eq.id] = `${eq.name}`;
    }
    return map;
  }, [filteredEquipment, labsMap]);

  // All equipment rows (even with no bookings, we want to show them)
  // Create dummy bookings array that just uses the filtered equipment IDs
  const ganttBookings = useMemo(() => {
    // Add placeholder entries for equipment with no bookings so they appear in the chart
    const withBookings = new Set(visibleBookings.map((b) => b.equipmentId));
    const placeholders = filteredEquipment
      .filter((e) => !withBookings.has(e.id))
      .map((e) => ({
        id: `placeholder-${e.id}`,
        equipmentId: e.id,
        projectId: '__empty__',
        projectName: '',
        startDate: chartStart,
        endDate: chartStart, // zero-width, just to create the row
        durationDays: 0,
        _placeholder: true,
      }));
    return [...visibleBookings, ...placeholders];
  }, [visibleBookings, filteredEquipment, chartStart]);

  // Labs with equipment present in filtered list
  const labsWithEquipment = useMemo(() => {
    const labIds = new Set(filteredEquipment.map((e) => e.labId));
    return labs.filter((l) => labIds.has(l.id));
  }, [filteredEquipment, labs]);

  return (
    <Layout title="Equipment Calendar">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-48">
          <Search size={15} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search equipment or lab..."
            className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400"
          />
        </div>

        {/* Lab filter */}
        <select
          value={selectedLabId}
          onChange={(e) => setSelectedLabId(e.target.value)}
          className="px-3 py-2 border border-gray-200 bg-white rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="all">All Labs ({equipment.length} items)</option>
          {labs.map((lab) => {
            const count = equipment.filter((e) => e.labId === lab.id).length;
            return (
              <option key={lab.id} value={lab.id}>
                {lab.name} ({count})
              </option>
            );
          })}
        </select>

        {/* Month navigation */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setMonthOffset((o) => o - 1)}
            className="p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            title="Previous 3 months"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="px-3 py-2 text-sm font-medium text-gray-700 min-w-48 text-center">
            {monthLabel(chartStart)} — {monthLabel(chartEnd)}
          </span>
          <button
            onClick={() => setMonthOffset((o) => o + 1)}
            className="p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            title="Next 3 months"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
        <span>
          Showing <strong className="text-gray-700">{filteredEquipment.length}</strong> equipment items
        </span>
        <span>
          <strong className="text-gray-700">{visibleBookings.length}</strong> bookings in this period
        </span>
        {selectedLabId !== 'all' && (
          <button
            onClick={() => setSelectedLabId('all')}
            className="text-teal-600 hover:underline font-medium"
          >
            Clear lab filter
          </button>
        )}
      </div>

      {/* Gantt chart */}
      {filteredEquipment.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">No equipment matches your filters.</p>
        </div>
      ) : (
        <GanttChart
          bookings={ganttBookings.filter((b) => !b._placeholder)}
          startDate={chartStart}
          endDate={chartEnd}
          groupBy="equipment"
          rowLabels={rowLabels}
          showConflicts
          compact
          height={Math.min(600, 52 + filteredEquipment.length * 40 + 40)}
        />
      )}

      {/* Lab grouping summary */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {labsWithEquipment.slice(0, 16).map((lab) => {
          const labEquipment = filteredEquipment.filter((e) => e.labId === lab.id);
          const labBookings = visibleBookings.filter((b) =>
            labEquipment.some((e) => e.id === b.equipmentId)
          );
          const utilization = labEquipment.length > 0
            ? Math.round((new Set(labBookings.map((b) => b.equipmentId)).size / labEquipment.length) * 100)
            : 0;

          return (
            <button
              key={lab.id}
              onClick={() => setSelectedLabId(lab.id === selectedLabId ? 'all' : lab.id)}
              className={`text-left p-3 rounded-lg border transition-colors ${
                selectedLabId === lab.id
                  ? 'border-teal-300 bg-teal-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <p className={`text-xs font-semibold truncate ${selectedLabId === lab.id ? 'text-teal-800' : 'text-gray-700'}`}>
                {lab.name.replace(' Lab', '')}
              </p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs text-gray-400">{labEquipment.length} items</span>
                <span className={`text-xs font-medium ${utilization > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                  {utilization}% booked
                </span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-teal-500 transition-all"
                  style={{ width: `${utilization}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </Layout>
  );
}
