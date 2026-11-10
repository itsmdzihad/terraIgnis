import { useEffect, useState } from 'react';
import { countryName, loadCountryBoundaries, type CountryFeature } from '../services/countries';

export function useCountries() {
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadCountryBoundaries()
      .then((collection) => {
        if (active) setCountries(collection.features.filter((feature) => countryName(feature)).sort((a, b) => countryName(a).localeCompare(countryName(b))));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Country list is unavailable.');
      });
    return () => { active = false; };
  }, []);

  return { countries, error };
}
