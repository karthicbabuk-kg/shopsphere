import { useEffect, type ReactNode } from 'react';
import { refreshSession } from '../../services/api';
import { hasSessionHint, useAuth } from '../../store/auth';

/** Restores the session on page load from the httpOnly refresh cookie. */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!hasSessionHint()) {
      useAuth.getState().clear();
      return;
    }
    void refreshSession().then((s) => {
      if (!s) useAuth.getState().clear();
    });
  }, []);
  return children;
}
