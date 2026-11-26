import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-[640px] px-5 py-24 text-center">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="mt-2 text-4xl">Page not found</h1>
      <p className="mt-3 text-muted">The page you are looking for does not exist or has moved.</p>
      <Link to="/" className="mt-6 inline-block font-bold text-blue-600 hover:text-blue-700">
        Back to home
      </Link>
    </section>
  );
}
