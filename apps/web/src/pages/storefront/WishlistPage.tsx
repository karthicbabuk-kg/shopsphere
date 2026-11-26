import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import { EmptyState } from '../../components/EmptyState';
import { ProductCard, ProductCardSkeleton } from '../../components/store/ProductCard';
import { useWishlist } from '../../features/storefront/storeApi';

export function WishlistPage() {
  const { data, isLoading, isError } = useWishlist();
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <h1 className="text-3xl">My wishlist {data && <span className="font-sans text-lg font-normal text-muted">({data.items.length})</span>}</h1>
      {isError ? (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-800">Could not load your wishlist.</p>
      ) : isLoading ? (
        <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <li key={i}><ProductCardSkeleton /></li>)}</ul>
      ) : data && data.items.length === 0 ? (
        <div className="mt-6"><EmptyState title="Nothing saved yet" message="Tap the heart on any product to save it here for later." action={<Button component={Link} to="/" variant="contained">Discover products</Button>} /></div>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
          {data?.items.map((p) => <li key={p.id}><ProductCard p={p} /></li>)}
        </ul>
      )}
    </div>
  );
}
