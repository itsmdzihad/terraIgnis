/**
 * TerraIgnis Scientific Dataset
 * Harmonized MODIS (Aqua/Terra) and VIIRS (SNPP/JPSS-1) active fire observations (2000 - 2026)
 */

export interface FireHotspot {
  id: string;
  lat: number;
  lng: number;
  intensity: number; // FRP (MW)
  sensor: 'MODIS' | 'VIIRS' | 'Harmonized';
  region: string;
  confidence: number;
  landCover: string;
}

export interface YearData {
  year: number;
  burnedAreaM: number; // Million hectares
  burnedAreaSqKm: number; // sq km
  frpTotal: number; // Terawatts
  frpTotalMW: number; // Megawatts equivalent
  modisCount: number;
  viirsCount: number;
  harmonizedCount: number;
  satelliteContinuity: number; // % health coverage indicator
  harmonizationIndex: number; // Normalized ratio index (0 to 1)
  anomalyIndex: number; // -1 to +1
}

export interface DiurnalPoint {
  hour: number;
  modisTerra: number;
  modisAqua: number;
  viirsSnpp: number;
  harmonized: number;
}

export interface LandCoverCorrelation {
  class: string;
  modisPercentage: number;
  viirsPercentage: number;
  harmonizedPercentage: number;
  fusedFRP: number;
}

export interface MonthlyHeatmapCell {
  year: number;
  month: number; // 0 to 11
  value: number; // 0.0 to 1.0 (Burn intensity index)
  notes?: string;
}

export interface RegionalData {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  bounds: [[number, number], [number, number]]; // SVG/Coord bounds
  modisRawAnnual: { year: number; val: number }[];
  viirsRawAnnual: { year: number; val: number }[];
  harmonizedAnnual: { year: number; val: number }[];
  description: string;
}

export const SATELLITE_METADATA = {
  MODIS: {
    orbit: "Sun-synchronous, Polar",
    altitude: "705 km",
    resolution: "1 km (nadir) active fire pixel",
    passes: "Terra (~10:30 AM/PM), Aqua (~1:30 AM/PM)",
    spectralBands: "4 µm (middle infrared) & 11 µm (thermal infrared)",
    strengths: "Longest continuous baseline (since 2000), excellent calibration stability.",
    limitations: "Coarse spatial resolution; misses smaller, cooler, or under-canopy fires.",
  },
  VIIRS: {
    orbit: "Sun-synchronous, Polar",
    altitude: "824 km",
    resolution: "375 m (nadir) active fire pixel",
    passes: "Suomi-NPP (~1:30 AM/PM), NOAA-20/JPSS-1 (~12:40 AM/PM)",
    spectralBands: "Dual-gain I-band 4 (3.74 µm) & I-band 5 (11.45 µm)",
    strengths: "Exceptional spatial resolution; detects low-intensity, tiny fires; minimal swath-edge pixel expansion.",
    limitations: "Shorter baseline (SNPP active since late 2011; JPSS-1 since 2017); sensor saturation in extreme fires.",
  },
  HARMONIZATION: {
    algorithm: "TerraIgnis Multi-Sensor Coregistration & Bi-directional Scaling Function",
    developer: "NASA Space Apps Team - TerraIgnis",
    methodology: "Applies a spatio-temporal kernel matching function that rescales VIIRS sub-pixel detections into MODIS-equivalent grid intensities while adjusting for diurnal phase gaps using physical radiative transfer coefficients.",
    validity: "Calibrated using concurrent Aqua MODIS & SNPP VIIRS equatorial crossings with high-accuracy ground-truth validation."
  }
};

