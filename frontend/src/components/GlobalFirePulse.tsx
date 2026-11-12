import React, { useState, useMemo, useEffect, useRef } from "react";
import { cellToLatLng, latLngToCell } from "h3-js";
import {
  Camera,
  SlidersHorizontal,
  MoreHorizontal,
  ChevronUp,
  ChevronDown,
  TrendingDown,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  X,
  Search,
  Filter,
  Layers,
  Activity,
  Calendar,
  Compass,
} from "lucide-react";
import TerraIgnisMap from "./TerraIgnisMap";
import { useFires } from "../hooks/useFires";
import type { FireSensor } from "../types/fire";
import { useDashboard } from "../context/DashboardContext";
import { useAnomalies } from "../hooks/useAnomalies";
import { useStats } from "../hooks/useStats";
import { useCalendar } from "../hooks/useCalendar";
import { useCountries } from "../hooks/useCountries";
import { useCountryFires } from "../hooks/useCountryFires";
import FireActivityTrendsChart from "./FireActivityTrendsChart";
import DatasetSetupNotice, { isDatasetUnavailableError } from "./DatasetSetupNotice";

function formatCount(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-US");
}

function formatBurnIndex(value: number | null | undefined): string {
  return value == null ? "—" : value.toFixed(2);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function computePctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function renderDeltaBadge(delta: number | null, title: string) {
  if (delta === null || !Number.isFinite(delta)) {
    return (
      <span
        title={title}
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold glass-subtle bg-[var(--glass-track-bg)]"
      >
        —
      </span>
    );
  }
  const isUp = delta >= 0;
  return (
    <span
      title={title}
      className={`${isUp ? "dataplay-badge-up" : "dataplay-badge-down"} inline-flex`}
    >
      {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

export default function GlobalFirePulse() {
  const [offset, setOffset] = useState(0);
  const [latitudeInput, setLatitudeInput] = useState("");
  const [longitudeInput, setLongitudeInput] = useState("");
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(5000);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);
  const [isLegendCollapsed, setIsLegendCollapsed] = useState(false);
  const filtersPanelRef = useRef<HTMLElement>(null);
  const filtersToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isFiltersOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        filtersPanelRef.current?.contains(target) ||
        filtersToggleRef.current?.contains(target)
      ) {
        return;
      }
      setIsFiltersOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFiltersOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFiltersOpen]);

  const {
    selectedDate,
    calendarYear,
    selectedStartDate,
    selectedEndDate,
    selectedH3Cell,
    selectedCountry,
    selectedSensor,
    minBurnIndex,
    maxBurnIndex,
    setSelectedDate,
    setDateRange,
    setSelectedYear,
    setSelectedH3Cell,
    setSelectedCountry,
    setSelectedSensor,
    setBurnIndexRange,
    clearFilters,
  } = useDashboard();

  const selectedYear = Number(selectedStartDate.slice(0, 4));
  const { data, loading, error, refetch } = useFires({
    date: selectedDate || undefined,
    start_date: selectedStartDate,
    end_date: selectedEndDate,
    sensor: selectedSensor || undefined,
    min_burn_index: minBurnIndex ?? undefined,
    max_burn_index: maxBurnIndex ?? undefined,
    limit: pageSize,
    offset,
  });

  const { countries, error: countriesError } = useCountries();
  const countryQuery = {
    date: selectedDate || undefined,
    start_date: selectedStartDate,
    end_date: selectedEndDate,
    sensor: selectedSensor || undefined,
    min_burn_index: minBurnIndex ?? undefined,
    max_burn_index: maxBurnIndex ?? undefined,
  };
  const countryFires = useCountryFires(countryQuery, selectedCountry);

  const allRecords = selectedCountry ? countryFires.records : data?.data ?? [];
  const totalRecords = selectedCountry ? countryFires.records.length : data?.total ?? 0;
  const records = selectedCountry
    ? allRecords.slice(offset, offset + pageSize)
    : allRecords;
  const pageCount = Math.ceil(totalRecords / pageSize);
  const currentPage = totalRecords > 0 ? Math.min(Math.floor(offset / pageSize) + 1, pageCount) : 0;
  const recordsRemaining = Math.max(0, totalRecords - (offset + records.length));
  const mapLoading = selectedCountry ? countryFires.loading : loading;
  const mapError = selectedCountry ? countryFires.error : error;
  const mapFireData = useMemo(
    () =>
      mapLoading
        ? []
        : records.map((record) => ({
            h3Index: record.h3_cell,
            burnIndex: record.burn_index,
          })),
    [mapLoading, records]
  );

  const mapOverview = useMemo(() => {
    const cells = [...new Set(mapFireData.map((record) => record.h3Index))];
    if (cells.length === 0) return { latitude: 20, longitude: 0, zoom: 1.2 };

    const centers = cells.map((cell) => cellToLatLng(cell));
    const latitude =
      centers.reduce((sum, center) => sum + center[0], 0) / centers.length;
    const longitude =
      (Math.atan2(
        centers.reduce((sum, center) => sum + Math.sin((center[1] * Math.PI) / 180), 0),
        centers.reduce((sum, center) => sum + Math.cos((center[1] * Math.PI) / 180), 0)
      ) *
        180) /
      Math.PI;

    const longitudeOffsets = centers.map((center) => ((center[1] - longitude + 540) % 360) - 180);
    const longitudeSpan = Math.max(...longitudeOffsets) - Math.min(...longitudeOffsets);
    const toMercatorY = (value: number) => {
      const lat = Math.max(-85, Math.min(85, value)) * (Math.PI / 180);
      return (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2;
    };
    const yValues = centers.map(([lat]) => toMercatorY(lat));
    const latitudeSpan = Math.max(...yValues) - Math.min(...yValues);
    const longitudeZoom = Math.log2((900 * 360) / (256 * Math.max(longitudeSpan, 0.1)));
    const latitudeZoom = Math.log2(480 / (256 * Math.max(latitudeSpan, 0.001)));

    return {
      latitude,
      longitude,
      zoom: Math.max(1.2, Math.min(7.5, Math.min(longitudeZoom, latitudeZoom) - 0.45)),
    };
  }, [mapFireData]);

  const h3Cells = useMemo(
    () => [...new Set(records.map((record) => record.h3_cell))],
    [records]
  );

  const {
    data: anomalyRecords,
    loading: anomaliesLoading,
    error: anomaliesError,
    refetch: refetchAnomalies,
  } = useAnomalies({
    start_date: selectedStartDate,
    end_date: selectedEndDate,
  });

  const {
    data: stats,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useStats();
  const allYearsStart = stats?.coverage.start_date;
  const allYearsEnd = stats?.coverage.end_date;
  const isAllYearsSelected = Boolean(
    allYearsStart &&
      allYearsEnd &&
      selectedStartDate === allYearsStart &&
      selectedEndDate === allYearsEnd &&
      !selectedDate
  );

  const {
    data: calendarData,
    loading: calendarLoading,
    error: calendarError,
    refetch: refetchCalendar,
  } = useCalendar({
    start_date: selectedStartDate,
    end_date: selectedEndDate,
    limit: 366,
    offset: 0,
  });

  const datasetUnavailable = [mapError, anomaliesError, statsError, calendarError]
    .some(isDatasetUnavailableError);

  useEffect(() => {
    const refreshDashboardData = () => {
      refetch();
      if (selectedCountry) countryFires.refetch();
      refetchAnomalies();
      refetchStats();
      refetchCalendar();
    };
    window.addEventListener('terraignis:datasets-updated', refreshDashboardData);
    return () => window.removeEventListener('terraignis:datasets-updated', refreshDashboardData);
  }, [countryFires.refetch, refetch, refetchAnomalies, refetchCalendar, refetchStats, selectedCountry]);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthlyAnomalyCounts = useMemo(() => {
    const counts: number[] = Array(12).fill(0);
    for (const record of anomalyRecords ?? []) {
      const monthIndex = Number(record.acq_date.slice(5, 7)) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        counts[monthIndex] += 1;
      }
    }
    return counts;
  }, [anomalyRecords]);

  const maxMonthlyAnomalies = Math.max(1, ...monthlyAnomalyCounts);

  const handleCoordinateSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const latitude = Number(latitudeInput);
    const longitude = Number(longitudeInput);
    if (
      latitudeInput.trim() === "" ||
      longitudeInput.trim() === "" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      setCoordinateError("Enter valid numerical coordinates.");
      return;
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setCoordinateError("Lat −90 to 90, Lon −180 to 180.");
      return;
    }

    setCoordinateError(null);
    setSelectedH3Cell(latLngToCell(latitude, longitude, 7));
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedDate) count++;
    if (selectedSensor) count++;
    if (minBurnIndex != null) count++;
    if (maxBurnIndex != null) count++;
    if (selectedH3Cell) count++;
    if (selectedCountry) count++;
    return count;
  }, [selectedDate, selectedSensor, minBurnIndex, maxBurnIndex, selectedH3Cell, selectedCountry]);

  const countryDetectionTotal = useMemo(
    () => countryFires.records.reduce((total, record) => total + record.total_fire_count, 0),
    [countryFires.records]
  );

  const sortedCalendarDays = useMemo(
    () => [...(calendarData?.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [calendarData]
  );

  const selectedDateHasObservations = sortedCalendarDays.some((day) => day.date === selectedDate);
  const previousAvailableDate = selectedDate
    ? [...sortedCalendarDays].reverse().find((day) => day.date < selectedDate)?.date ?? sortedCalendarDays[0]?.date
    : undefined;
  const hasEarlierAvailableDate = Boolean(
    selectedDate && previousAvailableDate && previousAvailableDate < selectedDate
  );
  const selectedDateHasNoObservations = Boolean(
    selectedDate && calendarData && !calendarLoading && !calendarError && !selectedDateHasObservations
  );

  const periodMeanBurnIndex = useMemo(() => {
    const values = sortedCalendarDays
      .map((day) => day.mean_burn_index)
      .filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }, [sortedCalendarDays]);

  const detectionBars = useMemo(() => {
    const recent = sortedCalendarDays.slice(-22);
    if (recent.length === 0) return [];
    const maxFire = Math.max(1, ...recent.map((day) => day.fire_count));
    return recent.map((day) => ({
      date: day.date,
      fireCount: day.fire_count,
      pct: Math.max(18, Math.round((day.fire_count / maxFire) * 100)),
    }));
  }, [sortedCalendarDays]);

  const telemetryDeltas = useMemo(() => {
    const days = sortedCalendarDays;
    let detectionDelta15d: number | null = null;
    let burnIndexDelta30d: number | null = null;
    let anomalyDelta30d: number | null = null;
    let cellDateDelta30d: number | null = null;

    if (days.length >= 2) {
      const split15 = days.length >= 30;
      const prior15 = split15 ? days.slice(-30, -15) : days.slice(0, Math.floor(days.length / 2));
      const recent15 = split15 ? days.slice(-15) : days.slice(Math.floor(days.length / 2));
      detectionDelta15d = computePctChange(
        recent15.reduce((sum, day) => sum + day.fire_count, 0),
        prior15.reduce((sum, day) => sum + day.fire_count, 0)
      );

      const split30 = days.length >= 60;
      const prior30 = split30 ? days.slice(-60, -30) : prior15;
      const recent30 = split30 ? days.slice(-30) : recent15;

      cellDateDelta30d = computePctChange(
        recent30.reduce((sum, day) => sum + day.fire_count, 0),
        prior30.reduce((sum, day) => sum + day.fire_count, 0)
      );
      anomalyDelta30d = computePctChange(
        recent30.reduce((sum, day) => sum + day.anomaly_count, 0),
        prior30.reduce((sum, day) => sum + day.anomaly_count, 0)
      );

      const priorBurns = prior30
        .map((day) => day.mean_burn_index)
        .filter((val): val is number => val !== null);
      const recentBurns = recent30
        .map((day) => day.mean_burn_index)
        .filter((val): val is number => val !== null);
      if (priorBurns.length > 0 && recentBurns.length > 0) {
        const priorMean = priorBurns.reduce((sum, v) => sum + v, 0) / priorBurns.length;
        const recentMean = recentBurns.reduce((sum, v) => sum + v, 0) / recentBurns.length;
        burnIndexDelta30d = computePctChange(recentMean, priorMean);
      }
    }

    const activeMonths = monthlyAnomalyCounts
      .map((count, index) => ({ count, index }))
      .filter((entry) => entry.count > 0);
    const monthlyAnomalyDelta =
      activeMonths.length >= 2
        ? computePctChange(
            activeMonths[activeMonths.length - 1].count,
            activeMonths[activeMonths.length - 2].count
          )
        : null;

    return {
      detectionDelta15d,
      burnIndexDelta30d,
      anomalyDelta30d,
      cellDateDelta30d,
      monthlyAnomalyDelta,
    };
  }, [sortedCalendarDays, monthlyAnomalyCounts]);

  const sensorRingMetrics = useMemo(() => {
    const totalRaw = stats?.coverage.total_raw_observations ?? 0;
    const totalCellDates = stats?.coverage.total_h3_cell_dates ?? 0;
    const viirsRatio = totalRaw > 0 ? Math.min(1, (stats?.sensors.viirs_observations ?? 0) / totalRaw) : 0;
    const modisRatio = totalRaw > 0 ? Math.min(1, (stats?.sensors.modis_observations ?? 0) / totalRaw) : 0;
    const dualRatio =
      totalCellDates > 0 ? Math.min(1, (stats?.sensors.both_sensor_cell_dates ?? 0) / totalCellDates) : 0;

    const viirsCirc = 2 * Math.PI * 68;
    const modisCirc = 2 * Math.PI * 52;
    const dualCirc = 2 * Math.PI * 36;

    return {
      viirsCirc,
      modisCirc,
      dualCirc,
      viirsOffset: viirsCirc * (1 - viirsRatio),
      modisOffset: modisCirc * (1 - modisRatio),
      dualOffset: dualCirc * (1 - dualRatio),
      viirsPct: viirsRatio * 100,
      modisPct: modisRatio * 100,
      dualPct: dualRatio * 100,
    };
  }, [stats]);

  const activeDetectionsHeadline =
    selectedCountry
      ? countryFires.loading
        ? undefined
        : countryDetectionTotal
      : selectedDate || activeFiltersCount > 0
      ? loading
        ? undefined
        : data?.total
      : stats?.coverage.total_raw_observations ?? data?.total;

  const activeCellsHeadline =
    activeFiltersCount > 0
      ? mapLoading
        ? undefined
        : h3Cells.length
      : stats?.coverage.unique_h3_cells ?? (h3Cells.length > 0 ? h3Cells.length : undefined);

  return (
    <div className="dataplay-overview flex flex-col h-full w-full overflow-y-auto lg:overflow-hidden p-3 lg:p-4 gap-3">
      {datasetUnavailable && <DatasetSetupNotice compact />}
      {/* MAIN CONTENT STAGE (Map on the left, dashboard analysis on the right) */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3.5 lg:gap-4 lg:overflow-hidden">
        {/* DASHBOARD ANALYSIS COLUMN */}
        <div className="order-2 w-full lg:w-[49%] xl:w-[48%] lg:max-w-[780px] shrink-0 flex flex-col gap-3 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
          {/* ROW 1: SESSIONS & USERS CARDS (2-Col Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
            {/* CARD 1: ACTIVE DETECTIONS */}
            <div className="dataplay-card p-3.5 sm:p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm sm:text-[15px] font-semibold glass-title">
                    Active Detections
                  </span>
                  <span className="rounded-full border border-sky-400/40 bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                    {selectedDate ? "Selected date" : activeFiltersCount > 0 ? "Filtered view" : "Full dataset"}
                  </span>
                  <button
                    type="button"
                    title="More actions"
                    aria-label="More actions"
                    className="glass-icon-btn p-1 rounded-full"
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </div>
                <span className="text-[11px] glass-subtle font-medium block">
                  {selectedDate ? formatDate(selectedDate) : "Current Window"}
                </span>
                <span className="text-[10px] glass-muted font-medium block mt-0.5">
                  Detection count follows this view; sensor totals below use all processed data.
                </span>

                <div className="flex items-center gap-2 mt-1 mb-2">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight glass-heading tabular-nums">
                    {formatCount(activeDetectionsHeadline)}
                  </span>
                  {renderDeltaBadge(
                    telemetryDeltas.detectionDelta15d,
                    "Recent 15d vs prior 15d active detections (from /api/calendar)"
                  )}
                </div>

                {/* Live Daily Waveform Bars (Last 22 Observed Days from /api/calendar) */}
                <div className="flex items-center gap-[3px] h-5 py-0.5 mb-2.5">
                  {detectionBars.length > 0
                    ? detectionBars.map((bar, idx) => (
                        <div
                          key={bar.date}
                          title={`${formatDate(bar.date)}: ${bar.fireCount.toLocaleString()} cell-dates`}
                          className="flex-1 rounded-full transition-all duration-200"
                          style={{
                            height: `${bar.pct}%`,
                            backgroundColor:
                              idx < Math.ceil(detectionBars.length / 2)
                                ? "var(--chart-series-muted)"
                                : "var(--chart-series-accent)",
                          }}
                        />
                      ))
                    : Array.from({ length: 22 }, (_, idx) => (
                        <div
                          key={idx}
                          className="flex-1 rounded-full bg-slate-400/25"
                          style={{ height: "25%" }}
                        />
                      ))}
                </div>
              </div>

              {/* Breakdown Rows */}
              <div className="space-y-1 glass-divider-t pt-2.5">
                <div className="mb-1 inline-flex rounded-md border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                  Sensor totals · entire dataset
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="glass-muted">VIIRS Detections</span>
                  <span className="font-semibold glass-title tabular-nums">
                    {formatCount(stats?.sensors.viirs_observations)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="glass-muted">MODIS Detections</span>
                  <span className="font-semibold glass-title tabular-nums">
                    {formatCount(stats?.sensors.modis_observations)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="glass-muted">Dual-Sensor Match</span>
                  <span className="font-semibold glass-title tabular-nums">
                    {formatCount(stats?.sensors.both_sensor_cell_dates)}
                  </span>
                </div>
              </div>
            </div>

            {/* CARD 2: H3 ACTIVE CELLS */}
            <div className="dataplay-card p-3.5 sm:p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm sm:text-[15px] font-semibold glass-title">
                    H3 Active Cells
                  </span>
                  <span className="rounded-full border border-sky-400/40 bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                    {activeFiltersCount > 0 ? "Filtered map page" : "Full dataset"}
                  </span>
                  <button
                    type="button"
                    title="More actions"
                    aria-label="More actions"
                    className="glass-icon-btn p-1 rounded-full"
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </div>
                <span className="text-[10px] glass-muted font-medium block">
                  {selectedDate
                    ? `${formatDate(selectedDate)} · unique cells on current map page`
                    : activeFiltersCount > 0
                    ? "Unique cells on the current filtered map page"
                    : "Unique H3 cells across all processed data"}
                </span>

                <div className="flex items-center gap-2 mt-1 mb-1.5">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight glass-heading tabular-nums">
                    {formatCount(activeCellsHeadline)}
                  </span>
                  {renderDeltaBadge(
                    telemetryDeltas.monthlyAnomalyDelta,
                    "Latest active month vs previous active month anomalies (from /api/anomalies)"
                  )}
                </div>

                <span className="text-[11px] glass-subtle font-medium block mb-1.5">
                  Observed anomalies per month
                </span>
              </div>

              {/* Monthly Vertical Bar Chart */}
              <div className="h-14 sm:h-16 flex items-end gap-1.5 pt-1">
                {anomaliesLoading ? (
                  <span className="w-full h-full flex items-center justify-center text-xs glass-subtle">
                    Loading anomaly data…
                  </span>
                ) : anomaliesError ? (
                  <span className="w-full h-full flex items-center justify-center text-xs tone-rose">
                    Anomaly data unavailable
                  </span>
                ) : (
                  monthlyAnomalyCounts.map((count, index) => {
                    const normalizedHeight =
                      count === 0 ? 12 : Math.max(18, Math.round((count / maxMonthlyAnomalies) * 100));
                    return (
                      <div
                        key={monthNames[index]}
                        className="flex-1 flex flex-col items-center h-full justify-end group relative"
                      >
                        <div
                          className="w-full rounded-t-sm transition-all duration-300 group-hover:brightness-110"
                          style={{
                            height: `${normalizedHeight}%`,
                            backgroundColor: "var(--brand-primary)",
                            opacity: count === 0 ? 0.2 : 1,
                          }}
                        />
                        <span className="text-[9px] font-medium glass-subtle mt-1 uppercase font-sans">
                          {monthNames[index][0]}
                        </span>
                        {/* Tooltip on hover */}
                        <div className="glass-tooltip absolute -top-7 z-20 hidden group-hover:block text-[10px] px-2.5 py-0.5 rounded-full whitespace-nowrap pointer-events-none">
                          {monthNames[index]}: {count}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ROW 2: SEVERITY DISTRIBUTION */}
          <div className="dataplay-card p-4 sm:p-5 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-base font-semibold glass-title block">Burn Severity &amp; Sensor Mix</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="rounded-md border border-sky-400/35 bg-sky-500/10 px-2 py-1 text-[9px] font-semibold text-sky-700 dark:text-sky-300">
                    Mean Index · selected date range
                  </span>
                  <span className="rounded-md border border-violet-400/35 bg-violet-500/10 px-2 py-1 text-[9px] font-semibold text-violet-700 dark:text-violet-300">
                    Outliers, sensor mix &amp; totals · entire dataset
                  </span>
                </div>
              </div>
              <button
                type="button"
                title="More actions"
                aria-label="More actions"
                className="glass-icon-btn p-1.5 rounded-full"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>

            <div className="grid grid-cols-12 items-center gap-4">
              {/* Left Column Stats */}
              <div className="col-span-3 flex flex-col justify-between h-full">
                <div>
                  <span className="text-xs glass-subtle font-medium block">Mean Index</span>
                  <div className="text-xl sm:text-2xl font-bold glass-heading tabular-nums mt-1">
                    {formatBurnIndex(periodMeanBurnIndex)}
                  </div>
                  <div className="mt-1">
                    {renderDeltaBadge(
                      telemetryDeltas.burnIndexDelta30d,
                      "Last 30d vs prior 30d mean Burn Index (from /api/calendar)"
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 mt-3.5">
                  <div
                    className="flex items-center gap-2 text-xs glass-muted"
                    title={`VIIRS raw share: ${sensorRingMetrics.viirsPct.toFixed(1)}%`}
                  >
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: "var(--ring-viirs)" }} />
                    <span>VIIRS Raw</span>
                  </div>
                  <div
                    className="flex items-center gap-2 text-xs glass-muted"
                    title={`MODIS raw share: ${sensorRingMetrics.modisPct.toFixed(1)}%`}
                  >
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: "var(--ring-modis)" }} />
                    <span>MODIS Raw</span>
                  </div>
                  <div
                    className="flex items-center gap-2 text-xs glass-muted"
                    title={`Dual-sensor share of cell-dates: ${sensorRingMetrics.dualPct.toFixed(1)}%`}
                  >
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: "var(--ring-dual)" }} />
                    <span>Dual Match</span>
                  </div>
                </div>
              </div>

              {/* Center Concentric Rings Graphic (proportional to /api/stats) */}
              <div className="col-span-6 flex items-center justify-center">
                <div className="relative w-44 h-44 sm:w-52 sm:h-52 lg:w-48 lg:h-48 xl:w-52 xl:h-52 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                    {/* Ring 1 - Outer (VIIRS Share of Raw Observations) */}
                    <circle
                      cx="80"
                      cy="80"
                      r="68"
                      fill="none"
                      stroke="var(--ring-track)"
                      strokeWidth="11"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="68"
                      fill="none"
                      stroke="var(--ring-viirs)"
                      strokeWidth="11"
                      strokeDasharray={sensorRingMetrics.viirsCirc.toFixed(2)}
                      strokeDashoffset={sensorRingMetrics.viirsOffset.toFixed(2)}
                      strokeLinecap="round"
                    />

                    {/* Ring 2 - Middle (MODIS Share of Raw Observations) */}
                    <circle
                      cx="80"
                      cy="80"
                      r="52"
                      fill="none"
                      stroke="var(--ring-track)"
                      strokeWidth="11"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="52"
                      fill="none"
                      stroke="var(--ring-modis)"
                      strokeWidth="11"
                      strokeDasharray={sensorRingMetrics.modisCirc.toFixed(2)}
                      strokeDashoffset={sensorRingMetrics.modisOffset.toFixed(2)}
                      strokeLinecap="round"
                    />

                    {/* Ring 3 - Inner (Dual-Sensor Share of Cell-Dates) */}
                    <circle
                      cx="80"
                      cy="80"
                      r="36"
                      fill="none"
                      stroke="var(--ring-track)"
                      strokeWidth="11"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="36"
                      fill="none"
                      stroke="var(--ring-dual)"
                      strokeWidth="11"
                      strokeDasharray={sensorRingMetrics.dualCirc.toFixed(2)}
                      strokeDashoffset={sensorRingMetrics.dualOffset.toFixed(2)}
                      strokeLinecap="round"
                    />
                  </svg>

                  {/* Center Metric */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                    <span className="text-base sm:text-lg font-bold glass-heading tracking-tight tabular-nums">
                      {formatCount(stats?.coverage.total_raw_observations)}
                    </span>
                    <span className="text-[10px] sm:text-[11px] glass-subtle font-medium leading-tight">Observations</span>
                  </div>
                </div>
              </div>

              {/* Right Column Stats */}
              <div className="col-span-3 flex flex-col justify-between h-full text-right">
                <div>
                  <span className="text-xs glass-subtle font-medium block">Outliers</span>
                  <div className="text-xl sm:text-2xl font-bold glass-heading tabular-nums mt-1">
                    {formatCount(stats?.anomalies.total_anomalous ?? anomalyRecords?.length)}
                  </div>
                  <div className="mt-1">
                    {renderDeltaBadge(
                      telemetryDeltas.anomalyDelta30d,
                      "Last 30d vs prior 30d anomalies (from /api/calendar)"
                    )}
                  </div>
                </div>

                <div className="mt-3.5">
                  <span className="text-xs glass-subtle font-medium block">Cell-Dates</span>
                  <div className="text-xl sm:text-2xl font-bold glass-heading tabular-nums mt-1">
                    {formatCount(stats?.coverage.total_h3_cell_dates)}
                  </div>
                  <div className="mt-1">
                    {renderDeltaBadge(
                      telemetryDeltas.cellDateDelta30d,
                      "Last 30d vs prior 30d active cell-dates (from /api/calendar)"
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ROW 3: FIRE ACTIVITY TRENDS */}
          <FireActivityTrendsChart
            days={calendarData?.data ?? []}
            loading={calendarLoading}
            error={calendarError}
            onRetry={refetchCalendar}
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              setSelectedDate(date === selectedDate ? null : date);
              setOffset(0);
            }}
          />
        </div>

        {/* MAP COLUMN WITH FLOATING OVERLAYS */}
        <div className="order-1 flex-1 min-w-0 min-h-[360px] sm:min-h-[420px] lg:min-h-0 h-full relative rounded-3xl overflow-hidden glass-panel flex flex-col">
          {/* Top Floating Bar: Title + Record Count Summary on Left | Moved Toolbar Controls on Right */}
          <div className="absolute top-3.5 left-3.5 right-3.5 z-30 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            <div className="pointer-events-auto map-floating-panel map-floating-panel-readable rounded-full pl-4 pr-1.5 py-1.5 flex items-center gap-2.5 max-w-full min-w-0">
              <h1 className="text-xs font-bold tracking-tight glass-heading whitespace-nowrap">
                Fire Overview
              </h1>
              <span className="h-3.5 w-px bg-slate-400/35 shrink-0" />
              <div className="flex min-w-0 items-center gap-2 text-[10px] font-medium glass-muted tabular-nums sm:text-xs">
                <span className="truncate">
                  {selectedCountry && mapLoading
                    ? `Loading ${selectedCountry}…`
                    : `Showing ${formatCount(records.length)} of ${formatCount(totalRecords)} cell-date records`}
                </span>
                <span className="hidden h-3.5 w-px bg-slate-400/35 shrink-0 sm:block" />
                <button
                  type="button"
                  onClick={() => setOffset(Math.max(0, offset - pageSize))}
                  disabled={currentPage <= 1 || mapLoading}
                  aria-label="Previous map page"
                  title="Previous map page"
                  className="glass-btn rounded-full p-1 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="whitespace-nowrap text-[9px] sm:text-[10px]">
                  {currentPage || 0}/{pageCount} · {formatCount(recordsRemaining)} left
                </span>
                <button
                  type="button"
                  onClick={() => setOffset(offset + pageSize)}
                  disabled={currentPage >= pageCount || mapLoading}
                  aria-label="Next map page"
                  title="Next map page"
                  className="glass-btn rounded-full p-1 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              {/* Dataset snapshot action pill */}
              <button
                type="button"
                onClick={() => setIsSnapshotOpen(true)}
                className="map-floating-btn inline-flex items-center h-8 gap-1.5 px-3.5 rounded-full text-xs font-semibold"
              >
                <Camera size={13} className="glass-muted" />
                <span>Dataset snapshot</span>
              </button>

              {/* Filters Toggle Button */}
              <button
                type="button"
                ref={filtersToggleRef}
                aria-expanded={isFiltersOpen}
                aria-controls="fire-filter-controls"
                onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                className={`inline-flex items-center h-8 gap-1.5 px-3.5 rounded-full text-xs font-semibold ${
                  isFiltersOpen || activeFiltersCount > 0 ? "map-floating-btn-active" : "map-floating-btn"
                }`}
              >
                <SlidersHorizontal size={13} />
                <span>Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-white text-indigo-700 text-[10px] font-bold">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {/* Refresh Action */}
              <button
                type="button"
                onClick={() => {
                  refetch();
                  if (selectedCountry) countryFires.refetch();
                  refetchStats();
                  refetchAnomalies();
                  refetchCalendar();
                }}
                title="Refresh data"
                aria-label="Refresh data"
                className="map-floating-btn inline-flex items-center justify-center h-8 w-8 rounded-full"
              >
                <RotateCw
                  size={13}
                  className={mapLoading || calendarLoading ? "animate-spin tone-blue" : "glass-muted"}
                />
              </button>
            </div>
          </div>

          {/* COLLAPSIBLE FLOATING FILTER DRAWER / POPOVER */}
          {isFiltersOpen && (
            <section
              id="fire-filter-controls"
              ref={filtersPanelRef}
              aria-label="Fire API filters"
              className="absolute top-16 left-3.5 right-3.5 z-30 map-floating-panel map-floating-panel-readable rounded-3xl p-4 sm:p-5 max-h-[calc(100%-5rem)] overflow-y-auto"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 glass-divider-b">
                <div className="flex items-center gap-2">
                  <Filter size={15} className="tone-blue" />
                  <h2 className="text-xs font-bold uppercase tracking-wider glass-title">
                    Filter Controls
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {activeFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        clearFilters();
                        setOffset(0);
                      }}
                      className="glass-btn-ghost text-xs font-semibold tone-rose px-3 py-1 rounded-full"
                    >
                      Clear all
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsFiltersOpen(false)}
                    aria-label="Close filters"
                    className="glass-icon-btn p-1.5 rounded-full"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <label className="text-[11px] font-medium glass-muted">
                  Observation Period
                  <select
                    value={isAllYearsSelected ? "all" : "year"}
                    onChange={(event) => {
                      setSelectedDate(null);
                      if (event.target.value === "all" && allYearsStart && allYearsEnd) {
                        setDateRange(allYearsStart, allYearsEnd);
                      } else {
                        setSelectedYear(calendarYear);
                      }
                      setOffset(0);
                    }}
                    className="mt-1 block w-full glass-control rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40"
                  >
                    <option value="year">Selected year ({calendarYear})</option>
                    <option value="all" disabled={!allYearsStart || !allYearsEnd}>
                      All years ({allYearsStart?.slice(0, 4) ?? "…"}–{allYearsEnd?.slice(0, 4) ?? "…"})
                    </option>
                  </select>
                </label>

                <label className="text-[11px] font-medium glass-muted">
                  Observation Date
                  <input
                    type="date"
                    value={selectedDate ?? ""}
                    onChange={(event) => {
                      setSelectedDate(event.target.value || null);
                      setOffset(0);
                    }}
                    className="mt-1 block w-full glass-control rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40"
                  />
                </label>

                <label className="text-[11px] font-medium glass-muted">
                  Country
                  <select
                    value={selectedCountry ?? ""}
                    onChange={(event) => {
                      setSelectedCountry(event.target.value || null);
                      setOffset(0);
                    }}
                    className="mt-1 block w-full glass-control rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40"
                  >
                    <option value="">All countries</option>
                    {countries.map((country) => {
                      const name = String(country.properties.ADMIN ?? country.properties.NAME_EN ?? country.properties.NAME);
                      return (
                        <option key={`${name}-${country.properties.ADM0_A3 ?? ""}`} value={name}>
                          {name}
                        </option>
                      );
                    })}
                  </select>
                  <span className="block mt-1 text-[10px] glass-subtle">Matches H3 cell centers.</span>
                  {countriesError && <span className="block mt-1 text-[10px] tone-rose">Country list unavailable.</span>}
                </label>

                <label className="text-[11px] font-medium glass-muted">
                  Sensor Type
                  <select
                    value={selectedSensor ?? ""}
                    onChange={(event) => {
                      setSelectedSensor((event.target.value || null) as FireSensor | null);
                      setOffset(0);
                    }}
                    className="mt-1 block w-full glass-control rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40"
                  >
                    <option value="">All sensors (Harmonized)</option>
                    <option value="MODIS">MODIS</option>
                    <option value="VIIRS">VIIRS</option>
                    <option value="BOTH">Both sensors</option>
                  </select>
                </label>

                <label className="text-[11px] font-medium glass-muted">
                  Records per map page
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setOffset(0);
                    }}
                    className="mt-1 block w-full glass-control rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40"
                  >
                    <option value={1000}>1,000</option>
                    <option value={2500}>2,500</option>
                    <option value={5000}>5,000</option>
                    <option value={10000}>10,000</option>
                    <option value={25000}>25,000</option>
                    <option value={50000}>50,000</option>
                  </select>
                  <span className="mt-1 block text-[10px] glass-subtle">
                    Controls the number of cell-date records shown per map page.
                  </span>
                </label>

                <label className="text-[11px] font-medium glass-muted">
                  Min Burn Index
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={minBurnIndex ?? ""}
                    onChange={(event) => {
                      setBurnIndexRange(
                        event.target.value === "" ? null : Number(event.target.value),
                        maxBurnIndex
                      );
                      setOffset(0);
                    }}
                    placeholder="0"
                    className="mt-1 block w-full glass-control rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40"
                  />
                </label>

                <label className="text-[11px] font-medium glass-muted">
                  Max Burn Index
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={maxBurnIndex ?? ""}
                    onChange={(event) => {
                      setBurnIndexRange(
                        minBurnIndex,
                        event.target.value === "" ? null : Number(event.target.value)
                      );
                      setOffset(0);
                    }}
                    placeholder="100"
                    className="mt-1 block w-full glass-control rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40"
                  />
                </label>

                <label className="text-[11px] font-medium glass-muted">
                  Selected H3 Cell
                  <select
                    value={selectedH3Cell ?? ""}
                    onChange={(event) => setSelectedH3Cell(event.target.value || null)}
                    className="mt-1 block w-full glass-control rounded-xl px-2.5 py-1.5 text-xs font-sans tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40"
                  >
                    <option value="">No cell selected</option>
                    {selectedH3Cell && !h3Cells.includes(selectedH3Cell) && (
                      <option value={selectedH3Cell}>{selectedH3Cell}</option>
                    )}
                    {h3Cells.map((cell) => (
                      <option key={cell} value={cell}>
                        {cell}
                      </option>
                    ))}
                  </select>
                </label>

                <form onSubmit={handleCoordinateSubmit} className="flex flex-col justify-end">
                  <span className="text-[11px] font-medium glass-muted block mb-1">
                    Lat / Lon Jump
                  </span>
                  <div className="flex gap-1.5">
                    <input
                      aria-label="Latitude"
                      type="number"
                      min="-90"
                      max="90"
                      step="any"
                      value={latitudeInput}
                      onChange={(event) => setLatitudeInput(event.target.value)}
                      placeholder="Lat"
                      className="w-1/2 glass-control rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40"
                    />
                    <input
                      aria-label="Longitude"
                      type="number"
                      min="-180"
                      max="180"
                      step="any"
                      value={longitudeInput}
                      onChange={(event) => setLongitudeInput(event.target.value)}
                      placeholder="Lon"
                      className="w-1/2 glass-control rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 rounded-full glass-btn-primary text-xs font-semibold shrink-0"
                    >
                      Go
                    </button>
                  </div>
                  {coordinateError && (
                    <span className="text-[10px] tone-rose mt-1">{coordinateError}</span>
                  )}
                </form>
              </div>

            </section>
          )}

          {/* Map Canvas Visualizer: Calling TerraIgnisMap with exact unchanged props */}
          <div className="w-full h-full select-none relative">
            <TerraIgnisMap
              latitude={mapOverview.latitude}
              longitude={mapOverview.longitude}
              zoom={mapOverview.zoom}
              fireData={mapFireData}
              isRegional={false}
              selectedH3Cell={selectedH3Cell}
              onH3CellClick={setSelectedH3Cell}
            />

            {/* Loading / Error States Overlay */}
            {(mapLoading || mapError || (!mapLoading && records.length === 0)) && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/35 backdrop-blur-xs p-4">
                {mapLoading ? (
                  <div className="map-floating-panel px-6 py-4 rounded-3xl text-center">
                    <span className="block text-xs font-semibold glass-heading">
                      Loading detections...
                    </span>
                  </div>
                ) : mapError && !datasetUnavailable ? (
                  <div className="max-w-sm map-floating-panel px-6 py-4 rounded-3xl text-center">
                    <span className="block text-xs font-semibold tone-rose">
                      Unable to load fire detections.
                    </span>
                    <button
                      type="button"
                      onClick={selectedCountry ? countryFires.refetch : refetch}
                      className="mt-3 px-4 py-1.5 glass-btn-primary rounded-full text-xs font-semibold"
                    >
                      Retry
                    </button>
                  </div>
                ) : datasetUnavailable ? (
                  <div className="max-w-sm map-floating-panel-readable rounded-3xl px-6 py-4 text-center">
                    <span className="block text-xs font-semibold glass-heading">
                      No processed fire data to display yet
                    </span>
                    <span className="block mt-1 text-xs glass-muted">
                      Follow the setup steps above to ingest FIRMS data and generate datasets.
                    </span>
                  </div>
                ) : (
                  <div className="map-floating-panel px-6 py-4 rounded-3xl text-center">
                    <span className="block text-xs font-semibold glass-heading">
                      {selectedDateHasNoObservations
                        ? `No observations for ${formatDate(selectedDate)}`
                        : "No matching records"}
                    </span>
                    <span className="block mt-1 text-xs glass-muted">
                      {selectedDateHasNoObservations
                        ? "No FIRMS observations are available for this date. Choose an observed date to show fire locations on the map."
                        : "No detections match the selected filters. Try changing the date, country, sensor, or severity filters."}
                    </span>
                    {selectedDateHasNoObservations && previousAvailableDate && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDate(previousAvailableDate);
                          setOffset(0);
                        }}
                        className="mt-3 px-4 py-1.5 glass-btn-primary rounded-full text-xs font-semibold"
                      >
                        {hasEarlierAvailableDate ? "Show previous available date" : "Show earliest available date"}
                        <span className="ml-1 font-normal">({formatDate(previousAvailableDate)})</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* FLOATING LEGEND CARD (Bottom-Right) */}
          <div className="absolute bottom-4 right-4 z-10 map-floating-panel map-floating-panel-readable rounded-3xl p-4 w-64 xl:w-72 pointer-events-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold glass-heading">Legend</span>
              <button
                type="button"
                onClick={() => setIsLegendCollapsed(!isLegendCollapsed)}
                className="glass-icon-btn p-1.5 rounded-full"
                aria-label={isLegendCollapsed ? "Expand legend" : "Collapse legend"}
                title={isLegendCollapsed ? "Expand legend" : "Collapse legend"}
              >
                {isLegendCollapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>

            {!isLegendCollapsed && (
              <>
                {/* Segmented Filter Control */}
                <div className="glass-pill-track p-1 rounded-full flex gap-1 mb-3">
                  <button
                    type="button"
                    onClick={() => setSelectedSensor(null)}
                    className={`flex-1 py-1 text-xs font-semibold rounded-full transition-all ${
                      selectedSensor === null ? "glass-pill-active" : "glass-pill-inactive"
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSensor("MODIS")}
                    className={`flex-1 py-1 text-xs font-semibold rounded-full transition-all ${
                      selectedSensor === "MODIS" ? "glass-pill-active" : "glass-pill-inactive"
                    }`}
                  >
                    MODIS
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSensor("VIIRS")}
                    className={`flex-1 py-1 text-xs font-semibold rounded-full transition-all ${
                      selectedSensor === "VIIRS" ? "glass-pill-active" : "glass-pill-inactive"
                    }`}
                  >
                    VIIRS
                  </button>
                </div>

                {/* Burn Severity Row */}
                <div className="mb-2">
                  <span className="text-[11px] glass-subtle font-medium block">
                    Burn Severity
                  </span>
                  <div className="text-xl font-bold glass-heading tabular-nums">
                    {periodMeanBurnIndex !== null ? `${formatBurnIndex(periodMeanBurnIndex)} Avg.` : "No observations"}
                  </div>
                  <span className="text-[10px] glass-subtle block">
                    Relative fire-activity score
                  </span>
                </div>

                {/* Gradient Scale Bar */}
                <div
                  className="h-2 rounded-full w-full mt-2"
                  style={{
                    background:
                      "linear-gradient(to right, #c7d2fe, #818cf8, #38bdf8, #2563eb, #1e1b4b)",
                  }}
                />
                <div className="flex justify-between text-[10px] glass-subtle mt-1 font-sans tabular-nums">
                  <span>0</span>
                  <span>20</span>
                  <span>40</span>
                  <span>60</span>
                  <span>80</span>
                  <span>100</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 4. DATASET SNAPSHOT MODAL (Triggered by "Dataset snapshot") */}
      {isSnapshotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-md p-4">
          <div className="glass-panel-strong rounded-3xl max-w-lg w-full p-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 glass-divider-b mb-4">
              <div className="flex items-center gap-2">
                <Camera size={18} className="tone-blue" />
                <h3 className="text-base font-bold glass-heading">
                  Dataset Snapshot
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSnapshotOpen(false)}
                aria-label="Close snapshot modal"
                className="glass-icon-btn p-1.5 rounded-full"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {statsLoading ? (
                <div className="text-center py-6 text-sm glass-muted">
                  Loading system statistics...
                </div>
              ) : statsError ? (
                <div className="text-center py-6 text-sm tone-rose">
                  Unable to load statistics.
                </div>
              ) : stats ? (
                <>
                  <section className="glass-subcard rounded-2xl p-4 space-y-2">
                    <h4 className="text-xs font-bold tone-blue uppercase tracking-wider">
                      Dataset Coverage
                    </h4>
                    <div className="flex justify-between text-xs">
                      <span className="glass-muted">Period</span>
                      <span className="font-semibold glass-heading">
                        {formatDate(stats.coverage.start_date)} — {formatDate(stats.coverage.end_date)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="glass-muted">Observed Dates</span>
                      <span className="font-semibold glass-heading tabular-nums">
                        {formatCount(stats.coverage.observed_dates)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="glass-muted">Unique H3 Cells</span>
                      <span className="font-semibold glass-heading tabular-nums">
                        {formatCount(stats.coverage.unique_h3_cells)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="glass-muted">H3 Resolution</span>
                      <span className="font-semibold glass-heading tabular-nums">
                        {stats.coverage.h3_resolution ?? "7"}
                      </span>
                    </div>
                  </section>

                  <section className="glass-subcard rounded-2xl p-4 space-y-2">
                    <h4 className="text-xs font-bold tone-cyan uppercase tracking-wider">
                      Sensor Mix
                    </h4>
                    <div className="flex justify-between text-xs">
                      <span className="glass-muted">MODIS Raw Detections</span>
                      <span className="font-semibold glass-heading tabular-nums">
                        {formatCount(stats.sensors.modis_observations)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="glass-muted">VIIRS Raw Detections</span>
                      <span className="font-semibold glass-heading tabular-nums">
                        {formatCount(stats.sensors.viirs_observations)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="glass-muted">Dual-Sensor Harmonized</span>
                      <span className="font-semibold glass-heading tabular-nums">
                        {formatCount(stats.sensors.both_sensor_cell_dates)}
                      </span>
                    </div>
                  </section>

                  <section className="glass-subcard rounded-2xl p-4 space-y-2">
                    <h4 className="text-xs font-bold tone-emerald uppercase tracking-wider">
                      Burn Index Metrics
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="glass-muted">Mean</span>
                        <span className="font-semibold glass-heading tabular-nums">
                          {formatBurnIndex(stats.burn_index.mean)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="glass-muted">Median</span>
                        <span className="font-semibold glass-heading tabular-nums">
                          {formatBurnIndex(stats.burn_index.median)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="glass-muted">Minimum</span>
                        <span className="font-semibold glass-heading tabular-nums">
                          {formatBurnIndex(stats.burn_index.minimum)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="glass-muted">Maximum</span>
                        <span className="font-semibold glass-heading tabular-nums">
                          {formatBurnIndex(stats.burn_index.maximum)}
                        </span>
                      </div>
                      <div className="flex justify-between col-span-2">
                        <span className="glass-muted">P95 (Extreme Threshold)</span>
                        <span className="font-semibold glass-heading tabular-nums">
                          {formatBurnIndex(stats.burn_index.p95)}
                        </span>
                      </div>
                    </div>
                  </section>
                </>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setIsSnapshotOpen(false)}
                className="px-5 py-2 glass-btn-primary rounded-full text-xs font-semibold"
              >
                Close Snapshot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
