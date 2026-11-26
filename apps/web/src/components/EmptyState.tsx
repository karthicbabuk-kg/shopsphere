import type { ReactNode } from 'react';

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-line bg-white px-6 py-12 text-center">
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
        <circle cx="28" cy="28" r="22" stroke="#D5D9DF" strokeWidth="3" />
        <circle cx="28" cy="28" r="7" fill="#1F6FEB" opacity="0.85" />
      </svg>
      <h2 className="mt-4 text-lg">{title}</h2>
      {message && <p className="mt-1 max-w-[44ch] text-sm text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
