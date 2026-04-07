import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Check, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import GanttChart from '../components/GanttChart.jsx';
import EquipmentSelector from '../components/EquipmentSelector.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useApp } from '../context/AppContext.jsx';
import { generateId, computeTotalCost, checkConflict, flattenBookings, flattenConfirmedBookings, findNextAvailableDate } from '../utils/scheduling.js';
import { computeEndDate, formatDisplayDate, today, addDays } from '../utils/dates.js';

const STEPS = [
  { n: 1, label: 'Project Info' },
  { n: 2, label: 'Deliverables' },
  { n: 3, label: 'Equipment' },
  { n: 4, label: 'Review' },
];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, i) => (
        <div key={step.n} className="flex items-center">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
              current === step.n
                ? 'bg-teal-600 text-white'
                : current > step.n
                ? 'bg-teal-100 text-teal-700'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            {current > step.n ? <Check size={16} /> : step.n}
          </div>
          <span
            className={`ml-2 text-sm font-medium ${
              current === step.n ? 'text-teal-700' : current > step.n ? 'text-teal-500' : 'text-gray-400'
            }`}
          >
            {step.label}
          </span>
          {i < STEPS.length - 1 && (
            <div
              className={`mx-3 h-0.5 w-12 transition-colors ${
                current > step.n ? 'bg-teal-300' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function NewProjectWizard() {
  const navigate = useNavigate();
  const { addProject, equipmentMap, labsMap, projects } = useApp();
  // Use only confirmed bookings for conflict checking in wizard (tentative bookings don't block slots)
  const allBookings = useMemo(() => flattenConfirmedBookings(projects), [projects]);

  const [step, setStep] = useState(1);

  // Step 1 — always starts as Draft; status not user-selectable in wizard
  const [info, setInfo] = useState({ name: '', client: '', description: '', status: 'Draft' });

  // Step 2
  const [deliverables, setDeliverables] = useState([
    { id: generateId('del'), name: '', description: '', bookings: [] },
  ]);

  // Step 3 — per-deliverable booking form state: deliverableId -> { equipmentId, startDate, duration, notes }
  const [bookingForms, setBookingForms] = useState({});
  const [conflicts, setConflicts] = useState({});

  function addDeliverable() {
    setDeliverables((ds) => [...ds, { id: generateId('del'), name: '', description: '', bookings: [] }]);
  }

  function removeDeliverable(id) {
    setDeliverables((ds) => ds.filter((d) => d.id !== id));
  }

  function updateDeliverable(id, field, value) {
    setDeliverables((ds) => ds.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  }

  function getBookingForm(delId) {
    return bookingForms[delId] || { equipmentId: '', startDate: today(), duration: 5, notes: '' };
  }

  function setBookingForm(delId, updates) {
    setBookingForms((f) => ({ ...f, [delId]: { ...getBookingForm(delId), ...updates } }));
  }

  function addBookingToDeliverable(delId) {
    const form = getBookingForm(delId);
    if (!form.equipmentId || !form.startDate || !form.duration) return;

    // Auto-schedule against confirmed bookings + already added in this wizard session
    const tempBookings = deliverables.flatMap((d) => d.bookings);
    const checkPool = [...allBookings, ...tempBookings];

    let finalStart = form.startDate;
    let wasRescheduled = false;

    const endDate = computeEndDate(form.startDate, Number(form.duration));
    const conflictList = checkConflict(checkPool, form.equipmentId, form.startDate, endDate, null);

    if (conflictList.length > 0) {
      finalStart = findNextAvailableDate(checkPool, form.equipmentId, form.startDate, Number(form.duration), null);
      wasRescheduled = finalStart !== form.startDate;
    }

    const finalEnd = computeEndDate(finalStart, Number(form.duration));
    const newBooking = {
      id: generateId('bkg'),
      equipmentId: form.equipmentId,
      startDate: finalStart,
      endDate: finalEnd,
      durationDays: Number(form.duration),
      notes: form.notes,
      confirmed: false,
      autoScheduled: wasRescheduled,
    };

    if (wasRescheduled) {
      setConflicts((c) => ({ ...c, [`${delId}-new`]: { rescheduled: true, originalStart: form.startDate, newStart: finalStart } }));
    } else {
      setConflicts((c) => { const nc = { ...c }; delete nc[`${delId}-new`]; return nc; });
    }

    setDeliverables((ds) =>
      ds.map((d) =>
        d.id === delId ? { ...d, bookings: [...d.bookings, newBooking] } : d
      )
    );
    setBookingForms((f) => ({ ...f, [delId]: { equipmentId: '', startDate: today(), duration: 5, notes: '' } }));
  }

  function removeBooking(delId, bookingId) {
    setDeliverables((ds) =>
      ds.map((d) =>
        d.id === delId
          ? { ...d, bookings: d.bookings.filter((b) => b.id !== bookingId) }
          : d
      )
    );
  }

  // All bookings from wizard (for gantt preview and cost)
  const wizardBookings = useMemo(() => {
    const projectId = 'preview';
    return deliverables.flatMap((d) =>
      d.bookings.map((b) => ({
        ...b,
        projectId,
        projectName: info.name || 'New Project',
        deliverableId: d.id,
      }))
    );
  }, [deliverables, info.name]);

  const ganttStart = useMemo(() => {
    const dates = wizardBookings.map((b) => b.startDate).filter(Boolean);
    if (!dates.length) return today();
    return addDays(dates.reduce((a, b) => (a < b ? a : b)), -3);
  }, [wizardBookings]);

  const ganttEnd = useMemo(() => {
    const dates = wizardBookings.map((b) => b.endDate).filter(Boolean);
    if (!dates.length) return addDays(today(), 30);
    return addDays(dates.reduce((a, b) => (a > b ? a : b)), 3);
  }, [wizardBookings]);

  const rowLabels = useMemo(() => {
    const map = {};
    for (const b of wizardBookings) {
      const eq = equipmentMap[b.equipmentId];
      map[b.equipmentId] = eq ? eq.name : b.equipmentId;
    }
    return map;
  }, [wizardBookings, equipmentMap]);

  const totalCost = computeTotalCost(wizardBookings, equipmentMap);

  function handleConfirm() {
    const projectId = generateId('proj');
    const project = {
      id: projectId,
      ...info,
      createdAt: today(),
      deliverables: deliverables.map((d) => ({
        ...d,
        projectId,
        status: 'Pending',
        bookings: d.bookings.map((b) => ({ ...b, projectId, deliverableId: d.id })),
      })),
    };
    addProject(project);
    navigate(`/projects/${projectId}`);
  }

  const step1Valid = info.name.trim().length > 0;
  const step2Valid = deliverables.length > 0 && deliverables.every((d) => d.name.trim().length > 0);

  return (
    <Layout title="New Project">
      <div className="max-w-3xl mx-auto">
        <StepIndicator current={step} />

        {/* Step 1 — Project Info */}
        {step === 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Project Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={info.name}
                  onChange={(e) => setInfo((i) => ({ ...i, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g., Carbonate Reservoir Study"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Client</label>
                <input
                  type="text"
                  value={info.client}
                  onChange={(e) => setInfo((i) => ({ ...i, client: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g., Saudi Aramco"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                <select
                  value={info.status}
                  onChange={(e) => setInfo((i) => ({ ...i, status: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {['Draft', 'Scheduled', 'Active'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea
                  value={info.description}
                  onChange={(e) => setInfo((i) => ({ ...i, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  placeholder="Brief description of the project scope..."
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Deliverables */}
        {step === 2 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Deliverables</h2>
              <button
                onClick={addDeliverable}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
              >
                <Plus size={14} />
                Add Deliverable
              </button>
            </div>

            <div className="space-y-4">
              {deliverables.map((d, i) => (
                <div key={d.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Deliverable {i + 1} Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={d.name}
                          onChange={(e) => updateDeliverable(d.id, 'name', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          placeholder="e.g., Core Plug Analysis"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                        <input
                          type="text"
                          value={d.description}
                          onChange={(e) => updateDeliverable(d.id, 'description', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          placeholder="Optional description..."
                        />
                      </div>
                    </div>
                    {deliverables.length > 1 && (
                      <button
                        onClick={() => removeDeliverable(d.id)}
                        className="mt-4 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Equipment Bookings */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl px-5 py-3 text-sm text-gray-600">
              Add equipment bookings for each deliverable. You can skip this and add them later.
            </div>
            {deliverables.map((d) => {
              const form = getBookingForm(d.id);
              const conflictKey = `${d.id}-new`;
              const conflictList = conflicts[conflictKey];

              return (
                <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">{d.name}</h3>

                  {/* Existing bookings */}
                  {d.bookings.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {d.bookings.map((b) => {
                        const eq = equipmentMap[b.equipmentId];
                        const cost = eq ? eq.costPerDay * b.durationDays : 0;
                        return (
                          <div key={b.id} className="flex items-center justify-between px-4 py-2 bg-teal-50 rounded-lg">
                            <div>
                              <span className="text-sm font-medium text-teal-900">{eq?.name || b.equipmentId}</span>
                              <span className="text-xs text-teal-600 ml-2">
                                {formatDisplayDate(b.startDate)} — {b.durationDays} days
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-teal-900">${cost.toLocaleString()}</span>
                              <button
                                onClick={() => removeBooking(d.id, b.id)}
                                className="p-1 text-teal-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add booking form */}
                  <div className="border border-gray-100 rounded-lg p-4 bg-gray-50">
                    <p className="text-xs font-medium text-gray-600 mb-3">Add Equipment Booking</p>
                    <div className="space-y-3">
                      <EquipmentSelector
                        value={form.equipmentId}
                        onChange={(id) => { setBookingForm(d.id, { equipmentId: id }); setConflicts((c) => { const nc = {...c}; delete nc[`${d.id}-new`]; return nc; }); }}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                          <input
                            type="date"
                            value={form.startDate}
                            onChange={(e) => setBookingForm(d.id, { startDate: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Duration (days)</label>
                          <input
                            type="number"
                            min={1}
                            value={form.duration}
                            onChange={(e) => setBookingForm(d.id, { duration: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                      </div>
                      <input
                        type="text"
                        value={form.notes}
                        onChange={(e) => setBookingForm(d.id, { notes: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder="Notes (optional)"
                      />

                      {conflictList && conflictList.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                          <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
                          <p className="text-xs text-red-700">
                            Scheduling conflict with existing bookings. Please choose a different date.
                          </p>
                        </div>
                      )}

                      <button
                        onClick={() => addBookingToDeliverable(d.id)}
                        disabled={!form.equipmentId || !form.startDate || !form.duration}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus size={14} />
                        Add Booking
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Step 4 — Review */}
        {step === 4 && (
          <div className="space-y-6">
            {/* Project summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Project Summary</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Project Name</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{info.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Client</p>
                  <p className="font-medium text-gray-900 mt-0.5">{info.client || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <div className="mt-0.5"><StatusBadge status={info.status} /></div>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Deliverables</p>
                  <p className="font-medium text-gray-900 mt-0.5">{deliverables.length}</p>
                </div>
              </div>
              {info.description && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500">Description</p>
                  <p className="text-sm text-gray-700 mt-0.5">{info.description}</p>
                </div>
              )}
            </div>

            {/* Cost breakdown */}
            {wizardBookings.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">Cost Breakdown</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-600 uppercase">Equipment</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-600 uppercase">Deliverable</th>
                      <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-600 uppercase">Days</th>
                      <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-600 uppercase">$/Day</th>
                      <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-600 uppercase">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {wizardBookings.map((b) => {
                      const eq = equipmentMap[b.equipmentId];
                      const del = deliverables.find((d) => d.id === b.deliverableId);
                      const cost = eq ? eq.costPerDay * b.durationDays : 0;
                      return (
                        <tr key={b.id}>
                          <td className="px-5 py-3 font-medium text-gray-900">{eq?.name || b.equipmentId}</td>
                          <td className="px-5 py-3 text-gray-500 text-xs">{del?.name || '—'}</td>
                          <td className="px-5 py-3 text-right text-gray-600">{b.durationDays}</td>
                          <td className="px-5 py-3 text-right text-gray-600">${eq?.costPerDay.toLocaleString() || '—'}</td>
                          <td className="px-5 py-3 text-right font-semibold text-gray-900">${cost.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td colSpan={4} className="px-5 py-3 text-sm font-bold text-gray-900 text-right">Grand Total</td>
                      <td className="px-5 py-3 text-right text-base font-bold text-teal-700">${totalCost.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Gantt preview */}
            {wizardBookings.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Timeline Preview</h3>
                <GanttChart
                  bookings={wizardBookings}
                  startDate={ganttStart}
                  endDate={ganttEnd}
                  groupBy="equipment"
                  rowLabels={rowLabels}
                  showConflicts={false}
                  compact={false}
                />
              </div>
            )}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={() => (step === 1 ? navigate('/projects') : setStep((s) => s - 1))}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft size={16} />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 ? !step1Valid : step === 2 ? !step2Valid : false}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
            >
              <Check size={16} />
              Create Project
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}
