import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import MapboxMap, { Layer, Source } from 'react-map-gl/mapbox';
import DeckGL from '@deck.gl/react';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import 'mapbox-gl/dist/mapbox-gl.css';
import { cellToLatLng } from 'h3-js';

// Public Mapbox Access Token as configured
const MAPBOX_TOKEN = 'pk.eyJ1Ijoic2hhaHJpYXJ4cHJveGltYSIsImEiOiJjbXVpcjdxeGUwMmllMzFvZjZkb3JrejlwIn0.u8XtSDGNGUtVb6V7XEu1BA';
const SATELLITE_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';
const FALLBACK_STYLE = 'mapbox://styles/mapbox/streets-v12';

export interface FirePoint {
  h3Index: string;
  burnIndex: number;
}

interface FireCellHoverInfo {
  h3Index: string;
  latitude: number;
  longitude: number;
  burnIndex: number;
  x: number;
  y: number;
}

interface TerraIgnisMapProps {
  longitude?: number;
  latitude?: number;
  zoom?: number;
  fireData: FirePoint[];
  isRegional?: boolean;
  selectedH3Cell?: string | null;
  onH3CellClick?: (h3Cell: string) => void;
}

// Perceptually ordered blue-to-yellow ramp chosen to remain distinguishable
// for common color-vision deficiencies.
function getColor(value: number): [number, number, number] {
  const v = Math.min(1.0, Math.max(0.0, value));
  const stops: [number, number, number][] = [[0, 32, 76], [123, 123, 120], [254, 232, 56]];
  const scaled = v * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const t = scaled - index;
  return stops[index].map((channel, channelIndex) =>
    Math.round(channel + t * (stops[index + 1][channelIndex] - channel)),
  ) as [number, number, number];
}

