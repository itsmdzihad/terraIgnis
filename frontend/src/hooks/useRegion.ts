import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../services/api';
import { getRegionSummary } from '../services/regions';
import type { H3RegionSummary } from '../types/region';

export function useRegion(h3Cell: string | null) {
  const [data, setData] = useState<H3RegionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    if (!h3Cell) {
      setData(null);
      setLoading(false);
      setError(null);
      setNotFound(false);
      return;
    }

    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setError(null);
    setNotFound(false);

    getRegionSummary(h3Cell, controller.signal)
      .then(setData)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setNotFound(reason instanceof ApiError && reason.status === 404);
        setError(reason instanceof Error ? reason.message : 'Unable to retrieve cell analysis.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [h3Cell, requestKey]);

  const refetch = useCallback(() => setRequestKey((key) => key + 1), []);
  return { data, loading, error, notFound, refetch };
}
