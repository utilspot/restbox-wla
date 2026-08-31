/**
 * The URL the request builder starts with on a fresh draft.
 *
 * Set it with `--start-url=<url>` on the build (or dev) npm script, e.g.
 *
 *   npm run dev   --start-url=https://api.example.com
 *   npm run build --start-url=https://api.example.com
 *
 * npm exposes that flag as `npm_config_start_url`; `START_URL` in the
 * environment and a plain `--start-url=` argv flag work too, for use without
 * npm. It is baked into the client bundle at build time (see
 * vite.config.ts), so `npm start` alone cannot change it after the fact —
 * pass the flag to `npm run build`, not `npm start`.
 *
 * Unset, `createDraft()` in src/request.ts falls back to the page's own
 * origin, same as before this flag existed.
 */

const FLAG = '--start-url=';

export function resolveStartUrl(argv = process.argv, env = process.env) {
  const flag = argv.find((arg) => arg.startsWith(FLAG));
  const raw = flag ? flag.slice(FLAG.length) : (env.npm_config_start_url ?? env.START_URL ?? '');
  return String(raw ?? '').trim();
}
