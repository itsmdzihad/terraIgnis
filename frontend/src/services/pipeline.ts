import { buildApiUrl } from './api';

export interface RawFileInventory {
  MODIS: number;
  VIIRS: number;
  total: number;
}

export interface RawUploadResult {
  filename: string;
  stored_filename: string;
  sensor: 'MODIS' | 'VIIRS';
  bytes: number;
  duplicate: boolean;
}

export interface BatchUploadResult {
  sensor: 'MODIS' | 'VIIRS';
  total_files: number;
  uploaded_files: number;
  duplicate_files: number;
  files: RawUploadResult[];
  raw_files: RawFileInventory;
}

export type PipelineRunState = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed';

const notifiedGenerationJobs = new Set<string>();

/** Tell mounted dashboard views to reload after processed datasets are replaced. */
export function notifyDatasetsUpdated(jobId: string): void {
  if (notifiedGenerationJobs.has(jobId)) return;
  notifiedGenerationJobs.add(jobId);
  window.dispatchEvent(new CustomEvent('terraignis:datasets-updated', { detail: { job_id: jobId } }));
}

export interface PipelineStageState {
  name: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
}

export interface PipelineStatus {
  job_id: string | null;
  status: PipelineRunState;
  stage: string | null;
  message: string;
  stages: PipelineStageState[];
  logs: string[];
  started_at: string | null;
  finished_at: string | null;
  last_successful_at?: string | null;
  last_successful_job_id?: string | null;
  raw_files: RawFileInventory;
}

export interface NRTIngestionStatus {
  enabled: boolean;
  configured: boolean;
  status: string;
  last_started_at?: string | null;
  last_finished_at?: string | null;
  next_run_at?: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
  pending_generation?: boolean;
  download_notice_pending?: boolean;
  manual_run?: boolean;
  run_id?: string | null;
  interval_minutes?: number;
  downloaded_records?: number;
  raw_files_added?: number;
  sources_configured?: string[];
  sources?: Record<string, { status: string; downloaded_records?: number; date_start?: string; date_end?: string; raw_file_saved?: boolean; error?: string }>;
}

export interface HistoricalIngestionChunk {
  source: string;
  start_date: string;
  end_date: string;
  status: string;
  records: number;
  raw_file?: string | null;
  raw_file_added?: boolean;
  error?: string | null;
}

export interface HistoricalIngestionJob {
  job_id: string;
  status: string;
  stage?: string | null;
  area?: string;
  requested_start_date: string;
  requested_end_date: string;
  sources: string[];
  total_chunks: number;
  completed_chunks: number;
  pending_chunks: number;
  failed_chunks: number;
  progress_percent: number;
  downloaded_records: number;
  raw_files_added?: number;
  pending_generation?: boolean;
  download_notice_pending?: boolean;
  generation_job_id?: string | null;
  updated_at?: string;
  finished_at?: string | null;
  last_error?: string | null;
  chunks: HistoricalIngestionChunk[];
}

export interface IngestionStatus {
  nrt: NRTIngestionStatus;
  historical: {
    enabled: boolean;
    configured: boolean;
    active_job: HistoricalIngestionJob | null;
    jobs: HistoricalIngestionJob[];
  };
}

export interface HistoricalIngestionRequest {
  start_date: string;
  end_date: string;
  area?: string;
  sources: string[];
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body: unknown = await response.json();
      if (typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string') {
        message = body.detail;
      }
    } catch {
      // Use the status message when the server did not return JSON.
    }
    throw new Error(message);
  }
  return await response.json() as T;
}

export async function uploadRawFiles(files: File[], sensor: 'MODIS' | 'VIIRS', signal?: AbortSignal): Promise<BatchUploadResult> {
  const formData = new FormData();
  formData.set('sensor', sensor);
  for (const file of files) formData.append('files', file, file.name);

  const response = await fetch(buildApiUrl('/api/pipeline/uploads/batch'), {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: formData,
    signal,
  });
  return readResponse<BatchUploadResult>(response);
}

export async function fetchPipelineStatus(signal?: AbortSignal): Promise<PipelineStatus> {
  const response = await fetch(buildApiUrl('/api/pipeline/status'), {
    headers: { Accept: 'application/json' },
    signal,
  });
  return readResponse<PipelineStatus>(response);
}

export async function startPipeline(): Promise<{ job_id: string; status: 'queued'; message: string }> {
  const response = await fetch(buildApiUrl('/api/pipeline/generate'), {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  const result = await readResponse<{ job_id: string; status: 'queued'; message: string }>(response);
  window.dispatchEvent(new CustomEvent('terraignis:pipeline-generation-started', { detail: result }));
  return result;
}

export async function clearPipelineData(password: string): Promise<{ status: 'cleared'; removed_entries: number; message: string }> {
  const response = await fetch(buildApiUrl('/api/pipeline/reset'), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return readResponse(response);
}

function operatorHeaders(token?: string): Record<string, string> {
  const normalized = token?.trim();
  return normalized ? { Authorization: `Bearer ${normalized}` } : {};
}

export async function fetchIngestionStatus(signal?: AbortSignal): Promise<IngestionStatus> {
  const response = await fetch(buildApiUrl('/api/ingestion/status'), {
    headers: { Accept: 'application/json' },
    signal,
  });
  return readResponse<IngestionStatus>(response);
}

export async function startNrtIngestion(token?: string): Promise<{ status: string; message: string }> {
  const response = await fetch(buildApiUrl('/api/ingestion/nrt/run'), {
    method: 'POST',
    headers: { Accept: 'application/json', ...operatorHeaders(token) },
  });
  return readResponse(response);
}

export async function startHistoricalIngestion(
  request: HistoricalIngestionRequest,
  token?: string,
): Promise<HistoricalIngestionJob> {
  const response = await fetch(buildApiUrl('/api/ingestion/historical/start'), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...operatorHeaders(token) },
    body: JSON.stringify(request),
  });
  return readResponse<HistoricalIngestionJob>(response);
}

export async function resumeHistoricalIngestion(jobId: string, token?: string): Promise<HistoricalIngestionJob> {
  const response = await fetch(buildApiUrl(`/api/ingestion/historical/${encodeURIComponent(jobId)}/resume`), {
    method: 'POST',
    headers: { Accept: 'application/json', ...operatorHeaders(token) },
  });
  return readResponse<HistoricalIngestionJob>(response);
}

export async function cancelHistoricalIngestion(jobId: string, token?: string): Promise<HistoricalIngestionJob> {
  const response = await fetch(buildApiUrl(`/api/ingestion/historical/${encodeURIComponent(jobId)}/cancel`), {
    method: 'POST',
    headers: { Accept: 'application/json', ...operatorHeaders(token) },
  });
  return readResponse<HistoricalIngestionJob>(response);
}
