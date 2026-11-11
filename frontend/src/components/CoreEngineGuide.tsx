import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bot,
  ChevronLeft,
  ChevronRight,
  Flame,
  Hexagon,
  Maximize2,
  MessageSquareText,
  Minus,
  Plus,
  Radio,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import TerraIgnisLogo from './TerraIgnisLogo';
import ignishChatShot from '../assets/Ignish/Ignish.png';

type FocusId = 'chat' | 'briefing' | 'engine';
type ComponentId =
  | 'ignish-launcher'
  | 'proactive-briefing'
  | 'gfm-transcript'
  | 'suggestion-chips'
  | 'auto-composer'
  | 'read-only-guard'
  | 'sensor-harmonize'
  | 'h3-spatial'
  | 'burn-anomalies';

interface FocusEntry {
  id: FocusId;
  shortLabel: string;
  title: string;
  zone: string;
  caption: string;
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
  focusId: FocusId;
  actionLabel: string;
}

const FOCUSES: readonly FocusEntry[] = [
  {
    id: 'chat',
    shortLabel: 'Ignish Drawer',
    title: 'Global Ignish AI Assistant Drawer & Composer',
    zone: 'Bottom-Right Overlay · All Routes',
    caption:
      'Persistent bottom-right chat agent rendering structured GFM Markdown answers, interactive country/date/anomaly starter chips, an auto-growing 2,000-char composer, and processed-dataset grounding.',
  },
  {
    id: 'briefing',
    shortLabel: 'Session Briefing',
    title: 'Proactive Welcome Briefing & Starter Suggestions',
    zone: 'Session Startup · sessionStorage',
    caption:
      'Runs an automatic session briefing once per browser session via INITIAL_BRIEFING_PROMPT, summarizing processed coverage, busiest date, and burn anomalies while guarding against hallucinated zeros.',
  },
  {
    id: 'engine',
    shortLabel: 'Core Engine',
    title: 'MODIS + VIIRS Harmonization, H3 Res-7 & Burn Index',
    zone: 'Analytical Engine · Stages 3–6',
    caption:
      'Every number surfaced across Ignish and the dashboard comes from one six-stage pipeline harmonizing MODIS (~1 km) and VIIRS (~375 m) onto H3 Resolution-7 hexagons with 0–100 severity and robust Z-scores.',
  },
];

const CORE_SPECS = [
  { label: 'AI Endpoint', value: 'POST /api/chat (Read-Only)' },
  { label: 'Sensor Inputs', value: 'MODIS (~1 km) · VIIRS (~375 m)' },
  { label: 'Spatial Unit', value: 'Uber H3 Resolution 7 (cell/date)' },
  { label: 'Anomaly Scoring', value: 'daily_median · 5 Robust Z Tiers' },
] as const;

