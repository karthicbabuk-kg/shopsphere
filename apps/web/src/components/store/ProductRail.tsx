import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProductCard as Card } from '../../features/storefront/storeApi';
import { ProductCard, ProductCardSkeleton } from './ProductCard';

/** Horizontally scrolling product row with snap scrolling and arrow buttons for pointer users. */
export function ProductRail({
  title,
  subtitle,
  items,
  loading,
  to,
}: {
  title: string;
  subtitle?: string;
  items?: Card[];
  loading?: boolean;
  to?: string;
}) {
  const scroller = useRef<HTMLUListElement>(null);
  const scrollBy = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.85, behavior: 'smooth' });
  if (!loading && !items?.length) return null;
  const headingId = `rail-${title.replace(/\W+/g, '-').toLowerCase()}`;

  return (
    <section aria-labelledby={headingId} className="py-8">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-2xl">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {to && <Link to={to} className="text-sm font-bold text-blue-600 hover:text-blue-700">View all</Link>}
          <div className="hidden gap-1 md:flex">
            <button type="button" onClick={() => scrollBy(-1)} aria-label={`Scroll ${title} left`} className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white hover:bg-blue-50"><ChevronLeft size={18} /></button>
            <button type="button" onClick={() => scrollBy(1)} aria-label={`Scroll ${title} right`} className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white hover:bg-blue-50"><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>
      <ul ref={scroller} className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        {loading
          ? Array.from({ length: 6 }, (_, i) => <li key={i} className="w-[200px] shrink-0 sm:w-[220px]"><ProductCardSkeleton /></li>)
          : items!.map((p, i) => (
              <li key={p.id} className="w-[200px] shrink-0 snap-start sm:w-[220px]">
                <ProductCard p={p} priority={i < 2} />
              </li>
            ))}
      </ul>
    </section>
  );
}
