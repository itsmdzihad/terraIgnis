import { cellToLatLng } from 'h3-js';

export interface CountryFeature {
  type: 'Feature';
  properties: Record<string, string | number | null>;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

interface CountryCollection {
  type: 'FeatureCollection';
  features: CountryFeature[];
}

let countriesPromise: Promise<CountryCollection> | null = null;

export function loadCountryBoundaries(): Promise<CountryCollection> {
  if (!countriesPromise) {
    countriesPromise = fetch('/world-countries.geojson')
      .then(async (response) => {
        if (!response.ok) throw new Error('Country boundaries are unavailable.');
        return response.json() as Promise<CountryCollection>;
      })
      .catch((error: unknown) => {
        countriesPromise = null;
        throw error;
      });
  }
  return countriesPromise;
}

export function countryName(feature: CountryFeature): string {
  return String(feature.properties.ADMIN ?? feature.properties.NAME_EN ?? feature.properties.NAME ?? '');
}

export function findCountry(features: CountryFeature[], selectedName: string): CountryFeature | undefined {
  const normalizedName = selectedName.trim().toLocaleLowerCase();
  return features.find((feature) => [
    feature.properties.ADMIN,
    feature.properties.NAME,
    feature.properties.NAME_EN,
    feature.properties.FORMAL_EN,
    feature.properties.ISO_A3_EH,
    feature.properties.ADM0_A3,
  ].some((name) => typeof name === 'string' && name.trim().toLocaleLowerCase() === normalizedName));
}

function pointInRing(longitude: number, latitude: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = (yi > latitude) !== (yj > latitude)
      && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(longitude: number, latitude: number, rings: number[][][]): boolean {
  return Boolean(rings[0] && pointInRing(longitude, latitude, rings[0]))
    && !rings.slice(1).some((ring) => pointInRing(longitude, latitude, ring));
}

export function pointInCountry(longitude: number, latitude: number, feature: CountryFeature): boolean {
  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as number[][][]]
    : feature.geometry.coordinates as number[][][][];
  return polygons.some((polygon) => pointInPolygon(longitude, latitude, polygon));
}

export function cellIsInCountry(h3Cell: string, feature: CountryFeature): boolean {
  const [latitude, longitude] = cellToLatLng(h3Cell);
  return pointInCountry(longitude, latitude, feature);
}
