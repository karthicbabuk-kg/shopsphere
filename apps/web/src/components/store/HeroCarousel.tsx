import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import Skeleton from '@mui/material/Skeleton';
import type { HomeData } from '../../features/storefront/storeApi';
import { cdn } from '../../utils/cdn';
import { formatINRWhole } from '../../utils/format';

interface Slide {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  to: string;
  items: HomeData['trending'];
}

/** Hero banner built from live catalogue data so it can never point at a missing product. */
/** True when the visitor asked the OS to reduce motion; the slideshow then neither animates nor auto-advances. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

export function HeroCarousel({ home }: { home?: HomeData }) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);

  const slides: Slide[] = home
    ? [
        {
          eyebrow: 'Deals of the season',
          title: home.offers[0] ? `Up to ${Math.max(...home.offers.map((o) => o.discountPct))}% off` : 'Great prices every day',
          body: 'The biggest markdowns across electronics, fashion, home and more, from verified sellers.',
          cta: 'Shop deals under ₹1,500',
          to: '/search?maxPrice=150000&sort=popular',
          items: home.offers.slice(0, 3),
        },
        {
          eyebrow: 'Just landed',
          title: 'New arrivals this week',
          body: 'Fresh listings from independent Indian sellers, added in the last few days.',
          cta: 'Explore new arrivals',
          to: '/search?sort=newest',
          items: home.newArrivals.slice(0, 3),
        },
        {
          eyebrow: 'Customer favourites',
          title: 'Loved by thousands of buyers',
          body: 'Top-rated products with great reviews. Free delivery on every seller order above ₹499.',
          cta: 'See top rated',
          to: '/search?sort=rating',
          items: home.recommended.slice(0, 3),
        },
      ].filter((s) => s.items.length > 0)
    : [];

  const count = slides.length;
  useEffect(() => {
    if (!playing || hovered || reduced || count < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 6500);
    return () => clearInterval(t);
  }, [playing, hovered, reduced, count]);

  if (!home) return <Skeleton variant="rounded" sx={{ height: { xs: 420, md: 380 }, borderRadius: 3 }} />;
  if (count === 0) return null;
  const slide = slides[index % count]!;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured offers"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className="relative overflow-hidden rounded-xl bg-navy-700 text-white"
      style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.09) 1.2px, transparent 1.6px)', backgroundSize: '26px 26px' }}
    >
      {/* Keyed so each slide remounts and plays the CSS fade-in (no animation library needed). */}
      <div
          key={index}
          role="group"
          aria-roledescription="slide"
          aria-label={`${(index % count) + 1} of ${count}`}
          className="slide-in grid min-h-[420px] items-center gap-8 px-6 py-10 md:min-h-[380px] md:grid-cols-[1.05fr_1fr] md:px-12"
        >
          <div>
            <p className="inline-flex items-center gap-2 font-mono text-xs tracking-wider text-saffron-500 uppercase">
              <span className="h-2.5 w-2.5 rounded-full bg-saffron-500 ring-4 ring-saffron-500/25" aria-hidden="true" />
              {slide.eyebrow}
            </p>
            <h2 className="mt-4 text-4xl leading-[1.05] sm:text-5xl">{slide.title}</h2>
            <p className="mt-4 max-w-[46ch] text-base text-white/80">{slide.body}</p>
            <Link to={slide.to} className="mt-7 inline-flex h-12 items-center rounded-xl bg-saffron-500 px-7 font-bold text-ink transition-colors hover:bg-amber-400">
              {slide.cta}
            </Link>
          </div>

          <ul className="grid grid-cols-3 gap-3 md:gap-4">
            {slide.items.map((p, i) => (
              <li key={p.id} className={i === 1 ? 'md:-translate-y-4' : ''}>
                <Link to={`/p/${p.slug}`} className="block overflow-hidden rounded-lg bg-white text-ink shadow-e2 transition-transform hover:-translate-y-1">
                  <img src={cdn(p.image, 300)} alt="" width={300} height={300} loading={index === 0 ? 'eager' : 'lazy'} className="aspect-square w-full object-cover" />
                  <span className="block px-2.5 py-2">
                    <span className="line-clamp-1 text-xs font-medium">{p.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs font-bold">
                      {formatINRWhole(p.pricePaise)}
                      {p.discountPct > 0 && <span className="text-success">-{p.discountPct}%</span>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

      {count > 1 && (
        <div className="absolute right-4 bottom-4 flex items-center gap-2 md:right-8">
          <div className="flex" role="group" aria-label="Choose slide">
            {slides.map((s, i) => (
              <button
                key={s.eyebrow}
                type="button"
                aria-label={`Show slide ${i + 1}: ${s.eyebrow}`}
                aria-current={i === index % count}
                onClick={() => setIndex(i)}
                className="group grid h-6 min-w-6 place-items-center"
              >
                {/* The visible dot stays small; the button around it is a 24px-tall touch target. */}
                <span className={`block h-2.5 rounded-full transition-all ${i === index % count ? 'w-7 bg-saffron-500' : 'w-2.5 bg-white/40 group-hover:bg-white/70'}`} />
              </button>
            ))}
          </div>
          <button type="button" aria-label="Previous slide" onClick={() => setIndex((i) => (i - 1 + count) % count)} className="grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25"><ChevronLeft size={18} /></button>
          <button type="button" aria-label="Next slide" onClick={() => setIndex((i) => (i + 1) % count)} className="grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25"><ChevronRight size={18} /></button>
          {!reduced && (
            <button type="button" aria-label={playing ? 'Pause slideshow' : 'Play slideshow'} onClick={() => setPlaying((p) => !p)} className="grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25">
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
