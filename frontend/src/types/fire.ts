export type FireSensor = 'MODIS' | 'VIIRS' | 'BOTH';

export interface FireRecord {
  h3_cell: string;
  acq_date: string;
  burn_index: number;
  anomaly_level: 'extreme_low' | 'low' | 'normal' | 'high' | 'extreme_high' | 'unavailable' | null;
  robust_z_score: number | null;
  anomaly_percentile: number | null;
  baseline_method: string | null;
  daily_median: number | null;
  daily_mad: number | null;
  sensor_presence: 'MODIS' | 'VIIRS' | 'MODIS+VIIRS';
  sensor_count: number;
  total_fire_count: number;
  modis_fire_count: number;
  viirs_fire_count: number;
  day_fire_count: number;
  night_fire_count: number;
  total_frp: number | null;
  modis_frp_sum: number | null;
  viirs_frp_sum: number | null;
  modis_frp_mean: number | null;
  viirs_frp_mean: number | null;
  modis_brightness_mean: number | null;
  viirs_brightness_mean: number | null;
  modis_brightness_longwave_mean: number | null;
  viirs_brightness_longwave_mean: number | null;
  modis_confidence_mean: number | null;
  viirs_low_confidence_count: number;
  viirs_nominal_confidence_count: number;
  viirs_high_confidence_count: number;
  harmonized_fire_activity: number | null;
  harmonized_frp_index: number | null;
}

export interface FireFilters {
  date: string | null;
  start_date: string | null;
  end_date: string | null;
  h3_cell: string | null;
  min_burn_index: number | null;
  max_burn_index: number | null;
  sensor: FireSensor | null;
  limit: number;
  offset: number;
}

export interface FiresResponse {
  data: FireRecord[];
  count: number;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  filters: FireFilters;
}

export interface FiresQuery {
  date?: string;
  start_date?: string;
  end_date?: string;
  h3_cell?: string;
  min_burn_index?: number;
  max_burn_index?: number;
  sensor?: FireSensor;
  limit?: number;
  offset?: number;
}
