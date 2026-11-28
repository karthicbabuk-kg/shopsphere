import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PageMeta } from '@shopsphere/shared-types';
import { api, unwrap } from '../../services/api';
import { toast } from '../../store/toast';
import { useAuth } from '../../store/auth';

export interface ProductCard {
  id: string;
  name: string;
  slug: string;
  brand: { name: string; slug: string } | null;
  store: { name: string; slug: string } | null;
  pricePaise: number;
  mrpPaise: number;
  discountPct: number;
  ratingAvg: number;
  ratingCount: number;
  image: string | null;
  hoverImage: string | null;
  inStock: boolean;
  lowStock: boolean;
}

export interface HomeData {
  categories: { name: string; slug: string; productCount: number; children: { name: string; slug: string }[] }[];
  trending: ProductCard[];
  bestSellers: ProductCard[];
  newArrivals: ProductCard[];
  offers: ProductCard[];
  recommended: ProductCard[];
  sellers: { name: string; slug: string; logoUrl: string | null; description: string | null; city: string | null; state: string | null; productCount: number }[];
}

export const useHome = () =>
  useQuery({ queryKey: ['storefront', 'home'], staleTime: 60_000, queryFn: () => unwrap<HomeData>(api.get('/storefront/home')) });

export interface Coupon {
  code: string;
  description: string | null;
  type: 'PERCENT' | 'FLAT';
  value: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
}
export const useCoupons = () =>
  useQuery({
    queryKey: ['coupons'],
    staleTime: 5 * 60_000,
    queryFn: () => unwrap<{ coupons: Coupon[] }>(api.get('/coupons/active')).then((r) => r.coupons),
  });

export interface ListParams {
  q?: string;
  category?: string;
  store?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  inStock?: boolean;
  sort?: string;
  page?: number;
}

export interface Facets {
  brands: { slug: string; name: string; count: number }[];
  price: { minPaise: number; maxPaise: number } | null;
  subcategories: { slug: string; name: string }[];
}

export const useProductList = (p: ListParams) =>
  useQuery({
    queryKey: ['storefront', 'list', p],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await api.get('/products', { params: { ...p, facets: true, pageSize: 12 } });
      const body = res.data as {
        data: { items: ProductCard[]; facets: Facets; category: { name: string; slug: string; parent: { name: string; slug: string } | null } | null };
        meta: PageMeta;
      };
      return { ...body.data, meta: body.meta };
    },
  });

export interface Suggestions {
  products: { name: string; slug: string; pricePaise: number; image: string | null }[];
  categories: { name: string; slug: string }[];
  brands: { name: string; slug: string }[];
}
export const useSuggestions = (q: string) =>
  useQuery({
    queryKey: ['storefront', 'suggest', q],
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
    queryFn: () => unwrap<Suggestions>(api.get('/products/suggest', { params: { q } })),
  });

export interface ProductVariant {
  id: string;
  sku: string;
  label: string;
  options: Record<string, string>;
  pricePaise: number;
  mrpPaise: number;
  discountPct: number;
  inStock: boolean;
  leftCount: number | null;
  maxQty: number;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  pricePaise: number;
  mrpPaise: number;
  discountPct: number;
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  brand: { name: string; slug: string } | null;
  category: { name: string; slug: string; parent: { name: string; slug: string } | null };
  images: { url: string; position: number }[];
  attributes: { key: string; value: string }[];
  variants: ProductVariant[];
  seller: { store: { name: string; slug: string; logoUrl: string | null; description: string | null; city: string | null; state: string | null } | null; productCount: number; memberSince: string };
  reviewSummary: { average: number; count: number; distribution: { star: number; count: number }[] };
  related: ProductCard[];
}

/**
 * Public reads are cached for 30 s by the browser. After the buyer changes something that is shown on
 * those pages (their own review), a version param makes the next refetch skip the cached copy.
 */
let cacheVersion = 0;
export const bustPublicCache = () => {
  cacheVersion += 1;
};

export const productQueryOptions = (slug: string) => ({
  queryKey: ['storefront', 'product', slug] as const,
  queryFn: () => unwrap<{ product: ProductDetail }>(api.get(`/products/${slug}`, { params: { _v: cacheVersion || undefined } })).then((r) => r.product),
  retry: (count: number, error: unknown) => count < 1 && (error as { code?: string }).code !== 'NOT_FOUND',
  // Recently fetched (for example by a hover prefetch) counts as fresh, so opening the page is instant.
  staleTime: 30_000,
});

