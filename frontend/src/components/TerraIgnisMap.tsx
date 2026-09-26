import React, { useState, useEffect, useMemo } from 'react';
import Map from 'react-map-gl/mapbox';
import DeckGL from '@deck.gl/react';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { ScatterplotLayer, PathLayer } from '@deck.gl/layers';
import 'mapbox-gl/dist/mapbox-gl.css';

// Public Mapbox Access Token as configured
const MAPBOX_TOKEN = 'pk.eyJ1Ijoic2hhaHJpYXJ4cHJveGltYSIsImEiOiJjbXVpcjdxeGUwMmllMzFvZjZkb3JrejlwIn0.u8XtSDGNGUtVb6V7XEu1BA';

export interface FirePoint {
  lat?: number;
  lng?: number;
  intensity?: number;
  frp?: number;
  h3Index?: string;
  burnIndex?: number;
}

interface TerraIgnisMapProps {
  longitude?: number;
  latitude?: number;
  zoom?: number;
  fireData: FirePoint[];
  isRegional?: boolean;
}

// Interpole neon fire color scale: slate blue -> deep crimson -> vibrant orange -> glowing yellow
function getColor(value: number): [number, number, number] {
  // Clamp value between 0 and 1
  const v = Math.min(1.0, Math.max(0.0, value));
  if (v < 0.25) {
    const t = v / 0.25;
    return [
      Math.round(71 + t * (153 - 71)),
      Math.round(85 + t * (27 - 85)),
      Math.round(105 + t * (27 - 105))
    ];
  } else if (v < 0.6) {
    const t = (v - 0.25) / 0.35;
    return [
      Math.round(153 + t * (249 - 153)),
      Math.round(27 + t * (115 - 27)),
      Math.round(27 + t * (22 - 27))
    ];
  } else {
    const t = (v - 0.6) / 0.4;
    return [
      Math.round(249 + t * (253 - 249)),
      Math.round(115 + t * (224 - 115)),
      Math.round(22 + t * (71 - 22))
    ];
  }
}

