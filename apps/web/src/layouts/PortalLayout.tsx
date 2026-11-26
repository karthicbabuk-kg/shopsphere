import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import { Menu as MenuIcon } from 'lucide-react';
import { Logo } from '../components/Logo';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { logout } from '../features/auth/authApi';
import { useAuth } from '../store/auth';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

function SideNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <nav aria-label="Portal" className="flex flex-col gap-1 px-3 py-4">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
              isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`
          }
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Shared shell for the seller and admin portals: navy sidebar, white top bar, mobile drawer. */
export function PortalLayout({ title, nav }: { title: string; nav: NavItem[] }) {
  const user = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden bg-navy-900 lg:block">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="flex h-16 items-center border-b border-white/10 px-5">
            <Link to="/" aria-label="ShopSphere storefront">
              <Logo dark />
            </Link>
          </div>
          <p className="px-6 pt-5 font-mono text-[11px] tracking-wider text-white/50 uppercase">
            {title}
          </p>
          <SideNav items={nav} />
        </div>
      </aside>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        slotProps={{ paper: { sx: { bgcolor: '#0B1A52', width: 264 } } }}
      >
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <Logo dark />
        </div>
        <SideNav items={nav} onNavigate={() => setOpen(false)} />
      </Drawer>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-white px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <IconButton
              className="lg:hidden!"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <MenuIcon size={22} />
            </IconButton>
            <span className="font-mono text-xs tracking-wider text-muted uppercase lg:hidden">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <NotificationBell />
            <span className="hidden text-sm text-muted sm:inline">{user?.email}</span>
            <Button size="small" variant="outlined" color="inherit" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 px-4 py-8 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
