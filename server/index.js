/**
 * Single-port server for the HTTPie web client.
 *
 * The page and the request proxy are served from one port (3000 by default),
 * so the browser never talks to a second origin.
 *
 *   development (`npm run dev`)   Vite runs as middleware of this server,
 *                                 including its HMR websocket.
 *   production  (`npm start`)     the built page in `dist/` is served
 *                                 statically, with SPA fallback to index.html.
 *
 * API:
 *
 *   POST /send
 *     body: {
 *       method:  "GET" | "POST" | ...          (default "GET")
 *       url:     "https://example.com/..."     (absolute http/https URL)
 *       headers: { "Header-Name": "value" }    (optional)
 *       body:    "raw request body string"     (optional; ignored for GET/HEAD)
 *       timeoutMs: 30000                        (optional, 1000..120000)
 *       followRedirects: true                   (optional, default true)
 *     }
 *     -> 200 {
 *          status, statusText,
 *          headers: { ... }, body: "raw response text",
 *          timeMs, size
 *        }
 *     -> 400 { error }            malformed request
 *     -> 502 { error, kind:"network" }   DNS/connection/timeout failure
 *
 * The request itself is performed by the `httpie` package, server-side, so the
 * page can call APIs that a browser `fetch` could not reach because of CORS.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { send as httpieSend } from 'httpie';
import { resolveBaseUrl, stripBaseUrl, toViteBase } from './base-url.js';

const PORT = Number(process.env.PORT) || 3000;
/** '' or '/prefix' — see server/base-url.js. */
const BASE_URL = resolveBaseUrl();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const DIST = path.join(ROOT, 'dist');

const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Request body is not valid JSON'));
      }
    });
  });
}

/** Node header bags use lowercase keys and arrays for repeats; flatten them. */
function normalizeHeaders(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    out[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Request timed out after ${ms} ms`);
      err.kind = 'network';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function handleSend(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: `Method ${req.method} not allowed` });
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (cause) {
    sendJson(res, 400, { error: cause.message });
    return;
  }

  const method = String(payload.method || 'GET').toUpperCase();
  const url = String(payload.url || '').trim();

  if (!ALLOWED_METHODS.has(method)) {
    sendJson(res, 400, { error: `Unsupported method "${method}"` });
    return;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    sendJson(res, 400, { error: 'Enter a valid absolute URL, including http:// or https://' });
    return;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    sendJson(res, 400, { error: 'Only http and https URLs are supported' });
    return;
  }

  const headers = normalizeHeaders(payload.headers);
  const bodyAllowed = method !== 'GET' && method !== 'HEAD';
  const hasBody = bodyAllowed && typeof payload.body === 'string' && payload.body.length > 0;
  const timeoutMs = Math.min(
    Math.max(Number(payload.timeoutMs) || DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS),
    MAX_TIMEOUT_MS,
  );

  const started = performance.now();
  let result;
  try {
    result = await withTimeout(
      httpieSend(method, url, {
        headers,
        body: hasBody ? payload.body : undefined,
        redirect: payload.followRedirects !== false,
      }),
      timeoutMs,
    );
  } catch (err) {
    // httpie rejects non-2xx responses with an Error carrying the response.
    if (err && typeof err.statusCode === 'number') {
      result = err;
    } else {
      sendJson(res, 502, {
        error: err && err.message ? err.message : 'Request failed',
        kind: 'network',
      });
      return;
    }
  }

  const timeMs = Math.round(performance.now() - started);
  const data = result.data;
  const bodyText =
    data == null ? '' : typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  sendJson(res, 200, {
    status: result.statusCode,
    statusText: result.statusMessage || '',
    headers: normalizeHeaders(result.headers),
    body: bodyText,
    timeMs,
    size: Buffer.byteLength(bodyText),
  });
}

/** Resolves `pathname` inside `baseDir`, or null if it is not a file in there. */
function resolveFile(baseDir, pathname) {
  const candidate = path.join(baseDir, path.normalize(decodeURIComponent(pathname)));
  const isInside = candidate === baseDir || candidate.startsWith(baseDir + path.sep);
  if (!isInside || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null;
  return candidate;
}

function sendNotFound(pathname, res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Not found: ${pathname}`);
}

/** `index-D_vIqwqE.css` — a Vite-fingerprinted filename, safe to cache forever. */
const FINGERPRINTED = /-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/;

function cacheControlFor(file) {
  const name = path.basename(file);
  if (path.extname(name) === '.html' || name === 'manifest.json') return 'no-store';
  return FINGERPRINTED.test(name) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
}

function sendFile(file, res, cacheControl) {
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': cacheControl,
  });
  fs.createReadStream(file).pipe(res);
}

/** Serves the built page from `dist/`, falling back to index.html for client routes. */
function serveApp(route, res) {
  const asset = resolveFile(DIST, route);

  if (!asset && path.extname(route)) {
    sendNotFound(route, res);
    return;
  }

  const file = asset ?? path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No production build found. Run `npm run build` first.');
    return;
  }

  sendFile(file, res, cacheControlFor(file));
}

let viteMiddlewares;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  const route = stripBaseUrl(BASE_URL, url.pathname);
  if (route === null) {
    if (url.pathname === '/') {
      res.writeHead(302, { Location: `${BASE_URL}/` });
      res.end();
      return;
    }
    sendNotFound(url.pathname, res);
    return;
  }

  if (route === '/send') {
    handleSend(req, res).catch((err) => {
      if (!res.headersSent) sendJson(res, 500, { error: err?.message || 'Internal error' });
    });
    return;
  }

  if (viteMiddlewares) {
    viteMiddlewares(req, res, () => serveApp(route, res));
    return;
  }

  serveApp(route, res);
});

if (!IS_PRODUCTION) {
  // Dev only: run Vite inside this server so the page, the API and the HMR
  // websocket all share a single port.
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: ROOT,
    base: toViteBase(BASE_URL),
    appType: 'spa',
    server: {
      middlewareMode: true,
      hmr: { server },
    },
  });
  viteMiddlewares = vite.middlewares;
}

server.listen(PORT, () => {
  const mode = IS_PRODUCTION ? 'production (dist/)' : 'development (vite middleware)';
  const origin = `http://localhost:${PORT}${BASE_URL}`;
  console.log(`HTTPie web client on ${origin}/  —  ${mode}`);
  console.log(`  base url: ${BASE_URL || '/'}`);
});
