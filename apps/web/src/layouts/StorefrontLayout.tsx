import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { ChevronDown, UserRound } from 'lucide-react';
import { Logo } from '../components/Logo';
import { logout } from '../features/auth/authApi';
import { homeFor, useAuth } from '../store/auth';

function AccountMenu() {
  const { user, status } = useAuth();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (status === 'loading') return <span className="h-9 w-24" aria-hidden="true" />;
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button component={Link} to="/login" size="small" color="inherit">
          Sign in
        </Button>
        <Button component={Link} to="/register" size="small" variant="contained">
          Sign up
        </Button>
      </div>
    );
  }

  const close = () => setAnchor(null);
  return (
    <>
      <Button
        color="inherit"
        onClick={(e) => setAnchor(e.currentTarget)}
        startIcon={<UserRound size={18} />}
        endIcon={<ChevronDown size={16} />}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
      >
        {user.name.split(' ')[0]}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close}>
        {user.role === 'BUYER' && (
          <MenuItem
            onClick={() => {
              close();
              navigate('/account');
            }}
          >
            My account
          </MenuItem>
        )}
        {user.role !== 'BUYER' && (
          <MenuItem
            onClick={() => {
              close();
              navigate(homeFor(user.role));
            }}
          >
            {user.role === 'ADMIN' ? 'Admin console' : 'Seller dashboard'}
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            close();
            void logout().then(() => navigate('/'));
          }}
        >
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}

export function StorefrontLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5">
          <Link to="/" aria-label="ShopSphere home">
            <Logo />
          </Link>
          <nav aria-label="Account">
            <AccountMenu />
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-navy-900 py-8 text-sm text-white/70">
        <div className="mx-auto max-w-[1280px] px-5">
          © 2026 ShopSphere – demonstration project. Payments are simulated.
        </div>
      </footer>
    </div>
  );
}
