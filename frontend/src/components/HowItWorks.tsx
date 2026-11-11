import { useEffect, useId, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import TerraIgnisLogo from './TerraIgnisLogo';
import CellExplorerGuide from './CellExplorerGuide';
import CoreEngineGuide from './CoreEngineGuide';
import DailyActivityGuide from './DailyActivityGuide';
import DataPipelineGuide from './DataPipelineGuide';
import FireOverviewGuide from './FireOverviewGuide';

const GUIDE_IDS = [
  'fire-overview',
  'cell-explorer',
  'daily-activity',
  'data-pipeline',
  'core-engine',
] as const;

type GuideId = (typeof GUIDE_IDS)[number];

function isGuideId(value: string | undefined): value is GuideId {
  return typeof value === 'string' && (GUIDE_IDS as readonly string[]).includes(value);
}

const CALENDAR_HEAT_COLS = 16;

const CALENDAR_HEAT_PATTERN = [
  0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 0, 1, 2, 4, 2, 1,
  1, 2, 1, 0, 2, 3, 1, 1, 0, 2, 3, 2, 1, 1, 0, 2,
  0, 1, 2, 3, 4, 2, 1, 0, 1, 2, 1, 3, 2, 1, 2, 1,
  1, 0, 1, 2, 2, 1, 0, 2, 3, 4, 3, 1, 0, 1, 2, 0,
  0, 1, 1, 0, 1, 2, 2, 1, 1, 2, 1, 0, 1, 2, 1, 1,
  1, 2, 0, 1, 2, 3, 1, 0, 2, 3, 2, 1, 2, 4, 3, 1,
  0, 1, 2, 1, 0, 1, 2, 3, 1, 1, 0, 1, 2, 3, 1, 0,
];

const PIPELINE_STAGES = ['Ingest', 'Profile', 'H3', 'Harmonize', 'Index', 'Anomaly'] as const;

interface HowItWorksProps {
  theme?: 'light' | 'dark';
}

export default function HowItWorks({ theme = 'dark' }: HowItWorksProps) {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const uid = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0 });
  }, [section]);

  if (section !== undefined && !isGuideId(section)) {
    return <Navigate to="/how-it-works" replace />;
  }

  const activeSection = section && isGuideId(section) ? section : null;
  const openSection = (id: GuideId) => navigate(`/how-it-works/${id}`);

  if (activeSection === 'fire-overview') {
    return (
      <section
        ref={containerRef}
        className="how-it-works-view how-it-works-view--fire-overview"
        aria-labelledby="how-it-works-detail-title"
      >
        <FireOverviewGuide theme={theme} />
      </section>
    );
  }

  if (activeSection === 'cell-explorer') {
    return (
      <section
        ref={containerRef}
        className="how-it-works-view how-it-works-view--fire-overview"
        aria-labelledby="how-it-works-detail-title"
      >
        <CellExplorerGuide theme={theme} />
      </section>
    );
  }

  if (activeSection === 'daily-activity') {
    return (
      <section
        ref={containerRef}
        className="how-it-works-view how-it-works-view--fire-overview"
        aria-labelledby="how-it-works-detail-title"
      >
        <DailyActivityGuide theme={theme} />
      </section>
    );
  }

  if (activeSection === 'data-pipeline') {
    return (
      <section
        ref={containerRef}
        className="how-it-works-view how-it-works-view--fire-overview"
        aria-labelledby="how-it-works-detail-title"
      >
        <DataPipelineGuide theme={theme} />
      </section>
    );
  }

  if (activeSection === 'core-engine') {
    return (
      <section
        ref={containerRef}
        className="how-it-works-view how-it-works-view--fire-overview"
        aria-labelledby="how-it-works-detail-title"
      >
        <CoreEngineGuide theme={theme} />
      </section>
    );
  }

  return (
    <section
      ref={containerRef}
      className="how-it-works-view"
      aria-labelledby="how-it-works-title"
    >
      <div className="hiw-frame">
        <div className="hiw-stage">
          {/* Giant display title tucked behind the frosted top edge of Row 1 */}
          <div className="hiw-hero-title-wrap">
            <h1 id="how-it-works-title" className="hiw-hero-title">
              How It Works
            </h1>
          </div>

          {/* 6-tile full-screen asymmetric bento grid */}
          <div className="hiw-bento-grid">
            {/* 1. Fire Overview (Top-Left, 4 cols) */}
            <button
              type="button"
              onClick={() => openSection('fire-overview')}
              className="hiw-card hiw-card--top-row hiw-card--overview group"
              aria-label="Open Fire Overview component breakdown"
            >
              <div className="hiw-card-motif" aria-hidden="true">
                <svg
                  viewBox="0 0 180 180"
                  className="hiw-motif-svg--circle"
                  preserveAspectRatio="xMidYMid meet"
                >
                  {/* Enlarged concentric sensor rings circle graph */}
                  <g transform="translate(90 90)">
                    <circle r="74" fill="none" stroke="var(--hiw-motif-stroke)" strokeWidth="10" />
                    <circle r="53" fill="none" stroke="var(--hiw-motif-stroke)" strokeWidth="10" />
                    <circle r="32" fill="none" stroke="var(--hiw-motif-stroke)" strokeWidth="10" />
                    <path
                      d="M 0 -74 A 74 74 0 1 1 -57 47"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="10"
                      strokeLinecap="round"
                      opacity="0.9"
                    />
                    <path
                      d="M 0 -53 A 53 53 0 1 1 -37 38"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="10"
                      strokeLinecap="round"
                      opacity="0.86"
                    />
                    <path
                      d="M 0 -32 A 32 32 0 0 1 27 -16"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="10"
                      strokeLinecap="round"
                      opacity="0.95"
                    />
                    <circle r="8" fill="#60a5fa" opacity="0.88" />
                  </g>
                </svg>
              </div>

              <div className="hiw-card-body">
                <p className="hiw-card-desc">
                  Global hotspot map, KPIs, sensor mix &amp; 30-day fire trends.
                </p>
                <div className="hiw-card-footer">
                  <span className="hiw-card-title-wrap">
                    <span className="hiw-card-title">Fire Overview</span>
                    <span className="hiw-card-num">01</span>
                  </span>
                  <ArrowUpRight size={20} strokeWidth={1.9} className="hiw-card-arrow" />
                </div>
              </div>
            </button>

            {/* 2. Cell Explorer (Top-Right, 8 cols) */}
            <button
              type="button"
              onClick={() => openSection('cell-explorer')}
              className="hiw-card hiw-card--top-row hiw-card--explorer group"
              aria-label="Open Cell Explorer component breakdown"
            >
              <div className="hiw-card-motif" aria-hidden="true">
                <svg
                  viewBox="0 0 760 170"
                  className="hiw-motif-svg--spline"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <linearGradient id={`hiw-spline-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.34" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Full-width calibration grid */}
                  <g stroke="var(--hiw-motif-stroke)" strokeOpacity="0.42" strokeWidth="1">
                    <line x1="16" y1="22" x2="744" y2="22" strokeDasharray="3 5" />
                    <line x1="16" y1="65" x2="744" y2="65" strokeDasharray="3 5" />
                    <line x1="16" y1="108" x2="744" y2="108" strokeDasharray="3 5" />
                    <line x1="16" y1="150" x2="744" y2="150" />
                  </g>

                  {/* Subtle vertical guides */}
                  <g stroke="var(--hiw-motif-stroke)" strokeOpacity="0.22" strokeWidth="1">
                    <line x1="142" y1="22" x2="142" y2="150" />
                    <line x1="276" y1="22" x2="276" y2="150" />
                    <line x1="412" y1="22" x2="412" y2="150" />
                    <line x1="564" y1="22" x2="564" y2="150" />
                  </g>

                  {/* Dashed daily_median baseline curve */}
                  <path
                    d="M 16 118 C 122 112, 224 98, 336 108 C 448 118, 558 92, 668 100 C 706 103, 728 98, 744 102"
                    fill="none"
                    stroke="var(--hiw-motif-stroke)"
                    strokeDasharray="6 6"
                    strokeWidth="1.9"
                  />

                  {/* Enlarged Burn Index 0–100 anomaly spline & area */}
                  <path
                    d="M 16 126 C 68 126, 92 92, 142 92 C 192 92, 226 44, 276 44 C 326 44, 362 118, 412 118 C 464 118, 512 26, 564 26 C 624 26, 684 58, 744 58 L 744 150 L 16 150 Z"
                    fill={`url(#hiw-spline-${uid})`}
                  />
                  <path
                    d="M 16 126 C 68 126, 92 92, 142 92 C 192 92, 226 44, 276 44 C 326 44, 362 118, 412 118 C 464 118, 512 26, 564 26 C 624 26, 684 58, 744 58"
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />

                  {/* Severity outlier nodes aligned directly on the spline */}
                  <circle cx="142" cy="92" r="5" fill="#60a5fa" />
                  <circle cx="276" cy="44" r="11" fill="#f97316" opacity="0.22" />
                  <circle cx="276" cy="44" r="5.5" fill="#fb923c" />
                  <circle cx="412" cy="118" r="5" fill="#60a5fa" />
                  <circle cx="564" cy="26" r="13" fill="#f43f5e" opacity="0.24" />
                  <circle cx="564" cy="26" r="6" fill="#f43f5e" />
                  <circle cx="744" cy="58" r="4.5" fill="#38bdf8" />
                </svg>
              </div>

              <div className="hiw-card-body">
                <p className="hiw-card-desc">
                  Inspect any Resolution-7 H3 cell across lifetime detections, sensor splits &amp; burn-index anomalies.
                </p>
                <div className="hiw-card-footer">
                  <span className="hiw-card-title-wrap">
                    <span className="hiw-card-title">Cell Explorer</span>
                    <span className="hiw-card-num">02</span>
                  </span>
                  <ArrowUpRight size={20} strokeWidth={1.9} className="hiw-card-arrow" />
                </div>
              </div>
            </button>

            {/* 3. Daily Activity (Bottom-Left, 6 cols) */}
            <button
              type="button"
              onClick={() => openSection('daily-activity')}
              className="hiw-card hiw-card--activity group"
              aria-label="Open Daily Activity component breakdown"
            >
              <div className="hiw-card-motif" aria-hidden="true">
                <div className="hiw-activity-row">
                  {/* Enlarged 16×7 UTC calendar heatmap matrix */}
                  <svg
                    viewBox="0 0 368 160"
                    className="hiw-activity-heatmap"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {CALENDAR_HEAT_PATTERN.map((level, index) => {
                      const col = index % CALENDAR_HEAT_COLS;
                      const row = Math.floor(index / CALENDAR_HEAT_COLS);
                      const fill =
                        level === 0
                          ? 'var(--hiw-motif-fill)'
                          : level === 1
                            ? 'rgba(99, 102, 241, 0.25)'
                            : level === 2
                              ? 'rgba(99, 102, 241, 0.48)'
                              : level === 3
                                ? 'rgba(99, 102, 241, 0.72)'
                                : '#818cf8';
                      return (
                        <rect
                          key={index}
                          x={3 + col * 23}
                          y={3 + row * 22}
                          width="18"
                          height="18"
                          rx="4.5"
                          fill={fill}
                          stroke={index === 57 ? '#38bdf8' : 'none'}
                          strokeWidth={index === 57 ? '1.8' : undefined}
                        />
                      );
                    })}
                  </svg>

                  {/* Enlarged 6-axis concentric burn anomaly radar */}
                  <svg
                    viewBox="0 0 184 184"
                    className="hiw-activity-radar"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <g fill="none" stroke="var(--hiw-motif-stroke)" strokeWidth="1.25">
                      <circle cx="92" cy="92" r="20" />
                      <circle cx="92" cy="92" r="40" />
                      <circle cx="92" cy="92" r="60" />
                      <circle cx="92" cy="92" r="80" />
                      <line x1="92" y1="10" x2="92" y2="174" strokeOpacity="0.65" />
                      <line x1="21" y1="51" x2="163" y2="133" strokeOpacity="0.65" />
                      <line x1="163" y1="51" x2="21" y2="133" strokeOpacity="0.65" />
                    </g>
                    <polygon
                      points="92,23 142,63 154,128 92,143 38,123 53,69.5"
                      fill="rgba(249, 115, 22, 0.22)"
                      stroke="#fb923c"
                      strokeWidth="2.4"
                      strokeLinejoin="round"
                    />
                    <circle cx="92" cy="23" r="4.2" fill="#f43f5e" />
                    <circle cx="142" cy="63" r="3.6" fill="#fb923c" />
                    <circle cx="154" cy="128" r="4" fill="#fb923c" />
                    <circle cx="92" cy="143" r="3.5" fill="#fb923c" />
                    <circle cx="38" cy="123" r="3.8" fill="#fb923c" />
                    <circle cx="53" cy="69.5" r="3.4" fill="#fb923c" />
                  </svg>
                </div>
              </div>

              <div className="hiw-card-body">
                <p className="hiw-card-desc">
                  Annual calendar heatmap switching between fire counts and Burn Index, anomaly ratios &amp; CSV exports.
                </p>
                <div className="hiw-card-footer">
                  <span className="hiw-card-title-wrap">
                    <span className="hiw-card-title">Daily Activity</span>
                    <span className="hiw-card-num">03</span>
                  </span>
                  <ArrowUpRight size={20} strokeWidth={1.9} className="hiw-card-arrow" />
                </div>
              </div>
            </button>

            {/* 4. Core Engine Centerpiece Tile (Bottom-Middle, 3 cols) */}
            <button
              type="button"
              onClick={() => openSection('core-engine')}
              className="hiw-card hiw-card--visual group"
              aria-label="Open Core Engine component breakdown"
            >
              <div className="hiw-visual-art">
                <svg
                  viewBox="0 0 260 260"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  preserveAspectRatio="xMidYMid slice"
                  aria-hidden="true"
                >
                  <g style={{ color: 'var(--hiw-visual-ink)' }} fill="none">
                    <circle cx="130" cy="130" r="106" stroke="currentColor" strokeOpacity="0.09" strokeWidth="1" />
                    <circle
                      cx="130"
                      cy="130"
                      r="84"
                      stroke="currentColor"
                      strokeOpacity="0.08"
                      strokeWidth="1"
                      strokeDasharray="4 6"
                    />
                  </g>
                </svg>

                <TerraIgnisLogo
                  iconOnly
                  theme={theme}
                  className="relative z-[1] w-28 h-28 sm:w-32 sm:h-32 lg:w-36 lg:h-36 drop-shadow-[0_12px_24px_rgba(15,23,42,0.20)] transition-transform duration-300 group-hover:scale-105"
                />

                <span className="hiw-visual-badge">
                  Core Engine <ArrowUpRight size={18} strokeWidth={2} />
                </span>
              </div>
            </button>

            {/* 5 & 6. Right Column Stack (3 cols): Ignish AI Card + Data Pipeline */}
            <div className="hiw-right-stack">
              {/* 5. Ignish AI Guide Trigger (Satellite Sensors & H3 Grid removed per design) */}
              <button
                type="button"
                onClick={() => openSection('core-engine')}
                className="hiw-card hiw-dock-card group"
                aria-label="Open Ignish AI & Core Engine guide"
                title="Ignish AI Agent"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="hiw-dock-btn shrink-0" aria-hidden="true">
                    <svg viewBox="0 0 28 28" className="w-6 h-6">
                      <defs>
                        <linearGradient id={`hiw-ignish-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#f97316" />
                          <stop offset="52%" stopColor="#a855f7" />
                          <stop offset="100%" stopColor="#38bdf8" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M14.8 3.2C15.9 7.8 11.4 11.1 12.4 14.8C14.8 13.7 16.5 11.1 16.5 8.7C20.5 12.4 22.9 16 22.9 20.1C22.9 23.6 19.6 25.5 14 25.5C9.4 25.5 5.8 22.4 5.8 18.1C5.8 13.4 10.6 9.8 14.8 3.2Z"
                        fill={`url(#hiw-ignish-${uid})`}
                      />
                    </svg>
                  </span>
                  <span className="hiw-card-title truncate">Ignish AI</span>
                </div>
                <ArrowUpRight size={20} strokeWidth={1.9} className="hiw-card-arrow" />
              </button>

              {/* 6. Data Pipeline (Bottom-Right Bottom) */}
              <button
                type="button"
                onClick={() => openSection('data-pipeline')}
                className="hiw-card hiw-card--pipeline group"
                aria-label="Open Data Pipeline component breakdown"
              >
                <div className="hiw-card-motif" aria-hidden="true">
                  <div className="w-[88%] flex items-center justify-between gap-1 pt-0.5">
                    {PIPELINE_STAGES.map((stage, index) => (
                      <div key={stage} className="flex items-center flex-1 last:flex-none">
                        <span
                          title={stage}
                          className="block w-3 h-3 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              index === PIPELINE_STAGES.length - 1
                                ? '#34d399'
                                : index >= 3
                                  ? '#60a5fa'
                                  : 'var(--hiw-motif-stroke)',
                          }}
                        />
                        {index < PIPELINE_STAGES.length - 1 && (
                          <span
                            className="block h-[2px] flex-1 mx-1.5 rounded-full"
                            style={{ backgroundColor: 'var(--hiw-motif-stroke)' }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hiw-card-body">
                  <p className="hiw-card-desc">
                    NRT polls, historical backfill &amp; 6-stage build.
                  </p>
                  <div className="hiw-card-footer">
                    <span className="hiw-card-title-wrap">
                      <span className="hiw-card-title">Data Pipeline</span>
                      <span className="hiw-card-num">04</span>
                    </span>
                    <ArrowUpRight size={20} strokeWidth={1.9} className="hiw-card-arrow" />
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
