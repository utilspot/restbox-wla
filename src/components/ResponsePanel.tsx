import { useState } from 'react';
import type { SendResult } from '../types';
import { ApiError } from '../api';
import { Tabs, type TabItem } from './Tabs';
import { BodyView } from './BodyView';

interface ResponsePanelProps {
  busy: boolean;
  result: SendResult | null;
  error: ApiError | null;
}

function statusClass(status: number): string {
  if (status >= 500) return 'status--5xx';
  if (status >= 400) return 'status--4xx';
  if (status >= 300) return 'status--3xx';
  if (status >= 200) return 'status--2xx';
  return 'status--other';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ResponsePanel({ busy, result, error }: ResponsePanelProps) {
  const [tab, setTab] = useState('body');
  const [pretty, setPretty] = useState(true);

  if (busy) {
    return (
      <section className="response-panel response-panel--empty">
        <div className="spinner" />
        <p>Waiting for response…</p>
      </section>
    );
  }

  if (error) {
    if (error.kind === 'aborted') {
      return (
        <section className="response-panel response-panel--empty">
          <p className="response-cancelled">Request cancelled</p>
        </section>
      );
    }
    return (
      <section className="response-panel response-panel--empty">
        <p className="response-error">
          <strong>{error.kind === 'network' ? 'Network error' : 'Request rejected'}</strong>
          <br />
          {error.message}
        </p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="response-panel response-panel--empty">
        <p>Send a request to see the response here.</p>
      </section>
    );
  }

  const headerEntries = Object.entries(result.headers);
  const contentType = result.headers['content-type'] ?? '';
  const tabs: TabItem[] = [
    { id: 'body', label: 'Body' },
    { id: 'headers', label: 'Headers', badge: headerEntries.length },
  ];

  return (
    <section className="response-panel">
      <div className="response-meta">
        <span className={`status ${statusClass(result.status)}`}>
          {result.status} {result.statusText}
        </span>
        <span className="response-meta__item">{result.timeMs} ms</span>
        <span className="response-meta__item">{formatSize(result.size)}</span>
        {tab === 'body' && (
          <label className="response-meta__toggle">
            <input
              type="checkbox"
              checked={pretty}
              onChange={(event) => setPretty(event.target.checked)}
            />
            Pretty
          </label>
        )}
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="response-panel__body">
        {tab === 'body' ? (
          <BodyView body={result.body} contentType={contentType} pretty={pretty} />
        ) : (
          <table className="headers-table">
            <tbody>
              {headerEntries.map(([key, value]) => (
                <tr key={key}>
                  <th>{key}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
