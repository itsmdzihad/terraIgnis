import React from 'react';
import { Flame } from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  const navItems = [
    { id: 'global',   label: 'Global Fire Pulse' },
    { id: 'regional', label: 'Regional Deep Dive' },
    { id: 'calendar', label: 'Activity Calendar' },
  ];

  return (
    <header className="flex items-center justify-between px-6 h-14 border-b border-slate-800 bg-slate-950 sticky top-0 z-50">

      {/* Brand */}
      <a href="/" className="flex items-center gap-2.5 shrink-0">
        <Flame className="w-4.5 h-4.5 text-orange-500" />
        <span className="text-sm font-semibold text-white tracking-tight">
          Terra<span className="text-orange-500">Ignis</span>
        </span>
        <span className="hidden sm:block text-xs text-slate-500 ml-1">
          · NASA Space Apps
        </span>
      </a>

      {/* Nav tabs */}
      <nav className="flex items-center gap-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative px-3 py-1.5 text-sm rounded-md transition-colors duration-150 whitespace-nowrap ${
                isActive
                  ? 'text-white bg-slate-800'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Right side — status + version, nothing else */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden md:flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block" />
          <span className="text-xs text-slate-400">Live</span>
        </div>
        <span className="text-xs text-slate-500 border border-slate-800 px-2 py-0.5 rounded">
          v2.6
        </span>
      </div>

    </header>
  );
}
