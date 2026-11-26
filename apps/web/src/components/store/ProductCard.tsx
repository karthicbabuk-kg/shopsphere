import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import Skeleton from '@mui/material/Skeleton';
import { useBuyerGate } from '../../features/storefront/useBuyerGate';
import { useWishlist, useWishlistToggle, type ProductCard as Card } from '../../features/storefront/storeApi';
import { cdn, cdnSet } from '../../utils/cdn';
import { Price } from './Price';
import { RatingChip } from './RatingChip';

export function ProductCardSkeleton() {
  return (
    <div className="rounded-lg border border-line bg-white p-3" aria-hidden="true">
      <Skeleton variant="rounded" sx={{ aspectRatio: '1 / 1', height: 'auto', width: '100%' }} />
      <Skeleton width="85%" sx={{ mt: 1.5 }} />
      <Skeleton width="50%" />
      <Skeleton width="65%" />
    </div>
  );
}

export function ProductCard({ p, priority = false }: { p: Card; priority?: boolean }) {
  const gate = useBuyerGate();
  const { data: wl } = useWishlist();
  const toggle = useWishlistToggle();
  const saved = !!wl?.ids.includes(p.id);

  return (
    <article className="group relative flex h-full flex-col rounded-lg border border-line bg-white transition-shadow hover:shadow-e2 focus-within:shadow-e2">
      <div className="relative">
        <Link to={`/p/${p.slug}`} className="block overflow-hidden rounded-t-lg" aria-label={p.name} tabIndex={-1}>
          <div className="relative aspect-square bg-zone">
            {p.image && (
              <img
                src={cdn(p.image, 400)}
                srcSet={cdnSet(p.image, 400)}
                alt=""
                width={400}
                height={400}
                loading={priority ? 'eager' : 'lazy'}
                decoding="async"
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${p.hoverImage ? 'group-hover:opacity-0' : ''} ${p.inStock ? '' : 'opacity-50 grayscale'}`}
              />
            )}
            {p.hoverImage && (
              <img src={cdn(p.hoverImage, 400)} alt="" width={400} height={400} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            )}
          </div>
        </Link>
        {p.discountPct > 0 && p.inStock && (
          <span className="absolute top-2 left-2 rounded-md bg-green-700 px-2 py-0.5 font-mono text-xs font-medium text-white">-{p.discountPct}%</span>
        )}
        {!p.inStock && <span className="absolute top-2 left-2 rounded-md bg-ink px-2 py-0.5 text-xs font-medium text-white">Out of stock</span>}
        <button
          type="button"
          aria-label={saved ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`}
          aria-pressed={saved}
          onClick={() => gate(() => toggle.mutate({ id: p.id, on: !saved }))}
          className="absolute top-2 right-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow-e1 transition-transform hover:scale-110 active:scale-95"
        >
          <Heart size={18} className={saved ? 'fill-danger text-danger' : 'text-muted'} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {p.brand && <p className="font-mono text-[11px] tracking-wider text-muted uppercase">{p.brand.name}</p>}
        <h3 className="line-clamp-2 min-h-10 text-sm leading-5 font-medium">
          <Link to={`/p/${p.slug}`} className="hover:text-blue-600 focus-visible:text-blue-600 after:absolute after:inset-0 after:content-[''] after:z-0">
            {p.name}
          </Link>
        </h3>
        <RatingChip value={p.ratingAvg} count={p.ratingCount} />
        <div className="mt-auto pt-1">
          <Price pricePaise={p.pricePaise} mrpPaise={p.mrpPaise} discountPct={p.discountPct} size="sm" />
          <p className="mt-1 truncate text-xs text-muted">
            {p.store ? `Sold by ${p.store.name}` : ''}
            {p.lowStock && <span className="ml-1 font-medium text-warning">· Only a few left</span>}
          </p>
        </div>
      </div>
    </article>
  );
}
