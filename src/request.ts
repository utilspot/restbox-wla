import type { Param, RequestDraft } from './types';

let counter = 0;
/** Ids only need to be unique within one session, for React keys. */
export function uid(prefix = 'p'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export function emptyParam(): Param {
  return { id: uid(), enabled: true, key: '', value: '' };
}

/** A table always shows one trailing blank row to type into. */
export function withTrailingBlank(rows: Param[]): Param[] {
  const last = rows[rows.length - 1];
  if (!last || last.key !== '' || last.value !== '') return [...rows, emptyParam()];
  return rows;
}

export function activeParams(rows: Param[]): Param[] {
  return rows.filter((row) => row.enabled && row.key.trim() !== '');
}

/** The page's own origin, e.g. `http://localhost:3000` — used as the starting URL. */
export function originUrl(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function createDraft(): RequestDraft {
  return {
    method: 'GET',
    url: __START_URL__ || originUrl(),
    query: [emptyParam()],
    headers: [emptyParam()],
    bodyType: 'none',
    bodyText: '{\n  "hello": "world"\n}',
    form: [emptyParam()],
    auth: { type: 'none', token: '', username: '', password: '' },
  };
}

/** Applies the enabled query rows onto the URL, keeping any params already in it. */
export function buildUrl(draft: RequestDraft): string {
  const raw = draft.url.trim();
  const active = activeParams(draft.query);
  if (!raw) return raw;

  try {
    const url = new URL(raw);
    for (const { key, value } of active) url.searchParams.append(key, value);
    return url.toString();
  } catch {
    // Not yet a valid absolute URL — fall back to a plain string join so the
    // preview still reflects the params.
    if (active.length === 0) return raw;
    const query = active
      .map(({ key, value }) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    return raw.includes('?') ? `${raw}&${query}` : `${raw}?${query}`;
  }
}

export interface WirePayload {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  followRedirects: boolean;
}

/** Turns the builder state into the JSON body for POST /send. */
export function toWirePayload(draft: RequestDraft): WirePayload {
  const headers: Record<string, string> = {};
  for (const { key, value } of activeParams(draft.headers)) headers[key] = value;

  let body: string | undefined;
  const bodyAllowed = draft.method !== 'GET' && draft.method !== 'HEAD';

  if (bodyAllowed) {
    if (draft.bodyType === 'json') {
      body = draft.bodyText;
      if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/json';
    } else if (draft.bodyType === 'text') {
      body = draft.bodyText;
      if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'text/plain';
    } else if (draft.bodyType === 'form') {
      body = activeParams(draft.form)
        .map(({ key, value }) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
      if (!hasHeader(headers, 'content-type')) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }
  }

  if (draft.auth.type === 'bearer' && draft.auth.token.trim()) {
    headers.Authorization = `Bearer ${draft.auth.token.trim()}`;
  } else if (draft.auth.type === 'basic' && (draft.auth.username || draft.auth.password)) {
    headers.Authorization = `Basic ${btoa(`${draft.auth.username}:${draft.auth.password}`)}`;
  }

  return { method: draft.method, url: buildUrl(draft), headers, body, followRedirects: true };
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name);
}

/** curl equivalent of the current request, for the "Copy as curl" action. */
export function toCurl(payload: WirePayload): string {
  const parts = [`curl -X ${payload.method}`];
  for (const [key, value] of Object.entries(payload.headers)) {
    parts.push(`-H ${shellQuote(`${key}: ${value}`)}`);
  }
  if (payload.body) parts.push(`--data ${shellQuote(payload.body)}`);
  parts.push(shellQuote(payload.url));
  // Only worth line-wrapping once there's more than the method and the URL.
  return parts.length > 2 ? parts.join(' \\\n  ') : parts.join(' ');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
