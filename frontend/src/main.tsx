// frontend/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WalletProvider } from './context/WalletContext'
import AppRouter from './Router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 20_000,   // keep fresh briefly
      gcTime: 5 * 60_000,  // lightweight cache
    },
    mutations: {
      retry: 0,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <AppRouter />
      </WalletProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
