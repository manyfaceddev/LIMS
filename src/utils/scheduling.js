import { addDays, computeEndDate, rangesOverlap, formatDate } from './dates.js';

/**
 * Check if a given equipment is booked during the specified date range.
 * Returns the conflicting booking(s) or an empty array.
 *
 * @param {Array} allBookings - flat array of all bookings across all projects
 * @param {string} equipmentId
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD (inclusive)
 * @param {string|null} excludeBookingId - optional booking id to exclude (for edits)
 * @returns {Array} conflicting bookings
 */
export function checkConflict(allBookings, equipmentId, startDate, endDate, excludeBookingId = null) {
  return allBookings.filter((b) => {
    if (b.equipmentId !== equipmentId) return false;
    if (excludeBookingId && b.id === excludeBookingId) return false;
    return rangesOverlap(startDate, endDate, b.startDate, b.endDate);
  });
}

/**
 * Find the next available start date for an equipment item,
 * starting from requestedStart, for a given duration.
 *
 * @param {Array} allBookings
 * @param {string} equipmentId
 * @param {string} requestedStart - YYYY-MM-DD
 * @param {number} durationDays
 * @param {string|null} excludeBookingId
 * @returns {string} next available start date (YYYY-MM-DD)
 */
export function findNextAvailableDate(allBookings, equipmentId, requestedStart, durationDays, excludeBookingId = null) {
  let candidate = requestedStart;
  let iterations = 0;
  const maxIterations = 365 * 2; // safety cap

  while (iterations < maxIterations) {
    const candidateEnd = computeEndDate(candidate, durationDays);
    const conflicts = checkConflict(allBookings, equipmentId, candidate, candidateEnd, excludeBookingId);

    if (conflicts.length === 0) {
      return candidate;
    }

    // Move candidate to the day after the latest conflict end
    const latestEnd = conflicts.reduce((max, b) => (b.endDate > max ? b.endDate : max), '');
    candidate = addDays(latestEnd, 1);
    iterations++;
  }

  return candidate;
}

/**
 * Collect all bookings from a projects array into a flat array.
 */
export function flattenBookings(projects) {
  const bookings = [];
  for (const project of projects) {
    for (const deliverable of (project.deliverables || [])) {
      for (const booking of (deliverable.bookings || [])) {
        bookings.push({ ...booking, projectId: project.id, projectName: project.name });
      }
    }
  }
  return bookings;
}

/**
 * Given a list of projects and equipment list, return bookings enriched with
 * project color, equipment name, etc.
 */
export const PROJECT_COLORS = [
  '#0d9488', // teal-600
  '#7c3aed', // violet-600
  '#dc2626', // red-600
  '#d97706', // amber-600
  '#2563eb', // blue-600
  '#16a34a', // green-600
  '#db2777', // pink-600
  '#ea580c', // orange-600
  '#0891b2', // cyan-600
  '#65a30d', // lime-600
];

export function getProjectColor(projectId, projects) {
  const idx = projects.findIndex((p) => p.id === projectId);
  return PROJECT_COLORS[idx % PROJECT_COLORS.length] || PROJECT_COLORS[0];
}

/**
 * Compute total cost for a set of bookings given equipment map.
 */
export function computeTotalCost(bookings, equipmentMap) {
  return bookings.reduce((total, b) => {
    const eq = equipmentMap[b.equipmentId];
    if (!eq) return total;
    return total + eq.costPerDay * b.durationDays;
  }, 0);
}

/**
 * Generate a unique ID with a given prefix.
 */
export function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Get bookings upcoming within the next N days from today.
 */
export function getUpcomingBookings(allBookings, days = 7) {
  const now = formatDate(new Date());
  const future = addDays(now, days);
  return allBookings.filter((b) => b.startDate >= now && b.startDate <= future);
}
