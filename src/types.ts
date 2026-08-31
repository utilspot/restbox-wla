export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/** One editable row in the Query / Headers / Form tables. */
export interface Param {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

export type BodyType = 'none' | 'json' | 'text' | 'form';

export type AuthType = 'none' | 'bearer' | 'basic';

export interface Auth {
  type: AuthType;
  token: string;
  username: string;
  password: string;
}

/** The full state of the request builder — also what a history entry stores. */
export interface RequestDraft {
  method: Method;
  url: string;
  query: Param[];
  headers: Param[];
  bodyType: BodyType;
  bodyText: string;
  form: Param[];
  auth: Auth;
}

/** What the server returns from POST /send. */
export interface SendResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timeMs: number;
  size: number;
}

export interface HistoryError {
  message: string;
  kind?: string;
}

export interface HistoryEntry {
  id: string;
  savedAt: number;
  method: Method;
  url: string;
  status: number | null;
  draft: RequestDraft;
  /** The response this request produced, so it can be shown again on click. */
  result?: SendResult | null;
  /** Set instead of `result` when the request failed before a response. */
  error?: HistoryError | null;
  /** How many times this same request (method + url + outcome) repeated in a row. */
  count: number;
}
