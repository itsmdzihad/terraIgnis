import React from 'react';
import { Flame, Cpu } from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  const navItems = [
    { id: 'global', label: 'Global Fire Pulse' },
    { id: 'regional', label: 'Regional Deep Dive' },
    { id: 'calendar', label: 'Annual Activity Calendar' }
  ];

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
      {/* Zone 1: Brand Wordmark with subtle scientific sub-badge */}
      <div className="flex items-center gap-3">
        <a href="/" className="flex items-center gap-2 group">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-orange-600/20 blur-sm group-hover:bg-orange-500/30 transition-all duration-300" />
            <Flame className="w-5 h-5 text-orange-500 relative animate-pulse" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white font-sans uppercase">
            Terra<span className="text-orange-500 font-extrabold">Ignis</span>
          </span>
        </a>
        <div className="h-4 w-[1px] bg-slate-800" />
        <span className="text-[10px] tracking-widest font-mono text-slate-500 uppercase">
          NASA Space Apps
        </span>
      </div>

      {/* Zone 2: Navigation Tab Switchers with single-line text links */}
      <nav className="flex items-center gap-2 md:gap-6">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`text-sm font-medium transition-all duration-200 py-1.5 px-3 relative whitespace-nowrap shrink-0 rounded-md ${
                isActive
                  ? 'text-white bg-slate-900 shadow-inner'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
              }`}
            >
              {item.label}
              {isActive && (
                <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-orange-500 rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Calibrated Status Badge & Quick Settings */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-slate-300 uppercase tracking-wider text-[11px] font-semibold">
            MODIS + VIIRS Harmonized
          </span>
        </div>
        
        <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400 uppercase">
          <Cpu className="w-3.5 h-3.5 text-cyan-500" />
          <span>v2.6-Core</span>
        </div>
      </div>
    </header>
  );
}
