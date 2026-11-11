import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Compass,
  Eye,
  Hexagon,
  Layers,
  Maximize2,
  Minus,
  Plus,
  Radio,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import TerraIgnisLogo from './TerraIgnisLogo';
import cellExplorerMapShot from '../assets/Cell Explorer Shots/Cell Explorer Map.png';
import cellExplorerResolutionShot from '../assets/Cell Explorer Shots/H3 Cell Resolution.png';
import cellExplorerSensorShot from '../assets/Cell Explorer Shots/Sensor Detection.png';
import cellExplorerSplineShot from '../assets/Cell Explorer Shots/View burn Index.png';

type ShotId = 'map' | 'burn-index' | 'summary' | 'sensors';
type ComponentId =
  | 'regional-map'
  | 'country-cell-select'
  | 'state-overlays'
  | 'cell-summary'
  | 'sensor-split'
  | 'burn-spline'
  | 'window-selector'
  | 'baseline-toggle'
  | 'severity-tooltip';

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
    shortLabel: 'Cell Locator Map',
    title: 'Country Filter, H3 Dropdown & Regional Hexagon Map',
    zone: 'Left Panel · /cells',
    caption:
      'Country selector (matched on H3 centers), observed H3 index dropdown up to 5,000 cells, Clear selection button, and interactive zoom-9 Mapbox & Deck.gl hexagon locator with cyan active highlighting.',
    src: cellExplorerMapShot,
  },
  {
    id: 'burn-index',
    shortLabel: 'Burn Index Spline',
    title: 'View of Burn Index Spline & Daily Median Toggle',
    zone: 'Right Panel · Bottom Chart',
    caption:
      'Fritsch-Carlson monotone cubic spline over observed dates only (0–100 scale), timeframe selector (7d / 14d / 30d / All), Eye icon daily_median overlay, and 5-tier severity nodes.',
    src: cellExplorerSplineShot,
  },
  {
    id: 'summary',
    shortLabel: 'H3 Res-7 Summary',
    title: 'H3 Cell · Resolution 7 Diagnostic Grid',
    zone: 'Right Panel · Top Card',
    caption:
      'Selected 15-character Resolution-7 H3 index paired with nine /api/region telemetry readouts covering observed cell/dates, UTC temporal bounds, total detections, Burn Index stats, and anomaly totals.',
    src: cellExplorerResolutionShot,
  },
  {
    id: 'sensors',
    shortLabel: 'Sensor Detections',
    title: 'MODIS vs. VIIRS Proportional Sensor Bars',
    zone: 'Right Panel · Middle Card',
    caption:
      'Horizontal comparative progress bars weighing ~1 km MODIS detections against ~375 m VIIRS detections for the chosen H3 hexagon, noting aggregation across cell/dates rather than physical fires.',
    src: cellExplorerSensorShot,
  },
];

const CELL_SPECS = [
  { label: 'Spatial Unit', value: 'Uber H3 Resolution 7' },
  { label: 'Cell Index Cap', value: 'Up to 5,000 observed H3 cells' },
  { label: 'History Curve', value: 'Fritsch-Carlson Monotone Spline' },
  { label: 'Severity Tiers', value: '5-Level Robust Z Classification' },
] as const;

