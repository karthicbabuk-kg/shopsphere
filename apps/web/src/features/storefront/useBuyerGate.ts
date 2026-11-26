import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import { toast } from '../../store/toast';

/**
 * Cart and wishlist belong to buyer accounts. Anonymous visitors are sent to sign in and come back
 * to the same page; seller and admin accounts are told why the action is unavailable.
 */
export function useBuyerGate() {
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (action: () => void) => {
      if (status === 'loading') return;
      if (!user) {
        toast.info('Please sign in to continue');
        navigate('/login', { state: { from: location.pathname + location.search } });
        return;
      }
      if (user.role !== 'BUYER') {
        toast.info('Cart and wishlist are available for buyer accounts. Sign in with a buyer account to shop.');
        return;
      }
      action();
    },
    [user, status, navigate, location],
  );
}
