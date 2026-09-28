import { useCallback, useMemo } from 'react';
import { cellToLatLng } from 'h3-js';
import { ChevronDown } from 'lucide-react';
import { useCellAnomalyHistory } from '../hooks/useCellAnomalyHistory';
import { useDashboard } from '../context/DashboardContext';
import { useFires } from '../hooks/useFires';
import { useRegion } from '../hooks/useRegion';
import type { AnomalyLevel } from '../types/anomaly';
import type { FireRecord } from '../types/fire';
import TerraIgnisMap from './TerraIgnisMap';

const LEVEL_COLORS: Record<AnomalyLevel, string> = {
  extreme_low: '#38bdf8',
  low: '#22d3ee',
  normal: '#64748b',
  high: '#fb923c',
  extreme_high: '#ef4444',
};

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Unavailable';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

function formatIndex(value: number | null): string {
  return value == null ? 'Unavailable' : value.toFixed(2);
}

function Metric({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[9px] font-mono tracking-wide text-slate-500">{label}</span>
      <span className={`block mt-0.5 text-sm font-semibold font-mono break-words ${tone}`}>{value}</span>
    </div>
  );
}

function PanelState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-5 text-center">
      <p className="text-[10px] font-mono tracking-widest text-cyan-300">{title}</p>
      <p className="text-xs text-slate-400 mt-2">{message}</p>
      {action}
    </div>
  );
}

