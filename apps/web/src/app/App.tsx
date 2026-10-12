import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { router } from '@/routes';
import { AppProviders } from './providers';

export function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <RouterProvider router={router} />
        {/*
          Spec mandates bottom-right toasts (FL 2.5-02, FL 3.3-01/02).

          `richColors` is deliberately OFF. Its palette fails WCAG AA — the
          success toast measured 3.49:1, caught by the real-browser axe run —
          and overriding sonner's CSS variables did not fully take, because it
          derives further colours from them. Styling the toast directly with our
          own tokens is both accessible and one palette instead of two.
        */}
        <Toaster
          position="bottom-right"
          closeButton
          toastOptions={{
            classNames: {
              toast: 'rounded-card border border-line bg-surface shadow-popover',
              title: 'text-ink-900 font-semibold',
              description: 'text-ink-700',
              success: 'border-success/40 [&_[data-icon]]:text-success',
              error: 'border-danger/40 [&_[data-icon]]:text-danger',
              warning: 'border-warning/40 [&_[data-icon]]:text-warning',
              info: 'border-info/40 [&_[data-icon]]:text-info',
            },
          }}
        />
      </AppProviders>
    </ErrorBoundary>
  );
}
