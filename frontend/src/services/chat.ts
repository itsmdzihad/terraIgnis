import { buildApiUrl } from './api';

export interface IgnishMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendIgnishMessage(messages: IgnishMessage[]): Promise<string> {
  const response = await fetch(buildApiUrl('/api/chat'), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    let message = `Ignish request failed (${response.status}).`;
    try {
      const payload: unknown = await response.json();
      if (typeof payload === 'object' && payload !== null && 'detail' in payload && typeof payload.detail === 'string') {
        message = payload.detail;
      }
    } catch {
      // Keep the status message if the API response is not JSON.
    }
    throw new Error(message);
  }

  const payload = await response.json() as { reply?: unknown };
  if (typeof payload.reply !== 'string' || !payload.reply.trim()) {
    throw new Error('Ignish returned an empty reply. Please try again.');
  }
  return payload.reply;
}