// Global annual metrics (2000 - 2026)
export const GLOBAL_ANNUAL_SERIES: YearData[] = [
  { year: 2000, burnedAreaM: 301.2, burnedAreaSqKm: 301200, frpTotal: 1845, frpTotalMW: 1845000, modisCount: 120500, viirsCount: 0, harmonizedCount: 120500, satelliteContinuity: 92.4, harmonizationIndex: 0.78, anomalyIndex: -0.15 },
  { year: 2001, burnedAreaM: 298.5, burnedAreaSqKm: 298500, frpTotal: 1812, frpTotalMW: 1812000, modisCount: 119200, viirsCount: 0, harmonizedCount: 119200, satelliteContinuity: 93.1, harmonizationIndex: 0.79, anomalyIndex: -0.21 },
  { year: 2002, burnedAreaM: 325.4, burnedAreaSqKm: 325400, frpTotal: 1990, frpTotalMW: 1990000, modisCount: 131100, viirsCount: 0, harmonizedCount: 131100, satelliteContinuity: 93.8, harmonizationIndex: 0.81, anomalyIndex: 0.12 },
  { year: 2003, burnedAreaM: 312.1, burnedAreaSqKm: 312100, frpTotal: 1910, frpTotalMW: 1910000, modisCount: 125300, viirsCount: 0, harmonizedCount: 125300, satelliteContinuity: 94.0, harmonizationIndex: 0.80, anomalyIndex: -0.05 },
  { year: 2004, burnedAreaM: 335.8, burnedAreaSqKm: 335800, frpTotal: 2040, frpTotalMW: 2040000, modisCount: 134900, viirsCount: 0, harmonizedCount: 134900, satelliteContinuity: 94.2, harmonizationIndex: 0.82, anomalyIndex: 0.23 },
  { year: 2005, burnedAreaM: 341.0, burnedAreaSqKm: 341000, frpTotal: 2110, frpTotalMW: 2110000, modisCount: 138000, viirsCount: 0, harmonizedCount: 138000, satelliteContinuity: 94.5, harmonizationIndex: 0.83, anomalyIndex: 0.29 },
  { year: 2006, burnedAreaM: 308.2, burnedAreaSqKm: 308200, frpTotal: 1880, frpTotalMW: 1880000, modisCount: 123400, viirsCount: 0, harmonizedCount: 123400, satelliteContinuity: 94.8, harmonizationIndex: 0.81, anomalyIndex: -0.09 },
  { year: 2007, burnedAreaM: 319.5, burnedAreaSqKm: 319500, frpTotal: 1955, frpTotalMW: 1955000, modisCount: 128500, viirsCount: 0, harmonizedCount: 128500, satelliteContinuity: 95.0, harmonizationIndex: 0.82, anomalyIndex: 0.02 },
  { year: 2008, burnedAreaM: 295.1, burnedAreaSqKm: 295100, frpTotal: 1780, frpTotalMW: 1780000, modisCount: 116200, viirsCount: 0, harmonizedCount: 116200, satelliteContinuity: 95.1, harmonizationIndex: 0.79, anomalyIndex: -0.27 },
  { year: 2009, burnedAreaM: 289.4, burnedAreaSqKm: 289400, frpTotal: 1740, frpTotalMW: 1740000, modisCount: 114000, viirsCount: 0, harmonizedCount: 114000, satelliteContinuity: 95.3, harmonizationIndex: 0.78, anomalyIndex: -0.32 },
  { year: 2010, burnedAreaM: 348.6, burnedAreaSqKm: 348600, frpTotal: 2205, frpTotalMW: 2205000, modisCount: 142100, viirsCount: 0, harmonizedCount: 142100, satelliteContinuity: 95.4, harmonizationIndex: 0.84, anomalyIndex: 0.41 },
  { year: 2011, burnedAreaM: 305.4, burnedAreaSqKm: 305400, frpTotal: 1835, frpTotalMW: 1835000, modisCount: 121000, viirsCount: 0, harmonizedCount: 121000, satelliteContinuity: 95.8, harmonizationIndex: 0.80, anomalyIndex: -0.11 },
  { year: 2012, burnedAreaM: 315.7, burnedAreaSqKm: 315700, frpTotal: 1912, frpTotalMW: 1912000, modisCount: 126400, viirsCount: 295000, harmonizedCount: 128100, satelliteContinuity: 97.2, harmonizationIndex: 0.86, anomalyIndex: -0.02 },
  { year: 2013, burnedAreaM: 291.2, burnedAreaSqKm: 291200, frpTotal: 1720, frpTotalMW: 1720000, modisCount: 114900, viirsCount: 270000, harmonizedCount: 116200, satelliteContinuity: 97.4, harmonizationIndex: 0.85, anomalyIndex: -0.29 },
  { year: 2014, burnedAreaM: 318.9, burnedAreaSqKm: 318900, frpTotal: 1930, frpTotalMW: 1930000, modisCount: 127800, viirsCount: 302000, harmonizedCount: 129200, satelliteContinuity: 97.6, harmonizationIndex: 0.87, anomalyIndex: 0.03 },
  { year: 2015, burnedAreaM: 352.4, burnedAreaSqKm: 352400, frpTotal: 2310, frpTotalMW: 2310000, modisCount: 145200, viirsCount: 356000, harmonizedCount: 147400, satelliteContinuity: 97.9, harmonizationIndex: 0.89, anomalyIndex: 0.48 },
  { year: 2016, burnedAreaM: 338.1, burnedAreaSqKm: 338100, frpTotal: 2190, frpTotalMW: 2190000, modisCount: 139100, viirsCount: 328000, harmonizedCount: 140800, satelliteContinuity: 98.1, harmonizationIndex: 0.88, anomalyIndex: 0.28 },
  { year: 2017, burnedAreaM: 322.0, burnedAreaSqKm: 322000, frpTotal: 2015, frpTotalMW: 2015000, modisCount: 129800, viirsCount: 312000, harmonizedCount: 131400, satelliteContinuity: 98.5, harmonizationIndex: 0.89, anomalyIndex: 0.08 },
  { year: 2018, burnedAreaM: 301.5, burnedAreaSqKm: 301500, frpTotal: 1820, frpTotalMW: 1820000, modisCount: 120100, viirsCount: 288000, harmonizedCount: 121500, satelliteContinuity: 98.7, harmonizationIndex: 0.88, anomalyIndex: -0.16 },
  { year: 2019, burnedAreaM: 368.4, burnedAreaSqKm: 368400, frpTotal: 2480, frpTotalMW: 2480000, modisCount: 153400, viirsCount: 410000, harmonizedCount: 157200, satelliteContinuity: 98.9, harmonizationIndex: 0.91, anomalyIndex: 0.69 },
  { year: 2020, burnedAreaM: 359.2, burnedAreaSqKm: 359200, frpTotal: 2410, frpTotalMW: 2410000, modisCount: 149800, viirsCount: 395000, harmonizedCount: 153100, satelliteContinuity: 99.1, harmonizationIndex: 0.92, anomalyIndex: 0.58 },
  { year: 2021, burnedAreaM: 310.8, burnedAreaSqKm: 310800, frpTotal: 1910, frpTotalMW: 1910000, modisCount: 125600, viirsCount: 310000, harmonizedCount: 127900, satelliteContinuity: 99.3, harmonizationIndex: 0.90, anomalyIndex: -0.04 },
  { year: 2022, burnedAreaM: 328.7, burnedAreaSqKm: 328700, frpTotal: 2095, frpTotalMW: 2095000, modisCount: 132400, viirsCount: 338000, harmonizedCount: 135200, satelliteContinuity: 99.5, harmonizationIndex: 0.93, anomalyIndex: 0.16 },
  { year: 2023, burnedAreaM: 382.1, burnedAreaSqKm: 382100, frpTotal: 2650, frpTotalMW: 2650000, modisCount: 161200, viirsCount: 462000, harmonizedCount: 167500, satelliteContinuity: 99.6, harmonizationIndex: 0.95, anomalyIndex: 0.88 },
  { year: 2024, burnedAreaM: 342.5, burnedAreaSqKm: 342500, frpTotal: 2280, frpTotalMW: 2280000, modisCount: 141000, viirsCount: 362000, harmonizedCount: 143800, satelliteContinuity: 99.7, harmonizationIndex: 0.94, anomalyIndex: 0.31 },
  { year: 2025, burnedAreaM: 331.0, burnedAreaSqKm: 331000, frpTotal: 2190, frpTotalMW: 2190000, modisCount: 136200, viirsCount: 345000, harmonizedCount: 138100, satelliteContinuity: 99.8, harmonizationIndex: 0.94, anomalyIndex: 0.18 },
  { year: 2026, burnedAreaM: 395.4, burnedAreaSqKm: 395400, frpTotal: 2820, frpTotalMW: 2820000, modisCount: 169800, viirsCount: 498000, harmonizedCount: 178400, satelliteContinuity: 99.9, harmonizationIndex: 0.97, anomalyIndex: 0.96 }
];

