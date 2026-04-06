import React, { createContext, useContext, useReducer, useEffect, useMemo } from 'react';
import { labs } from '../data/labs.js';
import { equipment } from '../data/equipment.js';
import { seedData } from '../data/seed.js';
import {
  checkConflict,
  findNextAvailableDate,
  flattenBookings,
  generateId,
} from '../utils/scheduling.js';
import { computeEndDate } from '../utils/dates.js';

const STORAGE_KEY = 'ADRIC_scheduler_data';

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

  // Derived: all bookings flat
  const allBookings = useMemo(() => flattenBookings(state.projects), [state.projects]);

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
   * Add a booking with conflict checking.
   * Returns { success, conflicts, booking }
   */
  function addBooking(projectId, deliverableId, booking) {
    const endDate = booking.endDate || computeEndDate(booking.startDate, booking.durationDays);
    const bookingWithEnd = { ...booking, endDate };

    const conflicts = checkConflict(
      allBookings,
      booking.equipmentId,
      booking.startDate,
      endDate,
      null
    );

    if (conflicts.length > 0) {
      return { success: false, conflicts, booking: bookingWithEnd };
    }

    dispatch({
      type: 'ADD_BOOKING',
      payload: { projectId, deliverableId, booking: bookingWithEnd },
    });
    return { success: true, conflicts: [], booking: bookingWithEnd };
  }

  function addBookingForced(projectId, deliverableId, booking) {
    const endDate = booking.endDate || computeEndDate(booking.startDate, booking.durationDays);
    const bookingWithEnd = { ...booking, endDate };
    dispatch({
      type: 'ADD_BOOKING',
      payload: { projectId, deliverableId, booking: bookingWithEnd },
    });
    return { success: true, booking: bookingWithEnd };
  }

  function updateBooking(projectId, deliverableId, booking) {
    const endDate = booking.endDate || computeEndDate(booking.startDate, booking.durationDays);
    const bookingWithEnd = { ...booking, endDate };

    const conflicts = checkConflict(
      allBookings,
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
    return findNextAvailableDate(allBookings, equipmentId, requestedStart, durationDays, excludeBookingId);
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
        addProject,
        updateProject,
        deleteProject,
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
