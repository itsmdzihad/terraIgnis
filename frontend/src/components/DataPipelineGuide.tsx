import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  Layers,
  LockKeyhole,
  Maximize2,
  Minus,
  Plus,
  Radio,
  Terminal,
  UploadCloud,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import TerraIgnisLogo from './TerraIgnisLogo';
import automatedIngestionShot from '../assets/Data pipeline/Automated FIRMS Ingestion.png';
import uploadFilesShot from '../assets/Data pipeline/Upload Raw FIRMS files.png';
import generateDatasetsShot from '../assets/Data pipeline/Generate Dashboard dataset.png';

type ShotId = 'ingestion' | 'upload' | 'generate';
type ComponentId =
  | 'pipeline-header'
  | 'nrt-scheduler'
  | 'operator-auth'
  | 'historical-backfill'
  | 'manual-upload'
  | 'raw-inventory'
  | 'six-stages'
  | 'pipeline-logs'
  | 'approval-prompt';

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
    id: 'ingestion',
    shortLabel: 'FIRMS Ingestion',
    title: 'Automated NRT Polling & Historical Backfill',
    zone: 'Top Card · /pipeline',
    caption:
      'Scheduled 30-minute Near Real-Time poller, live MODIS/VIIRS product result chips, and resumable ≤5-day chunked Standard Processing backfills with public controls by default.',
    src: automatedIngestionShot,
  },
  {
    id: 'generate',
    shortLabel: 'Dataset Builder',
    title: 'Generate Dashboard Datasets & 6-Stage Parquet Runner',
    zone: 'Bottom Card · /pipeline',
    caption:
      'Monitors backend raw MODIS & VIIRS inventories, rebuilds served Parquet datasets across all six README pipeline stages without touching any external SQL database, and exposes stdout logs.',
    src: generateDatasetsShot,
  },
  {
    id: 'upload',
    shortLabel: 'Batch Upload',
    title: '1. Upload Raw FIRMS Files (Single-Sensor Batch Guard)',
    zone: 'Middle Card · /pipeline',
    caption:
      'Sensor-locked dropzone accepting multiple .txt or .csv FIRMS files (up to 512 MB/file), file review drawer, duplicate skipping, and non-destructive preservation of existing raw files.',
    src: uploadFilesShot,
  },
];

const PIPELINE_SPECS = [
  { label: 'Parquet Engine', value: '6 README Stages · Zero SQL DB' },
  { label: 'Automated Poller', value: 'NRT Scheduler (30m) + Manual' },
  { label: 'Historical Backfill', value: '5-Day Chunked · Resumable' },
  { label: 'Batch Uploads', value: 'TXT / CSV · ≤ 512 MB / file' },
] as const;