// Active global hotspots (simulated for the global projection, focused on major fire zones)
export const ACTIVE_FIRE_HOTSPOTS: FireHotspot[] = [
  // Amazon Region
  { id: 'am-1', lat: -6.5134, lng: -62.3452, intensity: 450, sensor: 'VIIRS', region: 'The Amazon', confidence: 92, landCover: 'Dense Forest' },
  { id: 'am-2', lat: -9.2451, lng: -58.4891, intensity: 120, sensor: 'MODIS', region: 'The Amazon', confidence: 81, landCover: 'Deforested / Pasture' },
  { id: 'am-3', lat: -11.8901, lng: -52.1234, intensity: 320, sensor: 'VIIRS', region: 'The Amazon', confidence: 89, landCover: 'Wooded Savanna' },
  { id: 'am-4', lat: -3.1567, lng: -60.0123, intensity: 75, sensor: 'MODIS', region: 'The Amazon', confidence: 74, landCover: 'Dense Forest' },
  
  // Central/Sub-Saharan Africa
  { id: 'af-1', lat: -7.8123, lng: 18.2345, intensity: 280, sensor: 'MODIS', region: 'Sub-Saharan Africa', confidence: 85, landCover: 'Dry Savanna' },
  { id: 'af-2', lat: -5.4567, lng: 22.9123, intensity: 620, sensor: 'VIIRS', region: 'Sub-Saharan Africa', confidence: 98, landCover: 'Woodland Grassland' },
  { id: 'af-3', lat: -9.6789, lng: 25.1234, intensity: 310, sensor: 'VIIRS', region: 'Sub-Saharan Africa', confidence: 91, landCover: 'Savanna / Agriculture' },
  { id: 'af-4', lat: 4.2345, lng: 11.5678, intensity: 140, sensor: 'MODIS', region: 'Sub-Saharan Africa', confidence: 78, landCover: 'Rainforest Fringe' },
  { id: 'af-5', lat: -12.3456, lng: 16.7890, intensity: 190, sensor: 'VIIRS', region: 'Sub-Saharan Africa', confidence: 87, landCover: 'Dry Savanna' },

  // Australia
  { id: 'au-1', lat: -18.4567, lng: 124.6789, intensity: 550, sensor: 'VIIRS', region: 'Northern Australia', confidence: 94, landCover: 'Spinifex Grassland' },
  { id: 'au-2', lat: -21.2345, lng: 133.4567, intensity: 210, sensor: 'MODIS', region: 'Northern Australia', confidence: 83, landCover: 'Arid Shrubland' },
  { id: 'au-3', lat: -14.1234, lng: 131.8901, intensity: 890, sensor: 'VIIRS', region: 'Northern Australia', confidence: 99, landCover: 'Eucalyptus Savanna' },
  { id: 'au-4', lat: -33.9876, lng: 150.3456, intensity: 110, sensor: 'MODIS', region: 'Southeast Australia', confidence: 76, landCover: 'Temperate Sclerophyll' },

  // North America
  { id: 'na-1', lat: 53.4567, lng: -115.8901, intensity: 1450, sensor: 'VIIRS', region: 'Western Canada', confidence: 100, landCover: 'Boreal Conifer Forest' },
  { id: 'na-2', lat: 55.1234, lng: -121.2345, intensity: 820, sensor: 'MODIS', region: 'Western Canada', confidence: 92, landCover: 'Boreal Conifer Forest' },
  { id: 'na-3', lat: 40.2345, lng: -121.6789, intensity: 980, sensor: 'VIIRS', region: 'California/Pacific Northwest', confidence: 96, landCover: 'Montane Pine Forest' },
  { id: 'na-4', lat: 38.5678, lng: -119.8901, intensity: 310, sensor: 'MODIS', region: 'California/Pacific Northwest', confidence: 84, landCover: 'Chaparral Shrubland' },

  // Southeast Asia / Boreal Siberia
  { id: 'as-1', lat: 62.1234, lng: 129.5678, intensity: 750, sensor: 'VIIRS', region: 'Siberia', confidence: 95, landCover: 'Taiga Larch Forest' },
  { id: 'as-2', lat: 59.4567, lng: 112.3456, intensity: 380, sensor: 'MODIS', region: 'Siberia', confidence: 89, landCover: 'Taiga Larch Forest' },
  { id: 'as-3', lat: -1.8901, lng: 113.9123, intensity: 1150, sensor: 'VIIRS', region: 'Indonesia / Kalimantan', confidence: 97, landCover: 'Peatland Swamp Forest' },
  { id: 'as-4', lat: -3.2345, lng: 104.5678, intensity: 670, sensor: 'MODIS', region: 'Indonesia / Sumatra', confidence: 90, landCover: 'Peatland Swamp Forest' }
];

