import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Flame, ShieldAlert, Zap, Globe, HeartPulse, Sparkles, Radio, HelpCircle, Layers } from 'lucide-react';
import { GLOBAL_ANNUAL_SERIES, SATELLITE_METADATA } from '../mockData';
import TerraIgnisMap from './TerraIgnisMap';

export default function GlobalFirePulse() {
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [backendHotspots, setBackendHotspots] = useState<any[]>([]);
  const [backendH3, setBackendH3] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/active-hotspots')
      .then(res => res.json())
      .then(data => setBackendHotspots(data))
      .catch(err => console.error(err));

    fetch('/api/h3-fire-data')
      .then(res => res.json())
      .then(data => setBackendH3(data))
      .catch(err => console.error(err));
  }, []);

  const yearsList = GLOBAL_ANNUAL_SERIES.map(d => d.year);
  const selectedYearData = GLOBAL_ANNUAL_SERIES.find(d => d.year === selectedYear) || GLOBAL_ANNUAL_SERIES[GLOBAL_ANNUAL_SERIES.length - 1];

  // Dynamic values reflecting slider scrubbing
  const displayedBurnedArea = selectedYearData.burnedAreaSqKm;
  const displayedFrp = selectedYearData.frpTotalMW;
  const displayedContinuity = selectedYearData.satelliteContinuity;
  const displayedHarmonization = selectedYearData.harmonizationIndex;

  // Monthly breakdown for Sparkline
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const getMonthlyCurve = (yearFactor: number) => {
    return [
      22 * yearFactor, 24 * yearFactor, 18 * yearFactor, 12 * yearFactor, 15 * yearFactor, 32 * yearFactor,
      68 * yearFactor, 110 * yearFactor, 145 * yearFactor, 98 * yearFactor, 42 * yearFactor, 25 * yearFactor
    ];
  };

  const medianCurve = [18, 20, 15, 10, 12, 25, 52, 85, 110, 75, 32, 20];
  const yearIntensityFactor = 0.5 + (selectedYearData.anomalyIndex + 1) * 0.8;
  const currentYearCurve = getMonthlyCurve(yearIntensityFactor);

  // Auto-play interval
  useEffect(() => {
    let timer: any;
    if (isPlaying) {
      timer = setInterval(() => {
        setSelectedYear(prev => {
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
    <div className="flex flex-col h-full bg-slate-950 p-6 gap-6 overflow-hidden">
      
      {/* 1. TOP KPI BANNER */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        
        {/* KPI 1: Unified Global Area Burned */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-lg p-4 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Globe className="w-12 h-12 text-orange-500" />
          </div>
          <div className="text-[10px] tracking-widest font-mono text-slate-400 uppercase">
            Unified Global Area Burned
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-white tabular-nums">
              {displayedBurnedArea.toLocaleString('en-US', { minimumFractionDigits: 1 })}
            </span>
            <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">sq km</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-2 flex items-center gap-1.5 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            <span>Telemetry calibrated via MODIS/VIIRS grid scale</span>
          </div>
        </div>

        {/* KPI 2: FRP Total */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-lg p-4 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Flame className="w-12 h-12 text-red-500" />
          </div>
          <div className="text-[10px] tracking-widest font-mono text-slate-400 uppercase">
            FRP Total
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-orange-500 tabular-nums">
              {displayedFrp.toLocaleString()}
            </span>
            <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">MW</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-2 flex items-center gap-1.5 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span>Cumulative thermal radiative output</span>
          </div>
        </div>

        {/* KPI 3: Satellite Continuity Index */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-lg p-4 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Radio className="w-12 h-12 text-cyan-500" />
          </div>
          <div className="text-[10px] tracking-widest font-mono text-slate-400 uppercase">
            Satellite Continuity Index
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-cyan-400 tabular-nums">
              {displayedContinuity.toFixed(1)}%
            </span>
            <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">Coverage</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-2 flex items-center gap-1.5 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Terra/Aqua/SNPP/JPSS constellation sync</span>
          </div>
        </div>

        {/* KPI 4: Harmonization Index */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-lg p-4 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <HeartPulse className="w-12 h-12 text-emerald-500" />
          </div>
          <div className="text-[10px] tracking-widest font-mono text-slate-400 uppercase">
            Harmonization Index
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-emerald-400 tabular-nums">
              {displayedHarmonization.toFixed(2)}
            </span>
            <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">Ratio</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-2 flex items-center gap-1.5 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Spatio-temporal coregistration fit</span>
          </div>
        </div>

      </div>

      {/* 2. BOTTOM MAIN SECTION */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        
        {/* WORLD MAP CONTAINER (Left 8 Cols) */}
        <div className="lg:col-span-8 bg-slate-900/50 border border-slate-800 rounded-lg flex flex-col relative overflow-hidden">
          
          {/* Map Title / Legend Overlay (Top Left) */}
          <div className="absolute top-4 left-4 z-10 bg-slate-950/90 border border-slate-800 rounded p-2.5 backdrop-blur-md max-w-xs pointer-events-none">
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">
              Active Hazard Monitor
            </span>
            <span className="text-xs font-bold text-white block mt-0.5">
              Earth Observations at Year {selectedYear}
            </span>
          </div>

          {/* Map Canvas Visualizer */}
          <div className="flex-1 flex items-center justify-center relative select-none h-full">
            
            <div className="w-full h-full text-slate-950">
              <TerraIgnisMap
                latitude={20}
                longitude={0}
                zoom={1.2}
                fireData={[
                  ...backendHotspots.map(h => ({ lat: h.lat, lng: h.lng, intensity: h.intensity, frp: h.intensity })),
                  ...backendH3
                ]}
                isRegional={false}
              />
            </div>

            {/* FLOATING CARD: FIRE ANOMALY TRACKER (Overlaid on Map bottom-right) */}
            <div className="absolute bottom-4 right-4 bg-slate-950/90 border border-slate-800/80 rounded p-3 backdrop-blur-md w-60 shadow-xl pointer-events-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-mono text-orange-500 font-extrabold uppercase tracking-wider flex items-center gap-1">
                  <HeartPulse className="w-3 h-3 text-red-500" />
                  Fire Anomaly Tracker
                </span>
                <span className="text-[8px] text-slate-400 font-mono">
                  {selectedYear} vs Median
                </span>
              </div>

              {/* Sparkline visualization */}
              <div className="h-10 relative">
                <svg viewBox="0 0 200 50" preserveAspectRatio="none" className="w-full h-full">
                  {/* Median Line (Gray dash) */}
                  <path
                    d={medianCurve.map((val, idx) => {
                      const x = (idx / 11) * 200;
                      const y = 45 - (val / 160) * 40;
                      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#475569"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                  />

                  {/* Selected Year Line (Neon Orange) */}
                  <path
                    d={currentYearCurve.map((val, idx) => {
                      const x = (idx / 11) * 200;
                      const y = 45 - (val / 160) * 40;
                      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>

              <div className="flex justify-between text-[7px] font-mono text-slate-500 mt-1">
                <span>Jan</span>
                <span>Jun</span>
                <span>Dec</span>
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
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
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
                <span className="text-orange-500/80 font-bold">Scrubbing Mission Year: {selectedYear}</span>
                <span>2026 (Synthesized Future Peak)</span>
              </div>
            </div>

          </div>

        </div>

        {/* SIDEBAR CALIBRATION CONTROLS (Right 4 Cols) */}
        <div className="lg:col-span-4 bg-slate-900/40 border border-slate-800/80 rounded-lg p-4 flex flex-col gap-4">
          
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-xs uppercase tracking-wider text-slate-400 font-mono flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-orange-500" />
              Integration Matrix
            </h3>
            <p className="text-[10px] text-slate-500 mt-1">
              Select sensors contributing to the live harmonized projection.
            </p>
          </div>

          {/* SATELLITE SUMMARY INFO */}
          <div className="space-y-3 flex-1 overflow-y-auto pr-1">
            
            {/* MODIS */}
            <div className="p-3 bg-slate-950/60 rounded border border-slate-800/80 hover:border-slate-700 transition-colors">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-yellow-400">Aqua & Terra MODIS</span>
                <span className="text-[9px] font-mono text-emerald-400">ACTIVE SINCE 2000</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                {SATELLITE_METADATA.MODIS.strengths} Pass frequency operates twice daily.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[8px] font-mono text-slate-500">
                <span>Altitude: {SATELLITE_METADATA.MODIS.altitude}</span>
                <span>Res: {SATELLITE_METADATA.MODIS.resolution}</span>
              </div>
            </div>

            {/* VIIRS */}
            <div className="p-3 bg-slate-950/60 rounded border border-slate-800/80 hover:border-slate-700 transition-colors">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-red-400">Suomi NPP & JPSS VIIRS</span>
                <span className="text-[9px] font-mono text-emerald-400">ACTIVE SINCE 2011</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                {SATELLITE_METADATA.VIIRS.strengths} Perfect for high spatial resolution tasks.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[8px] font-mono text-slate-500">
                <span>Altitude: {SATELLITE_METADATA.VIIRS.altitude}</span>
                <span>Res: {SATELLITE_METADATA.VIIRS.resolution}</span>
              </div>
            </div>

            {/* TerraIgnis Harmonization Method */}
            <div className="p-3 bg-orange-950/10 rounded border border-orange-950/40">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-xs font-bold text-orange-400">TerraIgnis Harmonizer</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                {SATELLITE_METADATA.HARMONIZATION.methodology}
              </p>
            </div>

          </div>

          {/* REAL TIME CONSOLE FEED */}
          <div className="bg-slate-950 border border-slate-800 rounded p-2.5 font-mono text-[9px] text-slate-500 space-y-1">
            <div className="text-slate-400 font-bold uppercase tracking-wider flex items-center justify-between">
              <span>Telemetry Core Stream</span>
              <span className="text-emerald-500 animate-pulse">● FEED ONLINE</span>
            </div>
            <div className="h-[1px] bg-slate-900 my-1" />
            <div className="truncate">T+{selectedYear - 2000} YRS | SCAN STATUS: 200 SUCCESS</div>
            <div className="truncate">LATENCY: 42ms | CORE ALGO: Coregistration v2.6</div>
            <div className="truncate">SENSORS: Aqua, Terra, SNPP, JPSS-1</div>
          </div>

        </div>

      </div>

    </div>
  );
}
