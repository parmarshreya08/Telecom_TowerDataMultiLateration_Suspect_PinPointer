import { useState, useEffect } from 'react'
import { Copy, ExternalLink, Check, MapPin, AlertCircle, RefreshCw, QrCode } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { buildGoogleMapsUrl, copyToClipboard } from '@/utils'

interface ShareLocationModalProps {
  open: boolean
  onClose: () => void
  latitude?: number | null
  longitude?: number | null
  loading?: boolean
}

function isValidCoordinate(lat?: number | null, lng?: number | null): lat is number {
  if (lat == null || lng == null) return false
  if (typeof lat !== 'number' || typeof lng !== 'number') return false
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false
  if (lat < -90 || lat > 90) return false
  if (lng < -180 || lng > 180) return false
  return true
}

export function ShareLocationModal({
  open,
  onClose,
  latitude,
  longitude,
  loading = false,
}: ShareLocationModalProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [qrError, setQrError] = useState(false)

  const hasValidCoords = isValidCoordinate(latitude, longitude)
  const mapsUrl = hasValidCoords ? buildGoogleMapsUrl(latitude, longitude!) : ''
  const coordsText = hasValidCoords ? `${latitude.toFixed(6)}, ${longitude!.toFixed(6)}` : ''

  // Reset states on open or location change
  useEffect(() => {
    if (open) {
      setCopied(null)
      setQrError(false)
    }
  }, [open, latitude, longitude])

  const handleCopy = async (text: string, key: string) => {
    if (!text) return
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Share Suspect Location" size="sm">
      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 text-primary-500 animate-spin mb-2" />
            <p className="text-xs text-surface-600 dark:text-surface-300">Generating location link...</p>
          </div>
        ) : !hasValidCoords ? (
          <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 p-6 text-center dark:border-surface-700 dark:bg-surface-800/50">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-1">
              No suspect location available yet
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400 max-w-xs mx-auto">
              Run the multilateration engine to generate a suspect location before sharing.
            </p>
          </div>
        ) : (
          <>
            {/* Top Coordinate Badge */}
            <div className="flex items-center gap-2.5 rounded-lg bg-primary-50 border border-primary-100 dark:bg-primary-950/40 dark:border-primary-900/60 px-4 py-3">
              <MapPin className="h-4 w-4 text-primary-600 dark:text-primary-400 shrink-0" />
              <span className="text-sm font-mono font-bold text-primary-900 dark:text-primary-200">
                📍 {coordsText}
              </span>
            </div>

            {/* Coordinates Row */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-850 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-2xs font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500">Coordinates</p>
                <p className="text-xs font-mono font-medium text-surface-800 dark:text-surface-200 select-all">{coordsText}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(coordsText, 'coords')}
                className="shrink-0 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-surface-600 hover:bg-surface-100 hover:text-primary-600 dark:text-surface-300 dark:hover:bg-surface-700 dark:hover:text-primary-400 transition-colors cursor-pointer border border-surface-200 dark:border-surface-700"
                aria-label="Copy Coordinates"
                title="Copy Coordinates"
              >
                {copied === 'coords' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-2xs text-green-500 font-semibold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="text-2xs">Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Google Maps Link Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-2xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
                  Google Maps Link
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(mapsUrl, 'url')}
                  className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 cursor-pointer"
                >
                  {copied === 'url' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-green-500">Copied Link</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative rounded-lg border border-surface-200 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-850">
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs font-mono font-medium text-primary-600 dark:text-primary-400 hover:underline break-all select-all leading-relaxed"
                >
                  {mapsUrl}
                </a>
              </div>
            </div>

            {/* Direct Open in Google Maps Button */}
            <Button
              variant="primary"
              size="md"
              className="w-full justify-center text-xs sm:text-sm font-semibold shadow-sm"
              icon={<ExternalLink className="h-4 w-4" />}
              onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
            >
              Open in Google Maps
            </Button>

            {/* QR Code Section */}
            <div className="rounded-lg border border-surface-200 dark:border-surface-700 p-3 text-center bg-surface-50/50 dark:bg-surface-800/30">
              <p className="text-xs font-semibold text-surface-600 dark:text-surface-300 mb-2">
                QR Code — Scan to Open
              </p>
              <div className="flex items-center justify-center rounded-lg bg-white p-2 min-h-[140px] shadow-xs">
                {!qrError ? (
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(mapsUrl)}`}
                    alt={`QR code linking to suspect location at ${coordsText}`}
                    width={140}
                    height={140}
                    loading="lazy"
                    onError={() => setQrError(true)}
                    className="rounded"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 text-xs text-surface-400">
                    <QrCode className="h-8 w-8 text-surface-300 dark:text-surface-600 mb-1" />
                    <span>QR preview unavailable offline</span>
                  </div>
                )}
              </div>
              <p className="text-2xs text-surface-400 dark:text-surface-500 mt-2">
                Scan with any camera or QR scanner to navigate directly on Google Maps
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
