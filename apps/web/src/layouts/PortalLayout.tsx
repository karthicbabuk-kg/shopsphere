import { Link, Outlet } from 'react-router-dom';
import Button from '@mui/material/Button';
import { Logo } from '../components/Logo';
import { logout } from '../features/auth/authApi';
import { useAuth } from '../store/auth';

/** Temporary shell for seller/admin portals; the full sidebar layouts arrive in Phase 4. */
export function PortalLayout({ title }: { title: string }) {
  const user = useAuth((s) => s.user);
  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-navy-900 text-white">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5">
          <Link to="/" aria-label="ShopSphere home">
            <Logo dark />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-white/70 sm:inline">{user?.email}</span>
            <Button color="inherit" size="small" variant="outlined" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-5 py-10">
        <p className="font-mono text-xs tracking-wider text-muted uppercase">{title}</p>
        <Outlet />
      </main>
    </div>
  );
}
