import { useState } from 'react';
import { Link, Outlet, ScrollRestoration, useNavigate } from 'react-router-dom';
import { RouteFade } from '../components/RouteFade';
import Badge from '@mui/material/Badge';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { ChevronDown, Heart, ShoppingCart, UserRound } from 'lucide-react';
import { Logo } from '../components/Logo';
import { SearchBox } from '../components/store/SearchBox';
import { CategoryNav } from '../components/store/CategoryNav';
import { Footer } from '../components/store/Footer';
import { logout } from '../features/auth/authApi';
import { useCart, useWishlist } from '../features/storefront/storeApi';
import { useBuyerGate } from '../features/storefront/useBuyerGate';
import { homeFor, useAuth } from '../store/auth';

function AccountMenu() {
  const { user, status } = useAuth();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (status === 'loading') return <span className="h-9 w-24" aria-hidden="true" />;
  if (!user) {
    return (
      <div className="flex items-center gap-1">
        <Button component={Link} to="/login" size="small" color="inherit">Sign in</Button>
        <Button component={Link} to="/register" size="small" variant="contained" className="hidden! sm:inline-flex!">Sign up</Button>
      </div>
    );
  }

  const close = () => setAnchor(null);
  const go = (to: string) => () => {
    close();
    navigate(to);
  };
  return (
    <>
      <Button color="inherit" onClick={(e) => setAnchor(e.currentTarget)} startIcon={<UserRound size={18} />} endIcon={<ChevronDown size={16} />} aria-haspopup="menu" aria-expanded={!!anchor}>
        <span className="hidden sm:inline">{user.name.split(' ')[0]}</span>
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close}>
        {user.role === 'BUYER' && <MenuItem onClick={go('/account')}>My account</MenuItem>}
        {user.role === 'BUYER' && <MenuItem onClick={go('/account/orders')}>My orders</MenuItem>}
        {user.role === 'BUYER' && <MenuItem onClick={go('/wishlist')}>Wishlist</MenuItem>}
        {user.role !== 'BUYER' && <MenuItem onClick={go(homeFor(user.role))}>{user.role === 'ADMIN' ? 'Admin console' : 'Seller dashboard'}</MenuItem>}
        <MenuItem onClick={() => { close(); void logout().then(() => navigate('/')); }}>Sign out</MenuItem>
      </Menu>
    </>
  );
}

function HeaderIcons() {
  const navigate = useNavigate();
  const gate = useBuyerGate();
  const { data: wl } = useWishlist();
  const { data: cart } = useCart();
  return (
    <div className="flex items-center">
      <IconButton aria-label={`Wishlist${wl?.ids.length ? `, ${wl.ids.length} items` : ''}`} onClick={() => gate(() => navigate('/wishlist'))}>
        <span key={wl?.ids.length ?? 0} className="badge-bump"><Badge badgeContent={wl?.ids.length || undefined} color="primary" max={99}><Heart size={22} /></Badge></span>
      </IconButton>
      <IconButton aria-label={`Cart${cart?.itemCount ? `, ${cart.itemCount} items` : ''}`} onClick={() => gate(() => navigate('/cart'))}>
        <span key={cart?.itemCount ?? 0} className="badge-bump"><Badge badgeContent={cart?.itemCount || undefined} color="warning" max={99}><ShoppingCart size={22} /></Badge></span>
      </IconButton>
    </div>
  );
}

export function StorefrontLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 bg-white shadow-e1">
        <div className="mx-auto grid max-w-[1280px] grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-2 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:py-3">
          <Link to="/" aria-label="ShopSphere home" className="shrink-0"><Logo /></Link>
          <div className="order-last col-span-3 lg:order-none lg:col-span-1 lg:mx-auto lg:w-full lg:max-w-2xl"><SearchBox /></div>
          <div className="flex items-center justify-end">
            <HeaderIcons />
            <AccountMenu />
          </div>
        </div>
        <CategoryNav />
      </header>
      <main id="main" className="flex-1">
        <RouteFade>
          <Outlet />
        </RouteFade>
      </main>
      <ScrollRestoration />
      <Footer />
    </div>
  );
}
