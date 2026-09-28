export type CalendarAnomalyLevel = 'extreme_low' | 'low' | 'normal' | 'high' | 'extreme_high';

export interface CalendarDay {
  date: string;
  fire_count: number;
  mean_burn_index: number | null;
  max_burn_index: number | null;
  anomaly_count: number;
}

export interface CalendarFilters {
  date: string | null;
  start_date: string | null;
  end_date: string | null;
  anomaly_level: CalendarAnomalyLevel | null;
  limit: number;
  offset: number;
}

export interface CalendarResponse {
  data: CalendarDay[];
  count: number;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  filters: CalendarFilters;
}

export interface CalendarQuery {
  date?: string;
  start_date?: string;
  end_date?: string;
  anomaly_level?: CalendarAnomalyLevel;
  limit?: number;
  offset?: number;
}
