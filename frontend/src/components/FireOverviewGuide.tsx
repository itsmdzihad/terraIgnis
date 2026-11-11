import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Database,
  Hexagon,
  Layers,
  Maximize2,
  Minus,
  Plus,
  Radio,
  SlidersHorizontal,
  TrendingUp,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import TerraIgnisLogo from './TerraIgnisLogo';
import fireOverviewMapShot from '../assets/Fire Overview Shots/Map.png';
import fireOverviewCardsShot from '../assets/Fire Overview Shots/Activity Detections, H3 active Cells, Burn severity & Fire activity Trends.png';
import fireOverviewFilterShot from '../assets/Fire Overview Shots/Filter.png';
import fireOverviewSnapshotShot from '../assets/Fire Overview Shots/Dataset Snapshot.png';

type ShotId = 'map' | 'cards' | 'filters' | 'snapshot';
type ComponentId =
  | 'top-bar'
  | 'filter-drawer'
  | 'h3-map'
  | 'floating-legend'
  | 'dataset-snapshot'
  | 'active-detections'
  | 'active-cells'
  | 'severity-rings'
  | 'trends-chart';

interface ShotEntry {
  id: ShotId;
  shortLabel: string;
  title: string;
  zone: string;
  caption: string;
  src: string;
}

interface ComponentEntry {
  id: ComponentId;
  index: string;
  shortName: string;
  zone: string;
  metricTag: string;
  title: string;
  description: string;
  bullets: string[];
  shotId: ShotId;
  shotLabel: string;
}

const SHOTS: readonly ShotEntry[] = [
  {
    id: 'map',
    shortLabel: 'Hotspot Map',
    title: 'Interactive H3 Map, Pagination & Floating Legend',
    zone: 'Left Stage · /',
    caption:
      'Floating pagination pill (Showing 5,000 of 14.7K cell-dates · 1/3), Dataset snapshot & Filters controls, Resolution-7 H3 map canvas, and segmented All | MODIS | VIIRS legend.',
    src: fireOverviewMapShot,
  },
  {
    id: 'cards',
    shortLabel: 'Telemetry Column',
    title: 'Active Detections, H3 Cells, Burn Rings & Trends',
    zone: 'Right Column · /',
    caption:
      'Four stacked analytics panels: 22-day detection bars, J–D monthly anomaly bars, proportional concentric sensor mix rings, and interactive Fire Activity Trends area curve.',
    src: fireOverviewCardsShot,
  },
  {
    id: 'filters',
    shortLabel: 'Filter Controls',
    title: 'Collapsible Filter Drawer & Lat / Lon Jump',
    zone: 'Map Overlay · Expandable',
    caption:
      'Query filters for Observation Period (Year vs. All years), UTC Observation Date, Country (matched on H3 cell centers), Sensor Type, Page Size (1K–50K), Burn Index bounds, and coordinate jump.',
    src: fireOverviewFilterShot,
  },
  {
    id: 'snapshot',
    shortLabel: 'Dataset Snapshot',
    title: 'System-Wide Dataset Snapshot Modal',
    zone: 'Global Modal · Top-Right Toolbar',
    caption:
      'Live /api/stats summary broken into Dataset Coverage (period, observed dates, unique cells, Res-7), Sensor Mix (MODIS vs. VIIRS vs. Dual), and Burn Index quartiles + P95.',
    src: fireOverviewSnapshotShot,
  },
];

const OVERVIEW_SPECS = [
  { label: 'Spatial Grid', value: 'Uber H3 Resolution 7' },
  { label: 'Sensors', value: 'MODIS (~1 km) · VIIRS (~375 m) · Dual' },
  { label: 'Map Pagination', value: '1,000 – 50,000 cell-dates / page' },
  { label: 'Severity Metric', value: '0 – 100 Relative Burn Index' },
] as const;

