import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Armchair, BadgeCheck, Check, Copy, Dumbbell, Smartphone, Cpu, Shirt, CookingPot, ShieldCheck, Sparkles, Store, Tag,
  Truck, Undo2, Watch, type LucideIcon,
} from 'lucide-react';
import Button from '@mui/material/Button';
import { emailSchema } from '@shopsphere/shared-validation';
import { HeroCarousel } from '../../components/store/HeroCarousel';
import { ProductRail } from '../../components/store/ProductRail';
import { useCoupons, useHome, type Coupon } from '../../features/storefront/storeApi';
import { toast } from '../../store/toast';
import { formatINRWhole } from '../../utils/format';

const CATEGORY_ICON: Record<string, LucideIcon> = {
  electronics: Cpu,
  mobiles: Smartphone,
  fashion: Shirt,
  'home-appliances': CookingPot,
  furniture: Armchair,
  beauty: Sparkles,
  sports: Dumbbell,
  accessories: Watch,
};

function CouponCard({ c }: { c: Coupon }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.code);
      setCopied(true);
      toast.success(`Code ${c.code} copied. Apply it at checkout.`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info(`Your code is ${c.code}`);
    }
  };
  return (
    <li className="flex items-center gap-4 rounded-lg border border-dashed border-saffron-700/50 bg-amber-50 p-4">
      <Tag className="hidden shrink-0 text-saffron-700 sm:block" size={22} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-base font-medium tracking-wider">{c.code}</p>
        <p className="text-sm text-muted">{c.description}</p>
        {c.minOrderPaise > 0 && <p className="mt-0.5 text-xs text-faint">Min. order {formatINRWhole(c.minOrderPaise)}</p>}
      </div>
      <Button size="small" variant="outlined" color="inherit" onClick={() => void copy()} startIcon={copied ? <Check size={16} /> : <Copy size={16} />} aria-label={`Copy code ${c.code}`}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </li>
  );
}

function Newsletter() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <section aria-labelledby="newsletter-heading" className="my-10 rounded-xl bg-zone p-8 md:p-10">
      <div className="mx-auto grid max-w-[900px] items-center gap-6 md:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 id="newsletter-heading" className="text-2xl">Get deals in your inbox</h2>
          <p className="mt-1 text-sm text-muted">Demo form: your address is validated but never stored or emailed.</p>
        </div>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const r = emailSchema.safeParse(email);
            if (!r.success) return setError('Enter a valid email address');
            setError(null);
            setEmail('');
            toast.success('Thanks for subscribing! (demo: nothing was stored)');
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <div className="flex-1">
            <label htmlFor="newsletter-email" className="sr-only">Email address</label>
            <input
              id="newsletter-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'newsletter-error' : undefined}
              placeholder="you@example.com"
              className="h-12 w-full rounded-xl border border-line bg-white px-4 text-sm outline-none focus:border-blue-600"
            />
            {error && <p id="newsletter-error" className="mt-1 text-sm text-danger">{error}</p>}
          </div>
          <Button type="submit" variant="contained" size="large" sx={{ height: 48 }}>Subscribe</Button>
        </form>
      </div>
    </section>
  );
}

export function HomePage() {
  const { data: home, isLoading, isError } = useHome();
  const { data: coupons } = useCoupons();

  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-5">
      <HeroCarousel home={home} />

      {isError && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          We could not load the store right now. If the server was asleep, please refresh in a few seconds.
        </p>
      )}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Why shop with us">
        {[
          { icon: Truck, title: 'Free delivery', text: 'On every seller order above ₹499' },
          { icon: Undo2, title: 'Easy returns', text: 'Request a return within 7 days' },
          { icon: ShieldCheck, title: 'Secure demo payments', text: 'UPI, card and cash on delivery (simulated)' },
          { icon: BadgeCheck, title: 'Verified sellers', text: 'Every store is reviewed by an admin' },
        ].map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3 rounded-lg border border-line bg-white p-4">
            <Icon size={22} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
            <span><span className="block text-sm font-bold">{title}</span><span className="block text-xs text-muted">{text}</span></span>
          </li>
        ))}
      </ul>

      <section aria-labelledby="cats-heading" className="pt-10">
        <h2 id="cats-heading" className="text-2xl">Shop by category</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(home?.categories ?? Array.from({ length: 8 }, () => null)).map((c, i) => {
            const Icon = (c && CATEGORY_ICON[c.slug]) || Store;
            return c ? (
              <li key={c.slug}>
                <Link to={`/c/${c.slug}`} className="group flex items-center gap-3 rounded-lg border border-line bg-white p-4 transition-shadow hover:shadow-e2">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white"><Icon size={24} aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{c.name}</span>
                    <span className="block font-mono text-xs text-muted">{c.productCount} products</span>
                  </span>
                </Link>
              </li>
            ) : (
              <li key={i} className="h-20 animate-pulse rounded-lg bg-zone" aria-hidden="true" />
            );
          })}
        </ul>
      </section>

      <ProductRail title="Trending now" subtitle="What buyers are adding to carts this week" items={home?.trending} loading={isLoading} to="/search?sort=popular" />

      {coupons && coupons.length > 0 && (
        <section aria-labelledby="offers-heading" className="py-4">
          <h2 id="offers-heading" className="text-2xl">Offers for you</h2>
          <ul className="mt-4 grid gap-3 lg:grid-cols-3">{coupons.map((c) => <CouponCard key={c.code} c={c} />)}</ul>
        </section>
      )}

      <ProductRail title="Best sellers" subtitle="Top-rated and most purchased" items={home?.bestSellers} loading={isLoading} to="/search?sort=popular" />
      <ProductRail title="Special offers" subtitle="Biggest discounts right now" items={home?.offers} loading={isLoading} />
      <ProductRail title="New arrivals" subtitle="Just listed by our sellers" items={home?.newArrivals} loading={isLoading} to="/search?sort=newest" />
      <ProductRail title="Recommended for you" subtitle="Highly rated by other shoppers" items={home?.recommended} loading={isLoading} to="/search?sort=rating" />

      {home && home.sellers.length > 0 && (
        <section aria-labelledby="sellers-heading" className="py-8">
          <h2 id="sellers-heading" className="text-2xl">Featured stores</h2>
          <p className="mt-0.5 text-sm text-muted">Independent sellers approved by our team</p>
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {home.sellers.map((s) => (
              <li key={s.slug}>
                <Link to={`/search?store=${s.slug}`} className="flex h-full items-start gap-4 rounded-lg border border-line bg-white p-5 transition-shadow hover:shadow-e2">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-navy-700 text-xl font-bold text-white" aria-hidden="true">{s.name.charAt(0)}</span>
                  <span className="min-w-0">
                    <span className="block text-lg font-bold">{s.name}</span>
                    <span className="block text-sm text-muted">{s.description}</span>
                    <span className="mt-2 block font-mono text-xs text-muted">{[s.city, s.state].filter(Boolean).join(', ')} · {s.productCount} products</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Newsletter />
    </div>
  );
}
