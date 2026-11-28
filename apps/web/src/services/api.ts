import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_PREFIX } from '@shopsphere/shared-config';
import type { ApiResponse } from '@shopsphere/shared-types';
import { useAuth, type AuthUser } from '../store/auth';
import { trackEnd, trackStart } from '../store/slowApi';

/** In dev the Vite proxy forwards /api to the API; in prod VITE_API_URL points at Render. */
const baseURL = `${import.meta.env.VITE_API_URL ?? ''}${API_PREFIX}`;

// 90 s: a sleeping free-tier API plus a suspended database can take well over 30 s to answer the first request.
const TIMEOUT_MS = 90_000;
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

/** True when the last refresh failed because the server was unreachable or still starting (not because the session is invalid). */
let lastRefreshTransient = false;
export const refreshFailedTransiently = () => lastRefreshTransient;

/** A failure that says nothing about the session: no response, or a 5xx while a sleeping API boots. */
const isTransient = (e: unknown) => {
  const status = (e as AxiosError).response?.status;
  return status === undefined || status >= 500;
};
const REFRESH_ATTEMPTS = 3;

async function doRefresh(): Promise<SessionPayload | null> {
  lastRefreshTransient = false;
  for (let attempt = 1; attempt <= REFRESH_ATTEMPTS; attempt++) {
    try {
      const res = await bare.post<ApiResponse<SessionPayload>>('/auth/refresh');
      if (!res.data.success) return null;
      useAuth.getState().setSession(res.data.data.accessToken, res.data.data.user);
      return res.data.data;
    } catch (e) {
      if (!isTransient(e)) return null; // 401/403: the session really is gone
      if (attempt === REFRESH_ATTEMPTS) lastRefreshTransient = true;
    }
  }
  return null;
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

type Retryable = InternalAxiosRequestConfig & { _retried?: boolean; _wakeRetries?: number };

/** The edge proxy answers API_UNAVAILABLE only when the request never reached the app, so retrying is always safe. */
const MAX_WAKE_RETRIES = 2;
const isApiUnavailable = (e: AxiosError) =>
  (e.response?.data as { error?: { code?: string } } | undefined)?.error?.code === 'API_UNAVAILABLE';

api.interceptors.response.use(
  (r) => {
    trackEnd(r.config);
    return r;
  },
  async (error: AxiosError) => {
    trackEnd(error.config);
    const original = error.config as Retryable | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (original && isApiUnavailable(error) && (original._wakeRetries ?? 0) < MAX_WAKE_RETRIES) {
      original._wakeRetries = (original._wakeRetries ?? 0) + 1;
      return api(original);
    }
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
