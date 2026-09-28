export interface H3RegionSummary {
  h3_cell: string;
  observed_cell_dates: number;
  first_observed_date: string;
  last_observed_date: string;
  total_fire_detections: number;
  mean_burn_index: number | null;
  max_burn_index: number | null;
  min_burn_index: number | null;
  anomaly_count: number;
  extreme_anomaly_count: number;
  modis_fire_detections: number;
  viirs_fire_detections: number;
}
