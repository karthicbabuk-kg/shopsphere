import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import { api, unwrap } from '../../services/api';

interface SellerProfile {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  businessName: string;
  rejectionReason: string | null;
  store: { name: string } | null;
}

const MESSAGES = {
  PENDING: {
    severity: 'info',
    text: 'Your application is under review. You can publish products once an administrator approves it.',
  },
  APPROVED: { severity: 'success', text: 'Your store is approved. Product tools arrive in the next phase.' },
  REJECTED: { severity: 'error', text: 'Your application was not approved.' },
  SUSPENDED: { severity: 'warning', text: 'Your store is suspended. Contact the platform administrator.' },
} as const;

export function SellerHomePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['seller', 'me'],
    queryFn: () => unwrap<{ seller: SellerProfile }>(api.get('/sellers/me')).then((r) => r.seller),
  });

  if (isLoading) return <Skeleton variant="rounded" height={120} className="mt-4" />;
  if (isError || !data) return <Alert severity="error">Could not load your seller profile.</Alert>;
  const m = MESSAGES[data.status];

  return (
    <>
      <h1 className="mt-2 text-4xl">{data.store?.name ?? data.businessName}</h1>
      <p className="mt-1 text-muted">{data.businessName}</p>
      <Alert severity={m.severity} className="mt-6">
        <strong className="font-mono text-xs tracking-wider uppercase">{data.status}</strong>
        <div>
          {m.text}
          {data.status === 'REJECTED' && data.rejectionReason ? ` Reason: ${data.rejectionReason}` : ''}
        </div>
      </Alert>
    </>
  );
}
