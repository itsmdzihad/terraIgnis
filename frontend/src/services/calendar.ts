import { apiGet } from './api';
import type { CalendarQuery, CalendarResponse } from '../types/calendar';

export function getCalendar(params: CalendarQuery = {}, signal?: AbortSignal): Promise<CalendarResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return apiGet<CalendarResponse>('/api/calendar', query, signal);
}
