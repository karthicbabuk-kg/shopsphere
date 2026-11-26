import { Navigate, Outlet, useLocation } from 'react-router-dom';
import CircularProgress from '@mui/material/CircularProgress';
import type { Role } from '@shopsphere/shared-types';
import { homeFor, useAuth } from '../../store/auth';

/** Route guard: waits for session restore, then redirects anonymous or wrong-role users. */
export function RequireRole({ roles }: { roles?: Role[] }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="grid min-h-[50vh] place-items-center" role="status" aria-label="Loading">
        <CircularProgress size={28} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}
