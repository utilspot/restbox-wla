import type { HistoryEntry } from '../types';
import pkg from '../../package.json';

interface SidebarProps {
  history: HistoryEntry[];
  activeId: string | null;
  onPick: (entry: HistoryEntry) => void;
  onClear: () => void;
  onNew: () => void;
}

function relativeTime(ts: number): string {
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function Sidebar({ history, activeId, onPick, onClear, onNew }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">⚡</span>
        <span>Rest Box</span>
        {import.meta.env.BASE_URL !== '/' && (
          <a href="/" className="sidebar__home" title="Back to site home">
            Home
          </a>
        )}
      </div>

      <button type="button" className="btn btn--block" onClick={onNew}>
        + New Request
      </button>

      <div className="sidebar__section">
        <span>History</span>
        {history.length > 0 && (
          <button type="button" className="linkish" onClick={onClear}>
            Clear
          </button>
        )}
      </div>

      <ul className="history">
        {history.length === 0 && <li className="history__empty">Nothing sent yet.</li>}
        {history.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className={`history__item${entry.id === activeId ? ' history__item--active' : ''}`}
              onClick={() => onPick(entry)}
            >
              <span className={`method-chip method-chip--${entry.method.toLowerCase()}`}>
                {entry.method}
              </span>
              <span className="history__url-wrap">
                <span className="history__url">{entry.draft.url || '(no url)'}</span>
                {(entry.count ?? 1) > 1 && (
                  <span className="history__count">{entry.count}</span>
                )}
              </span>
              <span className="history__meta">
                {entry.status != null && (
                  <span className={`dot dot--${statusBucket(entry.status)}`} />
                )}
                {relativeTime(entry.savedAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar__footer">
        Copyright © 2026 · MIT ·{' '}
        <a href={pkg.homepage} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </div>
    </aside>
  );
}

function statusBucket(status: number): string {
  if (status >= 500) return '5xx';
  if (status >= 400) return '4xx';
  if (status >= 300) return '3xx';
  return '2xx';
}
