import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';

type Reply = { status: number; data: unknown };
let replies: Reply[] = [];
let calls: string[] = [];

/** Fake network: replays the queued replies in order (a status of 0 means "no response at all"). */
const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) => {
  calls.push(`${config.method?.toUpperCase()} ${config.url}`);
  const r = replies.shift() ?? { status: 200, data: { success: true, data: {} } };
  if (r.status === 0) return Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK', config));
  const response = { data: r.data, status: r.status, statusText: '', headers: {}, config };
  return r.status >= 200 && r.status < 300
    ? Promise.resolve(response)
    : Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
};

// Both axios instances in api.ts are created from these defaults, so set the adapter before importing it.
axios.defaults.adapter = adapter;
const { api, refreshFailedTransiently, refreshSession, wake } = await import('./api');
const { useAuth } = await import('../store/auth');

const session = { success: true, data: { accessToken: 'tok', user: { id: 'u1', role: 'BUYER', name: 'A', email: 'a@b.co', phone: null } } };
const WAKE_URL = 'https://api.example.com/api/v1/ping';
const unavailable = (wakeUrl: string = WAKE_URL) => ({
  status: 503,
  data: { success: false, error: { code: 'API_UNAVAILABLE', message: 'starting', details: { wakeUrl } } },
});

// jsdom would try to load images; record what the code asks for instead.
const beacons: string[] = [];
globalThis.Image = class {
  referrerPolicy = '';
  set src(v: string) {
    beacons.push(v);
  }
} as unknown as typeof Image;

wake.delayMs = 0; // no real waiting in tests

beforeEach(() => {
  replies = [];
  calls = [];
  beacons.length = 0;
  wake.maxRetries = 14;
  wake.lastBeaconAt = 0;
  useAuth.getState().clear();
});

describe('session refresh while the server is waking', () => {
  it('retries a 503 and succeeds once the API is up', async () => {
    replies = [{ status: 503, data: '<html>' }, { status: 0, data: null }, { status: 200, data: session }];
    const s = await refreshSession();
    expect(s?.accessToken).toBe('tok');
    expect(calls).toHaveLength(3);
    expect(refreshFailedTransiently()).toBe(false);
    expect(useAuth.getState().status).toBe('authed');
  });

  it('flags a transient failure instead of treating it as a signed-out user', async () => {
    replies = [{ status: 503, data: 'x' }, { status: 503, data: 'x' }, { status: 503, data: 'x' }];
    expect(await refreshSession()).toBeNull();
    expect(refreshFailedTransiently()).toBe(true);
  });

  it('a real 401 ends the session immediately and is not transient', async () => {
    replies = [{ status: 401, data: { success: false, error: { code: 'UNAUTHORIZED', message: 'no' } } }];
    expect(await refreshSession()).toBeNull();
    expect(refreshFailedTransiently()).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe('API_UNAVAILABLE: wake the server and retry', () => {
  it('retries until the API answers, waking Render directly once', async () => {
    replies = [unavailable(), unavailable(), unavailable(), { status: 200, data: { success: true, data: { ok: 1 } } }];
    const res = await api.get('/cart');
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(4);
    expect(beacons).toEqual([WAKE_URL]); // one wake-up request, not one per retry
  });

  it('gives up after the retry limit and reports the error', async () => {
    wake.maxRetries = 2;
    replies = [unavailable(), unavailable(), unavailable(), { status: 200, data: { success: true, data: {} } }];
    await expect(api.get('/cart')).rejects.toMatchObject({ response: { status: 503 } });
    expect(calls).toHaveLength(3);
  });

  it('only ever requests the known liveness endpoint over https', async () => {
    for (const bad of ['http://api.example.com/api/v1/ping', 'https://api.example.com/steal?x=1', 'not a url']) {
      replies = [unavailable(bad), { status: 200, data: { success: true, data: {} } }];
      await api.get('/cart');
    }
    expect(beacons).toEqual([]);
  });

  it('never retries ordinary application errors', async () => {
    replies = [{ status: 409, data: { success: false, error: { code: 'CONFLICT', message: 'no stock' } } }];
    await expect(api.post('/orders', {})).rejects.toMatchObject({ response: { status: 409 } });
    expect(calls).toHaveLength(1);
    expect(beacons).toEqual([]);
  });

  it('a sleeping server never signs the user out: refresh waits for it instead', async () => {
    replies = [unavailable(), unavailable(), { status: 200, data: session }];
    const s = await refreshSession();
    expect(s?.accessToken).toBe('tok');
    expect(refreshFailedTransiently()).toBe(false);
    expect(beacons).toHaveLength(1);
  });
});
