import { useCallback, useEffect, useState } from 'react';
import { getCellAnomalyHistory } from '../services/anomalies';
import type { AnomaliesResponse } from '../types/anomaly';

export function useCellAnomalyHistory(h3Cell: string | null) {
  const [data, setData] = useState<AnomaliesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    if (!h3Cell) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setError(null);

    getCellAnomalyHistory(h3Cell, controller.signal)
      .then(setData)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Unable to retrieve anomaly history.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [h3Cell, requestKey]);

  const refetch = useCallback(() => setRequestKey((key) => key + 1), []);
  return { data, loading, error, refetch };
}
