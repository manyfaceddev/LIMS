import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';

/**
 * EquipmentSelector
 * A searchable dropdown grouped by lab.
 *
 * Props:
 *  - value: equipmentId string | null
 *  - onChange: (equipmentId) => void
 *  - placeholder: string
 */
export default function EquipmentSelector({ value, onChange, placeholder = 'Select equipment...' }) {
  const { equipment, labs, labsMap } = useApp();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [expandedLabs, setExpandedLabs] = useState({});

  const selectedEquipment = useMemo(
    () => equipment.find((e) => e.id === value) || null,
    [equipment, value]
  );

  // Group equipment by lab
  const grouped = useMemo(() => {
    const labGroups = {};
    for (const eq of equipment) {
      if (!labGroups[eq.labId]) labGroups[eq.labId] = [];
      labGroups[eq.labId].push(eq);
    }
    return labGroups;
  }, [equipment]);

  // Filter by query
  const filteredGrouped = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return grouped;

    const result = {};
    for (const [labId, items] of Object.entries(grouped)) {
      const lab = labsMap[labId];
      const labMatches = lab && lab.name.toLowerCase().includes(q);
      const filtered = labMatches ? items : items.filter((eq) => eq.name.toLowerCase().includes(q));
      if (filtered.length > 0) result[labId] = filtered;
    }
    return result;
  }, [grouped, query, labsMap]);

  // Auto-expand labs matching query
  const labsToShow = useMemo(() => {
    return Object.keys(filteredGrouped).sort((a, b) => {
      const la = labsMap[a]?.name || a;
      const lb = labsMap[b]?.name || b;
      return la.localeCompare(lb);
    });
  }, [filteredGrouped, labsMap]);

  function toggleLab(labId) {
    setExpandedLabs((prev) => ({ ...prev, [labId]: !prev[labId] }));
  }

  function isLabExpanded(labId) {
    if (query) return true; // auto-expand when searching
    return expandedLabs[labId] !== false; // default expanded
  }

  function select(eqId) {
    onChange(eqId);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm text-left hover:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
      >
        <span className={selectedEquipment ? 'text-gray-900' : 'text-gray-400'}>
          {selectedEquipment ? (
            <span>
              <span className="font-medium">{selectedEquipment.name}</span>
              <span className="text-gray-400 ml-2 text-xs">
                ({labsMap[selectedEquipment.labId]?.name})
              </span>
            </span>
          ) : placeholder}
        </span>
        <ChevronDown size={16} className="text-gray-400 shrink-0 ml-2" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
              <Search size={14} className="text-gray-400 shrink-0" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search equipment or lab..."
                className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400"
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto">
            {labsToShow.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-400 text-center">No equipment found</div>
            )}
            {labsToShow.map((labId) => {
              const lab = labsMap[labId];
              const items = filteredGrouped[labId];
              const expanded = isLabExpanded(labId);

              return (
                <div key={labId}>
                  {/* Lab header */}
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 text-left transition-colors"
                    onClick={() => toggleLab(labId)}
                  >
                    <span className="text-xs font-semibold text-slate-700 truncate">
                      {lab?.name || labId}
                    </span>
                    <span className="flex items-center gap-1 shrink-0 ml-2">
                      <span className="text-xs text-gray-400">{items.length}</span>
                      {expanded ? (
                        <ChevronUp size={12} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={12} className="text-gray-400" />
                      )}
                    </span>
                  </button>

                  {/* Equipment items */}
                  {expanded && items.map((eq) => (
                    <button
                      key={eq.id}
                      type="button"
                      onClick={() => select(eq.id)}
                      className={`w-full flex items-center justify-between px-6 py-2 hover:bg-teal-50 text-left transition-colors ${
                        eq.id === value ? 'bg-teal-50 text-teal-700' : 'text-gray-700'
                      }`}
                    >
                      <span className="text-sm truncate">{eq.name}</span>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">
                        ${eq.costPerDay.toLocaleString()}/day
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Backdrop to close */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setOpen(false); setQuery(''); }}
        />
      )}
    </div>
  );
}
