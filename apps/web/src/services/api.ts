import axios from 'axios';
import { API_PREFIX } from '@shopsphere/shared-config';
import type { ApiResponse } from '@shopsphere/shared-types';

/** In dev the Vite proxy forwards /api to the API; in prod VITE_API_URL points at Render. */
export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}${API_PREFIX}`,
  withCredentials: true,
  timeout: 30_000,
});

export async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const { data } = await promise;
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
