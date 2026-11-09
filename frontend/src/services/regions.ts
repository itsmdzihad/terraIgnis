import { apiGet } from './api';
import type { H3RegionSummary } from '../types/region';

export interface RegionQuery {
  start_date?: string;
  end_date?: string;
}

export function getRegionSummary(
  h3Cell: string,
  paramsOrSignal?: RegionQuery | AbortSignal,
  maybeSignal?: AbortSignal,
): Promise<H3RegionSummary> {
  const isSignal = paramsOrSignal instanceof AbortSignal;
  const params = isSignal ? undefined : paramsOrSignal;
  const signal = isSignal ? paramsOrSignal : maybeSignal;

  const query = new URLSearchParams();
  if (params?.start_date) query.set('start_date', params.start_date);
  if (params?.end_date) query.set('end_date', params.end_date);

  return apiGet<H3RegionSummary>(
    `/api/regions/${encodeURIComponent(h3Cell)}`,
    query.size ? query : undefined,
    signal,
  );
}