export default function TerraIgnisMap({
  longitude = 0,
  latitude = 20,
  zoom = 1.5,
  fireData = [],
  isRegional = false
}: TerraIgnisMapProps) {
  
  // Manage map viewport state dynamically so it can be controlled by tabs & user panned
  const [viewState, setViewState] = useState({
    longitude,
    latitude,
    zoom,
    pitch: isRegional ? 30 : 0,
    bearing: 0
  });

  // Keep viewState updated when props change
  useEffect(() => {
    setViewState({
      longitude,
      latitude,
      zoom,
      pitch: isRegional ? 35 : 0,
      bearing: 0
    });
  }, [longitude, latitude, zoom, isRegional]);

  // Split datasets based on presence of H3 index
  const h3Data = useMemo(() => {
    return fireData.filter(d => !!d.h3Index);
  }, [fireData]);

  const coordinateData = useMemo(() => {
    return fireData.filter(d => !d.h3Index && d.lat !== undefined && d.lng !== undefined);
  }, [fireData]);

  // Construct Deck.gl Layers list dynamically
  const layers = useMemo(() => {
    const list: any[] = [];

    // Layer 1: H3 Hexagon Layer representing gridded global burn anomalies
    if (h3Data.length > 0) {
      list.push(
        new H3HexagonLayer({
          id: 'h3-fire-hexagons',
          data: h3Data,
          pickable: true,
          wireframe: false,
          filled: true,
          extruded: true,
          getHexagon: (d: any) => d.h3Index,
          getFillColor: (d: any) => {
            const val = d.burnIndex !== undefined ? d.burnIndex : (d.intensity ? d.intensity / 1000 : 0.5);
            return getColor(val);
          },
          getElevation: (d: any) => {
            const val = d.burnIndex !== undefined ? d.burnIndex : (d.intensity ? d.intensity / 1000 : 0.5);
            return val * 1200;
          },
          opacity: isRegional ? 0.95 : 0.7,
          elevationScale: isRegional ? 180 : 60,
          updateTriggers: {
            getFillColor: [isRegional],
            getElevation: [isRegional]
          }
        })
      );
    }

    // Layer 2: Glowing Scatterplot Layer representing continuous coordinate hotspots
    if (coordinateData.length > 0) {
      list.push(
        new ScatterplotLayer({
          id: 'fire-embers',
          data: coordinateData,
          pickable: true,
          opacity: isRegional ? 0.95 : 0.8,
          stroked: true,
          filled: true,
          radiusScale: isRegional ? 4 : 8,
          radiusMinPixels: 4,
          radiusMaxPixels: 24,
          lineWidthMinPixels: 1,
          getPosition: (d: any) => [d.lng, d.lat],
          getRadius: (d: any) => {
            const size = d.intensity || d.frp || 100;
            return Math.max(500, size * 20);
          },
          getFillColor: (d: any) => {
            const intensity = d.intensity || d.frp || 100;
            const val = Math.min(1.0, intensity / 1500);
            return [...getColor(val), 210];
          },
          getLineColor: [255, 255, 255, 140],
          updateTriggers: {
            opacity: [isRegional],
            radiusScale: [isRegional]
          }
        })
      );
    }

    // Layer 3: Dynamic neon bounding box around regional hotspot clusters
    if (isRegional && coordinateData.length > 0) {
      let minLat = Infinity, maxLat = -Infinity;
      let minLng = Infinity, maxLng = -Infinity;

      coordinateData.forEach(p => {
        if (p.lat !== undefined && p.lng !== undefined) {
          if (p.lat < minLat) minLat = p.lat;
          if (p.lat > maxLat) maxLat = p.lat;
          if (p.lng < minLng) minLng = p.lng;
          if (p.lng > maxLng) maxLng = p.lng;
        }
      });

      if (minLat !== Infinity) {
        const padding = 1.0;
        const bounds = [
          [minLng - padding, minLat - padding],
          [maxLng + padding, minLat - padding],
          [maxLng + padding, maxLat + padding],
          [minLng - padding, maxLat + padding],
          [minLng - padding, minLat - padding]
        ];

        list.push(
          new PathLayer({
            id: 'regional-bounding-outline',
            data: [{ path: bounds }],
            getPath: (d: any) => d.path,
            getColor: [239, 68, 68, 220], // neon red outline
            getWidth: 4,
            widthScale: 1,
            widthMinPixels: 2.5,
            pickable: false
          })
        );
      }
    }

    return list;
  }, [h3Data, coordinateData, isRegional]);

  return (
    <div className="relative w-full h-full min-h-[350px] bg-slate-950 rounded-lg overflow-hidden border border-slate-800/80">
      
      {/* DeckGL Stage with Nested Mapbox Base Style */}
      <DeckGL
        viewState={viewState}
        onViewStateChange={(e: any) => setViewState(e.viewState as any)}
        controller={true}
        layers={layers}
        getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'grab')}
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          reuseMaps
        />
      </DeckGL>

      {/* Floating Scientific Legend Scale */}
      <div className="absolute bottom-4 right-4 bg-slate-950/90 border border-slate-800/80 rounded p-2.5 backdrop-blur-md text-[9px] font-mono text-slate-400 z-10 pointer-events-none">
        <span className="font-bold text-white block mb-1">HARMONIZED HOTSPOT SCALE</span>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="w-16 h-2 rounded bg-gradient-to-r from-slate-600 via-red-800 to-orange-500" />
            <span className="text-[8px] text-slate-500">Low &rarr; Extreme</span>
          </div>
          {h3Data.length > 0 && (
            <div className="text-[7.5px] text-cyan-400/80 mt-1 uppercase font-semibold">
              Grid Style: Active H3 Hexagons
            </div>
          )}
          {coordinateData.length > 0 && (
            <div className="text-[7.5px] text-orange-400/80 uppercase font-semibold">
              Points: Synchronized Embers
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
