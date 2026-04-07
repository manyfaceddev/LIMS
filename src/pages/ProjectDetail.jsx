import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Edit2, Plus, Trash2, ChevronDown, ChevronUp,
  AlertTriangle, Calendar, DollarSign, ArrowLeft, Save, X,
  CheckCircle, Clock, Send, ThumbsUp, ThumbsDown, Zap, Check,
} from 'lucide-react';
import Layout from '../components/Layout.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import GanttChart from '../components/GanttChart.jsx';
import EquipmentSelector from '../components/EquipmentSelector.jsx';
import { useApp } from '../context/AppContext.jsx';
import { computeTotalCost, generateId } from '../utils/scheduling.js';
import { computeEndDate, formatDisplayDate, today, addDays } from '../utils/dates.js';

// Statuses where bookings are tentative (not yet reserving equipment)
const DRAFT_PHASE = new Set(['Draft', 'Pending Approval', 'Approved']);

// Workflow pipeline
const STATUS_PIPELINE = ['Draft', 'Pending Approval', 'Approved', 'Active', 'Completed'];

// ─── Workflow Panel ──────────────────────────────────────────────────────────

function WorkflowPanel({ project, onTransition, onConfirmBookings }) {
  const currentIdx = STATUS_PIPELINE.indexOf(project.status);

  const stepColors = {
    'Draft':            { active: 'bg-gray-700 text-white', done: 'bg-gray-200 text-gray-600', pending: 'bg-gray-100 text-gray-400' },
    'Pending Approval': { active: 'bg-amber-500 text-white', done: 'bg-amber-100 text-amber-700', pending: 'bg-gray-100 text-gray-400' },
    'Approved':         { active: 'bg-blue-600 text-white', done: 'bg-blue-100 text-blue-700', pending: 'bg-gray-100 text-gray-400' },
    'Active':           { active: 'bg-emerald-600 text-white', done: 'bg-emerald-100 text-emerald-700', pending: 'bg-gray-100 text-gray-400' },
    'Completed':        { active: 'bg-purple-600 text-white', done: 'bg-purple-100 text-purple-700', pending: 'bg-gray-100 text-gray-400' },
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Pipeline steps */}
      <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-1">
        {STATUS_PIPELINE.map((s, i) => {
          const isDone = i < currentIdx;
          const isActive = i === currentIdx;
          const colors = stepColors[s] || stepColors['Draft'];
          const cls = isActive ? colors.active : isDone ? colors.done : colors.pending;
          return (
            <div key={s} className="flex items-center gap-1 shrink-0">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${cls}`}>
                {isDone && <Check size={11} />}
                {s}
              </div>
              {i < STATUS_PIPELINE.length - 1 && (
                <div className={`w-6 h-0.5 ${i < currentIdx ? 'bg-teal-300' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Action area */}
      <div className="flex flex-wrap items-center gap-3">
        {project.status === 'Draft' && (
          <>
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Clock size={14} />
              <span>Build your tentative schedule, then submit for approval.</span>
            </div>
            <button
              onClick={() => onTransition('Pending Approval')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors"
            >
              <Send size={14} />
              Submit for Approval
            </button>
          </>
        )}

        {project.status === 'Pending Approval' && (
          <>
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Clock size={14} />
              <span>Awaiting manager review. Tentative schedule is locked.</span>
            </div>
            <button
              onClick={() => onTransition('Approved')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ThumbsUp size={14} />
              Approve Project
            </button>
            <button
              onClick={() => onTransition('Draft')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <ThumbsDown size={14} />
              Reject → Back to Draft
            </button>
          </>
        )}

        {project.status === 'Approved' && (
          <>
            <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <CheckCircle size={14} />
              <span>Project approved. Confirm bookings to reserve equipment and go Active.</span>
            </div>
            <button
              onClick={onConfirmBookings}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Zap size={14} />
              Confirm & Book All Equipment
            </button>
          </>
        )}

        {project.status === 'Active' && (
          <>
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle size={14} />
              <span>All equipment booked. Work in progress.</span>
            </div>
            <button
              onClick={() => onTransition('Completed')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Check size={14} />
              Mark as Completed
            </button>
          </>
        )}

        {project.status === 'Completed' && (
          <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
            <CheckCircle size={14} />
            <span>Project completed. All deliverables finished.</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Confirm Bookings Modal ──────────────────────────────────────────────────

function ConfirmBookingsModal({ open, onClose, preview, onConfirm }) {
  if (!preview) return null;
  const { scheduled, rescheduled } = preview;
  const total = scheduled.length + rescheduled.length;

  return (
    <Modal isOpen={open} onClose={onClose} title="Confirm & Book All Equipment" size="lg">
      <div className="space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{scheduled.length}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Scheduled as requested</p>
          </div>
          <div className={`border rounded-lg px-4 py-3 text-center ${rescheduled.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-2xl font-bold ${rescheduled.length > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{rescheduled.length}</p>
            <p className={`text-xs mt-0.5 ${rescheduled.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>Auto-rescheduled</p>
          </div>
        </div>

        {/* Rescheduled details */}
        {rescheduled.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-amber-600 shrink-0" />
              <p className="text-sm font-medium text-amber-800">
                The following items were auto-rescheduled to avoid conflicts:
              </p>
            </div>
            <div className="border border-amber-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-amber-50 border-b border-amber-200">
                    <th className="text-left px-4 py-2.5 font-semibold text-amber-800">Equipment</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-amber-800">Requested</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-amber-800">Auto-Scheduled To</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-amber-800">Conflict With</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {rescheduled.map((r, i) => (
                    <tr key={i} className="bg-white">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.eqName}</td>
                      <td className="px-4 py-2.5 text-gray-500 line-through">
                        {formatDisplayDate(r.originalStart)} — {formatDisplayDate(r.originalEnd)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-emerald-700">
                        {formatDisplayDate(r.newStart)} — {formatDisplayDate(r.newEnd)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{r.conflictProject}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {rescheduled.length === 0 && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <CheckCircle size={15} className="text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-700">
              All {total} equipment items are available on their requested dates. No conflicts found.
            </p>
          </div>
        )}

        <p className="text-sm text-gray-600">
          Confirming will reserve all {total} equipment slots and move this project to <strong>Active</strong>.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Zap size={14} />
            Confirm All Bookings
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Booking Modal ───────────────────────────────────────────────────────────

function BookingModal({ open, onClose, projectId, deliverableId, existingBooking, projectStatus }) {
  const { equipmentMap, addBooking, updateBooking, getNextAvailableDate, confirmedBookings } = useApp();

  const [equipmentId, setEquipmentId] = useState(existingBooking?.equipmentId || '');
  const [startDate, setStartDate] = useState(existingBooking?.startDate || today());
  const [duration, setDuration] = useState(existingBooking?.durationDays || 5);
  const [notes, setNotes] = useState(existingBooking?.notes || '');
  const [conflictInfo, setConflictInfo] = useState(null);
  const [rescheduledTo, setRescheduledTo] = useState(null);
  const [saving, setSaving] = useState(false);

  const isDraftPhase = DRAFT_PHASE.has(projectStatus);

  const endDate = useMemo(
    () => (startDate && duration ? computeEndDate(startDate, Number(duration)) : ''),
    [startDate, duration]
  );

  const selectedEq = equipmentId ? equipmentMap[equipmentId] : null;
  const estimatedCost = selectedEq ? selectedEq.costPerDay * Number(duration) : 0;

  function handleAutoSchedule() {
    if (!equipmentId || !startDate || !duration) return;
    const next = getNextAvailableDate(equipmentId, startDate, Number(duration), existingBooking?.id);
    setStartDate(next);
    setConflictInfo(null);
    setRescheduledTo(null);
  }

  function handleSave() {
    if (!equipmentId || !startDate || !duration) return;
    setSaving(true);

    const booking = {
      id: existingBooking?.id || generateId('bkg'),
      equipmentId,
      startDate,
      endDate,
      durationDays: Number(duration),
      notes,
    };

    let result;
    if (existingBooking) {
      result = updateBooking(projectId, deliverableId, booking);
    } else {
      result = addBooking(projectId, deliverableId, booking);
    }

    setSaving(false);

    if (!result.success) {
      setConflictInfo(result.conflicts);
      setRescheduledTo(null);
    } else {
      if (result.wasRescheduled) {
        setRescheduledTo(result.booking.startDate);
      }
      onClose();
    }
  }

  const modalTitle = existingBooking ? 'Edit Booking' : (isDraftPhase ? 'Add to Tentative Schedule' : 'Add Equipment Booking');

  return (
    <Modal isOpen={open} onClose={onClose} title={modalTitle} size="md">
      <div className="space-y-4">
        {/* Tentative notice */}
        {isDraftPhase && !existingBooking && (
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
            <Clock size={14} className="text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700">
              This booking will be added as <strong>tentative</strong>. Equipment is not reserved until the project is Approved and bookings are confirmed.
            </p>
          </div>
        )}

        {/* Equipment selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Equipment</label>
          <EquipmentSelector
            value={equipmentId}
            onChange={(id) => { setEquipmentId(id); setConflictInfo(null); setRescheduledTo(null); }}
          />
        </div>

        {/* Date + duration */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {isDraftPhase ? 'Preferred Start Date' : 'Start Date'}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setConflictInfo(null); setRescheduledTo(null); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Duration (days)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={duration}
              onChange={(e) => { setDuration(e.target.value); setConflictInfo(null); setRescheduledTo(null); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* End date preview */}
        {endDate && (
          <p className="text-xs text-gray-500">
            End date: <span className="font-medium text-gray-700">{formatDisplayDate(endDate)}</span>
          </p>
        )}

        {/* Cost estimate */}
        {selectedEq && (
          <div className="bg-teal-50 rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-teal-700 font-medium">{selectedEq.name}</p>
              <p className="text-xs text-teal-600">${selectedEq.costPerDay.toLocaleString()}/day</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-teal-900">${estimatedCost.toLocaleString()}</p>
              <p className="text-xs text-teal-600">{isDraftPhase ? 'estimated (draft)' : 'total'}</p>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            placeholder="Add any relevant notes..."
          />
        </div>

        {/* Conflict warning (Active projects only) */}
        {conflictInfo && conflictInfo.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">Equipment already booked</p>
                {conflictInfo.map((c) => (
                  <p key={c.id} className="text-xs text-red-700 mt-1 font-medium">
                    • <strong>{selectedEq?.name}</strong> is booked {formatDisplayDate(c.startDate)} — {formatDisplayDate(c.endDate)} by <strong>{c.projectName || c.projectId}</strong>
                  </p>
                ))}
              </div>
            </div>
            <button
              onClick={handleAutoSchedule}
              className="mt-2 text-xs font-medium text-red-700 hover:text-red-900 underline"
            >
              Auto-schedule to next available date →
            </button>
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!equipmentId || !startDate || !duration || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save size={14} />
            {isDraftPhase ? 'Add to Tentative Schedule' : (existingBooking ? 'Update Booking' : 'Add Booking')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Deliverable Card ────────────────────────────────────────────────────────

function DeliverableCard({ deliverable, project }) {
  const { equipmentMap, labsMap, deleteBooking, deleteDeliverable } = useApp();
  const [expanded, setExpanded] = useState(true);
  const [addingBooking, setAddingBooking] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);

  const bookings = deliverable.bookings || [];
  const totalCost = computeTotalCost(bookings, equipmentMap);
  const isDraftPhase = DRAFT_PHASE.has(project.status);

  function handleDeleteBooking(bookingId) {
    deleteBooking(project.id, deliverable.id, bookingId);
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          <div>
            <p className="text-sm font-semibold text-gray-900">{deliverable.name}</p>
            {deliverable.description && (
              <p className="text-xs text-gray-500 mt-0.5">{deliverable.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          <span className="text-xs text-gray-500">{bookings.length} bookings</span>
          <span className="text-xs font-medium text-gray-700">
            ${totalCost.toLocaleString()}
            {isDraftPhase && <span className="text-gray-400 font-normal"> est.</span>}
          </span>
          <StatusBadge status={deliverable.status || 'Pending'} />
        </div>
      </button>

      {expanded && (
        <div className="px-5 py-4">
          {bookings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No equipment bookings yet.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {bookings.map((booking) => {
                const eq = equipmentMap[booking.equipmentId];
                const lab = eq ? labsMap[eq.labId] : null;
                const cost = eq ? eq.costPerDay * booking.durationDays : 0;
                const isTentative = booking.confirmed === false;

                return (
                  <div
                    key={booking.id}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg hover:border-gray-200 transition-colors ${
                      isTentative
                        ? 'bg-white border border-dashed border-amber-300'
                        : 'bg-white border border-gray-100'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isTentative ? 'bg-amber-400' : 'bg-teal-500'}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {eq?.name || booking.equipmentId}
                          </p>
                          {isTentative && (
                            <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium shrink-0">
                              Tentative
                            </span>
                          )}
                          {booking.autoScheduled && (
                            <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium shrink-0">
                              Auto-scheduled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          {lab?.name} &middot; {formatDisplayDate(booking.startDate)} — {formatDisplayDate(booking.endDate)} &middot; {booking.durationDays} days
                        </p>
                        {booking.notes && (
                          <p className="text-xs text-gray-400 italic mt-0.5">{booking.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <span className="text-sm font-medium text-gray-700">${cost.toLocaleString()}</span>
                      <button
                        onClick={() => setEditingBooking(booking)}
                        className="p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
                        title="Edit booking"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteBooking(booking.id)}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete booking"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setAddingBooking(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
            >
              <Plus size={14} />
              {isDraftPhase ? 'Add to Tentative Schedule' : 'Add Equipment Booking'}
            </button>
            <button
              onClick={() => deleteDeliverable(project.id, deliverable.id)}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              Remove deliverable
            </button>
          </div>
        </div>
      )}

      {addingBooking && (
        <BookingModal
          open={addingBooking}
          onClose={() => setAddingBooking(false)}
          projectId={project.id}
          deliverableId={deliverable.id}
          projectStatus={project.status}
        />
      )}
      {editingBooking && (
        <BookingModal
          open={!!editingBooking}
          onClose={() => setEditingBooking(null)}
          projectId={project.id}
          deliverableId={deliverable.id}
          existingBooking={editingBooking}
          projectStatus={project.status}
        />
      )}
    </div>
  );
}

// ─── Project Detail Page ─────────────────────────────────────────────────────

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const {
    projects, allBookings, equipmentMap, labsMap,
    updateProject, addDeliverable, transitionStatus,
    previewConfirmBookings, applyConfirmedBookings,
  } = useApp();

  const project = projects.find((p) => p.id === projectId);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [addDeliverableOpen, setAddDeliverableOpen] = useState(false);
  const [newDeliverable, setNewDeliverable] = useState({ name: '', description: '', status: 'Pending' });
  const [confirmPreview, setConfirmPreview] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  if (!project) {
    return (
      <Layout title="Project Not Found">
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">This project does not exist.</p>
          <button onClick={() => navigate('/projects')} className="text-teal-600 font-medium hover:underline">
            Back to Projects
          </button>
        </div>
      </Layout>
    );
  }

  const isDraftPhase = DRAFT_PHASE.has(project.status);

  const projectBookings = useMemo(
    () => allBookings.filter((b) => b.projectId === project.id),
    [allBookings, project.id]
  );

  const totalCost = computeTotalCost(projectBookings, equipmentMap);

  const ganttStart = useMemo(() => {
    const dates = projectBookings.map((b) => b.startDate).filter(Boolean);
    if (!dates.length) return today();
    return addDays(dates.reduce((a, b) => (a < b ? a : b)), -3);
  }, [projectBookings]);

  const ganttEnd = useMemo(() => {
    const dates = projectBookings.map((b) => b.endDate).filter(Boolean);
    if (!dates.length) return addDays(today(), 30);
    return addDays(dates.reduce((a, b) => (a > b ? a : b)), 3);
  }, [projectBookings]);

  const rowLabels = useMemo(() => {
    const map = {};
    for (const b of projectBookings) {
      if (!map[b.equipmentId]) {
        const eq = equipmentMap[b.equipmentId];
        map[b.equipmentId] = eq ? eq.name : b.equipmentId;
      }
    }
    return map;
  }, [projectBookings, equipmentMap]);

  function startEdit() {
    setEditForm({ name: project.name, client: project.client, description: project.description });
    setEditing(true);
  }

  function saveEdit() {
    updateProject({ ...project, ...editForm });
    setEditing(false);
  }

  function handleAddDeliverable() {
    if (!newDeliverable.name.trim()) return;
    addDeliverable(project.id, { ...newDeliverable, bookings: [] });
    setNewDeliverable({ name: '', description: '', status: 'Pending' });
    setAddDeliverableOpen(false);
  }

  function handleOpenConfirm() {
    const preview = previewConfirmBookings(project.id);
    setConfirmPreview(preview);
    setConfirmModalOpen(true);
  }

  function handleFinalConfirm() {
    if (!confirmPreview) return;
    applyConfirmedBookings(project.id, confirmPreview.resolvedBookings);
    setConfirmModalOpen(false);
    setConfirmPreview(null);
  }

  return (
    <Layout
      title={editing ? 'Edit Project' : project.name}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/projects')}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={15} />
            Back
          </button>
          {!editing && (
            <button
              onClick={startEdit}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
            >
              <Edit2 size={14} />
              Edit
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-5 max-w-5xl">

        {/* Workflow Panel */}
        <WorkflowPanel
          project={project}
          onTransition={(status) => transitionStatus(project.id, status)}
          onConfirmBookings={handleOpenConfirm}
        />

        {/* Project Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Project Name</label>
                  <input
                    type="text"
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Client</label>
                  <input
                    type="text"
                    value={editForm.client || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, client: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
                <textarea
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveEdit}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
                >
                  <Save size={14} /> Save Changes
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{project.name}</h2>
                  <p className="text-sm text-gray-500 mt-1">{project.client}</p>
                </div>
                <StatusBadge status={project.status} />
              </div>
              {project.description && (
                <p className="text-sm text-gray-600">{project.description}</p>
              )}
              <div className="flex flex-wrap gap-6 mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
                <span>
                  <Calendar size={14} className="inline mr-1 text-teal-500" />
                  Created {project.createdAt ? formatDisplayDate(project.createdAt) : '—'}
                </span>
                <span>
                  <DollarSign size={14} className="inline mr-1 text-teal-500" />
                  {isDraftPhase ? (
                    <>
                      <span className="text-gray-400">Estimated Cost (Draft): </span>
                      <span className="font-semibold text-gray-700">${totalCost.toLocaleString()}</span>
                    </>
                  ) : (
                    <>
                      Est. Cost: <span className="font-semibold text-gray-900">${totalCost.toLocaleString()}</span>
                    </>
                  )}
                </span>
                {isDraftPhase && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <Clock size={13} />
                    Equipment not yet reserved
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Deliverables */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Deliverables</h3>
            <button
              onClick={() => setAddDeliverableOpen(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
            >
              <Plus size={14} />
              Add Deliverable
            </button>
          </div>

          <div className="space-y-3">
            {(project.deliverables || []).length === 0 ? (
              <div className="bg-white border border-dashed border-gray-300 rounded-xl py-10 text-center">
                <p className="text-sm text-gray-400 mb-2">No deliverables yet.</p>
                <button
                  onClick={() => setAddDeliverableOpen(true)}
                  className="text-teal-600 font-medium text-sm hover:underline"
                >
                  Add first deliverable
                </button>
              </div>
            ) : (
              (project.deliverables || []).map((d) => (
                <DeliverableCard key={d.id} deliverable={d} project={project} />
              ))
            )}
          </div>
        </div>

        {/* Project Gantt */}
        {projectBookings.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">Project Timeline</h3>
              {isDraftPhase && (
                <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full font-medium border border-amber-200">
                  <Clock size={12} />
                  Tentative Schedule — Not Yet Booked
                </span>
              )}
            </div>
            <GanttChart
              bookings={projectBookings}
              startDate={ganttStart}
              endDate={ganttEnd}
              groupBy="equipment"
              rowLabels={rowLabels}
              showConflicts
              compact={false}
            />
          </div>
        )}

        {/* Cost Summary */}
        {projectBookings.length > 0 && (
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">
              {isDraftPhase ? 'Estimated Cost (Draft)' : 'Cost Summary'}
            </h3>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase">Equipment</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase">Lab</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase">Period</th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase">Days</th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase">$/Day</th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase">Subtotal</th>
                    {isDraftPhase && <th className="text-center px-5 py-3 font-semibold text-gray-600 text-xs uppercase">Status</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {projectBookings.map((b) => {
                    const eq = equipmentMap[b.equipmentId];
                    const lab = eq ? labsMap[eq.labId] : null;
                    const cost = eq ? eq.costPerDay * b.durationDays : 0;
                    const isTentative = b.confirmed === false;
                    return (
                      <tr key={b.id} className={`hover:bg-gray-50 ${isTentative ? 'opacity-75' : ''}`}>
                        <td className="px-5 py-3 font-medium text-gray-900">{eq?.name || b.equipmentId}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{lab?.name || '—'}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">
                          {formatDisplayDate(b.startDate)} — {formatDisplayDate(b.endDate)}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-600">{b.durationDays}</td>
                        <td className="px-5 py-3 text-right text-gray-600">${eq?.costPerDay.toLocaleString() || '—'}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">${cost.toLocaleString()}</td>
                        {isDraftPhase && (
                          <td className="px-5 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              isTentative ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {isTentative ? 'Tentative' : 'Confirmed'}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={isDraftPhase ? 6 : 5} className="px-5 py-3 text-sm font-bold text-gray-900 text-right">
                      {isDraftPhase ? 'Estimated Total (Draft)' : 'Grand Total'}
                    </td>
                    <td className="px-5 py-3 text-right text-base font-bold text-teal-700">
                      ${totalCost.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Deliverable Modal */}
      <Modal
        isOpen={addDeliverableOpen}
        onClose={() => setAddDeliverableOpen(false)}
        title="Add Deliverable"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
            <input
              type="text"
              value={newDeliverable.name}
              onChange={(e) => setNewDeliverable((d) => ({ ...d, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="e.g., Core Plug Analysis"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              value={newDeliverable.description}
              onChange={(e) => setNewDeliverable((d) => ({ ...d, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              placeholder="Optional description..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setAddDeliverableOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddDeliverable}
              disabled={!newDeliverable.name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              Add Deliverable
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Bookings Modal */}
      <ConfirmBookingsModal
        open={confirmModalOpen}
        onClose={() => { setConfirmModalOpen(false); setConfirmPreview(null); }}
        preview={confirmPreview}
        onConfirm={handleFinalConfirm}
      />
    </Layout>
  );
}
