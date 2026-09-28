import { apiGet } from './api';
import type { H3RegionSummary } from '../types/region';

export function getRegionSummary(h3Cell: string, signal?: AbortSignal): Promise<H3RegionSummary> {
  return apiGet<H3RegionSummary>(`/api/regions/${encodeURIComponent(h3Cell)}`, undefined, signal);
}
