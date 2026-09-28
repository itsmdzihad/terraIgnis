import { useCallback, useEffect, useState } from 'react';
import { getFires } from '../services/fires';
import type { FiresQuery, FiresResponse } from '../types/fire';

export function useFires(filters: FiresQuery) {
  const [data, setData] = useState<FiresResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);
  const serializedFilters = JSON.stringify(filters);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    getFires(filters, controller.signal)
      .then((response) => setData(response))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Unable to retrieve fire observations.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [serializedFilters, requestKey]);

  const refetch = useCallback(() => setRequestKey((key) => key + 1), []);
  return { data, loading, error, refetch };
}
