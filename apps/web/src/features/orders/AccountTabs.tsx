import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/account', label: 'Profile', end: true },
  { to: '/account/orders', label: 'Orders', end: false },
  { to: '/account/addresses', label: 'Addresses', end: false },
];

/** Sub-navigation shared by the buyer's account pages. */
export function AccountTabs() {
  return (
    <nav aria-label="Account" className="mb-8 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-muted hover:text-ink'}`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
