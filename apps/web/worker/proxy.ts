/**
 * Same-origin API proxy for Cloudflare Pages.
 *
 * The browser only ever talks to the site's own origin (`/api/...`), so the refresh-token cookie is
 * first-party and keeps working in Safari and other browsers that block cross-site cookies. This
 * function forwards each request to the API (on Render) and returns the answer unchanged.
 *
 * Free Render instances sleep when idle; while one wakes, the platform answers 502/503/504 with an
 * HTML page (not our JSON envelope). Such a request never reached the app, so it is safe to retry,
 * including POSTs. Real application errors (JSON bodies) are never retried.
 */
export interface ProxyEnv {
  /** Origin of the API, e.g. https://shopsphere-api.onrender.com (no trailing path). */
  API_ORIGIN?: string;
}

const WAKE_STATUSES = new Set([502, 503, 504]);
// About 75 s in total: a sleeping free Render instance needs a minute or more to boot, and the browser gives up at 90 s.
export const MAX_ATTEMPTS = 16;
export const RETRY_DELAY_MS = 5000;

const json = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function proxyToApi(
  request: Request,
  env: ProxyEnv,
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<Response> {
  if (!env.API_ORIGIN) return json(500, 'PROXY_NOT_CONFIGURED', 'The API origin is not configured for this deployment.');

  let origin: URL;
  try {
    origin = new URL(env.API_ORIGIN);
  } catch {
    return json(500, 'PROXY_NOT_CONFIGURED', 'The API origin is not a valid URL.');
  }
  const incoming = new URL(request.url);
  // Only the API namespace is ever forwarded, whatever the route configuration says.
  if (!incoming.pathname.startsWith('/api/')) return json(404, 'NOT_FOUND', 'Route not found');
  const target = new URL(incoming.pathname + incoming.search, origin);

  const headers = new Headers(request.headers);
  headers.delete('host');
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.arrayBuffer() : undefined; // read once so retries can resend it

  let last: Response | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      last = await fetchImpl(target, { method: request.method, headers, body, redirect: 'manual' });
    } catch {
      last = undefined; // network failure while the instance boots
    }
    const waking =
      last === undefined || (WAKE_STATUSES.has(last.status) && !(last.headers.get('content-type') ?? '').includes('application/json'));
    if (!waking) return last!;
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
  return json(503, 'API_UNAVAILABLE', 'The demo server is still starting. Please try again in a moment.');
}