const COMPONENTS: readonly ComponentEntry[] = [
  {
    id: 'regional-map',
    index: '01',
    shortName: 'Regional Map',
    zone: 'Left Panel · Primary Canvas',
    metricTag: 'Zoom 9 Focus',
    title: 'Regional H3 Hexagon Locator Map',
    description:
      'Renders unique observed Resolution-7 H3 hexagons matching global Date, Sensor, Country, and Burn Index filters in regional mode and auto-frames either your selected cell or the active cluster.',
    bullets: [
      'Selecting a hexagon centers on cellToLatLng(h3) at zoom 9 and highlights it in cyan',
      'Without a selection, computes spherical centroid & Mercator zoom bounds (1.5–5)',
      'Clicking any rendered hexagon updates selectedH3Cell globally across tabs',
    ],
    shotId: 'map',
    shotLabel: 'View Map Shot',
  },
  {
    id: 'country-cell-select',
    index: '02',
    shortName: 'Country & Cell',
    zone: 'Left Panel · Top Controls',
    metricTag: '5,000 Cells Max',
    title: 'Country Filter, H3 Cell Dropdown & Clear Action',
    description:
      'Pairs the synchronized Country selector (matched by H3 cell center) with the Choose an observed cell dropdown listing up to 5,000 unique H3 strings and a contextual Clear reset pill.',
    bullets: [
      'Retains externally jumped Fire Overview cells with a “· selected” option label',
      'Displays live loading progress, loaded H3 count & inline Retry on query failures',
      'Shows “Country list unavailable.” if country GeoJSON boundaries cannot load',
    ],
    shotId: 'map',
    shotLabel: 'View Map Shot',
  },
  {
    id: 'state-overlays',
    index: '03',
    shortName: 'Panel States',
    zone: 'Right Panel · Lifecycle',
    metricTag: '4 States · Retry',
    title: 'Empty, Loading, 404 & Retry Recovery States',
    description:
      'Right-hand diagnostic column renders structured PanelState cards for empty selections, active fetches, missing 404 cells, and network failures while preventing stale out-of-order updates.',
    bullets: [
      'Guards race conditions by matching region & history responses to selectedH3Cell',
      'Includes dedicated “No cell selected”, “Loading cell analysis...” & “No cell data” cards',
      'Provides inline Retry recovery buttons on both /api/region and anomaly chart errors',
    ],
    shotId: 'summary',
    shotLabel: 'View Summary Shot',
  },
  {
    id: 'cell-summary',
    index: '04',
    shortName: '9-Metric Summary',
    zone: 'Right Panel · Top Card',
    metricTag: '9 Metrics · UTC',
    title: 'H3 Cell · Resolution 7 Summary Grid',
    description:
      'Displays the active 15-character hexagonal identifier above a 3×3 telemetry grid summarizing temporal span, cell-date count, fire detections, Burn Index range, and outlier counts.',
    bullets: [
      'Reports Observed Cell/Dates, First Observed & Last Observed UTC medium dates',
      'Surfaces Total Fire Detections alongside Mean, Min & Max Burn Index (0–100)',
      'Emphasizes Anomaly Count (amber) & Extreme Anomaly Count (rose)',
    ],
    shotId: 'summary',
    shotLabel: 'View Summary Shot',
  },
  {
    id: 'sensor-split',
    index: '05',
    shortName: 'Sensor Detections',
    zone: 'Right Panel · Middle Card',
    metricTag: 'MODIS vs. VIIRS',
    title: 'Sensor Detections Proportional Breakdown',
    description:
      'Compares MODIS (~1 km) and VIIRS (~375 m) fire detection counts for the active H3 hexagon using proportional horizontal percentage bars calculated against their combined sum.',
    bullets: [
      'Sky-blue bar represents MODIS Fire Detections; royal-blue represents VIIRS',
      'Computes exact percentage bar widths dynamically from modis / (modis + viirs)',
      'Notes explicitly that counts aggregate cell/dates rather than distinct physical fires',
    ],
    shotId: 'sensors',
    shotLabel: 'View Sensor Shot',
  },
  {
    id: 'burn-spline',
    index: '06',
    shortName: 'Burn Index Spline',
    zone: 'Right Panel · Bottom Chart',
    metricTag: 'Monotone Cubic',
    title: 'View of Burn Index Anomaly History Spline',
    description:
      'Plots an H3 cell’s observed UTC dates across a clamped [0, 100] scale using a Fritsch-Carlson monotone cubic Hermite spline with soft blue gradient fill and live headline metric updates.',
    bullets: [
      'Passes smoothly through every observation without cubic overshoot across bounds',
      'Headline metric switches from window Mean Burn Index to hovered point Burn Index',
      'Plots observed dates only—gaps represent no detections rather than synthetic zeros',
    ],
    shotId: 'burn-index',
    shotLabel: 'View Spline Shot',
  },
  {
    id: 'window-selector',
    index: '07',
    shortName: 'Time Windows',
    zone: 'Spline Chart · Header',
    metricTag: '7d · 14d · 30d · All',
    title: 'Timeframe Dropdown & Sparse Auto-Fallback',
    description:
      'Allows instant filtering across the past 30 days, past 14 days, past 7 days, or all observed dates, automatically expanding sparse cells with fewer than two recent detections to All.',
    bullets: [
      'Switches to “all observed dates” when < 2 points fall in the latest 30 days',
      'Supports Escape key and outside-pointer dismissal without losing selection',
      'Recalculates up to 5 uppercase UTC date ticks and compact node sizes per window',
    ],
    shotId: 'burn-index',
    shotLabel: 'View Spline Shot',
  },
  {
    id: 'baseline-toggle',
    index: '08',
    shortName: 'Median Baseline',
    zone: 'Spline Chart · Eye Control',
    metricTag: 'daily_median Overlay',
    title: 'Eye Icon Daily Median Baseline Overlay',
    description:
      'Toggles an optional dashed smooth daily_median reference spline directly over the Burn Index curve so analysts can evaluate whether a cell’s activity exceeded seasonal norms.',
    bullets: [
      'Accessible stateful aria-pressed Eye icon sits beside the headline Burn Index score',
      'Renders only over dates containing non-null daily_median reference records',
      'Dynamically appends a dashed “Daily median” key item to the bottom legend when active',
    ],
    shotId: 'burn-index',
    shotLabel: 'View Spline Shot',
  },
  {
    id: 'severity-tooltip',
    index: '09',
    shortName: 'Severity & Tooltip',
    zone: 'Spline Chart · Nodes & Footer',
    metricTag: '5 Tiers · Robust Z',
    title: '5-Tier Anomaly Markers & Hover Tooltip',
    description:
      'Interactive circular nodes color-code each observation across Extreme low, Low, Normal, High, and Extreme high tiers and open a crosshair tooltip with signed robust Z-scores.',
    bullets: [
      'Hovering or keyboard-focusing any node aligns a vertical dashed crosshair guide',
      'Collision-aware tooltip reports UTC Date, Severity pill, Burn Index, Median & Robust Z',
      'Footer displays 5-level legend alongside visible vs. total database record counts',
    ],
    shotId: 'burn-index',
    shotLabel: 'View Spline Shot',
  },
];

