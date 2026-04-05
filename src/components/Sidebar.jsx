import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderOpen,
  CalendarRange,
  FlaskConical,
  Beaker,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', icon: FolderOpen },
  { to: '/calendar', label: 'Equipment Calendar', icon: CalendarRange },
  { to: '/labs', label: 'Labs & Equipment', icon: FlaskConical },
];

export default function Sidebar() {
  return (
    <aside className="w-64 min-h-screen bg-slate-900 text-white flex flex-col shrink-0">
      {/* Logo / Brand */}
      <div className="px-6 py-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center shrink-0">
            <Beaker size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">RDLab</p>
            <p className="text-xs text-slate-400 leading-tight">Scheduler</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <p className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Navigation
        </p>
        <ul className="space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-700">
        <p className="text-xs text-slate-500">v1.0.0 &mdash; RD Lab Scheduler</p>
      </div>
    </aside>
  );
}
