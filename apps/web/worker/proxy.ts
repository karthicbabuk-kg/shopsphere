/**
 * Same-origin API proxy for Cloudflare (Workers).
 *
 * The browser only ever talks to the site's own origin (`/api/...`), so the refresh-token cookie is
 * first-party and keeps working in Safari and other browsers that block cross-site cookies. This
 * function forwards each request to the API (on Render) and returns the answer unchanged.
 *
 * Free Render instances sleep when idle; while one wakes, the platform answers 502/503/504 with an
 * HTML page (not our JSON envelope). Such a request never reached the app, so it is safe to retry,
 * including POSTs. Real application errors (JSON bodies) are never retried.
 *
 * Waking: the first sign of a sleeping API triggers one clean, minimal GET to the health endpoint
 * (no forwarded browser or Cloudflare headers) and waits for it, because that is the request shape
 * known to wake the instance. If everything fails, the error carries what the platform answered so
 * the cause can be diagnosed instead of guessed.
 */
export interface ProxyEnv {
  /** Origin of the API, e.g. https://shopsphere-api.onrender.com (no trailing path). */
  API_ORIGIN?: string;
}

const WAKE_STATUSES = new Set([502, 503, 504]);
// Short on purpose. A request from this Worker does not wake a sleeping Render instance (Render answers
// 502 "no-deploy" at once instead of holding it), so long retries here only waste the visitor time. We give up
// quickly and hand the browser the address to wake directly (see wakeUrl below); the browser then retries.
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 3000;
export const WAKE_TIMEOUT_MS = 15_000;

const json = (status: number, code: string, message: string, details?: unknown) =>
  new Response(JSON.stringify({ success: false, error: { code, message, ...(details ? { details } : {}) } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const isJson = (r: Response) => (r.headers.get('content-type') ?? '').includes('application/json');
const looksAsleep = (r: Response | undefined) => r === undefined || (WAKE_STATUSES.has(r.status) && !isJson(r));
const describe = (r: Response | undefined) =>
  r
    ? { status: r.status, contentType: r.headers.get('content-type'), server: r.headers.get('server'), routing: r.headers.get('x-render-routing') }
    : { status: null as number | null, error: 'no response' };

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
  let wakeResult: ReturnType<typeof describe> | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      last = await fetchImpl(target, { method: request.method, headers, body, redirect: 'manual' });
    } catch {
      last = undefined; // network failure while the instance boots
    }
    if (!looksAsleep(last)) return last!;

    if (!wakeResult) {
      // One clean request, exactly the shape that wakes a sleeping instance, awaited so we do not hammer it.
      try {
        const probe = await fetchImpl(new URL('/api/v1/ping', origin), {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
        });
        wakeResult = describe(probe);
        if (probe.ok) continue; // awake now: retry the real request straight away
      } catch (e) {
        wakeResult = { status: null, error: e instanceof Error ? e.name : 'error' };
      }
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
  return json(503, 'API_UNAVAILABLE', 'The demo server is still starting. Please try again in a moment.', {
    attempts: MAX_ATTEMPTS,
    // Public address the browser can request directly (an image request) to wake the API.
    wakeUrl: new URL('/api/v1/ping', origin).toString(),
    lastResponse: describe(last),
    wakeProbe: wakeResult,
  });
}
