import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_PREFIX, PING_PATH } from '@shopsphere/shared-config';
import type { ApiResponse } from '@shopsphere/shared-types';
import { useAuth, type AuthUser } from '../store/auth';
import { holdSlow, trackEnd, trackStart } from '../store/slowApi';

/** In dev the Vite proxy forwards /api to the API; in prod VITE_API_URL points at Render. */
const baseURL = `${import.meta.env.VITE_API_URL ?? ''}${API_PREFIX}`;

// 120 s: a sleeping free-tier API plus a suspended database can take well over 30 s to answer the first request.
const TIMEOUT_MS = 120_000;
export const api = axios.create({ baseURL, withCredentials: true, timeout: TIMEOUT_MS });

// Bare client for the refresh call so it never triggers the 401 interceptor itself.
const bare = axios.create({ baseURL, withCredentials: true, timeout: TIMEOUT_MS });

for (const client of [api, bare]) {
  client.interceptors.request.use((config) => {
    trackStart(config);
    return config;
  });
}
bare.interceptors.response.use(
  (r) => { trackEnd(r.config); return r; },
  (e: AxiosError) => { trackEnd(e.config); return Promise.reject(e); },
);

interface SessionPayload {
  accessToken: string;
  user: AuthUser;
}

let refreshing: Promise<SessionPayload | null> | null = null;

/** The edge proxy answers API_UNAVAILABLE only when the request never reached the app. */
function isApiUnavailable(e: AxiosError) {
  return (e.response?.data as { error?: { code?: string } } | undefined)?.error?.code === 'API_UNAVAILABLE';
}

/** True when the last refresh failed because the server was unreachable or still starting (not because the session is invalid). */
let lastRefreshTransient = false;
export const refreshFailedTransiently = () => lastRefreshTransient;

/** A failure that says nothing about the session: no response, or a 5xx while a sleeping API boots. */
const isTransient = (e: unknown) => {
  const status = (e as AxiosError).response?.status;
  return status === undefined || status >= 500;
};
const REFRESH_ATTEMPTS = 3;

/**
 * Waking a sleeping free-tier API. A request relayed by the edge proxy does not wake Render (it answers
 * 502 at once), so when the proxy reports API_UNAVAILABLE the browser asks Render directly with a plain
 * image request (this works because it comes from a browser, and needs no CORS), then keeps retrying
 * every few seconds. Retrying is safe: API_UNAVAILABLE means the request never reached the app.
 */
export const wake = { delayMs: 8000, maxRetries: 14, lastBeaconAt: 0 };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function wakeBeacon(error: unknown) {
  const url = (error as AxiosError).response?.data as { error?: { details?: { wakeUrl?: string } } } | undefined;
  const target = url?.error?.details?.wakeUrl;
  if (!target || Date.now() - wake.lastBeaconAt < 45_000) return;
  try {
    const u = new URL(target);
    if (u.protocol !== 'https:' || u.pathname !== PING_PATH) return; // only ever the known liveness endpoint
    wake.lastBeaconAt = Date.now();
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = u.toString();
  } catch {
    /* malformed address: ignore */
  }
}

async function doRefresh(): Promise<SessionPayload | null> {
  lastRefreshTransient = false;
  const release = holdSlow();
  try {
    let transientFailures = 0;
    for (let attempt = 1; attempt <= wake.maxRetries + 1; attempt++) {
      try {
        const res = await bare.post<ApiResponse<SessionPayload>>('/auth/refresh');
        if (!res.data.success) return null;
        useAuth.getState().setSession(res.data.data.accessToken, res.data.data.user);
        return res.data.data;
      } catch (e) {
        if (!isTransient(e)) return null; // 401/403: the session really is gone
        if (isApiUnavailable(e as AxiosError)) {
          wakeBeacon(e);
          await sleep(wake.delayMs);
        } else if (++transientFailures >= REFRESH_ATTEMPTS) {
          break;
        }
      }
    }
    lastRefreshTransient = true;
    return null;
  } finally {
    release();
  }
}

/** Single-flight: concurrent callers share one refresh request (the API rotates tokens). */
export function refreshSession(): Promise<SessionPayload | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

type Retryable = InternalAxiosRequestConfig & { _retried?: boolean; _wakeRetries?: number; _release?: () => void };

api.interceptors.response.use(
  (r) => {
    trackEnd(r.config);
    (r.config as Retryable)._release?.();
    return r;
  },
  async (error: AxiosError) => {
    trackEnd(error.config);
    const original = error.config as Retryable | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (original && isApiUnavailable(error) && (original._wakeRetries ?? 0) < wake.maxRetries) {
      original._wakeRetries = (original._wakeRetries ?? 0) + 1;
      original._release ??= holdSlow(); // banner stays on for the whole wait
      wakeBeacon(error);
      await sleep(wake.delayMs);
      return api(original);
    }
    original?._release?.();
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      const session = await refreshSession();
      if (session) return api(original);
      // A server that is merely unreachable must not sign the user out.
      if (!refreshFailedTransiently()) useAuth.getState().clear();
    }
    return Promise.reject(error);
  },
);

/** Unwraps the standard `{ success, data }` envelope, throwing a readable Error on failure. */
export async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  try {
    const { data } = await promise;
    if (!data.success) throw new ApiRequestError(data.error.message, data.error.code);
    return data.data;
  } catch (e) {
    if (e instanceof ApiRequestError) throw e;
    if (axios.isAxiosError(e)) {
      const body = e.response?.data as ApiResponse<never> | undefined;
      if (body && !body.success) {
        throw new ApiRequestError(body.error.message, body.error.code, body.error.details);
      }
      if (!e.response) {
        throw new ApiRequestError(
          'Cannot reach the server. It may be waking up – please try again in a few seconds.',
          'NETWORK',
        );
      }
    }
    throw e;
  }
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