const COMPONENTS: readonly ComponentEntry[] = [
  {
    id: 'pipeline-header',
    index: '01',
    shortName: 'Header & Alerts',
    zone: 'Page Top · /pipeline',
    metricTag: 'FIRMS Link · Notices',
    title: 'Pipeline Header, NASA FIRMS Link & Status Banners',
    description:
      'Introduces the ingestion workflow, links directly out to NASA FIRMS Archive downloads, and surfaces dismissible alerts for API errors and NRT/historical poll outcomes.',
    bullets: [
      'Direct outbound link opens firms.modaps.eosdis.nasa.gov/download/ in a new tab',
      'Auto-dismissing 7-second notices report NRT file additions and record counts',
      'Separate API error banners catch unreachable backend or ingestion endpoints',
    ],
    shotId: 'ingestion',
    shotLabel: 'View Ingestion Shot',
  },
  {
    id: 'nrt-scheduler',
    index: '02',
    shortName: 'NRT Scheduler',
    zone: 'Ingestion Card · Top',
    metricTag: '30m Interval · 2.5s Poll',
    title: 'Automated FIRMS NRT Poller & Result Chips',
    description:
      'Displays background scheduler configuration alongside last/next UTC run timestamps, an on-demand Run NRT poll button, and per-instrument record badges across MODIS and VIIRS.',
    bullets: [
      'Shows live status pills for MODIS_NRT, VIIRS_SNPP_NRT, NOAA20 & NOAA21 NRT',
      'Polls live ingestion endpoints every 2.5s automatically while NRT or backfill runs',
      'Preserves newly downloaded files safely prior to explicit dataset regeneration',
    ],
    shotId: 'ingestion',
    shotLabel: 'View Ingestion Shot',
  },
  {
    id: 'operator-auth',
    index: '03',
    shortName: 'Operator Auth',
    zone: 'Ingestion Card · Drawer',
    metricTag: 'In-Memory Token',
    title: 'Optional Operator Bearer Authorization Drawer',
    description:
      'Optional bearer token protection. If the backend operator configures FIRMS_INGESTION_TOKEN, protected ingestion actions require that token; otherwise the controls are public, including in production.',
    bullets: [
      'Stored solely in React tab state—never persisted to localStorage or cookies',
      'Attached exclusively to operator mutations (NRT poll, Backfill start/resume/cancel)',
      'Cleanly collapsed by default so read-only status inspection stays uncluttered',
    ],
    shotId: 'ingestion',
    shotLabel: 'View Ingestion Shot',
  },
  {
    id: 'historical-backfill',
    index: '04',
    shortName: 'Backfill & Chunks',
    zone: 'Ingestion Card · Bottom',
    metricTag: '≤5-Day Chunks · Resume',
    title: 'Resumable Historical Backfill & Chunk Tracker',
    description:
      'Queues multi-day Standard Processing archive fetches across Start/End dates, custom bounding boxes, and selected *_SP products while tracking progress per 5-day chunk.',
    bullets: [
      'Supports “world” or “west,south,east,north” bbox coordinates across 4 SP products',
      'Validates FIRMS availability, renders progress % bar & expandable chunk list',
      'Exposes live Cancel for active jobs and Resume for cancelled/partial runs',
    ],
    shotId: 'ingestion',
    shotLabel: 'View Ingestion Shot',
  },
  {
    id: 'manual-upload',
    index: '05',
    shortName: '1. Batch Upload',
    zone: 'Middle Card · Upload Dropzone',
    metricTag: 'MODIS | VIIRS Guard',
    title: '1. Upload Raw FIRMS Files (Single-Sensor Batch)',
    description:
      'Requires choosing MODIS or VIIRS before uploading multi-file .txt/.csv selections up to 512 MB each, summarizing total bytes and skipping identical backend duplicates.',
    bullets: [
      'Rejects mixed-sensor batches cleanly so MODIS & VIIRS provenance never mixes',
      'Expandable “Review selected files” drawer verifies filenames and byte sizes',
      'Reports total uploaded, newly added vs. already-present duplicate counts',
    ],
    shotId: 'upload',
    shotLabel: 'View Upload Shot',
  },
  {
    id: 'raw-inventory',
    index: '06',
    shortName: 'Raw Inventory',
    zone: 'Bottom Card · Counters',
    metricTag: 'MODIS · VIIRS · Total',
    title: 'Backend Raw File Inventory & Manual Refresh',
    description:
      'Displays authoritative counts of MODIS, VIIRS, and total raw files stored in backend data directories alongside the timestamp of the last successful Parquet build.',
    bullets: [
      'Refresh icon button re-queries both pipeline status & ingestion endpoints together',
      'Locks “Generate datasets” automatically when raw_files.total equals zero',
      'Updates button label dynamically between “Generate datasets” and “Generate again”',
    ],
    shotId: 'generate',
    shotLabel: 'View Builder Shot',
  },
  {
    id: 'six-stages',
    index: '07',
    shortName: '6 Build Stages',
    zone: 'Bottom Card · Progress',
    metricTag: '1.5s Poll · Parquet',
    title: '2. Generate Dashboard Datasets (6 README Stages)',
    description:
      'Runs the six processing scripts sequentially against all backend raw files to rebuild the served Parquet datasets without requiring an external relational database.',
    bullets: [
      'Executes: Ingest & Standardize → Profile → H3 Aggregation → Harmonize → Burn Index → Anomaly Detection',
      'Polls /api/pipeline/status every 1.5s across queued, running, succeeded & failed states',
      'Displays per-stage live icons (pending clock, spinning loader, emerald check, rose warning)',
    ],
    shotId: 'generate',
    shotLabel: 'View Builder Shot',
  },
  {
    id: 'pipeline-logs',
    index: '08',
    shortName: 'Stdout Logs',
    zone: 'Bottom Card · Expandable',
    metricTag: 'Command Output',
    title: 'Expandable High-Contrast Pipeline Stdout Console',
    description:
      'Expandable <details> log terminal directly inside the builder status panel rendering backend stdout lines for full transparency into stage execution and error diagnosis.',
    bullets: [
      'Streams status.logs directly inside a scrollable monospace container',
      'Preserves full execution history even while browsing or after build completion',
      'Hidden cleanly under “Pipeline log” toggle unless inspected by an operator',
    ],
    shotId: 'generate',
    shotLabel: 'View Builder Shot',
  },
  {
    id: 'approval-prompt',
    index: '09',
    shortName: 'Approval Prompt',
    zone: 'App-Wide · Global Modal',
    metricTag: '2s Poll · Any Route',
    title: 'Global Ingestion Completion Approval Prompt',
    description:
      'Monitors NRT and historical downloads across all dashboard routes every 2 seconds and prompts operators when new raw files are ready to trigger dataset regeneration.',
    bullets: [
      'Prevents background downloads from overwriting served Parquet tables silently',
      'Transitions to a compact floating corner tracker (top-right) while datasets rebuild',
      'Dispatches custom pipeline sync events so /pipeline reflects progress instantaneously',
    ],
    shotId: 'ingestion',
    shotLabel: 'View Ingestion Shot',
  },
];

