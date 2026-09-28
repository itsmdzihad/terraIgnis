export type AnomalyLevel = 'extreme_low' | 'low' | 'normal' | 'high' | 'extreme_high';

export interface AnomalyRecord {
  h3_cell: string;
  acq_date: string;
  burn_index: number;
  daily_median: number | null;
  daily_mad: number | null;
  daily_mean: number | null;
  daily_std: number | null;
  robust_z_score: number | null;
  anomaly_percentile: number | null;
  anomaly_level: AnomalyLevel;
}

export interface AnomalyFilters {
  date: string | null;
  start_date: string | null;
  end_date: string | null;
  anomaly_level: AnomalyLevel | null;
  h3_cell: string | null;
  min_robust_z: number | null;
  max_robust_z: number | null;
  min_burn_index: number | null;
  max_burn_index: number | null;
  limit: number;
  offset: number;
}

export interface AnomaliesResponse {
  data: AnomalyRecord[];
  count: number;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  filters: AnomalyFilters;
}

export interface AnomalyQuery {
  date?: string;
  start_date?: string;
  end_date?: string;
  anomaly_level?: AnomalyLevel;
  h3_cell?: string;
  min_robust_z?: number;
  max_robust_z?: number;
  min_burn_index?: number;
  max_burn_index?: number;
  limit?: number;
  offset?: number;
}
