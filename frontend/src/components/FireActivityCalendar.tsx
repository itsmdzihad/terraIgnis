import React, { useState, useMemo } from 'react';
import { generateDailyBurnData, DailyBurnPoint } from '../mockData';
import { Calendar, Download, FileText } from 'lucide-react';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function FireActivityCalendar() {
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [hoveredDay, setHoveredDay] = useState<DailyBurnPoint | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // Generate 365 daily points dynamically based on selected year
  const dailyData = useMemo(() => {
    return generateDailyBurnData(selectedYear);
  }, [selectedYear]);

  // Aligns 365 days into a 7 (days) x 53 (weeks) matrix exactly like GitHub contributions
  const gridColumns = useMemo(() => {
    const columns: DailyBurnPoint[][] = [];
    let currentWeek: DailyBurnPoint[] = [];

    dailyData.forEach((dayPoint, idx) => {
      currentWeek.push(dayPoint);
      if (currentWeek.length === 7 || idx === dailyData.length - 1) {
        columns.push(currentWeek);
        currentWeek = [];
      }
    });

    return columns;
  }, [dailyData]);

  // Map month start labels directly to the matching week column index
  const monthHeaderCols = useMemo(() => {
    const headers: (string | null)[] = new Array(gridColumns.length).fill(null);
    let lastMonth = -1;

    gridColumns.forEach((week, colIdx) => {
      const firstDay = week[0];
      if (firstDay) {
        let monthIdx = -1;
        if (firstDay.date) {
          const d = new Date(firstDay.date);
          if (!isNaN(d.getTime())) {
            monthIdx = d.getMonth();
          }
        }
        if (monthIdx === -1 && firstDay.dayOfYear) {
          const approxDate = new Date(selectedYear, 0, firstDay.dayOfYear);
          monthIdx = approxDate.getMonth();
        }

        if (monthIdx !== -1 && monthIdx !== lastMonth) {
          headers[colIdx] = MONTH_NAMES[monthIdx];
          lastMonth = monthIdx;
        }
      }
    });

    return headers;
  }, [gridColumns, selectedYear]);

  // Extract extreme anomaly outliers (e.g. Z-Score > 2.5)
  const outliers = useMemo(() => {
    return dailyData.filter(d => d.zScore > 2.5).slice(0, 4);
  }, [dailyData]);

  const handleExportGeoJSON = () => {
    setExportStatus('Compiling GeoJSON point vectors...');
    setTimeout(() => {
      const geoJson = {
        type: "FeatureCollection",
        metadata: {
          generated: new Date().toISOString(),
          mission: "TerraIgnis ACTIVE FIRE CORE",
          year: selectedYear
        },
        features: dailyData.filter(d => d.value > 0.6).map((d) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [
              -60.0 + (Math.sin(d.dayOfYear) * 10),
              -6.5 + (Math.cos(d.dayOfYear) * 5)
            ]
          },
          properties: {
            date: d.date,
            intensity: d.value,
            frp_mw: d.frp,
            hotspots: d.hotspotsCount,
            status: d.status
          }
        }))
      };

      const blob = new Blob([JSON.stringify(geoJson, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `terraignis_anomalies_${selectedYear}.geojson`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setExportStatus(`Successfully exported ${geoJson.features.length} high-intensity coordinates to GeoJSON.`);
    }, 1200);
  };

  const handleExportCSV = () => {
    setExportStatus('Formatting telemetry CSV tables...');
    setTimeout(() => {
      let csvContent = "Date,Day_of_Year,Harmonized_Burn_Index,Hotspots_Count,FRP_MW,Anomaly_Status,Z_Score\n";
      dailyData.forEach(d => {
        csvContent += `${d.date},${d.dayOfYear},${d.value},${d.hotspotsCount},${d.frp},${d.status},${d.zScore}\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `terraignis_activity_daily_${selectedYear}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setExportStatus('CSV exported successfully. Saved as daily telemetry sheet.');
    }, 1000);
  };

  return (
    <div className="flex flex-col w-full min-h-full bg-slate-950 p-4 sm:p-6 gap-6 overflow-y-auto">
      
      {/* 1. YEAR SELECTOR HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-lg">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-orange-500" />
            Activity Calendar
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Multi-decade temporal matrix</p>
        </div>

        {/* Selection Slider */}
        <div className="flex items-center gap-4 min-w-[280px]">
          <span className="text-xs text-slate-400 shrink-0">Year</span>
          <input
            type="range"
            min="2000"
            max="2026"
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(Number(e.target.value));
              setHoveredDay(null);
            }}
            className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-green-500"
          />
          <span className="text-sm font-semibold text-white bg-slate-950 border border-slate-800 px-2.5 py-1 rounded font-mono">
            {selectedYear}
          </span>
        </div>
      </div>

      {/* 2. GITHUB CONTRIBUTION GRAPH SECTION */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-5 flex flex-col gap-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Harmonized Burn Intensity — {selectedYear}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Each cell represents one calendar day. Hover for metrics.
            </p>
          </div>

          {/* Grid Legend */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Low</span>
            <span className="w-[13px] h-[13px] rounded-[3px] bg-slate-900 border border-slate-800 block" />
            <span className="w-[13px] h-[13px] rounded-[3px] bg-green-950 block" />
            <span className="w-[13px] h-[13px] rounded-[3px] bg-green-900 block" />
            <span className="w-[13px] h-[13px] rounded-[3px] bg-green-700 block" />
            <span className="w-[13px] h-[13px] rounded-[3px] bg-green-500 block" />
            <span className="w-[13px] h-[13px] rounded-[3px] bg-green-400 block" />
            <span>High</span>
          </div>
        </div>

        {/* STRICT SIZING MATRIX CONTAINER */}
        <div className="bg-slate-950 rounded-lg p-5 border border-slate-800/60 overflow-x-auto scrollbar-thin">
          <div className="inline-block min-w-max">
            
            {/* Month Labels Row */}
            {/* ml-[28px] offsets exactly for the w-[20px] day labels + mr-2 (8px) */}
            <div className="flex gap-[4px] ml-[28px] mb-2 text-[10px] font-mono text-slate-400 select-none">
              {gridColumns.map((_, colIdx) => {
                const monthName = monthHeaderCols[colIdx];
                return (
                  <div key={colIdx} className="w-[15px] relative">
                    {monthName && (
                      <span className="absolute bottom-0 whitespace-nowrap">
                        {monthName}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Days + Activity Grid */}
            <div className="flex items-start">
              
              {/* GitHub Style Day Labels (M, W, F) */}
              <div className="flex flex-col gap-[4px] mr-2 text-[10px] font-mono text-slate-500 select-none">
                {['', 'M', '', 'W', '', 'F', ''].map((day, idx) => (
                  <div key={idx} className="h-[15px] flex items-center justify-end w-[20px] leading-none">
                    {day}
                  </div>
                ))}
              </div>

              {/* Strict Size Activity Columns */}
              <div className="flex gap-[4px]">
                {gridColumns.map((week, colIdx) => (
                  <div key={colIdx} className="flex flex-col gap-[4px]">
                    {week.map((dayPoint, rowIdx) => {
                      const val = dayPoint.value;
                      let colorStyle = 'bg-slate-900 border border-slate-800/40 hover:ring-1 hover:ring-white z-10';
                      
                      if (val > 0.8) colorStyle = 'bg-green-400 hover:ring-1 hover:ring-green-200 z-10';
                      else if (val > 0.6) colorStyle = 'bg-green-500 hover:ring-1 hover:ring-green-300 z-10';
                      else if (val > 0.4) colorStyle = 'bg-green-700 hover:ring-1 hover:ring-green-500 z-10';
                      else if (val > 0.25) colorStyle = 'bg-green-900 hover:ring-1 hover:ring-green-700 z-10';
                      else if (val > 0.1) colorStyle = 'bg-green-950 hover:ring-1 hover:ring-green-800 z-10';
                      
                      return (
                        <div
                          key={rowIdx}
                          className={`w-[15px] h-[15px] rounded-[3px] cursor-pointer transition-all ${colorStyle}`}
                          onMouseEnter={() => setHoveredDay(dayPoint)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>

        {/* Hover Tooltip Panel */}
        <div className="min-h-[56px] bg-slate-950/60 rounded-lg border border-slate-800 p-3 flex items-center justify-between text-xs">
          {hoveredDay ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
              <div>
                <span className="text-slate-500 block text-[10px] mb-0.5">Date</span>
                <span className="text-white font-semibold">{hoveredDay.date}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] mb-0.5">Active Hotspots</span>
                <span className="text-green-300 font-semibold">{hoveredDay.hotspotsCount} daily</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] mb-0.5">FRP Radiative Power</span>
                <span className="text-green-400 font-semibold">{hoveredDay.frp.toLocaleString()} MW</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] mb-0.5">Anomaly Status</span>
                <span className={`font-semibold ${
                  hoveredDay.status === 'Extreme Anomaly' ? 'text-green-500' : hoveredDay.status === 'High' ? 'text-green-400' : 'text-green-300'
                }`}>{hoveredDay.status}</span>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 text-xs text-center w-full">
              Hover over a cell to see daily telemetry.
            </div>
          )}
        </div>

      </div>

      {/* 3. SIDE/BOTTOM ANOMALY ANALYSIS PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Outliers summary card */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <h4 className="text-sm font-semibold text-white">Z-Score Outlier Report</h4>
          </div>

          {outliers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {outliers.map((dayPoint, idx) => (
                <div key={idx} className="p-3 bg-slate-950/70 border border-slate-800 rounded flex flex-col justify-between hover:border-slate-700 transition-colors">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-medium text-white">{dayPoint.date}</span>
                    <span className="text-[10px] font-medium text-green-400 bg-green-950/60 border border-green-500/20 px-1.5 py-0.5 rounded">
                      Z: +{dayPoint.zScore}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 text-xs text-slate-400 mt-2 gap-y-1">
                    <span>FRP Intensity</span>
                    <span className="text-green-400 font-medium text-right">{dayPoint.frp} MW</span>
                    <span>Confidence</span>
                    <span className="text-white text-right">98.4% Harmonized</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-500 text-xs text-center py-6">
              No high-Z outliers for {selectedYear}.
            </div>
          )}
        </div>

        {/* Data export controllers */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex flex-col justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-white">Archive Exports</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Export GeoJSON or daily statistical CSV sheets.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={handleExportGeoJSON}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-950 hover:bg-slate-900 text-slate-300 rounded-lg text-xs border border-slate-800 transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-green-500" />
              Export Harmonized Data (GeoJSON)
            </button>

            <button
              onClick={handleExportCSV}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-950 hover:bg-slate-900 text-slate-300 rounded-lg text-xs border border-slate-800 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-green-500" />
              Export Telemetry Tables (CSV)
            </button>
          </div>

          {exportStatus && (
            <div className="bg-slate-950/80 p-2 border border-slate-800 rounded-lg text-xs text-emerald-400 flex items-center gap-1.5">
              <span>●</span>
              <span className="truncate">{exportStatus}</span>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}