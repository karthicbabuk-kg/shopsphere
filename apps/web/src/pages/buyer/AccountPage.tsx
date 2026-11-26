import { useAuth } from '../../store/auth';

export function AccountPage() {
  const user = useAuth((s) => s.user);
  return (
    <section className="mx-auto max-w-[720px] px-5 py-12">
      <h1 className="text-4xl">My account</h1>
      <dl className="mt-6 grid grid-cols-[120px_1fr] gap-y-3 rounded-xl border border-line bg-white p-6">
        <dt className="text-muted">Name</dt>
        <dd>{user?.name}</dd>
        <dt className="text-muted">Email</dt>
        <dd>{user?.email}</dd>
        <dt className="text-muted">Mobile</dt>
        <dd>{user?.phone ?? '—'}</dd>
      </dl>
    </section>
  );
}
