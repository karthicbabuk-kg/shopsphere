import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className="grid min-h-[calc(100vh-4rem)] place-items-center px-5 py-12">
      <div className={`w-full ${wide ? 'max-w-[640px]' : 'max-w-[440px]'}`}>
        <Link to="/" className="mb-8 inline-block" aria-label="ShopSphere home">
          <Logo />
        </Link>
        <div className="rounded-xl border border-line bg-white p-8 shadow-e1">
          <h1 className="text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
      </div>
    </section>
  );
}
