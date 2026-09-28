export interface CoverageStatistics {
  total_raw_observations: number;
  total_h3_cell_dates: number;
  unique_h3_cells: number;
  observed_dates: number;
  start_date: string | null;
  end_date: string | null;
  h3_resolution: number | null;
}

export interface SensorStatistics {
  modis_observations: number;
  viirs_observations: number;
  modis_only_cell_dates: number;
  viirs_only_cell_dates: number;
  both_sensor_cell_dates: number;
}

export interface BurnIndexStatistics {
  minimum: number | null;
  maximum: number | null;
  mean: number | null;
  median: number | null;
  p95: number | null;
}

export interface AnomalyStatistics {
  normal: number;
  low: number;
  high: number;
  extreme_low: number;
  extreme_high: number;
  total_anomalous: number;
}

export interface StatsResponse {
  coverage: CoverageStatistics;
  sensors: SensorStatistics;
  burn_index: BurnIndexStatistics;
  anomalies: AnomalyStatistics;
}
