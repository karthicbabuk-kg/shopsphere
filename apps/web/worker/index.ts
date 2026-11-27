import { proxyToApi, type ProxyEnv } from './proxy';

/**
 * Cloudflare Worker entry. Static files (the built site) are served by Cloudflare directly and never
 * reach this code; only /api/* is routed here (see `run_worker_first` in wrangler.jsonc). Every
 * /api/* request is forwarded to the API, so the browser only ever talks to one origin and the
 * login cookie stays first-party.
 */
export default {
  fetch: (request: Request, env: ProxyEnv) => proxyToApi(request, env),
};
