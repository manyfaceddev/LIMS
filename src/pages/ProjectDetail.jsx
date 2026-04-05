import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Edit2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Calendar,
  DollarSign,
  ArrowLeft,
  Save,
  X,
} from 'lucide-react';
import Layout from '../components/Layout.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import GanttChart from '../components/GanttChart.jsx';
import EquipmentSelector from '../components/EquipmentSelector.jsx';
import { useApp } from '../context/AppContext.jsx';
import { computeTotalCost, generateId } from '../utils/scheduling.js';
import { computeEndDate, formatDisplayDate, today, addDays } from '../utils/dates.js';

const STATUS_OPTIONS = ['Draft', 'Scheduled', 'Active', 'Completed', 'Cancelled'];

function BookingModal({ open, onClose, projectId, deliverableId, existingBooking }) {
  const { equipmentMap, labsMap, addBooking, updateBooking, getNextAvailableDate, allBookings } = useApp();

  const [equipmentId, setEquipmentId] = useState(existingBooking?.equipmentId || '');
  const [startDate, setStartDate] = useState(existingBooking?.startDate || today());
  const [duration, setDuration] = useState(existingBooking?.durationDays || 5);
  const [notes, setNotes] = useState(existingBooking?.notes || '');
  const [conflictInfo, setConflictInfo] = useState(null);
  const [saving, setSaving] = useState(false);

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
    } else {
      onClose();
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={existingBooking ? 'Edit Booking' : 'Add Equipment Booking'}
      size="md"
    >
      <div className="space-y-4">
        {/* Equipment selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Equipment</label>
          <EquipmentSelector
            value={equipmentId}
            onChange={(id) => { setEquipmentId(id); setConflictInfo(null); }}
          />
        </div>

        {/* Date + duration */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setConflictInfo(null); }}
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
              onChange={(e) => { setDuration(e.target.value); setConflictInfo(null); }}
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
              <p className="text-xs text-teal-600">estimated total</p>
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

        {/* Conflict warning */}
        {conflictInfo && conflictInfo.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">Scheduling conflict detected</p>
                <p className="text-xs text-red-600 mt-1">
                  This equipment is already booked for:
                </p>
                {conflictInfo.map((c) => (
                  <p key={c.id} className="text-xs text-red-700 mt-0.5 font-medium">
                    • {c.projectName || c.projectId}: {formatDisplayDate(c.startDate)} — {formatDisplayDate(c.endDate)}
                  </p>
                ))}
              </div>
            </div>
            <button
              onClick={handleAutoSchedule}
              className="mt-2 text-xs font-medium text-red-700 hover:text-red-900 underline"
            >
              Auto-schedule to next available date
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
            {existingBooking ? 'Update Booking' : 'Add Booking'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeliverableCard({ deliverable, project }) {
  const { equipmentMap, labsMap, deleteBooking, deleteDeliverable } = useApp();
  const [expanded, setExpanded] = useState(true);
  const [addingBooking, setAddingBooking] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);

  const bookings = deliverable.bookings || [];
  const totalCost = computeTotalCost(bookings, equipmentMap);

  function handleDeleteBooking(bookingId) {
    deleteBooking(project.id, deliverable.id, bookingId);
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Deliverable header */}
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
          <span className="text-xs font-medium text-gray-700">${totalCost.toLocaleString()}</span>
          <StatusBadge status={deliverable.status || 'Pending'} />
        </div>
      </button>

      {/* Deliverable body */}
      {expanded && (
        <div className="px-5 py-4">
          {/* Bookings list */}
          {bookings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No equipment bookings yet.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {bookings.map((booking) => {
                const eq = equipmentMap[booking.equipmentId];
                const lab = eq ? labsMap[eq.labId] : null;
                const cost = eq ? eq.costPerDay * booking.durationDays : 0;

                return (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between px-4 py-3 bg-white border border-gray-100 rounded-lg hover:border-gray-200 transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {eq?.name || booking.equipmentId}
                        </p>
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
              Add Equipment Booking
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

      {/* Booking modals */}
      {addingBooking && (
        <BookingModal
          open={addingBooking}
          onClose={() => setAddingBooking(false)}
          projectId={project.id}
          deliverableId={deliverable.id}
        />
      )}
      {editingBooking && (
        <BookingModal
          open={!!editingBooking}
          onClose={() => setEditingBooking(null)}
          projectId={project.id}
          deliverableId={deliverable.id}
          existingBooking={editingBooking}
        />
      )}
    </div>
  );
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { projects, allBookings, equipmentMap, labsMap, updateProject, addDeliverable } = useApp();

  const project = projects.find((p) => p.id === projectId);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [addDeliverableOpen, setAddDeliverableOpen] = useState(false);
  const [newDeliverable, setNewDeliverable] = useState({ name: '', description: '', status: 'Pending' });

  if (!project) {
    return (
      <Layout title="Project Not Found">
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">This project does not exist.</p>
          <button
            onClick={() => navigate('/projects')}
            className="text-teal-600 font-medium hover:underline"
          >
            Back to Projects
          </button>
        </div>
      </Layout>
    );
  }

  const projectBookings = useMemo(
    () => allBookings.filter((b) => b.projectId === project.id),
    [allBookings, project.id]
  );

  const totalCost = computeTotalCost(projectBookings, equipmentMap);

  // Gantt date range
  const ganttStart = useMemo(() => {
    const dates = projectBookings.map((b) => b.startDate).filter(Boolean);
    if (!dates.length) return today();
    const min = dates.reduce((a, b) => (a < b ? a : b));
    return addDays(min, -3);
  }, [projectBookings]);

  const ganttEnd = useMemo(() => {
    const dates = projectBookings.map((b) => b.endDate).filter(Boolean);
    if (!dates.length) return addDays(today(), 30);
    const max = dates.reduce((a, b) => (a > b ? a : b));
    return addDays(max, 3);
  }, [projectBookings]);

  // Row labels for gantt
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
    setEditForm({
      name: project.name,
      client: project.client,
      description: project.description,
      status: project.status,
    });
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
      <div className="space-y-6 max-w-5xl">
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
                  <select
                    value={editForm.status || 'Draft'}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
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
              <div className="flex gap-6 mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
                <span><Calendar size={14} className="inline mr-1 text-teal-500" />
                  Created {project.createdAt ? formatDisplayDate(project.createdAt) : '—'}
                </span>
                <span><DollarSign size={14} className="inline mr-1 text-teal-500" />
                  Est. Cost: <span className="font-semibold text-gray-900">${totalCost.toLocaleString()}</span>
                </span>
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
            <h3 className="text-base font-semibold text-gray-900 mb-3">Project Timeline</h3>
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
            <h3 className="text-base font-semibold text-gray-900 mb-3">Cost Summary</h3>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {projectBookings.map((b) => {
                    const eq = equipmentMap[b.equipmentId];
                    const lab = eq ? labsMap[eq.labId] : null;
                    const cost = eq ? eq.costPerDay * b.durationDays : 0;
                    return (
                      <tr key={b.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{eq?.name || b.equipmentId}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{lab?.name || '—'}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">
                          {formatDisplayDate(b.startDate)} — {formatDisplayDate(b.endDate)}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-600">{b.durationDays}</td>
                        <td className="px-5 py-3 text-right text-gray-600">${eq?.costPerDay.toLocaleString() || '—'}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">${cost.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={5} className="px-5 py-3 text-sm font-bold text-gray-900 text-right">
                      Grand Total
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
    </Layout>
  );
}
