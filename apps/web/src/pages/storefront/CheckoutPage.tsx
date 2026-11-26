import { Link, Navigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import { useCart } from '../../features/storefront/storeApi';
import { formatINR } from '../../utils/format';

/**
 * Temporary page: the address, delivery and payment steps are built in Phase 8.
 * It already validates the cart server-side so the hand-off is real.
 */
export function CheckoutPage() {
  const { data: cart, isLoading } = useCart();
  if (isLoading || !cart) return <div className="mx-auto max-w-[720px] px-4 py-12"><Skeleton variant="rounded" height={200} /></div>;
  if (!cart.canCheckout) return <Navigate to="/cart" replace />;
  return (
    <div className="mx-auto max-w-[720px] px-4 py-12">
      <h1 className="text-3xl">Checkout</h1>
      <Alert severity="info" sx={{ mt: 3 }}>
        Your cart of {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'} totalling <strong>{formatINR(cart.totals.grandTotalPaise)}</strong> is valid and ready. Address, delivery, coupon and demo payment steps arrive in the next build phase.
      </Alert>
      <Link to="/cart" className="mt-6 inline-block font-bold text-blue-600">Back to cart</Link>
    </div>
  );
}
