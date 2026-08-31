import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { HistoryEntry, HistoryError, RequestDraft, SendResult } from './types';
import { ApiError, sendRequest } from './api';
import { createDraft, toCurl, toWirePayload, uid } from './request';
import {
  capHistoryBody,
  DEFAULT_LAYOUT,
  loadHistory,
  loadLayout,
  saveHistory,
  saveLayout,
} from './storage';
import { Sidebar } from './components/Sidebar';
import { RequestPanel } from './components/RequestPanel';
import { ResponsePanel } from './components/ResponsePanel';
import { ResizeHandle } from './components/ResizeHandle';

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 520;
const REQUEST_MIN = 160;
/** Leave at least this much room for the response pane below the split. */
const RESPONSE_MIN = 140;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function App() {
  const [draft, setDraft] = useState<RequestDraft>(createDraft);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [activeId, setActiveId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [layout, setLayout] = useState(loadLayout);
  const workspaceRef = useRef<HTMLElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** The most recently recorded history entry, kept in sync with `history[0]`
   * so a repeated request can be merged into it instead of adding a new row. */
  const lastEntryRef = useRef<HistoryEntry | null>(history[0] ?? null);

  useEffect(() => saveHistory(history), [history]);
  useEffect(() => saveLayout(layout), [layout]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  // Keep the split sane on first paint (a stored height may be taller than this
  // viewport) and whenever the window is resized — the response pane must always
  // keep at least RESPONSE_MIN so its scroll area never collapses to nothing.
  useEffect(() => {
    function clampSplit() {
      const available = workspaceRef.current?.clientHeight ?? window.innerHeight;
      const max = Math.max(REQUEST_MIN, available - RESPONSE_MIN);
      setLayout((current) => {
        const next = clamp(current.requestHeight, REQUEST_MIN, max);
        return next === current.requestHeight ? current : { ...current, requestHeight: next };
      });
    }
    clampSplit();
    window.addEventListener('resize', clampSplit);
    return () => window.removeEventListener('resize', clampSplit);
  }, []);

  const resizeSidebar = useCallback((delta: number) => {
    setLayout((current) => ({
      ...current,
      sidebarWidth: clamp(current.sidebarWidth + delta, SIDEBAR_MIN, SIDEBAR_MAX),
    }));
  }, []);

  const resizeRequest = useCallback((delta: number) => {
    setLayout((current) => {
      const available = workspaceRef.current?.clientHeight ?? window.innerHeight;
      const max = Math.max(REQUEST_MIN, available - RESPONSE_MIN);
      return {
        ...current,
        requestHeight: clamp(current.requestHeight + delta, REQUEST_MIN, max),
      };
    });
  }, []);

  const patchDraft = useCallback((patch: Partial<RequestDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const handleSend = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true);
    setError(null);
    const payload = toWirePayload(draft);
    const snapshot = draft;

    try {
      const response = await sendRequest(payload, controller.signal);
      setResult(response);
      setError(null);
      record(response.status, capHistoryBody(response), null);
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : new ApiError(String(cause));
      setResult(null);
      setError(apiError);
      record(null, null, { message: apiError.message, kind: apiError.kind });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }

    function record(
      status: number | null,
      result: SendResult | null,
      failure: HistoryError | null,
    ) {
      const top = lastEntryRef.current;
      const repeatsLast =
        top &&
        top.method === snapshot.method &&
        top.draft.url === snapshot.url &&
        top.status === status &&
        top.error?.kind === failure?.kind;

      const entry: HistoryEntry = repeatsLast
        ? { ...top, savedAt: Date.now(), draft: snapshot, result, error: failure, count: top.count + 1 }
        : {
            id: uid('h'),
            savedAt: Date.now(),
            method: snapshot.method,
            url: payload.url,
            status,
            draft: snapshot,
            result,
            error: failure,
            count: 1,
          };

      lastEntryRef.current = entry;
      setActiveId(entry.id);
      setHistory((current) =>
        repeatsLast ? [entry, ...current.slice(1)] : [entry, ...current].slice(0, 50),
      );
    }
  }, [draft]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleCopyCurl = useCallback(() => {
    const text = toCurl(toWirePayload(draft));
    navigator.clipboard?.writeText(text).then(
      () => setToast('curl command copied'),
      () => setToast('Could not access the clipboard'),
    );
  }, [draft]);

  function handlePickHistory(entry: HistoryEntry) {
    setDraft(entry.draft);
    setActiveId(entry.id);
    setBusy(false);
    setResult(entry.result ?? null);
    setError(entry.error ? new ApiError(entry.error.message, entry.error.kind) : null);
  }

  function handleNew() {
    setDraft(createDraft());
    setActiveId(null);
    setResult(null);
    setError(null);
  }

  const appStyle = {
    '--sidebar-w': `${layout.sidebarWidth}px`,
    '--request-h': `${layout.requestHeight}px`,
  } as CSSProperties;

  return (
    <div className="app" style={appStyle}>
      <Sidebar
        history={history}
        activeId={activeId}
        onPick={handlePickHistory}
        onClear={() => {
          setHistory([]);
          setActiveId(null);
          lastEntryRef.current = null;
        }}
        onNew={handleNew}
      />

      <ResizeHandle
        axis="x"
        label="Resize sidebar"
        onDelta={resizeSidebar}
        onReset={() =>
          setLayout((current) => ({ ...current, sidebarWidth: DEFAULT_LAYOUT.sidebarWidth }))
        }
        style={{ left: 'var(--sidebar-w)' }}
      />

      <main className="workspace" ref={workspaceRef}>
        <RequestPanel
          draft={draft}
          onChange={patchDraft}
          onSend={handleSend}
          onCancel={handleCancel}
          onCopyCurl={handleCopyCurl}
          busy={busy}
        />

        <ResizeHandle
          axis="y"
          label="Resize response pane"
          onDelta={resizeRequest}
          onReset={() =>
            setLayout((current) => ({ ...current, requestHeight: DEFAULT_LAYOUT.requestHeight }))
          }
          style={{ top: 'var(--request-h)' }}
        />

        <ResponsePanel busy={busy} result={result} error={error} />
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
