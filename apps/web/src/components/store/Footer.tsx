import { Link } from 'react-router-dom';
import { Logo } from '../Logo';

const COLS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: 'Shop',
    links: [
      { label: 'All products', to: '/search' },
      { label: 'Electronics', to: '/c/electronics' },
      { label: 'Mobiles', to: '/c/mobiles' },
      { label: 'Fashion', to: '/c/fashion' },
      { label: 'Home Appliances', to: '/c/home-appliances' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', to: '/login' },
      { label: 'Create an account', to: '/register' },
      { label: 'My account', to: '/account' },
      { label: 'Wishlist', to: '/wishlist' },
      { label: 'Cart', to: '/cart' },
    ],
  },
  {
    title: 'Sell on ShopSphere',
    links: [
      { label: 'Open a store', to: '/seller/register' },
      { label: 'Seller sign in', to: '/login' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-12 bg-navy-900 text-white/80">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo dark />
          <p className="mt-4 max-w-xs text-sm leading-6">
            A multi-vendor marketplace demonstration: buyers, sellers and an admin console on one backend. Every payment on this site is simulated.
          </p>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="font-mono text-xs tracking-wider text-white/50 uppercase">{c.title}</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {c.links.map((l) => (
                <li key={l.label}><Link to={l.to} className="hover:text-white hover:underline">{l.label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-white/60">
          <span>© 2026 ShopSphere – demonstration project. Not a real store; no money is charged.</span>
          <span>Brands, products and sellers shown are fictional.</span>
        </div>
      </div>
    </footer>
  );
}
