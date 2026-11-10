import { CalendarDays, Globe2, MapPinned, Moon, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import TerraIgnisLogo from './components/TerraIgnisLogo';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
}

const navItems = [
  { id: 'global', label: 'Fire overview', icon: Globe2 },
  { id: 'regional', label: 'Cell explorer', icon: MapPinned },
  { id: 'calendar', label: 'Daily activity', icon: CalendarDays },
];

export default function Navbar({ activeTab, setActiveTab, theme, onThemeToggle }: NavbarProps) {
  return (
    <header className="site-header">
      <a href="/" className="site-brand" aria-label="TerraIgnis home">
        <TerraIgnisLogo theme={theme} className="site-logo" />
      </a>

      <nav className="site-nav" aria-label="Primary navigation">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`site-nav-link${isActive ? ' is-active' : ''}`}
            >
              {isActive && (
                <motion.span
                  layoutId="site-nav-active-pill"
                  className="site-nav-pill"
                  transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.85 }}
                />
              )}
              <Icon size={15} strokeWidth={1.8} className="relative z-10" />
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="site-header-actions">
        <button
          type="button"
          className="theme-toggle"
          onClick={onThemeToggle}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          aria-pressed={theme === 'dark'}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        >
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
        </button>
      </div>
    </header>
  );
}
