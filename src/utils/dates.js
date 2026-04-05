/**
 * Add days to a date string (YYYY-MM-DD) and return a new date string.
 */
export function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

/**
 * Format a Date object as YYYY-MM-DD.
 */
export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format a date string as a human-readable label (e.g. "Apr 1, 2026").
 */
export function formatDisplayDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Return today as a YYYY-MM-DD string.
 */
export function today() {
  return formatDate(new Date());
}

/**
 * Compute end date given a start date and duration in days (end is inclusive last day).
 */
export function computeEndDate(startDate, durationDays) {
  return addDays(startDate, durationDays - 1);
}

/**
 * Return the number of days between two date strings (inclusive).
 */
export function daysBetween(startStr, endStr) {
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  return Math.round((end - start) / 86400000) + 1;
}

/**
 * Return an array of date strings between start and end (inclusive).
 */
export function dateRange(startStr, endStr) {
  const dates = [];
  let current = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * Given a date string, return the Monday of that week.
 */
export function startOfWeek(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return formatDate(date);
}

/**
 * Return array of week-start dates between two dates.
 */
export function weeksBetween(startStr, endStr) {
  const weeks = [];
  let current = new Date(startOfWeek(startStr) + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (current <= end) {
    weeks.push(formatDate(current));
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

/**
 * Return array of months (first day of each month) between two dates.
 */
export function monthsBetween(startStr, endStr) {
  const months = [];
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  while (current <= end) {
    months.push(formatDate(current));
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

/**
 * Short month label for a date string.
 */
export function monthLabel(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Check if a date string is between start and end (inclusive).
 */
export function isBetween(dateStr, startStr, endStr) {
  return dateStr >= startStr && dateStr <= endStr;
}

/**
 * Return true if two date ranges overlap.
 */
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && aEnd >= bStart;
}

/**
 * Format a duration in days as a readable string.
 */
export function formatDuration(days) {
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  const weeks = Math.floor(days / 7);
  const rem = days % 7;
  if (rem === 0) return `${weeks} week${weeks > 1 ? 's' : ''}`;
  return `${weeks}w ${rem}d`;
}
