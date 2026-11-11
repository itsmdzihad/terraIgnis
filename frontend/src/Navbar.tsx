
import { Fragment, useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import TerraIgnisLogo from './components/TerraIgnisLogo';

interface NavbarProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
}

interface MetaballGeometry {
  width: number;
  height: number;
  path: string;
}

const navItems = [
  { id: 'global', label: 'Fire overview', path: '/' },
  { id: 'regional', label: 'Cell explorer', path: '/cells' },
  { id: 'calendar', label: 'Daily activity', path: '/activity' },
  { id: 'pipeline', label: 'Data pipeline', path: '/pipeline' },
  { id: 'how-it-works', label: 'How It Works', path: '/how-it-works' },
];

function fmt(value: number): string {
  return value.toFixed(2);
}

function buildMetaballPath(
  height: number,
  brandRect: { left: number; right: number },
  navRect: { left: number; right: number },
  actionRect: { left: number; right: number },
): string {
  const radius = height / 2;
  const fillet = Math.max(4, (10.23 / 52) * height);

  const capCenters = (left: number, right: number): [number, number] => {
    const start = left + radius;
    const end = Math.max(start, right - radius);
    return [start, end];
  };

  const [lx0, lx1] = capCenters(brandRect.left, brandRect.right);
  const [cx0, cx1] = capCenters(navRect.left, navRect.right);
  const [rx0, rx1] = capCenters(actionRect.left, actionRect.right);

  const bridgeTangents = (cLeft: number, cRight: number) => {
    const dx = Math.max(2 * radius, cRight - cLeft);
    const halfDx = dx / 2;
    const sumR = radius + fillet;
    const dyFillet = halfDx < sumR ? Math.sqrt(sumR * sumR - halfDx * halfDx) : 0;
    const scale = radius / sumR;
    const tDx = halfDx * scale;
    const tDy = dyFillet * scale;
    return {
      xL: cLeft + tDx,
      xR: cRight - tDx,
      yTop: radius - tDy,
      yBot: radius + tDy,
    };
  };

  const b1 = bridgeTangents(lx1, cx0);
  const b2 = bridgeTangents(cx1, rx0);

  return [
    `M ${fmt(brandRect.left)} ${fmt(radius)}`,
    `A ${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(lx0)} 0`,
    `L ${fmt(lx1)} 0`,
    `A ${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(b1.xL)} ${fmt(b1.yTop)}`,
    `A ${fmt(fillet)} ${fmt(fillet)} 0 0 0 ${fmt(b1.xR)} ${fmt(b1.yTop)}`,
    `A ${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(cx0)} 0`,
    `L ${fmt(cx1)} 0`,
    `A ${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(b2.xL)} ${fmt(b2.yTop)}`,
    `A ${fmt(fillet)} ${fmt(fillet)} 0 0 0 ${fmt(b2.xR)} ${fmt(b2.yTop)}`,
    `A ${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(rx0)} 0`,
    `L ${fmt(rx1)} 0`,
    `A ${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(actionRect.right)} ${fmt(radius)}`,
    `A ${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(rx1)} ${fmt(height)}`,
    `L ${fmt(rx0)} ${fmt(height)}`,
    `A ${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(b2.xR)} ${fmt(b2.yBot)}`,
    `A ${fmt(fillet)} ${fmt(fillet)} 0 0 0 ${fmt(b2.xL)} ${fmt(b2.yBot)}`,
    `A ${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(cx1)} ${fmt(height)}`,
    `L ${fmt(cx0)} ${fmt(height)}`,
    `A ${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(b1.xR)} ${fmt(b1.yBot)}`,
    `A ${fmt(fillet)} ${fmt(fillet)} 0 0 0 ${fmt(b1.xL)} ${fmt(b1.yBot)}`,
    `A ${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(lx1)} ${fmt(height)}`,
    `L ${fmt(lx0)} ${fmt(height)}`,
    `A ${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(brandRect.left)} ${fmt(radius)}`,
    'Z',
  ].join(' ');
}

