import { useState } from 'react'
import { Radio, ScanSearch, MapPin, AlertTriangle, CheckCircle2 } from 'lucide-react'
import axios from 'axios'

export function BtsDetectorTester({ isDark }: { isDark: boolean }) {
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)

  const handleScan = async () => {
    setIsScanning(true)
    try {
      const response = await axios.post('/api/v1/bts/scan', {
        latitude: 21.1702,
        longitude: 72.8311,
        radius_meters: 1000,
        scan_duration_sec: 2
      })
      setScanResult(response.data)
    } catch (e) {
      console.error('BTS scan failed:', e)
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="w-full">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-4 py-1.5 text-xs font-semibold mb-4">
          <ScanSearch className="h-3.5 w-3.5" />
          <span>INTERACTIVE PLAYGROUND</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 dark:text-white tracking-tight mb-3">
          BTS Rogue Tower & IMSI Catcher Sentinel
        </h2>
        <p className="text-sm sm:text-base text-surface-600 dark:text-slate-300">
          Run an environmental RF scan to cross-reference broadcast Cell-IDs against the authorized operator catalog, identifying potential IMSI Catchers or unregistered Rogue Base Stations.
        </p>
      </div>

      <div className="max-w-4xl mx-auto bg-white dark:bg-[#081223] rounded-2xl border border-surface-200 dark:border-surface-800 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row gap-6 items-center">
          
          <div className="flex-1 space-y-4 w-full">
            <div className="bg-surface-50 dark:bg-surface-900/50 p-4 rounded-xl border border-surface-100 dark:border-surface-800/80">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-amber-500" /> Target Zone
              </h3>
              <div className="text-xs text-surface-600 dark:text-surface-400 space-y-1">
                <p>Latitude: <span className="font-mono text-surface-900 dark:text-white">21.1702° N</span></p>
                <p>Longitude: <span className="font-mono text-surface-900 dark:text-white">72.8311° E</span></p>
                <p>Radius: <span className="font-mono text-surface-900 dark:text-white">1,000 meters</span></p>
              </div>
            </div>
            
            <button
              onClick={handleScan}
              disabled={isScanning}
              className="w-full py-3 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isScanning ? (
                <>
                  <ScanSearch className="h-4 w-4 animate-spin" /> Scanning Environment...
                </>
              ) : (
                <>
                  <Radio className="h-4 w-4" /> Initialize BTS Sweep
                </>
              )}
            </button>
          </div>

          <div className="flex-[1.5] w-full min-h-[250px] rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-100 dark:bg-surface-900 overflow-hidden relative">
            {!scanResult && !isScanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-surface-400">
                <Radio className="h-10 w-10 mb-2 opacity-50" />
                <p className="text-sm font-medium">Ready for Spectral Sweep</p>
              </div>
            )}
            
            {isScanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="relative w-32 h-32">
                  <div className="absolute inset-0 border-2 border-amber-500 rounded-full animate-ping opacity-20"></div>
                  <div className="absolute inset-4 border-2 border-amber-500 rounded-full animate-ping opacity-40" style={{ animationDelay: '0.2s' }}></div>
                  <div className="absolute inset-0 flex items-center justify-center text-amber-500">
                    <ScanSearch className="h-8 w-8 animate-pulse" />
                  </div>
                </div>
              </div>
            )}

            {scanResult && !isScanning && (
              <div className="p-4 h-full overflow-y-auto">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-surface-200 dark:border-surface-800">
                  <span className="font-bold text-sm">Sweep Results</span>
                  <span className="text-xs px-2 py-1 bg-surface-200 dark:bg-surface-800 rounded-md">
                    Found: {scanResult.towers_detected} Towers ({scanResult.rogue_towers_found} Rogue)
                  </span>
                </div>

                <div className="space-y-3">
                  {scanResult.towers.map((tower: any, i: number) => (
                    <div key={i} className={`p-3 rounded-lg border ${tower.is_rogue ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {tower.is_rogue ? (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          )}
                          <span className="font-mono text-xs font-bold">{tower.cgi}</span>
                        </div>
                        <span className="text-[10px] text-surface-500">{tower.signal_strength} dBm</span>
                      </div>
                      
                      {tower.is_rogue && (
                        <div className="mt-2 text-[10px] text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-2 py-1 rounded">
                          <strong>WARNING:</strong> {tower.anomaly_reason} (Confidence: {tower.confidence_score}%)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  )
}
