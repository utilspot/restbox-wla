import { useMemo } from 'react';

interface BodyViewProps {
  body: string;
  contentType: string;
  pretty: boolean;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Minimal JSON tokeniser — no dependency, good enough for a response pane. */
function highlightJson(json: string): string {
  const pattern =
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  return escapeHtml(json).replace(pattern, (match) => {
    let cls = 'num';
    if (match.startsWith('&#34;')) {
      cls = match.trimEnd().endsWith(':') ? 'key' : 'str';
    } else if (match === 'true' || match === 'false') {
      cls = 'bool';
    } else if (match === 'null') {
      cls = 'null';
    }
    return `<span class="tok tok--${cls}">${match}</span>`;
  });
}

export function BodyView({ body, contentType, pretty }: BodyViewProps) {
  const isJson = /\bjson\b/i.test(contentType) || looksLikeJson(body);

  const html = useMemo(() => {
    if (!pretty || !isJson) return null;
    try {
      return highlightJson(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      return null;
    }
  }, [body, isJson, pretty]);

  if (body === '') return <p className="hint">Empty response body.</p>;

  if (html) {
    return (
      <pre className="body-view">
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    );
  }

  return (
    <pre className="body-view">
      <code>{body}</code>
    </pre>
  );
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}
