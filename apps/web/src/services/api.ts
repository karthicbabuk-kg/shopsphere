import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_PREFIX } from '@shopsphere/shared-config';
import type { ApiResponse } from '@shopsphere/shared-types';
import { useAuth, type AuthUser } from '../store/auth';

/** In dev the Vite proxy forwards /api to the API; in prod VITE_API_URL points at Render. */
const baseURL = `${import.meta.env.VITE_API_URL ?? ''}${API_PREFIX}`;

export const api = axios.create({ baseURL, withCredentials: true, timeout: 30_000 });

// Bare client for the refresh call so it never triggers the 401 interceptor itself.
const bare = axios.create({ baseURL, withCredentials: true, timeout: 30_000 });

interface SessionPayload {
  accessToken: string;
  user: AuthUser;
}

let refreshing: Promise<SessionPayload | null> | null = null;

/** Single-flight: concurrent callers share one refresh request (the API rotates tokens). */
export function refreshSession(): Promise<SessionPayload | null> {
  refreshing ??= bare
    .post<ApiResponse<SessionPayload>>('/auth/refresh')
    .then((res) => {
      if (!res.data.success) return null;
      useAuth.getState().setSession(res.data.data.accessToken, res.data.data.user);
      return res.data.data;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

type Retryable = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as Retryable | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      const session = await refreshSession();
      if (session) return api(original);
      useAuth.getState().clear();
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
