import React, { useState, useMemo } from 'react';
import { REGIONAL_SITES, DIURNAL_PROFILE, LAND_COVER_CORRELATION } from '../mockData';
import { ChevronDown } from 'lucide-react';
import TerraIgnisMap from './TerraIgnisMap';

export default function RegionalDeepDive() {
  const [activeSiteId, setActiveSiteId] = useState<string>('amazon');
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  const activeSite = REGIONAL_SITES.find(s => s.id === activeSiteId) || REGIONAL_SITES[0];
  const [backendHotspots, setBackendHotspots] = useState<any[]>([]);

  React.useEffect(() => {
    fetch('/api/active-hotspots')
      .then(res => res.json())
      .then(data => setBackendHotspots(data))
      .catch(err => console.error(err));
  }, []);

  const regionalFirePoints = useMemo(() => {
    if (activeSiteId === 'amazon') {
      return backendHotspots.filter((h: any) => h.region === 'The Amazon').map((h: any) => ({
        lat: h.lat,
        lng: h.lng,
        intensity: h.intensity,
        frp: h.intensity
      }));
    } else if (activeSiteId === 'volcanic') {
      return [
        { lat: 19.4, lng: -155.2, intensity: 2100, frp: 2100 },
        { lat: 19.42, lng: -155.25, intensity: 3200, frp: 3200 },
        { lat: 19.38, lng: -155.15, intensity: 850, frp: 850 }
      ];
    } else if (activeSiteId === 'sundarbans') {
      return [
        { lat: 21.9, lng: 89.1, intensity: 280, frp: 280 },
        { lat: 21.85, lng: 89.15, intensity: 510, frp: 510 },
        { lat: 21.95, lng: 89.05, intensity: 180, frp: 180 }
      ];
    } else if (activeSiteId === 'boreal') {
      return backendHotspots.filter((h: any) => h.region === 'Siberia').map((h: any) => ({
        lat: h.lat,
        lng: h.lng,
        intensity: h.intensity,
        frp: h.intensity
      }));
    } else {
      // australia
      return backendHotspots.filter((h: any) => h.region.includes('Australia')).map((h: any) => ({
        lat: h.lat,
        lng: h.lng,
        intensity: h.intensity,
        frp: h.intensity
      }));
    }
  }, [activeSiteId, backendHotspots]);

  return (
    <div className="flex flex-col h-full bg-slate-950 p-6 gap-6 overflow-hidden">
      
      {/* 1. HEADER & REGION SELECTOR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-lg">
        <div>
          <h2 className="text-sm font-semibold text-white">Regional Deep Dive</h2>
          <p className="text-xs text-slate-400 mt-0.5">Spatio-temporal coregistration analysis</p>
        </div>

        {/* Region Selector */}
        <div className="relative min-w-[240px]">
          <select
            value={activeSiteId}
            onChange={(e) => setActiveSiteId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 pr-10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500 appearance-none cursor-pointer"
          >
            {REGIONAL_SITES.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 2. MAIN 3-COLUMN / 2x2 GRID SPLIT */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-6 overflow-hidden min-h-0">
        
        {/* LEFT COLUMN: FOCUSED REGIONAL MAP (5 Cols) */}
        <div className="xl:col-span-5 bg-slate-900/50 border border-slate-800 rounded-lg p-4 flex flex-col gap-4 overflow-hidden">
          
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <p className="text-xs text-slate-400">Target Region</p>
              <h3 className="text-sm font-semibold text-white mt-0.5">
                {activeSite.name}
              </h3>
            </div>
          </div>

          {/* Map Bounding Box Container */}
          <div className="flex-1 bg-slate-950 rounded-lg relative overflow-hidden flex flex-col justify-between border border-slate-800/60 h-full">
            
            <div className="w-full h-full text-slate-950">
              <TerraIgnisMap
                latitude={activeSite.center.lat}
                longitude={activeSite.center.lng}
                zoom={activeSiteId === 'volcanic' ? 10 : activeSiteId === 'sundarbans' ? 8 : 4}
                fireData={regionalFirePoints}
                isRegional={true}
              />
            </div>

            {/* Calibration details card (Bottom overlay) */}
            <div className="bg-slate-900 border-t border-slate-800 p-3 flex flex-col gap-1 text-[10px] font-mono text-slate-400">
              <div className="flex justify-between font-bold text-white">
                <span>SENSOR TARGETING</span>
                <span className="text-emerald-400">NOMINAL</span>
              </div>
              <p className="text-[9px] text-slate-500 leading-normal mt-1">
                {activeSite.description}
              </p>
            </div>

          </div>

        </div>

        {/* RIGHT CHUNKS: DATA ANALYSIS METRICS (7 Cols) */}
        <div className="xl:col-span-7 flex flex-col gap-6 overflow-y-auto pr-1">
          
          {/* 2x2 Sub-Grid of Graphs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 1. Sensor Inconsistency Graph */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
              <div>
                <p className="text-xs text-slate-400">Sensor Inconsistency</p>
                <h4 className="text-sm font-semibold text-white mt-0.5">
                  Raw MODIS vs Raw VIIRS
                </h4>
              </div>

              <div className="h-28 relative mt-3">
                <svg viewBox="0 0 200 80" preserveAspectRatio="none" className="w-full h-full">
                  {/* MODIS Raw (lower, coarse) */}
                  <path
                    d={activeSite.modisRawAnnual.map((d, idx) => {
                      const x = (idx / (activeSite.modisRawAnnual.length - 1)) * 200;
                      const y = 75 - (d.val / 190000) * 65;
                      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="1.5"
                  />
                  
                  {/* VIIRS Raw (higher counts) */}
                  <path
                    d={activeSite.viirsRawAnnual.map((d, idx) => {
                      const x = (idx / (activeSite.viirsRawAnnual.length - 1)) * 200;
                      const y = 75 - (d.val / 190000) * 65;
                      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                  />
                </svg>
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>2012</span>
                  <span>2019</span>
                  <span>2026</span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-yellow-400 block" />
                  <span>MODIS</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-red-500 block" />
                  <span>VIIRS</span>
                </div>
              </div>
            </div>

            {/* 2. Harmonized Activity Graph */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
              <div>
                <p className="text-xs text-slate-400">Harmonized Activity</p>
                <h4 className="text-sm font-semibold text-white mt-0.5">
                  Unified Trend (TerraIgnis)
                </h4>
              </div>

              <div className="h-28 relative mt-3">
                <svg viewBox="0 0 200 80" preserveAspectRatio="none" className="w-full h-full">
                  {/* Harmonized Single-line */}
                  <path
                    d={activeSite.harmonizedAnnual.map((d, idx) => {
                      const x = (idx / (activeSite.harmonizedAnnual.length - 1)) * 200;
                      const y = 75 - (d.val / 75000) * 65;
                      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                  />
                </svg>
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>2012</span>
                  <span>2019</span>
                  <span>2026</span>
                </div>
              </div>

              <div className="text-xs text-slate-500 mt-2">
                Rescaled using bi-directional scaling factor.
              </div>
            </div>

            {/* 3. Diurnal Cycle Analysis */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
              <div>
                <p className="text-xs text-slate-400">Diurnal Cycle</p>
                <h4 className="text-sm font-semibold text-white mt-0.5">
                  Overpass Schedule & Radiative Curve
                </h4>
              </div>

              <div className="h-28 relative mt-3">
                <svg viewBox="0 0 200 80" preserveAspectRatio="none" className="w-full h-full">
                  {/* Area fill under harmonized diurnal curve */}
                  <path
                    d={'M 0 75 ' + DIURNAL_PROFILE.map((p, idx) => {
                      const x = (idx / (DIURNAL_PROFILE.length - 1)) * 200;
                      const y = 75 - (p.harmonized / 280) * 65;
                      return `L ${x} ${y}`;
                    }).join(' ') + ' L 200 75 Z'}
                    fill="rgba(6, 182, 212, 0.1)"
                  />
                  
                  {/* Harmonized line */}
                  <path
                    d={DIURNAL_PROFILE.map((p, idx) => {
                      const x = (idx / (DIURNAL_PROFILE.length - 1)) * 200;
                      const y = 75 - (p.harmonized / 280) * 65;
                      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="1.5"
                  />
                </svg>
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>06:00</span>
                  <span>12:00</span>
                  <span>18:00</span>
                </div>
              </div>

              <div className="text-xs text-slate-500 mt-2">
                Peak morning (Terra) and afternoon (Aqua/VIIRS) cycles integrated.
              </div>
            </div>

            {/* 4. Land Cover Correlation */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
              <div>
                <p className="text-xs text-slate-400">Land Cover Correlation</p>
                <h4 className="text-sm font-semibold text-white mt-0.5">
                  Occurrences by Forestry Class
                </h4>
              </div>

              <div className="space-y-2 mt-3">
                {LAND_COVER_CORRELATION.slice(0, 4).map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span className="truncate max-w-[120px]">{item.class}</span>
                      <span className="text-white font-medium">{item.harmonizedPercentage}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${item.harmonizedPercentage}%` }}
                        className="h-full bg-orange-500 rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-slate-500 mt-3">
                Source: ESA land-cover map coregistrations.
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
