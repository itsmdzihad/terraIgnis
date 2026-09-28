import { useCallback, useEffect, useState } from 'react';
import { getAnomalyOutliers } from '../services/anomalies';
import type { AnomalyQuery, AnomalyRecord } from '../types/anomaly';

type AnomalyReportQuery = Omit<AnomalyQuery, 'limit' | 'offset'>;

export function useAnomalies(params: AnomalyReportQuery) {
  const [data, setData] = useState<AnomalyRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);
  const serializedParams = JSON.stringify(params);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    getAnomalyOutliers(params, controller.signal)
      .then((records) => setData(records))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Unable to retrieve anomaly observations.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [serializedParams, requestKey]);

  const refetch = useCallback(() => setRequestKey((key) => key + 1), []);
  return { data, loading, error, refetch };
}
