import { useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import GanttChart from './GanttChart.jsx';
import { addDays, formatDate } from '../utils/dates.js';

/**
 * BookingCalendar — full timeline view of all bookings.
 * Wraps GanttChart with automatic date range and equipment labels.
 */
export default function BookingCalendar({ bookings, startDate, endDate }) {
  const { equipmentMap, labsMap } = useApp();

  // Build row labels: equipmentId -> "Equipment Name (Lab)"
  const rowLabels = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (!map[b.equipmentId]) {
        const eq = equipmentMap[b.equipmentId];
        if (eq) {
          const lab = labsMap[eq.labId];
          map[b.equipmentId] = `${eq.name}${lab ? ' · ' + lab.name.replace(' Lab', '') : ''}`;
        } else {
          map[b.equipmentId] = b.equipmentId;
        }
      }
    }
    return map;
  }, [bookings, equipmentMap, labsMap]);

  return (
    <GanttChart
      bookings={bookings}
      startDate={startDate}
      endDate={endDate}
      groupBy="equipment"
      rowLabels={rowLabels}
      showConflicts
      compact
    />
  );
}
