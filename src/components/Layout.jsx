import Sidebar from './Sidebar.jsx';

export default function Layout({ title, actions, children }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
            {actions && <div className="flex items-center gap-3">{actions}</div>}
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 px-8 py-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
