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
  raw_files: RawFileInventory;
}

export type PipelineRunState = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed';

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
  raw_files: RawFileInventory;
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

export async function uploadRawFile(file: File, signal?: AbortSignal): Promise<RawUploadResult> {
  const response = await fetch(buildApiUrl('/api/pipeline/uploads'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Filename': encodeURIComponent(file.name),
    },
    body: file,
    signal,
  });
  return readResponse<RawUploadResult>(response);
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
  return readResponse(response);
}