// Diurnal fire cycle analysis
// Demonstrates MODIS and VIIRS passes and why we need a harmonized estimation curve.
export const DIURNAL_PROFILE: DiurnalPoint[] = [
  { hour: 0, modisTerra: 12, modisAqua: 8, viirsSnpp: 10, harmonized: 11 },
  { hour: 2, modisTerra: 8, modisAqua: 6, viirsSnpp: 7, harmonized: 8 },
  { hour: 4, modisTerra: 5, modisAqua: 4, viirsSnpp: 4, harmonized: 5 },
  { hour: 6, modisTerra: 7, modisAqua: 5, viirsSnpp: 6, harmonized: 7 },
  { hour: 8, modisTerra: 18, modisAqua: 10, viirsSnpp: 14, harmonized: 16 },
  { hour: 10, modisTerra: 82, modisAqua: 22, viirsSnpp: 45, harmonized: 70 }, // MODIS Terra Day Pass ~10:30 AM
  { hour: 12, modisTerra: 95, modisAqua: 65, viirsSnpp: 120, harmonized: 145 }, // VIIRS NOAA-20 ~12:40 PM
  { hour: 14, modisTerra: 60, modisAqua: 185, viirsSnpp: 210, harmonized: 260 }, // MODIS Aqua (~1:30 PM) & VIIRS SNPP (~1:30 PM) peak
  { hour: 16, modisTerra: 35, modisAqua: 110, viirsSnpp: 140, harmonized: 175 },
  { hour: 18, modisTerra: 22, modisAqua: 55, viirsSnpp: 72, harmonized: 84 },
  { hour: 20, modisTerra: 15, modisAqua: 28, viirsSnpp: 36, harmonized: 42 },
  { hour: 22, modisTerra: 14, modisAqua: 14, viirsSnpp: 18, harmonized: 21 }
];

