import { useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { getProjectColor, PROJECT_COLORS } from '../utils/scheduling.js';
import {
  addDays,
  formatDate,
  formatDisplayDate,
  daysBetween,
  monthsBetween,
  monthLabel,
  rangesOverlap,
} from '../utils/dates.js';

const ROW_HEIGHT = 40;
const LABEL_WIDTH = 200;
const DAY_WIDTH_NORMAL = 28;
const DAY_WIDTH_WIDE = 40;

/**
 * GanttChart
 *
 * Props:
 *  - bookings: Array of booking objects with startDate, endDate, projectId, projectName, equipmentId, etc.
 *  - startDate: string YYYY-MM-DD — chart start
 *  - endDate: string YYYY-MM-DD — chart end
 *  - groupBy: 'equipment' | 'deliverable'
 *  - rowLabels: map of { rowKey -> labelString }
 *  - showConflicts: boolean
 *  - compact: boolean (reduce day width for large ranges)
 */
export default function GanttChart({
  bookings = [],
  startDate,
  endDate,
  groupBy = 'equipment',
  rowLabels = {},
  showConflicts = true,
  compact = false,
  height,
}) {
  const { projects, equipmentMap } = useApp();

  const totalDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return daysBetween(startDate, endDate);
  }, [startDate, endDate]);

  const dayWidth = compact || totalDays > 90 ? DAY_WIDTH_NORMAL : DAY_WIDTH_WIDE;
  const totalWidth = LABEL_WIDTH + totalDays * dayWidth;

  // Build rows grouped by rowKey
  const rows = useMemo(() => {
    const groups = {};
    for (const b of bookings) {
      const key = groupBy === 'equipment' ? b.equipmentId : (b.deliverableId || b.equipmentId);
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    }
    return Object.entries(groups).map(([key, bkgs]) => ({ key, bookings: bkgs }));
  }, [bookings, groupBy]);

  // Months for header
  const months = useMemo(() => {
    if (!startDate || !endDate) return [];
    return monthsBetween(startDate, endDate);
  }, [startDate, endDate]);

  if (!startDate || !endDate || totalDays <= 0) {
    return (
      <div className="text-sm text-gray-400 py-8 text-center">No date range available to display chart.</div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-8 text-center">No bookings to display.</div>
    );
  }

  function getLeft(dateStr) {
    const days = daysBetween(startDate, dateStr);
    return LABEL_WIDTH + Math.max(0, days - 1) * dayWidth;
  }

  function getWidth(durationDays) {
    return Math.max(dayWidth, durationDays * dayWidth - 2);
  }

  function getColor(projectId) {
    return getProjectColor(projectId, projects);
  }

  // Detect conflicts within same equipment
  function hasConflict(booking) {
    if (!showConflicts) return false;
    return bookings.some(
      (other) =>
        other.id !== booking.id &&
        other.equipmentId === booking.equipmentId &&
        rangesOverlap(booking.startDate, booking.endDate, other.startDate, other.endDate)
    );
  }

  const chartHeight = rows.length * ROW_HEIGHT + 60; // 60 for headers

  return (
    <div
      className="border border-gray-200 rounded-lg overflow-hidden bg-white"
      style={{ height: height || undefined }}
    >
      <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: height || '600px' }}>
        <div style={{ width: totalWidth, minWidth: '100%', position: 'relative' }}>
          {/* Month header */}
          <div
            style={{
              height: 28,
              display: 'flex',
              position: 'sticky',
              top: 0,
              zIndex: 20,
              backgroundColor: '#0f172a',
            }}
          >
            {/* Label column header */}
            <div
              style={{
                width: LABEL_WIDTH,
                minWidth: LABEL_WIDTH,
                borderRight: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 12,
                position: 'sticky',
                left: 0,
                zIndex: 30,
                backgroundColor: '#0f172a',
              }}
            >
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                {groupBy === 'equipment' ? 'Equipment' : 'Deliverable'}
              </span>
            </div>
            {/* Month spans */}
            {months.map((m) => {
              const mStart = m > startDate ? m : startDate;
              const nextMonth = addDays(
                formatDate(new Date(m.slice(0, 7) + '-01T00:00:00').setMonth(
                  new Date(m.slice(0, 7) + '-01T00:00:00').getMonth() + 1
                )),
                0
              );
              const mEnd = nextMonth <= endDate ? addDays(nextMonth, -1) : endDate;
              const mDays = daysBetween(mStart, mEnd);
              const left = getLeft(mStart);

              return (
                <div
                  key={m}
                  style={{
                    position: 'absolute',
                    left,
                    width: mDays * dayWidth,
                    height: '100%',
                    borderRight: '1px solid #334155',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 8,
                    overflow: 'hidden',
                  }}
                >
                  <span className="text-xs font-medium text-slate-200 whitespace-nowrap">
                    {monthLabel(m)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Day header */}
          <div
            style={{
              height: 24,
              display: 'flex',
              borderBottom: '2px solid #e5e7eb',
              position: 'sticky',
              top: 28,
              zIndex: 20,
              backgroundColor: '#f8fafc',
            }}
          >
            {/* Label spacer */}
            <div
              style={{
                width: LABEL_WIDTH,
                minWidth: LABEL_WIDTH,
                borderRight: '1px solid #e5e7eb',
                position: 'sticky',
                left: 0,
                zIndex: 30,
                backgroundColor: '#f8fafc',
              }}
            />
            {/* Day numbers — only show every 7 days or every day if wide enough */}
            {Array.from({ length: totalDays }, (_, i) => {
              const dateStr = addDays(startDate, i);
              const d = new Date(dateStr + 'T00:00:00');
              const dayNum = d.getDate();
              const isMonday = d.getDay() === 1;
              const isFirst = dayNum === 1;

              if (!isMonday && !isFirst && dayWidth < 30) return null;

              return (
                <div
                  key={dateStr}
                  style={{
                    position: 'absolute',
                    left: LABEL_WIDTH + i * dayWidth,
                    width: dayWidth,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    className={`text-xs ${isFirst ? 'font-semibold text-teal-700' : 'text-gray-400'}`}
                    style={{ fontSize: 10 }}
                  >
                    {dayNum}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Rows */}
          {rows.map(({ key, bookings: rowBookings }, rowIndex) => {
            const label = rowLabels[key] || key;
            const isEven = rowIndex % 2 === 0;

            return (
              <div
                key={key}
                style={{
                  height: ROW_HEIGHT,
                  position: 'relative',
                  backgroundColor: isEven ? '#fff' : '#f9fafb',
                  borderBottom: '1px solid #f3f4f6',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {/* Row label */}
                <div
                  style={{
                    width: LABEL_WIDTH,
                    minWidth: LABEL_WIDTH,
                    paddingLeft: 12,
                    paddingRight: 8,
                    position: 'sticky',
                    left: 0,
                    zIndex: 10,
                    backgroundColor: isEven ? '#fff' : '#f9fafb',
                    borderRight: '1px solid #e5e7eb',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <span
                    className="text-xs text-gray-700 font-medium truncate"
                    title={label}
                    style={{ maxWidth: LABEL_WIDTH - 24 }}
                  >
                    {label}
                  </span>
                </div>

                {/* Grid lines for months */}
                {months.map((m) => {
                  const mStart = m > startDate ? m : startDate;
                  const left = getLeft(mStart);
                  return (
                    <div
                      key={m}
                      style={{
                        position: 'absolute',
                        left,
                        top: 0,
                        bottom: 0,
                        width: 1,
                        backgroundColor: '#e5e7eb',
                        zIndex: 1,
                      }}
                    />
                  );
                })}

                {/* Booking bars */}
                {rowBookings.map((booking) => {
                  if (!booking.startDate || !booking.endDate) return null;
                  if (booking.endDate < startDate || booking.startDate > endDate) return null;

                  const clampedStart = booking.startDate < startDate ? startDate : booking.startDate;
                  const clampedEnd = booking.endDate > endDate ? endDate : booking.endDate;
                  const duration = daysBetween(clampedStart, clampedEnd);

                  const left = getLeft(clampedStart);
                  const width = getWidth(duration);
                  const color = getColor(booking.projectId);
                  const conflict = hasConflict(booking);

                  return (
                    <div
                      key={booking.id}
                      title={`${booking.projectName || 'Project'}\n${formatDisplayDate(booking.startDate)} — ${formatDisplayDate(booking.endDate)}\n${booking.durationDays} days`}
                      style={{
                        position: 'absolute',
                        left,
                        width,
                        height: ROW_HEIGHT - 10,
                        top: 5,
                        borderRadius: 5,
                        backgroundColor: color,
                        zIndex: 5,
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: 6,
                        paddingRight: 6,
                        overflow: 'hidden',
                        cursor: 'default',
                        boxShadow: conflict ? `0 0 0 2px #ef4444, 0 1px 3px rgba(0,0,0,0.2)` : '0 1px 3px rgba(0,0,0,0.15)',
                        opacity: 0.9,
                      }}
                    >
                      <span
                        className="text-white font-medium truncate"
                        style={{ fontSize: 10, lineHeight: 1 }}
                      >
                        {booking.projectName || booking.projectId}
                      </span>
                      {conflict && (
                        <span
                          className="ml-1 text-red-100 font-bold shrink-0"
                          style={{ fontSize: 10 }}
                        >
                          !
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Today line */}
          {(() => {
            const todayStr = formatDate(new Date());
            if (todayStr >= startDate && todayStr <= endDate) {
              const left = getLeft(todayStr);
              return (
                <div
                  style={{
                    position: 'absolute',
                    left,
                    top: 52,
                    bottom: 0,
                    width: 2,
                    backgroundColor: '#f97316',
                    zIndex: 15,
                    pointerEvents: 'none',
                  }}
                  title="Today"
                />
              );
            }
            return null;
          })()}
        </div>
      </div>

      {/* Legend */}
      {projects.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-3">
          {projects.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: PROJECT_COLORS[i % PROJECT_COLORS.length] }}
              />
              {p.name}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
            Today
          </span>
        </div>
      )}
    </div>
  );
}
