import { apiGet } from './api';
import type { FiresQuery, FiresResponse } from '../types/fire';

export function getFires(filters: FiresQuery = {}, signal?: AbortSignal): Promise<FiresResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return apiGet<FiresResponse>('/api/fires', query, signal);
}
