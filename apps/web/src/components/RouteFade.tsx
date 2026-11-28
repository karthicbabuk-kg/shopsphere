import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Gives every page change a short fade-in so navigation feels continuous instead of snapping.
 * The very first page load is not animated (it would only delay the first paint), and visitors who
 * prefer reduced motion get no animation at all (see `.route-fade` in index.css). Keyed by path so a
 * new page always starts fresh, including its local state.
 */
export function RouteFade({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const initial = useRef(true);
  const animate = !initial.current;
  useEffect(() => {
    initial.current = false;
  }, []);
  return (
    <div key={pathname} className={animate ? 'route-fade' : undefined}>
      {children}
    </div>
  );
}
