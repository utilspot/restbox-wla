import type { Param } from '../types';
import { emptyParam, withTrailingBlank } from '../request';

interface KeyValueEditorProps {
  rows: Param[];
  onChange: (rows: Param[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = 'key',
  valuePlaceholder = 'value',
}: KeyValueEditorProps) {
  const view = withTrailingBlank(rows);

  function update(id: string, patch: Partial<Param>) {
    const next = view.map((row) => (row.id === id ? { ...row, ...patch } : row));
    onChange(withTrailingBlank(next));
  }

  function remove(id: string) {
    const next = view.filter((row) => row.id !== id);
    onChange(next.length ? next : [emptyParam()]);
  }

  return (
    <div className="kv">
      {view.map((row, index) => {
        const isBlank = index === view.length - 1 && row.key === '' && row.value === '';
        return (
          <div className="kv__row" key={row.id}>
            <input
              className="kv__check"
              type="checkbox"
              checked={row.enabled}
              disabled={isBlank}
              aria-label="Enabled"
              onChange={(event) => update(row.id, { enabled: event.target.checked })}
            />
            <input
              className="kv__key"
              type="text"
              spellCheck={false}
              placeholder={keyPlaceholder}
              value={row.key}
              onChange={(event) => update(row.id, { key: event.target.value })}
            />
            <input
              className="kv__value"
              type="text"
              spellCheck={false}
              placeholder={valuePlaceholder}
              value={row.value}
              onChange={(event) => update(row.id, { value: event.target.value })}
            />
            <button
              type="button"
              className="kv__remove"
              aria-label="Remove row"
              disabled={isBlank}
              onClick={() => remove(row.id)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