// Land Cover correlation
export const LAND_COVER_CORRELATION: LandCoverCorrelation[] = [
  { class: 'Tropical Forest', modisPercentage: 35, viirsPercentage: 42, harmonizedPercentage: 39, fusedFRP: 1240 },
  { class: 'Savanna / Grassland', modisPercentage: 42, viirsPercentage: 30, harmonizedPercentage: 35, fusedFRP: 850 },
  { class: 'Boreal Taiga', modisPercentage: 11, viirsPercentage: 15, harmonizedPercentage: 13, fusedFRP: 1620 },
  { class: 'Peatland Swamp', modisPercentage: 6, viirsPercentage: 8, harmonizedPercentage: 8, fusedFRP: 940 },
  { class: 'Shrubland / Scrub', modisPercentage: 4, viirsPercentage: 3, harmonizedPercentage: 3, fusedFRP: 310 },
  { class: 'Agricultural Residues', modisPercentage: 2, viirsPercentage: 2, harmonizedPercentage: 2, fusedFRP: 120 }
];

// Generate comprehensive Monthly Heatmap (Year 2000 - 2026, 12 months each)
// This populates our 27x12 Burning Activity Grid
export const generateHeatmapData = (): MonthlyHeatmapCell[] => {
  const data: MonthlyHeatmapCell[] = [];
  
  for (let year = 2000; year <= 2026; year++) {
    // Determine baseline multipliers for this year
    let yearMultiplier = 1.0;
    let comments = "";
    
    if (year === 2005) { yearMultiplier = 1.35; comments = "Amazon Basin Severe Drought"; }
    else if (year === 2010) { yearMultiplier = 1.45; comments = "Extreme Global El Niño Dryness"; }
    else if (year === 2015) { yearMultiplier = 1.52; comments = "Super El Niño dry cycle; extensive peat burning in Indonesia"; }
    else if (year === 2016) { yearMultiplier = 1.30; comments = "Post El Niño delayed fire surge"; }
    else if (year === 2019) { yearMultiplier = 1.68; comments = "Amazon burning outcry & Pantanal catastrophic fires"; }
    else if (year === 2020) { yearMultiplier = 1.55; comments = "Pantanal extreme dry season and Western US records"; }
    else if (year === 2023) { yearMultiplier = 1.76; comments = "Record Canadian wildfires (15M+ hectares) & Amazon extreme drought"; }
    else if (year === 2026) { yearMultiplier = 1.95; comments = "Synthesized peak global anomaly: Amazon dry-corridor convergence"; }
    else if (year === 2008 || year === 2009 || year === 2013) { yearMultiplier = 0.72; comments = "La Niña wet phase; suppressed global fire activity"; }
    else { yearMultiplier = 0.9 + (year % 5) * 0.08; } // Natural slight oscillations

    for (let month = 0; month < 12; month++) {
      // Seasonal curve: fires typically peak in late summer (Aug - Oct) globally and African savannas (June - August)
      // Represent this with a nice bimodal or strong peak curve
      let monthFactor = 0.15;
      
      if (month === 6) monthFactor = 0.48;      // July
      else if (month === 7) monthFactor = 0.85; // Aug
      else if (month === 8) monthFactor = 1.0;  // Sept
      else if (month === 9) monthFactor = 0.78; // Oct
      else if (month === 10) monthFactor = 0.38;// Nov
      else if (month === 5) monthFactor = 0.32; // June
      else if (month === 0 || month === 1) monthFactor = 0.22; // Jan/Feb (African dry season peak)
      else monthFactor = 0.12;                  // Rest of year is low

      let randomJitter = (Math.sin(year * 3 + month * 5) * 0.05);
      let calculatedValue = Math.min(1.0, Math.max(0.04, monthFactor * yearMultiplier + randomJitter));

      data.push({
        year,
        month,
        value: Number(calculatedValue.toFixed(3)),
        notes: month === 8 && comments ? comments : undefined
      });
    }
  }
  
  return data;
};

export const MONTHLY_HEATMAP_SERIES: MonthlyHeatmapCell[] = generateHeatmapData();

