import type { Auth, AuthType } from '../types';

const TYPES: { id: AuthType; label: string }[] = [
  { id: 'none', label: 'No Auth' },
  { id: 'bearer', label: 'Bearer Token' },
  { id: 'basic', label: 'Basic Auth' },
];

interface AuthEditorProps {
  auth: Auth;
  onChange: (auth: Auth) => void;
}

export function AuthEditor({ auth, onChange }: AuthEditorProps) {
  return (
    <div className="auth-editor">
      <select
        aria-label="Authentication type"
        className="auth-editor__type"
        value={auth.type}
        onChange={(event) => onChange({ ...auth, type: event.target.value as AuthType })}
      >
        {TYPES.map((type) => (
          <option key={type.id} value={type.id}>
            {type.label}
          </option>
        ))}
      </select>

      {auth.type === 'bearer' && (
        <label className="field">
          <span>Token</span>
          <input
            type="text"
            spellCheck={false}
            value={auth.token}
            placeholder="eyJhbGciOi…"
            onChange={(event) => onChange({ ...auth, token: event.target.value })}
          />
        </label>
      )}

      {auth.type === 'basic' && (
        <div className="auth-editor__basic">
          <label className="field">
            <span>Username</span>
            <input
              type="text"
              spellCheck={false}
              value={auth.username}
              onChange={(event) => onChange({ ...auth, username: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={auth.password}
              onChange={(event) => onChange({ ...auth, password: event.target.value })}
            />
          </label>
        </div>
      )}

      {auth.type === 'none' && <p className="hint">This request is sent without an Authorization header.</p>}
    </div>
  );
}
