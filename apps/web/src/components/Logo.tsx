export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="12" fill="none" stroke="#1F6FEB" strokeWidth="3" />
        <circle cx="16" cy="16" r="4.5" fill={dark ? '#fff' : '#0F2167'} />
      </svg>
      <span
        className={`text-xl font-bold tracking-tight ${dark ? 'text-white' : 'text-navy-700'}`}
      >
        Shop<span className="font-normal">Sphere</span>
      </span>
    </span>
  );
}
