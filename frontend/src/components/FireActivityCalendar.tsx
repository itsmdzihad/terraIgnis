import React, { useMemo, useState } from 'react';
import { Calendar, Download, FileText } from 'lucide-react';
import { generateDailyBurnData } from '../mockData';
import { useCalendar } from '../hooks/useCalendar';
import { useAnomalies } from '../hooks/useAnomalies';
import type { AnomalyLevel } from '../types/anomaly';
import type { CalendarDay } from '../types/calendar';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAGE_SIZE = 366;

const anomalyLevelStyle: Record<AnomalyLevel, string> = {
  normal: 'text-emerald-300 border-emerald-800/70 bg-emerald-950/40',
  low: 'text-amber-300 border-amber-800/70 bg-amber-950/40',
  high: 'text-orange-300 border-orange-800/70 bg-orange-950/40',
  extreme_low: 'text-cyan-300 border-cyan-800/70 bg-cyan-950/40',
  extreme_high: 'text-red-300 border-red-800/70 bg-red-950/40',
};

interface CalendarCell {
  date: string;
  observation: CalendarDay | null;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function burnIndexColor(value: number | null): string {
  if (value === null) return 'bg-slate-700 border border-cyan-700/40';
  if (value <= 25) return 'bg-green-950 border border-green-900/50';
  if (value <= 50) return 'bg-green-900 border border-green-800/50';
  if (value <= 75) return 'bg-green-700 border border-green-600/50';
  return 'bg-green-400 border border-green-300/50';
}

export default function FireActivityCalendar() {
  const [selectedYear, setSelectedYear] = useState(2026);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const { data, loading, error, refetch } = useCalendar({
    start_date: `${selectedYear}-01-01`,
    end_date: `${selectedYear}-12-31`,
    limit: PAGE_SIZE,
    offset: 0,
  });

  const {
    data: anomalyData,
    loading: anomaliesLoading,
    error: anomaliesError,
    refetch: refetchAnomalies,
  } = useAnomalies({
    start_date: `${selectedYear}-01-01`,
    end_date: `${selectedYear}-12-31`,
  });

  const observationsByDate = useMemo(
    () => new Map((data?.data ?? []).map((day) => [day.date, day])),
    [data],
  );

  // Calendar dates are layout only. A missing response record stays unavailable; it is never assigned a synthetic value.
  const calendarWeeks = useMemo(() => {
    const weeks: (CalendarCell | null)[][] = [];
    const firstDate = new Date(selectedYear, 0, 1);
    let week: (CalendarCell | null)[] = Array.from({ length: firstDate.getDay() }, () => null);
    const cursor = new Date(firstDate);

    while (cursor.getFullYear() === selectedYear) {
      const date = formatLocalDate(cursor);
      week.push({ date, observation: observationsByDate.get(date) ?? null });
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (week.length) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }, [observationsByDate, selectedYear]);

  const monthHeaders = useMemo(() => {
    let lastMonth = '';
    return calendarWeeks.map((week) => {
      const firstDate = week.find((cell): cell is CalendarCell => cell !== null)?.date;
      const month = firstDate?.slice(5, 7) ?? '';
      if (month && month !== lastMonth) {
        lastMonth = month;
        return MONTH_NAMES[Number(month) - 1];
      }
      return null;
    });
  }, [calendarWeeks]);

  // Archive exports remain on their existing mock source; the outlier report uses only API records.
  const archiveMockData = useMemo(() => generateDailyBurnData(selectedYear), [selectedYear]);
  const strongestAnomalies = useMemo(() => {
    if (!anomalyData) return [];
    return [...anomalyData]
      .sort((left, right) => {
        const leftScore = left.robust_z_score === null ? -1 : Math.abs(left.robust_z_score);
        const rightScore = right.robust_z_score === null ? -1 : Math.abs(right.robust_z_score);
        return rightScore - leftScore;
      })
      .slice(0, 4);
  }, [anomalyData]);

  const hoveredObservation = hoveredDate ? observationsByDate.get(hoveredDate) : undefined;
  const observedDateRange = data?.data.length
    ? `${data.data[0].date} — ${data.data[data.data.length - 1].date} · ${data.total} observed dates`
    : null;

  const handleExportGeoJSON = () => {
    setExportStatus('Compiling GeoJSON point vectors...');
    setTimeout(() => {
      const geoJson = {
        type: 'FeatureCollection',
        metadata: {
          generated: new Date().toISOString(),
          mission: 'TerraIgnis ACTIVE FIRE CORE',
          year: selectedYear,
        },
        features: archiveMockData.filter((day) => day.value > 0.6).map((day) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [
              -60.0 + Math.sin(day.dayOfYear) * 10,
              -6.5 + Math.cos(day.dayOfYear) * 5,
            ],
          },
          properties: {
            date: day.date,
            intensity: day.value,
            frp_mw: day.frp,
            hotspots: day.hotspotsCount,
            status: day.status,
          },
        })),
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
      let csvContent = 'Date,Day_of_Year,Harmonized_Burn_Index,Hotspots_Count,FRP_MW,Anomaly_Status,Z_Score\n';
      archiveMockData.forEach((day) => {
        csvContent += `${day.date},${day.dayOfYear},${day.value},${day.hotspotsCount},${day.frp},${day.status},${day.zScore}\n`;
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
    <div className="flex flex-col w-full min-h-full bg-slate-950 p-4 sm:p-6 gap-5 overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-lg">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-orange-500" />
            Activity Calendar
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Daily fire-activity observations · coverage varies by year</p>
        </div>

        <div className="flex items-center gap-4 min-w-[280px]">
          <label htmlFor="calendar-year" className="text-xs text-slate-400 shrink-0">Year</label>
          <input
            id="calendar-year"
            type="range"
            min="2000"
            max="2026"
            value={selectedYear}
            onChange={(event) => {
              setSelectedYear(Number(event.target.value));
              setHoveredDate(null);
            }}
            className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-green-500"
          />
          <span className="text-sm font-semibold text-white bg-slate-950 border border-slate-800 px-2.5 py-1 rounded font-mono">
            {selectedYear}
          </span>
        </div>
      </div>

      <section className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">Harmonized Burn Intensity — {selectedYear}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Daily mean Burn Index · dates without a record are unavailable</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400" aria-label="Burn Index legend">
            <span>No observation</span>
            <span className="w-[13px] h-[13px] rounded-[3px] bg-slate-950 border border-slate-700 block" />
            <span>Low</span>
            <span className="w-[13px] h-[13px] rounded-[3px] bg-green-950 block" />
            <span>Medium</span>
            <span className="w-[13px] h-[13px] rounded-[3px] bg-green-700 block" />
            <span>High</span>
            <span className="w-[13px] h-[13px] rounded-[3px] bg-green-400 block" />
          </div>
        </div>

        {observedDateRange && !loading && !error && (
          <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
            REAL BACKEND DATA · {observedDateRange}
          </div>
        )}

        <div className="bg-slate-950 rounded-lg p-4 sm:p-5 border border-slate-800/60 overflow-x-auto">
          {loading ? (
            <div role="status" className="min-h-32 flex flex-col items-center justify-center text-center">
              <span className="text-[9px] font-mono tracking-widest text-orange-400">CALENDAR TELEMETRY</span>
              <span className="mt-1 text-xs font-mono text-slate-300">LOADING...</span>
            </div>
          ) : error ? (
            <div role="alert" className="min-h-32 flex flex-col items-center justify-center text-center">
              <span className="text-[9px] font-mono tracking-widest text-red-400">CALENDAR TELEMETRY · CONNECTION ERROR</span>
              <span className="mt-1 text-xs text-slate-300">Unable to retrieve daily fire activity.</span>
              <button onClick={refetch} className="mt-3 border border-slate-700 px-3 py-1 text-[10px] font-mono text-slate-200 hover:border-orange-500">RETRY</button>
            </div>
          ) : data && data.count === 0 ? (
            <div className="min-h-32 flex flex-col items-center justify-center text-center">
              <span className="text-[9px] font-mono tracking-widest text-slate-300">NO CALENDAR DATA</span>
              <span className="mt-1 text-xs text-slate-400">No daily fire-activity observations are available for this period.</span>
            </div>
          ) : (
            <div className="inline-block min-w-max">
              <div className="flex gap-[4px] ml-[28px] mb-2 text-[10px] font-mono text-slate-400 select-none">
                {monthHeaders.map((month, columnIndex) => (
                  <div key={columnIndex} className="w-[15px] relative">
                    {month && <span className="absolute bottom-0 whitespace-nowrap">{month}</span>}
                  </div>
                ))}
              </div>

              <div className="flex items-start">
                <div className="flex flex-col gap-[4px] mr-2 text-[10px] font-mono text-slate-500 select-none">
                  {['', 'M', '', 'W', '', 'F', ''].map((day, index) => (
                    <div key={index} className="h-[15px] flex items-center justify-end w-[20px] leading-none">{day}</div>
                  ))}
                </div>

                <div className="flex gap-[4px]">
                  {calendarWeeks.map((week, columnIndex) => (
                    <div key={columnIndex} className="flex flex-col gap-[4px]">
                      {week.map((cell, rowIndex) => {
                        if (!cell) return <div key={rowIndex} className="w-[15px] h-[15px]" />;
                        const observation = cell.observation;
                        const color = observation
                          ? burnIndexColor(observation.mean_burn_index)
                          : 'bg-slate-950 border border-slate-800/80';
                        const label = observation
                          ? `${cell.date}: ${observation.fire_count} observed records, mean Burn Index ${observation.mean_burn_index ?? 'unavailable'}`
                          : `${cell.date}: no observed fire activity data`;

                        return (
                          <button
                            key={rowIndex}
                            type="button"
                            aria-label={label}
                            title={label}
                            onMouseEnter={() => setHoveredDate(cell.date)}
                            onFocus={() => setHoveredDate(cell.date)}
                            className={`w-[15px] h-[15px] rounded-[3px] transition-all hover:ring-1 hover:ring-white focus:ring-1 focus:ring-white ${color}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="min-h-[64px] bg-slate-950/60 rounded-lg border border-slate-800 p-3 flex items-center text-xs">
          {hoveredDate ? hoveredObservation ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full">
              <Telemetry label="Date" value={hoveredObservation.date} />
              <Telemetry label="Fire Count" value={hoveredObservation.fire_count.toLocaleString()} emphasis="text-green-300" />
              <Telemetry label="Mean Burn Index" value={hoveredObservation.mean_burn_index === null ? 'Unavailable' : hoveredObservation.mean_burn_index.toFixed(1)} emphasis="text-orange-300" />
              <Telemetry label="Max Burn Index" value={hoveredObservation.max_burn_index === null ? 'Unavailable' : hoveredObservation.max_burn_index.toFixed(1)} emphasis="text-orange-400" />
              <Telemetry label="Anomaly Count" value={hoveredObservation.anomaly_count.toLocaleString()} emphasis="text-cyan-300" />
            </div>
          ) : (
            <div className="w-full text-center text-slate-400">
              <span className="block text-[9px] font-mono tracking-wider text-slate-500">{hoveredDate}</span>
              NO OBSERVED FIRE ACTIVITY DATA
            </div>
          ) : (
            <div className="text-slate-500 text-xs text-center w-full">Hover over a date to see daily telemetry.</div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <h4 className="text-sm font-semibold text-white">Z-Score Outlier Report</h4>
            {!anomaliesLoading && !anomaliesError && anomalyData && (
              <span className="text-[9px] font-mono text-emerald-400">
                REAL BACKEND DATA · {anomalyData.length.toLocaleString()} outliers
              </span>
            )}
          </div>

          {anomaliesLoading ? (
            <div role="status" className="text-center py-8">
              <span className="block text-[9px] font-mono tracking-widest text-orange-400">ANOMALY TELEMETRY</span>
              <span className="block mt-1 text-xs font-mono text-slate-300">LOADING...</span>
            </div>
          ) : anomaliesError ? (
            <div role="alert" className="text-center py-8">
              <span className="block text-[9px] font-mono tracking-widest text-red-400">ANOMALY TELEMETRY · CONNECTION ERROR</span>
              <span className="block mt-1 text-xs text-slate-300">Unable to retrieve anomaly observations.</span>
              <button onClick={refetchAnomalies} className="mt-3 border border-slate-700 px-3 py-1 text-[10px] font-mono text-slate-200 hover:border-orange-500">RETRY</button>
            </div>
          ) : anomalyData && anomalyData.length === 0 ? (
            <div className="text-center py-8">
              <span className="block text-[9px] font-mono tracking-widest text-slate-300">NO ANOMALIES</span>
              <span className="block mt-1 text-xs text-slate-400">No anomaly observations are available for this period.</span>
            </div>
          ) : (
            <>
              <p className="text-[10px] text-slate-500">
                Showing the 4 strongest by absolute robust Z-score from the complete outlier set.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {strongestAnomalies.map((anomaly) => (
                  <article key={`${anomaly.acq_date}-${anomaly.h3_cell}`} className="p-3 bg-slate-950/70 border border-slate-800 rounded hover:border-slate-700 transition-colors">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-sm font-medium text-white">{anomaly.acq_date}</span>
                      <span className={`text-[9px] font-mono uppercase tracking-wider border px-1.5 py-0.5 rounded ${anomalyLevelStyle[anomaly.anomaly_level]}`}>
                        {anomaly.anomaly_level.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3">
                      <Telemetry label="Burn Index" value={anomaly.burn_index.toFixed(2)} emphasis="text-orange-300" />
                      <Telemetry
                        label="Robust Z"
                        value={anomaly.robust_z_score === null ? 'Unavailable' : `${anomaly.robust_z_score > 0 ? '+' : ''}${anomaly.robust_z_score.toFixed(2)}`}
                        emphasis="text-white"
                      />
                      <Telemetry
                        label="Percentile"
                        value={anomaly.anomaly_percentile === null ? 'Unavailable' : `${(anomaly.anomaly_percentile * 100).toFixed(0)}%`}
                        emphasis="text-cyan-300"
                      />
                      <div className="min-w-0">
                        <span className="text-slate-500 block text-[10px] mb-0.5">H3 CELL</span>
                        <span className="font-mono text-[10px] text-slate-300 break-all">{anomaly.h3_cell}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex flex-col justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-white">Archive Exports</h4>
            <p className="text-xs text-slate-400 mt-0.5">Export preview uses temporary mock telemetry.</p>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={handleExportGeoJSON} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-950 hover:bg-slate-900 text-slate-300 rounded-lg text-xs border border-slate-800 transition-colors">
              <FileText className="w-3.5 h-3.5 text-green-500" /> Export Harmonized Data (GeoJSON)
            </button>
            <button onClick={handleExportCSV} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-950 hover:bg-slate-900 text-slate-300 rounded-lg text-xs border border-slate-800 transition-colors">
              <Download className="w-3.5 h-3.5 text-green-500" /> Export Telemetry Tables (CSV)
            </button>
          </div>
          {exportStatus && (
            <div className="bg-slate-950/80 p-2 border border-slate-800 rounded-lg text-xs text-emerald-400 flex items-center gap-1.5">
              <span>●</span><span className="truncate">{exportStatus}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Telemetry({ label, value, emphasis = 'text-white' }: { label: string; value: string; emphasis?: string }) {
  return (
    <div className="min-w-0">
      <span className="text-slate-500 block text-[10px] mb-0.5">{label}</span>
      <span className={`font-semibold ${emphasis} break-words`}>{value}</span>
    </div>
  );
}