// Regional dataset: The Amazon, Boreal Taiga (Siberia), Northern Australia, Indonesian Peatlands
export const REGIONAL_SITES: RegionalData[] = [
  {
    id: "amazon",
    name: "The Amazon Basin",
    center: { lat: -6.5, lng: -60.0 },
    bounds: [[-15, -75], [2, -48]],
    description: "Highly sensitive tropical rainforest ecosystem. The discrepancy between MODIS and VIIRS is critical here due to dense canopy cover hiding small low-temperature fires and heavy smoke plume occlusion.",
    modisRawAnnual: [
      { year: 2012, val: 28500 }, { year: 2013, val: 24200 }, { year: 2014, val: 30100 },
      { year: 2015, val: 41200 }, { year: 2016, val: 39500 }, { year: 2017, val: 32400 },
      { year: 2018, val: 25100 }, { year: 2019, val: 48900 }, { year: 2020, val: 44200 },
      { year: 2021, val: 29800 }, { year: 2022, val: 35400 }, { year: 2023, val: 56200 },
      { year: 2024, val: 42100 }, { year: 2025, val: 38700 }, { year: 2026, val: 61800 }
    ],
    viirsRawAnnual: [
      { year: 2012, val: 82000 }, { year: 2013, val: 71000 }, { year: 2014, val: 89000 },
      { year: 2015, val: 122000 }, { year: 2016, val: 119000 }, { year: 2017, val: 99000 },
      { year: 2018, val: 79000 }, { year: 2019, val: 148000 }, { year: 2020, val: 135000 },
      { year: 2021, val: 92000 }, { year: 2022, val: 108000 }, { year: 2023, val: 172000 },
      { year: 2024, val: 129000 }, { year: 2025, val: 121000 }, { year: 2026, val: 189000 }
    ],
    harmonizedAnnual: [
      { year: 2012, val: 31200 }, { year: 2013, val: 26800 }, { year: 2014, val: 32900 },
      { year: 2015, val: 45600 }, { year: 2016, val: 43200 }, { year: 2017, val: 35800 },
      { year: 2018, val: 27900 }, { year: 2019, val: 54100 }, { year: 2020, val: 49400 },
      { year: 2021, val: 32900 }, { year: 2022, val: 39100 }, { year: 2023, val: 61900 },
      { year: 2024, val: 46800 }, { year: 2025, val: 43100 }, { year: 2026, val: 68400 }
    ]
  },
  {
    id: "boreal",
    name: "Siberian Taiga",
    center: { lat: 62.0, lng: 115.0 },
    bounds: [[50, 80], [70, 150]],
    description: "Cold boreal forest containing deep peat ground cover. Fires are often massive, lightning-induced, and release immense carbon reserves. High-latitude pass frequency of polar orbiting satellites provides superior daily coverage here.",
    modisRawAnnual: [
      { year: 2012, val: 15400 }, { year: 2013, val: 11200 }, { year: 2014, val: 13900 },
      { year: 2015, val: 16800 }, { year: 2016, val: 18900 }, { year: 2017, val: 14200 },
      { year: 2018, val: 16100 }, { year: 2019, val: 26400 }, { year: 2020, val: 31200 },
      { year: 2021, val: 35800 }, { year: 2022, val: 21200 }, { year: 2023, val: 23400 },
      { year: 2024, val: 20100 }, { year: 2025, val: 22400 }, { year: 2026, val: 32900 }
    ],
    viirsRawAnnual: [
      { year: 2012, val: 39000 }, { year: 2013, val: 29000 }, { year: 2014, val: 35000 },
      { year: 2015, val: 42000 }, { year: 2016, val: 48000 }, { year: 2017, val: 36000 },
      { year: 2018, val: 41000 }, { year: 2019, val: 68000 }, { year: 2020, val: 81000 },
      { year: 2021, val: 93000 }, { year: 2022, val: 55000 }, { year: 2023, val: 61000 },
      { year: 2024, val: 52000 }, { year: 2025, val: 58000 }, { year: 2026, val: 86000 }
    ],
    harmonizedAnnual: [
      { year: 2012, val: 16900 }, { year: 2013, val: 12400 }, { year: 2014, val: 15100 },
      { year: 2015, val: 18300 }, { year: 2016, val: 20400 }, { year: 2017, val: 15600 },
      { year: 2018, val: 17600 }, { year: 2019, val: 28800 }, { year: 2020, val: 33900 },
      { year: 2021, val: 38900 }, { year: 2022, val: 23100 }, { year: 2023, val: 25500 },
      { year: 2024, val: 21900 }, { year: 2025, val: 24300 }, { year: 2026, val: 35800 }
    ]
  },
  {
    id: "australia",
    name: "Northern Australia Savannas",
    center: { lat: -16.0, lng: 130.0 },
    bounds: [[-26, 115], [-10, 145]],
    description: "Highly frequent, low-intensity grass savanna fires. This region represents the largest global contributor of seasonal active fire counts, peaking regularly between June and November.",
    modisRawAnnual: [
      { year: 2012, val: 34100 }, { year: 2013, val: 32900 }, { year: 2014, val: 35800 },
      { year: 2015, val: 31200 }, { year: 2016, val: 33200 }, { year: 2017, val: 36400 },
      { year: 2018, val: 29800 }, { year: 2019, val: 39500 }, { year: 2020, val: 34500 },
      { year: 2021, val: 30100 }, { year: 2022, val: 32400 }, { year: 2023, val: 38100 },
      { year: 2024, val: 33500 }, { year: 2025, val: 32100 }, { year: 2026, val: 41200 }
    ],
    viirsRawAnnual: [
      { year: 2012, val: 104000 }, { year: 2013, val: 99000 }, { year: 2014, val: 109000 },
      { year: 2015, val: 94000 }, { year: 2016, val: 101000 }, { year: 2017, val: 111000 },
      { year: 2018, val: 91000 }, { year: 2019, val: 122000 }, { year: 2020, val: 106000 },
      { year: 2021, val: 92000 }, { year: 2022, val: 99000 }, { year: 2023, val: 116000 },
      { year: 2024, val: 102000 }, { year: 2025, val: 98000 }, { year: 2026, val: 126000 }
    ],
    harmonizedAnnual: [
      { year: 2012, val: 36200 }, { year: 2013, val: 34900 }, { year: 2014, val: 37900 },
      { year: 2015, val: 33100 }, { year: 2016, val: 35200 }, { year: 2017, val: 38600 },
      { year: 2018, val: 31600 }, { year: 2019, val: 41900 }, { year: 2020, val: 36600 },
      { year: 2021, val: 31900 }, { year: 2022, val: 34400 }, { year: 2023, val: 40400 },
      { year: 2024, val: 35500 }, { year: 2025, val: 34100 }, { year: 2026, val: 43800 }
    ]
  },
  {
    id: "sundarbans",
    name: "Sundarbans Delta Margins",
    center: { lat: 21.9, lng: 89.1 },
    bounds: [[21.2, 88.0], [22.6, 90.5]],
    description: "The largest mangrove forest delta globally. Fire activity is primarily linked to agricultural residue clearing along forest boundaries and aquaculture conversions. High moisture buffers fires but increases sub-canopy smoldering visibility issues for sensors.",
    modisRawAnnual: [
      { year: 2012, val: 2400 }, { year: 2013, val: 1900 }, { year: 2014, val: 2100 },
      { year: 2015, val: 3200 }, { year: 2016, val: 2800 }, { year: 2017, val: 2300 },
      { year: 2018, val: 1800 }, { year: 2019, val: 3800 }, { year: 2020, val: 3400 },
      { year: 2021, val: 2200 }, { year: 2022, val: 2500 }, { year: 2023, val: 4100 },
      { year: 2024, val: 3100 }, { year: 2025, val: 2900 }, { year: 2026, val: 4500 }
    ],
    viirsRawAnnual: [
      { year: 2012, val: 9200 }, { year: 2013, val: 8100 }, { year: 2014, val: 8900 },
      { year: 2015, val: 12200 }, { year: 2016, val: 11400 }, { year: 2017, val: 9500 },
      { year: 2018, val: 7800 }, { year: 2019, val: 14900 }, { year: 2020, val: 13200 },
      { year: 2021, val: 8900 }, { year: 2022, val: 10100 }, { year: 2023, val: 16800 },
      { year: 2024, val: 12200 }, { year: 2025, val: 11500 }, { year: 2026, val: 18100 }
    ],
    harmonizedAnnual: [
      { year: 2012, val: 2900 }, { year: 2013, val: 2400 }, { year: 2014, val: 2600 },
      { year: 2015, val: 3900 }, { year: 2016, val: 3400 }, { year: 2017, val: 2900 },
      { year: 2018, val: 2200 }, { year: 2019, val: 4600 }, { year: 2020, val: 4100 },
      { year: 2021, val: 2700 }, { year: 2022, val: 3100 }, { year: 2023, val: 5100 },
      { year: 2024, val: 3800 }, { year: 2025, val: 3500 }, { year: 2026, val: 5500 }
    ]
  },
  {
    id: "volcanic",
    name: "Pacific Rim Active Volcanic Zones",
    center: { lat: 19.4, lng: -155.2 },
    bounds: [[18.5, -156.5], [20.5, -154.0]],
    description: "Highly intense, localized molten magma and active thermal vents. Raw counts show huge discrepancies because volcanic lava completely saturates coarser MODIS pixels while VIIRS sub-pixel algorithms correctly separate geothermal events from surrounding vegetated fires.",
    modisRawAnnual: [
      { year: 2012, val: 450 }, { year: 2013, val: 380 }, { year: 2014, val: 520 },
      { year: 2015, val: 680 }, { year: 2016, val: 710 }, { year: 2017, val: 590 },
      { year: 2018, val: 1250 }, { year: 2019, val: 820 }, { year: 2020, val: 950 },
      { year: 2021, val: 1100 }, { year: 2022, val: 1450 }, { year: 2023, val: 1820 },
      { year: 2024, val: 1350 }, { year: 2025, val: 1220 }, { year: 2026, val: 2100 }
    ],
    viirsRawAnnual: [
      { year: 2012, val: 1800 }, { year: 2013, val: 1450 }, { year: 2014, val: 2100 },
      { year: 2015, val: 2800 }, { year: 2016, val: 2900 }, { year: 2017, val: 2400 },
      { year: 2018, val: 5400 }, { year: 2019, val: 3400 }, { year: 2020, val: 3850 },
      { year: 2021, val: 4500 }, { year: 2022, val: 5900 }, { year: 2023, val: 7200 },
      { year: 2024, val: 5500 }, { year: 2025, val: 4900 }, { year: 2026, val: 8400 }
    ],
    harmonizedAnnual: [
      { year: 2012, val: 510 }, { year: 2013, val: 430 }, { year: 2014, val: 590 },
      { year: 2015, val: 770 }, { year: 2016, val: 800 }, { year: 2017, val: 670 },
      { year: 2018, val: 1420 }, { year: 2019, val: 930 }, { year: 2020, val: 1080 },
      { year: 2021, val: 1250 }, { year: 2022, val: 1650 }, { year: 2023, val: 2070 },
      { year: 2024, val: 1530 }, { year: 2025, val: 1380 }, { year: 2026, val: 2380 }
    ]
  }
];

