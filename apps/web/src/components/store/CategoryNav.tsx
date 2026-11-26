import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useCategories } from '../../features/catalog/catalogApi';

/** Navy category bar. On desktop each category opens a sub-category panel on hover or keyboard focus. */
export function CategoryNav() {
  const { data: cats } = useCategories();
  return (
    <nav aria-label="Product categories" className="bg-navy-700 text-white">
      <ul className="mx-auto flex max-w-[1280px] gap-1 overflow-x-auto px-3 lg:overflow-visible">
        {(cats ?? Array.from({ length: 8 }, () => null)).map((c, i) =>
          c ? (
            <li key={c.id} className="group relative shrink-0">
              <Link to={`/c/${c.slug}`} className="flex h-11 items-center gap-1 rounded-md px-3 text-sm font-medium whitespace-nowrap hover:bg-white/10 focus-visible:bg-white/10">
                {c.name}
                {c.children.length > 0 && <ChevronDown size={14} className="hidden opacity-70 lg:block" aria-hidden="true" />}
              </Link>
              {c.children.length > 0 && (
                <div className="invisible absolute top-full left-0 z-40 hidden min-w-56 translate-y-1 rounded-b-lg border border-line bg-white p-2 text-ink opacity-0 shadow-e2 transition-all group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 lg:block">
                  <Link to={`/c/${c.slug}`} className="block rounded-md px-3 py-2 text-sm font-bold hover:bg-blue-50">All {c.name}</Link>
                  {c.children.map((ch) => (
                    <Link key={ch.id} to={`/c/${ch.slug}`} className="block rounded-md px-3 py-2 text-sm text-muted hover:bg-blue-50 hover:text-ink">{ch.name}</Link>
                  ))}
                </div>
              )}
            </li>
          ) : (
            <li key={i} className="h-11 w-24 shrink-0 animate-pulse rounded-md bg-white/10" aria-hidden="true" />
          ),
        )}
      </ul>
    </nav>
  );
}
