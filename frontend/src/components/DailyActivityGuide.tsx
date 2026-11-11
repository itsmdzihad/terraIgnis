import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Flame,
  Info,
  Maximize2,
  Minus,
  Plus,
  Radar,
  RefreshCw,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import TerraIgnisLogo from './TerraIgnisLogo';
import dailyCenterShot from '../assets/Daily Activity Shots/Daily Activity Center.png';
import burnRadarShot from '../assets/Daily Activity Shots/Burn anomaly ratio.png';
import outlierSummaryShot from '../assets/Daily Activity Shots/Anomaly & outlier summary.png';
import activityArchiveShot from '../assets/Daily Activity Shots/Activity Archive.png';

type ShotId = 'calendar' | 'radar' | 'outliers' | 'archive';
type ComponentId =
  | 'calendar-toolbar'
  | 'kpi-legend'
  | 'heatmap-matrix'
  | 'burn-radar'
  | 'outlier-high'
  | 'outlier-month'
  | 'archive-export'
  | 'methodology-modal'
  | 'loading-recovery';

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
    id: 'calendar',
    shortLabel: 'Calendar Matrix',
    title: '53-Week Daily Activity Center & Live Telemetry Strip',
    zone: 'Top-Left Stage · /activity',
    caption:
      'Σ Year selector, Fire Count | Burn Index switcher, [ Expand | Edit | More ] toolbar, annual headline KPIs paired with the Less → More intensity ramp, 53×7 UTC grid, and hover/selected day strip.',
    src: dailyCenterShot,
  },
  {
    id: 'radar',
    shortLabel: 'Anomaly Radar',
    title: 'Burn Anomaly Ratio 6-Axis Concentric Radar',
    zone: 'Right Column · Top Card',
    caption:
      'Six synchronized telemetry axes (Active Days, Outlier Days, High Severity, Percentile, Mean Burn, Peak Burn) inside shaded 25%–100% rings with active streak length, Details modal trigger, and vertex tooltips.',
    src: burnRadarShot,
  },
  {
    id: 'outliers',
    shortLabel: 'Outlier Summary',
    title: '2×2 Anomaly & Outlier Dot-Matrix Telemetry Grid',
    zone: 'Left / Bottom Stage · /activity',
    caption:
      'Four interactive outlier cards (High & Extreme Outliers, Peak 7-Day Burst, Peak Month, Outlier Rate) each paired with a 12-column dot-matrix sparkline that previews slice counts and jumps selectedDate on click.',
    src: outlierSummaryShot,
  },
  {
    id: 'archive',
    shortLabel: 'Activity Archive',
    title: 'Activity Archive & Client-Side CSV / GeoJSON Export',
    zone: 'Right Column · Bottom Banner',
    caption:
      'Summarizes total observed UTC calendar dates for the selected year and compiles GeoJSON FeatureCollections or daily CSV tables directly in the browser with inline export progress status.',
    src: activityArchiveShot,
  },
];

const ACTIVITY_SPECS = [
  { label: 'Calendar Matrix', value: '53 Weeks × 7 UTC Days' },
  { label: 'Metric Modes', value: 'Fire Count · Burn Index' },
  { label: 'Radar Axes', value: '6 Synchronized Metrics (25–100%)' },
  { label: 'Browser Exports', value: 'CSV Table · GeoJSON Collection' },
] as const;

