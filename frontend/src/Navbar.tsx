import { CalendarDays, Globe2, MapPinned, Moon, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, NavLink } from 'react-router-dom';
import TerraIgnisLogo from './components/TerraIgnisLogo';

interface NavbarProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
}

const navItems = [
  { id: 'global', label: 'Fire overview', path: '/', icon: Globe2 },
  { id: 'regional', label: 'Cell explorer', path: '/cells', icon: MapPinned },
  { id: 'calendar', label: 'Daily activity', path: '/activity', icon: CalendarDays },
];

export default function Navbar({ theme, onThemeToggle }: NavbarProps) {
  return (
    <header className="site-header">
      <Link to="/" className="site-brand" aria-label="TerraIgnis home">
        <TerraIgnisLogo theme={theme} className="site-logo" />
      </Link>

      <nav className="site-nav" aria-label="Primary navigation">
        {navItems.map(({ id, label, path, icon: Icon }) => (
          <NavLink
            key={id}
            to={path}
            end={id === 'global'}
            className={({ isActive }) => `site-nav-link${isActive ? ' is-active' : ''}`}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="site-nav-active-pill"
                    className="site-nav-pill"
                    transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.85 }}
                  />
                )}
                <Icon size={15} strokeWidth={1.8} className="relative z-10" />
                <span className="relative z-10">{label}</span>
              </>
            )}
          </NavLink>
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
      </div>
    </header>
  );
}
