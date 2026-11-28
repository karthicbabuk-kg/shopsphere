import { create } from 'zustand';
import type { Role, SellerStatus } from '@shopsphere/shared-types';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  sellerStatus?: SellerStatus;
}

type Status = 'loading' | 'authed' | 'anon';

interface AuthState {
  status: Status;
  user: AuthUser | null;
  /** Held in memory only; the refresh token lives in an httpOnly cookie. */
  accessToken: string | null;
  setSession: (accessToken: string, user: AuthUser) => void;
  clear: () => void;
  /** Not signed in for now, but keep the hint: the server was unreachable, so the session may still be valid. */
  markOffline: () => void;
}

/**
 * Non-secret hint that this browser holds a refresh cookie. It lets anonymous visitors skip the
 * refresh call (and its 401 console noise). The cookie itself stays httpOnly.
 */
const HINT_KEY = 'ss_session';
export const hasSessionHint = () => {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
};
const setHint = (on: boolean) => {
  try {
    if (on) localStorage.setItem(HINT_KEY, '1');
    else localStorage.removeItem(HINT_KEY);
  } catch {
    /* storage unavailable */
  }
};

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  accessToken: null,
  setSession: (accessToken, user) => {
    setHint(true);
    set({ accessToken, user, status: 'authed' });
  },
  clear: () => {
    setHint(false);
    set({ accessToken: null, user: null, status: 'anon' });
  },
  markOffline: () => set({ accessToken: null, user: null, status: 'anon' }),
}));

export const homeFor = (role: Role) =>
  role === 'ADMIN' ? '/admin' : role === 'SELLER' ? '/seller' : '/';
