const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function buildApiUrl(path: string, query?: URLSearchParams): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}`;
  return query?.size ? `${url}?${query.toString()}` : url;
}

export async function apiGet<T>(path: string, query?: URLSearchParams, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildApiUrl(path, query), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Unable to connect to the TerraIgnis API.', 0);
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body: unknown = await response.json();
      if (typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string') {
        message = body.detail;
      }
    } catch {
      // Keep the safe status message when an error response is not JSON.
    }
    throw new ApiError(message, response.status);
  }

  try {
    return await response.json() as T;
  } catch {
    throw new ApiError('The TerraIgnis API returned an invalid response.', response.status);
  }
}
