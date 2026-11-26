import { Link, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import { InvoiceView } from '../../features/orders/InvoiceView';
import { useSellerOrder } from '../../features/orders/ordersApi';

export function SellerInvoicePage() {
  const { id = '' } = useParams();
  const { data: o, isLoading, isError } = useSellerOrder(id);
  if (isLoading) return <p className="p-10 text-center text-muted">Loading invoice…</p>;
  if (isError || !o) return <div className="mx-auto max-w-[520px] p-10"><Alert severity="error">Invoice not found.</Alert><Link to="/seller/orders" className="mt-4 inline-block font-medium text-blue-600">Orders</Link></div>;
  return <InvoiceView shipment={o} orderNo={o.orderNo} placedAt={o.placedAt} address={o.address} payment={o.payment} backTo={`/seller/orders/${o.id}`} />;
}