const COMPONENTS: readonly ComponentEntry[] = [
  {
    id: 'ignish-launcher',
    index: '01',
    shortName: 'Global Drawer',
    zone: 'Bottom-Right · All Routes',
    metricTag: 'Persistent Copilot',
    title: 'Floating Ignish Launcher & Expandable Chat Window',
    description:
      'Fixed bottom-right launcher emblem available across Fire Overview, Cell Explorer, Daily Activity, Data Pipeline, and How It Works, focusing the message composer immediately upon opening.',
    bullets: [
      'Accessible “Ignish · TerraIgnis AI agent” tooltip guides first-time discovery',
      'Preserves full conversation history seamlessly when navigating between dashboard routes',
      'Closes cleanly with the header X button or launcher toggle',
    ],
    focusId: 'chat',
    actionLabel: 'Inspect Ignish UI',
  },
  {
    id: 'proactive-briefing',
    index: '02',
    shortName: 'Auto Briefing',
    zone: 'Session Startup · /api/chat',
    metricTag: '1× Per Session',
    title: 'Proactive Session Welcome Briefing',
    description:
      'Fires INITIAL_BRIEFING_PROMPT automatically on initial tab launch (tracked via sessionStorage) so analysts immediately see verifiable fire coverage, peak dates, and anomalies.',
    bullets: [
      'Guarded by sessionStorage key terraignis-ignish-welcome-shown to avoid repeats',
      'Instructs Ignish to report missing data honestly rather than implying zeros',
      'Renders inline greeting immediately while background /api/chat response streams in',
    ],
    focusId: 'briefing',
    actionLabel: 'View Briefing Spec',
  },
  {
    id: 'gfm-transcript',
    index: '03',
    shortName: 'GFM Transcript',
    zone: 'Chat Body · Scroll Stage',
    metricTag: 'react-markdown + GFM',
    title: 'GFM Markdown Transcript & Thinking State',
    description:
      'Formats assistant responses with GitHub-Flavored Markdown (lists, emphasis, tables), auto-scrolls cleanly as replies arrive, and renders explicit spinner and error alert states.',
    bullets: [
      'Displays “Checking the dashboard data…” animated indicator while fetching /api/chat',
      'Auto-scrolls smoothly whenever messages, loading state, or errors update',
      'Surfaces clear error alerts without losing user prompt history',
    ],
    focusId: 'chat',
    actionLabel: 'Inspect Ignish UI',
  },
  {
    id: 'suggestion-chips',
    index: '04',
    shortName: 'Starter Chips',
    zone: 'Transcript Footer · Idle',
    metricTag: '3 Quick Prompts',
    title: 'One-Click Analytical Starter Suggestions',
    description:
      'Offers three domain-specific prompt pills before the user’s first message to launch country fire summaries, peak observation-date lookups, or latest anomaly checks immediately.',
    bullets: [
      'Includes country activity summary, peak detection date & latest Burn Index anomalies',
      'Disappears automatically once the user submits any custom or suggested question',
      'Sending a chip immediately appends the user bubble and queries /api/chat',
    ],
    focusId: 'briefing',
    actionLabel: 'View Briefing Spec',
  },
  {
    id: 'auto-composer',
    index: '05',
    shortName: 'Auto Composer',
    zone: 'Chat Bottom · Input Form',
    metricTag: '2,000 Char Limit',
    title: 'Auto-Sizing Multi-Line Composer & Grounding Note',
    description:
      'Dynamically grows up to 96 px as multi-line fire queries are drafted, handles Enter-to-send vs. Shift+Enter newlines, and displays the permanent processed-data footnote beneath.',
    bullets: [
      'Enforces maxLength={2000} and disables empty or concurrent duplicate submits',
      'Automatically switches overflow-y scrolling cleanly beyond 96 px height',
      'Footnote reminds analysts: “Answers use the processed fire datasets currently available”',
    ],
    focusId: 'chat',
    actionLabel: 'Inspect Ignish UI',
  },
  {
    id: 'read-only-guard',
    index: '06',
    shortName: 'Read-Only Guard',
    zone: 'Chat API · Safety Boundary',
    metricTag: 'Zero Mutations',
    title: 'Read-Only Parquet Grounding & Mutation Separation',
    description:
      'Keeps Ignish AI strictly focused on analytical Q&A over processed Parquet outputs while delegating raw uploads, NRT polls, historical backfills, and rebuilds exclusively to /pipeline.',
    bullets: [
      'Submits full conversational context to POST /api/chat for verifiable statistics',
      'Never triggers file uploads, NRT downloads, or Parquet regeneration from chat prompts',
      'Guards against fabricated missing dates by keeping missing observations as non-zero gaps',
    ],
    focusId: 'briefing',
    actionLabel: 'View Briefing Spec',
  },
  {
    id: 'sensor-harmonize',
    index: '07',
    shortName: 'Sensor Harmonize',
    zone: 'Core Engine · Stage 4',
    metricTag: '~1 km · ~375 m · Dual',
    title: 'MODIS & VIIRS Multi-Sensor Harmonization',
    description:
      'Preserves instrument provenance instead of equating raw pixel counts: MODIS (~1 km pixels) and VIIRS (~375 m finer detections) align as MODIS, VIIRS, or Dual-Sensor matches.',
    bullets: [
      'Prevents VIIRS spatial resolution sensitivity from masking underlying fire behavior',
      'Drives concentric Sensor Mix rings on Fire Overview & MODIS/VIIRS bars on /cells',
      'Powers instant instrument isolation via the map floating All | MODIS | VIIRS switch',
    ],
    focusId: 'engine',
    actionLabel: 'View Core Architecture',
  },
  {
    id: 'h3-spatial',
    index: '08',
    shortName: 'H3 Res-7 Grid',
    zone: 'Core Engine · Stage 3',
    metricTag: 'Uber H3 Res-7',
    title: 'Equal-Area H3 Resolution-7 Spatial Hexagon Grid',
    description:
      'Snaps raw latitude/longitude FIRMS detections onto Uber H3 Resolution-7 hexagonal indices keyed by (h3_cell, acq_date) for distortion-resistant country joins and fast WebGL rendering.',
    bullets: [
      'Matches Country filters cleanly against Sovereign GeoJSON on H3 hexagon centers',
      'Computes coordinates on demand in Filter Drawer using h3-js latLngToCell(lat, lon, 7)',
      'Synchronizes clicked hexagon strings seamlessly across / and /cells',
    ],
    focusId: 'engine',
    actionLabel: 'View Core Architecture',
  },
  {
    id: 'burn-anomalies',
    index: '09',
    shortName: 'Burn & Anomalies',
    zone: 'Core Engine · Stages 5–6',
    metricTag: '0–100 Index · 5 Tiers',
    title: 'Relative Burn Index & Robust Z-Score Anomalies',
    description:
      'Scores harmonized cell-dates on a 0–100 relative Burn Index scale and compares daily activity against historical daily_median baselines into five statistical severity levels.',
    bullets: [
      'Classifies observations into Extreme low, Low, Normal, High & Extreme high',
      'Feeds Cell Explorer splines, Daily Activity 6-axis Radar & Dataset Snapshot quartiles',
      'Preserves zero-imputation rigor across charts and Ignish natural-language summaries',
    ],
    focusId: 'engine',
    actionLabel: 'View Core Architecture',
  },
];

