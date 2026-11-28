import './zodConfig'; // must stay first: see the file
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from './app/theme';
import { preloadAllRoutes, preloadForPath, router } from './app/router';
import { AuthBootstrap } from './features/auth/AuthBootstrap';
import { Toaster } from './components/Toaster';
import { ServerWakeBanner } from './components/ServerWakeBanner';
import './index.css';

// Start loading the page behind a link the moment the visitor points at, focuses or touches it, so the click
// that follows is quick. Nothing is fetched at page load, which keeps the first load light.
const intent = (e: Event) => {
  const link = (e.target as Element | null)?.closest?.('a[href]');
  if (link instanceof HTMLAnchorElement && link.origin === window.location.origin) preloadForPath(link.pathname);
};
document.addEventListener('pointerover', intent, { passive: true });
document.addEventListener('focusin', intent);
document.addEventListener('touchstart', intent, { passive: true });
// Backup for visitors who do none of that (for example keyboard users): once, very late and only when idle.
window.addEventListener('load', () => {
  setTimeout(() => ('requestIdleCallback' in window ? window.requestIdleCallback(preloadAllRoutes, { timeout: 5000 }) : preloadAllRoutes()), 10_000);
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        <QueryClientProvider client={queryClient}>
          <AuthBootstrap>
            <RouterProvider router={router} />
          </AuthBootstrap>
          <Toaster />
            <ServerWakeBanner />
        </QueryClientProvider>
      </ThemeProvider>
    </StyledEngineProvider>
  </StrictMode>,
);