export interface DailyBurnPoint {
  date: string;
  dayOfYear: number;
  value: number; // 0.0 to 1.0 (intensity index)
  hotspotsCount: number;
  frp: number; // MW
  status: 'Normal' | 'Moderate' | 'High' | 'Extreme Anomaly';
  zScore: number;
}

// Generate exactly 365 daily data points for any selected year
export const generateDailyBurnData = (year: number): DailyBurnPoint[] => {
  const data: DailyBurnPoint[] = [];
  const baseMultiplier = year === 2026 ? 1.6 : year === 2023 ? 1.4 : year === 2019 ? 1.3 : year === 2008 ? 0.7 : 1.0;

  // Let's loop through 365 days
  const startDate = new Date(year, 0, 1);
  for (let day = 0; day < 365; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + day);

    const month = currentDate.getMonth();
    
    // Seasonal factor: fires peak late summer (Aug-Oct)
    let seasonalFactor = 0.05;
    if (month === 6) seasonalFactor = 0.35;      // July
    else if (month === 7) seasonalFactor = 0.75; // August
    else if (month === 8) seasonalFactor = 0.90; // September
    else if (month === 9) seasonalFactor = 0.55; // October
    else if (month === 0 || month === 1) seasonalFactor = 0.15; // Jan/Feb (African cycle)

    // Add some random noise and cyclic day variation
    const noise = Math.sin(day * 0.15) * 0.08 + Math.cos(day * 0.05) * 0.04;
    let finalValue = Math.min(1.0, Math.max(0.01, (seasonalFactor * baseMultiplier) + noise));

    // Inject 3 major random Extreme Anomalies (Z-Score spikes) in peak months
    let isExtremeSpike = false;
    if (month === 8 && (day === 245 || day === 260 || day === 268) && baseMultiplier > 1.2) {
      finalValue = Math.min(1.0, finalValue * 1.8);
      isExtremeSpike = true;
    }

    const hotspots = Math.round(finalValue * 850 + (isExtremeSpike ? 600 : 0));
    const frpVal = Math.round(finalValue * 12500 + (isExtremeSpike ? 15000 : 0));
    const zScore = Number(((finalValue - 0.25) / 0.15).toFixed(2));

    let status: 'Normal' | 'Moderate' | 'High' | 'Extreme Anomaly' = 'Normal';
    if (finalValue > 0.75 || isExtremeSpike) status = 'Extreme Anomaly';
    else if (finalValue > 0.5) status = 'High';
    else if (finalValue > 0.25) status = 'Moderate';

    // Format YYYY-MM-DD
    const dateStr = currentDate.toISOString().split('T')[0];

    data.push({
      date: dateStr,
      dayOfYear: day + 1,
      value: Number(finalValue.toFixed(3)),
      hotspotsCount: hotspots,
      frp: frpVal,
      status,
      zScore
    });
  }

  return data;
};

