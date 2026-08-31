import type { SendResult } from './types';
import type { WirePayload } from './request';

/** Vite injects BASE_URL with a trailing slash ('/' at the root). */
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export class ApiError extends Error {
  kind: string | undefined;
  constructor(message: string, kind?: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

export function sendRequest(payload: WirePayload, signal?: AbortSignal): Promise<SendResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError('Request cancelled', 'aborted'));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/send`);
    xhr.setRequestHeader('Content-Type', 'application/json');

    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort);

    const cleanup = () => signal?.removeEventListener('abort', onAbort);

    xhr.onload = () => {
      cleanup();
      let data: unknown;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        reject(new ApiError(`Proxy returned a non-JSON response (${xhr.status})`));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const record = data as { error?: string; kind?: string };
        reject(new ApiError(record.error || `Request failed (${xhr.status})`, record.kind));
        return;
      }
      resolve(data as SendResult);
    };

    xhr.onerror = () => {
      cleanup();
      reject(new ApiError('Could not reach the proxy server', 'network'));
    };

    xhr.onabort = () => {
      cleanup();
      reject(new ApiError('Request cancelled', 'aborted'));
    };

    xhr.send(JSON.stringify(payload));
  });
}
