import React, { useState, useEffect, useMemo } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import TerraIgnisMap from "./TerraIgnisMap";
import { useFires } from "../hooks/useFires";
import type { FireSensor } from "../types/fire";
import { useDashboard } from "../context/DashboardContext";
import { useAnomalies } from "../hooks/useAnomalies";
import { useStats } from "../hooks/useStats";

function Metric({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2.5 flex flex-col gap-1">
      <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`text-xl font-semibold tabular-nums ${color}`}>{value}</span>
      <span className="text-[10px] text-slate-500">{detail}</span>
    </div>
  );
}

function formatCount(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString("en-US");
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

function StatRow({ label, value, color = "text-slate-200" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[10px] font-mono">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

export default function GlobalFirePulse() {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [offset, setOffset] = useState(0);
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
    setSelectedYear,
    clearFilters,
  } = useDashboard();
  const selectedYear = Number(selectedStartDate.slice(0, 4));
  const pageSize = 500;

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
  const yearsList = useMemo(() => Array.from({ length: 27 }, (_, index) => 2000 + index), []);
  const h3Cells = useMemo(() => [...new Set(records.map((record) => record.h3_cell))], [records]);
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
    const counts: (number | null)[] = Array(12).fill(null);
    for (const record of anomalyRecords ?? []) {
      const monthIndex = Number(record.acq_date.slice(5, 7)) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        counts[monthIndex] = (counts[monthIndex] ?? 0) + 1;
      }
    }
    return counts;
  }, [anomalyRecords]);
  const maxMonthlyAnomalies = Math.max(1, ...monthlyAnomalyCounts.map((count) => count ?? 0));

  // Auto-play interval
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (isPlaying) {
      timer = setInterval(() => {
        const currentIndex = yearsList.indexOf(selectedYear);
        setSelectedYear(currentIndex === yearsList.length - 1 ? yearsList[0] : yearsList[currentIndex + 1]);
        setOffset(0);
      }, 1800);
    }
    return () => clearInterval(timer);
  }, [isPlaying, yearsList, selectedYear, setSelectedYear]);

  return (
    <div className="flex flex-col h-full bg-slate-950 p-4 lg:p-5 gap-4 overflow-y-auto">
      <section aria-label="Fire API filters" className="shrink-0 border border-slate-800 bg-slate-900/70 rounded-md p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Fire telemetry</h2>
            <p className="text-[10px] font-mono text-slate-500">GET /api/fires · H3 resolution 7</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider ${error ? "text-red-400" : loading ? "text-amber-300" : "text-emerald-400"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${error ? "bg-red-400" : loading ? "bg-amber-300 animate-pulse" : "bg-emerald-400"}`} />
              {error ? "BACKEND UNAVAILABLE" : loading ? "CONNECTING TO BACKEND" : "REAL BACKEND DATA"}
            </span>
            <button type="button" onClick={() => { clearFilters(); setOffset(0); setIsPlaying(false); }} className="border border-slate-700 rounded px-2 py-1 text-[9px] font-mono text-slate-300 hover:border-orange-500">RESET FILTERS</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          <label className="text-[9px] font-mono text-slate-500 uppercase">
            Date
            <input type="date" value={selectedDate ?? ""} onChange={(event) => { setSelectedDate(event.target.value || null); setOffset(0); }} className="mt-1 block w-full min-w-0 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 [color-scheme:dark]" />
          </label>
          <label className="text-[9px] font-mono text-slate-500 uppercase">
            Sensor
            <select value={selectedSensor ?? ""} onChange={(event) => { setSelectedSensor((event.target.value || null) as FireSensor | null); setOffset(0); }} className="mt-1 block w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200">
              <option value="">All sensors</option><option value="MODIS">MODIS</option><option value="VIIRS">VIIRS</option><option value="BOTH">Both sensors</option>
            </select>
          </label>
          <label className="text-[9px] font-mono text-slate-500 uppercase">
            Min Burn Index
            <input type="number" min="0" max="100" value={minBurnIndex ?? ""} onChange={(event) => { setBurnIndexRange(event.target.value === "" ? null : Number(event.target.value), maxBurnIndex); setOffset(0); }} placeholder="0" className="mt-1 block w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
          </label>
          <label className="text-[9px] font-mono text-slate-500 uppercase">
            Max Burn Index
            <input type="number" min="0" max="100" value={maxBurnIndex ?? ""} onChange={(event) => { setBurnIndexRange(minBurnIndex, event.target.value === "" ? null : Number(event.target.value)); setOffset(0); }} placeholder="100" className="mt-1 block w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
          </label>
          <label className="text-[9px] font-mono text-slate-500 uppercase col-span-2 md:col-span-1">
            Selected H3 cell
            <select value={selectedH3Cell ?? ""} onChange={(event) => setSelectedH3Cell(event.target.value || null)} className="mt-1 block w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-200">
              <option value="">No cell selected</option>
              {selectedH3Cell && !h3Cells.includes(selectedH3Cell) && <option value={selectedH3Cell}>{selectedH3Cell}</option>}
              {h3Cells.map((cell) => <option key={cell} value={cell}>{cell}</option>)}
            </select>
          </label>
          <div className="flex items-end justify-between gap-2">
            <span className="text-[9px] font-mono text-slate-500 pb-2">Page {Math.floor(offset / pageSize) + 1}</span>
            <div className="flex gap-1">
              <button type="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - pageSize))} className="border border-slate-700 rounded px-2 py-1.5 text-[10px] text-slate-300 disabled:opacity-40">Prev</button>
              <button type="button" disabled={!data?.has_more || loading} onClick={() => setOffset(offset + pageSize)} className="border border-slate-700 rounded px-2 py-1.5 text-[10px] text-slate-300 disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      </section>

      <section className="shrink-0" aria-label="Project statistics">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">System Statistics · GET /api/stats</span>
          <div className="flex items-center gap-2">
            {statsLoading ? (
              <span role="status" className="text-[9px] font-mono text-amber-300">LOADING...</span>
            ) : statsError ? (
              <>
                <span role="alert" className="text-[9px] font-mono text-red-400">CONNECTION ERROR · Unable to retrieve project statistics</span>
                <button onClick={refetchStats} className="border border-slate-700 rounded px-2 py-1 text-[9px] font-mono text-slate-200 hover:border-orange-500">RETRY</button>
              </>
            ) : stats ? (
              <span className="inline-flex items-center gap-1.5 text-[9px] font-mono text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> LIVE DATA
              </span>
            ) : (
              <span className="text-[9px] font-mono text-slate-400">NO STATISTICS DATA</span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Metric
            label="Raw Fire Observations"
            value={formatCount(stats?.coverage.total_raw_observations)}
            detail="Standardized MODIS + VIIRS detections"
            color="text-white"
          />
          <Metric
            label="H3 Cell/Date Observations"
            value={formatCount(stats?.coverage.total_h3_cell_dates)}
            detail={stats?.coverage.h3_resolution == null ? "Observed resolution-7 records" : `Observed H3 resolution-${stats.coverage.h3_resolution} records`}
            color="text-orange-400"
          />
          <Metric
            label="Mean Burn Index"
            value={formatBurnIndex(stats?.burn_index.mean)}
            detail="Mean relative fire-activity score · 0–100"
            color="text-amber-300"
          />
          <Metric
            label="Anomalous Observations"
            value={formatCount(stats?.anomalies.total_anomalous)}
            detail="Non-normal anomaly records"
            color="text-red-300"
          />
        </div>
      </section>

      {/* 2. BOTTOM MAIN SECTION */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[620px] lg:min-h-0">
        {/* WORLD MAP CONTAINER (Left 8 Cols) */}
        <div className="lg:col-span-8 bg-slate-900/50 border border-slate-800 rounded-lg flex flex-col relative overflow-hidden">
          {/* Map Title / Legend Overlay (Top Left) */}
          <div className="absolute top-4 left-4 z-10 bg-slate-950/90 border border-slate-800 rounded p-2.5 backdrop-blur-md max-w-xs pointer-events-none">
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">
              Active Hazard Monitor
            </span>
            <span className="text-xs font-bold text-white block mt-0.5">
              Filtered H3 fire observations
            </span>
          </div>

          {/* Map Canvas Visualizer */}
          <div className="flex-1 flex items-center justify-center relative select-none h-full">
            <div className="w-full h-full text-slate-950">
              <TerraIgnisMap
                latitude={20}
                longitude={0}
                zoom={1.2}
                fireData={loading ? [] : records.map((record) => ({
                  h3Index: record.h3_cell,
                  burnIndex: record.burn_index,
                }))}
                isRegional={false}
                selectedH3Cell={selectedH3Cell}
                onH3CellClick={setSelectedH3Cell}
              />
            </div>
            {(loading || error || (!loading && data?.count === 0)) && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/70 p-4">
                {loading ? (
                  <div role="status" className="border border-slate-700 bg-slate-950/95 px-4 py-3 rounded text-center">
                    <span className="block text-[9px] font-mono tracking-widest text-orange-400">FIRE TELEMETRY</span>
                    <span className="block mt-1 text-xs font-mono text-slate-300">CONNECTING...</span>
                  </div>
                ) : error ? (
                  <div role="alert" className="max-w-sm border border-red-900/70 bg-slate-950/95 px-4 py-3 rounded text-center">
                    <span className="block text-[9px] font-mono tracking-widest text-red-400">FIRE TELEMETRY · CONNECTION ERROR</span>
                    <span className="block mt-1 text-xs text-slate-300">Unable to retrieve active-fire observations.</span>
                    <button onClick={refetch} className="mt-3 border border-slate-700 px-3 py-1 text-[10px] font-mono text-slate-200 hover:border-orange-500">RETRY</button>
                  </div>
                ) : (
                  <div className="border border-slate-700 bg-slate-950/95 px-4 py-3 rounded text-center">
                    <span className="block text-[9px] font-mono tracking-widest text-slate-300">NO FIRE OBSERVATIONS</span>
                    <span className="block mt-1 text-xs text-slate-400">No active-fire observations match the current parameters.</span>
                  </div>
                )}
              </div>
            )}

            {/* API-backed monthly outlier summary */}
            <div className="absolute bottom-4 right-4 bg-slate-950/90 border border-slate-800/80 rounded p-3 backdrop-blur-md w-60 shadow-xl pointer-events-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-mono text-orange-500 font-extrabold uppercase tracking-wider">
                  H3 outliers by month
                </span>
                {!anomaliesLoading && !anomaliesError && anomalyRecords && (
                  <span className="text-[8px] text-slate-400 font-mono">{anomalyRecords.length} records</span>
                )}
              </div>
              {anomaliesLoading ? (
                <div role="status" className="h-10 flex flex-col items-center justify-center">
                  <span className="text-[8px] font-mono text-orange-400">ANOMALY TELEMETRY</span>
                  <span className="text-[8px] font-mono text-slate-400">LOADING...</span>
                </div>
              ) : anomaliesError ? (
                <div role="alert" className="text-center">
                  <span className="block text-[8px] font-mono text-red-400">CONNECTION ERROR</span>
                  <button onClick={refetchAnomalies} className="mt-1 border border-slate-700 px-2 py-0.5 text-[8px] font-mono text-slate-200 hover:border-orange-500">RETRY</button>
                </div>
              ) : anomalyRecords?.length ? (
                <svg viewBox="0 0 200 46" className="w-full h-10" role="img" aria-label="Monthly H3 outlier record counts">
                  {monthlyAnomalyCounts.map((count, index) => count === null ? null : (
                    <rect
                      key={monthNames[index]}
                      x={index * 16 + 4}
                      y={42 - (count / maxMonthlyAnomalies) * 38}
                      width="9"
                      height={(count / maxMonthlyAnomalies) * 38}
                      rx="1"
                      fill="#f97316"
                    >
                      <title>{monthNames[index]}: {count} anomaly records</title>
                    </rect>
                  ))}
                </svg>
              ) : (
                <div className="h-10 flex items-center justify-center text-center text-[8px] font-mono text-slate-400">
                  NO ANOMALIES FOR {selectedYear}
                </div>
              )}
              <div className="flex justify-between text-[7px] font-mono text-slate-500 mt-1">
                <span>JAN</span>
                <span>JUN</span>
                <span>DEC</span>
              </div>
            </div>
          </div>

          {/* TIMELINE SLIDER (At the bottom of the map) */}
          <div className="bg-slate-950 border-t border-slate-800/60 p-4 flex items-center gap-4">
            {/* Playback Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2 bg-orange-600 hover:bg-orange-500 text-white rounded transition-colors"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => {
                  setSelectedYear(2026);
                  setIsPlaying(false);
                }}
                className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800"
                title="Reset"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Interactive Timeline Track */}
            <div className="flex-1 flex flex-col gap-1">
              <input
                type="range"
                min="2000"
                max="2026"
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(Number(e.target.value));
                  setOffset(0);
                  setIsPlaying(false);
                }}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className="flex justify-between text-[8px] font-mono text-slate-600">
                <span>2000</span>
                <span className="text-orange-500/80 font-bold">
                  YEAR FILTER · {selectedYear}
                </span>
                <span>2026</span>
              </div>
            </div>
          </div>
        </div>

        {/* SIDEBAR CALIBRATION CONTROLS (Right 4 Cols) */}
        <div className="lg:col-span-4 bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex flex-col gap-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-white">
              Integration Matrix
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Reference metadata · observed records above come from GET /api/fires.
            </p>
          </div>

          {/* SATELLITE SUMMARY INFO */}
          <div className="space-y-3">
            {/* MODIS */}
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm font-medium text-white">
                  Aqua & Terra MODIS
                </span>
                <span className="text-[9px] font-mono text-slate-500">REFERENCE</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                MODIS observations are included in the backend sensor counts. Pass-time and platform metadata are not available from this API.
              </p>
            </div>

            {/* VIIRS */}
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm font-medium text-white">
                  Suomi NPP & JPSS VIIRS
                </span>
                <span className="text-[9px] font-mono text-slate-500">REFERENCE</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                VIIRS observations are included in the backend sensor counts. Pass-time and platform metadata are not available from this API.
              </p>
            </div>

            {/* TerraIgnis Harmonization Method */}
            <div className="p-3 bg-orange-950/10 rounded-lg border border-orange-900/30">
              <span className="text-sm font-medium text-orange-400 block mb-1.5">
                Harmonization · unavailable
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                The API provides a relative Burn Index, but does not expose a harmonization methodology or annual sensor trend series.
              </p>
            </div>
          </div>

          <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
            {statsLoading ? (
              <div role="status" className="bg-slate-950 border border-slate-800 rounded-md p-3 text-center">
                <span className="block text-[9px] font-mono text-amber-300">SYSTEM STATISTICS</span>
                <span className="block mt-1 text-[10px] font-mono text-slate-400">LOADING...</span>
              </div>
            ) : statsError ? (
              <div role="alert" className="bg-slate-950 border border-red-900/60 rounded-md p-3 text-center">
                <span className="block text-[9px] font-mono text-red-400">SYSTEM STATISTICS · CONNECTION ERROR</span>
                <span className="block mt-1 text-[10px] text-slate-300">Unable to retrieve project statistics.</span>
                <button onClick={refetchStats} className="mt-2 border border-slate-700 rounded px-2 py-1 text-[9px] font-mono text-slate-200 hover:border-orange-500">RETRY</button>
              </div>
            ) : stats ? (
              <>
                <section className="bg-slate-950/80 border border-slate-800 rounded-md p-3 space-y-2">
                  <h4 className="text-[9px] font-mono uppercase tracking-widest text-cyan-300">Dataset Coverage</h4>
                  <StatRow label="PERIOD" value={`${formatDate(stats.coverage.start_date)} — ${formatDate(stats.coverage.end_date)}`} />
                  <StatRow label="OBSERVED DATES" value={formatCount(stats.coverage.observed_dates)} />
                  <StatRow label="UNIQUE H3 CELLS" value={formatCount(stats.coverage.unique_h3_cells)} />
                  <StatRow label="H3 RESOLUTION" value={stats.coverage.h3_resolution == null ? "Unavailable" : String(stats.coverage.h3_resolution)} />
                </section>

                <section className="bg-slate-950/80 border border-slate-800 rounded-md p-3 space-y-2">
                  <h4 className="text-[9px] font-mono uppercase tracking-widest text-sky-300">Sensor Observations</h4>
                  <StatRow label="MODIS RAW OBSERVATIONS" value={formatCount(stats.sensors.modis_observations)} />
                  <StatRow label="VIIRS RAW OBSERVATIONS" value={formatCount(stats.sensors.viirs_observations)} />
                  <div className="h-px bg-slate-800" />
                  <StatRow label="MODIS-ONLY CELL/DATES" value={formatCount(stats.sensors.modis_only_cell_dates)} />
                  <StatRow label="VIIRS-ONLY CELL/DATES" value={formatCount(stats.sensors.viirs_only_cell_dates)} />
                  <StatRow label="BOTH-SENSOR CELL/DATES" value={formatCount(stats.sensors.both_sensor_cell_dates)} />
                </section>

                <section className="bg-slate-950/80 border border-slate-800 rounded-md p-3 space-y-2">
                  <h4 className="text-[9px] font-mono uppercase tracking-widest text-orange-300">Burn Index · Relative Score</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <StatRow label="MIN" value={formatBurnIndex(stats.burn_index.minimum)} />
                    <StatRow label="MAX" value={formatBurnIndex(stats.burn_index.maximum)} />
                    <StatRow label="MEAN" value={formatBurnIndex(stats.burn_index.mean)} color="text-orange-300" />
                    <StatRow label="MEDIAN" value={formatBurnIndex(stats.burn_index.median)} />
                    <StatRow label="P95" value={formatBurnIndex(stats.burn_index.p95)} />
                  </div>
                </section>

                <section className="bg-slate-950/80 border border-slate-800 rounded-md p-3 space-y-2">
                  <h4 className="text-[9px] font-mono uppercase tracking-widest text-red-300">Anomaly Distribution</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <StatRow label="NORMAL" value={formatCount(stats.anomalies.normal)} />
                    <StatRow label="LOW" value={formatCount(stats.anomalies.low)} />
                    <StatRow label="HIGH" value={formatCount(stats.anomalies.high)} />
                    <StatRow label="EXTREME LOW" value={formatCount(stats.anomalies.extreme_low)} />
                    <StatRow label="EXTREME HIGH" value={formatCount(stats.anomalies.extreme_high)} />
                    <StatRow label="TOTAL ANOMALOUS" value={formatCount(stats.anomalies.total_anomalous)} color="text-red-300" />
                  </div>
                </section>
              </>
            ) : (
              <div className="bg-slate-950 border border-slate-800 rounded-md p-3 text-center text-[10px] font-mono text-slate-400">
                NO STATISTICS DATA
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
