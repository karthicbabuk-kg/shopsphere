import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Renders its children only once the placeholder is about to scroll into view. Below-the-fold
 * sections then cost nothing at page load (less script work, fewer DOM nodes, fewer images).
 * The placeholder keeps the section's height, so content does not jump as it appears.
 */
export function Deferred({ children, minHeight = 380, margin = '600px' }: { children: ReactNode; minHeight?: number; margin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const el = ref.current;
    if (show || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: `${margin} 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show, margin]);

  return show ? <>{children}</> : <div ref={ref} style={{ minHeight }} aria-hidden="true" />;
}
