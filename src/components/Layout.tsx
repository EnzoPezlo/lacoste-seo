import { NavLink, Outlet } from 'react-router-dom';
import { Activity, Search, BarChart3, Tag, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Toaster } from 'sonner';

const navItems = [
  { to: '/', label: 'Runs', icon: Activity },
  { to: '/serp', label: 'SERP', icon: Search },
  { to: '/analyses', label: 'Analyses', icon: BarChart3 },
  { to: '/keywords', label: 'Keywords', icon: Tag },
];

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-stone-50 font-sans">
      <Toaster position="top-right" richColors />

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center h-14 px-4 bg-zinc-950 text-white md:hidden">
        <button onClick={() => setMobileOpen(!mobileOpen)} className="p-1">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="ml-3 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center font-bold text-xs">L</div>
          <span className="text-sm font-semibold">Lacoste SEO</span>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar — overlay on mobile, static on desktop */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-30 flex flex-col bg-zinc-950 text-white transition-all duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${collapsed ? 'md:w-16' : 'md:w-60'} w-60 pt-14 md:pt-0
        `}
      >
        {/* Brand — desktop only */}
        <div className="hidden md:flex items-center h-16 px-4 border-b border-zinc-800">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center font-bold text-sm shrink-0">
            L
          </div>
          {!collapsed && (
            <div className="ml-3 overflow-hidden">
              <div className="text-sm font-semibold tracking-tight">Lacoste</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest">SEO Intelligence</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`
              }
            >
              <item.icon size={18} className="shrink-0" />
              {(!collapsed || mobileOpen) && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Collapse toggle — desktop only */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex items-center justify-center h-12 border-t border-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
