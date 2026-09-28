import { useCallback, useEffect, useState } from 'react';
import { getCalendar } from '../services/calendar';
import type { CalendarQuery, CalendarResponse } from '../types/calendar';

export function useCalendar(params: CalendarQuery) {
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);
  const serializedParams = JSON.stringify(params);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    getCalendar(params, controller.signal)
      .then((response) => setData(response))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Unable to retrieve daily fire activity.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [serializedParams, requestKey]);

  const refetch = useCallback(() => setRequestKey((key) => key + 1), []);
  return { data, loading, error, refetch };
}
