import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { useSlowApi } from '../store/slowApi';

/**
 * The free demo API sleeps when idle and needs up to a minute to wake. Instead of a blank or broken
 * page, say what is happening. It disappears as soon as the slow request finishes.
 */
export function ServerWakeBanner() {
  const slow = useSlowApi((s) => s.slow);
  if (slow === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[2000] flex justify-center px-3">
      <Alert role="status" severity="info" icon={<CircularProgress size={18} />} className="pointer-events-auto max-w-[560px] shadow-lg">
        <strong>The demo server is waking up.</strong> It sleeps when nobody is using it and can take up to a minute to start. Thanks for your patience.
      </Alert>
    </div>
  );
}
