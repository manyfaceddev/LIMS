import React, { createContext, useContext, useReducer, useEffect, useMemo } from 'react';
import { labs } from '../data/labs.js';
import { equipment } from '../data/equipment.js';
import { seedData } from '../data/seed.js';
import {
  checkConflict,
  findNextAvailableDate,
  flattenBookings,
  flattenConfirmedBookings,
  generateId,
} from '../utils/scheduling.js';
import { computeEndDate } from '../utils/dates.js';

const STORAGE_KEY = 'ADRIC_scheduler_data';

// Draft-phase statuses — bookings are tentative, not yet reserving equipment
const DRAFT_PHASE_STATUSES = new Set(['Draft', 'Pending Approval', 'Approved']);

// ─── Reducer ────────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD':
      return { ...state, projects: action.payload };

    case 'ADD_PROJECT': {
      const project = {
        ...action.payload,
        id: action.payload.id || generateId('proj'),
        deliverables: action.payload.deliverables || [],
        createdAt: action.payload.createdAt || new Date().toISOString().slice(0, 10),
      };
      return { ...state, projects: [...state.projects, project] };
    }

    case 'UPDATE_PROJECT': {
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.id ? { ...p, ...action.payload } : p
        ),
      };
    }

    case 'DELETE_PROJECT': {
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.payload),
      };
    }

    case 'TRANSITION_STATUS': {
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.projectId
            ? { ...p, status: action.payload.status }
            : p
        ),
      };
    }

    // Apply the full set of conflict-resolved + confirmed bookings to a project,
    // and advance its status to 'Active'.
    case 'APPLY_CONFIRMED_BOOKINGS': {
      const { projectId, resolvedBookings } = action.payload;
      // Build lookup: deliverableId -> bookingId -> resolved booking
      const byDel = {};
      for (const { deliverableId, booking } of resolvedBookings) {
        if (!byDel[deliverableId]) byDel[deliverableId] = {};
        byDel[deliverableId][booking.id] = booking;
      }
      return {
        ...state,
        projects: state.projects.map((p) => {
          if (p.id !== projectId) return p;
          return {
            ...p,
            status: 'Active',
            deliverables: (p.deliverables || []).map((d) => ({
              ...d,
              bookings: (d.bookings || []).map((b) =>
                byDel[d.id]?.[b.id] ? byDel[d.id][b.id] : b
              ),
            })),
          };
        }),
      };
    }

    case 'ADD_DELIVERABLE': {
      const deliverable = {
        ...action.payload.deliverable,
        id: action.payload.deliverable.id || generateId('del'),
        projectId: action.payload.projectId,
        bookings: action.payload.deliverable.bookings || [],
      };
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.projectId
            ? { ...p, deliverables: [...(p.deliverables || []), deliverable] }
            : p
        ),
      };
    }

    case 'UPDATE_DELIVERABLE': {
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.projectId
            ? {
                ...p,
                deliverables: (p.deliverables || []).map((d) =>
                  d.id === action.payload.deliverable.id
                    ? { ...d, ...action.payload.deliverable }
                    : d
                ),
              }
            : p
        ),
      };
    }

    case 'DELETE_DELIVERABLE': {
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.projectId
            ? {
                ...p,
                deliverables: (p.deliverables || []).filter(
                  (d) => d.id !== action.payload.deliverableId
                ),
              }
            : p
        ),
      };
    }

    case 'ADD_BOOKING': {
      const booking = {
        ...action.payload.booking,
        id: action.payload.booking.id || generateId('bkg'),
        projectId: action.payload.projectId,
        deliverableId: action.payload.deliverableId,
      };
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.projectId
            ? {
                ...p,
                deliverables: (p.deliverables || []).map((d) =>
                  d.id === action.payload.deliverableId
                    ? { ...d, bookings: [...(d.bookings || []), booking] }
                    : d
                ),
              }
            : p
        ),
      };
    }

    case 'UPDATE_BOOKING': {
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.projectId
            ? {
                ...p,
                deliverables: (p.deliverables || []).map((d) =>
                  d.id === action.payload.deliverableId
                    ? {
                        ...d,
                        bookings: (d.bookings || []).map((b) =>
                          b.id === action.payload.booking.id
                            ? { ...b, ...action.payload.booking }
                            : b
                        ),
                      }
                    : d
                ),
              }
            : p
        ),
      };
    }

    case 'DELETE_BOOKING': {
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.projectId
            ? {
                ...p,
                deliverables: (p.deliverables || []).map((d) =>
                  d.id === action.payload.deliverableId
                    ? {
                        ...d,
                        bookings: (d.bookings || []).filter(
                          (b) => b.id !== action.payload.bookingId
                        ),
                      }
                    : d
                ),
              }
            : p
        ),
      };
    }

    default:
      return state;
  }
}

