import { useCallback, useEffect, useState } from 'react';
import { getFires } from '../services/fires';
import { cellIsInCountry, findCountry, loadCountryBoundaries } from '../services/countries';
import type { FireRecord, FiresQuery } from '../types/fire';

const PAGE_SIZE = 5000;

export function useCountryFires(filters: FiresQuery, selectedCountry: string | null) {
  const [records, setRecords] = useState<FireRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);
  const serializedFilters = JSON.stringify(filters);

  useEffect(() => {
    if (!selectedCountry) {
      setRecords([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const activeCountry = selectedCountry;
    const queryFilters = JSON.parse(serializedFilters) as FiresQuery;
    setRecords([]);
    setLoading(true);
    setError(null);

    void Promise.all([loadCountryBoundaries(), getFires({ ...queryFilters, limit: PAGE_SIZE, offset: 0 }, controller.signal)])
      .then(async ([collection, firstPage]) => {
        const country = findCountry(collection.features, activeCountry);
        if (!country) throw new Error(`Boundary data for ${activeCountry} is unavailable.`);
        const allRecords = [...firstPage.data];
        for (let offset = firstPage.data.length; offset < firstPage.total; offset += PAGE_SIZE) {
          if (controller.signal.aborted) return;
          const page = await getFires({ ...queryFilters, limit: PAGE_SIZE, offset }, controller.signal);
          allRecords.push(...page.data);
        }
        if (controller.signal.aborted) return;
        setRecords(allRecords.filter((record) => cellIsInCountry(record.h3_cell, country)));
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Unable to load country fire observations.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [serializedFilters, selectedCountry, requestKey]);

  const refetch = useCallback(() => setRequestKey((key) => key + 1), []);
  return { records, loading, error, refetch };
}