export default function Navbar({ theme, onThemeToggle }: NavbarProps) {
  const { pathname } = useLocation();
  const activeIndex = navItems.findIndex((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
  );

  const rawId = useId();
  const uid = rawId.replace(/:/g, '');
  const shadowFilterId = `nav-shadow-${uid}`;
  const clipId = `nav-clip-${uid}`;

  const shellRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLAnchorElement>(null);
  const navLobeRef = useRef<HTMLDivElement>(null);
  const actionLobeRef = useRef<HTMLDivElement>(null);
  const [shellGeo, setShellGeo] = useState<MetaballGeometry | null>(null);

  const measureShell = useCallback(() => {
    const shell = shellRef.current;
    const brand = brandRef.current;
    const navLobe = navLobeRef.current;
    const actionLobe = actionLobeRef.current;
    if (!shell || !brand || !navLobe || !actionLobe) return;

    const sRect = shell.getBoundingClientRect();
    if (sRect.width <= 0 || sRect.height <= 0) return;

    const rel = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { left: r.left - sRect.left, right: r.right - sRect.left };
    };

    const nextPath = buildMetaballPath(
      sRect.height,
      rel(brand),
      rel(navLobe),
      rel(actionLobe),
    );

    setShellGeo((prev) =>
      prev &&
      Math.abs(prev.width - sRect.width) < 0.25 &&
      Math.abs(prev.height - sRect.height) < 0.25 &&
      prev.path === nextPath
        ? prev
        : { width: sRect.width, height: sRect.height, path: nextPath },
    );
  }, []);

  useLayoutEffect(() => {
    measureShell();

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => measureShell())
        : null;

    if (observer) {
      if (shellRef.current) observer.observe(shellRef.current);
      if (brandRef.current) observer.observe(brandRef.current);
      if (navLobeRef.current) observer.observe(navLobeRef.current);
      if (actionLobeRef.current) observer.observe(actionLobeRef.current);
    }

    window.addEventListener('resize', measureShell);
    let cancelled = false;
    document.fonts?.ready?.then(() => {
      if (!cancelled) measureShell();
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener('resize', measureShell);
    };
  }, [measureShell, theme, pathname]);

  return (
    <header className="site-header">
      <div
        ref={shellRef}
        className={`site-navbar-shell${shellGeo ? ' has-unified-shell' : ''}`}
      >
        {shellGeo && (
          <>
            <svg
              className="site-navbar-shadow"
              width={shellGeo.width}
              height={shellGeo.height}
              viewBox={`0 0 ${shellGeo.width} ${shellGeo.height}`}
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <filter
                  id={shadowFilterId}
                  filterUnits="userSpaceOnUse"
                  x={-32}
                  y={-32}
                  width={shellGeo.width + 64}
                  height={shellGeo.height + 64}
                >
                  <feGaussianBlur
                    in="SourceAlpha"
                    stdDeviation={theme === 'dark' ? 9 : 7}
                  />
                  <feOffset dx={0} dy={theme === 'dark' ? 8 : 5} result="offsetblur" />
                  <feFlood
                    floodColor={
                      theme === 'dark'
                        ? 'rgba(0, 0, 0, 0.56)'
                        : 'rgba(0, 0, 0, 0.10)'
                    }
                  />
                  <feComposite in2="offsetblur" operator="in" result="shadow" />
                  <feComposite in="shadow" in2="SourceAlpha" operator="out" />
                </filter>
                <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                  <path d={shellGeo.path} />
                </clipPath>
              </defs>
              <path d={shellGeo.path} fill="#000" filter={`url(#${shadowFilterId})`} />
            </svg>

            <div
              className="site-navbar-backdrop"
              style={{
                clipPath: `path('${shellGeo.path}')`,
                WebkitClipPath: `path('${shellGeo.path}')`,
              }}
              aria-hidden="true"
            />

            <svg
              className="site-navbar-highlight"
              width={shellGeo.width}
              height={shellGeo.height}
              viewBox={`0 0 ${shellGeo.width} ${shellGeo.height}`}
              aria-hidden="true"
              focusable="false"
            >
              <path
                d={shellGeo.path}
                fill="none"
                stroke="var(--nav-shell-highlight)"
                strokeWidth="2"
                clipPath={`url(#${clipId})`}
              />
            </svg>
          </>
        )}

        <Link
          ref={brandRef}
          to="/"
          className="site-brand-lobe"
          aria-label="TerraIgnis home"
          title="TerraIgnis"
        >
          <TerraIgnisLogo
            theme={theme}
            iconOnly
            aria-hidden="true"
            className="site-logo-mark"
          />
          <span className="site-brand-name">
            Terra<span className="site-brand-accent">Ignis</span>
          </span>
        </Link>

        <div ref={navLobeRef} className="site-nav-lobe">
          <nav className="site-nav" aria-label="Primary navigation">
            {navItems.map(({ id, label, path }, index) => {
              const hideDivider =
                index === activeIndex || index + 1 === activeIndex;

              return (
                <Fragment key={id}>
                  <NavLink
                    to={path}
                    end={id === 'global'}
                    className={({ isActive }) =>
                      `site-nav-link${id === 'how-it-works' ? ' is-featured' : ''}${isActive ? ' is-active' : ''}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && id !== 'how-it-works' && (
                          <motion.span
                            layoutId="site-nav-active-pill"
                            className="site-nav-pill"
                            transition={{
                              type: 'spring',
                              stiffness: 360,
                              damping: 32,
                              mass: 0.85,
                            }}
                          />
                        )}
                        <span className="relative z-10">{label}</span>
                      </>
                    )}
                  </NavLink>
                  {index < navItems.length - 1 && (
                    <span
                      className={`site-nav-divider${hideDivider ? ' is-hidden' : ''}`}
                      aria-hidden="true"
                    />
                  )}
                </Fragment>
              );
            })}
          </nav>
        </div>

        <div ref={actionLobeRef} className="site-action-lobe">
          <button
            type="button"
            className="theme-toggle"
            onClick={onThemeToggle}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            aria-pressed={theme === 'dark'}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? (
              <Moon size={13} strokeWidth={2} />
            ) : (
              <Sun size={13} strokeWidth={2} />
            )}
            <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
