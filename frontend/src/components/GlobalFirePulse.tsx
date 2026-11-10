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
    selectedSensor,
    minBurnIndex,
    maxBurnIndex,
    setSelectedDate,
    setSelectedH3Cell,
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

  const records = data?.data ?? [];
  const mapFireData = useMemo(
    () =>
      loading
        ? []
        : records.map((record) => ({
            h3Index: record.h3_cell,
            burnIndex: record.burn_index,
          })),
    [loading, records]
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
    return count;
  }, [selectedDate, selectedSensor, minBurnIndex, maxBurnIndex, selectedH3Cell]);

  const monthlyTrendPath = useMemo(() => {
    const max = Math.max(1, ...monthlyAnomalyCounts);
    return monthlyAnomalyCounts
      .map((count, index) => {
        const x = 35 + (310 * index) / Math.max(1, monthlyAnomalyCounts.length - 1);
        const y = 96 - (count / max) * 72;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [monthlyAnomalyCounts]);

  const totalObservations = stats?.coverage.total_raw_observations ?? 0;
  const sensorRatios = stats
    ? [stats.sensors.viirs_observations, stats.sensors.modis_observations, stats.sensors.both_sensor_cell_dates]
        .map((value) => Math.max(0, Math.min(1, totalObservations > 0 ? value / totalObservations : 0)))
    : [0, 0, 0];

  return (
    <div className="dataplay-overview flex flex-col h-full w-full overflow-hidden p-4 lg:p-6 gap-4">
      {/* 1. TOP HEADER */}
      <header className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl lg:text-[26px] font-bold tracking-tight text-slate-900">
            Fire Overview
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Dataset snapshot action pill */}
          <button
            type="button"
            onClick={() => setIsSnapshotOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-xs transition-colors"
          >
            <Camera size={14} className="text-slate-500" />
            <span>Dataset snapshot</span>
          </button>

          {/* Filters Toggle Button */}
          <button
            type="button"
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border shadow-xs transition-colors ${
              isFiltersOpen || activeFiltersCount > 0
                ? "bg-blue-50 border-blue-200 text-blue-600"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
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
            }}
            title="Refresh data"
            className="p-1.5 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
          >
            <RotateCw size={14} className={loading ? "animate-spin text-blue-600" : ""} />
          </button>
        </div>
      </header>

      {/* 2. COLLAPSIBLE FILTER DRAWER / PANEL */}
      {isFiltersOpen && (
        <section
          aria-label="Fire API filters"
          className="dataplay-card p-4 shrink-0 shadow-md border border-slate-200"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Filter size={15} className="text-blue-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
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
                  className="text-xs font-semibold text-rose-500 hover:text-rose-600 px-2 py-0.5"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsFiltersOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <label className="text-[11px] font-medium text-slate-500">
              Observation Date
              <input
                type="date"
                value={selectedDate ?? ""}
                onChange={(event) => {
                  setSelectedDate(event.target.value || null);
                  setOffset(0);
                }}
                className="mt-1 block w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 shadow-xs focus:ring-1 focus:ring-blue-500"
              />
            </label>

            <label className="text-[11px] font-medium text-slate-500">
              Sensor Type
              <select
                value={selectedSensor ?? ""}
                onChange={(event) => {
                  setSelectedSensor((event.target.value || null) as FireSensor | null);
                  setOffset(0);
                }}
                className="mt-1 block w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 shadow-xs focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All sensors (Harmonized)</option>
                <option value="MODIS">MODIS</option>
                <option value="VIIRS">VIIRS</option>
                <option value="BOTH">Both sensors</option>
              </select>
            </label>

            <label className="text-[11px] font-medium text-slate-500">
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
                className="mt-1 block w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 shadow-xs placeholder:text-slate-400 focus:ring-1 focus:ring-blue-500"
              />
            </label>

            <label className="text-[11px] font-medium text-slate-500">
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
                className="mt-1 block w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 shadow-xs placeholder:text-slate-400 focus:ring-1 focus:ring-blue-500"
              />
            </label>

            <label className="text-[11px] font-medium text-slate-500">
              Selected H3 Cell
              <select
                value={selectedH3Cell ?? ""}
                onChange={(event) => setSelectedH3Cell(event.target.value || null)}
                className="mt-1 block w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 shadow-xs focus:ring-1 focus:ring-blue-500"
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
              <span className="text-[11px] font-medium text-slate-500 block mb-1">
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
                  className="w-1/2 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-400"
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
                  className="w-1/2 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
                >
                  Go
                </button>
              </div>
              {coordinateError && (
                <span className="text-[10px] text-rose-500 mt-1">{coordinateError}</span>
              )}
            </form>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 mt-3 pt-2.5">
            <span className="text-xs text-slate-500">
              Showing page {Math.floor(offset / pageSize) + 1} ({records.length} records)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={offset === 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - pageSize))}
                className="px-3 py-1 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 disabled:opacity-40 hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!data?.has_more || loading}
                onClick={() => setOffset(offset + pageSize)}
                className="px-3 py-1 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 disabled:opacity-40 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 3. MAIN CONTENT STAGE (Reference picture split layout: Left Cards Panel & Right Map) */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 overflow-hidden">
        {/* LEFT COLUMN: CARDS DASHBOARD (Width ~480px on desktop) */}
        <div className="w-full lg:w-[480px] xl:w-[500px] shrink-0 flex flex-col gap-3.5 overflow-y-auto pr-1">
          {/* ROW 1: SESSIONS & USERS CARDS (2-Col Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* CARD 1: SESSIONS EQUIVALENT -> ACTIVE DETECTIONS */}
            <div className="dataplay-card p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-800">
                    Active Detections
                  </span>
                  <button
                    type="button"
                    title="More actions"
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>
                <span className="text-[11px] text-slate-400 font-medium block">
                  {selectedDate ? formatDate(selectedDate) : "Current Window"}
                </span>

                <div className="flex items-center gap-2 mt-1 mb-3">
                  <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                    {formatCount(data?.total ?? stats?.coverage.total_raw_observations)}
                  </span>
                </div>
              </div>

              {/* Breakdown Rows */}
              <div className="space-y-1.5 border-t border-slate-100 pt-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">VIIRS Detections</span>
                  <span className="font-semibold text-slate-800 tabular-nums">
                    {formatCount(stats?.sensors.viirs_observations)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">MODIS Detections</span>
                  <span className="font-semibold text-slate-800 tabular-nums">
                    {formatCount(stats?.sensors.modis_observations)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Dual-Sensor Match</span>
                  <span className="font-semibold text-slate-800 tabular-nums">
                    {formatCount(stats?.sensors.both_sensor_cell_dates)}
                  </span>
                </div>
              </div>
            </div>

            {/* CARD 2: USERS EQUIVALENT -> H3 ACTIVE CELLS */}
            <div className="dataplay-card p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-800">
                    H3 Active Cells
                  </span>
                  <button
                    type="button"
                    title="More actions"
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>
                <span className="text-[11px] text-slate-400 font-medium block">
                  Unique H3 Cells
                </span>

                <div className="flex items-center gap-2 mt-1 mb-2">
                  <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                    {formatCount(
                      data ? h3Cells.length : stats?.coverage.unique_h3_cells
                    )}
                  </span>
                </div>

                <span className="text-[11px] text-slate-400 font-medium block mb-2">
                  Observed anomalies per month
                </span>
              </div>

              {/* Monthly Vertical Bar Chart (Matches "Users per minutes" in reference) */}
              <div className="h-20 flex items-end gap-1.5 pt-2">
                {anomalyRecords && monthlyAnomalyCounts.map((count, index) => {
                  const normalizedHeight = count > 0
                    ? Math.max(4, Math.round((count / maxMonthlyAnomalies) * 100))
                    : 0;
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
                        }}
                      />
                      <span className="text-[8px] text-slate-400 mt-1 uppercase font-sans">
                        {monthNames[index][0]}
                      </span>
                      {/* Tooltip on hover */}
                      <div className="absolute -top-7 z-20 hidden group-hover:block bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap pointer-events-none">
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

          {/* ROW 2: USERS BY AUDIENCE EQUIVALENT -> SEVERITY DISTRIBUTION */}
          <div className="dataplay-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-800">
                Burn Severity & Sensor Mix
              </span>
              <button
                type="button"
                title="More actions"
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>

            <div className="grid grid-cols-12 items-center gap-2">
              {/* Left Column Stats */}
              <div className="col-span-3 flex flex-col justify-between h-full">
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Mean Index</span>
                  <div className="text-xl font-bold text-slate-900 tabular-nums mt-0.5">
                    {formatBurnIndex(stats?.burn_index.mean)}
                  </div>
                </div>

                <div className="space-y-1.5 mt-4">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <span className="h-2 w-2 rounded-full bg-[#0062ff]" />
                    <span>VIIRS Raw</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <span className="h-2 w-2 rounded-full bg-[#00c7d4]" />
                    <span>MODIS Raw</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <span className="h-2 w-2 rounded-full bg-[#84cc16]" />
                    <span>Dual Match</span>
                  </div>
                </div>
              </div>

              {/* Center Concentric Rings Graphic (Matches reference graphic) */}
              <div className="col-span-6 flex items-center justify-center">
                <div className="relative w-40 h-40 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                    {/* Ring 1 - Outer (Royal Blue) */}
                    <circle
                      cx="80"
                      cy="80"
                      r="62"
                      fill="none"
                      stroke="#eef2f8"
                      strokeWidth="8"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="62"
                      fill="none"
                      stroke="#0062ff"
                      strokeWidth="8"
                      strokeDasharray="389.5"
                      strokeDashoffset={389.5 * (1 - sensorRatios[0])}
                      strokeLinecap="round"
                    />

                    {/* Ring 2 - Middle (Cyan) */}
                    <circle
                      cx="80"
                      cy="80"
                      r="48"
                      fill="none"
                      stroke="#eef2f8"
                      strokeWidth="8"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="48"
                      fill="none"
                      stroke="#00c7d4"
                      strokeWidth="8"
                      strokeDasharray="301.6"
                      strokeDashoffset={301.6 * (1 - sensorRatios[1])}
                      strokeLinecap="round"
                    />

                    {/* Ring 3 - Inner (Lime Green) */}
                    <circle
                      cx="80"
                      cy="80"
                      r="34"
                      fill="none"
                      stroke="#eef2f8"
                      strokeWidth="8"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="34"
                      fill="none"
                      stroke="#84cc16"
                      strokeWidth="8"
                      strokeDasharray="213.6"
                      strokeDashoffset={213.6 * (1 - sensorRatios[2])}
                      strokeLinecap="round"
                    />
                  </svg>

                  {/* Center Metric */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-base font-bold text-slate-900 tracking-tight tabular-nums">
                      {formatCount(stats?.coverage.total_raw_observations)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">All Observations</span>
                  </div>
                </div>
              </div>

              {/* Right Column Stats */}
              <div className="col-span-3 flex flex-col justify-between h-full text-right">
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Outliers</span>
                  <div className="text-xl font-bold text-slate-900 tabular-nums mt-0.5">
                    {formatCount(anomalyRecords?.length)}
                  </div>
                </div>

                <div className="mt-4">
                  <span className="text-[11px] text-slate-400 font-medium block">Cell-Dates</span>
                  <div className="text-xl font-bold text-slate-900 tabular-nums mt-0.5">
                    {formatCount(stats?.coverage.total_h3_cell_dates)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ROW 3: Dataset metrics and monthly anomaly history */}
          <div className="dataplay-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-800">
                Dataset Metrics
              </span>
              <button
                type="button"
                title="More actions"
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>

            {/* Values are supplied by the statistics endpoint. */}
            <div className="grid grid-cols-3 gap-2 border-b border-slate-100 pb-3 mb-2">
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Mean Score</span>
                <div className="text-base font-bold text-slate-900 tabular-nums mt-0.5">
                  {formatBurnIndex(stats?.burn_index.mean)}
                </div>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Max Index</span>
                <div className="text-base font-bold text-slate-900 tabular-nums mt-0.5">
                  {formatBurnIndex(stats?.burn_index.maximum)}
                </div>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Cell-Dates</span>
                <div className="text-base font-bold text-slate-900 tabular-nums mt-0.5">
                  {formatCount(stats?.coverage.total_h3_cell_dates)}
                </div>
              </div>
            </div>

            <div className="h-28 relative flex items-center">
              {anomaliesLoading ? (
                <p className="w-full text-center text-xs text-slate-500">Loading monthly anomaly data…</p>
              ) : anomaliesError ? (
                <p className="w-full text-center text-xs text-slate-500">Monthly anomaly data unavailable.</p>
              ) : anomalyRecords?.length === 0 ? (
                <p className="w-full text-center text-xs text-slate-500">No anomaly records in the selected period.</p>
              ) : anomalyRecords ? (
                <svg className="w-full h-full" viewBox="0 0 360 110" preserveAspectRatio="none" aria-label="Monthly anomaly counts">
                  <text x="2" y="24" className="text-[9px] fill-slate-400 font-mono">{formatCount(maxMonthlyAnomalies)}</text>
                  <text x="2" y="62" className="text-[9px] fill-slate-400 font-mono">{formatCount(Math.round(maxMonthlyAnomalies / 2))}</text>
                  <text x="2" y="100" className="text-[9px] fill-slate-400 font-mono">0</text>
                  {[20, 56, 92].map((y) => <line key={y} x1="32" y1={y} x2="355" y2={y} stroke="#64748b" strokeOpacity=".25" strokeWidth="1" />)}
                  <path d={monthlyTrendPath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: MAP CONTAINER WITH FLOATING OVERLAYS */}
        <div className="flex-1 min-w-0 h-full relative rounded-2xl overflow-hidden border border-slate-200/80 bg-white shadow-xs flex flex-col">
          {/* Top Left Floating Pill: Record Count Summary */}
          <div className="absolute top-4 left-4 z-10 bg-white/95 border border-slate-200/90 rounded-xl px-3.5 py-2 shadow-md backdrop-blur-md max-w-sm pointer-events-none">
            <span className="text-xs font-semibold text-slate-800 block">
              {data?.total == null
                ? "Detections by H3 cell"
                : `Showing ${formatCount(data.count)} of ${formatCount(data.total)} cell-date records`}
            </span>
          </div>

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
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-xs p-4">
                {loading ? (
                  <div className="bg-white border border-slate-200 shadow-xl px-5 py-4 rounded-xl text-center">
                    <span className="block text-xs font-semibold text-slate-700">
                      Loading detections...
                    </span>
                  </div>
                ) : error ? (
                  <div className="max-w-sm bg-white border border-rose-200 shadow-xl px-5 py-4 rounded-xl text-center">
                    <span className="block text-xs font-semibold text-rose-600">
                      Unable to load fire detections.
                    </span>
                    <button
                      type="button"
                      onClick={refetch}
                      className="mt-3 px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 shadow-xl px-5 py-4 rounded-xl text-center">
                    <span className="block text-xs font-semibold text-slate-700">
                      No matching records
                    </span>
                    <span className="block mt-1 text-xs text-slate-500">
                      No detections match the selected parameters.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* FLOATING LEGEND CARD (Bottom-Right, matches reference mockup) */}
          <div className="absolute bottom-4 right-4 z-10 bg-white/95 border border-slate-200/90 rounded-2xl p-4 shadow-xl backdrop-blur-md w-72 pointer-events-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-slate-800">Legend</span>
              <button
                type="button"
                onClick={() => setIsLegendCollapsed(!isLegendCollapsed)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                title={isLegendCollapsed ? "Expand legend" : "Collapse legend"}
              >
                {isLegendCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>

            {!isLegendCollapsed && (
              <>
                {/* Segmented Filter Control (Matches State | County | Region in reference) */}
                <div className="bg-slate-100 p-1 rounded-lg flex gap-1 mb-3">
                  <button
                    type="button"
                    onClick={() => setSelectedSensor(null)}
                    className={`flex-1 py-1 text-xs font-semibold rounded-md transition-all ${
                      selectedSensor === null
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSensor("MODIS")}
                    className={`flex-1 py-1 text-xs font-semibold rounded-md transition-all ${
                      selectedSensor === "MODIS"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    MODIS
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSensor("VIIRS")}
                    className={`flex-1 py-1 text-xs font-semibold rounded-md transition-all ${
                      selectedSensor === "VIIRS"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    VIIRS
                  </button>
                </div>

                {/* Audience / Metric Row */}
                <div className="mb-2">
                  <span className="text-[11px] text-slate-400 font-medium block">
                    Burn Severity
                  </span>
                  <div className="text-xl font-bold text-slate-900 tabular-nums">
                    {stats?.burn_index.mean == null ? "Unavailable" : `${formatBurnIndex(stats.burn_index.mean)} Avg.`}
                  </div>
                  <span className="text-[10px] text-slate-400 block">
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
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Camera size={18} className="text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Dataset Snapshot
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSnapshotOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {statsLoading ? (
                <div className="text-center py-6 text-sm text-slate-500">
                  Loading system statistics...
                </div>
              ) : statsError ? (
                <div className="text-center py-6 text-sm text-rose-500">
                  Unable to load statistics.
                </div>
              ) : stats ? (
                <>
                  <section className="bg-slate-50 rounded-xl p-3.5 space-y-2">
                    <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                      Dataset Coverage
                    </h4>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Period</span>
                      <span className="font-semibold text-slate-800">
                        {formatDate(stats.coverage.start_date)} — {formatDate(stats.coverage.end_date)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Observed Dates</span>
                      <span className="font-semibold text-slate-800 tabular-nums">
                        {formatCount(stats.coverage.observed_dates)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Unique H3 Cells</span>
                      <span className="font-semibold text-slate-800 tabular-nums">
                        {formatCount(stats.coverage.unique_h3_cells)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">H3 Resolution</span>
                      <span className="font-semibold text-slate-800 tabular-nums">
                        {stats.coverage.h3_resolution ?? "—"}
                      </span>
                    </div>
                  </section>

                  <section className="bg-slate-50 rounded-xl p-3.5 space-y-2">
                    <h4 className="text-xs font-bold text-cyan-600 uppercase tracking-wider">
                      Sensor Mix
                    </h4>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">MODIS Raw Detections</span>
                      <span className="font-semibold text-slate-800 tabular-nums">
                        {formatCount(stats.sensors.modis_observations)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">VIIRS Raw Detections</span>
                      <span className="font-semibold text-slate-800 tabular-nums">
                        {formatCount(stats.sensors.viirs_observations)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Dual-Sensor Harmonized</span>
                      <span className="font-semibold text-slate-800 tabular-nums">
                        {formatCount(stats.sensors.both_sensor_cell_dates)}
                      </span>
                    </div>
                  </section>

                  <section className="bg-slate-50 rounded-xl p-3.5 space-y-2">
                    <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                      Burn Index Metrics
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Mean</span>
                        <span className="font-semibold text-slate-800">
                          {formatBurnIndex(stats.burn_index.mean)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Median</span>
                        <span className="font-semibold text-slate-800">
                          {formatBurnIndex(stats.burn_index.median)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Minimum</span>
                        <span className="font-semibold text-slate-800">
                          {formatBurnIndex(stats.burn_index.minimum)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Maximum</span>
                        <span className="font-semibold text-slate-800">
                          {formatBurnIndex(stats.burn_index.maximum)}
                        </span>
                      </div>
                      <div className="flex justify-between col-span-2">
                        <span className="text-slate-500">P95 (Extreme Threshold)</span>
                        <span className="font-semibold text-slate-800">
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
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs"
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
