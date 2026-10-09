import { WifiOff, RefreshCw } from 'lucide-react'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus()

  if (isOnline) return null

  return (
    <aside
      aria-label="Offline network notice"
      className="bg-amber-600/90 dark:bg-amber-700/90 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-lg backdrop-blur-sm sticky top-0 z-[9999] animate-in fade-in slide-in-from-top duration-300"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-200 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-100"></span>
        </span>
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>
          <strong>Offline Mode Active:</strong> Operating from local database. All cached cases, maps, and multilateration engines remain operational.
        </span>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1 rounded bg-white/20 hover:bg-white/30 px-2 py-0.5 text-[11px] font-bold text-white transition-colors"
        title="Check connection"
      >
        <RefreshCw className="h-3 w-3" /> Reconnect
      </button>
    </aside>
  )
}
