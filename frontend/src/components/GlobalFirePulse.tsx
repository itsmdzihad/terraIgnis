import React, { useState, useMemo } from "react";
import { cellToLatLng, latLngToCell } from "h3-js";
import {
  Camera,
  SlidersHorizontal,
  MoreHorizontal,
  ChevronUp,
  ChevronDown,
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
import FireActivityTrendsChart from "./FireActivityTrendsChart";

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
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);
  const [isLegendCollapsed, setIsLegendCollapsed] = useState(false);

  const {
    selectedDate,
    selectedStartDate,
    selectedEndDate,
    selectedH3Cell,
    selectedCountry,
    selectedSensor,
    minBurnIndex,
    maxBurnIndex,
    setSelectedDate,
    setSelectedH3Cell,
    setSelectedCountry,
    setSelectedSensor,
    setBurnIndexRange,
    clearFilters,
  } = useDashboard();

  const selectedYear = Number(selectedStartDate.slice(0, 4));
  const pageSize = 5000;

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

  const records = selectedCountry ? countryFires.records : data?.data ?? [];
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

  const sortedCalendarDays = useMemo(
    () => [...(calendarData?.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [calendarData]
  );

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

    const viirsCirc = 2 * Math.PI * 62;
    const modisCirc = 2 * Math.PI * 48;
    const dualCirc = 2 * Math.PI * 34;

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
    selectedDate || activeFiltersCount > 0
      ? loading
        ? undefined
        : data?.total
      : stats?.coverage.total_raw_observations ?? data?.total;

  const activeCellsHeadline =
    activeFiltersCount > 0
      ? loading
        ? undefined
        : h3Cells.length
      : stats?.coverage.unique_h3_cells ?? (h3Cells.length > 0 ? h3Cells.length : undefined);

  return (
    <div className="dataplay-overview flex flex-col h-full w-full overflow-y-auto lg:overflow-hidden p-3 lg:p-4 gap-3">
      {/* MAIN CONTENT STAGE (Left Cards Panel & Right Map with Floating Controls) */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3.5 lg:overflow-hidden">
        {/* LEFT COLUMN: CARDS DASHBOARD (No internal scrollbar on desktop) */}
        <div className="w-full lg:w-[460px] xl:w-[490px] shrink-0 flex flex-col gap-3 lg:h-full lg:min-h-0 lg:overflow-hidden">
          {/* ROW 1: SESSIONS & USERS CARDS (2-Col Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
            {/* CARD 1: ACTIVE DETECTIONS */}
            <div className="dataplay-card p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold glass-title">
                    Active Detections
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

                <div className="flex items-center gap-2 mt-0.5 mb-2">
                  <span className="text-xl font-bold tracking-tight glass-heading tabular-nums">
                    {formatCount(activeDetectionsHeadline)}
                  </span>
                  {renderDeltaBadge(
                    telemetryDeltas.detectionDelta15d,
                    "Recent 15d vs prior 15d active detections (from /api/calendar)"
                  )}
                </div>

                {/* Live Daily Waveform Bars (Last 22 Observed Days from /api/calendar) */}
                <div className="flex items-center gap-[3px] h-4 py-0.5 mb-2.5">
                  {detectionBars.length > 0
                    ? detectionBars.map((bar, idx) => (
                        <div
                          key={bar.date}
                          title={`${formatDate(bar.date)}: ${bar.fireCount.toLocaleString()} cell-dates`}
                          className="flex-1 rounded-full transition-all duration-200"
                          style={{
                            height: `${bar.pct}%`,
                            backgroundColor: idx < Math.ceil(detectionBars.length / 2) ? "#0062ff" : "#00c7d4",
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
              <div className="space-y-1 glass-divider-t pt-2">
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
            <div className="dataplay-card p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold glass-title">
                    H3 Active Cells
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
                  Unique H3 Cells
                </span>

                <div className="flex items-center gap-2 mt-0.5 mb-1.5">
                  <span className="text-xl font-bold tracking-tight glass-heading tabular-nums">
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
              <div className="h-14 flex items-end gap-1.5 pt-1">
                {monthlyAnomalyCounts.map((count, index) => {
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
                          backgroundColor: "#0062ff",
                          opacity: count === 0 ? 0.2 : 1,
                        }}
                      />
                      <span className="text-[8px] glass-subtle mt-1 uppercase font-sans">
                        {monthNames[index][0]}
                      </span>
                      {/* Tooltip on hover */}
                      <div className="glass-tooltip absolute -top-7 z-20 hidden group-hover:block text-[9px] px-2 py-0.5 rounded-full whitespace-nowrap pointer-events-none">
                        {monthNames[index]}: {count}
                      </div>
                    </div>
                  );
                })}
                {anomaliesLoading && <span className="w-full text-center text-[10px] text-slate-500">Loading anomaly data…</span>}
                {anomaliesError && <span className="w-full text-center text-[10px] text-slate-500">Anomaly data unavailable</span>}
              </div>
            </div>
          </div>

          {/* ROW 2: SEVERITY DISTRIBUTION */}
          <div className="dataplay-card p-3.5 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold glass-title">
                Burn Severity & Sensor Mix
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

            <div className="grid grid-cols-12 items-center gap-2">
              {/* Left Column Stats */}
              <div className="col-span-3 flex flex-col justify-between h-full">
                <div>
                  <span className="text-[11px] glass-subtle font-medium block">Mean Index</span>
                  <div className="text-lg font-bold glass-heading tabular-nums mt-0.5">
                    {formatBurnIndex(stats?.burn_index.mean)}
                  </div>
                  <div className="mt-0.5">
                    {renderDeltaBadge(
                      telemetryDeltas.burnIndexDelta30d,
                      "Last 30d vs prior 30d mean Burn Index (from /api/calendar)"
                    )}
                  </div>
                </div>

                <div className="space-y-1 mt-2.5">
                  <div
                    className="flex items-center gap-1.5 text-[11px] glass-muted"
                    title={`VIIRS raw share: ${sensorRingMetrics.viirsPct.toFixed(1)}%`}
                  >
                    <span className="h-2 w-2 rounded-full bg-[#0062ff]" />
                    <span>VIIRS Raw</span>
                  </div>
                  <div
                    className="flex items-center gap-1.5 text-[11px] glass-muted"
                    title={`MODIS raw share: ${sensorRingMetrics.modisPct.toFixed(1)}%`}
                  >
                    <span className="h-2 w-2 rounded-full bg-[#00c7d4]" />
                    <span>MODIS Raw</span>
                  </div>
                  <div
                    className="flex items-center gap-1.5 text-[11px] glass-muted"
                    title={`Dual-sensor share of cell-dates: ${sensorRingMetrics.dualPct.toFixed(1)}%`}
                  >
                    <span className="h-2 w-2 rounded-full bg-[#84cc16]" />
                    <span>Dual Match</span>
                  </div>
                </div>
              </div>

              {/* Center Concentric Rings Graphic (proportional to /api/stats) */}
              <div className="col-span-6 flex items-center justify-center">
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                    {/* Ring 1 - Outer (VIIRS Share of Raw Observations) */}
                    <circle
                      cx="80"
                      cy="80"
                      r="62"
                      fill="none"
                      stroke="var(--ring-track)"
                      strokeWidth="8"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="62"
                      fill="none"
                      stroke="#0062ff"
                      strokeWidth="8"
                      strokeDasharray={sensorRingMetrics.viirsCirc.toFixed(2)}
                      strokeDashoffset={sensorRingMetrics.viirsOffset.toFixed(2)}
                      strokeLinecap="round"
                    />

                    {/* Ring 2 - Middle (MODIS Share of Raw Observations) */}
                    <circle
                      cx="80"
                      cy="80"
                      r="48"
                      fill="none"
                      stroke="var(--ring-track)"
                      strokeWidth="8"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="48"
                      fill="none"
                      stroke="#00c7d4"
                      strokeWidth="8"
                      strokeDasharray={sensorRingMetrics.modisCirc.toFixed(2)}
                      strokeDashoffset={sensorRingMetrics.modisOffset.toFixed(2)}
                      strokeLinecap="round"
                    />

                    {/* Ring 3 - Inner (Dual-Sensor Share of Cell-Dates) */}
                    <circle
                      cx="80"
                      cy="80"
                      r="34"
                      fill="none"
                      stroke="var(--ring-track)"
                      strokeWidth="8"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="34"
                      fill="none"
                      stroke="#84cc16"
                      strokeWidth="8"
                      strokeDasharray={sensorRingMetrics.dualCirc.toFixed(2)}
                      strokeDashoffset={sensorRingMetrics.dualOffset.toFixed(2)}
                      strokeLinecap="round"
                    />
                  </svg>

                  {/* Center Metric */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                    <span className="text-xs font-bold glass-heading tracking-tight tabular-nums">
                      {formatCount(stats?.coverage.total_raw_observations)}
                    </span>
                    <span className="text-[9px] glass-subtle font-medium leading-tight">Observations</span>
                  </div>
                </div>
              </div>

              {/* Right Column Stats */}
              <div className="col-span-3 flex flex-col justify-between h-full text-right">
                <div>
                  <span className="text-[11px] glass-subtle font-medium block">Outliers</span>
                  <div className="text-lg font-bold glass-heading tabular-nums mt-0.5">
                    {formatCount(stats?.anomalies.total_anomalous ?? anomalyRecords?.length)}
                  </div>
                  <div className="mt-0.5">
                    {renderDeltaBadge(
                      telemetryDeltas.anomalyDelta30d,
                      "Last 30d vs prior 30d anomalies (from /api/calendar)"
                    )}
                  </div>
                </div>

                <div className="mt-2.5">
                  <span className="text-[11px] glass-subtle font-medium block">Cell-Dates</span>
                  <div className="text-lg font-bold glass-heading tabular-nums mt-0.5">
                    {formatCount(stats?.coverage.total_h3_cell_dates)}
                  </div>
                  <div className="mt-0.5">
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

        {/* RIGHT COLUMN: MAP CONTAINER WITH FLOATING OVERLAYS */}
        <div className="flex-1 min-w-0 min-h-[380px] lg:min-h-0 h-full relative rounded-3xl overflow-hidden glass-panel flex flex-col">
          {/* Top Floating Bar: Title + Record Count Summary on Left | Moved Toolbar Controls on Right */}
          <div className="absolute top-3.5 left-3.5 right-3.5 z-30 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            <div className="pointer-events-auto glass-panel-strong rounded-full px-4 py-1.5 flex items-center gap-2.5 max-w-full">
              <h1 className="text-xs font-bold tracking-tight glass-heading whitespace-nowrap">
                Fire Overview
              </h1>
              <span className="h-3.5 w-px bg-slate-400/35 shrink-0" />
              <span className="text-xs font-medium glass-muted truncate tabular-nums">
                {data?.total == null
                  ? "Detections by H3 cell"
                  : `Showing ${formatCount(data.count)} of ${formatCount(data.total)} cell-date records`}
              </span>
            </div>

            <div className="pointer-events-auto glass-panel-strong rounded-full p-1 flex items-center gap-1.5">
              {/* Dataset snapshot action pill */}
              <button
                type="button"
                onClick={() => setIsSnapshotOpen(true)}
                className="glass-btn inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold"
              >
                <Camera size={13} className="glass-muted" />
                <span>Dataset snapshot</span>
              </button>

              {/* Filters Toggle Button */}
              <button
                type="button"
                onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold ${
                  isFiltersOpen || activeFiltersCount > 0 ? "glass-btn-active" : "glass-btn"
                }`}
              >
                <SlidersHorizontal size={13} />
                <span>Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {/* Refresh Action */}
              <button
                type="button"
                onClick={() => {
                  refetch();
                  refetchStats();
                  refetchAnomalies();
                  refetchCalendar();
                }}
                title="Refresh data"
                aria-label="Refresh data"
                className="glass-btn p-1.5 rounded-full"
              >
                <RotateCw
                  size={13}
                  className={loading || calendarLoading ? "animate-spin tone-blue" : "glass-muted"}
                />
              </button>
            </div>
          </div>

          {/* COLLAPSIBLE FLOATING FILTER DRAWER / POPOVER */}
          {isFiltersOpen && (
            <section
              aria-label="Fire API filters"
              className="absolute top-16 left-3.5 right-3.5 z-30 glass-panel-strong rounded-3xl p-4 sm:p-5 max-h-[calc(100%-5rem)] overflow-y-auto"
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
                  Observation Date
                  <input
                    type="date"
                    value={selectedDate ?? ""}
                    onChange={(event) => {
                      setSelectedDate(event.target.value || null);
                      setOffset(0);
                    }}
                    className="mt-1 block w-full glass-control rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </label>

                <label className="text-[11px] font-medium glass-muted">
                  Sensor Type
                  <select
                    value={selectedSensor ?? ""}
                    onChange={(event) => {
                      setSelectedSensor((event.target.value || null) as FireSensor | null);
                      setOffset(0);
                    }}
                    className="mt-1 block w-full glass-control rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    <option value="">All sensors (Harmonized)</option>
                    <option value="MODIS">MODIS</option>
                    <option value="VIIRS">VIIRS</option>
                    <option value="BOTH">Both sensors</option>
                  </select>
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
                    className="mt-1 block w-full glass-control rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40"
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
                    className="mt-1 block w-full glass-control rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </label>

                <label className="text-[11px] font-medium glass-muted">
                  Selected H3 Cell
                  <select
                    value={selectedH3Cell ?? ""}
                    onChange={(event) => setSelectedH3Cell(event.target.value || null)}
                    className="mt-1 block w-full glass-control rounded-xl px-2.5 py-1.5 text-xs font-sans tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/40"
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
                      className="w-1/2 glass-control rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40"
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
                      className="w-1/2 glass-control rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40"
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

              <div className="flex items-center justify-between glass-divider-t mt-3 pt-2.5">
                <span className="text-xs glass-muted">
                  Showing page {Math.floor(offset / pageSize) + 1} ({records.length} records)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={offset === 0 || loading}
                    onClick={() => setOffset(Math.max(0, offset - pageSize))}
                    className="px-3.5 py-1 rounded-full glass-btn text-xs font-semibold disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!data?.has_more || loading}
                    onClick={() => setOffset(offset + pageSize)}
                    className="px-3.5 py-1 rounded-full glass-btn text-xs font-semibold disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
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
            {(loading || error || (!loading && data?.count === 0)) && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/35 backdrop-blur-xs p-4">
                {loading ? (
                  <div className="glass-panel-strong px-6 py-4 rounded-3xl text-center">
                    <span className="block text-xs font-semibold glass-heading">
                      Loading detections...
                    </span>
                  </div>
                ) : error ? (
                  <div className="max-w-sm glass-panel-strong px-6 py-4 rounded-3xl text-center">
                    <span className="block text-xs font-semibold tone-rose">
                      Unable to load fire detections.
                    </span>
                    <button
                      type="button"
                      onClick={refetch}
                      className="mt-3 px-4 py-1.5 glass-btn-primary rounded-full text-xs font-semibold"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="glass-panel-strong px-6 py-4 rounded-3xl text-center">
                    <span className="block text-xs font-semibold glass-heading">
                      No matching records
                    </span>
                    <span className="block mt-1 text-xs glass-muted">
                      No detections match the selected parameters.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* FLOATING LEGEND CARD (Bottom-Right) */}
          <div className="absolute bottom-4 right-4 z-10 glass-panel-strong rounded-3xl p-4 w-72 pointer-events-auto">
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
                    {stats?.burn_index.mean ? `${formatBurnIndex(stats.burn_index.mean)} Avg.` : "0 — 100"}
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
                      "linear-gradient(to right, #c7f9cc, #80ed99, #38bdf8, #0062ff, #0a2540)",
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
