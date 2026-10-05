import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import App from './App'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import './styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

// ponytail: StrictMode double-mounts MapContainer; react-leaflet v5 reuses the removed
// map instance on re-mount, so map.setView/panTo throw on a dead map and blank the page.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary label="E-Rakshak failed to start">
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </ErrorBoundary>,
)
