import { useEffect, type ReactNode } from 'react';
import { refreshFailedTransiently, refreshSession } from '../../services/api';
import { hasSessionHint, useAuth } from '../../store/auth';

/** Restores the session on page load from the httpOnly refresh cookie. */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!hasSessionHint()) {
      useAuth.getState().clear();
      return;
    }
    void refreshSession().then((s) => {
      if (!s) {
        // Unreachable server (for example a sleeping free-tier API): keep the saved session so the next visit still restores it.
        if (refreshFailedTransiently()) useAuth.getState().markOffline();
        else useAuth.getState().clear();
      }
    });
  }, []);
  return children;
}
