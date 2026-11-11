import React, { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import {
  ChevronDown,
  X,
  FileText,
  Download,
  AlertTriangle,
  MoreHorizontal,
  Maximize2,
  Minimize2,
  Pencil,
  Info,
  Flame,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useCalendar } from "../hooks/useCalendar";
import { useAnomalies } from "../hooks/useAnomalies";
import { useStats } from "../hooks/useStats";
import type { CalendarDay } from "../types/calendar";
import { useDashboard } from "../context/DashboardContext";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const PAGE_SIZE = 366;

const LAYOUT_SPRING = {
  type: "spring" as const,
  stiffness: 260,
  damping: 28,
  mass: 0.9,
};

// 5 Intensity levels backed by CSS custom properties (matching reference image in light mode + dark mode support)
const COLOR_LEVEL_VARS = [
  { bg: "var(--cal-l0)", name: "Zero detections" },
  { bg: "var(--cal-l1)", name: "Low activity" },
  { bg: "var(--cal-l2)", name: "Moderate activity" },
  { bg: "var(--cal-l3)", name: "High activity" },
  { bg: "var(--cal-l4)", name: "Peak activity" },
];

interface CalendarCell {
  date: string;
  observation: CalendarDay | null;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  weekIndex: number;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  return `${MONTH_NAMES[monthIdx]} ${day}`;
}

function formatFullDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function FireActivityCalendar() {
  const {
    selectedDate,
    calendarYear,
    setSelectedDate,
    setSelectedYear,
  } = useDashboard();

  const selectedYear = calendarYear;
  const { data: coverageStats } = useStats();
  const yearOptions = useMemo(() => {
    const dataStartYear = coverageStats?.coverage.start_date
      ? Number(coverageStats.coverage.start_date.slice(0, 4))
      : selectedYear;
    const dataEndYear = coverageStats?.coverage.end_date
      ? Number(coverageStats.coverage.end_date.slice(0, 4))
      : selectedYear;
    const firstYear = Math.min(dataStartYear, selectedYear);
    const lastYear = Math.max(dataEndYear, selectedYear);

    return Array.from(
      { length: lastYear - firstYear + 1 },
      (_, index) => lastYear - index
    );
  }, [coverageStats, selectedYear]);

  // UI state controls
  const [metricMode, setMetricMode] = useState<"fire_count" | "burn_index">("fire_count");
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
  const [isCardEditOpen, setIsCardEditOpen] = useState(false);
  const [isCardMoreOpen, setIsCardMoreOpen] = useState(false);
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<CalendarCell | null>(null);
  const [hoveredRadarKey, setHoveredRadarKey] = useState<string | null>(null);
  const [isMethodologyOpen, setIsMethodologyOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const yearPickerRef = useRef<HTMLDivElement>(null);
  const calendarActionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (isYearDropdownOpen && !yearPickerRef.current?.contains(target)) {
        setIsYearDropdownOpen(false);
      }
      if (
        (isCardEditOpen || isCardMoreOpen) &&
        !calendarActionsRef.current?.contains(target)
      ) {
        setIsCardEditOpen(false);
        setIsCardMoreOpen(false);
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [isYearDropdownOpen, isCardEditOpen, isCardMoreOpen]);

  // API Hooks - Strictly real backend telemetry, NO mock data
  const { data, loading, error, refetch } = useCalendar({
    start_date: `${selectedYear}-01-01`,
    end_date: `${selectedYear}-12-31`,
    limit: PAGE_SIZE,
    offset: 0,
  });

  const {
    data: anomalyData,
    loading: anomalyLoading,
    error: anomalyError,
    refetch: refetchAnomalies,
  } = useAnomalies({
    start_date: `${selectedYear}-01-01`,
    end_date: `${selectedYear}-12-31`,
  });

  const observationsByDate = useMemo(
    () => new Map((data?.data ?? []).map((day) => [day.date, day])),
    [data]
  );

  // Build the 53 weeks x 7 days grid (0=Sun, 1=Mon, ..., 6=Sat)
  const calendarWeeks = useMemo(() => {
    const weeks: (CalendarCell | null)[][] = [];
    const firstDate = new Date(selectedYear, 0, 1);
    let week: (CalendarCell | null)[] = Array.from(
      { length: firstDate.getDay() },
      () => null
    );
    const cursor = new Date(firstDate);
    let weekIdx = 0;

    while (cursor.getFullYear() === selectedYear) {
      const date = formatLocalDate(cursor);
      const dayOfWeek = cursor.getDay();
      week.push({
        date,
        observation: observationsByDate.get(date) ?? null,
        dayOfWeek,
        weekIndex: weekIdx,
      });

      if (week.length === 7) {
        weeks.push(week);
        week = [];
        weekIdx++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (week.length) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }, [observationsByDate, selectedYear]);

  // Center each Month label cleanly over its span of week columns
  const monthLabels = useMemo(() => {
    const list: { month: string; centerPct: number }[] = [];
    const totalWeeks = Math.max(1, calendarWeeks.length);
    for (let m = 0; m < 12; m++) {
      const monthPrefix = `${selectedYear}-${String(m + 1).padStart(2, "0")}-`;
      let firstCol = -1;
      let lastCol = -1;
      for (let w = 0; w < calendarWeeks.length; w++) {
        const hasMonthDay = calendarWeeks[w].some(
          (cell) => cell && cell.date.startsWith(monthPrefix)
        );
        if (hasMonthDay) {
          if (firstCol === -1) firstCol = w;
          lastCol = w;
        }
      }
      if (firstCol >= 0) {
        const centerPct = ((firstCol + lastCol + 1) / (2 * totalWeeks)) * 100;
        list.push({ month: MONTH_NAMES[m], centerPct });
      }
    }
    return list;
  }, [calendarWeeks, selectedYear]);

  // Flattened valid days for statistics
  const allDays = useMemo(() => {
    const list: CalendarCell[] = [];
    for (const week of calendarWeeks) {
      for (const cell of week) {
        if (cell) list.push(cell);
      }
    }
    return list;
  }, [calendarWeeks]);

  // Max value calculation for intensity scaling
  const maxDayValue = useMemo(() => {
    let max = 1;
    for (const cell of allDays) {
      const val =
        metricMode === "fire_count"
          ? cell.observation?.fire_count ?? 0
          : cell.observation?.mean_burn_index ?? 0;
      if (val > max) max = val;
    }
    return max;
  }, [allDays, metricMode]);

  // Map value to 0..4 intensity levels
  const getLevel = (cell: CalendarCell | null): number => {
    if (!cell || !cell.observation) return 0;
    const val =
      metricMode === "fire_count"
        ? cell.observation.fire_count
        : cell.observation.mean_burn_index ?? 0;
    if (val <= 0) return 0;
    const ratio = val / maxDayValue;
    if (ratio > 0.75) return 4;
    if (ratio > 0.45) return 3;
    if (ratio > 0.2) return 2;
    return 1;
  };

  // Real data statistics
  const stats = useMemo(() => {
    let total = 0;
    let busiestDay: { date: string; value: number } = { date: "", value: 0 };
    let longestStreak = 0;
    let activeDaysCount = 0;
    let tempStreak = 0;

    for (let i = 0; i < allDays.length; i++) {
      const cell = allDays[i];
      const val =
        metricMode === "fire_count"
          ? cell.observation?.fire_count ?? 0
          : Math.round(cell.observation?.mean_burn_index ?? 0);

      total += val;

      if (val > busiestDay.value) {
        busiestDay = { date: cell.date, value: val };
      }

      if (val > 0) {
        activeDaysCount++;
        tempStreak++;
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak;
        }
      } else {
        tempStreak = 0;
      }
    }

    const totalDays = allDays.length || 365;
    const activePercentage = Math.round((activeDaysCount / totalDays) * 100);

    return {
      total,
      busiestDay,
      longestStreak,
      activeDaysCount,
      totalDays,
      activePercentage,
    };
  }, [allDays, metricMode]);

  // 6-Axis Burn Anomaly Radar Metrics strictly from real backend data
  const radarMetrics = useMemo(() => {
    const calendarDays = data?.data ?? [];
    const anomalies = anomalyData ?? [];

    const activePct = Math.min(
      100,
      Math.round((stats.activeDaysCount / Math.max(1, stats.totalDays)) * 100)
    );

    const outlierDaysCount = calendarDays.filter((d) => d.anomaly_count > 0).length;
    const outlierDaysPct =
      stats.activeDaysCount > 0
        ? Math.min(100, Math.round((outlierDaysCount / stats.activeDaysCount) * 100))
        : 0;

    const highSevereCount = anomalies.filter(
      (a) => a.anomaly_level === "high" || a.anomaly_level === "extreme_high"
    ).length;
    const highSeverityPct =
      anomalies.length > 0
        ? Math.min(100, Math.round((highSevereCount / anomalies.length) * 100))
        : 0;

    const validPercentiles = anomalies
      .map((a) => a.anomaly_percentile)
      .filter((p): p is number => p !== null);
    const meanPercentilePct =
      validPercentiles.length > 0
        ? Math.min(
            100,
            Math.round(
              (validPercentiles.reduce((sum, p) => sum + p, 0) / validPercentiles.length) * 100
            )
          )
        : 0;

    const validMeanBurns = calendarDays
      .map((d) => d.mean_burn_index)
      .filter((b): b is number => b !== null);
    const avgMeanBurn =
      validMeanBurns.length > 0
        ? validMeanBurns.reduce((sum, b) => sum + b, 0) / validMeanBurns.length
        : 0;
    const meanBurnPct = Math.min(100, Math.round(avgMeanBurn));

    const maxBurnObserved = calendarDays.reduce(
      (max, d) => Math.max(max, d.max_burn_index ?? 0),
      0
    );
    const peakBurnPct = Math.min(100, Math.round(maxBurnObserved));

    return [
      {
        key: "active_days",
        label: "Active Days",
        value: activePct,
        detail: `${stats.activeDaysCount} of ${stats.totalDays} days`,
      },
      {
        key: "outlier_days",
        label: "Outlier Days",
        value: outlierDaysPct,
        detail: `${outlierDaysCount} anomalous active days`,
      },
      {
        key: "high_severity",
        label: "High Severity",
        value: highSeverityPct,
        detail: `${highSevereCount} of ${anomalies.length} outliers`,
      },
      {
        key: "mean_percentile",
        label: "Percentile",
        value: meanPercentilePct,
        detail: `${validPercentiles.length} scored anomalies`,
      },
      {
        key: "mean_burn",
        label: "Mean Burn",
        value: meanBurnPct,
        detail: `Avg index ${avgMeanBurn.toFixed(1)}`,
      },
      {
        key: "peak_burn",
        label: "Peak Burn",
        value: peakBurnPct,
        detail: `Max index ${maxBurnObserved.toFixed(1)}`,
      },
    ];
  }, [data, anomalyData, stats.activeDaysCount, stats.totalDays]);

  const anomalySummaryText = useMemo(() => {
    const totalAnomalies = anomalyData?.length ?? 0;
    const outlierDaysCount = (data?.data ?? []).filter((d) => d.anomaly_count > 0).length;
    const highCount = (anomalyData ?? []).filter(
      (a) => a.anomaly_level === "high" || a.anomaly_level === "extreme_high"
    ).length;
    const meanBurnItem = radarMetrics.find((m) => m.key === "mean_burn");

    if (totalAnomalies === 0) {
      return `Across ${stats.activeDaysCount} active fire days in ${selectedYear}, zero statistical outliers crossed the anomaly threshold (${meanBurnItem?.detail ?? "no burn index"}).`;
    }
    return `Across ${stats.activeDaysCount} active fire days in ${selectedYear}, ${totalAnomalies.toLocaleString()} burn anomalies occurred over ${outlierDaysCount} days, with ${highCount.toLocaleString()} classified as high or extreme severity.`;
  }, [anomalyData, data, stats.activeDaysCount, selectedYear, radarMetrics]);

  // 4 Multi-Horizon Anomaly & Outlier Telemetry Cards strictly from real backend data (/api/anomalies + /api/calendar)
  const outlierCards = useMemo(() => {
    const anomalies = anomalyData ?? [];
    const totalAnomalies = anomalies.length;
    const observedDays = [...(data?.data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    const totalObservedAnomalies = observedDays.reduce((s, d) => s + d.anomaly_count, 0);
    const effectiveTotalAnomalies = totalAnomalies > 0 ? totalAnomalies : totalObservedAnomalies;
    const totalObservedFires = observedDays.reduce((s, d) => s + d.fire_count, 0);

    const getDayMetricVal = (day: CalendarDay): number => {
      if (effectiveTotalAnomalies === 0) {
        return metricMode === "fire_count" ? day.fire_count : Math.round(day.mean_burn_index ?? 0);
      }
      return metricMode === "fire_count"
        ? day.anomaly_count
        : day.anomaly_count > 0
        ? Math.round(day.max_burn_index ?? day.mean_burn_index ?? 0)
        : 0;
    };

    const bucketIntoColumns = <T,>(
      items: T[],
      compute: (slice: T[]) => {
        label: string;
        detail: string;
        value: number;
        targetDate?: string;
      }
    ) => {
      if (items.length === 0) {
        return Array.from({ length: 12 }, () => ({
          label: "",
          detail: "No observation",
          value: 0,
          targetDate: undefined,
        }));
      }
      const bucketCount = Math.min(12, items.length);
      const cols: { label: string; detail: string; value: number; targetDate?: string }[] = [];
      for (let b = 0; b < bucketCount; b++) {
        const start = Math.floor((b * items.length) / bucketCount);
        const end = Math.max(start + 1, Math.floor(((b + 1) * items.length) / bucketCount));
        cols.push(compute(items.slice(start, end)));
      }
      while (cols.length < 12) {
        cols.push({
          label: "",
          detail: "No observation",
          value: 0,
          targetDate: undefined,
        });
      }
      return cols;
    };

    const toDotColumns = (
      series: { label: string; detail: string; value: number; targetDate?: string }[]
    ): DotColumn[] => {
      const maxVal = Math.max(0, ...series.map((s) => s.value));
      return series.map((s) => ({
        label: s.label,
        detail: s.detail,
        value: s.value,
        targetDate: s.targetDate,
        active: s.value > 0,
        dots:
          s.value <= 0 || maxVal <= 0
            ? 1
            : Math.max(2, Math.min(6, Math.round(1 + (s.value / maxVal) * 5))),
      }));
    };

    // Card 1: High & Extreme Outliers strictly from /api/anomalies grouped by real acq_date
    const highExtremeAnomalies = anomalies.filter(
      (a) => a.anomaly_level === "high" || a.anomaly_level === "extreme_high"
    );
    const byAnomDate = new Map<
      string,
      { date: string; highCount: number; totalCount: number; peakBurn: number; maxAbsZ: number }
    >();
    for (const a of anomalies) {
      const entry = byAnomDate.get(a.acq_date) ?? {
        date: a.acq_date,
        highCount: 0,
        totalCount: 0,
        peakBurn: 0,
        maxAbsZ: 0,
      };
      if (a.anomaly_level === "high" || a.anomaly_level === "extreme_high") {
        entry.highCount += 1;
      }
      entry.totalCount += 1;
      entry.peakBurn = Math.max(entry.peakBurn, a.burn_index);
      if (a.robust_z_score !== null) {
        entry.maxAbsZ = Math.max(entry.maxAbsZ, Math.abs(a.robust_z_score));
      }
      byAnomDate.set(a.acq_date, entry);
    }
    const sortedAnomDates = [...byAnomDate.values()].sort((a, b) => a.date.localeCompare(b.date));

    const peakPositiveAnom = [...anomalies]
      .sort((a, b) => {
        const aZ = a.robust_z_score ?? -Infinity;
        const bZ = b.robust_z_score ?? -Infinity;
        if (bZ !== aZ) return bZ - aZ;
        return b.burn_index - a.burn_index;
      })[0] ?? null;

    const card1Date = peakPositiveAnom?.acq_date || stats.busiestDay.date;
    const card1Pct =
      totalAnomalies > 0
        ? ((highExtremeAnomalies.length / totalAnomalies) * 100).toFixed(2)
        : "0.00";
    const card1Positive =
      totalAnomalies > 0 ? highExtremeAnomalies.length >= totalAnomalies / 2 : false;
    const card1Sub = peakPositiveAnom
      ? `${highExtremeAnomalies.length.toLocaleString()}/${totalAnomalies.toLocaleString()} high · ${
          peakPositiveAnom.robust_z_score !== null
            ? `Z ${peakPositiveAnom.robust_z_score > 0 ? "+" : ""}${peakPositiveAnom.robust_z_score.toFixed(2)}`
            : `Burn ${peakPositiveAnom.burn_index.toFixed(1)}`
        } (${formatDisplayDate(peakPositiveAnom.acq_date)})`
      : `No outlier records in ${selectedYear}`;

    const card1Series = bucketIntoColumns(sortedAnomDates, (slice) => {
      const highSum = slice.reduce((s, x) => s + x.highCount, 0);
      const totalSum = slice.reduce((s, x) => s + x.totalCount, 0);
      const peakItem = slice.reduce((best, cur) =>
        cur.highCount >= best.highCount ? cur : best
      );
      const rangeLabel =
        slice.length === 1
          ? formatDisplayDate(slice[0].date)
          : `${formatDisplayDate(slice[0].date)}–${formatDisplayDate(slice[slice.length - 1].date)}`;
      const val =
        metricMode === "fire_count"
          ? highSum
          : Math.round(Math.max(...slice.map((x) => x.peakBurn)));
      return {
        label: rangeLabel,
        detail:
          metricMode === "fire_count"
            ? `${rangeLabel} · ${highSum} high/ext (${totalSum} total)`
            : `${rangeLabel} · Peak burn ${val}`,
        value: val,
        targetDate: peakItem.date,
      };
    });

    // Card 2: Peak 7-Day Outlier Burst strictly across consecutive observed dates from /api/calendar
    let bestWeekStart = 0;
    let bestWeekMetric = -1;
    let bestWeekAnomSum = 0;
    const windowSize = Math.min(7, Math.max(1, observedDays.length));
    for (let i = 0; i <= Math.max(0, observedDays.length - windowSize); i++) {
      let metricSum = 0;
      let anomSum = 0;
      for (let j = 0; j < windowSize && i + j < observedDays.length; j++) {
        metricSum += getDayMetricVal(observedDays[i + j]);
        anomSum += observedDays[i + j].anomaly_count;
      }
      if (metricSum > bestWeekMetric) {
        bestWeekMetric = metricSum;
        bestWeekStart = i;
        bestWeekAnomSum = anomSum;
      }
    }

    let peakBurstDay: CalendarDay | null = observedDays[bestWeekStart] ?? null;
    for (let j = 0; j < windowSize && bestWeekStart + j < observedDays.length; j++) {
      const cur = observedDays[bestWeekStart + j];
      if (!peakBurstDay || getDayMetricVal(cur) > getDayMetricVal(peakBurstDay)) {
        peakBurstDay = cur;
      }
    }

    const c2Start =
      observedDays.length <= 12
        ? 0
        : Math.max(0, Math.min(observedDays.length - 12, bestWeekStart - 3));
    const card2RawSlice = observedDays.slice(c2Start, c2Start + 12);
    const card2Series = Array.from({ length: 12 }, (_, i) => {
      const day = card2RawSlice[i];
      if (!day) {
        return { label: "", detail: "No observation", value: 0, targetDate: undefined };
      }
      const val = getDayMetricVal(day);
      const disp = formatDisplayDate(day.date);
      return {
        label: disp,
        detail:
          metricMode === "fire_count"
            ? `${disp} · ${day.anomaly_count} outliers (${day.fire_count} fires)`
            : `${disp} · Max burn ${(day.max_burn_index ?? 0).toFixed(1)} (${day.anomaly_count} outliers)`,
        value: val,
        targetDate: day.date,
      };
    });

    const card2Pct =
      effectiveTotalAnomalies > 0
        ? ((bestWeekAnomSum / effectiveTotalAnomalies) * 100).toFixed(2)
        : "0.00";
    const card2Positive = bestWeekAnomSum > 0;
    const card2Sub = peakBurstDay
      ? `${bestWeekAnomSum.toLocaleString()} outliers · Peak ${formatDisplayDate(
          peakBurstDay.date
        )} (${peakBurstDay.anomaly_count})`
      : `No burst windows in ${selectedYear}`;

    // Card 3: Peak Month (real month in /api/calendar with highest anomaly burden)
    const monthTotals = MONTH_NAMES.map((name, mIdx) => {
      const prefix = `${selectedYear}-${String(mIdx + 1).padStart(2, "0")}-`;
      const days = observedDays.filter((d) => d.date.startsWith(prefix));
      let anom = 0;
      let fireSum = 0;
      let peakDay: CalendarDay | null = null;
      for (const d of days) {
        anom += d.anomaly_count;
        fireSum += d.fire_count;
        if (!peakDay || getDayMetricVal(d) > getDayMetricVal(peakDay)) {
          peakDay = d;
        }
      }
      return { name, mIdx, days, anom, fireSum, peakDate: peakDay?.date ?? "" };
    });

    const bestMonth = monthTotals.reduce(
      (best, cur) =>
        cur.anom !== best.anom
          ? cur.anom > best.anom
            ? cur
            : best
          : cur.fireSum > best.fireSum
          ? cur
          : best,
      monthTotals[0]
    );

    const card3Series = bucketIntoColumns(bestMonth.days, (slice) => {
      const anomSum = slice.reduce((s, d) => s + d.anomaly_count, 0);
      const fireSum = slice.reduce((s, d) => s + d.fire_count, 0);
      const peakDay = slice.reduce((best, cur) =>
        getDayMetricVal(cur) >= getDayMetricVal(best) ? cur : best
      );
      const rangeLabel =
        slice.length === 1
          ? formatDisplayDate(slice[0].date)
          : `${formatDisplayDate(slice[0].date)}–${formatDisplayDate(slice[slice.length - 1].date)}`;
      const val =
        effectiveTotalAnomalies > 0
          ? metricMode === "fire_count"
            ? anomSum
            : Math.round(Math.max(...slice.map((d) => (d.anomaly_count > 0 ? d.max_burn_index ?? 0 : 0))))
          : fireSum;
      return {
        label: rangeLabel,
        detail: `${rangeLabel} · ${anomSum} outliers (${fireSum.toLocaleString()} fires)`,
        value: val,
        targetDate: peakDay.date,
      };
    });

    const card3Pct =
      effectiveTotalAnomalies > 0
        ? ((bestMonth.anom / effectiveTotalAnomalies) * 100).toFixed(2)
        : "0.00";
    const card3Positive = bestMonth.anom > 0;
    const card3Sub =
      bestMonth.days.length > 0
        ? `${bestMonth.name} · ${bestMonth.anom.toLocaleString()} outliers (${bestMonth.fireSum.toLocaleString()} fires)`
        : `No monthly outliers in ${selectedYear}`;

    // Card 4: Outlier Detection Rate across full observed backend timeline (/api/calendar)
    const peakRateDay =
      observedDays.length > 0
        ? observedDays.reduce((best, cur) => {
            const curRate = cur.anomaly_count / Math.max(1, cur.fire_count);
            const bestRate = best.anomaly_count / Math.max(1, best.fire_count);
            return curRate > bestRate ? cur : best;
          }, observedDays[0])
        : null;

    const card4Pct =
      totalObservedFires > 0
        ? ((effectiveTotalAnomalies / totalObservedFires) * 100).toFixed(2)
        : "0.00";
    const card4Positive = effectiveTotalAnomalies > 0;
    const card4Sub = `${effectiveTotalAnomalies.toLocaleString()} outliers · ${totalObservedFires.toLocaleString()} detections`;

    const card4Series = bucketIntoColumns(observedDays, (slice) => {
      const anomSum = slice.reduce((s, d) => s + d.anomaly_count, 0);
      const fireSum = slice.reduce((s, d) => s + d.fire_count, 0);
      const ratePct = fireSum > 0 ? (anomSum / fireSum) * 100 : 0;
      const peakSliceDay = slice.reduce((best, cur) =>
        cur.anomaly_count >= best.anomaly_count ? cur : best
      );
      const rangeLabel =
        slice.length === 1
          ? formatDisplayDate(slice[0].date)
          : `${formatDisplayDate(slice[0].date)}–${formatDisplayDate(slice[slice.length - 1].date)}`;
      const val =
        metricMode === "fire_count"
          ? Number(ratePct.toFixed(2))
          : Math.round(
              slice.reduce((s, d) => s + (d.mean_burn_index ?? 0), 0) / Math.max(1, slice.length)
            );
      return {
        label: rangeLabel,
        detail:
          metricMode === "fire_count"
            ? `${rangeLabel} · ${ratePct.toFixed(2)}% (${anomSum}/${fireSum.toLocaleString()})`
            : `${rangeLabel} · Mean burn ${val} (${anomSum} outliers)`,
        value: val,
        targetDate: peakSliceDay.date,
      };
    });

    return [
      {
        id: "high-outliers",
        title: "High & Extreme Outliers",
        pct: card1Pct,
        sub: card1Sub,
        isPositive: card1Positive,
        hasData: totalAnomalies > 0,
        dotColor: "var(--dot-purple)",
        targetDate: card1Date,
        columns: toDotColumns(card1Series),
      },
      {
        id: "peak-burst",
        title: "Peak 7-Day Burst",
        pct: card2Pct,
        sub: card2Sub,
        isPositive: card2Positive,
        hasData: bestWeekAnomSum > 0,
        dotColor: "var(--dot-blue)",
        targetDate: peakBurstDay?.date ?? "",
        columns: toDotColumns(card2Series),
      },
      {
        id: "peak-month",
        title: `Peak Month (${bestMonth.name})`,
        pct: card3Pct,
        sub: card3Sub,
        isPositive: card3Positive,
        hasData: bestMonth.anom > 0,
        dotColor: "var(--dot-green)",
        targetDate: bestMonth.peakDate,
        columns: toDotColumns(card3Series),
      },
      {
        id: "outlier-rate",
        title: `Outlier Rate (${selectedYear})`,
        pct: card4Pct,
        sub: card4Sub,
        isPositive: card4Positive,
        hasData: effectiveTotalAnomalies > 0,
        dotColor: "var(--dot-amber)",
        targetDate: peakRateDay?.date ?? stats.busiestDay.date,
        columns: toDotColumns(card4Series),
      },
    ];
  }, [anomalyData, data, metricMode, selectedYear, stats.busiestDay.date]);

  // Detail cell for hovered / selected telemetry strip
  const activeDetailCell = useMemo(() => {
    if (hoveredCell) return hoveredCell;
    if (selectedDate) {
      const match = allDays.find((c) => c.date === selectedDate);
      if (match) return match;
      const obs = observationsByDate.get(selectedDate);
      if (obs) {
        return {
          date: selectedDate,
          observation: obs,
          dayOfWeek: new Date(selectedDate).getDay(),
          weekIndex: 0,
        };
      }
    }
    return null;
  }, [hoveredCell, selectedDate, allDays, observationsByDate]);

  // Client-side GeoJSON and CSV Exports
  const handleExportGeoJSON = () => {
    const calendarDays = data?.data ?? [];
    if (calendarDays.length === 0) {
      setExportStatus("No calendar data to export for this year.");
      return;
    }
    setExportStatus("Compiling GeoJSON point vectors...");
    setTimeout(() => {
      const geoJson = {
        type: "FeatureCollection",
        metadata: {
          generated: new Date().toISOString(),
          dataset: "TerraIgnis Daily Fire Activity",
          year: selectedYear,
          total_records: calendarDays.length,
        },
        features: calendarDays.map((day) => ({
          type: "Feature",
          properties: {
            date: day.date,
            fire_count: day.fire_count,
            mean_burn_index: day.mean_burn_index,
            max_burn_index: day.max_burn_index,
            anomaly_count: day.anomaly_count,
          },
          geometry: null,
        })),
      };

      const blob = new Blob([JSON.stringify(geoJson, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `terraignis_fire_activity_${selectedYear}.geojson`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setExportStatus(`Exported ${calendarDays.length} records to GeoJSON.`);
    }, 400);
  };

  const handleExportCSV = () => {
    const calendarDays = data?.data ?? [];
    if (calendarDays.length === 0) {
      setExportStatus("No calendar data to export for this year.");
      return;
    }
    setExportStatus("Formatting CSV table...");
    setTimeout(() => {
      let csvContent = "Date,Fire_Count,Mean_Burn_Index,Max_Burn_Index,Anomaly_Count\n";
      calendarDays.forEach((day) => {
        csvContent += `${day.date},${day.fire_count},${day.mean_burn_index ?? ""},${day.max_burn_index ?? ""},${day.anomaly_count}\n`;
      });

      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `terraignis_activity_daily_${selectedYear}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setExportStatus(`Exported CSV successfully (${calendarDays.length} rows).`);
    }, 300);
  };

  // 6-Axis Radar SVG Geometry
  const radarGeometry = useMemo(() => {
    const cx = 200;
    const cy = 134;
    const maxR = 84;
    const points = radarMetrics.map((metric, idx) => {
      const angle = -Math.PI / 2 + (idx * Math.PI) / 3;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const valRadius = (metric.value / 100) * maxR;
      const labelRadius = maxR + 18;
      let textAnchor: "middle" | "start" | "end" = "middle";
      if (cos > 0.2) textAnchor = "start";
      else if (cos < -0.2) textAnchor = "end";
      const labelYOffset = Math.abs(sin) < 0.2 ? 4 : sin > 0 ? 10 : -2;

      return {
        ...metric,
        spokeX: cx + maxR * cos,
        spokeY: cy + maxR * sin,
        vx: cx + valRadius * cos,
        vy: cy + valRadius * sin,
        lx: cx + labelRadius * cos,
        ly: cy + labelRadius * sin + labelYOffset,
        textAnchor,
      };
    });

    const polygonPoints = points.map((p) => `${p.vx.toFixed(1)},${p.vy.toFixed(1)}`).join(" ");
    return { cx, cy, maxR, points, polygonPoints };
  }, [radarMetrics]);

  const tileHeightClass = `${
    isCalendarExpanded ? "h-[32px]" : "h-[24px] sm:h-[26px]"
  } transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]`;

  const yearAndMetricControls = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Statistic Year Pill Dropdown */}
      <div className="relative" ref={yearPickerRef}>
        <button
          type="button"
          onClick={() => setIsYearDropdownOpen(!isYearDropdownOpen)}
          className="activity-surface-control flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
        >
          <span className="activity-on-accent w-4 h-4 rounded-full bg-[#4f46e5] flex items-center justify-center text-[10px] font-bold">
            Σ
          </span>
          <span className="activity-muted font-normal">Year</span>
          <span className="font-bold">{selectedYear}</span>
          <ChevronDown size={13} className="activity-muted" />
        </button>

        {isYearDropdownOpen && (
          <div className="activity-surface-popover absolute left-0 mt-2 w-44 rounded-3xl p-2 z-30 space-y-1">
            {yearOptions.map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => {
                  setSelectedYear(yr);
                  setIsYearDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selectedYear === yr
                    ? "bg-indigo-500/20 font-bold"
                    : "activity-muted hover:bg-indigo-500/10"
                }`}
                style={selectedYear === yr ? { color: "var(--cal-accent)" } : undefined}
              >
                {yr}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Segmented Switcher: Fire Count | Burn Index */}
      <div className="activity-pill-track flex items-center p-1 rounded-full">
        <button
          type="button"
          onClick={() => setMetricMode("fire_count")}
          className={`px-3.5 py-1 rounded-full text-xs font-medium transition-all ${
            metricMode === "fire_count"
              ? "activity-pill-active font-semibold"
              : "activity-pill-inactive"
          }`}
        >
          Fire Count
        </button>
        <button
          type="button"
          onClick={() => setMetricMode("burn_index")}
          className={`px-3.5 py-1 rounded-full text-xs font-medium transition-all ${
            metricMode === "burn_index"
              ? "activity-pill-active font-semibold"
              : "activity-pill-inactive"
          }`}
        >
          Burn Index
        </button>
      </div>
    </div>
  );

  const outlierGrid = (
    <OutlierTelemetryGrid
      outlierCards={outlierCards}
      totalAnomalies={anomalyData?.length ?? 0}
      anomalyLoading={anomalyLoading && !anomalyData}
      anomalyError={anomalyError}
      onRetryAnomalies={refetchAnomalies}
      selectedDate={selectedDate}
      onSelectDate={setSelectedDate}
      className={
        isCalendarExpanded
          ? "order-3 lg:col-span-12"
          : "order-2 lg:order-none lg:col-start-1 lg:col-span-8 lg:row-start-2"
      }
    />
  );

  const radarChartBlock = (
    <div className="relative flex flex-col items-center justify-center my-1">
      <svg
        viewBox="0 0 400 265"
        className={`w-full h-auto overflow-visible select-none ${
          isCalendarExpanded ? "max-w-[440px] max-h-[290px]" : "max-h-[260px]"
        }`}
        onMouseLeave={() => setHoveredRadarKey(null)}
      >
        {/* 4 Concentric Shaded Target Rings (100%, 75%, 50%, 25%) */}
        <circle
          cx={radarGeometry.cx}
          cy={radarGeometry.cy}
          r={radarGeometry.maxR}
          fill="var(--radar-r4)"
        />
        <circle
          cx={radarGeometry.cx}
          cy={radarGeometry.cy}
          r={radarGeometry.maxR * 0.75}
          fill="var(--radar-r3)"
        />
        <circle
          cx={radarGeometry.cx}
          cy={radarGeometry.cy}
          r={radarGeometry.maxR * 0.5}
          fill="var(--radar-r2)"
        />
        <circle
          cx={radarGeometry.cx}
          cy={radarGeometry.cy}
          r={radarGeometry.maxR * 0.25}
          fill="var(--radar-r1)"
        />

        {/* 6 Radial Spoke Lines */}
        {radarGeometry.points.map((pt) => (
          <line
            key={`spoke-${pt.key}`}
            x1={radarGeometry.cx}
            y1={radarGeometry.cy}
            x2={pt.spokeX}
            y2={pt.spokeY}
            stroke="var(--radar-spoke)"
            strokeWidth="1"
          />
        ))}

        {/* Data Polygon */}
        <polygon
          points={radarGeometry.polygonPoints}
          fill="var(--radar-fill)"
          stroke="var(--radar-stroke)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Vertex Dots & Axis Labels */}
        {radarGeometry.points.map((pt) => {
          const isHovered = hoveredRadarKey === pt.key;
          return (
            <g
              key={`axis-${pt.key}`}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredRadarKey(pt.key)}
            >
              {isHovered && (
                <circle
                  cx={pt.vx}
                  cy={pt.vy}
                  r="7"
                  fill="var(--radar-stroke)"
                  fillOpacity="0.2"
                />
              )}
              <circle
                cx={pt.vx}
                cy={pt.vy}
                r={isHovered ? "4.5" : "3.2"}
                fill="var(--radar-stroke)"
              />
              <text
                x={pt.lx}
                y={pt.ly}
                textAnchor={pt.textAnchor}
                className={`activity-radar-label text-[11px] transition-colors ${
                  isHovered ? "is-active" : ""
                }`}
              >
                {pt.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Active Axis Detail Pill */}
      <div className="min-h-[22px] mt-1 flex items-center justify-center text-[11px]">
        {hoveredRadarKey ? (
          (() => {
            const active = radarMetrics.find((m) => m.key === hoveredRadarKey);
            if (!active) return null;
            return (
              <span className="activity-radar-pill px-3 py-0.5 rounded-full font-medium">
                {active.label}: <strong>{active.value}%</strong> · {active.detail}
              </span>
            );
          })()
        ) : (
          <span className="activity-muted text-[10px]">
            Hover any axis vertex to inspect metrics
          </span>
        )}
      </div>
    </div>
  );

  const burnAnomalyCard = (
    <motion.div
      layout="position"
      transition={LAYOUT_SPRING}
      className={`${
        isCalendarExpanded
          ? "order-2 lg:col-span-12"
          : "order-3 lg:order-none lg:col-start-9 lg:col-span-4 lg:row-start-1 justify-between"
      } activity-card p-6 sm:p-7 flex flex-col gap-4`}
    >
      <div className="flex items-center justify-between">
        <h3 className="activity-card-title text-base font-semibold">
          Burn Anomaly Ratio
        </h3>
        <button
          type="button"
          onClick={() => setIsMethodologyOpen(true)}
          className="glass-btn-ghost px-3 py-1 rounded-full text-xs font-medium flex items-center gap-0.5"
        >
          <span>Details</span>
          <span className="text-[10px]">›</span>
        </button>
      </div>

      <div
        className={
          isCalendarExpanded
            ? "grid grid-cols-1 lg:grid-cols-12 gap-6 items-center"
            : "flex flex-col gap-4"
        }
      >
        <div
          className={
            isCalendarExpanded
              ? "lg:col-span-7 lg:order-2 flex flex-col gap-4"
              : "order-1"
          }
        >
          <p
            className={`activity-muted leading-relaxed ${
              isCalendarExpanded ? "text-xs" : "text-[11px]"
            }`}
          >
            {anomalySummaryText}
          </p>

          {isCalendarExpanded && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
              onMouseLeave={() => setHoveredRadarKey(null)}
            >
              {radarMetrics.map((metric) => {
                const isActive = hoveredRadarKey === metric.key;
                return (
                  <div
                    key={metric.key}
                    onMouseEnter={() => setHoveredRadarKey(metric.key)}
                    className="rounded-2xl p-3.5 transition-all cursor-pointer"
                    style={{
                      backgroundColor: isActive ? "var(--radar-fill)" : "var(--glass-bg-soft)",
                      boxShadow: isActive ? "inset 0 0 0 1px var(--radar-stroke)" : "none",
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="activity-subtext text-xs font-semibold">
                        {metric.label}
                      </span>
                      <span
                        className="activity-card-title text-sm font-bold tabular-nums"
                        style={isActive ? { color: "var(--radar-stroke)" } : undefined}
                      >
                        {metric.value}%
                      </span>
                    </div>
                    <div
                      className="h-1.5 rounded-full overflow-hidden mt-2"
                      style={{ backgroundColor: "var(--glass-track-bg)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${metric.value}%`,
                          backgroundColor: "var(--radar-stroke)",
                        }}
                      />
                    </div>
                    <span className="activity-muted text-[11px] mt-1.5 block truncate">
                      {metric.detail}
                    </span>
                  </div>
                );
              })}
            </motion.div>
          )}
        </div>

        <motion.div
          layout="position"
          transition={LAYOUT_SPRING}
          className={isCalendarExpanded ? "lg:col-span-5 lg:order-1" : "order-2"}
        >
          {radarChartBlock}
        </motion.div>
      </div>

      {/* 4-Band Segmented Percentage Bar Legend (matching bottom-right reference) */}
      <motion.div
        layout="position"
        transition={LAYOUT_SPRING}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-2.5 glass-divider-t"
      >
        <div className="activity-muted text-[11px]">
          Streak:{" "}
          <strong className="activity-card-title">
            {stats.longestStreak}d
          </strong>{" "}
          · Records:{" "}
          <strong className="activity-card-title">
            {data?.data?.length ?? 0}
          </strong>
        </div>

        <div className="w-full sm:w-52 shrink-0">
          <div className="activity-muted grid grid-cols-4 text-[9.5px] font-medium mb-1">
            <span>0–25%</span>
            <span>25–50%</span>
            <span>50–75%</span>
            <span>75–100%</span>
          </div>
          <div className="grid grid-cols-4 h-2.5 rounded-xs overflow-hidden">
            <div style={{ backgroundColor: "var(--radar-leg-1)" }} />
            <div style={{ backgroundColor: "var(--radar-leg-2)" }} />
            <div style={{ backgroundColor: "var(--radar-leg-3)" }} />
            <div style={{ backgroundColor: "var(--radar-leg-4)" }} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  const activityArchiveCard = (
    <motion.div
      layout="position"
      transition={LAYOUT_SPRING}
      className={`${
        isCalendarExpanded
          ? "order-4 lg:col-span-12"
          : "order-4 lg:order-none lg:col-start-9 lg:col-span-4 lg:row-start-2 lg:self-start"
      } activity-archive-banner rounded-3xl p-6 sm:p-7 text-white flex flex-col justify-between relative overflow-hidden`}
    >
      <div className="absolute -right-8 -bottom-8 w-44 h-44 bg-white/10 rounded-full blur-2xl pointer-events-none" />

      <div
        className={`relative z-10 flex ${
          isCalendarExpanded
            ? "flex-col lg:flex-row lg:items-center lg:justify-between gap-6 lg:pr-14"
            : "flex-col justify-between"
        }`}
      >
        <motion.div
          layout="position"
          transition={LAYOUT_SPRING}
          className={`flex flex-col ${isCalendarExpanded ? "gap-2.5 max-w-2xl" : "gap-3"}`}
        >
          <div className="flex items-center gap-2">
            <div className="activity-on-accent w-6 h-6 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
              TI
            </div>
            <span className="font-semibold text-sm tracking-tight text-white">
              Activity Archive
            </span>
          </div>

          <h4 className="text-xl font-bold leading-tight text-white">
            Export annual fire activity data
          </h4>

          {isCalendarExpanded && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="text-xs leading-relaxed text-white/80"
            >
              Download daily aggregated fire detections, mean and peak burn index metrics,
              and statistical anomaly counts for {selectedYear}.{" "}
              <span className="text-white/95 font-medium">
                ({data?.total?.toLocaleString() ?? 0} observed calendar dates)
              </span>
            </motion.p>
          )}
        </motion.div>

        <motion.div
          layout="position"
          transition={LAYOUT_SPRING}
          className={
            isCalendarExpanded
              ? "flex flex-col lg:items-end gap-2.5 shrink-0"
              : "mt-6 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] flex flex-col gap-3"
          }
        >
          {!isCalendarExpanded && (
            <span className="text-xs font-medium text-white/90">
              {data?.total?.toLocaleString() ?? 0} observed calendar dates in {selectedYear}
            </span>
          )}

          <div
            className={
              isCalendarExpanded ? "flex flex-wrap items-center gap-2.5" : "grid grid-cols-2 gap-2.5"
            }
          >
            <button
              type="button"
              onClick={handleExportGeoJSON}
              className={`flex items-center justify-center gap-1.5 py-2.5 bg-white/18 hover:bg-white/28 backdrop-blur-md text-white rounded-full text-xs font-semibold transition-colors ${
                isCalendarExpanded ? "px-5" : "px-3"
              }`}
            >
              <FileText size={13} />
              <span>GeoJSON</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className={`activity-archive-csv-btn flex items-center justify-center gap-1.5 py-2.5 rounded-full text-xs font-semibold shadow-xs transition-colors ${
                isCalendarExpanded ? "px-5" : "px-3"
              }`}
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>
          </div>

          {exportStatus && (
            <span className="activity-on-accent text-[11px] opacity-90 truncate">
              ● {exportStatus}
            </span>
          )}
        </motion.div>
      </div>
    </motion.div>
  );

  return (
    <motion.div
      layoutScroll
      className="activity-dashboard flex flex-col w-full h-full min-h-0 p-3 sm:p-4 lg:p-5 gap-5 overflow-y-auto overscroll-contain"
    >
      {/* Loading or Error */}
      {loading ? (
        <div className="activity-card p-6 sm:p-8 flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5" style={{ color: "var(--cal-accent)" }} />
              <h1 className="activity-card-title text-lg font-bold tracking-tight">
                Daily Activity Center
              </h1>
            </div>
            {yearAndMetricControls}
          </div>
          <div className="py-10 text-center flex flex-col items-center justify-center">
            <div
              className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin mb-3"
              style={{ borderColor: "var(--cal-accent)", borderTopColor: "transparent" }}
            />
            <span
              className="text-xs font-semibold tracking-wide"
              style={{ color: "var(--cal-accent)" }}
            >
              Loading daily activity...
            </span>
          </div>
        </div>
      ) : error ? (
        <div className="activity-card p-6 sm:p-8 flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5" style={{ color: "var(--cal-accent)" }} />
              <h1 className="activity-card-title text-lg font-bold tracking-tight">
                Daily Activity Center
              </h1>
            </div>
            {yearAndMetricControls}
          </div>
          <div className="py-6 text-center">
            <AlertTriangle className="w-6 h-6 tone-rose mx-auto mb-2" />
            <span className="text-sm font-semibold tone-rose block">Unable to load daily activity</span>
            <button
              type="button"
              onClick={refetch}
              className="glass-btn-primary mt-3 px-5 py-1.5 text-xs font-semibold rounded-full"
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        /* MAIN DASHBOARD GRID */
        <LayoutGroup id="activity-dashboard-layout">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* ================= DAILY FIRE ACTIVITY CALENDAR CARD ================= */}
            <motion.div
              layout="position"
              transition={LAYOUT_SPRING}
              className={`${
                isCalendarExpanded
                  ? "order-1 lg:col-span-12"
                  : "order-1 lg:order-none lg:col-start-1 lg:col-span-8 lg:row-start-1"
              } activity-card p-6 sm:p-7 flex flex-col gap-6`}
            >
              {/* Top Row: Icon + Title + Info Icon on left | Moved Year/Metric Controls + Action Pill Toolbar on right */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5" style={{ color: "var(--cal-accent)" }} />
                  <h1 className="activity-card-title text-lg font-bold tracking-tight">
                    Daily Activity Center
                  </h1>
                  <button
                    type="button"
                    onClick={() => setIsMethodologyOpen(true)}
                    aria-label="Learn how fire activity is calculated"
                    className="glass-icon-btn p-1 rounded-full"
                  >
                    <Info size={14} />
                  </button>
                </div>

                <motion.div
                  layout="position"
                  transition={LAYOUT_SPRING}
                  className="flex flex-wrap items-center gap-2.5"
                >
                  {yearAndMetricControls}

                  {/* Top-Right Compact Segmented Action Toolbar [ Expand | Edit | More ] */}
                  <div className="relative flex items-center" ref={calendarActionsRef}>
                    <div className="activity-surface-control inline-flex items-center rounded-full px-1.5 py-1 gap-1">
                      <button
                        type="button"
                        onClick={() => setIsCalendarExpanded(!isCalendarExpanded)}
                        aria-label={isCalendarExpanded ? "Collapse card" : "Expand full width"}
                        title={isCalendarExpanded ? "Collapse card" : "Expand full width"}
                        className="activity-muted p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                      >
                        {isCalendarExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsCardEditOpen(!isCardEditOpen);
                          setIsCardMoreOpen(false);
                        }}
                        aria-label="Change year or metric"
                        title="Change year or metric"
                        className="activity-muted p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                      >
                        <Pencil size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsCardMoreOpen(!isCardMoreOpen);
                          setIsCardEditOpen(false);
                        }}
                        aria-label="More calendar options"
                        title="More calendar options"
                        className="activity-muted p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                      >
                        <MoreHorizontal size={15} />
                      </button>
                    </div>

                    {/* Edit Popover */}
                    {isCardEditOpen && (
                      <div className="activity-surface-popover absolute right-0 top-11 w-56 rounded-3xl p-4 z-30 space-y-3">
                        <div>
                          <span className="activity-muted text-[11px] font-semibold block mb-1.5">
                            Select Year
                          </span>
                          <div className="grid grid-cols-3 gap-1.5">
                            {yearOptions.map((yr) => (
                              <button
                                key={yr}
                                type="button"
                                onClick={() => {
                                  setSelectedYear(yr);
                                  setIsCardEditOpen(false);
                                }}
                                className={`text-xs py-1 rounded-full font-medium transition-colors ${
                                  selectedYear === yr
                                    ? "bg-indigo-500/20 font-bold"
                                    : "glass-btn-ghost"
                                }`}
                                style={selectedYear === yr ? { color: "var(--cal-accent)" } : undefined}
                              >
                                {yr}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="pt-2.5 glass-divider-t">
                          <span className="activity-muted text-[11px] font-semibold block mb-1.5">
                            Intensity Metric
                          </span>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setMetricMode("fire_count");
                                setIsCardEditOpen(false);
                              }}
                              className={`text-xs py-1.5 rounded-full font-medium transition-colors ${
                                metricMode === "fire_count"
                                  ? "bg-[#4f46e5] activity-on-accent"
                                  : "glass-btn-ghost"
                              }`}
                            >
                              Fire Count
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMetricMode("burn_index");
                                setIsCardEditOpen(false);
                              }}
                              className={`text-xs py-1.5 rounded-full font-medium transition-colors ${
                                metricMode === "burn_index"
                                  ? "bg-[#4f46e5] activity-on-accent"
                                  : "glass-btn-ghost"
                              }`}
                            >
                              Burn Index
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* More Popover */}
                    {isCardMoreOpen && (
                      <div className="activity-surface-popover absolute right-0 top-11 w-48 rounded-3xl p-2 z-30 text-xs space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            handleExportCSV();
                            setIsCardMoreOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-full hover:bg-indigo-500/15 activity-subtext font-medium flex items-center gap-2 transition-colors"
                        >
                          <Download size={13} />
                          <span>Download CSV</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleExportGeoJSON();
                            setIsCardMoreOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-full hover:bg-indigo-500/15 activity-subtext font-medium flex items-center gap-2 transition-colors"
                        >
                          <FileText size={13} />
                          <span>Download GeoJSON</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsMethodologyOpen(true);
                            setIsCardMoreOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-full hover:bg-indigo-500/15 activity-subtext font-medium flex items-center gap-2 transition-colors"
                        >
                          <Info size={13} />
                          <span>Methodology</span>
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Metrics Row & Legend: Total + Peak Single Day + Active Days on Left | Less [tiles] More on Right */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="flex flex-wrap items-baseline gap-8 sm:gap-12">
                  {/* Stat 1: Accent Purple-Indigo (#524ad3) */}
                  <div>
                    <span
                      className="text-3xl sm:text-[36px] font-bold tracking-tight leading-none block font-sans"
                      style={{ color: "var(--cal-accent)" }}
                    >
                      {stats.total.toLocaleString()}
                    </span>
                    <span className="activity-muted text-[13px] font-normal mt-2 block">
                      {metricMode === "fire_count"
                        ? "Detections in this year"
                        : "Burn points in this year"}
                    </span>
                  </div>

                  {/* Stat 2: Crisp High-Contrast Ink */}
                  <div>
                    <span className="activity-metric-val text-3xl sm:text-[36px] tracking-tight leading-none block font-sans">
                      {stats.busiestDay.value.toLocaleString()}
                    </span>
                    <span className="activity-muted text-[13px] font-normal mt-2 block">
                      Peak single day{" "}
                      {stats.busiestDay.date ? `(${formatDisplayDate(stats.busiestDay.date)})` : ""}
                    </span>
                  </div>

                  {/* Stat 3: Active Days (moved from removed top header bar) */}
                  <div>
                    <span className="activity-metric-val text-3xl sm:text-[36px] tracking-tight leading-none block font-sans tabular-nums">
                      {stats.activeDaysCount}
                    </span>
                    <span className="activity-muted text-[13px] font-normal mt-2 block">
                      Active days in {selectedYear}
                    </span>
                  </div>
                </div>

                {/* Tight Rounded Legend Strip matching reference picture: Less [ ▮ ▮ ▮ ▮ ▮ ] More */}
                <motion.div
                  layout="position"
                  transition={LAYOUT_SPRING}
                  className="activity-subtext flex items-center gap-2 text-xs font-semibold select-none self-end sm:self-auto pb-0.5"
                >
                  <span>Less</span>
                  <div className="flex items-center gap-[3.5px]">
                    {COLOR_LEVEL_VARS.map((col, idx) => (
                      <span
                        key={idx}
                        className="w-[14px] h-[20px] rounded-[4.5px] inline-block transition-transform hover:scale-120"
                        style={{ backgroundColor: col.bg }}
                        title={col.name}
                      />
                    ))}
                  </div>
                  <span>More</span>
                </motion.div>
              </div>

              {/* Heatmap Matrix with Aligned Typography */}
              <div className="overflow-x-auto pb-2.5 pt-1.5 px-1" onMouseLeave={() => setHoveredCell(null)}>
                <div className="w-full min-w-[960px]">
                  {/* Month Labels Centered Over Each Month's Span */}
                  <div className="flex items-center mb-2">
                    <div className="w-[34px] shrink-0" />
                    <div className="relative h-4 flex-1">
                      {monthLabels.map(({ month, centerPct }) => (
                        <span
                          key={month}
                          className="activity-muted absolute -translate-x-1/2 text-[11px] font-medium select-none whitespace-nowrap"
                          style={{ left: `${centerPct}%` }}
                        >
                          {month}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Matrix Grid */}
                  <div className="flex items-start">
                    {/* 7-Row Weekday Labels (Mon, Wed, Fri vertically aligned with row 1, row 3, row 5) */}
                    <div className="activity-muted flex flex-col gap-[4px] w-[30px] mr-[4px] shrink-0 select-none text-[11px] font-medium">
                      <div className={tileHeightClass} />
                      <div className={`${tileHeightClass} flex items-center justify-end leading-none`}>
                        Mon
                      </div>
                      <div className={tileHeightClass} />
                      <div className={`${tileHeightClass} flex items-center justify-end leading-none`}>
                        Wed
                      </div>
                      <div className={tileHeightClass} />
                      <div className={`${tileHeightClass} flex items-center justify-end leading-none`}>
                        Fri
                      </div>
                      <div className={tileHeightClass} />
                    </div>

                    {/* 53 Columns of Soft Rounded Rectangular Tiles */}
                    <div
                      className="flex-1 grid gap-[4px]"
                      style={{
                        gridTemplateColumns: `repeat(${calendarWeeks.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {calendarWeeks.map((week, wIdx) => (
                        <div key={wIdx} className="flex flex-col gap-[4px] min-w-0">
                          {week.map((cell, dIdx) => {
                            if (!cell) {
                              return <div key={dIdx} className={`w-full ${tileHeightClass}`} />;
                            }

                            const level = getLevel(cell);
                            const colorVar = COLOR_LEVEL_VARS[level].bg;
                            const isSelected = selectedDate === cell.date;

                            return (
                              <button
                                key={dIdx}
                                type="button"
                                aria-label={`${cell.date}: ${cell.observation?.fire_count ?? 0} detections`}
                                onClick={() => setSelectedDate(cell.date)}
                                onMouseEnter={() => setHoveredCell(cell)}
                                onMouseLeave={() => setHoveredCell(null)}
                                className={`cal-day-tile w-full ${tileHeightClass} rounded-[5px] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.16] hover:z-20 relative cursor-pointer ${
                                  isSelected ? "activity-tile-selected" : ""
                                }`}
                                style={{ backgroundColor: colorVar }}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Subtle Interactive Hover / Selected Telemetry Strip */}
              <div
                className="pt-3 glass-divider-t flex flex-wrap items-center justify-between gap-3 text-xs"
                aria-live="polite"
              >
                {activeDetailCell ? (
                  activeDetailCell.observation ? (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                      <span className="activity-card-title font-semibold">
                        {formatFullDate(activeDetailCell.date)}
                      </span>
                      <span className="activity-muted">
                        Detections:{" "}
                        <strong style={{ color: "var(--cal-accent)" }}>
                          {activeDetailCell.observation.fire_count.toLocaleString()}
                        </strong>
                      </span>
                      <span className="activity-muted">
                        Mean Burn:{" "}
                        <strong className="activity-card-title">
                          {activeDetailCell.observation.mean_burn_index !== null
                            ? activeDetailCell.observation.mean_burn_index.toFixed(1)
                            : "N/A"}
                        </strong>
                      </span>
                      <span className="activity-muted">
                        Max Burn:{" "}
                        <strong className="activity-card-title">
                          {activeDetailCell.observation.max_burn_index !== null
                            ? activeDetailCell.observation.max_burn_index.toFixed(1)
                            : "N/A"}
                        </strong>
                      </span>
                      <span className="activity-muted">
                        Anomalies:{" "}
                        <strong className="activity-card-title">
                          {activeDetailCell.observation.anomaly_count}
                        </strong>
                      </span>
                    </div>
                  ) : (
                    <span className="activity-muted">
                      <strong className="activity-subtext">
                        {formatFullDate(activeDetailCell.date)}
                      </strong>{" "}
                      · Zero active fire detections recorded
                    </span>
                  )
                ) : (
                  <span className="activity-muted">
                    Hover or click any day tile to inspect daily activity
                  </span>
                )}
              </div>
            </motion.div>

            {burnAnomalyCard}
            {outlierGrid}
            {activityArchiveCard}
          </div>
        </LayoutGroup>
      )}

      {/* Methodology Modal */}
      {isMethodologyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-md p-4">
          <div className="activity-surface-popover rounded-3xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 glass-divider-b mb-3">
              <h3 className="activity-card-title text-sm font-bold">
                How Daily Activity Is Aggregated
              </h3>
              <button
                type="button"
                onClick={() => setIsMethodologyOpen(false)}
                aria-label="Close modal"
                className="glass-icon-btn p-1.5 rounded-full"
              >
                <X size={16} />
              </button>
            </div>

            <div className="activity-subtext text-xs space-y-3">
              <p>
                Each tile in the Daily Fire Activity grid represents one UTC calendar day.
                Detections from NASA FIRMS MODIS and VIIRS instruments are standardized and
                aggregated into spatial H3 resolution-7 cells.
              </p>
              <p className="activity-card-title font-semibold">Intensity Ramp Levels:</p>
              <ul className="list-disc pl-4 space-y-1.5">
                <li>
                  <span className="font-semibold" style={{ color: "var(--cal-accent)" }}>
                    Peak (Level 4):
                  </span>{" "}
                  Top 25% highest activity days.
                </li>
                <li>
                  <span className="font-semibold tone-blue">High (Level 3):</span> 45%–75%
                  activity threshold.
                </li>
                <li>
                  <span className="font-semibold tone-sky">Moderate (Level 2):</span> 20%–45%
                  activity threshold.
                </li>
                <li>
                  <span className="font-semibold tone-cyan">Low (Level 1):</span> Baseline
                  detected fire activity.
                </li>
                <li>
                  <span className="activity-muted font-semibold">Blank (Level 0):</span> Zero fire
                  detections recorded.
                </li>
              </ul>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setIsMethodologyOpen(false)}
                className="glass-btn-primary px-5 py-2 rounded-full text-xs font-semibold"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

interface DotColumn {
  label: string;
  detail: string;
  value: number;
  targetDate?: string;
  active: boolean;
  dots: number;
}

interface OutlierCardData {
  id: string;
  title: string;
  pct: string;
  sub: string;
  isPositive: boolean;
  hasData: boolean;
  dotColor: string;
  targetDate: string;
  columns: DotColumn[];
}

function OutlierTelemetryGrid({
  outlierCards,
  totalAnomalies,
  anomalyLoading,
  anomalyError,
  onRetryAnomalies,
  selectedDate,
  onSelectDate,
  className = "",
}: {
  outlierCards: OutlierCardData[];
  totalAnomalies: number;
  anomalyLoading: boolean;
  anomalyError: string | null;
  onRetryAnomalies: () => void;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  className?: string;
}) {
  const [hoveredBar, setHoveredBar] = useState<{ cardId: string; colIdx: number } | null>(null);

  return (
    <motion.div
      layout="position"
      transition={LAYOUT_SPRING}
      className={`flex flex-col gap-3 ${className}`}
    >
      {/* Subtle glass section header */}
      <div className="activity-card px-5 py-3 flex items-center justify-between">
        <h3 className="activity-card-title text-sm font-semibold tracking-tight">
          Anomaly & Outlier Summary
        </h3>
        {anomalyError ? (
          <button
            type="button"
            onClick={onRetryAnomalies}
            className="glass-btn px-3 py-1 rounded-full text-[11px] font-semibold tone-rose"
          >
            Outlier sync error · Retry
          </button>
        ) : (
          <span className="activity-muted text-[11px] font-medium">
            {anomalyLoading
              ? "Loading outlier summary..."
              : `${totalAnomalies.toLocaleString()} verified outliers`}
          </span>
        )}
      </div>

      {/* 2x2 Grid of 4 crisp cards matching reference image */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {outlierCards.map((card) => {
          const isSelectedCard = Boolean(card.targetDate && card.targetDate === selectedDate);
          const activeColIdx = hoveredBar?.cardId === card.id ? hoveredBar.colIdx : null;
          const activeCol = activeColIdx !== null ? card.columns[activeColIdx] : null;
          return (
            <motion.div
              key={card.id}
              layout="position"
              transition={LAYOUT_SPRING}
              whileHover={{ y: -2 }}
              onClick={() => card.targetDate && onSelectDate(card.targetDate)}
              className={`activity-card p-6 flex flex-col justify-between gap-6 cursor-pointer transition-[filter,opacity] duration-200 ${
                isSelectedCard ? "brightness-105" : ""
              } ${anomalyLoading ? "opacity-75" : ""}`}
            >
              {/* Top Row: Title + Circular Arrow Button */}
              <div className="flex items-center justify-between gap-2">
                <span className="activity-card-title text-[14px] font-medium">
                  {card.title}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (card.targetDate) onSelectDate(card.targetDate);
                  }}
                  aria-label={`Inspect ${card.title}`}
                  className="activity-circle-btn w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0"
                >
                  <ArrowUpRight size={16} strokeWidth={1.8} />
                </button>
              </div>

              {/* Bottom Row: Big Percentage + Subtext on left | Dot-Matrix Sparkline on right */}
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="activity-metric-val text-[26px] sm:text-[28px] font-semibold tracking-tight leading-none tabular-nums">
                      {card.pct}%
                    </span>
                    {card.hasData &&
                      (card.isPositive ? (
                        <ArrowUp size={16} strokeWidth={2.3} className="tone-emerald shrink-0" />
                      ) : (
                        <ArrowDown size={16} strokeWidth={2.3} className="tone-rose shrink-0" />
                      ))}
                  </div>
                  <span
                    className="activity-subtext text-xs font-medium mt-1.5 block truncate"
                    title={activeCol?.detail ?? card.sub}
                  >
                    {activeCol?.label ? activeCol.detail : card.sub}
                  </span>
                </div>

                {/* 12-Column Interactive Backend Dot Matrix Mini Chart */}
                <div
                  className="flex items-end gap-[3.5px] shrink-0 pb-0.5"
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  {card.columns.map((col, idx) => {
                    const isColHovered = activeColIdx === idx;
                    const baseOpacity = col.active ? 1 : 0.3;
                    const opacity =
                      activeColIdx === null ? baseOpacity : isColHovered ? 1 : baseOpacity * 0.45;
                    return (
                      <div
                        key={`${card.id}-col-${idx}`}
                        title={col.detail}
                        onMouseEnter={() => setHoveredBar({ cardId: card.id, colIdx: idx })}
                        onClick={(e) => {
                          if (!col.targetDate) return;
                          e.stopPropagation();
                          onSelectDate(col.targetDate);
                        }}
                        className={`flex flex-col-reverse gap-[3px] px-[0.5px] transition-transform ${
                          isColHovered ? "scale-110" : ""
                        }`}
                      >
                        {Array.from({ length: col.dots }, (_, dotIdx) => (
                          <span
                            key={dotIdx}
                            className="w-[5px] h-[5px] rounded-full block transition-opacity"
                            style={{
                              backgroundColor: card.dotColor,
                              opacity,
                            }}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
