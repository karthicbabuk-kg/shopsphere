import { describe, expect, it, vi } from 'vitest';
import { MAX_ATTEMPTS, proxyToApi } from './_proxy';

const env = { API_ORIGIN: 'https://api.example.com' };
const noSleep = () => Promise.resolve();
const ok = () => new Response('{"success":true}', { status: 200, headers: { 'content-type': 'application/json' } });
const waking = () => new Response('<html>starting</html>', { status: 503, headers: { 'content-type': 'text/html' } });
const asFetch = (f: unknown) => f as typeof fetch;

describe('API proxy', () => {
  it('forwards path, query, method, body and cookies to the API origin', async () => {
    const fetchMock = vi.fn(async () => ok());
    const req = new Request('https://shop.pages.dev/api/v1/auth/login?x=1', {
      method: 'POST',
      headers: { cookie: 'ss_rt=abc', 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
      body: '{"email":"a@b.co"}',
    });
    const res = await proxyToApi(req, env, asFetch(fetchMock), noSleep);
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('https://api.example.com/api/v1/auth/login?x=1');
    expect(init.method).toBe('POST');
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"email":"a@b.co"}');
    const h = init.headers as Headers;
    expect(h.get('cookie')).toBe('ss_rt=abc');
    expect(h.get('x-forwarded-for')).toBe('203.0.113.9');
    expect(h.has('host')).toBe(false);
  });

  it('retries while the API instance is waking, resending the same body', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(waking()).mockRejectedValueOnce(new Error('reset')).mockResolvedValueOnce(ok());
    const sleep = vi.fn(noSleep);
    const req = new Request('https://s.pages.dev/api/v1/orders', { method: 'POST', body: 'payload' });
    const res = await proxyToApi(req, env, asFetch(fetchMock), sleep);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    for (const c of fetchMock.mock.calls) expect(new TextDecoder().decode((c[1] as RequestInit).body as ArrayBuffer)).toBe('payload');
  });

  it('never retries a real application error', async () => {
    const appError = vi.fn(async () => new Response('{"success":false}', { status: 503, headers: { 'content-type': 'application/json' } }));
    expect((await proxyToApi(new Request('https://s.pages.dev/api/v1/cart'), env, asFetch(appError), noSleep)).status).toBe(503);
    expect(appError).toHaveBeenCalledTimes(1);
    const notFound = vi.fn(async () => new Response('{"success":false}', { status: 404, headers: { 'content-type': 'application/json' } }));
    expect((await proxyToApi(new Request('https://s.pages.dev/api/v1/x'), env, asFetch(notFound), noSleep)).status).toBe(404);
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('gives up with a clear JSON error after the last attempt', async () => {
    const fetchMock = vi.fn(async () => waking());
    const res = await proxyToApi(new Request('https://s.pages.dev/api/v1/health'), env, asFetch(fetchMock), noSleep);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('API_UNAVAILABLE');
  });

  it('refuses to run unconfigured and never forwards non-API paths', async () => {
    const fetchMock = vi.fn(async () => ok());
    expect((await proxyToApi(new Request('https://s.pages.dev/api/v1/health'), {}, asFetch(fetchMock))).status).toBe(500);
    expect((await proxyToApi(new Request('https://s.pages.dev/api/v1/health'), { API_ORIGIN: 'not a url' }, asFetch(fetchMock))).status).toBe(500);
    expect((await proxyToApi(new Request('https://s.pages.dev/admin/secret'), env, asFetch(fetchMock))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
