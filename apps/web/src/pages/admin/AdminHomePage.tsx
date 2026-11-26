import { useAuth } from '../../store/auth';

export function AdminHomePage() {
  const user = useAuth((s) => s.user);
  return (
    <>
      <h1 className="mt-2 text-4xl">Admin console</h1>
      <p className="mt-2 max-w-[60ch] text-muted">
        Signed in as {user?.name}. Platform metrics, seller approvals and moderation tools are built
        in Phase 4.
      </p>
    </>
  );
}
