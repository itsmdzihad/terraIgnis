import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import type { AnomalyLevel, AnomalyRecord } from '../types/anomaly';

type TimeWindow = '30d' | '14d' | '7d' | 'all';

const WINDOW_OPTIONS: { id: TimeWindow; label: string; days: number | null }[] = [
  { id: '30d', label: 'the past 30 days', days: 30 },
  { id: '14d', label: 'the past 14 days', days: 14 },
  { id: '7d', label: 'the past 7 days', days: 7 },
  { id: 'all', label: 'all observed dates', days: null },
];

const LEVEL_META: Record<AnomalyLevel, { label: string; dotColor: string; pillBg: string; pillTextVar: string }> = {
  extreme_low: {
    label: 'Extreme low',
    dotColor: '#0284c7',
    pillBg: 'rgba(2, 132, 199, 0.14)',
    pillTextVar: 'var(--ah-lvl-extreme-low)',
  },
  low: {
    label: 'Low',
    dotColor: '#06b6d4',
    pillBg: 'rgba(6, 182, 212, 0.15)',
    pillTextVar: 'var(--ah-lvl-low)',
  },
  normal: {
    label: 'Normal',
    dotColor: 'var(--ah-dot-normal)',
    pillBg: 'rgba(59, 130, 246, 0.14)',
    pillTextVar: 'var(--ah-lvl-normal)',
  },
  high: {
    label: 'High',
    dotColor: '#f97316',
    pillBg: 'rgba(249, 115, 22, 0.15)',
    pillTextVar: 'var(--ah-lvl-high)',
  },
  extreme_high: {
    label: 'Extreme high',
    dotColor: '#ef4444',
    pillBg: 'rgba(239, 68, 68, 0.15)',
    pillTextVar: 'var(--ah-lvl-extreme-high)',
  },
};

const SVG_WIDTH = 1000;
const SVG_HEIGHT = 188;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 180;
const PLOT_LEFT = 28;
const PLOT_RIGHT = 972;
const Y_TICKS = [100, 75, 50, 25, 0] as const;

interface PlotPoint extends AnomalyRecord {
  x: number;
  y: number;
  baselineY: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function yForBurnIndex(value: number): number {
  const normalized = clamp(value, 0, 100) / 100;
  return PLOT_BOTTOM - normalized * (PLOT_BOTTOM - PLOT_TOP);
}

function subtractDaysUTC(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateStr;
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function formatAxisDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.getUTCDate();
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  return `${day} ${month}`;
}

function formatTooltipDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.getUTCDate();
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const year = date.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * Compute Fritsch-Carlson monotone cubic Hermite spline segments so the curve
 * passes smoothly through every observation without overshooting [0, 100].
 * Edge lead-in / lead-out keep zero slope at the outer endpoints so the area
 * spans cleanly across the rounded card edges without extrapolating values.
 */
function buildSmoothSplinePaths(coords: { x: number; y: number }[]): { linePath: string; areaPath: string } {
  const n = coords.length;
  if (n === 0) return { linePath: '', areaPath: '' };

  if (n === 1) {
    const { y } = coords[0];
    const linePath = `M 0 ${y.toFixed(2)} L ${SVG_WIDTH} ${y.toFixed(2)}`;
    const areaPath = `M 0 ${SVG_HEIGHT} L 0 ${y.toFixed(2)} L ${SVG_WIDTH} ${y.toFixed(2)} L ${SVG_WIDTH} ${SVG_HEIGHT} Z`;
    return { linePath, areaPath };
  }

  const dx: number[] = new Array(n - 1);
  const slopes: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = Math.max(1e-6, coords[i + 1].x - coords[i].x);
    slopes[i] = (coords[i + 1].y - coords[i].y) / dx[i];
  }

