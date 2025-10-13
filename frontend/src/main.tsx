// frontend/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { WalletProvider } from './context/WalletContext';
import { AppRouter } from './Router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <WalletProvider>
          <AppRouter />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.96)',
                color: '#0b1b3b',
                border: '1px solid rgba(11,27,59,0.08)',
                boxShadow: '0 10px 24px rgba(11,27,59,0.10)',
              },
              success: { iconTheme: { primary: '#14b8a6', secondary: '#fff' } },
              error: { iconTheme: { primary: '#b91c1c', secondary: '#fff' } },
            }}
          />
        </WalletProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);