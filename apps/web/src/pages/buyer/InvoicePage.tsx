import { Link, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import { InvoiceView } from '../../features/orders/InvoiceView';
import { useOrder } from '../../features/orders/ordersApi';

export function BuyerInvoicePage() {
  const { id = '', sid = '' } = useParams();
  const { data: o, isLoading, isError } = useOrder(id);
  const s = o?.shipments.find((x) => x.id === sid);
  if (isLoading) return <p className="p-10 text-center text-muted">Loading invoice…</p>;
  if (isError || !o || !s) {
    return <div className="mx-auto max-w-[520px] p-10"><Alert severity="error">Invoice not found.</Alert><Link to="/account/orders" className="mt-4 inline-block font-medium text-blue-600">My orders</Link></div>;
  }
  return <InvoiceView shipment={s} orderNo={o.orderNo} placedAt={o.placedAt} address={o.address} payment={o.payment} backTo={`/account/orders/${o.id}`} />;
}
