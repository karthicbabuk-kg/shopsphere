import { proxyToApi, type ProxyEnv } from '../_proxy';

// Cloudflare Pages Function: handles every /api/* request (see _proxy.ts).
export const onRequest = (ctx: { request: Request; env: ProxyEnv }) => proxyToApi(ctx.request, ctx.env);