const BENTO_DOCK = [
  { id: 'ignish-launcher' as ComponentId, label: 'Global Chat Drawer', icon: Bot, tone: '#ea580c' },
  { id: 'gfm-transcript' as ComponentId, label: 'GFM Markdown Replies', icon: MessageSquareText, tone: '#2563eb' },
  { id: 'suggestion-chips' as ComponentId, label: 'Starter Prompt Chips', icon: Sparkles, tone: '#a855f7' },
  { id: 'h3-spatial' as ComponentId, label: 'H3 Resolution-7 Grid', icon: Hexagon, tone: '#0284c7' },
  { id: 'burn-anomalies' as ComponentId, label: 'Burn Index & Z-Scores', icon: Flame, tone: '#e11d48' },
];

export default function CoreEngineGuide({ theme = 'dark' }: { theme?: 'light' | 'dark' }) {
  const galleryRef = useRef<HTMLElement>(null);
  const [activeFocusId, setActiveFocusId] = useState<FocusId>('chat');
  const [selectedComponentId, setSelectedComponentId] = useState<ComponentId>('ignish-launcher');
  const [lowerTab, setLowerTab] = useState<'preview' | 'guardrails'>('preview');
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const activeFocusIndex = Math.max(
    0,
    FOCUSES.findIndex((focus) => focus.id === activeFocusId),
  );
  const activeFocus = FOCUSES[activeFocusIndex];
  const selectedComponent =
    COMPONENTS.find((comp) => comp.id === selectedComponentId) ?? COMPONENTS[0];

  const stepFocus = (delta: -1 | 1) => {
    const nextIndex = (activeFocusIndex + delta + FOCUSES.length) % FOCUSES.length;
    setActiveFocusId(FOCUSES[nextIndex].id);
  };

  const inspectFocus = (focusId: FocusId) => {
    setActiveFocusId(focusId);
    galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxOpen]);

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
              <span className="hiw-fo-crumb-current">Core Engine &amp; Ignish AI</span>
            </nav>

            <Link to="/how-it-works" className="hiw-fo-back-link">
              <ArrowLeft size={14} />
              <span>Back to Bento Grid</span>
            </Link>
          </div>

          <header className="hiw-fo-hero-head">
            <h1 id="how-it-works-detail-title" className="hiw-fo-display-title">
              IGNISH &amp; CORE ENGINE
            </h1>
          </header>

          <div className="hiw-fo-split-row">
            {/* Left Stage: Portrait Ignish UI Capture + 3 Pillar Switcher Tiles */}
            <div className="hiw-fo-gallery">
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="hiw-fo-stage-btn group"
                aria-label="Inspect Ignish AI assistant screenshot fullscreen"
              >
                <div className="hiw-fo-stage-plate">
                  <img
                    src={ignishChatShot}
                    alt="Ignish TerraIgnis AI agent drawer showing greeting, country query reply, and auto-sizing composer"
                    className="hiw-fo-stage-img drop-shadow-[0_14px_28px_rgba(15,23,42,0.18)] transition-transform duration-300 group-hover:scale-[1.012]"
                  />
                </div>
                <span className="hiw-fo-stage-pill">
                  <Maximize2 size={12} />
                  <span>Ignish AI Chat</span>
                </span>
              </button>

              <div className="hiw-fo-thumb-grid" role="tablist" aria-label="Switch Core Engine & Ignish focus">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeFocusId === 'chat'}
                  onClick={() => {
                    setActiveFocusId('chat');
                    setSelectedComponentId('ignish-launcher');
                  }}
                  className="hiw-fo-thumb group"
                >
                  <div
                    className="hiw-fo-thumb-media flex-col gap-1.5"
                    style={
                      activeFocusId === 'chat'
                        ? { borderColor: '#2563eb', boxShadow: 'inset 0 0 0 1px #2563eb' }
                        : undefined
                    }
                  >
                    <Bot size={20} className="text-orange-500" aria-hidden="true" />
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--hiw-fo-ink)' }}>
                      UI · GFM
                    </span>
                  </div>
                  <span className="hiw-fo-thumb-label">Ignish Drawer</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeFocusId === 'briefing'}
                  onClick={() => {
                    setActiveFocusId('briefing');
                    setSelectedComponentId('proactive-briefing');
                  }}
                  className="hiw-fo-thumb group"
                >
                  <div
                    className="hiw-fo-thumb-media flex-col gap-1.5"
                    style={
                      activeFocusId === 'briefing'
                        ? { borderColor: '#2563eb', boxShadow: 'inset 0 0 0 1px #2563eb' }
                        : undefined
                    }
                  >
                    <Sparkles size={20} className="text-indigo-500" aria-hidden="true" />
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--hiw-fo-ink)' }}>
                      Auto · Chips
                    </span>
                  </div>
                  <span className="hiw-fo-thumb-label">Briefing &amp; Chips</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeFocusId === 'engine'}
                  onClick={() => {
                    setActiveFocusId('engine');
                    setSelectedComponentId('sensor-harmonize');
                  }}
                  className="hiw-fo-thumb group"
                >
                  <div
                    className="hiw-fo-thumb-media flex-col gap-1.5"
                    style={
                      activeFocusId === 'engine'
                        ? { borderColor: '#2563eb', boxShadow: 'inset 0 0 0 1px #2563eb' }
                        : undefined
                    }
                  >
                    <Hexagon size={20} className="text-sky-500" aria-hidden="true" />
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--hiw-fo-ink)' }}>
                      Res-7 · 0–100
                    </span>
                  </div>
                  <span className="hiw-fo-thumb-label">Core Engine</span>
                </button>
              </div>
            </div>

            {/* Right Summary, Stepper + CTA & Spec Table */}
            <div className="hiw-fo-summary">
              <div>
                <h2 className="hiw-fo-subtitle">{activeFocus.title}</h2>
                <p className="hiw-fo-route-tag">App-Wide Agent · POST /api/chat · Core Engine</p>

                <div className="hiw-fo-prose">
                  <p>
                    <strong>Core Engine &amp; Ignish AI</strong> power every analytical readout in TerraIgnis—combining
                    MODIS (~1 km) and VIIRS (~375 m) harmonization, H3 Resolution-7 aggregation, 0–100 relative Burn
                    Index scoring, and a read-only conversational copilot accessible from the bottom-right launcher on
                    every route.
                  </p>
                  <p>{activeFocus.caption}</p>
                </div>

                <div className="hiw-fo-action-row">
                  <div className="hiw-fo-stepper" aria-label="Cycle engine pillars">
                    <button
                      type="button"
                      onClick={() => stepFocus(-1)}
                      className="hiw-fo-step-btn"
                      aria-label="Previous focus"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="hiw-fo-step-value tabular-nums">
                      0{activeFocusIndex + 1} / 0{FOCUSES.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => stepFocus(1)}
                      className="hiw-fo-step-btn"
                      aria-label="Next focus"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <Link to="/" className="hiw-fo-primary-cta">
                    <span>Open Live Dashboard</span>
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
              </div>

              <dl className="hiw-fo-specs">
                {CORE_SPECS.map((spec) => (
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
                <h3>Read-Only Conversational Copilot &amp; Session Briefing</h3>
                <p>
                  Clicking the floating bottom-right emblem opens <strong>Ignish</strong>, pre-warmed once per session
                  using <code>INITIAL_BRIEFING_PROMPT</code> so verified fire activity, peak observed date, and burn
                  anomalies appear immediately. Starter chips prompt country summaries, busiest dates, or latest
                  anomalies while keeping uploads, polls, and Parquet rebuilds strictly confined to{' '}
                  <code>/pipeline</code>.
                </p>
              </div>

              <div className="hiw-fo-detail-block">
                <h3>Reproducible Harmonization From Sensor To Chatbot</h3>
                <p>
                  MODIS (~1 km pixels) and VIIRS (~375 m sub-pixel sensitivity) never merge naively 1:1—sensor
                  provenance (<code>MODIS</code>, <code>VIIRS</code>, <code>Both</code>) rides onto every{' '}
                  <strong>Uber H3 Resolution-7</strong> cell-date before computing the 0–100 relative Burn Index and
                  five robust Z-score tiers. Ignish queries the exact same processed Parquet datasets driving every map
                  and chart.
                </p>
              </div>
            </div>

            {/* Clean Architectural Schematic Plate paired with Lightbox trigger */}
            <div className="hiw-fo-secondary-visual">
              <div className="hiw-fo-media-btn" style={{ cursor: 'default' }}>
                <div
                  className="hiw-fo-secondary-plate flex-col gap-3"
                  style={{ padding: '22px 20px', alignItems: 'stretch' }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div
                      className="rounded-xl p-3.5 border"
                      style={{
                        background: 'var(--hiw-fo-card-bg)',
                        borderColor: 'var(--hiw-fo-border)',
                      }}
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wider text-orange-500 block">
                        Sensors
                      </span>
                      <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--hiw-fo-ink)' }}>
                        MODIS + VIIRS
                      </p>
                      <p className="mt-1 text-[13px] leading-snug" style={{ color: 'var(--hiw-fo-muted)' }}>
                        ~1 km &amp; ~375 m aligned with Dual match tags
                      </p>
                    </div>

                    <div
                      className="rounded-xl p-3.5 border"
                      style={{
                        background: 'var(--hiw-fo-card-bg)',
                        borderColor: 'var(--hiw-fo-border)',
                      }}
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wider text-sky-500 block">
                        Spatial Index
                      </span>
                      <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--hiw-fo-ink)' }}>
                        H3 Resolution 7
                      </p>
                      <p className="mt-1 text-[13px] leading-snug" style={{ color: 'var(--hiw-fo-muted)' }}>
                        Equal-area hexagons keyed by (h3_cell, acq_date)
                      </p>
                    </div>

                    <div
                      className="rounded-xl p-3.5 border"
                      style={{
                        background: 'var(--hiw-fo-card-bg)',
                        borderColor: 'var(--hiw-fo-border)',
                      }}
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 block">
                        Scoring + AI
                      </span>
                      <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--hiw-fo-ink)' }}>
                        0–100 + Ignish
                      </p>
                      <p className="mt-1 text-[13px] leading-snug" style={{ color: 'var(--hiw-fo-muted)' }}>
                        Robust Z tiers &amp; read-only /api/chat
                      </p>
                    </div>
                  </div>

                  <div
                    className="rounded-xl px-4 py-3 border flex items-center justify-between gap-3"
                    style={{
                      background: 'var(--hiw-fo-card-bg)',
                      borderColor: 'var(--hiw-fo-border)',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <TerraIgnisLogo iconOnly theme={theme} className="w-7 h-7 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--hiw-fo-ink)' }}>
                          Single Source of Truth · Parquet Analytics Layer
                        </p>
                        <p className="text-[13px] truncate" style={{ color: 'var(--hiw-fo-muted)' }}>
                          Shared across /, /cells, /activity, and POST /api/chat
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      className="hiw-fo-outline-btn shrink-0"
                      style={{ width: 'auto', height: '32px', padding: '0 14px', fontSize: '11.5px' }}
                    >
                      Zoom Chat Shot
                    </button>
                  </div>
                </div>
                <div className="hiw-fo-media-caption">
                  <span>Core Engine Architecture · Harmonization, H3 &amp; Read-Only Copilot</span>
                  <span className="hiw-fo-zoom-hint">
                    <ShieldCheck size={12} /> Verified
                  </span>
                </div>
              </div>
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
              Click any module inside the bento architecture below to inspect Ignish AI behavior and Core Engine foundations
            </p>
          </div>

          <div className="hiw-fo-bento-casing">
            {/* TOP INTERLOCKING ZONE */}
            <div className="hiw-fo-bento-top">
              {/* Left Hero Tile: Auto Composer, Grounding & Engine Links */}
              <div
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--hero ${
                  selectedComponentId === 'auto-composer' ? 'is-selected' : ''
                }`}
              >
                <div className="hiw-fo-bento-hero-top">
                  <TerraIgnisLogo iconOnly theme={theme === 'dark' ? 'dark' : 'light'} className="w-8 h-8" />
                  <div className="hiw-fo-bento-clock tabular-nums">
                    <span>Core + Copilot</span>
                    <strong>AI · ENGINE</strong>
                  </div>
                </div>

                <div className="hiw-fo-bento-hero-copy">
                  <p className="hiw-fo-bento-mono hiw-fo-bento-hero-headline">
                    IGNISH AI COPILOT +<br />
                    SENSOR HARMONIZATION &amp;<br />
                    H3 RES-7 ENGINE.
                  </p>
                </div>

                <div className="hiw-fo-bento-links-grid">
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('ignish-launcher')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'ignish-launcher' ? 'is-active' : ''}`}
                  >
                    GLOBAL DRAWER
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('proactive-briefing')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'proactive-briefing' ? 'is-active' : ''}`}
                  >
                    AUTO BRIEFING
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('auto-composer')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'auto-composer' ? 'is-active' : ''}`}
                  >
                    2K AUTO COMPOSER
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('read-only-guard')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'read-only-guard' ? 'is-active' : ''}`}
                  >
                    READ-ONLY GUARD
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('sensor-harmonize')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'sensor-harmonize' ? 'is-active' : ''}`}
                  >
                    SENSOR HARMONIZE
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('h3-spatial')}
                    className={`hiw-fo-bento-link ${selectedComponentId === 'h3-spatial' ? 'is-active' : ''}`}
                  >
                    H3 RES-7 GRID
                  </button>
                </div>
              </div>

              {/* Middle Stacked Column: Ignish Chat Window Preview + H3 Res-7 Engine Tile */}
              <div className="hiw-fo-bento-mid-col">
                <button
                  type="button"
                  onClick={() => setSelectedComponentId('ignish-launcher')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--photo group ${
                    selectedComponentId === 'ignish-launcher' ? 'is-selected' : ''
                  }`}
                  style={{
                    padding: '10px',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                  aria-label="Inspect Floating Ignish Launcher & Chat Window component"
                >
                  <img
                    src={ignishChatShot}
                    alt="Ignish AI Chatbot Drawer Preview"
                    style={{
                      width: 'auto',
                      maxWidth: '100%',
                      maxHeight: '246px',
                      minHeight: '200px',
                      objectFit: 'contain',
                      objectPosition: 'center',
                      borderRadius: '10px',
                    }}
                    className="hiw-fo-bento-photo drop-shadow-[0_10px_22px_rgba(15,23,42,0.18)] transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <span className="hiw-fo-bento-photo-tag">IGNISH CHAT · GLOBAL DRAWER</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('h3-spatial')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--cta group ${
                    selectedComponentId === 'h3-spatial' ? 'is-selected' : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">Spatial Indexing</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                    UBER H3 RES-7 HEXAGON GRID
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
                  onClick={() => setSelectedComponentId('proactive-briefing')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--status group ${
                    selectedComponentId === 'proactive-briefing' ? 'is-selected' : ''
                  }`}
                >
                  <div className="hiw-fo-bento-status-row">
                    <span className="hiw-fo-bento-eyebrow">Welcome Poll</span>
                    <span className="hiw-fo-bento-plus" aria-hidden="true">
                      <Sparkles size={13} />
                    </span>
                  </div>
                  <span className="hiw-fo-bento-status-val">
                    <span className="hiw-fo-status-dot" aria-hidden="true" />
                    SESSION AUTO-BRIEFING
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('read-only-guard')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--dark group ${
                    selectedComponentId === 'read-only-guard' ? 'is-selected' : ''
                  }`}
                >
                  <ShieldCheck size={17} strokeWidth={1.9} />
                  <span className="hiw-fo-bento-mono hiw-fo-bento-dark-label">
                    READ-ONLY PARQUET /API/CHAT.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('suggestion-chips')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--works group ${
                    selectedComponentId === 'suggestion-chips' ? 'is-selected' : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">Idle Prompts</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                    3 STARTER QUERIES
                  </span>
                  <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                    <ArrowUpRight size={15} />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedComponentId('sensor-harmonize')}
                  className={`hiw-fo-bento-tile hiw-fo-bento-tile--about group ${
                    selectedComponentId === 'sensor-harmonize' ? 'is-selected' : ''
                  }`}
                >
                  <span className="hiw-fo-bento-eyebrow">Provenance</span>
                  <span className="hiw-fo-bento-mono hiw-fo-bento-sub-sm">MODIS ~1KM · VIIRS ~375M</span>
                  <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                    <ArrowUpRight size={15} />
                  </span>
                </button>
              </div>
            </div>

            {/* BOTTOM 3-CARD ROW */}
            <div className="hiw-fo-bento-bottom">
              {/* Bottom-Left: Quick Engine & Ignish Capabilities */}
              <div className="hiw-fo-bento-tile hiw-fo-bento-tile--journal">
                <div className="hiw-fo-bento-head-row">
                  <span className="hiw-fo-bento-eyebrow">Foundations &amp; Prompts</span>
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="hiw-fo-bento-circle-arrow hiw-fo-bento-circle-arrow--static"
                    aria-label="Inspect Ignish screenshot fullscreen"
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>

                <p className="hiw-fo-bento-mono hiw-fo-bento-title">
                  BRIEFING, CHIPS &amp; SCORING.
                </p>

                <div className="hiw-fo-bento-thumb-strip">
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('proactive-briefing')}
                    className="hiw-fo-bento-thumb flex flex-col items-center justify-center gap-1 text-center px-1"
                    aria-label="Inspect Proactive Session Briefing"
                  >
                    <Sparkles size={16} className="text-indigo-500" aria-hidden="true" />
                    <span className="text-[10px] font-semibold leading-tight" style={{ color: 'var(--hiw-fo-ink)' }}>
                      Initial Briefing
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('suggestion-chips')}
                    className="hiw-fo-bento-thumb flex flex-col items-center justify-center gap-1 text-center px-1"
                    aria-label="Inspect Starter Suggestion Chips"
                  >
                    <MessageSquareText size={16} className="text-blue-500" aria-hidden="true" />
                    <span className="text-[10px] font-semibold leading-tight" style={{ color: 'var(--hiw-fo-ink)' }}>
                      Starter Chips
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('sensor-harmonize')}
                    className="hiw-fo-bento-thumb flex flex-col items-center justify-center gap-1 text-center px-1"
                    aria-label="Inspect MODIS and VIIRS Harmonization"
                  >
                    <Radio size={16} className="text-orange-500" aria-hidden="true" />
                    <span className="text-[10px] font-semibold leading-tight" style={{ color: 'var(--hiw-fo-ink)' }}>
                      Dual Sensors
                    </span>
                  </button>
                </div>
              </div>

              {/* Bottom-Middle: GFM Markdown Transcript & Thinking */}
              <button
                type="button"
                onClick={() => setSelectedComponentId('gfm-transcript')}
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--resources group ${
                  selectedComponentId === 'gfm-transcript' ? 'is-selected' : ''
                }`}
              >
                <span className="hiw-fo-bento-eyebrow">Structured Responses</span>
                <span className="hiw-fo-bento-mono hiw-fo-bento-title">
                  GFM MARKDOWN &amp; THINKING
                </span>
                <span className="hiw-fo-bento-micro-note">
                  Remark-GFM tables, lists &amp; animated “Checking the dashboard data…” spinner state.
                </span>
                <span className="hiw-fo-bento-circle-arrow" aria-hidden="true">
                  <ArrowUpRight size={15} />
                </span>
              </button>

              {/* Bottom-Right: Burn Index & Ignish Dock */}
              <div
                className={`hiw-fo-bento-tile hiw-fo-bento-tile--stack ${
                  selectedComponentId === 'burn-anomalies' ? 'is-selected' : ''
                }`}
              >
                <div className="hiw-fo-bento-head-row">
                  <span className="hiw-fo-bento-eyebrow">Scoring &amp; Copilot</span>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId('burn-anomalies')}
                    className="hiw-fo-bento-circle-arrow hiw-fo-bento-circle-arrow--static"
                    aria-label="Inspect Relative Burn Index and Robust Z-Score Anomalies"
                  >
                    <Flame size={14} />
                  </button>
                </div>

                <p className="hiw-fo-bento-mono hiw-fo-bento-title">
                  ENGINE &amp; IGNISH DOCK
                </p>

                <div className="hiw-fo-bento-dock-row" role="group" aria-label="Select Core Engine or Ignish component">
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
            <div className="hiw-fo-inspector-pills" role="tablist" aria-label="Core Engine and Ignish components">
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
                  onClick={() => inspectFocus(selectedComponent.focusId)}
                  className="hiw-fo-outline-btn"
                >
                  {selectedComponent.actionLabel} ↑
                </button>
                <Link to="/" className="hiw-fo-primary-cta">
                  <span>Try Live Dashboard</span>
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
            BAND 3: IGNISH GUARDRAILS & LIVE INTERFACE SPOTLIGHT
            ================================================================ */}
        <section className="hiw-fo-band hiw-fo-band--soft">
          <div className="hiw-fo-bottom-split">
            <div className="hiw-fo-bottom-copy">
              <span className="hiw-fo-kicker">Conversational Fire Intelligence</span>
              <h2>Ignish Drawer &amp; Read-Only Safety</h2>
              <p>
                {lowerTab === 'preview'
                  ? 'Every response rendered by Ignish arrives verbatim from POST /api/chat computed over the served Parquet dataset—formatting dates, countries, and anomaly breakdowns in Markdown right beside the floating launcher button.'
                  : 'Ignish operates strictly read-only over processed datasets: it never fabricates zeros for missing dates and leaves NRT polling, historical downloads, raw file uploads, and Parquet rebuilds strictly to the Data Pipeline page.'}
              </p>

              <div className="hiw-fo-switch-row">
                <div className="hiw-fo-toggle-group" role="tablist" aria-label="Toggle Ignish spotlight view">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={lowerTab === 'preview'}
                    onClick={() => setLowerTab('preview')}
                    className={`hiw-fo-toggle-pill ${lowerTab === 'preview' ? 'is-active' : ''}`}
                  >
                    Live Chat UI
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={lowerTab === 'guardrails'}
                    onClick={() => setLowerTab('guardrails')}
                    className={`hiw-fo-toggle-pill ${lowerTab === 'guardrails' ? 'is-active' : ''}`}
                  >
                    Read-Only Rules
                  </button>
                </div>

                <Link to="/pipeline" className="hiw-fo-primary-cta">
                  <span>View Pipeline Mutations</span>
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            </div>

            <div className="hiw-fo-bottom-media">
              {lowerTab === 'preview' ? (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="hiw-fo-media-btn group"
                  aria-label="Inspect Ignish AI Chat Drawer fullscreen"
                >
                  <div className="hiw-fo-bottom-plate">
                    <img
                      src={ignishChatShot}
                      alt="Ignish AI Chatbot interface with starter query and assistant response"
                      className="hiw-fo-bottom-img drop-shadow-[0_12px_24px_rgba(15,23,42,0.16)] transition-transform duration-300 group-hover:scale-[1.015]"
                    />
                  </div>
                  <div className="hiw-fo-media-caption">
                    <span>Ignish · TerraIgnis AI agent (Bottom-Right Launcher)</span>
                    <span className="hiw-fo-zoom-hint">
                      <Maximize2 size={12} /> Expand
                    </span>
                  </div>
                </button>
              ) : (
                <div className="hiw-fo-media-btn" style={{ cursor: 'default' }}>
                  <div
                    className="hiw-fo-bottom-plate flex-col gap-3"
                    style={{ height: 'auto', minHeight: '290px', padding: '22px' }}
                  >
                    <div
                      className="w-full rounded-xl p-4 border"
                      style={{ background: 'var(--hiw-fo-card-bg)', borderColor: 'var(--hiw-fo-border)' }}
                    >
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-500 block">
                        01 · Grounded Context Only
                      </span>
                      <p className="mt-1.5 text-[15px] leading-relaxed" style={{ color: 'var(--hiw-fo-copy)' }}>
                        All facts originate from processed Parquet tables; gaps stay un-imputed gaps rather than
                        synthetic zero-detection claims.
                      </p>
                    </div>
                    <div
                      className="w-full rounded-xl p-4 border"
                      style={{ background: 'var(--hiw-fo-card-bg)', borderColor: 'var(--hiw-fo-border)' }}
                    >
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-500 block">
                        02 · Strict Pipeline Separation
                      </span>
                      <p className="mt-1.5 text-[15px] leading-relaxed" style={{ color: 'var(--hiw-fo-copy)' }}>
                        Chat prompts never upload files, schedule NRT runs, or mutate backend state—keeping operational
                        writes confined to <code>/pipeline</code>.
                      </p>
                    </div>
                  </div>
                  <div className="hiw-fo-media-caption">
                    <span>Ignish AI Grounding &amp; Safety Contract</span>
                    <span className="hiw-fo-zoom-hint">
                      <ShieldCheck size={12} /> Read-Only
                    </span>
                  </div>
                </div>
              )}
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
              <span className="hiw-fo-footer-meta">START TOUR OVER</span>
              <p className="hiw-fo-footer-next-name">01 · Fire Overview</p>
              <Link to="/how-it-works/fire-overview" className="hiw-fo-footer-btn">
                <span>Explore Fire Overview</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </footer>
      </div>

      {/* ==================================================================
          FULLSCREEN SCREENSHOT LIGHTBOX
          ================================================================== */}
      {lightboxOpen && (
        <div
          className="hiw-fo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Ignish AI Assistant Screenshot"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="hiw-fo-lightbox-inner" onClick={(event) => event.stopPropagation()}>
            <div className="hiw-fo-lightbox-bar">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-400 block">
                  Bottom-Right Overlay · All Routes
                </span>
                <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                  Ignish · TerraIgnis AI agent
                </h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  className="hiw-fo-lightbox-btn"
                  aria-label="Close fullscreen preview"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="hiw-fo-lightbox-stage">
              <img
                src={ignishChatShot}
                alt="Ignish TerraIgnis AI agent full drawer preview"
                className="hiw-fo-lightbox-img"
              />
            </div>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Floating Ignish assistant showing proactive greeting, country fire activity query, starter suggestions,
              and processed-dataset footnote guardrail.
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
