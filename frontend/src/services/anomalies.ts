import { apiGet } from './api';
import type { AnomaliesResponse, AnomalyLevel, AnomalyQuery, AnomalyRecord } from '../types/anomaly';

const MAX_PAGE_SIZE = 5000;
const OUTLIER_LEVELS: AnomalyLevel[] = ['low', 'high', 'extreme_low', 'extreme_high'];

export function getAnomalies(params: AnomalyQuery = {}, signal?: AbortSignal): Promise<AnomaliesResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return apiGet<AnomaliesResponse>('/api/anomalies', query, signal);
}

async function getAllForLevel(
  params: Omit<AnomalyQuery, 'anomaly_level' | 'limit' | 'offset'>,
  anomalyLevel: AnomalyLevel,
  signal?: AbortSignal,
): Promise<AnomalyRecord[]> {
  const records: AnomalyRecord[] = [];
  let offset = 0;

  while (true) {
    const page = await getAnomalies({
      ...params,
      anomaly_level: anomalyLevel,
      limit: MAX_PAGE_SIZE,
      offset,
    }, signal);

    records.push(...page.data);
    if (!page.has_more || page.count === 0) return records;
    offset += page.count;
  }
}

/**
 * Fetch every requested outlier class. The backend filters anomaly_level by exact equality,
 * so requesting "high" alone would omit both extreme classes.
 */
export async function getAnomalyOutliers(
  params: Omit<AnomalyQuery, 'limit' | 'offset'> = {},
  signal?: AbortSignal,
): Promise<AnomalyRecord[]> {
  const { anomaly_level: requestedLevel, ...filters } = params;
  const levels = requestedLevel ? [requestedLevel] : OUTLIER_LEVELS;
  const pages = await Promise.all(
    levels.map((level) => getAllForLevel(filters, level, signal)),
  );
  return pages.flat();
}
