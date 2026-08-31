import { useState } from 'react';
import type { RequestDraft } from '../types';
import { activeParams } from '../request';
import { Tabs, type TabItem } from './Tabs';
import { MethodSelect } from './MethodSelect';
import { KeyValueEditor } from './KeyValueEditor';
import { BodyEditor } from './BodyEditor';
import { AuthEditor } from './AuthEditor';

interface RequestPanelProps {
  draft: RequestDraft;
  onChange: (patch: Partial<RequestDraft>) => void;
  onSend: () => void;
  onCancel: () => void;
  onCopyCurl: () => void;
  busy: boolean;
}

export function RequestPanel({
  draft,
  onChange,
  onSend,
  onCancel,
  onCopyCurl,
  busy,
}: RequestPanelProps) {
  const [tab, setTab] = useState('query');
  const bodyDisabled = draft.method === 'GET' || draft.method === 'HEAD';

  const bodyCount =
    draft.bodyType === 'none'
      ? 0
      : draft.bodyType === 'form'
        ? activeParams(draft.form).length
        : draft.bodyText.trim()
          ? 1
          : 0;

  const tabs: TabItem[] = [
    { id: 'query', label: 'Query', badge: activeParams(draft.query).length },
    { id: 'body', label: 'Body', badge: bodyDisabled ? 0 : bodyCount },
    { id: 'headers', label: 'Headers', badge: activeParams(draft.headers).length },
    { id: 'auth', label: 'Auth', badge: draft.auth.type === 'none' ? 0 : 1 },
  ];

  return (
    <section className="request-panel">
      <form
        className="url-bar"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onSend();
        }}
      >
        <MethodSelect value={draft.method} onChange={(method) => onChange({ method })} />
        <input
          className="url-bar__input"
          type="text"
          spellCheck={false}
          placeholder="https://api.example.com/endpoint"
          value={draft.url}
          onChange={(event) => onChange({ url: event.target.value })}
        />
        <button type="button" className="btn btn--ghost" onClick={onCopyCurl} title="Copy as curl">
          curl
        </button>
        {busy ? (
          <button key="cancel" type="button" className="btn btn--cancel" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button
            key="send"
            type="submit"
            className="btn btn--send"
            disabled={!draft.url.trim()}
          >
            Send
          </button>
        )}
      </form>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="request-panel__body">
        {tab === 'query' && (
          <KeyValueEditor
            rows={draft.query}
            onChange={(query) => onChange({ query })}
            keyPlaceholder="parameter"
          />
        )}
        {tab === 'body' && (
          <BodyEditor
            disabled={bodyDisabled}
            bodyType={draft.bodyType}
            bodyText={draft.bodyText}
            form={draft.form}
            onTypeChange={(bodyType) => onChange({ bodyType })}
            onTextChange={(bodyText) => onChange({ bodyText })}
            onFormChange={(form) => onChange({ form })}
          />
        )}
        {tab === 'headers' && (
          <KeyValueEditor
            rows={draft.headers}
            onChange={(headers) => onChange({ headers })}
            keyPlaceholder="header"
          />
        )}
        {tab === 'auth' && (
          <AuthEditor auth={draft.auth} onChange={(auth) => onChange({ auth })} />
        )}
      </div>
    </section>
  );
}
