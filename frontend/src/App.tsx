import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
import Navbar from './Navbar';
import GlobalFirePulse from './components/GlobalFirePulse';
import RegionalDeepDive from './components/RegionalDeepDive';
import FireActivityCalendar from './components/FireActivityCalendar';
import { DashboardProvider } from './context/DashboardContext';

type TabId = 'global' | 'regional' | 'calendar';
const TABS: readonly TabId[] = ['global', 'regional', 'calendar'];

export default function App() {
  const [activeTab, setActiveTabState] = useState<TabId>('global');
  const [visitedTabs, setVisitedTabs] = useState<TabId[]>(['global']);
  const previousTabRef = useRef<TabId | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = window.localStorage.getItem('terraignis-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    window.localStorage.setItem('terraignis-theme', theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setActiveTab = useCallback((nextTab: string) => {
    if (nextTab !== 'global' && nextTab !== 'regional' && nextTab !== 'calendar') return;
    if (nextTab === activeTab) return;
    previousTabRef.current = activeTab;
    setActiveTabState(nextTab);
    setVisitedTabs((prev) => (prev.includes(nextTab) ? prev : [...prev, nextTab]));
  }, [activeTab]);

  const activeIndex = TABS.indexOf(activeTab);
  const previousTab = previousTabRef.current;
  const previousIndex = previousTab === null ? -1 : TABS.indexOf(previousTab);
  const direction = previousIndex === -1 || activeIndex >= previousIndex ? 1 : -1;

  return (
    <MotionConfig reducedMotion="user">
      <DashboardProvider>
        <div className="app-shell flex flex-col h-screen overflow-hidden bg-slate-950 text-white" data-theme={theme}>
          {/* Top Navbar Contract */}
          <Navbar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            theme={theme}
            onThemeToggle={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
          />

          {/* Main Container Stage */}
          <main className="flex-1 min-h-0 min-w-0 overflow-hidden relative">
            {TABS.map((tabId, tabIndex) => {
              if (!visitedTabs.includes(tabId)) return null;
              const isActive = activeTab === tabId;
              const isExiting = tabId === previousTab && !isActive;
              const inactiveOffsetX = tabIndex < activeIndex ? -20 : 20;

              return (
                <motion.div
                  key={tabId}
                  initial={
                    tabId === 'global' && previousTab === null
                      ? false
                      : { opacity: 0, x: direction * 20 }
                  }
                  animate={
                    isActive
                      ? {
                          opacity: 1,
                          x: 0,
                          visibility: 'visible',
                          transition: {
                            x: { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 },
                            opacity: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                          },
                        }
                      : isExiting
                      ? {
                          opacity: 0,
                          x: inactiveOffsetX,
                          transition: {
                            x: { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 },
                            opacity: { duration: 0.26, ease: [0.4, 0, 0.2, 1] },
                          },
                          transitionEnd: {
                            visibility: 'hidden',
                          },
                        }
                      : {
                          opacity: 0,
                          x: inactiveOffsetX,
                          visibility: 'hidden',
                          transition: { duration: 0 },
                        }
                  }
                  style={{
                    pointerEvents: isActive ? 'auto' : 'none',
                    zIndex: isActive ? 2 : isExiting ? 1 : 0,
                    willChange: isActive || isExiting ? 'transform, opacity' : 'auto',
                  }}
                  className="absolute inset-0 h-full w-full overflow-hidden"
                  aria-hidden={!isActive}
                  inert={!isActive}
                >
                  {tabId === 'global' && <GlobalFirePulse />}
                  {tabId === 'regional' && <RegionalDeepDive />}
                  {tabId === 'calendar' && <FireActivityCalendar />}
                </motion.div>
              );
            })}
          </main>
        </div>
      </DashboardProvider>
    </MotionConfig>
  );
}