const BENTO_DOCK = [
  { id: 'nrt-scheduler' as ComponentId, label: 'Automated NRT Poller', icon: Radio, tone: '#059669' },
  { id: 'historical-backfill' as ComponentId, label: 'Historical Backfill', icon: CalendarDays, tone: '#4f46e5' },
  { id: 'manual-upload' as ComponentId, label: 'Batch File Upload', icon: UploadCloud, tone: '#2563eb' },
  { id: 'six-stages' as ComponentId, label: '6-Stage Parquet Build', icon: Database, tone: '#0284c7' },
  { id: 'pipeline-logs' as ComponentId, label: 'Stdout Pipeline Log', icon: Terminal, tone: '#d97706' },
];

export default function DataPipelineGuide({ theme = 'dark' }: { theme?: 'light' | 'dark' }) {
  const galleryRef = useRef<HTMLElement>(null);
  const [activeShotId, setActiveShotId] = useState<ShotId>('ingestion');
  const [selectedComponentId, setSelectedComponentId] = useState<ComponentId>('nrt-scheduler');
  const [lowerShotId, setLowerShotId] = useState<'upload' | 'generate'>('upload');
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
              <span className="hiw-fo-crumb-current">Data Pipeline</span>
            </nav>

            <Link to="/how-it-works" className="hiw-fo-back-link">
              <ArrowLeft size={14} />
              <span>Back to Bento Grid</span>
            </Link>
          </div>

          <header className="hiw-fo-hero-head">
            <h1 id="how-it-works-detail-title" className="hiw-fo-display-title">
              DATA PIPELINE
            </h1>
          </header>

          <div className="hiw-fo-split-row">
            {/* Left Gallery (Main Stage + 2 Non-Active Captures) */}
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

              <div
                className="hiw-fo-thumb-grid"
                style={{ gridTemplateColumns: `repeat(${secondaryThumbnails.length}, minmax(0, 1fr))` }}
                role="group"
                aria-label="Switch Data Pipeline screenshot"
              >
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
                <p className="hiw-fo-route-tag">Route · /pipeline · Section 04</p>

                <div className="hiw-fo-prose">
                  <p>
                    <strong>Data Pipeline</strong> is TerraIgnis&rsquo;s operator ingestion and build console, connecting
                    automated NASA FIRMS NRT polling, resumable historical backfills, and batch file uploads directly to
                    six reproducible Parquet build stages.
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

                  <Link to="/pipeline" className="hiw-fo-primary-cta">
                    <span>Open Live Data Pipeline</span>
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
              </div>

              <dl className="hiw-fo-specs">
                {PIPELINE_SPECS.map((spec) => (
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
                <h3>Non-Destructive Ingestion &amp; Operator Control</h3>
                <p>
                  Both automated Near Real-Time polling and multi-day <strong>Historical backfill</strong> requests
                  preserve existing raw FIRMS archives first without overwriting served dashboard analytics unannounced.
                  Ingestion controls are public by default; deployments can optionally configure <code>FIRMS_INGESTION_TOKEN</code>{' '}
                  to protect operator actions, while an app-wide approval prompt notifies operators whenever new raw files
                  await regeneration.
                </p>
              </div>

              <div className="hiw-fo-detail-block">
                <h3>Direct Parquet Compilation &amp; 6 README Stages</h3>
                <p>
                  TerraIgnis serves dashboard analytics straight from generated Parquet datasets rather than managing a
                  separate SQL server. Clicking <strong>Generate datasets</strong> runs all six README stages in order—
                  <code>Ingest &amp; standardize</code>, <code>Profile</code>, <code>H3 aggregation</code>,{' '}
                  <code>Harmonization</code>, <code>Burn Index</code>, and <code>Anomaly detection</code>—with live
                  1.5-second status polling and an expandable stdout console.
                </p>
              </div>
            </div>

            <div className="hiw-fo-secondary-visual">
              <button
                type="button"
                onClick={() => setLightboxShotId('generate')}
                className="hiw-fo-media-btn group"
                aria-label="Inspect Generate Dashboard Datasets screenshot fullscreen"
              >
                <div className="hiw-fo-secondary-plate">
                  <img
                    src={generateDatasetsShot}
                    alt="Generate dashboard datasets card showing MODIS, VIIRS, Total raw file inventory and 6 completed pipeline stages"
                    className="hiw-fo-secondary-img transition-transform duration-300 group-hover:scale-[1.012]"
                  />
                </div>
                <div className="hiw-fo-media-caption">
                  <span>Builder Card · Raw Inventory &amp; 6 Pipeline Stages</span>
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
              {/* Left Hero Tile: Inventory & Pipeline Overview */}
              <div
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--hero ${
                  selectedComponentId === 'raw-inventory' ? 'is-selected' : ''
                }`}
              >
                <div className="hiw-fo-bento-hero-top">
                  <TerraIgnisLogo iconOnly theme={theme === 'dark' ? 'dark' : 'light'} className="w-8 h-8" />
                  <div className="hiw-fo-bento-clock tabular-nums">
                    <span>Pipeline Stage</span>
                    <strong>04 · /pipeline</strong>
                  </div>
                </div>

                <div className="hiw-fo-bento-hero-copy">
                  <p className="hiw-fo-bento-mono hiw-fo-bento-hero-headline">
                    AUTOMATED NRT POLLS +<br />
                    BATCH UPLOADS &amp;<br />
                    PARQUET REBUILDS.
                  </p>
                </div>

                <div className="hiw-fo-bento-links-grid">
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('pipeline-header')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'pipeline-header' ? 'is-active' : ''}`}
                  >
                    HEADER &amp; FIRMS LINK
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('raw-inventory')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'raw-inventory' ? 'is-active' : ''}`}
                  >
                    RAW FILE INVENTORY
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('operator-auth')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'operator-auth' ? 'is-active' : ''}`}
                  >
                    OPERATOR AUTH
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('historical-backfill')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'historical-backfill' ? 'is-active' : ''}`}
                  >
                    HISTORICAL BACKFILL
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('manual-upload')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'manual-upload' ? 'is-active' : ''}`}
                  >
                    1. UPLOAD RAW FILES
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('pipeline-logs')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'pipeline-logs' ? 'is-active' : ''}`}
                  >
                    STDOUT PIPELINE LOGS
                  </button>
                </div>
              </div>

              {/* Middle Stacked Column: Automated FIRMS Ingestion Photo + 6 Build Stages Tile */}
              <div className="hiw-fo-bento-mid-col">
                <button
                  type="button"
                  onClick={() => setSelectedComponentId('nrt-scheduler')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--photo group ${
                    selectedComponentId === 'nrt-scheduler' ? 'is-selected' : ''
                  }`}
                  aria-label="Inspect Automated FIRMS NRT Poller component"
                >
                  <img
                    src={automatedIngestionShot}
                    alt="Automated FIRMS ingestion NRT scheduler and historical backfill card preview"
                    style={{ objectPosition: 'center top' }}
                    className="hiw-fo-bento-photo transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <span className="hiw-fo-bento-photo-tag">NRT SCHEDULER · EVERY 30M</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('six-stages')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--cta group ${
                    selectedComponentId === 'six-stages' ? 'is-selected' : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">2. Generate Datasets</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                    6-STAGE PARQUET REBUILD
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
                  onClick={() => setSelectedComponentId('pipeline-header')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--status group ${
                    selectedComponentId === 'pipeline-header' ? 'is-selected' : ''
                  }`}
                >
                  <div className="hiw-fo-bento-status-row">
                    <span className="hiw-fo-bento-eyebrow">Header &amp; Archive</span>
                    <span className="hiw-fo-bento-plus" aria-hidden="true">
                      <ExternalLink size={12} />
                    </span>
                  </div>
                  <span className="hiw-fo-bento-status-val">
                    <span className="hiw-fo-status-dot" aria-hidden="true" />
                    NASA FIRMS DOWNLOADS
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('operator-auth')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--dark group ${
                    selectedComponentId === 'operator-auth' ? 'is-selected' : ''
                  }`}
                >
                  <LockKeyhole size={17} strokeWidth={1.9} />
                  <span className="hiw-fo-bento-mono hiw-fo-bento-dark-label">
                    IN-MEMORY OPERATOR TOKEN.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('historical-backfill')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--works group ${
                    selectedComponentId === 'historical-backfill' ? 'is-selected' : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">Standard Processing</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                    5-DAY CHUNKS &amp; RESUME
                  </span>
                  <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                    <ArrowUpRight size={15} />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('manual-upload')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--about group ${
                    selectedComponentId === 'manual-upload' ? 'is-selected' : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">1. Batch Upload</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-sub-sm">MODIS | VIIRS GUARD</span>
                  <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                    <ArrowUpRight size={15} />
                  </span>
                </button>
              </div>
            </div>

            {/* BOTTOM 3-CARD ROW */}
            <div className="hiw-fo-bento-bottom">
              {/* Bottom-Left: UI Captures + All 3 Screenshots */}
              <div className="hiw-fo-bento-tile hiw-fo-bento-tile--journal">
                <div className="hiw-fo-bento-head-row">
                  <span className="hiw-fo-bento-eyebrow">Captured Surfaces</span>
                  <button
                    type="button"
                    onClick={() => inspectComponentShot('generate')}
                    className="hiw-fo-bento-circle-arrow hiw-fo-bento-circle-arrow--static"
                    aria-label="Inspect Generate Dashboard Datasets screenshot"
                  >
                    <ArrowUpRight size={15} />
                  </button>
                </div>

                <p className="hiw-fo-bento-mono hiw-fo-bento-title">
                  INGESTION, UPLOAD &amp; BUILD.
                </p>

                <div className="hiw-fo-bento-thumb-strip">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedComponentId('nrt-scheduler');
                      setLightboxShotId('ingestion');
                    }}
                    className="hiw-fo-bento-thumb"
                    aria-label="Zoom Automated FIRMS Ingestion screenshot"
                  >
                    <img
                      src={automatedIngestionShot}
                      alt="Automated FIRMS Ingestion"
                      style={{ objectFit: 'contain', objectPosition: 'center' }}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedComponentId('manual-upload');
                      setLightboxShotId('upload');
                    }}
                    className="hiw-fo-bento-thumb"
                    aria-label="Zoom Upload Raw FIRMS Files screenshot"
                  >
                    <img
                      src={uploadFilesShot}
                      alt="Upload Raw FIRMS Files"
                      style={{ objectFit: 'contain', objectPosition: 'center' }}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedComponentId('six-stages');
                      setLightboxShotId('generate');
                    }}
                    className="hiw-fo-bento-thumb"
                    aria-label="Zoom Generate Dashboard Datasets screenshot"
                  >
                    <img
                      src={generateDatasetsShot}
                      alt="Generate Dashboard Datasets"
                      style={{ objectFit: 'contain', objectPosition: 'center' }}
                    />
                  </button>
                </div>
              </div>

              {/* Bottom-Middle: Expandable Stdout Pipeline Logs */}
              <button
                type="button"
                onClick={() => setSelectedComponentId('pipeline-logs')}
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--resources group ${
                  selectedComponentId === 'pipeline-logs' ? 'is-selected' : ''
                }`}
              >
                <span className="hiw-fo-bento-eyebrow">Command Trace</span>
                <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                  EXPANDABLE STDOUT CONSOLE
                </span>
                <span className="hiw-fo-bento-micro-note">
                  Inspect live command output line-by-line across every README processing stage.
                </span>
                <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                  <ArrowUpRight size={15} />
                </span>
              </button>

              {/* Bottom-Right: Global Approval Prompt & Pipeline Dock */}
              <div
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--stack ${
                  selectedComponentId === 'approval-prompt' ? 'is-selected' : ''
                }`}
              >
                <div className="hiw-fo-bento-head-row">
                  <span className="hiw-fo-bento-eyebrow">Cross-Route Sync</span>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('approval-prompt')}
                    className="hiw-fo-bento-circle-arrow hiw-fo-bento-circle-arrow--static"
                    aria-label="Inspect Global Ingestion Completion Approval Prompt"
                  >
                    <Bell size={14} />
                  </button>
                </div>

                <p className="hiw-fo-bento-mono hiw-fo-bento-title">
                  PIPELINE CONTROL DOCK
                </p>

                <div className="hiw-fo-bento-dock-row" role="group" aria-label="Select Data Pipeline component">
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
            <div className="hiw-fo-inspector-pills" role="tablist" aria-label="Data Pipeline components">
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
                <Link to="/pipeline" className="hiw-fo-primary-cta">
                  <span>Open Live /pipeline</span>
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
            BAND 3: BATCH UPLOAD & DATASET GENERATION SPOTLIGHT
            ================================================================ */}
        <section className="hiw-fo-band hiw-fo-band--soft">
          <div className="hiw-fo-bottom-split">
            <div className="hiw-fo-bottom-copy">
              <span className="hiw-fo-kicker">Manual Batching &amp; Compilation</span>
              <h2>1. Raw Upload &amp; 2. Dataset Rebuild</h2>
              <p>
                {lowerShotId === 'upload'
                  ? 'Select MODIS or VIIRS explicitly before dropping up to 512 MB .txt or .csv FIRMS files together. Mixed-sensor batches are rejected to protect sensor attribution, while duplicate uploads are skipped automatically.'
                  : 'Rebuilds served Parquet files from all stored MODIS and VIIRS raw archives across six visible stages—reporting MODIS, VIIRS, and total file counts alongside last completion time and expandable command logs.'}
              </p>

              <div className="hiw-fo-switch-row">
                <div className="hiw-fo-toggle-group" role="tablist" aria-label="Toggle spotlight capture">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={lowerShotId === 'upload'}
                    onClick={() => setLowerShotId('upload')}
                    className={`hiw-fo-toggle-pill ${lowerShotId === 'upload' ? 'is-active' : ''}`}
                  >
                    1. Upload Raw Files
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={lowerShotId === 'generate'}
                    onClick={() => setLowerShotId('generate')}
                    className={`hiw-fo-toggle-pill ${lowerShotId === 'generate' ? 'is-active' : ''}`}
                  >
                    2. Generate Datasets
                  </button>
                </div>

                <Link to="/pipeline" className="hiw-fo-primary-cta">
                  <span>Open Pipeline Console</span>
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
              <p className="hiw-fo-footer-next-name">Core Engine &amp; Ignish AI</p>
              <Link to="/how-it-works/core-engine" className="hiw-fo-footer-btn">
                <span>Explore Ignish AI &amp; Core</span>
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
