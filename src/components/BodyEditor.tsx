import type { BodyType, Param } from '../types';
import { KeyValueEditor } from './KeyValueEditor';

const TYPES: { id: BodyType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'json', label: 'JSON' },
  { id: 'text', label: 'Text' },
  { id: 'form', label: 'Form' },
];

interface BodyEditorProps {
  disabled: boolean;
  bodyType: BodyType;
  bodyText: string;
  form: Param[];
  onTypeChange: (type: BodyType) => void;
  onTextChange: (text: string) => void;
  onFormChange: (rows: Param[]) => void;
}

export function BodyEditor({
  disabled,
  bodyType,
  bodyText,
  form,
  onTypeChange,
  onTextChange,
  onFormChange,
}: BodyEditorProps) {
  return (
    <div className="body-editor">
      <div className="body-editor__types">
        {TYPES.map((type) => (
          <label key={type.id} className="radio">
            <input
              type="radio"
              name="body-type"
              value={type.id}
              checked={bodyType === type.id}
              onChange={() => onTypeChange(type.id)}
            />
            {type.label}
          </label>
        ))}
      </div>

      {disabled ? (
        <p className="hint">A {`GET/HEAD`} request has no body.</p>
      ) : bodyType === 'none' ? (
        <p className="hint">This request does not send a body.</p>
      ) : bodyType === 'form' ? (
        <KeyValueEditor rows={form} onChange={onFormChange} keyPlaceholder="field" />
      ) : (
        <textarea
          className={`code-input code-input--${bodyType}`}
          spellCheck={false}
          value={bodyText}
          placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Raw request body'}
          onChange={(event) => onTextChange(event.target.value)}
        />
      )}
    </div>
  );
}
