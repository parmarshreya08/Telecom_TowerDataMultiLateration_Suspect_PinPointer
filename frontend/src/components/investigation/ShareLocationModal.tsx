import { useState } from 'react'
import { Copy, ExternalLink, Check, MapPin } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { buildGoogleMapsUrl, formatCoordinate, copyToClipboard } from '@/utils'

interface ShareLocationModalProps {
  open: boolean
  onClose: () => void
  latitude: number
  longitude: number
}

export function ShareLocationModal({ open, onClose, latitude, longitude }: ShareLocationModalProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const mapsUrl = buildGoogleMapsUrl(latitude, longitude)
  const coords  = `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`

  const handleCopy = async (text: string, key: string) => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Share Suspect Location" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg bg-surface-50 dark:bg-surface-800 px-4 py-3">
          <MapPin className="h-4 w-4 text-primary-600 shrink-0" />
          <span className="text-sm font-mono text-surface-800 dark:text-surface-200">{coords}</span>
        </div>

        <div className="space-y-2">
          <CopyRow
            label="Coordinates"
            value={coords}
            copied={copied === 'coords'}
            onCopy={() => handleCopy(coords, 'coords')}
          />
          <CopyRow
            label="Google Maps URL"
            value={mapsUrl}
            copied={copied === 'url'}
            onCopy={() => handleCopy(mapsUrl, 'url')}
          />
        </div>

        <Button
          variant="outline"
          size="md"
          className="w-full"
          icon={<ExternalLink className="h-4 w-4" />}
          onClick={() => window.open(mapsUrl, '_blank')}
        >
          Open in Google Maps
        </Button>

        <div className="rounded-lg border border-surface-200 dark:border-surface-700 p-3 text-center">
          <p className="text-xs text-surface-400 mb-2">QR Code</p>
          <div className="flex items-center justify-center h-32 bg-surface-50 dark:bg-surface-800 rounded">
            <p className="text-xs text-surface-400">
              {/* TODO: Integrate qrcode.react once backend is connected */}
              QR Code placeholder
            </p>
          </div>
          <p className="text-2xs text-surface-400 mt-2">Scan to open suspect location on Google Maps</p>
        </div>
      </div>
    </Modal>
  )
}

function CopyRow({ label, value, copied, onCopy }: {
  label: string; value: string; copied: boolean; onCopy: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-2xs text-surface-400">{label}</p>
        <p className="text-xs text-surface-700 dark:text-surface-300 truncate">{value}</p>
      </div>
      <button
        onClick={onCopy}
        className="shrink-0 text-surface-400 hover:text-primary-600 transition-colors"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}
