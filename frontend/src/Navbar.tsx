import { CalendarDays, Globe2, MapPinned, Moon, Sun } from 'lucide-react';
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
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            aria-current={activeTab === id ? 'page' : undefined}
            className={`site-nav-link${activeTab === id ? ' is-active' : ''}`}
          >
            <Icon size={15} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
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
        <div className="site-header-note">
          <span className="site-status-dot" />
          <span>Satellite observations</span>
        </div>
      </div>
    </header>
  );
}
