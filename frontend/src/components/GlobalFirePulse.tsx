import React, { useState, useEffect, useMemo } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { GLOBAL_ANNUAL_SERIES, SATELLITE_METADATA } from "../mockData";
import TerraIgnisMap from "./TerraIgnisMap";
import { useFires } from "../hooks/useFires";
import type { FireSensor } from "../types/fire";
import { useAnomalies } from "../hooks/useAnomalies";

function Metric({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2.5 flex flex-col gap-1">
      <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`text-xl font-semibold tabular-nums ${color}`}>{value}</span>
      <span className="text-[10px] text-slate-500">{detail}</span>
    </div>
  );
}

export default function GlobalFirePulse() {
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [date, setDate] = useState("");
  const [sensor, setSensor] = useState<FireSensor | "">("");
  const [minBurnIndex, setMinBurnIndex] = useState("");
  const [maxBurnIndex, setMaxBurnIndex] = useState("");
  const [h3Cell, setH3Cell] = useState("");
  const [offset, setOffset] = useState(0);
  const pageSize = 500;

  const { data, loading, error, refetch } = useFires({
    date: date || undefined,
    sensor: sensor || undefined,
    min_burn_index: minBurnIndex ? Number(minBurnIndex) : undefined,
    max_burn_index: maxBurnIndex ? Number(maxBurnIndex) : undefined,
    h3_cell: h3Cell.trim() || undefined,
    limit: pageSize,
    offset,
  });
  const records = data?.data ?? [];
  const meanBurnIndex = records.length
    ? records.reduce((sum, record) => sum + record.burn_index, 0) / records.length
    : null;
  const frpValues = records.flatMap((record) => record.total_frp === null ? [] : [record.total_frp]);
  const loadedFrp = frpValues.reduce((sum, value) => sum + value, 0);

  const yearsList = GLOBAL_ANNUAL_SERIES.map((d) => d.year);
  const {
    data: anomalyRecords,
    loading: anomaliesLoading,
    error: anomaliesError,
    refetch: refetchAnomalies,
  } = useAnomalies({
    start_date: `${selectedYear}-01-01`,
    end_date: `${selectedYear}-12-31`,
  });
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
        setSelectedYear((prev) => {
          const currentIndex = yearsList.indexOf(prev);
          if (currentIndex === yearsList.length - 1) {
            return yearsList[0];
          }
          return yearsList[currentIndex + 1];
        });
      }, 1800);
    }
    return () => clearInterval(timer);
  }, [isPlaying, yearsList]);

  return (
    <div className="flex flex-col h-full bg-slate-950 p-4 lg:p-5 gap-4 overflow-y-auto">
      <section aria-label="Fire API filters" className="shrink-0 border border-slate-800 bg-slate-900/70 rounded-md p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Fire telemetry</h2>
            <p className="text-[10px] font-mono text-slate-500">GET /api/fires · H3 resolution 7</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider ${error ? "text-red-400" : loading ? "text-amber-300" : "text-emerald-400"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${error ? "bg-red-400" : loading ? "bg-amber-300 animate-pulse" : "bg-emerald-400"}`} />
            {error ? "BACKEND UNAVAILABLE" : loading ? "CONNECTING TO BACKEND" : "REAL BACKEND DATA"}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          <label className="text-[9px] font-mono text-slate-500 uppercase">
            Date
            <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setOffset(0); }} className="mt-1 block w-full min-w-0 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 [color-scheme:dark]" />
          </label>
          <label className="text-[9px] font-mono text-slate-500 uppercase">
            Sensor
            <select value={sensor} onChange={(event) => { setSensor(event.target.value as FireSensor | ""); setOffset(0); }} className="mt-1 block w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200">
              <option value="">All sensors</option><option value="MODIS">MODIS</option><option value="VIIRS">VIIRS</option><option value="BOTH">Both sensors</option>
            </select>
          </label>
          <label className="text-[9px] font-mono text-slate-500 uppercase">
            Min Burn Index
            <input type="number" min="0" max="100" value={minBurnIndex} onChange={(event) => { setMinBurnIndex(event.target.value); setOffset(0); }} placeholder="0" className="mt-1 block w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
          </label>
          <label className="text-[9px] font-mono text-slate-500 uppercase">
            Max Burn Index
            <input type="number" min="0" max="100" value={maxBurnIndex} onChange={(event) => { setMaxBurnIndex(event.target.value); setOffset(0); }} placeholder="100" className="mt-1 block w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
          </label>
          <label className="text-[9px] font-mono text-slate-500 uppercase col-span-2 md:col-span-1">
            H3 cell · res 7
            <input value={h3Cell} onChange={(event) => { setH3Cell(event.target.value); setOffset(0); }} placeholder="Optional cell ID" className="mt-1 block w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
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

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 shrink-0">
        <Metric label="Matching fire records" value={data ? data.total.toLocaleString() : "—"} detail="Across selected filters" color="text-white" />
        <Metric label="Loaded H3 observations" value={data ? data.count.toLocaleString() : "—"} detail={data ? `Page size ${data.limit}` : "Awaiting response"} color="text-orange-400" />
        <Metric label="Mean Burn Index" value={meanBurnIndex === null ? "—" : meanBurnIndex.toFixed(1)} detail="Loaded observations · 0–100" color="text-amber-300" />
        <Metric label="FRP in loaded records" value={data && frpValues.length > 0 ? loadedFrp.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "—"} detail="MW · null values omitted" color="text-sky-300" />
      </div>

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
                  setIsPlaying(false);
                }}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className="flex justify-between text-[8px] font-mono text-slate-600">
                <span>2000 (MODIS Baseline)</span>
                <span className="text-orange-500/80 font-bold">
                  TEMPORARY MOCK · Year: {selectedYear}
                </span>
                <span>2026 (Synthesized Future Peak)</span>
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
          <div className="space-y-3 flex-1 overflow-y-auto pr-1">
            {/* MODIS */}
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm font-medium text-white">
                  Aqua & Terra MODIS
                </span>
                <span className="text-[9px] font-mono text-slate-500">REFERENCE</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {SATELLITE_METADATA.MODIS.strengths} Passes twice daily.
              </p>
              <div className="mt-2 flex gap-3 text-xs text-slate-500">
                <span>{SATELLITE_METADATA.MODIS.altitude}</span>
                <span>{SATELLITE_METADATA.MODIS.resolution}</span>
              </div>
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
                {SATELLITE_METADATA.VIIRS.strengths} High spatial resolution.
              </p>
              <div className="mt-2 flex gap-3 text-xs text-slate-500">
                <span>{SATELLITE_METADATA.VIIRS.altitude}</span>
                <span>{SATELLITE_METADATA.VIIRS.resolution}</span>
              </div>
            </div>

            {/* TerraIgnis Harmonization Method */}
            <div className="p-3 bg-orange-950/10 rounded-lg border border-orange-900/30">
              <span className="text-sm font-medium text-orange-400 block mb-1.5">
                Harmonization · reference
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                {SATELLITE_METADATA.HARMONIZATION.methodology}
              </p>
            </div>
          </div>

          {/* TELEMETRY CONSOLE */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-500 space-y-1">
            <div className="flex items-center justify-between text-slate-300 mb-1">
              <span className="text-xs font-medium">TEMPORARY MOCK · Telemetry</span>
              <span className="text-slate-500 text-[9px]">SYNTHETIC</span>
            </div>
            <div className="h-[1px] bg-slate-800 mb-2" />
            <div className="truncate text-[10px]">
              Simulated year range · not API status
            </div>
            <div className="truncate text-[10px]">
              Synthetic latency / algorithm telemetry
            </div>
            <div className="truncate text-[10px]">
              Reference sensors: Aqua, Terra, SNPP, JPSS
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