// Mock H3 hexagon indices covering active Amazon and global fire/volcanic sites
export const MOCK_H3_FIRE_DATA = [
  // Amazon Basin hex clusters
  { h3Index: "84a0c87ffffffff", burnIndex: 0.94 },
  { h3Index: "84a0c81ffffffff", burnIndex: 0.81 },
  { h3Index: "84a0c9bffffffff", burnIndex: 0.72 },
  { h3Index: "84a0d25ffffffff", burnIndex: 0.58 },
  { h3Index: "84a0d27ffffffff", burnIndex: 0.44 },
  { h3Index: "84a0c11ffffffff", burnIndex: 0.32 },
  { h3Index: "84a0c13ffffffff", burnIndex: 0.15 },
  // Central Africa savanna hexes
  { h3Index: "855ab397fffffff", burnIndex: 0.88 },
  { h3Index: "855ab313fffffff", burnIndex: 0.75 },
  { h3Index: "855ab3dbfffffff", burnIndex: 0.62 },
  { h3Index: "855ab2b3fffffff", burnIndex: 0.48 },
  // Northern Australia grass savannas
  { h3Index: "8579a397fffffff", burnIndex: 0.91 },
  { h3Index: "8579a313fffffff", burnIndex: 0.84 },
  { h3Index: "8579a3dbfffffff", burnIndex: 0.55 },
  // Siberia Boreal Taiga forest
  { h3Index: "85110397fffffff", burnIndex: 0.79 },
  { h3Index: "85110313fffffff", burnIndex: 0.65 },
  // Pacific Volcanic hot spot (Hawaii Kilauea area)
  { h3Index: "8504af63fffffff", burnIndex: 0.99 },
  { h3Index: "8504af6bfffffff", burnIndex: 0.89 }
];

