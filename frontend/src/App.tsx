import React, { useState } from 'react';
import Navbar from './Navbar';
import GlobalFirePulse from './components/GlobalFirePulse';
import RegionalDeepDive from './components/RegionalDeepDive';
import FireActivityCalendar from './components/FireActivityCalendar';
import { DashboardProvider } from './context/DashboardContext';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('global');

  return (
    <DashboardProvider>
      <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-white select-none">
      {/* Top Navbar Contract */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Container Stage */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'global' && <GlobalFirePulse />}
        {activeTab === 'regional' && <RegionalDeepDive />}
        {activeTab === 'calendar' && <FireActivityCalendar />}
      </main>
      </div>
    </DashboardProvider>
  );
}
