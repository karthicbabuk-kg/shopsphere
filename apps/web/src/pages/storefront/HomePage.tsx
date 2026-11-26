import { useApiHealth } from '../../features/system/useApiHealth';

export function HomePage() {
  const { data, isLoading, isError } = useApiHealth();

  return (
    <section className="mx-auto max-w-[1280px] px-5 py-16">
      <p className="font-mono text-xs tracking-wider text-muted uppercase">
        Multi-vendor marketplace · Demo
      </p>
      <h1 className="mt-3 text-5xl text-navy-700">ShopSphere</h1>
      <p className="mt-4 max-w-[60ch] text-lg text-muted">
        Storefront, seller and admin portals on one backend. The storefront is built in Phase 7.
      </p>
      <p
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-zone px-4 py-2 text-sm"
        role="status"
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            isLoading ? 'bg-warning' : isError ? 'bg-danger' : 'bg-success'
          }`}
        />
        {isLoading
          ? 'Connecting to API…'
          : isError
            ? 'API unreachable'
            : `API ${data?.status} · database ${data?.db}`}
      </p>
    </section>
  );
}
