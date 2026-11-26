import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { useToasts } from '../store/toast';

/** Shows the oldest queued toast; announced politely to screen readers via the Alert role. */
export function Toaster() {
  const { toasts, dismiss } = useToasts();
  const current = toasts[0];
  return (
    <Snackbar
      key={current?.id}
      open={!!current}
      autoHideDuration={4000}
      onClose={(_, reason) => reason !== 'clickaway' && current && dismiss(current.id)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      {current ? (
        <Alert
          severity={current.severity}
          variant="filled"
          onClose={() => dismiss(current.id)}
          sx={{ width: '100%' }}
        >
          {current.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
}
