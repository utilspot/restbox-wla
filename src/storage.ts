import type { HistoryEntry, SendResult } from './types';

const KEY = 'restbox-wla:history';
const LAYOUT_KEY = 'restbox-wla:layout';
const LIMIT = 50;
/** Response bodies above this many characters are stored truncated in history. */
const HISTORY_BODY_MAX = 100_000;

/** Trims a response body before it is kept in history, so one big payload
 * cannot fill the localStorage quota. */
export function capHistoryBody(result: SendResult): SendResult {
  if (result.body.length <= HISTORY_BODY_MAX) return result;
  return {
    ...result,
    body: `${result.body.slice(0, HISTORY_BODY_MAX)}\n\n… [response truncated in history]`,
  };
}

export interface Layout {
  /** Sidebar width in px. */
  sidebarWidth: number;
  /** Request-panel height in px (the response pane takes the rest). */
  requestHeight: number;
}

export const DEFAULT_LAYOUT: Layout = { sidebarWidth: 264, requestHeight: 340 };

export function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return { ...DEFAULT_LAYOUT };
    const parsed = JSON.parse(raw) as Partial<Layout>;
    return {
      sidebarWidth: Number(parsed.sidebarWidth) || DEFAULT_LAYOUT.sidebarWidth,
      requestHeight: Number(parsed.requestHeight) || DEFAULT_LAYOUT.requestHeight,
    };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

export function saveLayout(layout: Layout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Storage disabled or full — layout is a convenience, so ignore.
  }
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  // Each entry now carries its response, so the quota can be hit sooner —
  // drop the oldest half and retry until it fits.
  let list = entries.slice(0, LIMIT);
  while (list.length > 0) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return;
    } catch {
      list = list.slice(0, Math.floor(list.length / 2));
    }
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage disabled — history is a convenience, so ignore.
  }
}