export default function TerraIgnisMap({
  longitude = 0,
  latitude = 20,
  zoom = 1.5,
  fireData = [],
  isRegional = false,
  selectedH3Cell = null,
  onH3CellClick
}: TerraIgnisMapProps) {
  const [mapStyle, setMapStyle] = useState(SATELLITE_STYLE);
  const [satelliteUnavailable, setSatelliteUnavailable] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<FireCellHoverInfo | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  
  // Manage map viewport state dynamically so it can be controlled by tabs & user panned
  const [viewState, setViewState] = useState({
    longitude,
    latitude,
    zoom,
    pitch: 0,
    bearing: 0
  });

  const handleMapError = useCallback(() => {
    setMapStyle((currentStyle) => currentStyle === SATELLITE_STYLE ? FALLBACK_STYLE : currentStyle);
    setSatelliteUnavailable(true);
  }, []);

  // Follow a shared H3 selection, then return to the current overview when it is cleared.
  useEffect(() => {
    if (selectedH3Cell) {
      try {
        const [selectedLatitude, selectedLongitude] = cellToLatLng(selectedH3Cell);
        setViewState({ longitude: selectedLongitude, latitude: selectedLatitude, zoom: Math.max(zoom, 9), pitch: 0, bearing: 0 });
        return;
      } catch {
        // Keep the supplied overview if a cell identifier is invalid.
      }
    }
    setViewState({ longitude, latitude, zoom, pitch: 0, bearing: 0 });
  }, [longitude, latitude, zoom, isRegional, selectedH3Cell]);

  // The API returns one record per H3 cell and date. Collapse repeated dates
  // to one visible map marker while retaining the strongest observed score.
  const h3Data = useMemo(() => {
    const cells = new Map<string, FirePoint>();
    for (const record of fireData) {
      const current = cells.get(record.h3Index);
      if (!current || record.burnIndex > current.burnIndex) cells.set(record.h3Index, record);
    }
    return [...cells.values()];
  }, [fireData]);

  const firePointsByCell = useMemo(
    () => new Map(h3Data.map((record) => [record.h3Index, record])),
    [h3Data],
  );

  const showCellHover = useCallback((h3Index: string | undefined, x: number, y: number) => {
    if (!h3Index) {
      setHoverInfo(null);
      return;
    }
    const record = firePointsByCell.get(h3Index);
    if (!record) {
      setHoverInfo(null);
      return;
    }
    const [cellLatitude, cellLongitude] = cellToLatLng(h3Index);
    setHoverInfo({ h3Index, latitude: cellLatitude, longitude: cellLongitude, burnIndex: record.burnIndex, x, y });
  }, [firePointsByCell]);

  const pointFeatures = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: h3Data.map((record) => {
      const [lat, lng] = cellToLatLng(record.h3Index);
      return {
        type: 'Feature' as const,
        properties: record,
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
      };
    }),
  }), [h3Data]);

  const globeView = viewState.zoom <= 1.5;

  // Construct Deck.gl Layers list dynamically
  const layers = useMemo(() => {
    const list = [];

    // Show cell boundaries only when zoomed in; at overview scale they hide
    // the imagery and make individual observed cells hard to find.
    if (h3Data.length > 0 && !globeView && viewState.zoom >= 6) {
      list.push(
        new H3HexagonLayer({
          id: 'h3-fire-hexagons',
          data: h3Data,
          pickable: true,
          onClick: (info) => {
            const h3Cell = (info.object as { h3Index?: string } | undefined)?.h3Index;
            if (h3Cell) onH3CellClick?.(h3Cell);
          },
          onHover: (info) => {
            const h3Cell = (info.object as { h3Index?: string } | undefined)?.h3Index;
            showCellHover(h3Cell, info.x, info.y);
          },
          wireframe: false,
          filled: true,
          extruded: false,
          getHexagon: (d: FirePoint & { h3Index: string }) => d.h3Index,
          getFillColor: (d: FirePoint) => {
            if (d.h3Index === selectedH3Cell) return [0, 205, 220, 100];
            const rawBurnIndex = d.burnIndex;
            const val = rawBurnIndex / 100;
            return [...getColor(val), 70];
          },
          getLineColor: (d: FirePoint) => d.h3Index === selectedH3Cell ? [100, 245, 255, 255] : [255, 255, 255, 120],
          lineWidthMinPixels: 1,
          getLineWidth: (d: FirePoint) => d.h3Index === selectedH3Cell ? 2 : 1,
          opacity: 0.8,
          updateTriggers: {
            getFillColor: [selectedH3Cell],
            getLineColor: [selectedH3Cell],
            getLineWidth: [selectedH3Cell]
          }
        })
      );
    }

    // Keep the shared selection visible if date/sensor filters remove it from the current Fire API page.
    if (!globeView && viewState.zoom >= 4 && selectedH3Cell && !h3Data.some((record) => record.h3Index === selectedH3Cell)) {
      list.push(new H3HexagonLayer({
        id: 'selected-h3-cell',
        data: [{ h3Index: selectedH3Cell }],
        pickable: false,
        filled: true,
        stroked: true,
        extruded: false,
        getHexagon: (record: { h3Index: string }) => record.h3Index,
        getFillColor: [6, 182, 212, 45],
        getLineColor: [103, 232, 249, 255],
        getLineWidth: 4,
        lineWidthMinPixels: 3,
      }));
    }

    return list;
  }, [globeView, h3Data, selectedH3Cell, onH3CellClick, showCellHover, viewState.zoom]);

  return (
    <div ref={mapContainerRef} className="relative w-full h-full min-h-[350px] bg-slate-950 rounded-lg overflow-hidden border border-slate-800/80">
      
      {/* DeckGL Stage with Nested Mapbox Base Style */}
      <DeckGL
        viewState={viewState}
        onViewStateChange={(e) => setViewState(e.viewState as typeof viewState)}
        controller={true}
        layers={layers}
        getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'grab')}
      >
        <MapboxMap
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={mapStyle}
          projection={{ name: globeView ? 'globe' : 'mercator' }}
          onError={handleMapError}
          interactiveLayerIds={h3Data.length > 0 ? ['fire-cell-points'] : []}
          onClick={(event) => {
            const h3Cell = event.features?.[0]?.properties?.h3Index;
            if (typeof h3Cell === 'string') onH3CellClick?.(h3Cell);
          }}
          onMouseMove={(event) => {
            const h3Cell = event.features?.find((feature) => typeof feature.properties?.h3Index === 'string')?.properties?.h3Index;
            if (typeof h3Cell === 'string') {
              showCellHover(h3Cell, event.point.x, event.point.y);
            } else if (globeView || viewState.zoom < 6) {
              setHoverInfo(null);
            }
          }}
          onMouseLeave={() => setHoverInfo(null)}
        >
          <Source id="fire-cell-source" type="geojson" data={pointFeatures}>
            <Layer
              id="fire-cell-points"
              type="circle"
              paint={{
                'circle-radius': 4,
                'circle-color': ['case', ['==', ['get', 'h3Index'], selectedH3Cell ?? ''], '#00cddc', '#ff2226'],
                'circle-stroke-color': '#fffaf0',
                'circle-stroke-width': 1,
                'circle-opacity': 0.96,
              }}
            />
          </Source>
        </MapboxMap>
      </DeckGL>

      {hoverInfo && (
        <div
          role="status"
          className="pointer-events-none absolute z-20 min-w-48 rounded-xl border border-slate-600/70 bg-slate-950/95 px-3 py-2.5 text-xs text-slate-100 shadow-xl backdrop-blur-md"
          style={{
            left: Math.max(8, Math.min(hoverInfo.x + 14, (mapContainerRef.current?.clientWidth ?? 320) - 208)),
            top: Math.max(8, Math.min(hoverInfo.y + 14, (mapContainerRef.current?.clientHeight ?? 200) - 92)),
          }}
        >
          <div className="font-semibold text-white">H3 cell</div>
          <div className="mt-1 tabular-nums text-slate-300">Lat {hoverInfo.latitude.toFixed(5)}° · Lon {hoverInfo.longitude.toFixed(5)}°</div>
          <div className="mt-1 font-semibold text-amber-300">Burn Index {hoverInfo.burnIndex.toFixed(2)}</div>
        </div>
      )}

      {/* Floating Scientific Legend Scale */}
      <div className="absolute bottom-4 left-4 bg-slate-950/90 border border-slate-800/80 rounded p-2.5 backdrop-blur-md text-[9px] font-mono text-slate-400 z-10 pointer-events-none">
        <span className="font-bold text-white block mb-1">BURN INDEX · 0–100</span>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="w-16 h-2 rounded" style={{ background: 'linear-gradient(to right, #00204c, #7b7b78, #fee838)' }} />
            <span className="text-[8px] text-slate-400">Low · Medium · High</span>
          </div>
          {h3Data.length > 0 && (
            <div className="text-[7.5px] text-cyan-400/80 mt-1 uppercase font-semibold">
              Red markers: observed H3 cells
            </div>
          )}
          {satelliteUnavailable && (
            <div className="text-[8px] text-amber-300 mt-1">Satellite tiles unavailable · showing street map</div>
          )}
        </div>
      </div>

    </div>
  );
}