const COMPONENTS: readonly ComponentEntry[] = [
  {
    id: 'calendar-toolbar',
    index: '01',
    shortName: 'Header & Toolbar',
    zone: 'Calendar Card · Top Row',
    metricTag: 'Expand · Edit · More',
    title: 'Year Picker, Metric Switcher & Action Bar',
    description:
      'Pairs the Σ Year selector dropdown and segmented Fire Count | Burn Index switcher with the top-right [ Expand | Edit | More ] bar and methodology Info button.',
    bullets: [
      'Expand button triggers Motion LayoutGroup spring reflow across all 12 columns',
      'Edit popover switches active year & intensity metric inline; dismisses on outside pointer',
      'More menu triggers Download CSV, Download GeoJSON, or the Methodology modal',
    ],
    shotId: 'calendar',
    shotLabel: 'View Calendar Shot',
  },
  {
    id: 'kpi-legend',
    index: '02',
    shortName: 'KPIs & Ramp',
    zone: 'Calendar Card · Subheader',
    metricTag: '3 KPIs · Levels 0–4',
    title: 'Annual Headline KPIs & 5-Level Intensity Ramp',
    description:
      'Summarizes annual Detections (or Burn points), Peak single day with UTC date, and Active days count alongside the five-level Less → More color legend scaled against the year’s peak day.',
    bullets: [
      'Updates labels automatically between “Detections in this year” and “Burn points in this year”',
      'Normalization sets Peak (>75%), High (>45%), Moderate (>20%), Low (>0%) & Blank (0)',
      'Peak single day identifies the highest-intensity UTC date across the chosen year',
    ],
    shotId: 'calendar',
    shotLabel: 'View Calendar Shot',
  },
  {
    id: 'heatmap-matrix',
    index: '03',
    shortName: '53×7 Heatmap',
    zone: 'Calendar Card · Matrix Body',
    metricTag: '53 Weeks × 7 Days',
    title: '53-Week UTC Calendar Matrix & Live Strip',
    description:
      'Plots every UTC day of the selected year aligned by Mon / Wed / Fri guides and centered Jan–Dec headers, with bottom telemetry strip previews and global click-to-lock date filtering.',
    bullets: [
      'Hovering any day previews Date, Detections, Mean Burn, Max Burn & Anomalies below',
      'Clicking a day locks global selectedDate across Fire Overview & Cell Explorer',
      'Preserves zero-detection honesty with distinct empty tile readouts rather than hidden gaps',
    ],
    shotId: 'calendar',
    shotLabel: 'View Calendar Shot',
  },
  {
    id: 'burn-radar',
    index: '04',
    shortName: '6-Axis Radar',
    zone: 'Right Column · Top Card',
    metricTag: '6 Axes · Streak',
    title: 'Burn Anomaly Ratio 6-Axis Radar Card',
    description:
      'Plots six annual telemetry dimensions inside four concentric shaded target rings (25%–100%), summarizes outlier findings, and displays longest active streak alongside observed record count.',
    bullets: [
      'Axes plot Active Days, Outlier Days, High Severity, Percentile, Mean Burn & Peak Burn',
      'Hovering any vertex highlights its spoke and renders a live % + count readout pill',
      'Expanding the calendar card expands Radar into a split layout with 6 axis progress cards',
    ],
    shotId: 'radar',
    shotLabel: 'View Radar Shot',
  },
  {
    id: 'outlier-high',
    index: '05',
    shortName: 'High Outliers & Burst',
    zone: 'Outlier Grid · Top Row',
    metricTag: '12-Column Matrix',
    title: 'High & Extreme Outliers & Peak 7-Day Burst',
    description:
      'Measures the share of verified high/extreme outliers (with peak robust Z-score date) and scans consecutive /api/calendar dates to isolate the year’s strongest 7-observation outlier burst.',
    bullets: [
      'High & Extreme Outliers buckets “high” & “extreme_high” events into 12 dot columns',
      'Peak 7-Day Burst slides a 7-observation window across active dates to locate peak intensity',
      'Clicking a card or any dot-matrix column sets selectedDate directly to its target UTC day',
    ],
    shotId: 'outliers',
    shotLabel: 'View Outliers Shot',
  },
  {
    id: 'outlier-month',
    index: '06',
    shortName: 'Peak Month & Rate',
    zone: 'Outlier Grid · Bottom Row',
    metricTag: 'Verified Outliers',
    title: 'Peak Month Concentration & Annual Outlier Rate',
    description:
      'Identifies the month carrying the highest anomaly share and tracks overall annual outlier incidence per detection, accompanied by hoverable dot slices and outlier sync error recovery.',
    bullets: [
      'Peak Month aggregates daily anomaly burdens for the top month across 12 timeline slices',
      'Outlier Rate computes (anomalies / total fire detections) percentage across observed chronology',
      'Header shows “verified outliers” count or inline “Outlier sync error · Retry” action',
    ],
    shotId: 'outliers',
    shotLabel: 'View Outliers Shot',
  },
  {
    id: 'archive-export',
    index: '07',
    shortName: 'Archive Export',
    zone: 'Right Column · Bottom Banner',
    metricTag: 'CSV · GeoJSON',
    title: 'Activity Archive & Client-Side Dataset Exports',
    description:
      'Reports total observed UTC calendar dates for the chosen year and compiles downloadable daily CSV tables or FeatureCollection GeoJSON files directly in the browser without extra server roundtrips.',
    bullets: [
      'Export CSV downloads terraignis_activity_daily_<year>.csv (Date, Fire_Count, Burn, Anomalies)',
      'GeoJSON packages metadata and daily features into terraignis_fire_activity_<year>.geojson',
      'Displays live status updates (“Compiling...”, “Formatting...”, “Exported... records”)',
    ],
    shotId: 'archive',
    shotLabel: 'View Archive Shot',
  },
  {
    id: 'methodology-modal',
    index: '08',
    shortName: 'Methodology Modal',
    zone: 'Modal · Info / Details Trigger',
    metricTag: 'Ramp Cutoffs',
    title: 'Aggregation & Intensity Methodology Modal',
    description:
      'Opened via either the Daily Activity Center Info icon or the Burn Anomaly Ratio Details button to document H3 Resolution-7 UTC aggregation and exact intensity level thresholds.',
    bullets: [
      'Documents Level 4 Peak (>75%), Level 3 High (45%–75%) & Level 2 Moderate (20%–45%)',
      'Clarifies Level 1 Low baseline detections vs. Level 0 Blank (zero detections recorded)',
      'Explains how MODIS (~1 km) and VIIRS (~375 m) roll up onto daily UTC calendar tiles',
    ],
    shotId: 'radar',
    shotLabel: 'View Radar Shot',
  },
  {
    id: 'loading-recovery',
    index: '09',
    shortName: 'Spring & Retry',
    zone: 'Dashboard Grid · Lifecycle',
    metricTag: 'Motion Spring · Retry',
    title: 'Spring Layout Expansion & Error Recovery States',
    description:
      'Coordinates shared-element Framer Motion LayoutGroup transitions across all dashboard cards while preserving inline loading indicators and independent Retry actions if data fetches fail.',
    bullets: [
      'Expand toggles smooth spring geometry transitions across all 4 Daily Activity modules',
      'Keeps Year picker and Fire Count | Burn Index switcher interactive during loading & errors',
      'Separates /api/calendar and /api/anomalies error boundaries so outliers recover independently',
    ],
    shotId: 'calendar',
    shotLabel: 'View Calendar Shot',
  },
];