// ─── Initial state ───────────────────────────────────────────────────────────

function loadInitialState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.projects)) {
        return { projects: parsed.projects };
      }
    }
  } catch (_) {}
  return { projects: seedData.projects };
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, loadInitialState);

  // Persist on every state change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }, [state]);

  // Derived: equipment lookup map
  const equipmentMap = useMemo(() => {
    const map = {};
    for (const eq of equipment) map[eq.id] = eq;
    return map;
  }, []);

  // Derived: labs lookup map
  const labsMap = useMemo(() => {
    const map = {};
    for (const lab of labs) map[lab.id] = lab;
    return map;
  }, []);

  // Derived: all bookings flat (for display/Gantt)
  const allBookings = useMemo(() => flattenBookings(state.projects), [state.projects]);

  // Derived: confirmed bookings only (for conflict detection)
  const confirmedBookings = useMemo(
    () => flattenConfirmedBookings(state.projects),
    [state.projects]
  );

  // ─── Actions ──────────────────────────────────────────────────────────────

  function addProject(project) {
    dispatch({ type: 'ADD_PROJECT', payload: project });
    return project.id || generateId('proj');
  }

  function updateProject(project) {
    dispatch({ type: 'UPDATE_PROJECT', payload: project });
  }

  function deleteProject(projectId) {
    dispatch({ type: 'DELETE_PROJECT', payload: projectId });
  }

  /** Move a project through the workflow status pipeline. */
  function transitionStatus(projectId, newStatus) {
    dispatch({ type: 'TRANSITION_STATUS', payload: { projectId, status: newStatus } });
  }

  /**
   * Preview the result of confirming all tentative bookings on an Approved project.
   * Runs conflict resolution against confirmed bookings from OTHER projects,
   * and also prevents intra-project equipment double-booking.
   *
   * Returns { scheduled: [], rescheduled: [{ booking, eqName, originalStart, originalEnd, newStart, newEnd }], resolvedBookings: [] }
   * Does NOT commit anything — call applyConfirmedBookings() to commit.
   */
  function previewConfirmBookings(projectId) {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return null;

    // Confirmed bookings from other projects only
    const otherConfirmed = confirmedBookings.filter((b) => b.projectId !== projectId);

    const scheduled = [];
    const rescheduled = [];
    const resolvedBookings = [];
    const addedSoFar = []; // track intra-project confirmed slots as we go

    for (const deliverable of (project.deliverables || [])) {
      for (const booking of (deliverable.bookings || [])) {
        const checkPool = [...otherConfirmed, ...addedSoFar];
        const endDate = computeEndDate(booking.startDate, booking.durationDays);
        const conflicts = checkConflict(checkPool, booking.equipmentId, booking.startDate, endDate, null);

        if (conflicts.length === 0) {
          const resolved = { ...booking, confirmed: true, endDate, autoScheduled: false };
          scheduled.push(booking);
          resolvedBookings.push({ deliverableId: deliverable.id, booking: resolved });
          addedSoFar.push({ ...resolved, projectId });
        } else {
          const newStart = findNextAvailableDate(
            checkPool, booking.equipmentId, booking.startDate, booking.durationDays, null
          );
          const newEnd = computeEndDate(newStart, booking.durationDays);
          const eq = equipmentMap[booking.equipmentId];
          rescheduled.push({
            booking,
            eqName: eq?.name || booking.equipmentId,
            originalStart: booking.startDate,
            originalEnd: endDate,
            newStart,
            newEnd,
            conflictProject: conflicts[0]?.projectName || 'another project',
          });
          const resolved = { ...booking, confirmed: true, startDate: newStart, endDate: newEnd, autoScheduled: true };
          resolvedBookings.push({ deliverableId: deliverable.id, booking: resolved });
          addedSoFar.push({ ...resolved, projectId });
        }
      }
    }

    return { scheduled, rescheduled, resolvedBookings };
  }

  /** Commit confirmed bookings and advance project to Active. */
  function applyConfirmedBookings(projectId, resolvedBookings) {
    dispatch({ type: 'APPLY_CONFIRMED_BOOKINGS', payload: { projectId, resolvedBookings } });
  }

  function addDeliverable(projectId, deliverable) {
    dispatch({ type: 'ADD_DELIVERABLE', payload: { projectId, deliverable } });
  }

  function updateDeliverable(projectId, deliverable) {
    dispatch({ type: 'UPDATE_DELIVERABLE', payload: { projectId, deliverable } });
  }

  function deleteDeliverable(projectId, deliverableId) {
    dispatch({ type: 'DELETE_DELIVERABLE', payload: { projectId, deliverableId } });
  }

  /**
   * Add a booking, with behaviour depending on project phase:
   *
   * Draft / Pending Approval / Approved (tentative phase):
   *   - Checks against confirmedBookings only
   *   - Auto-schedules to next available if conflict found
   *   - Stores booking as confirmed: false
   *   - Always returns { success: true, booking, wasRescheduled }
   *
   * Active / Completed (confirmed phase):
   *   - Checks against confirmedBookings
   *   - Returns { success: false, conflicts } if conflict exists (user must resolve)
   *   - Stores booking as confirmed: true on success
   */
  function addBooking(projectId, deliverableId, booking) {
    const project = state.projects.find((p) => p.id === projectId);
    const isDraftPhase = !project || DRAFT_PHASE_STATUSES.has(project.status);
    const endDate = booking.endDate || computeEndDate(booking.startDate, booking.durationDays);

    if (isDraftPhase) {
      // Check against confirmed bookings only; auto-schedule if needed
      const conflicts = checkConflict(confirmedBookings, booking.equipmentId, booking.startDate, endDate, null);
      let finalStart = booking.startDate;
      let wasRescheduled = false;

      if (conflicts.length > 0) {
        finalStart = findNextAvailableDate(
          confirmedBookings, booking.equipmentId, booking.startDate, booking.durationDays, null
        );
        wasRescheduled = true;
      }

      const finalEnd = computeEndDate(finalStart, booking.durationDays);
      const bookingFinal = {
        ...booking,
        id: booking.id || generateId('bkg'),
        startDate: finalStart,
        endDate: finalEnd,
        confirmed: false,
        autoScheduled: wasRescheduled,
      };
      dispatch({ type: 'ADD_BOOKING', payload: { projectId, deliverableId, booking: bookingFinal } });
      return { success: true, booking: bookingFinal, wasRescheduled, conflicts };
    }

    // Active project: hard conflict check against confirmed bookings
    const bookingWithEnd = { ...booking, endDate };
    const conflicts = checkConflict(confirmedBookings, booking.equipmentId, booking.startDate, endDate, null);

    if (conflicts.length > 0) {
      return { success: false, conflicts, booking: bookingWithEnd };
    }

    const bookingConfirmed = { ...bookingWithEnd, confirmed: true, autoScheduled: false };
    dispatch({ type: 'ADD_BOOKING', payload: { projectId, deliverableId, booking: bookingConfirmed } });
    return { success: true, conflicts: [], booking: bookingConfirmed, wasRescheduled: false };
  }

  function addBookingForced(projectId, deliverableId, booking) {
    const endDate = booking.endDate || computeEndDate(booking.startDate, booking.durationDays);
    const bookingWithEnd = { ...booking, endDate, confirmed: true };
    dispatch({ type: 'ADD_BOOKING', payload: { projectId, deliverableId, booking: bookingWithEnd } });
    return { success: true, booking: bookingWithEnd };
  }

  function updateBooking(projectId, deliverableId, booking) {
    const endDate = booking.endDate || computeEndDate(booking.startDate, booking.durationDays);
    const bookingWithEnd = { ...booking, endDate };

    const conflicts = checkConflict(
      confirmedBookings,
      booking.equipmentId,
      booking.startDate,
      endDate,
      booking.id
    );

    if (conflicts.length > 0) {
      return { success: false, conflicts, booking: bookingWithEnd };
    }

    dispatch({
      type: 'UPDATE_BOOKING',
      payload: { projectId, deliverableId, booking: bookingWithEnd },
    });
    return { success: true, conflicts: [], booking: bookingWithEnd };
  }

  function deleteBooking(projectId, deliverableId, bookingId) {
    dispatch({ type: 'DELETE_BOOKING', payload: { projectId, deliverableId, bookingId } });
  }

  function getNextAvailableDate(equipmentId, requestedStart, durationDays, excludeBookingId = null) {
    return findNextAvailableDate(confirmedBookings, equipmentId, requestedStart, durationDays, excludeBookingId);
  }

  function resetToSeedData() {
    dispatch({ type: 'LOAD', payload: seedData.projects });
  }

  return (
    <AppContext.Provider
      value={{
        projects: state.projects,
        labs,
        equipment,
        equipmentMap,
        labsMap,
        allBookings,
        confirmedBookings,
        addProject,
        updateProject,
        deleteProject,
        transitionStatus,
        previewConfirmBookings,
        applyConfirmedBookings,
        addDeliverable,
        updateDeliverable,
        deleteDeliverable,
        addBooking,
        addBookingForced,
        updateBooking,
        deleteBooking,
        getNextAvailableDate,
        resetToSeedData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