export const useProduct = (slug: string) => useQuery(productQueryOptions(slug));

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: string;
  author: string;
}
export const useReviews = (slug: string, sort: string, page: number) =>
  useQuery({
    queryKey: ['storefront', 'reviews', slug, sort, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await api.get(`/products/${slug}/reviews`, { params: { sort, page, pageSize: 5, _v: cacheVersion || undefined } });
      const body = res.data as { data: { items: Review[] }; meta: PageMeta };
      return { items: body.data.items, meta: body.meta };
    },
  });

// ───────── Cart ─────────

export interface CartLine {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  label: string;
  sku: string;
  image: string | null;
  unitPricePaise: number;
  mrpPaise: number;
  quantity: number;
  lineTotalPaise: number;
  available: number;
  maxQty: number;
  issue: 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'INSUFFICIENT' | null;
}

export interface Cart {
  groups: {
    sellerId: string;
    store: { name: string; slug: string } | null;
    items: CartLine[];
    subtotalPaise: number;
    deliveryPaise: number;
    freeDelivery: boolean;
    remainingForFreePaise: number;
  }[];
  totals: { itemCount: number; subtotalPaise: number; mrpTotalPaise: number; savingsPaise: number; deliveryPaise: number; taxIncludedPaise: number; grandTotalPaise: number };
  itemCount: number;
  hasIssues: boolean;
  canCheckout: boolean;
  minOrderPaise: number;
  freeDeliveryThresholdPaise: number;
}

const isBuyer = () => useAuth.getState().user?.role === 'BUYER';

export const useCart = () => {
  const buyer = useAuth((s) => s.user?.role === 'BUYER');
  return useQuery({ queryKey: ['cart'], enabled: buyer, queryFn: () => unwrap<Cart>(api.get('/cart')) });
};

export function useCartMutations() {
  const qc = useQueryClient();
  const set = (cart: Cart) => qc.setQueryData(['cart'], cart);
  return {
    add: useMutation({
      mutationFn: ({ variantId, quantity }: { variantId: string; quantity: number }) => unwrap<Cart>(api.post('/cart/items', { variantId, quantity })),
      onSuccess: set,
      onError: (e: Error) => toast.error(e.message),
    }),
    update: useMutation({
      mutationFn: ({ id, quantity }: { id: string; quantity: number }) => unwrap<Cart>(api.patch(`/cart/items/${id}`, { quantity })),
      onSuccess: set,
      onError: (e: Error) => {
        toast.error(e.message);
        void qc.invalidateQueries({ queryKey: ['cart'] });
      },
    }),
    remove: useMutation({
      mutationFn: (id: string) => unwrap<Cart>(api.delete(`/cart/items/${id}`)),
      onSuccess: set,
      onError: (e: Error) => toast.error(e.message),
    }),
  };
}

// ───────── Wishlist ─────────

interface WishlistData {
  items: ProductCard[];
  ids: string[];
}

export const useWishlist = () => {
  const buyer = useAuth((s) => s.user?.role === 'BUYER');
  return useQuery({ queryKey: ['wishlist'], enabled: buyer, queryFn: () => unwrap<WishlistData>(api.get('/wishlist')) });
};

export function useWishlistToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => unwrap<WishlistData>(on ? api.post(`/wishlist/${id}`) : api.delete(`/wishlist/${id}`)),
    // Optimistic: the heart flips instantly and rolls back if the request fails.
    onMutate: async ({ id, on }) => {
      await qc.cancelQueries({ queryKey: ['wishlist'] });
      const prev = qc.getQueryData<WishlistData>(['wishlist']);
      if (prev) qc.setQueryData<WishlistData>(['wishlist'], { ...prev, ids: on ? [...prev.ids, id] : prev.ids.filter((x) => x !== id) });
      return { prev };
    },
    onSuccess: (data, { on }) => {
      qc.setQueryData(['wishlist'], data);
      toast.success(on ? 'Saved to your wishlist' : 'Removed from your wishlist');
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['wishlist'], ctx.prev);
      toast.error(e.message);
    },
  });
}

export { isBuyer };
