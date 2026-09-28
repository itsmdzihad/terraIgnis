import { apiGet } from './api';
import type { StatsResponse } from '../types/stats';

export function getStats(signal?: AbortSignal): Promise<StatsResponse> {
  return apiGet<StatsResponse>('/api/stats', undefined, signal);
}