const COMPONENTS: readonly ComponentEntry[] = [
  {
    id: 'h3-map',
    index: '01',
    shortName: 'H3 Map',
    zone: 'Map · Primary Canvas',
    metricTag: 'H3 Res-7',
    title: 'Interactive H3 Hotspot Map',
    description:
      'Renders paginated H3 Resolution-7 hexagons shaded by 0–100 Burn Index and automatically computes viewport latitude, longitude, and zoom around loaded records.',
    bullets: [
      'Clicking any hexagon highlights it in cyan and sets selectedH3Cell globally',
      'Keeps active hexagon synchronized when navigating to Cell Explorer (/cells)',
      'Maintains centered loading, retryable network error & empty-match overlays',
    ],
    shotId: 'map',
    shotLabel: 'View Map Shot',
  },
  {
    id: 'top-bar',
    index: '02',
    shortName: 'Header & Pager',
    zone: 'Map · Top Bar',
    metricTag: '1K–50K / page',
    title: 'Floating Map Header, Pagination & Actions',
    description:
      'Top-left floating pill displays filtered cell-date record counts and Previous / Next pagination while top-right buttons open Dataset Snapshot, Filters (with active badge), and Refresh.',
    bullets: [
      'Displays live Loading <Country> status during country polygon queries',
      'Resets page offset cleanly whenever date, sensor, or burn bounds change',
      'Refresh button re-queries fires, /api/stats, /api/anomalies & /api/calendar',
    ],
    shotId: 'map',
    shotLabel: 'View Map Shot',
  },
  {
    id: 'filter-drawer',
    index: '03',
    shortName: 'Filter Drawer',
    zone: 'Map · Expandable',
    metricTag: '8 Controls',
    title: 'Filter Controls & Lat / Lon Jump',
    description:
      'Collapsible query drawer narrowing detections by Year/All-years window, UTC Date, Country centroids, Sensor Type, Records/page (1,000–50,000), Min/Max Burn Index, or H3 Cell.',
    bullets: [
      'Matches Country selections against Resolution-7 H3 hexagon centers',
      'Converts manual coordinates via latLngToCell(lat, lon, 7) on submit',
      'Supports one-click Clear all reset plus Escape & outside-pointer dismiss',
    ],
    shotId: 'filters',
    shotLabel: 'View Filters Shot',
  },
  {
    id: 'floating-legend',
    index: '04',
    shortName: 'Legend Switch',
    zone: 'Map · Bottom-Right',
    metricTag: 'All | MODIS | VIIRS',
    title: 'Floating Legend & Sensor Quick-Switch',
    description:
      'Collapsible bottom-right glass legend housing the three-way segmented sensor switch, global Mean Burn Index readout, and 0–100 severity gradient bar.',
    bullets: [
      'Switches active view instantaneously between All, MODIS, and VIIRS',
      'Chevron toggle collapses body content for unobstructed full-map panning',
      'Reports live system Mean Burn Index from /api/stats',
    ],
    shotId: 'map',
    shotLabel: 'View Map Shot',
  },
  {
    id: 'active-detections',
    index: '05',
    shortName: 'Detections',
    zone: 'Telemetry · Row 1 Left',
    metricTag: '22-Day Bars',
    title: 'Active Detections & 22-Day Waveform',
    description:
      'Headline counter reflecting current country/filter totals or dataset raw observations, paired with a 15-day delta badge, 22-day bar strip, and VIIRS / MODIS / Dual counts.',
    bullets: [
      'Compares recent 15 observed days vs. prior 15 days via /api/calendar',
      'Hovering individual waveform bars reveals exact UTC date & cell-date totals',
      'Separates raw VIIRS, MODIS & Dual-Sensor Match totals in the footer list',
    ],
    shotId: 'cards',
    shotLabel: 'View Telemetry Shot',
  },
  {
    id: 'active-cells',
    index: '06',
    shortName: 'H3 Cells',
    zone: 'Telemetry · Row 1 Right',
    metricTag: 'J–D Anomalies',
    title: 'H3 Active Cells & Monthly Anomalies',
    description:
      'Tracks unique Resolution-7 H3 cells in view alongside a month-over-month anomaly percentage delta badge and a 12-month J–D anomaly histogram.',
    bullets: [
      'Counts unique active H3 cells matching active filters or global coverage',
      'Computes percentage delta between the two latest active months',
      'Interactive J–D bars reveal exact outlier totals in floating pill tooltips',
    ],
    shotId: 'cards',
    shotLabel: 'View Telemetry Shot',
  },
  {
    id: 'severity-rings',
    index: '07',
    shortName: 'Sensor Rings',
    zone: 'Telemetry · Row 2',
    metricTag: '30d Deltas',
    title: 'Burn Severity & Sensor Mix Rings',
    description:
      'Three proportional concentric SVG arcs (VIIRS Raw outer, MODIS Raw middle, Dual Match inner) framing total raw observations alongside Mean Index, Outliers, and Cell-Dates deltas.',
    bullets: [
      'Calculates proportional arc lengths dynamically from /api/stats shares',
      'Displays 30d vs. prior-30d percentage trend pills for severity & outliers',
      'Hovering legend dots displays exact percentage share per instrument tier',
    ],
    shotId: 'cards',
    shotLabel: 'View Telemetry Shot',
  },
  {
    id: 'trends-chart',
    index: '08',
    shortName: 'Activity Trends',
    zone: 'Telemetry · Row 3',
    metricTag: '3 Metrics · 4 Windows',
    title: 'Fire Activity Trends Area Chart',
    description:
      'Interactive trend surface switching across Detections, Burn Index, and Anomalies over 30d, 14d, 7d, or All observed dates—clicking any date locks selectedDate globally.',
    bullets: [
      'Crosshair callout reports exact daily total & % variance vs. period mean',
      'Clicking a date filters Fire Overview, Filter Drawer & Daily Activity together',
      'Provides inline Retry recovery state whenever calendar data is unreachable',
    ],
    shotId: 'cards',
    shotLabel: 'View Telemetry Shot',
  },
  {
    id: 'dataset-snapshot',
    index: '09',
    shortName: 'Snapshot Modal',
    zone: 'Modal · Global Stats',
    metricTag: '3 Stat Cards',
    title: 'Dataset Snapshot Modal',
    description:
      'Triggered from the top-right Dataset snapshot pill to inspect Parquet temporal coverage, raw vs. harmonized instrument counts, and full Burn Index distribution statistics.',
    bullets: [
      'Dataset Coverage reports date span, observed days & unique Res-7 cells',
      'Sensor Mix contrasts MODIS Raw, VIIRS Raw & Dual-Sensor Harmonized counts',
      'Burn Index Metrics summarizes Mean, Median, Min, Max & P95 Extreme threshold',
    ],
    shotId: 'snapshot',
    shotLabel: 'View Snapshot Shot',
  },
];

