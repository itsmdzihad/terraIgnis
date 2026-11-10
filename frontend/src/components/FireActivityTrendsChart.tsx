import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CalendarDay } from '../types/calendar';

type TrendWindow = '30d' | '14d' | '7d' | 'all';
type TrendMetric = 'fire_count' | 'mean_burn_index' | 'anomaly_count';

const WINDOW_OPTIONS: { id: TrendWindow; label: string; days: number | null }[] = [
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '14d', label: 'Last 14 days', days: 14 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: 'all', label: 'All observed', days: null },
];

const METRIC_OPTIONS: { id: TrendMetric; label: string }[] = [
  { id: 'fire_count', label: 'Detections' },
  { id: 'mean_burn_index', label: 'Burn Index' },
  { id: 'anomaly_count', label: 'Anomalies' },
];

const SVG_WIDTH = 400;
const SVG_HEIGHT = 120;
const PLOT_TOP = 7;
const PLOT_BOTTOM = 113;

interface ChartPoint {
  date: string;
  value: number;
  x: number;
  y: number;
}

function subtractDaysUTC(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateStr;
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function formatAxisDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function formatCalloutDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatTickValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) {
    const k = value / 1_000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatMetricValue(value: number, metric: TrendMetric): string {
  if (metric === 'mean_burn_index') return value.toFixed(1);
  return Math.round(value).toLocaleString('en-US');
}

function computeNiceYAxis(maxValue: number): { maxY: number; ticks: number[] } {
  const safeMax = Math.max(4, maxValue);
  const rawStep = safeMax / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;

  let niceFraction = 1;
  if (residual <= 1) niceFraction = 1;
  else if (residual <= 1.5) niceFraction = 1.5;
  else if (residual <= 2) niceFraction = 2;
  else if (residual <= 2.5) niceFraction = 2.5;
  else if (residual <= 5) niceFraction = 5;
  else niceFraction = 10;

  const step = niceFraction * magnitude;
  const maxY = step * 4;
  // Ordered top-to-bottom for flex-col justify-between
  const ticks = [maxY, step * 3, step * 2, step, 0];
  return { maxY, ticks };
}

interface FireActivityTrendsChartProps {
  days: CalendarDay[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedDate?: string | null;
  onSelectDate?: (date: string) => void;
}

export default function FireActivityTrendsChart({
  days,
  loading,
  error,
  onRetry,
  selectedDate,
  onSelectDate,
}: FireActivityTrendsChartProps) {
  const gradientId = useId();
  const windowMenuRef = useRef<HTMLDivElement | null>(null);
  const metricMenuRef = useRef<HTMLDivElement | null>(null);

  const [selectedWindow, setSelectedWindow] = useState<TrendWindow>('30d');
  const [selectedMetric, setSelectedMetric] = useState<TrendMetric>('fire_count');
  const [windowMenuOpen, setWindowMenuOpen] = useState(false);
  const [metricMenuOpen, setMetricMenuOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!windowMenuOpen && !metricMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (windowMenuRef.current && !windowMenuRef.current.contains(target)) {
        setWindowMenuOpen(false);
      }
      if (metricMenuRef.current && !metricMenuRef.current.contains(target)) {
        setMetricMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setWindowMenuOpen(false);
        setMetricMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [windowMenuOpen, metricMenuOpen]);

  const sortedDays = useMemo(
    () => [...days].sort((a, b) => a.date.localeCompare(b.date)),
    [days],
  );

  const windowedDays = useMemo(() => {
    if (sortedDays.length === 0) return [];
    const opt = WINDOW_OPTIONS.find((item) => item.id === selectedWindow);
    if (!opt || opt.days === null) return sortedDays;
    const latestDate = sortedDays[sortedDays.length - 1].date;
    const cutoff = subtractDaysUTC(latestDate, opt.days - 1);
    const filtered = sortedDays.filter((day) => day.date >= cutoff);
    return filtered.length >= 2 ? filtered : sortedDays;
  }, [sortedDays, selectedWindow]);

  const metricValues = useMemo(
    () =>
      windowedDays.map((day) => {
        if (selectedMetric === 'fire_count') return day.fire_count;
        if (selectedMetric === 'anomaly_count') return day.anomaly_count;
        return day.mean_burn_index ?? 0;
      }),
    [windowedDays, selectedMetric],
  );

  const periodMean = useMemo(() => {
    if (metricValues.length === 0) return 0;
    return metricValues.reduce((sum, val) => sum + val, 0) / metricValues.length;
  }, [metricValues]);

  const { maxY, ticks } = useMemo(() => {
    const rawMax = metricValues.length > 0 ? Math.max(...metricValues) : 40;
    return computeNiceYAxis(rawMax);
  }, [metricValues]);

  const chartPoints = useMemo<ChartPoint[]>(() => {
    const n = windowedDays.length;
    if (n === 0) return [];
    const plotH = PLOT_BOTTOM - PLOT_TOP;

    return windowedDays.map((day, idx) => {
      const value = metricValues[idx];
      const x = n === 1 ? SVG_WIDTH / 2 : (idx / (n - 1)) * SVG_WIDTH;
      const ratio = Math.max(0, Math.min(1, value / maxY));
      const y = PLOT_BOTTOM - ratio * plotH;
      return { date: day.date, value, x, y };
    });
  }, [windowedDays, metricValues, maxY]);

  const { linePath, areaPath } = useMemo(() => {
    if (chartPoints.length === 0) return { linePath: '', areaPath: '' };
    if (chartPoints.length === 1) {
      const p = chartPoints[0];
      return {
        linePath: `M 0 ${p.y.toFixed(2)} L ${SVG_WIDTH} ${p.y.toFixed(2)}`,
        areaPath: `M 0 ${PLOT_BOTTOM} L 0 ${p.y.toFixed(2)} L ${SVG_WIDTH} ${p.y.toFixed(2)} L ${SVG_WIDTH} ${PLOT_BOTTOM} Z`,
      };
    }

    const lineCmds = chartPoints.map(
      (pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`,
    );
    const first = chartPoints[0];
    const last = chartPoints[chartPoints.length - 1];
    const lineStr = lineCmds.join(' ');
    const areaStr = `M ${first.x.toFixed(2)} ${PLOT_BOTTOM} ${lineStr} L ${last.x.toFixed(2)} ${PLOT_BOTTOM} Z`;
    return { linePath: lineStr, areaPath: areaStr };
  }, [chartPoints]);

  const xAxisLabels = useMemo(() => {
    const n = chartPoints.length;
    if (n === 0) return [];
    if (n <= 5) {
      return chartPoints.map((pt) => formatAxisDate(pt.date));
    }
    const tickCount = 5;
    const indices = Array.from({ length: tickCount }, (_, i) =>
      Math.round((i / (tickCount - 1)) * (n - 1)),
    );
    const unique = [...new Set(indices)];
    return unique.map((idx) => formatAxisDate(chartPoints[idx].date));
  }, [chartPoints]);

  const defaultIndex = useMemo(() => {
    if (chartPoints.length === 0) return null;
    if (selectedDate) {
      const matched = chartPoints.findIndex((pt) => pt.date === selectedDate);
      if (matched !== -1) return matched;
    }
    return Math.min(chartPoints.length - 1, Math.max(0, Math.round((chartPoints.length - 1) * 0.72)));
  }, [chartPoints, selectedDate]);

  const activeIndex =
    hoveredIndex !== null && hoveredIndex < chartPoints.length ? hoveredIndex : defaultIndex;
  const activePoint = activeIndex !== null ? chartPoints[activeIndex] : null;

  const activeDelta = useMemo(() => {
    if (!activePoint || periodMean <= 0) return { label: '0.0%', positive: true };
    const pct = ((activePoint.value - periodMean) / periodMean) * 100;
    const sign = pct >= 0 ? '+' : '';
    return {
      label: `${sign}${pct.toFixed(1)}%`,
      positive: pct >= 0,
    };
  }, [activePoint, periodMean]);

  const activeMetricLabel =
    METRIC_OPTIONS.find((item) => item.id === selectedMetric)?.label ?? 'Detections';
  const activeWindowLabel =
    WINDOW_OPTIONS.find((item) => item.id === selectedWindow)?.label ?? 'Last 30 days';

  const handlePlotMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (chartPoints.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((event.clientX - rect.left) / rect.width) * SVG_WIDTH;
    let nearestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < chartPoints.length; i++) {
      const dist = Math.abs(chartPoints[i].x - svgX);
      if (dist < bestDist) {
        bestDist = dist;
        nearestIdx = i;
      }
    }
    setHoveredIndex(nearestIdx);
  };

  const markerPosition = useMemo(() => {
    if (!activePoint) return null;
    const xPct = (activePoint.x / SVG_WIDTH) * 100;
    const yPct = (activePoint.y / SVG_HEIGHT) * 100;
    const placeRight = xPct < 42;
    const topPct = Math.max(4, Math.min(48, yPct - 18));

    return {
      xPct,
      yPct,
      calloutStyle: placeRight
        ? { left: `${Math.min(58, xPct + 3.5)}%`, top: `${topPct}%` }
        : { right: `${Math.min(58, 100 - xPct + 3.5)}%`, top: `${topPct}%` },
    };
  }, [activePoint]);

  return (
    <div className="dataplay-card p-4 sm:p-5 flex-1 min-h-[215px] sm:min-h-[235px] flex flex-col justify-between">
      {/* Header Row matching reference: Title on left | • Metric + Timeframe v on right */}
      <div className="relative z-30 flex items-center justify-between gap-2 mb-3 shrink-0">
        <span className="text-base font-semibold glass-heading tracking-tight">
          Fire Activity Trends
        </span>

        <div className="flex items-center gap-2 text-[13px]">
          {/* Metric Switcher */}
          <div ref={metricMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setMetricMenuOpen((open) => !open);
                setWindowMenuOpen(false);
              }}
              aria-expanded={metricMenuOpen}
              aria-haspopup="listbox"
              title="Switch charted metric"
              className="inline-flex items-center gap-1.5 glass-muted hover:text-[var(--ink-strong)] hover:bg-[var(--glass-track-bg)] transition-colors py-0.5 px-2 rounded-full"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#E85002] shrink-0" />
              <span className="font-medium">{activeMetricLabel}</span>
            </button>

            {metricMenuOpen && (
              <div
                role="listbox"
                aria-label="Trend metric"
                className="glass-panel-strong absolute right-0 mt-1.5 w-36 rounded-2xl p-1 z-30"
              >
                {METRIC_OPTIONS.map((opt) => {
                  const isSelected = selectedMetric === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setSelectedMetric(opt.id);
                        setMetricMenuOpen(false);
                        setHoveredIndex(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-full text-[11px] flex items-center gap-2 transition-colors ${
                        isSelected
                          ? 'glass-heading font-semibold bg-[var(--glass-track-bg)]'
                          : 'glass-muted font-medium hover:text-[var(--ink-strong)] hover:bg-[var(--glass-track-bg)]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isSelected ? 'bg-[#E85002]' : 'bg-transparent'
                        }`}
                      />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeframe Dropdown */}
          <div ref={windowMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setWindowMenuOpen((open) => !open);
                setMetricMenuOpen(false);
              }}
              aria-expanded={windowMenuOpen}
              aria-haspopup="listbox"
              className="inline-flex items-center gap-1 glass-muted hover:text-[var(--ink-strong)] hover:bg-[var(--glass-track-bg)] font-medium transition-colors py-0.5 px-2 rounded-full"
            >
              <span>{activeWindowLabel}</span>
              <ChevronDown size={13} className="opacity-70" />
            </button>

            {windowMenuOpen && (
              <div
                role="listbox"
                aria-label="Trend timeframe"
                className="glass-panel-strong absolute right-0 mt-1.5 w-36 rounded-2xl p-1 z-30"
              >
                {WINDOW_OPTIONS.map((opt) => {
                  const isSelected = selectedWindow === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setSelectedWindow(opt.id);
                        setWindowMenuOpen(false);
                        setHoveredIndex(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-full text-[11px] transition-colors ${
                        isSelected
                          ? 'glass-heading font-semibold bg-[var(--glass-track-bg)]'
                          : 'glass-muted font-medium hover:text-[var(--ink-strong)] hover:bg-[var(--glass-track-bg)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart Body */}
      <div className="flex-1 min-h-[145px] flex flex-col">
        {loading && chartPoints.length === 0 ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-xs glass-muted">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-[#E85002] border-t-transparent animate-spin" />
            <span>Loading activity trends...</span>
          </div>
        ) : error && chartPoints.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p className="text-xs tone-rose mb-1.5">Trends unavailable</p>
            <button
              type="button"
              onClick={onRetry}
              className="glass-btn px-3 py-1 text-[11px] font-semibold rounded-full"
            >
              Retry
            </button>
          </div>
        ) : chartPoints.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs glass-muted">
            No daily activity in selected window.
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-[auto_1fr] grid-rows-[1fr_auto] gap-x-3 gap-y-2">
            {/* Col 1, Row 1: Crisp HTML Y-axis ticks */}
            <div className="flex flex-col justify-between items-end text-[11px] glass-subtle tabular-nums select-none py-[2px] min-w-[26px]">
              {ticks.map((tick) => (
                <span key={tick} className="leading-none">
                  {formatTickValue(tick)}
                </span>
              ))}
            </div>

            {/* Col 2, Row 1: Interactive Plot Box */}
            <div
              className="relative min-w-0 min-h-0 cursor-crosshair select-none"
              onMouseMove={handlePlotMouseMove}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => {
                if (activePoint && onSelectDate) {
                  onSelectDate(activePoint.date);
                }
              }}
            >
              <svg
                className="w-full h-full block overflow-visible"
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient
                    id={gradientId}
                    gradientUnits="userSpaceOnUse"
                    x1="0"
                    y1={PLOT_TOP}
                    x2="0"
                    y2={PLOT_BOTTOM}
                  >
                    <stop offset="0%" stopColor="#F16001" stopOpacity="0.26" />
                    <stop offset="60%" stopColor="#C10801" stopOpacity="0.09" />
                    <stop offset="100%" stopColor="#D9C3AB" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Soft Gradient Area Fill */}
                {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

                {/* Crisp Branding Orange Trend Line */}
                {linePath && (
                  <path
                    d={linePath}
                    fill="none"
                    stroke="#E85002"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {/* Vertical Guide Drop Line */}
                {activePoint && (
                  <line
                    x1={activePoint.x}
                    y1={activePoint.y}
                    x2={activePoint.x}
                    y2={PLOT_BOTTOM}
                    stroke="#E85002"
                    strokeWidth="1.25"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>

              {/* Solid Circular Active Marker Dot matching reference */}
              {markerPosition && (
                <span
                  aria-hidden="true"
                  style={{
                    left: `${markerPosition.xPct}%`,
                    top: `${markerPosition.yPct}%`,
                  }}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[#E85002] shadow-xs z-10"
                />
              )}

              {/* Floating Callout Pill matching reference picture */}
              {activePoint && markerPosition && (
                <div
                  style={markerPosition.calloutStyle}
                  className="pointer-events-none absolute z-20 rounded-2xl px-3.5 py-2 bg-[#F9F9F9]/80 dark:bg-[#191919]/80 border border-[#A7A7A7]/30 dark:border-[#646464]/35 backdrop-blur-md shadow-[0_4px_14px_-4px_rgba(0,0,0,0.12)] dark:shadow-[0_6px_18px_-4px_rgba(0,0,0,0.55)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold leading-none tracking-tight glass-heading tabular-nums">
                      {formatMetricValue(activePoint.value, selectedMetric)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums leading-none ${
                        activeDelta.positive
                          ? 'bg-[#E85002]/14 text-[#E85002] dark:bg-[#E85002]/24 dark:text-[#F16001]'
                          : 'bg-[#646464]/14 text-[#646464] dark:bg-[#A7A7A7]/18 dark:text-[#D9C3AB]'
                      }`}
                    >
                      {activeDelta.label}
                    </span>
                  </div>
                  <span className="block text-[11px] font-medium glass-subtle mt-1 whitespace-nowrap">
                    {formatCalloutDate(activePoint.date)}
                  </span>
                </div>
              )}
            </div>

            {/* Col 1, Row 2: Spacer matching Y-axis column */}
            <div aria-hidden="true" />

            {/* Col 2, Row 2: Crisp HTML X-axis Labels aligned under plot box */}
            <div className="flex items-center justify-between text-[11px] glass-subtle tabular-nums select-none">
              {xAxisLabels.map((label, idx) => (
                <span key={`${label}-${idx}`} className="leading-none">
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