  const tangents: number[] = new Array(n).fill(0);
  tangents[0] = slopes[0] * 0.45;
  tangents[n - 1] = slopes[n - 2] * 0.45;
  for (let i = 1; i < n - 1; i++) {
    const mPrev = slopes[i - 1];
    const mNext = slopes[i];
    if (mPrev * mNext <= 0) {
      tangents[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangents[i] = (w1 + w2) / (w1 / mPrev + w2 / mNext);
    }
  }

  // Clamp tangents using Fritsch-Carlson monotonicity condition
  for (let i = 0; i < n - 1; i++) {
    const m = slopes[i];
    if (Math.abs(m) < 1e-9) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const alpha = tangents[i] / m;
    const beta = tangents[i + 1] / m;
    const ratioSq = alpha * alpha + beta * beta;
    if (ratioSq > 9) {
      const tau = 3 / Math.sqrt(ratioSq);
      tangents[i] = tau * alpha * m;
      tangents[i + 1] = tau * beta * m;
    }
  }

  const leftSpan = Math.max(1, coords[0].x);
  const leftEdgeY = clamp(coords[0].y - tangents[0] * leftSpan * 0.45, PLOT_TOP, PLOT_BOTTOM);
  const leftCp1x = leftSpan * 0.35;
  const leftCp2x = coords[0].x - leftSpan * 0.35;
  const leftCp2y = clamp(coords[0].y - tangents[0] * leftSpan * 0.35, PLOT_TOP, PLOT_BOTTOM);

  const segments: string[] = [
    `M 0 ${leftEdgeY.toFixed(2)}`,
    `C ${leftCp1x.toFixed(2)} ${leftEdgeY.toFixed(2)}, ${leftCp2x.toFixed(2)} ${leftCp2y.toFixed(2)}, ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`,
  ];
  for (let i = 0; i < n - 1; i++) {
    const p0 = coords[i];
    const p1 = coords[i + 1];
    const step = dx[i] / 3;
    const cp1x = p0.x + step;
    const cp1y = clamp(p0.y + tangents[i] * step, PLOT_TOP, PLOT_BOTTOM);
    const cp2x = p1.x - step;
    const cp2y = clamp(p1.y - tangents[i + 1] * step, PLOT_TOP, PLOT_BOTTOM);
    segments.push(
      `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    );
  }
  const last = coords[n - 1];
  const rightSpan = Math.max(1, SVG_WIDTH - last.x);
  const rightEdgeY = clamp(last.y + tangents[n - 1] * rightSpan * 0.45, PLOT_TOP, PLOT_BOTTOM);
  const rightCp1x = last.x + rightSpan * 0.35;
  const rightCp1y = clamp(last.y + tangents[n - 1] * rightSpan * 0.35, PLOT_TOP, PLOT_BOTTOM);
  const rightCp2x = SVG_WIDTH - rightSpan * 0.35;
  segments.push(
    `C ${rightCp1x.toFixed(2)} ${rightCp1y.toFixed(2)}, ${rightCp2x.toFixed(2)} ${rightEdgeY.toFixed(2)}, ${SVG_WIDTH} ${rightEdgeY.toFixed(2)}`,
  );

  const linePath = segments.join(' ');
  const areaPath = `M 0 ${SVG_HEIGHT} L 0 ${leftEdgeY.toFixed(2)} ${segments.slice(1).join(' ')} L ${SVG_WIDTH} ${SVG_HEIGHT} Z`;
  return { linePath, areaPath };
}

interface AnomalyHistoryChartProps {
  records: AnomalyRecord[];
  totalCount?: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  h3Cell: string;
}

export default function AnomalyHistoryChart({
  records,
  totalCount,
  loading,
  error,
  onRetry,
  h3Cell,
}: AnomalyHistoryChartProps) {
  const gradientId = useId();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const initializedCellRef = useRef<string | null>(null);

  const [selectedWindow, setSelectedWindow] = useState<TimeWindow>('30d');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showBaseline, setShowBaseline] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => a.acq_date.localeCompare(b.acq_date)),
    [records],
  );

  useEffect(() => {
    setHoveredIndex(null);
    setMenuOpen(false);
    initializedCellRef.current = null;
  }, [h3Cell]);

  useEffect(() => {
    if (sortedRecords.length === 0 || initializedCellRef.current === h3Cell) return;
    initializedCellRef.current = h3Cell;
    const latestDate = sortedRecords[sortedRecords.length - 1].acq_date;
    const cutoff30 = subtractDaysUTC(latestDate, 29);
    const countIn30d = sortedRecords.filter((r) => r.acq_date >= cutoff30).length;
    setSelectedWindow(sortedRecords.length >= 2 && countIn30d < 2 ? 'all' : '30d');
  }, [h3Cell, sortedRecords]);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const visibleRecords = useMemo(() => {
    if (sortedRecords.length === 0 || selectedWindow === 'all') return sortedRecords;
    const opt = WINDOW_OPTIONS.find((item) => item.id === selectedWindow);
    if (!opt?.days) return sortedRecords;
    const latestDate = sortedRecords[sortedRecords.length - 1].acq_date;
    const cutoff = subtractDaysUTC(latestDate, opt.days - 1);
    return sortedRecords.filter((record) => record.acq_date >= cutoff);
  }, [sortedRecords, selectedWindow]);

  const chartPoints = useMemo<PlotPoint[]>(() => {
    const n = visibleRecords.length;
    return visibleRecords.map((record, index) => {
      const x = n <= 1 ? SVG_WIDTH / 2 : PLOT_LEFT + (index / (n - 1)) * (PLOT_RIGHT - PLOT_LEFT);
      const y = yForBurnIndex(record.burn_index);
      const baselineY = record.daily_median == null ? null : yForBurnIndex(record.daily_median);
      return { ...record, x, y, baselineY };
    });
  }, [visibleRecords]);

  const { linePath, areaPath } = useMemo(
    () => buildSmoothSplinePaths(chartPoints.map((pt) => ({ x: pt.x, y: pt.y }))),
    [chartPoints],
  );

  const baselineLinePath = useMemo(() => {
    const baselineCoords = chartPoints
      .filter((pt): pt is PlotPoint & { baselineY: number } => pt.baselineY !== null)
      .map((pt) => ({ x: pt.x, y: pt.baselineY }));
    if (baselineCoords.length === 0) return '';
    return buildSmoothSplinePaths(baselineCoords).linePath;
  }, [chartPoints]);

  const meanWindowBurnIndex = useMemo(() => {
    if (chartPoints.length === 0) return 0;
    const sum = chartPoints.reduce((acc, pt) => acc + pt.burn_index, 0);
    return sum / chartPoints.length;
  }, [chartPoints]);

  const outlierCount = useMemo(
    () => chartPoints.filter((pt) => pt.anomaly_level !== 'normal').length,
    [chartPoints],
  );

  const xAxisLabels = useMemo(() => {
    const n = chartPoints.length;
    if (n === 0) return [];
    if (n === 1) {
      return [{ key: 'single', label: formatAxisDate(chartPoints[0].acq_date), leftPct: 50 }];
    }
    const targetTicks = Math.min(5, n);
    const indices = new Set<number>();
    for (let i = 0; i < targetTicks; i++) {
      indices.add(Math.round((i * (n - 1)) / (targetTicks - 1)));
    }
    return [...indices].map((idx) => ({
      key: `${chartPoints[idx].acq_date}-${idx}`,
      label: formatAxisDate(chartPoints[idx].acq_date),
      leftPct: (chartPoints[idx].x / SVG_WIDTH) * 100,
    }));
  }, [chartPoints]);

  const activePoint = hoveredIndex !== null && hoveredIndex < chartPoints.length ? chartPoints[hoveredIndex] : null;
  const headlineValue = activePoint ? activePoint.burn_index : meanWindowBurnIndex;
  const activeWindowLabel = WINDOW_OPTIONS.find((item) => item.id === selectedWindow)?.label ?? 'the past 30 days';

  // Keep node markers cleanly spaced when many dates are displayed
  const nodeSizeClasses = chartPoints.length <= 24
    ? { outer: 'w-3 h-3', inner: 'w-[4px] h-[4px]' }
    : chartPoints.length <= 40
    ? { outer: 'w-2.5 h-2.5', inner: 'w-[3.5px] h-[3.5px]' }
    : { outer: 'w-2 h-2', inner: 'w-[3px] h-[3px]' };

  return (
    <section className="anomaly-history-panel p-5 sm:p-6">
      {/* Top Header: "View of burn index the past 30 days ▾" */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="relative flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[15px] sm:text-base" ref={menuRef}>
          <span className="anomaly-history-heading-prefix">View of burn index</span>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            className="anomaly-history-window-btn inline-flex items-center gap-1.5 font-semibold rounded-full px-3 py-0.5 -mx-1 transition-colors"
          >
            <span>{activeWindowLabel}</span>
            <span
              aria-hidden="true"
              className={`inline-block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-current opacity-55 transition-transform ${
                menuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {menuOpen && (
            <div
              role="listbox"
              aria-label="Anomaly history timeframe"
              className="anomaly-history-menu absolute left-0 top-full mt-1.5 z-30 min-w-[196px] p-1.5 rounded-2xl shadow-lg space-y-0.5"
            >
              {WINDOW_OPTIONS.map((option) => {
                const isSelected = option.id === selectedWindow;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      setSelectedWindow(option.id);
                      setHoveredIndex(null);
                      setMenuOpen(false);
                    }}
                    className={`anomaly-history-menu-item w-full text-left px-3 py-1.5 rounded-full text-xs flex items-center justify-between transition-colors ${
                      isSelected ? 'is-selected font-semibold' : ''
                    }`}
                  >
                    <span>{option.label}</span>
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#2563eb] dark:bg-[#60a5fa]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <span className="anomaly-history-kicker text-[10px] font-semibold tracking-widest uppercase">
          Anomaly History
        </span>
      </div>

      {loading ? (
        <div className="anomaly-history-card p-6 text-center">
          <p role="status" className="text-xs font-medium anomaly-history-kicker">
            Loading anomaly history...
          </p>
        </div>
      ) : error ? (
        <div role="alert" className="anomaly-history-card p-5 flex items-center justify-between gap-3 text-xs">
          <span className="anomaly-history-heading-prefix">Anomaly history unavailable.</span>
          <button
            type="button"
            onClick={onRetry}
            className="anomaly-history-retry-btn rounded-full px-4 py-1.5 text-xs font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      ) : chartPoints.length === 0 ? (
        <div className="anomaly-history-card p-6 text-center">
          <p className="text-xs anomaly-history-heading-prefix">
            No observation history is available for this cell.
          </p>
        </div>
      ) : (
        <>
          {/* Main Chart Row: Y-Axis Ticks Left + Floating White Chart Card */}
          <div className="flex items-stretch gap-2 sm:gap-3">
            {/* Left Y-Axis Gutter */}
            <div className="w-7 sm:w-8 shrink-0 flex flex-col select-none" aria-hidden="true">
              <div className="h-[68px]" />
              <div className="relative h-[188px]">
                {Y_TICKS.map((tick) => (
                  <span
                    key={tick}
                    style={{ top: `${(yForBurnIndex(tick) / SVG_HEIGHT) * 100}%` }}
                    className="anomaly-history-axis-tick absolute right-0 -translate-y-1/2 text-[11px] font-bold tabular-nums leading-none"
                  >
                    {tick}
                  </span>
                ))}
              </div>
            </div>

            {/* Right Column: Card + X-Axis Labels */}
            <div className="flex-1 min-w-0">
              {/* Elevated White Card */}
              <div className="anomaly-history-card relative">
                {/* Inner Top Metric Header */}
                <div className="h-[68px] px-5 sm:px-6 pt-4 pb-1 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="anomaly-history-metric text-[30px] sm:text-[34px] leading-none font-medium tracking-tight tabular-nums">
                      {headlineValue.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowBaseline((prev) => !prev)}
                      aria-pressed={showBaseline}
                      title={showBaseline ? 'Hide daily median baseline' : 'Show daily median baseline'}
                      aria-label={showBaseline ? 'Hide daily median baseline' : 'Show daily median baseline'}
                      className={`anomaly-history-eye-btn p-1.5 rounded-full transition-colors ${
                        showBaseline ? 'is-active' : ''
                      }`}
                    >
                      <Eye size={17} strokeWidth={1.9} />
                    </button>
                  </div>

                  <div className="text-right pt-1 hidden sm:block">
                    {activePoint ? (() => {
                      const activeMeta = LEVEL_META[activePoint.anomaly_level] ?? LEVEL_META.normal;
                      return (
                        <span className="anomaly-history-subbadge inline-flex items-center gap-1.5 text-[11px] font-medium">
                          <span>{formatTooltipDate(activePoint.acq_date)}</span>
                          <span>·</span>
                          <span style={{ color: activeMeta.pillTextVar }} className="font-semibold">
                            {activeMeta.label}
                          </span>
                        </span>
                      );
                    })() : (
                      <span className="anomaly-history-subbadge text-[11px] font-medium">
                        Mean burn index · {chartPoints.length} {chartPoints.length === 1 ? 'observation' : 'observations'}
                        {outlierCount > 0 ? ` · ${outlierCount} ${outlierCount === 1 ? 'outlier' : 'outliers'}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Plot Surface */}
                <div
                  className="relative h-[188px] w-full select-none"
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Clipped SVG Curve + Area Layer */}
                  <div className="absolute inset-0 rounded-b-[18px] overflow-hidden pointer-events-none">
                    <svg
                      viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                      preserveAspectRatio="none"
                      className="w-full h-full block"
                      role="img"
                      aria-label="Selected H3 cell Burn Index history smooth area chart"
                    >
                      <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" style={{ stopColor: 'var(--ah-grad-top)', stopOpacity: 'var(--ah-grad-top-opacity)' }} />
                          <stop offset="55%" style={{ stopColor: 'var(--ah-grad-mid)', stopOpacity: 'var(--ah-grad-mid-opacity)' }} />
                          <stop offset="100%" style={{ stopColor: 'var(--ah-grad-bot)', stopOpacity: 'var(--ah-grad-bot-opacity)' }} />
                        </linearGradient>
                      </defs>

                      {/* Faint Horizontal Gridlines */}
                      {Y_TICKS.map((tick) => {
                        const y = yForBurnIndex(tick);
                        return (
                          <line
                            key={tick}
                            x1="0"
                            x2={SVG_WIDTH}
                            y1={y}
                            y2={y}
                            style={{ stroke: 'var(--ah-grid)', opacity: tick === 0 ? 0.55 : 1 }}
                            strokeWidth="1"
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      })}

                      {/* Hover Vertical Hairline */}
                      {activePoint && (
                        <line
                          x1={activePoint.x}
                          x2={activePoint.x}
                          y1={PLOT_TOP}
                          y2={SVG_HEIGHT}
                          style={{ stroke: 'var(--ah-guide)' }}
                          strokeWidth="1"
                          strokeDasharray="3 3"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}

                      {/* Soft Blue Gradient Area */}
                      {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

                      {/* Optional Daily Median Baseline Overlay (Toggled by Eye Icon) */}
                      {showBaseline && baselineLinePath && (
                        <path
                          d={baselineLinePath}
                          fill="none"
                          style={{ stroke: 'var(--ah-baseline)' }}
                          strokeWidth="1.5"
                          strokeDasharray="5 4"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}

                      {/* Smooth Spline Stroke */}
                      {linePath && (
                        <path
                          d={linePath}
                          fill="none"
                          style={{ stroke: 'var(--ah-stroke)' }}
                          strokeWidth="2.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </svg>
                  </div>

                  {/* Interactive Perfect-Circle White Node Markers */}
                  {chartPoints.map((point, index) => {
                    const leftPct = (point.x / SVG_WIDTH) * 100;
                    const topPct = (point.y / SVG_HEIGHT) * 100;
                    const isActive = hoveredIndex === index;
                    const levelMeta = LEVEL_META[point.anomaly_level] ?? LEVEL_META.normal;

                    return (
                      <button
                        key={`${point.acq_date}-${index}`}
                        type="button"
                        onMouseEnter={() => setHoveredIndex(index)}
                        onFocus={() => setHoveredIndex(index)}
                        onBlur={() => setHoveredIndex((curr) => (curr === index ? null : curr))}
                        aria-label={`${formatTooltipDate(point.acq_date)}: Burn Index ${point.burn_index.toFixed(2)}, ${levelMeta.label}`}
                        style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                        className="group absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full focus:outline-none z-10 cursor-pointer"
                      >
                        <span
                          className={`anomaly-history-node ${nodeSizeClasses.outer} rounded-full flex items-center justify-center transition-transform duration-150 ${
                            isActive ? 'scale-125' : 'group-hover:scale-125'
                          }`}
                          style={
                            isActive
                              ? { boxShadow: `0 0 0 4px ${levelMeta.pillBg}, var(--ah-node-shadow)` }
                              : undefined
                          }
                        >
                          <span
                            className={`${nodeSizeClasses.inner} rounded-full block`}
                            style={{ backgroundColor: levelMeta.dotColor }}
                          />
                        </span>
                      </button>
                    );
                  })}

                  {/* Floating Tooltip */}
                  {activePoint && (() => {
                    const leftPct = (activePoint.x / SVG_WIDTH) * 100;
                    const topPct = (activePoint.y / SVG_HEIGHT) * 100;
                    const levelMeta = LEVEL_META[activePoint.anomaly_level] ?? LEVEL_META.normal;
                    const horizClass =
                      leftPct < 18
                        ? 'translate-x-0'
                        : leftPct > 82
                        ? '-translate-x-full'
                        : '-translate-x-1/2';
                    const placeBelow = topPct < 42;

                    return (
                      <div
                        role="status"
                        style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                        className={`anomaly-history-tooltip pointer-events-none absolute z-20 ${horizClass} ${
                          placeBelow ? 'mt-4' : '-translate-y-full -mt-4'
                        } min-w-[168px] rounded-xl px-3 py-2 text-[11px] shadow-lg`}
                      >
                        <div className="anomaly-history-tooltip-header flex items-center justify-between gap-2 pb-1 mb-1">
                          <span className="font-semibold">{formatTooltipDate(activePoint.acq_date)}</span>
                          <span
                            className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide"
                            style={{ backgroundColor: levelMeta.pillBg, color: levelMeta.pillTextVar }}
                          >
                            {levelMeta.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="anomaly-history-tooltip-muted">Burn Index</span>
                          <span className="font-bold tabular-nums">{activePoint.burn_index.toFixed(2)}</span>
                        </div>
                        {activePoint.daily_median !== null && (
                          <div className="flex items-center justify-between gap-3 mt-0.5">
                            <span className="anomaly-history-tooltip-muted">Daily Median</span>
                            <span className="font-medium tabular-nums">{activePoint.daily_median.toFixed(2)}</span>
                          </div>
                        )}
                        {activePoint.robust_z_score !== null && (
                          <div className="flex items-center justify-between gap-3 mt-0.5">
                            <span className="anomaly-history-tooltip-muted">Robust Z</span>
                            <span className="font-medium tabular-nums">
                              {activePoint.robust_z_score >= 0 ? '+' : ''}
                              {activePoint.robust_z_score.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* X-Axis Uppercase Date Ticks Directly Below White Card */}
              <div className="relative h-5 mt-3 select-none">
                {xAxisLabels.map((tick) => {
                  const alignClass =
                    tick.leftPct < 6
                      ? 'translate-x-0'
                      : tick.leftPct > 94
                      ? '-translate-x-full'
                      : '-translate-x-1/2';
                  return (
                    <span
                      key={tick.key}
                      style={{ left: `${tick.leftPct}%` }}
                      className={`anomaly-history-axis-tick absolute top-0 ${alignClass} text-[10px] sm:text-[11px] font-bold tracking-wider uppercase whitespace-nowrap`}
                    >
                      {tick.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Subtle Metadata & Severity Legend Footer */}
          <div className="anomaly-history-footer mt-3 pt-2.5 flex flex-wrap items-center justify-between gap-2 text-[10px]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {(Object.keys(LEVEL_META) as AnomalyLevel[]).map((level) => (
                <span key={level} className="anomaly-history-legend-item inline-flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: LEVEL_META[level].dotColor }}
                  />
                  <span>{LEVEL_META[level].label}</span>
                </span>
              ))}
              {showBaseline && (
                <span className="anomaly-history-legend-item inline-flex items-center gap-1.5">
                  <svg width="14" height="2" viewBox="0 0 14 2" aria-hidden="true">
                    <line x1="0" y1="1" x2="14" y2="1" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
                  </svg>
                  <span>Daily median</span>
                </span>
              )}
            </div>
            <span className="anomaly-history-kicker tabular-nums">
              {chartPoints.length} of {formatCount(totalCount ?? records.length)} records · Burn Index 0–100
            </span>
          </div>
        </>
      )}
    </section>
  );
}