const BENTO_DOCK = [
  { id: 'top-bar' as ComponentId, label: 'Pagination & Header', icon: Layers, tone: '#2563eb' },
  { id: 'filter-drawer' as ComponentId, label: 'Filter Drawer', icon: SlidersHorizontal, tone: '#4f46e5' },
  { id: 'h3-map' as ComponentId, label: 'H3 Map Canvas', icon: Hexagon, tone: '#0284c7' },
  { id: 'severity-rings' as ComponentId, label: 'Sensor Mix Rings', icon: Radio, tone: '#d97706' },
  { id: 'trends-chart' as ComponentId, label: 'Activity Trends', icon: TrendingUp, tone: '#059669' },
];

export default function FireOverviewGuide({ theme = 'dark' }: { theme?: 'light' | 'dark' }) {
  const galleryRef = useRef<HTMLElement>(null);
  const [activeShotId, setActiveShotId] = useState<ShotId>('map');
  const [selectedComponentId, setSelectedComponentId] = useState<ComponentId>('h3-map');
  const [lowerShotId, setLowerShotId] = useState<'filters' | 'snapshot'>('filters');
  const [lightboxShotId, setLightboxShotId] = useState<ShotId | null>(null);

  const activeShotIndex = Math.max(
    0,
    SHOTS.findIndex((shot) => shot.id === activeShotId),
  );
  const activeShot = SHOTS[activeShotIndex];
  const secondaryThumbnails = SHOTS.filter((shot) => shot.id !== activeShot.id);
  const selectedComponent =
    COMPONENTS.find((comp) => comp.id === selectedComponentId) ?? COMPONENTS[0];
  const lowerRightShot = SHOTS.find((shot) => shot.id === lowerShotId) ?? SHOTS[2];
  const lightboxShot = lightboxShotId ? SHOTS.find((shot) => shot.id === lightboxShotId) ?? null : null;

  const stepShot = (delta: -1 | 1) => {
    const nextIndex = (activeShotIndex + delta + SHOTS.length) % SHOTS.length;
    setActiveShotId(SHOTS[nextIndex].id);
  };

  const inspectComponentShot = (shotId: ShotId) => {
    setActiveShotId(shotId);
    galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!lightboxShotId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightboxShotId(null);
        return;
      }
      const idx = SHOTS.findIndex((shot) => shot.id === lightboxShotId);
      if (idx === -1) return;
      if (event.key === 'ArrowRight') {
        setLightboxShotId(SHOTS[(idx + 1) % SHOTS.length].id);
      } else if (event.key === 'ArrowLeft') {
        setLightboxShotId(SHOTS[(idx - 1 + SHOTS.length) % SHOTS.length].id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxShotId]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="hiw-fo-wrap"
    >
      <div className="hiw-fo-sheet">
        {/* ================================================================
            BAND 1: FULL-SCREEN HERO SHOWCASE & WALKTHROUGH
            ================================================================ */}
        <section ref={galleryRef} className="hiw-fo-band hiw-fo-band--soft">
          <div className="hiw-fo-topbar">
            <nav aria-label="Breadcrumb" className="hiw-fo-breadcrumb">
              <Link to="/how-it-works" className="hiw-fo-crumb-link">
                How It Works
              </Link>
              <ChevronRight size={13} aria-hidden="true" />
              <span>Sections</span>
              <ChevronRight size={13} aria-hidden="true" />
              <span className="hiw-fo-crumb-current">Fire Overview</span>
            </nav>

            <Link to="/how-it-works" className="hiw-fo-back-link">
              <ArrowLeft size={14} />
              <span>Back to Bento Grid</span>
            </Link>
          </div>

          <header className="hiw-fo-hero-head">
            <h1 id="how-it-works-detail-title" className="hiw-fo-display-title">
              FIRE OVERVIEW
            </h1>
          </header>

          <div className="hiw-fo-split-row">
            {/* Left Gallery */}
            <div className="hiw-fo-gallery">
              <button
                type="button"
                onClick={() => setLightboxShotId(activeShot.id)}
                className="hiw-fo-stage-btn group"
                aria-label={`Inspect ${activeShot.title} fullscreen`}
              >
                <div className="hiw-fo-stage-plate">
                  <img
                    src={activeShot.src}
                    alt={activeShot.title}
                    className="hiw-fo-stage-img transition-transform duration-300 group-hover:scale-[1.012]"
                  />
                </div>
                <span className="hiw-fo-stage-pill">
                  <Maximize2 size={12} />
                  <span>{activeShot.shortLabel}</span>
                </span>
              </button>

              <div className="hiw-fo-thumb-grid" role="group" aria-label="Switch Fire Overview screenshot">
                {secondaryThumbnails.map((shot) => (
                  <button
                    key={shot.id}
                    type="button"
                    onClick={() => setActiveShotId(shot.id)}
                    className="hiw-fo-thumb group"
                    aria-label={`Preview ${shot.shortLabel}`}
                  >
                    <div className="hiw-fo-thumb-media">
                      <img src={shot.src} alt={shot.shortLabel} className="hiw-fo-thumb-img" />
                    </div>
                    <span className="hiw-fo-thumb-label">{shot.shortLabel}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Summary, Stepper + CTA & Spec Table */}
            <div className="hiw-fo-summary">
              <div>
                <h2 className="hiw-fo-subtitle">{activeShot.title}</h2>
                <p className="hiw-fo-route-tag">Route · / · Section 01</p>

                <div className="hiw-fo-prose">
                  <p>
                    <strong>Fire Overview</strong> is TerraIgnis&rsquo;s live command center, pairing an interactive
                    Deck.gl and Mapbox Resolution-7 H3 hotspot map on the left with a scrollable four-card telemetry
                    stack on the right.
                  </p>
                  <p>{activeShot.caption}</p>
                </div>

                <div className="hiw-fo-action-row">
                  <div className="hiw-fo-stepper" aria-label="Cycle captured screens">
                    <button
                      type="button"
                      onClick={() => stepShot(-1)}
                      className="hiw-fo-step-btn"
                      aria-label="Previous capture"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="hiw-fo-step-value tabular-nums">
                      0{activeShotIndex + 1} / 0{SHOTS.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => stepShot(1)}
                      className="hiw-fo-step-btn"
                      aria-label="Next capture"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <Link to="/" className="hiw-fo-primary-cta">
                    <span>Open Live Fire Overview</span>
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
              </div>

              <dl className="hiw-fo-specs">
                {OVERVIEW_SPECS.map((spec) => (
                  <div key={spec.label} className="hiw-fo-spec-row">
                    <dt>{spec.label}</dt>
                    <dd>{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="hiw-fo-split-row hiw-fo-split-row--lower">
            <div className="hiw-fo-detail-blocks">
              <div className="hiw-fo-detail-block">
                <h3>Map Controls, Pagination &amp; Floating Legend</h3>
                <p>
                  At the top-left of the map stage, a glass bar tracks the filtered record slice (for example{' '}
                  <em>Showing 5,000 of 14.7K cell-date records</em>) alongside <strong>Previous / Next</strong>{' '}
                  pagination buttons so large multi-year queries render cleanly. Top-right toolbar buttons open{' '}
                  <strong>Dataset snapshot</strong>, toggle the collapsible <strong>Filter Controls</strong> drawer
                  with an active constraint counter badge, and trigger a full <strong>Refresh</strong> across fires,
                  stats, anomalies, and calendar series.
                </p>
              </div>

              <div className="hiw-fo-detail-block">
                <h3>Telemetry Stack &amp; Synchronized Filtering</h3>
                <p>
                  On the right side of Fire Overview, four coordinated analytics modules turn the active slice into
                  immediate signal: <strong>Active Detections</strong> pairs a 15-day delta badge and 22-day waveform
                  strip with VIIRS, MODIS, and Dual-Sensor counts; <strong>H3 Active Cells</strong> graphs 12 months
                  (J–D) of anomalies; <strong>Burn Severity &amp; Sensor Mix</strong> frames raw observations inside
                  concentric arcs; and <strong>Fire Activity Trends</strong> click-syncs UTC dates directly with{' '}
                  <code>/cells</code> and <code>/activity</code>.
                </p>
              </div>
            </div>

            <div className="hiw-fo-secondary-visual">
              <button
                type="button"
                onClick={() => setLightboxShotId('cards')}
                className="hiw-fo-media-btn group"
                aria-label="Inspect Right Telemetry Stack screenshot fullscreen"
              >
                <div className="hiw-fo-secondary-plate">
                  <img
                    src={fireOverviewCardsShot}
                    alt="Fire Overview Right Telemetry Stack showing Active Detections, H3 Active Cells, Burn Severity & Sensor Mix, and Fire Activity Trends"
                    className="hiw-fo-secondary-img transition-transform duration-300 group-hover:scale-[1.012]"
                  />
                </div>
                <div className="hiw-fo-media-caption">
                  <span>Right Telemetry Column · 4 Live Analytics Panels</span>
                  <span className="hiw-fo-zoom-hint">
                    <Maximize2 size={12} /> Expand
                  </span>
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* ================================================================
            BAND 2: INTERLOCKING MONOLITH BENTO ("EVERY COMPONENT EXPLAINED")
            ================================================================ */}
        <section className="hiw-fo-band hiw-fo-band--bright" aria-labelledby="hiw-components-heading">
          <div className="hiw-fo-section-head">
            <h2 id="hiw-components-heading" className="hiw-fo-section-title">
              EVERY COMPONENT EXPLAINED
            </h2>
            <p className="hiw-fo-section-sub">
              Click any module inside the bento architecture below to inspect its behavior and jump straight to its screenshot
            </p>
          </div>

          <div className="hiw-fo-bento-casing">
            {/* TOP INTERLOCKING ZONE */}
            <div className="hiw-fo-bento-top">
              {/* Left Hero Tile: Map Header, Pagination & Core Links */}
              <div
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--hero ${
                  selectedComponentId === 'top-bar' ? 'is-selected' : ''
                }`}
              >
                <div className="hiw-fo-bento-hero-top">
                  <TerraIgnisLogo iconOnly theme={theme === 'dark' ? 'dark' : 'light'} className="w-8 h-8" />
                  <div className="hiw-fo-bento-clock tabular-nums">
                    <span>Map Stage</span>
                    <strong>01 · RES-7</strong>
                  </div>
                </div>

                <div className="hiw-fo-bento-hero-copy">
                  <p className="hiw-fo-bento-mono hiw-fo-bento-hero-headline">
                    FLOATING HEADER +<br />
                    PAGINATION &amp; LIVE H3<br />
                    HOTSPOT COMMAND.
                  </p>
                </div>

                <div className="hiw-fo-bento-links-grid">
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('top-bar')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'top-bar' ? 'is-active' : ''}`}
                  >
                    HEADER &amp; PAGINATION
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('h3-map')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'h3-map' ? 'is-active' : ''}`}
                  >
                    H3 HEXAGON LAYER
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('filter-drawer')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'filter-drawer' ? 'is-active' : ''}`}
                  >
                    FILTER DRAWER
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('floating-legend')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'floating-legend' ? 'is-active' : ''}`}
                  >
                    LEGEND SWITCH
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('dataset-snapshot')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'dataset-snapshot' ? 'is-active' : ''}`}
                  >
                    SNAPSHOT MODAL
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('trends-chart')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'trends-chart' ? 'is-active' : ''}`}
                  >
                    TRENDS CHART
                  </button>
                </div>
              </div>

              {/* Middle Stacked Column: Visual Map Tile + Detections & H3 Cells Tile */}
              <div className="hiw-fo-bento-mid-col">
                <button
                  type="button"
                  onClick={() => setSelectedComponentId('h3-map')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--photo group ${
                    selectedComponentId === 'h3-map' ? 'is-selected' : ''
                  }`}
                  aria-label="Inspect Interactive H3 Hotspot Map component"
                >
                  <img
                    src={fireOverviewMapShot}
                    alt="Interactive H3 Hotspot Map Preview"
                    className="hiw-fo-bento-photo transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <span className="hiw-fo-bento-photo-tag">H3 MAP CANVAS · 1K–50K</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('active-detections')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--cta group ${
                    selectedComponentId === 'active-detections' || selectedComponentId === 'active-cells'
                      ? 'is-selected'
                      : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">Detections &amp; Active Cells</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                    22-DAY BARS &amp; J–D ANOMALIES
                  </span>
                  <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                    <ArrowUpRight size={15} />
                  </span>
                </button>
              </div>

              {/* Right 4-Tile Micro Stack */}
              <div className="hiw-fo-bento-right-col">
                <button
                  type="button"
                  onClick={() => setSelectedComponentId('active-cells')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--status group ${
                    selectedComponentId === 'active-cells' ? 'is-selected' : ''
                  }`}
                >
                  <div className="hiw-fo-bento-status-row">
                    <span className="hiw-fo-bento-eyebrow">Active H3 Cells</span>
                    <span className="hiw-fo-bento-plus" aria-hidden="true">
                      <Plus size={14} />
                    </span>
                  </div>
                  <span className="hiw-fo-bento-status-val">
                    <span className="hiw-fo-status-dot" aria-hidden="true" />
                    UNIQUE CELLS &amp; MOM %
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('filter-drawer')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--dark group ${
                    selectedComponentId === 'filter-drawer' ? 'is-selected' : ''
                  }`}
                >
                  <SlidersHorizontal size={17} strokeWidth={1.9} />
                  <span className="hiw-fo-bento-mono hiw-fo-bento-dark-label">
                    FILTER CONTROLS &amp; LAT / LON JUMP.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('severity-rings')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--works group ${
                    selectedComponentId === 'severity-rings' ? 'is-selected' : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">Burn Severity</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                    CONCENTRIC MIX RINGS
                  </span>
                  <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                    <ArrowUpRight size={15} />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('floating-legend')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--about group ${
                    selectedComponentId === 'floating-legend' ? 'is-selected' : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">Legend Bar</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-sub-sm">ALL | MODIS | VIIRS</span>
                  <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                    <ArrowUpRight size={15} />
                  </span>
                </button>
              </div>
            </div>

            {/* BOTTOM 3-CARD ROW */}
            <div className="hiw-fo-bento-bottom">
              {/* Bottom-Left: UI Captures + 3 Mini Gallery Shots */}
              <div
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--journal ${
                  selectedComponentId === 'dataset-snapshot' ? 'is-selected' : ''
                }`}
              >
                <div className="hiw-fo-bento-head-row">
                  <span className="hiw-fo-bento-eyebrow">UI Surfaces &amp; Previews</span>
                  <button
                    type="button"
                    onClick={() => inspectComponentShot('cards')}
                    className="hiw-fo-bento-circle-arrow hiw-fo-bento-circle-arrow--static"
                    aria-label="Inspect Telemetry Column screenshot"
                  >
                    <ArrowUpRight size={15} />
                  </button>
                </div>

                <p className="hiw-fo-bento-mono hiw-fo-bento-title">
                  FILTERS, TELEMETRY &amp; SNAPSHOT.
                </p>

                <div className="hiw-fo-bento-thumb-strip">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedComponentId('filter-drawer');
                      setLightboxShotId('filters');
                    }}
                    className="hiw-fo-bento-thumb"
                    aria-label="Zoom Filter Controls screenshot"
                  >
                    <img src={fireOverviewFilterShot} alt="Filter Drawer" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedComponentId('active-detections');
                      setLightboxShotId('cards');
                    }}
                    className="hiw-fo-bento-thumb"
                    aria-label="Zoom Telemetry Cards screenshot"
                  >
                    <img src={fireOverviewCardsShot} alt="Telemetry Stack" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedComponentId('dataset-snapshot');
                      setLightboxShotId('snapshot');
                    }}
                    className="hiw-fo-bento-thumb"
                    aria-label="Zoom Dataset Snapshot screenshot"
                  >
                    <img src={fireOverviewSnapshotShot} alt="Dataset Snapshot" />
                  </button>
                </div>
              </div>

              {/* Bottom-Middle: Trends Chart */}
              <button
                type="button"
                onClick={() => setSelectedComponentId('trends-chart')}
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--resources group ${
                  selectedComponentId === 'trends-chart' ? 'is-selected' : ''
                }`}
              >
                <span className="hiw-fo-bento-eyebrow">Area Trends</span>
                <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                  FIRE ACTIVITY TRENDS &amp; DATE SYNC
                </span>
                <span className="hiw-fo-bento-micro-note">
                  Detections, Burn Index &amp; Anomalies across 7d / 14d / 30d / All observed dates.
                </span>
                <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                  <ArrowUpRight size={15} />
                </span>
              </button>

              {/* Bottom-Right: Dataset Snapshot & Quick Component Dock */}
              <div
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--stack ${
                  selectedComponentId === 'dataset-snapshot' ? 'is-selected' : ''
                }`}
              >
                <div className="hiw-fo-bento-head-row">
                  <span className="hiw-fo-bento-eyebrow">Core Stack &amp; Snapshot</span>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('dataset-snapshot')}
                    className="hiw-fo-bento-circle-arrow hiw-fo-bento-circle-arrow--static"
                    aria-label="Inspect Dataset Snapshot component"
                  >
                    <Database size={14} />
                  </button>
                </div>

                <p className="hiw-fo-bento-mono hiw-fo-bento-title">
                  INTERACTIVE CONTROLS DOCK
                </p>

                <div className="hiw-fo-bento-dock-row" role="group" aria-label="Select Fire Overview component">
                  {BENTO_DOCK.map((item) => {
                    const Icon = item.icon;
                    const isActive = selectedComponentId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedComponentId(item.id)}
                        className={`hiw-fo-bento-dock-btn ${isActive ? 'is-active' : ''}`}
                        title={item.label}
                        aria-label={item.label}
                      >
                        <Icon size={18} style={{ color: item.tone }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* LIVE SELECTED COMPONENT INSPECTOR BAR */}
          <div className="hiw-fo-inspector" aria-live="polite">
            <div className="hiw-fo-inspector-pills" role="tablist" aria-label="Fire Overview components">
              {COMPONENTS.map((comp) => (
                <button
                  key={comp.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedComponentId === comp.id}
                  onClick={() => setSelectedComponentId(comp.id)}
                  className={`hiw-fo-inspector-tab ${selectedComponentId === comp.id ? 'is-active' : ''}`}
                >
                  <span className="tabular-nums opacity-65">{comp.index}</span>
                  <span>{comp.shortName}</span>
                </button>
              ))}
            </div>

            <div className="hiw-fo-inspector-body">
              <div className="hiw-fo-inspector-main">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="hiw-fo-inspector-zone">{selectedComponent.zone}</span>
                  <span className="hiw-fo-inspector-metric tabular-nums">{selectedComponent.metricTag}</span>
                </div>
                <h3 className="hiw-fo-inspector-title">
                  {selectedComponent.index} · {selectedComponent.title}
                </h3>
                <p className="hiw-fo-inspector-desc">{selectedComponent.description}</p>
              </div>

              <ul className="hiw-fo-inspector-list">
                {selectedComponent.bullets.map((item) => (
                  <li key={item}>
                    <Activity size={13} className="shrink-0 mt-0.5 opacity-60" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="hiw-fo-inspector-actions">
                <button
                  type="button"
                  onClick={() => inspectComponentShot(selectedComponent.shotId)}
                  className="hiw-fo-outline-btn"
                >
                  {selectedComponent.shotLabel} ↑
                </button>
                <Link to="/" className="hiw-fo-primary-cta">
                  <span>Open Live /</span>
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
            BAND 3: FILTER DRAWER & DATASET SNAPSHOT FEATURE SPLIT
            ================================================================ */}
        <section className="hiw-fo-band hiw-fo-band--soft">
          <div className="hiw-fo-bottom-split">
            <div className="hiw-fo-bottom-copy">
              <span className="hiw-fo-kicker">Precision Controls &amp; Provenance</span>
              <h2>Filter Drawer &amp; Dataset Snapshot</h2>
              <p>
                {lowerShotId === 'filters'
                  ? 'Toggle Filter Controls from the top-right toolbar to filter across Observation Period, UTC Date, Country centroids, Sensor Type, page sizes up to 50,000, Min/Max Burn Index, Selected H3 Cell, or convert any latitude/longitude directly to its Resolution-7 H3 index.'
                  : 'Open Dataset Snapshot anytime from the map toolbar to verify global temporal coverage, raw MODIS and VIIRS observation totals vs. dual-sensor harmonized records, and system-wide Mean, Median, Min, Max, and P95 Extreme thresholds.'}
              </p>

              <div className="hiw-fo-switch-row">
                <div className="hiw-fo-toggle-group" role="tablist" aria-label="Toggle spotlight capture">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={lowerShotId === 'filters'}
                    onClick={() => setLowerShotId('filters')}
                    className={`hiw-fo-toggle-pill ${lowerShotId === 'filters' ? 'is-active' : ''}`}
                  >
                    Filter Controls
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={lowerShotId === 'snapshot'}
                    onClick={() => setLowerShotId('snapshot')}
                    className={`hiw-fo-toggle-pill ${lowerShotId === 'snapshot' ? 'is-active' : ''}`}
                  >
                    Dataset Snapshot
                  </button>
                </div>

                <Link to="/" className="hiw-fo-primary-cta">
                  <span>Try Live Controls</span>
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            </div>

            <div className="hiw-fo-bottom-media">
              <button
                type="button"
                onClick={() => setLightboxShotId(lowerRightShot.id)}
                className="hiw-fo-media-btn group"
                aria-label={`Inspect ${lowerRightShot.title} fullscreen`}
              >
                <div className="hiw-fo-bottom-plate">
                  <img
                    src={lowerRightShot.src}
                    alt={lowerRightShot.title}
                    className="hiw-fo-bottom-img transition-transform duration-300 group-hover:scale-[1.015]"
                  />
                </div>
                <div className="hiw-fo-media-caption">
                  <span>{lowerRightShot.title}</span>
                  <span className="hiw-fo-zoom-hint">
                    <Maximize2 size={12} /> Expand
                  </span>
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* ================================================================
            BAND 4: FULL-SCREEN EDITORIAL FOOTER
            ================================================================ */}
        <footer className="hiw-fo-band hiw-fo-band--footer">
          <div className="hiw-fo-footer-grid">
            <div className="hiw-fo-footer-brand">
              <div className="flex items-center gap-2.5">
                <TerraIgnisLogo iconOnly theme={theme} className="w-7 h-7" />
                <span className="hiw-fo-footer-wordmark">TERRAIGNIS</span>
              </div>
              <p className="hiw-fo-footer-note">
                MODIS (~1 km) &amp; VIIRS (~375 m) Active Fire Harmonization on Uber H3 Resolution 7.
              </p>
              <Link to="/how-it-works" className="hiw-fo-footer-back">
                <ArrowLeft size={13} />
                <span>Return to How It Works Bento</span>
              </Link>
            </div>

            <div className="hiw-fo-footer-col">
              <h4>LIVE ROUTES</h4>
              <ul>
                <li>
                  <Link to="/">Fire Overview</Link>
                </li>
                <li>
                  <Link to="/cells">Cell Explorer</Link>
                </li>
                <li>
                  <Link to="/activity">Daily Activity</Link>
                </li>
                <li>
                  <Link to="/pipeline">Data Pipeline</Link>
                </li>
              </ul>
            </div>

            <div className="hiw-fo-footer-col">
              <h4>SECTION GUIDES</h4>
              <ul>
                <li>
                  <Link to="/how-it-works/fire-overview">01 · Fire Overview</Link>
                </li>
                <li>
                  <Link to="/how-it-works/cell-explorer">02 · Cell Explorer</Link>
                </li>
                <li>
                  <Link to="/how-it-works/daily-activity">03 · Daily Activity</Link>
                </li>
                <li>
                  <Link to="/how-it-works/data-pipeline">04 · Data Pipeline</Link>
                </li>
                <li>
                  <Link to="/how-it-works/core-engine">Core Engine &amp; Ignish AI</Link>
                </li>
              </ul>
            </div>

            <div className="hiw-fo-footer-cta">
              <span className="hiw-fo-footer-meta">NEXT GUIDE SECTION</span>
              <p className="hiw-fo-footer-next-name">02 · Cell Explorer</p>
              <Link to="/how-it-works/cell-explorer" className="hiw-fo-footer-btn">
                <span>Explore Cell Explorer</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </footer>
      </div>

      {/* ==================================================================
          FULLSCREEN SCREENSHOT LIGHTBOX
          ================================================================== */}
      {lightboxShot && (
        <div
          className="hiw-fo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightboxShot.title}
          onClick={() => setLightboxShotId(null)}
        >
          <div className="hiw-fo-lightbox-inner" onClick={(event) => event.stopPropagation()}>
            <div className="hiw-fo-lightbox-bar">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-400 block">
                  {lightboxShot.zone}
                </span>
                <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                  {lightboxShot.title}
                </h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const idx = SHOTS.findIndex((s) => s.id === lightboxShot.id);
                    setLightboxShotId(SHOTS[(idx - 1 + SHOTS.length) % SHOTS.length].id);
                  }}
                  className="hiw-fo-lightbox-btn"
                  aria-label="Previous screenshot"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs font-semibold tabular-nums text-slate-300 px-1">
                  {SHOTS.findIndex((s) => s.id === lightboxShot.id) + 1} / {SHOTS.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const idx = SHOTS.findIndex((s) => s.id === lightboxShot.id);
                    setLightboxShotId(SHOTS[(idx + 1) % SHOTS.length].id);
                  }}
                  className="hiw-fo-lightbox-btn"
                  aria-label="Next screenshot"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxShotId(null)}
                  className="hiw-fo-lightbox-btn ml-1"
                  aria-label="Close fullscreen preview"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="hiw-fo-lightbox-stage">
              <img src={lightboxShot.src} alt={lightboxShot.title} className="hiw-fo-lightbox-img" />
            </div>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{lightboxShot.caption}</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
