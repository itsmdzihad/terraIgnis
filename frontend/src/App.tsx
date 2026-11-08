import React, { useEffect, useState } from 'react';
import Navbar from './Navbar';
import GlobalFirePulse from './components/GlobalFirePulse';
import RegionalDeepDive from './components/RegionalDeepDive';
import FireActivityCalendar from './components/FireActivityCalendar';
import { DashboardProvider } from './context/DashboardContext';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('global');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = window.localStorage.getItem('terraignis-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    window.localStorage.setItem('terraignis-theme', theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <DashboardProvider>
      <div className="app-shell flex flex-col h-screen overflow-hidden bg-slate-950 text-white" data-theme={theme}>
      {/* Top Navbar Contract */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} onThemeToggle={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} />

      {/* Main Container Stage */}
      <main className="flex-1 min-h-0 min-w-0 overflow-hidden relative">
        {activeTab === 'global' && <GlobalFirePulse />}
        {activeTab === 'regional' && <RegionalDeepDive />}
        {activeTab === 'calendar' && <FireActivityCalendar />}
      </main>
      </div>
    </DashboardProvider>
  );
}
