import { METHODS, type Method } from '../types';

interface MethodSelectProps {
  value: Method;
  onChange: (method: Method) => void;
}

export function MethodSelect({ value, onChange }: MethodSelectProps) {
  return (
    <div className={`method-select method-select--${value.toLowerCase()}`}>
      <select
        aria-label="HTTP method"
        value={value}
        onChange={(event) => onChange(event.target.value as Method)}
      >
        {METHODS.map((method) => (
          <option key={method} value={method}>
            {method}
          </option>
        ))}
      </select>
    </div>
  );
}
