import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterBuyerInput,
  RegisterSellerInput,
  ResetPasswordInput,
} from '@shopsphere/shared-validation';
import type { ApiResponse } from '@shopsphere/shared-types';
import { api, unwrap } from '../../services/api';
import { useAuth, type AuthUser } from '../../store/auth';

interface Session {
  accessToken: string;
  user: AuthUser;
}

async function startSession(p: Promise<{ data: ApiResponse<Session> }>) {
  const s = await unwrap<Session>(p);
  useAuth.getState().setSession(s.accessToken, s.user);
  return s.user;
}

export const login = (input: LoginInput) => startSession(api.post('/auth/login', input));
export const registerBuyer = (input: RegisterBuyerInput) =>
  startSession(api.post('/auth/register', input));
export const registerSeller = (input: RegisterSellerInput) =>
  startSession(api.post('/auth/register-seller', input));

export async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    useAuth.getState().clear();
  }
}

export const forgotPassword = (input: ForgotPasswordInput) =>
  unwrap<{ message: string; demoResetToken?: string }>(api.post('/auth/forgot-password', input));

export const resetPassword = (input: ResetPasswordInput) =>
  unwrap<{ message: string }>(api.post('/auth/reset-password', input));