export default function RegionalDeepDive() {
  const {
    selectedDate,
    selectedH3Cell,
    selectedSensor,
    minBurnIndex,
    maxBurnIndex,
    setSelectedH3Cell,
  } = useDashboard();
  const fires = useFires({
    date: selectedDate ?? undefined,
    sensor: selectedSensor ?? undefined,
    min_burn_index: minBurnIndex ?? undefined,
    max_burn_index: maxBurnIndex ?? undefined,
    limit: 5000,
  });
  const region = useRegion(selectedH3Cell);
  const history = useCellAnomalyHistory(selectedH3Cell);
  const regionData = region.data?.h3_cell === selectedH3Cell ? region.data : null;
  const historyData = history.data?.filters.h3_cell === selectedH3Cell ? history.data : null;

  const mapRecords = useMemo(() => {
    const uniqueRecords = new Map<string, FireRecord>();
    for (const record of fires.data?.data ?? []) {
      if (!uniqueRecords.has(record.h3_cell)) uniqueRecords.set(record.h3_cell, record);
    }
    return [...uniqueRecords.values()];
  }, [fires.data]);

  const mapFireData = useMemo(() => mapRecords.map((record) => ({
    h3Index: record.h3_cell,
    burnIndex: record.burn_index,
  })), [mapRecords]);

  const selectCell = useCallback((h3Cell: string) => setSelectedH3Cell(h3Cell || null), []);

  const mapCenter = useMemo(() => {
    if (selectedH3Cell) {
      try {
        const [latitude, longitude] = cellToLatLng(selectedH3Cell);
        return { latitude, longitude, zoom: 9 };
      } catch {
        return { latitude: 20, longitude: 0, zoom: 1.5 };
      }
    }

    if (mapRecords.length === 0) return { latitude: 20, longitude: 0, zoom: 1.5 };

    const centers = mapRecords.map((record) => cellToLatLng(record.h3_cell));
    const latitude = centers.reduce((sum, center) => sum + center[0], 0) / centers.length;
    const longitude = Math.atan2(
      centers.reduce((sum, center) => sum + Math.sin(center[1] * Math.PI / 180), 0),
      centers.reduce((sum, center) => sum + Math.cos(center[1] * Math.PI / 180), 0),
    ) * 180 / Math.PI;
    const unwrappedLongitudes = centers.map((center) => ((center[1] - longitude + 540) % 360) - 180);
    const longitudeSpan = Math.max(...unwrappedLongitudes) - Math.min(...unwrappedLongitudes);
    const mercatorY = (lat: number) => {
      const clamped = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
      return (1 - Math.asinh(Math.tan(clamped)) / Math.PI) / 2;
    };
    const yValues = centers.map((center) => mercatorY(center[0]));
    const latitudeSpan = Math.max(...yValues) - Math.min(...yValues);
    const zoomLongitude = Math.log2((700 * 360) / (256 * Math.max(longitudeSpan, 0.1)));
    const zoomLatitude = Math.log2(500 / (256 * Math.max(latitudeSpan, 0.001)));
    const zoom = Math.max(1.5, Math.min(5, Math.min(zoomLongitude, zoomLatitude) - 0.4));

    return { latitude, longitude, zoom };
  }, [mapRecords, selectedH3Cell]);

  const chartRecords = useMemo(() => (historyData?.data ?? []).slice(-90), [historyData]);
  const chartPoints = useMemo(() => chartRecords.map((record, index) => {
    const x = chartRecords.length <= 1 ? 100 : (index / (chartRecords.length - 1)) * 400;
    const y = 112 - (record.burn_index / 100) * 100;
    return { ...record, x, y };
  }), [chartRecords]);
  const chartPath = chartPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  const regionContent = !selectedH3Cell ? (
    <PanelState title="NO H3 CELL SELECTED" message="Select a fire-activity cell from the map to inspect regional telemetry." />
  ) : region.loading ? (
    <PanelState title="H3 TELEMETRY" message="LOADING CELL ANALYSIS..." />
  ) : region.error && region.notFound ? (
    <PanelState title="NO H3 DATA" message="No analytical observations are available for this cell." />
  ) : region.error ? (
    <PanelState
      title="H3 TELEMETRY · CONNECTION ERROR"
      message="Unable to retrieve cell analysis."
      action={<button onClick={region.refetch} className="mt-3 border border-slate-700 rounded px-3 py-1.5 text-[10px] font-mono text-slate-200 hover:border-orange-500">RETRY</button>}
    />
  ) : regionData ? (
    <div className="space-y-4">
      <section className="bg-slate-900/40 border border-slate-800 rounded-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <p className="text-[9px] font-mono tracking-widest text-emerald-400">SELECTED H3 CELL · RESOLUTION 7</p>
            <p className="mt-1 text-xs font-mono text-white break-all">{regionData.h3_cell}</p>
          </div>
          <span className="text-[9px] font-mono text-slate-500">GET /api/regions/{'{h3_cell}'}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4">
          <Metric label="OBSERVED CELL/DATES" value={formatCount(regionData.observed_cell_dates)} />
          <Metric label="FIRST OBSERVED" value={formatDate(regionData.first_observed_date)} />
          <Metric label="LAST OBSERVED" value={formatDate(regionData.last_observed_date)} />
          <Metric label="TOTAL FIRE DETECTIONS" value={formatCount(regionData.total_fire_detections)} />
          <Metric label="MEAN BURN INDEX" value={formatIndex(regionData.mean_burn_index)} tone="text-orange-300" />
          <Metric label="MIN BURN INDEX" value={formatIndex(regionData.min_burn_index)} />
          <Metric label="MAX BURN INDEX" value={formatIndex(regionData.max_burn_index)} />
          <Metric label="ANOMALY COUNT" value={formatCount(regionData.anomaly_count)} tone="text-amber-300" />
          <Metric label="EXTREME ANOMALY COUNT" value={formatCount(regionData.extreme_anomaly_count)} tone="text-red-300" />
        </div>
      </section>

      <section className="bg-slate-900/40 border border-slate-800 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400">Sensor Detections</p>
            <h3 className="text-sm font-semibold text-white mt-0.5">Selected-cell aggregate</h3>
          </div>
          <span className="text-[9px] font-mono text-emerald-400">REAL API DATA</span>
        </div>
        <div className="mt-4 space-y-3">
          {([
            ['MODIS', regionData.modis_fire_detections, 'bg-amber-400'],
            ['VIIRS', regionData.viirs_fire_detections, 'bg-red-400'],
          ] as const).map(([sensor, count, color]) => {
            const total = regionData!.modis_fire_detections + regionData!.viirs_fire_detections;
            const width = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={sensor}>
                <div className="flex justify-between text-[10px] font-mono mb-1.5">
                  <span className="text-slate-300">{sensor} FIRE DETECTIONS</span>
                  <span className="text-white">{formatCount(count)}</span>
                </div>
                <div className="h-2 bg-slate-950 rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full`} style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] text-slate-500">Detection counts aggregated over observed cell/dates; not a count of distinct physical fires.</p>
      </section>

      <section className="bg-slate-900/40 border border-slate-800 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-slate-400">ANOMALY HISTORY</p>
            <h3 className="text-sm font-semibold text-white mt-0.5">Observed Burn Index by cell/date</h3>
          </div>
          <span className="text-[9px] font-mono text-slate-500">GET /api/anomalies/{'{h3_cell}'}</span>
        </div>
        {history.loading ? (
          <p role="status" className="mt-4 text-[10px] font-mono text-amber-300">LOADING ANOMALY HISTORY...</p>
        ) : history.error ? (
          <div role="alert" className="mt-4 flex items-center justify-between gap-2 text-xs text-slate-400">
            <span>ANOMALY HISTORY · UNAVAILABLE</span>
            <button onClick={history.refetch} className="border border-slate-700 rounded px-2 py-1 text-[9px] font-mono text-slate-200 hover:border-orange-500">RETRY</button>
          </div>
        ) : chartRecords.length === 0 ? (
          <p className="mt-4 text-xs text-slate-400">No observation history is available for this cell.</p>
        ) : (
          <>
            <div className="mt-4 h-32">
              <svg viewBox="0 0 400 120" className="w-full h-full" role="img" aria-label="Selected H3 cell Burn Index history colored by backend anomaly level">
                {[0, 25, 50, 75, 100].map((level) => {
                  const y = 112 - level;
                  return <g key={level}><line x1="0" x2="400" y1={y} y2={y} stroke="#1e293b" strokeDasharray="3 4" /><text x="2" y={Math.max(9, y - 2)} fill="#64748b" fontSize="7">{level}</text></g>;
                })}
                {chartPath && <path d={chartPath} fill="none" stroke="#475569" strokeWidth="1.5" />}
                {chartPoints.map((point) => (
                  <circle key={`${point.acq_date}-${point.h3_cell}`} cx={point.x} cy={point.y} r="2.8" fill={LEVEL_COLORS[point.anomaly_level]}>
                    <title>{`${point.acq_date} · Burn Index ${point.burn_index.toFixed(2)} · ${point.anomaly_level}`}</title>
                  </circle>
                ))}
              </svg>
            </div>
            <div className="flex justify-between text-[9px] font-mono text-slate-500 mt-1">
              <span>{chartRecords[0]?.acq_date}</span>
              <span>{chartRecords.length} of {formatCount(historyData?.total ?? chartRecords.length)} records · Burn Index 0–100</span>
              <span>{chartRecords[chartRecords.length - 1]?.acq_date}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(LEVEL_COLORS).map(([level, color]) => (
                <span key={level} className="flex items-center gap-1 text-[9px] font-mono text-slate-400"><i className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />{level.replace('_', ' ')}</span>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-full bg-slate-950 p-4 lg:p-6 gap-4 lg:gap-6 overflow-hidden">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-lg">
        <div>
          <h2 className="text-sm font-semibold text-white">Regional Deep Dive</h2>
          <p className="text-xs text-cyan-300 mt-0.5 font-mono">H3 CELL ANALYSIS · resolution 7</p>
          <p className="text-[10px] text-slate-500 mt-1">Selected: <span className="font-mono text-slate-300">{selectedH3Cell ?? 'None'}</span></p>
        </div>
        <div className="flex flex-col sm:items-end gap-1">
          <label htmlFor="h3-cell-select" className="text-[9px] font-mono tracking-widest text-slate-500">SELECT FROM LOADED FIRE OBSERVATIONS</label>
          <div className="relative min-w-[260px]">
            <select
              id="h3-cell-select"
              value={selectedH3Cell ?? ''}
              onChange={(event) => selectCell(event.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 pr-10 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-orange-500 appearance-none cursor-pointer"
            >
              <option value="">No H3 cell selected</option>
              {selectedH3Cell && !mapRecords.some((record) => record.h3_cell === selectedH3Cell) && <option value={selectedH3Cell}>{selectedH3Cell} · selected</option>}
              {mapRecords.map((record) => <option key={record.h3_cell} value={record.h3_cell}>{record.h3_cell}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          {fires.loading ? <span className="text-[9px] font-mono text-amber-300">LOADING FIRE CELLS...</span> : fires.error ? <span className="text-[9px] text-red-300">CELL LIST UNAVAILABLE · <button onClick={fires.refetch} className="underline">RETRY</button></span> : <span className="text-[9px] font-mono text-slate-500">{formatCount(mapRecords.length)} loaded H3 cells · click a cell on map</span>}
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6 overflow-hidden min-h-0">
        <section className="xl:col-span-5 min-h-[360px] xl:min-h-0 bg-slate-900/50 border border-slate-800 rounded-lg p-3 flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <p className="text-xs text-slate-400">H3 fire activity cells</p>
              <h3 className="text-sm font-semibold text-white mt-0.5">{selectedH3Cell ?? 'Select a cell'}</h3>
            </div>
            {selectedH3Cell && <button onClick={() => selectCell('')} className="text-[9px] font-mono text-slate-400 hover:text-white">CLEAR</button>}
          </div>
          <div className="flex-1 min-h-0">
            <TerraIgnisMap
              latitude={mapCenter.latitude}
              longitude={mapCenter.longitude}
              zoom={mapCenter.zoom}
              fireData={mapFireData}
              isRegional={true}
              selectedH3Cell={selectedH3Cell}
              onH3CellClick={selectCell}
            />
          </div>
          <p className="text-[9px] font-mono text-slate-500">{fires.error ? 'Fire observations unavailable.' : 'Click a displayed H3 cell to load its telemetry.'} Highlighted cell uses cyan.</p>
        </section>

        <section className="xl:col-span-7 overflow-y-auto pr-1 min-h-0">
          {regionContent}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <article className="bg-slate-900/30 border border-slate-800/80 rounded-lg p-4">
              <p className="text-[9px] font-mono tracking-widest text-cyan-300">REFERENCE DATA · NOT CELL-SPECIFIC</p>
              <h3 className="mt-1 text-sm font-semibold text-white">Diurnal Cycle</h3>
              <p className="mt-2 text-xs text-slate-400">Overpass schedule and radiative curves are unavailable from the selected-cell APIs.</p>
            </article>
            <article className="bg-slate-900/30 border border-slate-800/80 rounded-lg p-4">
              <p className="text-[9px] font-mono tracking-widest text-cyan-300">REFERENCE DATA · NOT CELL-SPECIFIC</p>
              <h3 className="mt-1 text-sm font-semibold text-white">Land Cover</h3>
              <p className="mt-2 text-xs text-slate-400">No land-cover measurements are provided by the H3 summary endpoint.</p>
            </article>
          </div>
          <p className="mt-4 mb-2 text-[9px] font-mono text-slate-600">Annual historical sensor series and harmonized trends are unavailable from the current cell summary API.</p>
        </section>
      </main>
    </div>
  );
}