const BENTO_DOCK = [
  { id: 'regional-map' as ComponentId, label: 'Regional H3 Map', icon: Hexagon, tone: '#0284c7' },
  { id: 'country-cell-select' as ComponentId, label: 'Country & Cell Dropdown', icon: Compass, tone: '#2563eb' },
  { id: 'cell-summary' as ComponentId, label: '9-Metric Summary Grid', icon: Layers, tone: '#059669' },
  { id: 'sensor-split' as ComponentId, label: 'MODIS vs. VIIRS Bars', icon: Radio, tone: '#4f46e5' },
  { id: 'severity-tooltip' as ComponentId, label: '5-Tier Severity & Tooltip', icon: TrendingUp, tone: '#d97706' },
];

export default function CellExplorerGuide({ theme = 'dark' }: { theme?: 'light' | 'dark' }) {
  const galleryRef = useRef<HTMLElement>(null);
  const [activeShotId, setActiveShotId] = useState<ShotId>('map');
  const [selectedComponentId, setSelectedComponentId] = useState<ComponentId>('regional-map');
  const [lowerShotId, setLowerShotId] = useState<'summary' | 'sensors'>('summary');
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
              <span className="hiw-fo-crumb-current">Cell Explorer</span>
            </nav>

            <Link to="/how-it-works" className="hiw-fo-back-link">
              <ArrowLeft size={14} />
              <span>Back to Bento Grid</span>
            </Link>
          </div>

          <header className="hiw-fo-hero-head">
            <h1 id="how-it-works-detail-title" className="hiw-fo-display-title">
              CELL EXPLORER
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

              <div className="hiw-fo-thumb-grid" role="group" aria-label="Switch Cell Explorer screenshot">
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
                <p className="hiw-fo-route-tag">Route · /cells · Section 02</p>

                <div className="hiw-fo-prose">
                  <p>
                    <strong>Cell Explorer</strong> is TerraIgnis&rsquo;s single-hexagon diagnostic workbench, pairing a
                    Country-aware Regional H3 Locator Map on the left with a 9-metric H3 summary, MODIS vs. VIIRS
                    contribution bars, and a Burn Index anomaly spline on the right.
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

                  <Link to="/cells" className="hiw-fo-primary-cta">
                    <span>Open Live Cell Explorer</span>
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
              </div>

              <dl className="hiw-fo-specs">
                {CELL_SPECS.map((spec) => (
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
                <h3>Spatial Selection, Auto-Zoom &amp; Panel States</h3>
                <p>
                  In the left panel, <strong>Country</strong> filtering matches H3 hexagon centers and shares global
                  context with Fire Overview, while the observed cell selector lists up to{' '}
                  <strong>5,000 H3 indices</strong> and retains externally jumped hexagons with a{' '}
                  <code>· selected</code> indicator. Clicking any displayed cell highlights it in cyan, locks the
                  regional viewport to <code>zoom: 9</code> via <code>cellToLatLng</code>, and coordinates loading, 404,
                  and Retry recovery overlays cleanly.
                </p>
              </div>

              <div className="hiw-fo-detail-block">
                <h3>Observed-Only Honesty &amp; Anomaly Spline</h3>
                <p>
                  Across the right column, <code>/api/region</code> populates a 9-metric Resolution-7 overview and
                  proportional MODIS vs. VIIRS bars before <strong>View of burn index</strong> plots every observed UTC
                  date using a Fritsch-Carlson monotone cubic spline. Gaps never become synthetic zeros, and sparse
                  cells automatically switch from <code>the past 30 days</code> to <code>all observed dates</code> when
                  fewer than two recent observations exist.
                </p>
              </div>
            </div>

            <div className="hiw-fo-secondary-visual">
              <button
                type="button"
                onClick={() => setLightboxShotId('burn-index')}
                className="hiw-fo-media-btn group"
                aria-label="Inspect View of Burn Index Spline screenshot fullscreen"
              >
                <div className="hiw-fo-secondary-plate">
                  <img
                    src={cellExplorerSplineShot}
                    alt="View of Burn Index Anomaly History smooth spline with Eye baseline toggle, Y-axis 0-100 ticks, and 5-tier severity legend"
                    className="hiw-fo-secondary-img transition-transform duration-300 group-hover:scale-[1.012]"
                  />
                </div>
                <div className="hiw-fo-media-caption">
                  <span>Right Panel · View of Burn Index Spline &amp; Daily Median Toggle</span>
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
              {/* Left Hero Tile: Regional Selection & Spline Overview */}
              <div
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--hero ${
                  selectedComponentId === 'country-cell-select' ? 'is-selected' : ''
                }`}
              >
                <div className="hiw-fo-bento-hero-top">
                  <TerraIgnisLogo iconOnly theme={theme === 'dark' ? 'dark' : 'light'} className="w-8 h-8" />
                  <div className="hiw-fo-bento-clock tabular-nums">
                    <span>Cell Stage</span>
                    <strong>02 · /cells</strong>
                  </div>
                </div>

                <div className="hiw-fo-bento-hero-copy">
                  <p className="hiw-fo-bento-mono hiw-fo-bento-hero-headline">
                    REGIONAL H3 MAP +<br />
                    9-METRIC SUMMARY &amp;<br />
                    BURN INDEX SPLINE.
                  </p>
                </div>

                <div className="hiw-fo-bento-links-grid">
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('regional-map')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'regional-map' ? 'is-active' : ''}`}
                  >
                    REGIONAL H3 MAP
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('country-cell-select')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'country-cell-select' ? 'is-active' : ''}`}
                  >
                    COUNTRY &amp; CELL SELECT
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('cell-summary')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'cell-summary' ? 'is-active' : ''}`}
                  >
                    9-METRIC SUMMARY
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('sensor-split')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'sensor-split' ? 'is-active' : ''}`}
                  >
                    SENSOR DETECTIONS
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('burn-spline')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'burn-spline' ? 'is-active' : ''}`}
                  >
                    BURN INDEX SPLINE
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('baseline-toggle')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'baseline-toggle' ? 'is-active' : ''}`}
                  >
                    BASELINE TOGGLE (EYE)
                  </button>
                </div>
              </div>

              {/* Middle Stacked Column: Regional Locator Map + 9-Metric Summary Tile */}
              <div className="hiw-fo-bento-mid-col">
                <button
                  type="button"
                  onClick={() => setSelectedComponentId('regional-map')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--photo group ${
                    selectedComponentId === 'regional-map' ? 'is-selected' : ''
                  }`}
                  aria-label="Inspect Regional H3 Hexagon Locator Map component"
                >
                  <img
                    src={cellExplorerMapShot}
                    alt="Regional H3 Hexagon Locator Map Preview"
                    style={{ objectPosition: 'center 42%' }}
                    className="hiw-fo-bento-photo transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <span className="hiw-fo-bento-photo-tag">REGIONAL H3 MAP · ZOOM 9</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('cell-summary')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--cta group ${
                    selectedComponentId === 'cell-summary' ? 'is-selected' : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">Resolution-7 Cell Card</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                    9-METRIC SUMMARY &amp; UTC SPAN
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
                  onClick={() => setSelectedComponentId('country-cell-select')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--status group ${
                    selectedComponentId === 'country-cell-select' ? 'is-selected' : ''
                  }`}
                >
                  <div className="hiw-fo-bento-status-row">
                    <span className="hiw-fo-bento-eyebrow">Country &amp; H3 Picker</span>
                    <span className="hiw-fo-bento-plus" aria-hidden="true">
                      <Plus size={14} />
                    </span>
                  </div>
                  <span className="hiw-fo-bento-status-val">
                    <span className="hiw-fo-status-dot" aria-hidden="true" />
                    5,000 LOADED CELLS
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('baseline-toggle')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--dark group ${
                    selectedComponentId === 'baseline-toggle' ? 'is-selected' : ''
                  }`}
                >
                  <Eye size={17} strokeWidth={1.9} />
                  <span className="hiw-fo-bento-mono hiw-fo-bento-dark-label">
                    DAILY MEDIAN BASELINE OVERLAY.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('sensor-split')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--works group ${
                    selectedComponentId === 'sensor-split' ? 'is-selected' : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">Instrument Split</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                    MODIS VS. VIIRS BARS
                  </span>
                  <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                    <ArrowUpRight size={15} />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('window-selector')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--about group ${
                    selectedComponentId === 'window-selector' ? 'is-selected' : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">Timeframes</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-sub-sm">7D | 14D | 30D | ALL</span>
                  <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                    <ArrowUpRight size={15} />
                  </span>
                </button>
              </div>
            </div>

            {/* BOTTOM 3-CARD ROW */}
            <div className="hiw-fo-bento-bottom">
              {/* Bottom-Left: UI Captures + 3 Mini Gallery Shots */}
              <div className="hiw-fo-bento-tile hiw-fo-bento-tile--journal">
                <div className="hiw-fo-bento-head-row">
                  <span className="hiw-fo-bento-eyebrow">Right Panel Previews</span>
                  <button
                    type="button"
                    onClick={() => inspectComponentShot('burn-index')}
                    className="hiw-fo-bento-circle-arrow hiw-fo-bento-circle-arrow--static"
                    aria-label="Inspect View of Burn Index Spline screenshot"
                  >
                    <ArrowUpRight size={15} />
                  </button>
                </div>

                <p className="hiw-fo-bento-mono hiw-fo-bento-title">
                  SUMMARY, SENSORS &amp; SPLINE.
                </p>

                <div className="hiw-fo-bento-thumb-strip">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedComponentId('cell-summary');
                      setLightboxShotId('summary');
                    }}
                    className="hiw-fo-bento-thumb"
                    aria-label="Zoom H3 Cell Resolution 7 Summary screenshot"
                  >
                    <img
                      src={cellExplorerResolutionShot}
                      alt="H3 Cell Resolution 7 Summary"
                      style={{ objectFit: 'contain', objectPosition: 'center' }}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedComponentId('sensor-split');
                      setLightboxShotId('sensors');
                    }}
                    className="hiw-fo-bento-thumb"
                    aria-label="Zoom Sensor Detections screenshot"
                  >
                    <img
                      src={cellExplorerSensorShot}
                      alt="Sensor Detections"
                      style={{ objectFit: 'contain', objectPosition: 'center' }}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedComponentId('burn-spline');
                      setLightboxShotId('burn-index');
                    }}
                    className="hiw-fo-bento-thumb"
                    aria-label="Zoom View of Burn Index Spline screenshot"
                  >
                    <img
                      src={cellExplorerSplineShot}
                      alt="View of Burn Index Spline"
                      style={{ objectFit: 'contain', objectPosition: 'center' }}
                    />
                  </button>
                </div>
              </div>

              {/* Bottom-Middle: Burn Index Spline */}
              <button
                type="button"
                onClick={() => setSelectedComponentId('burn-spline')}
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--resources group ${
                  selectedComponentId === 'burn-spline' ? 'is-selected' : ''
                }`}
              >
                <span className="hiw-fo-bento-eyebrow">Smooth Curve</span>
                <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                  FRITSCH-CARLSON BURN SPLINE
                </span>
                <span className="hiw-fo-bento-micro-note">
                  Observed dates only across [0, 100] with 5-tier severity nodes &amp; robust Z tooltips.
                </span>
                <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                  <ArrowUpRight size={15} />
                </span>
              </button>

              {/* Bottom-Right: Panel Lifecycle & Quick Diagnostic Dock */}
              <div
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--stack ${
                  selectedComponentId === 'state-overlays' ? 'is-selected' : ''
                }`}
              >
                <div className="hiw-fo-bento-head-row">
                  <span className="hiw-fo-bento-eyebrow">Lifecycle &amp; Controls</span>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('state-overlays')}
                    className="hiw-fo-bento-circle-arrow hiw-fo-bento-circle-arrow--static"
                    aria-label="Inspect Empty, Loading, 404 and Retry panel states"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>

                <p className="hiw-fo-bento-mono hiw-fo-bento-title">
                  CELL DIAGNOSTIC DOCK
                </p>

                <div className="hiw-fo-bento-dock-row" role="group" aria-label="Select Cell Explorer component">
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
            <div className="hiw-fo-inspector-pills" role="tablist" aria-label="Cell Explorer components">
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
                <Link to="/cells" className="hiw-fo-primary-cta">
                  <span>Open Live /cells</span>
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
            BAND 3: H3 RES-7 SUMMARY & SENSOR DETECTIONS FEATURE SPLIT
            ================================================================ */}
        <section className="hiw-fo-band hiw-fo-band--soft">
          <div className="hiw-fo-bottom-split">
            <div className="hiw-fo-bottom-copy">
              <span className="hiw-fo-kicker">Hexagon Provenance &amp; Sensor Mix</span>
              <h2>9-Metric Summary &amp; Sensor Detections</h2>
              <p>
                {lowerShotId === 'summary'
                  ? 'Every selected Resolution-7 hexagon reports nine core diagnostics from /api/region: Observed Cell/Dates, First & Last Observed UTC timestamps, Total Fire Detections, Mean/Min/Max Burn Index, plus Anomaly and Extreme Anomaly counts highlighted in amber and rose.'
                  : 'The Sensor Detections card contrasts ~1 km MODIS detections against ~375 m VIIRS detections using proportional horizontal tracks—explicitly noting that totals aggregate observed cell/dates rather than counting distinct physical wildfires.'}
              </p>

              <div className="hiw-fo-switch-row">
                <div className="hiw-fo-toggle-group" role="tablist" aria-label="Toggle spotlight capture">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={lowerShotId === 'summary'}
                    onClick={() => setLowerShotId('summary')}
                    className={`hiw-fo-toggle-pill ${lowerShotId === 'summary' ? 'is-active' : ''}`}
                  >
                    H3 Res-7 Summary
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={lowerShotId === 'sensors'}
                    onClick={() => setLowerShotId('sensors')}
                    className={`hiw-fo-toggle-pill ${lowerShotId === 'sensors' ? 'is-active' : ''}`}
                  >
                    Sensor Detections
                  </button>
                </div>

                <Link to="/cells" className="hiw-fo-primary-cta">
                  <span>Inspect Live Cells</span>
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
              <p className="hiw-fo-footer-next-name">03 · Daily Activity</p>
              <Link to="/how-it-works/daily-activity" className="hiw-fo-footer-btn">
                <span>Explore Daily Activity</span>
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