const BENTO_DOCK = [
  { id: 'heatmap-matrix' as ComponentId, label: '53×7 UTC Heatmap', icon: CalendarDays, tone: '#4f46e5' },
  { id: 'burn-radar' as ComponentId, label: 'Burn Anomaly Radar', icon: Radar, tone: '#ea580c' },
  { id: 'outlier-high' as ComponentId, label: 'Outliers & 7D Burst', icon: Flame, tone: '#e11d48' },
  { id: 'archive-export' as ComponentId, label: 'CSV & GeoJSON Export', icon: Download, tone: '#0284c7' },
  { id: 'methodology-modal' as ComponentId, label: 'Methodology Modal', icon: Info, tone: '#059669' },
];

export default function DailyActivityGuide({ theme = 'dark' }: { theme?: 'light' | 'dark' }) {
  const galleryRef = useRef<HTMLElement>(null);
  const [activeShotId, setActiveShotId] = useState<ShotId>('calendar');
  const [selectedComponentId, setSelectedComponentId] = useState<ComponentId>('heatmap-matrix');
  const [lowerShotId, setLowerShotId] = useState<'outliers' | 'archive'>('outliers');
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
              <span className="hiw-fo-crumb-current">Daily Activity</span>
            </nav>

            <Link to="/how-it-works" className="hiw-fo-back-link">
              <ArrowLeft size={14} />
              <span>Back to Bento Grid</span>
            </Link>
          </div>

          <header className="hiw-fo-hero-head">
            <h1 id="how-it-works-detail-title" className="hiw-fo-display-title">
              DAILY ACTIVITY
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

              <div className="hiw-fo-thumb-grid" role="group" aria-label="Switch Daily Activity screenshot">
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
                <p className="hiw-fo-route-tag">Route · /activity · Section 03</p>

                <div className="hiw-fo-prose">
                  <p>
                    <strong>Daily Activity</strong> is TerraIgnis&rsquo;s year-long temporal telemetry board, pairing a
                    53×7 UTC calendar heatmap and live day-strip on the left with a 6-axis Burn Anomaly Ratio radar, 2×2
                    outlier burst grid, and client-side CSV / GeoJSON exporter.
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

                  <Link to="/activity" className="hiw-fo-primary-cta">
                    <span>Open Live Daily Activity</span>
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
              </div>

              <dl className="hiw-fo-specs">
                {ACTIVITY_SPECS.map((spec) => (
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
                <h3>53-Week Matrix, Spring Expansion &amp; Date Sync</h3>
                <p>
                  Every tile in the <strong>Daily Activity Center</strong> renders one UTC calendar day scaled from{' '}
                  <strong>Level 0 (Blank)</strong> to <strong>Level 4 (Peak &gt;75%)</strong> relative to the year&rsquo;s
                  maximum single-day fire count or burn intensity. Hovering previews daily metrics along the bottom
                  strip, clicking any square locks <code>selectedDate</code> across Fire Overview and Cell Explorer, and
                  clicking <strong>Expand</strong> smoothly reflows every dashboard panel across all 12 columns via
                  Motion <code>LayoutGroup</code>.
                </p>
              </div>

              <div className="hiw-fo-detail-block">
                <h3>6-Axis Burn Anomaly Radar &amp; Outlier Signals</h3>
                <p>
                  Alongside the calendar, <strong>Burn Anomaly Ratio</strong> synthesizes six normalized dimensions—
                  <strong>Active Days</strong>, <strong>Outlier Days</strong>, <strong>High Severity</strong>,{' '}
                  <strong>Percentile</strong>, <strong>Mean Burn</strong>, and <strong>Peak Burn</strong>—alongside
                  longest active streak length and a 4-band distribution legend, while opening inline 6-card axis
                  progress breakdowns whenever the calendar view is expanded.
                </p>
              </div>
            </div>

            <div className="hiw-fo-secondary-visual">
              <button
                type="button"
                onClick={() => setLightboxShotId('radar')}
                className="hiw-fo-media-btn group"
                aria-label="Inspect Burn Anomaly Ratio 6-Axis Radar screenshot fullscreen"
              >
                <div className="hiw-fo-secondary-plate">
                  <img
                    src={burnRadarShot}
                    alt="Burn Anomaly Ratio 6-Axis Concentric Radar showing Active Days, Outlier Days, High Severity, Percentile, Mean Burn, Peak Burn, and Streak legend"
                    className="hiw-fo-secondary-img transition-transform duration-300 group-hover:scale-[1.012]"
                  />
                </div>
                <div className="hiw-fo-media-caption">
                  <span>Right Column · 6-Axis Burn Anomaly Ratio Radar</span>
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
              {/* Left Hero Tile: Calendar KPIs, Radar & Outlier Overview */}
              <div
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--hero ${
                  selectedComponentId === 'kpi-legend' ? 'is-selected' : ''
                }`}
              >
                <div className="hiw-fo-bento-hero-top">
                  <TerraIgnisLogo iconOnly theme={theme === 'dark' ? 'dark' : 'light'} className="w-8 h-8" />
                  <div className="hiw-fo-bento-clock tabular-nums">
                    <span>Activity Stage</span>
                    <strong>03 · /activity</strong>
                  </div>
                </div>

                <div className="hiw-fo-bento-hero-copy">
                  <p className="hiw-fo-bento-mono hiw-fo-bento-hero-headline">
                    53-WEEK CALENDAR +<br />
                    6-AXIS RADAR &amp;<br />
                    OUTLIER MATRIX.
                  </p>
                </div>

                <div className="hiw-fo-bento-links-grid">
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('calendar-toolbar')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'calendar-toolbar' ? 'is-active' : ''}`}
                  >
                    HEADER &amp; TOOLBAR
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('kpi-legend')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'kpi-legend' ? 'is-active' : ''}`}
                  >
                    KPIS &amp; RAMP 0–4
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('heatmap-matrix')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'heatmap-matrix' ? 'is-active' : ''}`}
                  >
                    53×7 UTC MATRIX
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('burn-radar')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'burn-radar' ? 'is-active' : ''}`}
                  >
                    BURN ANOMALY RADAR
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('outlier-month')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'outlier-month' ? 'is-active' : ''}`}
                  >
                    PEAK MONTH &amp; RATE
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('loading-recovery')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'loading-recovery' ? 'is-active' : ''}`}
                  >
                    SPRING &amp; RETRY
                  </button>
                </div>
              </div>

              {/* Middle Stacked Column: Calendar Heatmap Photo Tile + 6-Axis Radar Tile */}
              <div className="hiw-fo-bento-mid-col">
                <button
                  type="button"
                  onClick={() => setSelectedComponentId('heatmap-matrix')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--photo group ${
                    selectedComponentId === 'heatmap-matrix' ? 'is-selected' : ''
                  }`}
                  aria-label="Inspect 53-Week UTC Calendar Matrix component"
                >
                  <img
                    src={dailyCenterShot}
                    alt="Daily Activity Center 53-week UTC calendar heatmap preview"
                    style={{ objectPosition: 'center top' }}
                    className="hiw-fo-bento-photo transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <span className="hiw-fo-bento-photo-tag">53×7 UTC MATRIX · LEVELS 0–4</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('burn-radar')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--cta group ${
                    selectedComponentId === 'burn-radar' ? 'is-selected' : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">6-Axis Target Rings</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                    BURN ANOMALY RATIO &amp; STREAK
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
                  onClick={() => setSelectedComponentId('calendar-toolbar')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--status group ${
                    selectedComponentId === 'calendar-toolbar' ? 'is-selected' : ''
                  }`}
                >
                  <div className="hiw-fo-bento-status-row">
                    <span className="hiw-fo-bento-eyebrow">Controls &amp; Expand</span>
                    <span className="hiw-fo-bento-plus" aria-hidden="true">
                      <Plus size={14} />
                    </span>
                  </div>
                  <span className="hiw-fo-bento-status-val">
                    <span className="hiw-fo-status-dot" aria-hidden="true" />
                    YEAR | METRIC | EDIT
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('archive-export')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--dark group ${
                    selectedComponentId === 'archive-export' ? 'is-selected' : ''
                  }`}
                >
                  <Download size={17} strokeWidth={1.9} />
                  <span className="hiw-fo-bento-mono hiw-fo-bento-dark-label">
                    CSV &amp; GEOJSON ARCHIVE EXPORT.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('outlier-high')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--works group ${
                    selectedComponentId === 'outlier-high' ? 'is-selected' : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">Outliers &amp; Burst</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                    HIGH OUTLIERS &amp; 7D BURST
                  </span>
                  <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                    <ArrowUpRight size={15} />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('outlier-month')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--about group ${
                    selectedComponentId === 'outlier-month' ? 'is-selected' : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">Season &amp; Incidence</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-sub-sm">PEAK MONTH | RATE %</span>
                  <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                    <ArrowUpRight size={15} />
                  </span>
                </button>
              </div>
            </div>

            {/* BOTTOM 3-CARD ROW */}
            <div className="hiw-fo-bento-bottom">
              {/* Bottom-Left: Supporting Views + 3 Mini Gallery Shots */}
              <div className="hiw-fo-bento-tile hiw-fo-bento-tile--journal">
                <div className="hiw-fo-bento-head-row">
                  <span className="hiw-fo-bento-eyebrow">Supporting Views</span>
                  <button
                    type="button"
                    onClick={() => inspectComponentShot('radar')}
                    className="hiw-fo-bento-circle-arrow hiw-fo-bento-circle-arrow--static"
                    aria-label="Inspect Burn Anomaly Ratio screenshot"
                  >
                    <ArrowUpRight size={15} />
                  </button>
                </div>

                <p className="hiw-fo-bento-mono hiw-fo-bento-title">
                  RADAR, OUTLIERS &amp; ARCHIVE.
                </p>

                <div className="hiw-fo-bento-thumb-strip">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedComponentId('burn-radar');
                      setLightboxShotId('radar');
                    }}
                    className="hiw-fo-bento-thumb"
                    aria-label="Zoom Burn Anomaly Ratio Radar screenshot"
                  >
                    <img
                      src={burnRadarShot}
                      alt="Burn Anomaly Ratio"
                      style={{ objectFit: 'contain', objectPosition: 'center' }}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedComponentId('outlier-high');
                      setLightboxShotId('outliers');
                    }}
                    className="hiw-fo-bento-thumb"
                    aria-label="Zoom Anomaly & Outlier Summary screenshot"
                  >
                    <img
                      src={outlierSummaryShot}
                      alt="Anomaly & Outlier Summary"
                      style={{ objectFit: 'contain', objectPosition: 'center' }}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedComponentId('archive-export');
                      setLightboxShotId('archive');
                    }}
                    className="hiw-fo-bento-thumb"
                    aria-label="Zoom Activity Archive Export screenshot"
                  >
                    <img
                      src={activityArchiveShot}
                      alt="Activity Archive"
                      style={{ objectFit: 'contain', objectPosition: 'center' }}
                    />
                  </button>
                </div>
              </div>

              {/* Bottom-Middle: Methodology Modal */}
              <button
                type="button"
                onClick={() => setSelectedComponentId('methodology-modal')}
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--resources group ${
                  selectedComponentId === 'methodology-modal' ? 'is-selected' : ''
                }`}
              >
                <span className="hiw-fo-bento-eyebrow">Level 0–4 Ramp</span>
                <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                  AGGREGATION &amp; RAMP MODAL
                </span>
                <span className="hiw-fo-bento-micro-note">
                  Documents UTC calendar H3 rollups &amp; percentile cutoffs via Info or Details.
                </span>
                <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                  <ArrowUpRight size={15} />
                </span>
              </button>

              {/* Bottom-Right: Spring Layout & Quick Diagnostic Dock */}
              <div
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--stack ${
                  selectedComponentId === 'loading-recovery' ? 'is-selected' : ''
                }`}
              >
                <div className="hiw-fo-bento-head-row">
                  <span className="hiw-fo-bento-eyebrow">Spring &amp; Lifecycle</span>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('loading-recovery')}
                    className="hiw-fo-bento-circle-arrow hiw-fo-bento-circle-arrow--static"
                    aria-label="Inspect Spring Layout Expansion and Error Recovery"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>

                <p className="hiw-fo-bento-mono hiw-fo-bento-title">
                  ACTIVITY DIAGNOSTIC DOCK
                </p>

                <div className="hiw-fo-bento-dock-row" role="group" aria-label="Select Daily Activity component">
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
            <div className="hiw-fo-inspector-pills" role="tablist" aria-label="Daily Activity components">
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
                <Link to="/activity" className="hiw-fo-primary-cta">
                  <span>Open Live /activity</span>
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
            BAND 3: 2×2 OUTLIER GRID & ACTIVITY ARCHIVE FEATURE SPLIT
            ================================================================ */}
        <section className="hiw-fo-band hiw-fo-band--soft">
          <div className="hiw-fo-bottom-split">
            <div className="hiw-fo-bottom-copy">
              <span className="hiw-fo-kicker">Outlier Telemetry &amp; Exports</span>
              <h2>2×2 Outlier Grid &amp; Archive Exports</h2>
              <p>
                {lowerShotId === 'outliers'
                  ? 'Four synchronized telemetry cards—High & Extreme Outliers, Peak 7-Day Burst, Peak Month, and Outlier Rate—each feature an interactive 12-column dot-matrix chart that previews time-slice totals on hover and jumps straight to peak dates on click.'
                  : 'Activity Archive tracks the total observed calendar dates for the selected year and generates client-side CSV tables (terraignis_activity_daily_<year>.csv) or FeatureCollection GeoJSON bundles (terraignis_fire_activity_<year>.geojson) in a single click.'}
              </p>

              <div className="hiw-fo-switch-row">
                <div className="hiw-fo-toggle-group" role="tablist" aria-label="Toggle spotlight capture">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={lowerShotId === 'outliers'}
                    onClick={() => setLowerShotId('outliers')}
                    className={`hiw-fo-toggle-pill ${lowerShotId === 'outliers' ? 'is-active' : ''}`}
                  >
                    Outlier Summary (2×2)
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={lowerShotId === 'archive'}
                    onClick={() => setLowerShotId('archive')}
                    className={`hiw-fo-toggle-pill ${lowerShotId === 'archive' ? 'is-active' : ''}`}
                  >
                    Activity Archive
                  </button>
                </div>

                <Link to="/activity" className="hiw-fo-primary-cta">
                  <span>Inspect Daily Activity</span>
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
              <p className="hiw-fo-footer-next-name">04 · Data Pipeline</p>
              <Link to="/how-it-works/data-pipeline" className="hiw-fo-footer-btn">
                <span>Explore Data Pipeline</span>
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
