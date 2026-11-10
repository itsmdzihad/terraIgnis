import { useCallback, useMemo } from 'react';
import { cellToLatLng } from 'h3-js';
import { ChevronDown } from 'lucide-react';
import { useCellAnomalyHistory } from '../hooks/useCellAnomalyHistory';
import { useDashboard } from '../context/DashboardContext';
import { useFires } from '../hooks/useFires';
import { useRegion } from '../hooks/useRegion';
import { useCountries } from '../hooks/useCountries';
import { useCountryFires } from '../hooks/useCountryFires';
import type { FireRecord } from '../types/fire';
import AnomalyHistoryChart from './AnomalyHistoryChart';
import TerraIgnisMap from './TerraIgnisMap';

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
    selectedCountry,
    selectedSensor,
    minBurnIndex,
    maxBurnIndex,
    setSelectedH3Cell,
    setSelectedCountry,
  } = useDashboard();
  const fireFilters = {
    date: selectedDate ?? undefined,
    sensor: selectedSensor ?? undefined,
    min_burn_index: minBurnIndex ?? undefined,
    max_burn_index: maxBurnIndex ?? undefined,
  };
  const fires = useFires({ ...fireFilters, limit: 5000 });
  const countryFires = useCountryFires(fireFilters, selectedCountry);
  const { countries, error: countriesError } = useCountries();
  const fireLoading = selectedCountry ? countryFires.loading : fires.loading;
  const fireError = selectedCountry ? countryFires.error : fires.error;
  const fireRecords = selectedCountry ? countryFires.records : fires.data?.data ?? [];
  const region = useRegion(selectedH3Cell);
  const history = useCellAnomalyHistory(selectedH3Cell);
  const regionData = region.data?.h3_cell === selectedH3Cell ? region.data : null;
  const historyData = history.data?.filters.h3_cell === selectedH3Cell ? history.data : null;

  const mapRecords = useMemo(() => {
    const uniqueRecords = new Map<string, FireRecord>();
    for (const record of fireRecords) {
      if (!uniqueRecords.has(record.h3_cell)) uniqueRecords.set(record.h3_cell, record);
    }
    return [...uniqueRecords.values()];
  }, [fireRecords]);

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

  const regionContent = !selectedH3Cell ? (
    <PanelState title="No cell selected" message="Select a cell on the map or from the dropdown to inspect its fire history." />
  ) : region.loading ? (
    <PanelState title="Loading" message="Loading cell analysis..." />
  ) : region.error && region.notFound ? (
    <PanelState title="No cell data" message="No analytical observations are available for this cell." />
  ) : region.error ? (
    <PanelState
      title="Connection error"
      message="Unable to retrieve cell analysis."
      action={<button onClick={region.refetch} className="mt-3 border border-slate-700 rounded px-3 py-1.5 text-[10px] font-mono text-slate-200 hover:border-orange-500">Retry</button>}
    />
  ) : regionData ? (
    <div className="space-y-4">
      <section className="bg-slate-900/40 border border-slate-800 rounded-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <p className="text-[11px] font-medium text-emerald-400">H3 Cell · Resolution 7</p>
            <p className="mt-1 text-xs font-mono text-white break-all">{regionData.h3_cell}</p>
          </div>
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
          <h3 className="text-sm font-semibold text-white">Sensor Detections</h3>
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

      <AnomalyHistoryChart
        records={historyData?.data ?? []}
        totalCount={historyData?.total}
        loading={history.loading}
        error={history.error}
        onRetry={history.refetch}
        h3Cell={selectedH3Cell}
      />
    </div>
  ) : null;

  return (
    <div className="regional-view flex flex-col h-full bg-slate-950 p-4 lg:p-6 gap-4 lg:gap-6 overflow-hidden">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-lg">
        <div>
          <h2 className="text-sm font-semibold text-white">Cell explorer</h2>
          <p className="text-xs text-cyan-300 mt-0.5">Inspect observed fire activity by H3 cell</p>
        </div>
        <div className="flex flex-col sm:items-end gap-1">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <label htmlFor="cell-country-select" className="text-[11px] font-medium text-slate-500">
            Country filter
            <div className="relative min-w-[180px] mt-1">
              <select
                id="cell-country-select"
                value={selectedCountry ?? ''}
                onChange={(event) => setSelectedCountry(event.target.value || null)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 pr-10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 appearance-none cursor-pointer"
              >
                <option value="">All countries</option>
                {countries.map((country) => {
                  const name = String(country.properties.ADMIN ?? country.properties.NAME_EN ?? country.properties.NAME);
                  return <option key={`${name}-${country.properties.ADM0_A3 ?? ''}`} value={name}>{name}</option>;
                })}
              </select>
              <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
              <span className="block mt-1 text-[10px] text-slate-500">Matches H3 cell centers.</span>
              {countriesError && <span className="block mt-1 text-[10px] text-red-300">Country list unavailable.</span>}
            </div>
          </label>
          <div>
          <label htmlFor="h3-cell-select" className="text-[11px] font-medium text-slate-500">Choose an observed cell</label>
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
          {fireLoading ? <span className="text-[10px] font-medium text-amber-300">Loading fire cells...</span> : fireError ? <span className="text-[10px] text-red-300">Cell list unavailable · <button onClick={selectedCountry ? countryFires.refetch : fires.refetch} className="underline">Retry</button></span> : <span className="text-[10px] text-slate-500">{formatCount(mapRecords.length)} {selectedCountry ? `${selectedCountry} ` : ''}loaded H3 cells · click a cell on map</span>}
          </div>
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6 overflow-hidden min-h-0">
        <section className="xl:col-span-5 min-h-[360px] xl:min-h-0 bg-slate-900/50 border border-slate-800 rounded-lg p-3 flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <p className="text-xs text-slate-400">H3 fire activity cells</p>
              <h3 className="text-sm font-semibold text-white mt-0.5">{selectedH3Cell ?? 'Select a cell'}</h3>
            </div>
            {selectedH3Cell && <button onClick={() => selectCell('')} className="text-[10px] font-medium text-slate-400 hover:text-white">Clear</button>}
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
          <p className="text-[10px] text-slate-500">{fireError ? 'Fire observations unavailable.' : 'Click a displayed H3 cell to inspect it.'} Highlighted cell uses cyan.</p>
        </section>

        <section className="xl:col-span-7 overflow-y-auto pr-1 min-h-0">
          {regionContent}
          <p className="mt-4 mb-2 text-xs leading-relaxed text-slate-500">
            Burn Index is a relative activity score. Cell history shows observed dates only; gaps do not imply zero activity.
          </p>
        </section>
      </main>
    </div>
  );
}
