import { Link, Outlet } from 'react-router-dom';
import { Logo } from '../components/Logo';

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
          <nav aria-label="Primary" className="flex gap-6 text-sm font-medium text-muted">
            <Link to="/login" className="hover:text-ink">
              Sign in
            </Link>
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
