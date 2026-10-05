import { useState } from 'react'
import { Activity, ShieldAlert, Cpu, Lock, Unlock } from 'lucide-react'
import axios from 'axios'

export function SdrEngineTester({ isDark }: { isDark: boolean }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<any>(null)

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    try {
      const response = await axios.post('/api/v1/sdr/analyze', {
        frequency_band: 'LTE1800',
        sample_rate_mhz: 20.0,
        capture_duration_sec: 5
      })
      setAnalysisResult(response.data)
    } catch (e) {
      console.error(e)
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="w-full">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 dark:border-purple-900/60 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 px-4 py-1.5 text-xs font-semibold mb-4">
          <Activity className="h-3.5 w-3.5" />
          <span>INTERACTIVE PLAYGROUND</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 dark:text-white tracking-tight mb-3">
          SDR Protocol Decoder
        </h2>
        <p className="text-sm sm:text-base text-surface-600 dark:text-slate-300">
          Capture and analyze over-the-air baseband signals. Demodulate GSM/LTE control channels to extract unencrypted IMSIs and paging requests.
        </p>
      </div>

      <div className="max-w-4xl mx-auto bg-white dark:bg-[#081223] rounded-2xl border border-surface-200 dark:border-surface-800 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row-reverse gap-6 items-center">
          
          <div className="flex-1 space-y-4 w-full">
            <div className="bg-surface-50 dark:bg-surface-900/50 p-4 rounded-xl border border-surface-100 dark:border-surface-800/80">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-purple-500" /> Radio Configuration
              </h3>
              <div className="text-xs text-surface-600 dark:text-surface-400 space-y-1">
                <p>Band: <span className="font-mono text-surface-900 dark:text-white">LTE1800 (Band 3)</span></p>
                <p>Center Freq: <span className="font-mono text-surface-900 dark:text-white">1810.0 MHz</span></p>
                <p>Sample Rate: <span className="font-mono text-surface-900 dark:text-white">20.0 MS/s</span></p>
              </div>
            </div>
            
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="w-full py-3 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <Activity className="h-4 w-4 animate-spin" /> Demodulating Signal...
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4" /> Start Capture & Decode
                </>
              )}
            </button>
          </div>

          <div className="flex-[1.5] w-full min-h-[250px] rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-100 dark:bg-surface-900 overflow-hidden relative flex flex-col font-mono text-xs">
            {/* Fake Spectrum visualizer top bar */}
            <div className="h-24 w-full border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-[#050b14] relative overflow-hidden flex items-end">
              {!isAnalyzing && !analysisResult && (
                <div className="w-full text-center text-surface-400 pb-8">NO SIGNAL DETECTED</div>
              )}
              {(isAnalyzing || analysisResult) && (
                <div className="flex items-end h-full w-full opacity-60">
                  {/* Fake bars */}
                  {Array.from({length: 40}).map((_, i) => (
                    <div 
                      key={i} 
                      className="flex-1 bg-purple-500 mx-[1px]" 
                      style={{ 
                        height: isAnalyzing ? `${Math.random() * 80 + 10}%` : `${Math.sin(i/3) * 30 + 40}%`,
                        transition: 'height 0.1s ease'
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Logs area */}
            <div className="flex-1 p-4 overflow-y-auto bg-black text-green-400">
              {!analysisResult && !isAnalyzing && (
                <div className="text-surface-500 text-center mt-4">AWAITING CAPTURE INITIALIZATION</div>
              )}
              {isAnalyzing && (
                <div className="space-y-1 opacity-70">
                  <div>&gt; INIT SDR DEVICE... OK</div>
                  <div>&gt; TUNING TO 1810.0 MHz... OK</div>
                  <div>&gt; CAPTURING BASEBAND (20 MS/s)...</div>
                  <div className="animate-pulse">&gt; DEMODULATING OFDMA CARRIERS...</div>
                </div>
              )}
              {analysisResult && !isAnalyzing && (
                <div className="space-y-2">
                  <div>&gt; CAPTURE COMPLETE (ID: {analysisResult.analysis_id})</div>
                  <div>&gt; PEAK SIGNAL: {analysisResult.peak_signal_dbm} dBm</div>
                  <div className="my-2 border-b border-green-800 border-dashed"></div>
                  {analysisResult.decodes.map((dec: any, i: number) => (
                    <div key={i} className="mb-2">
                      <div className="text-white flex justify-between">
                        <span>[{dec.protocol}] DECODE:</span>
                        <span className="flex items-center gap-1">
                          {dec.encryption_type.includes('Null') ? <Unlock className="h-3 w-3 text-red-400"/> : <Lock className="h-3 w-3"/>} 
                          {dec.encryption_type}
                        </span>
                      </div>
                      <div className="pl-4">&gt; Messages: {dec.messages_decoded} parsed</div>
                      {dec.target_imsi_found && (
                        <div className="pl-4 text-red-400 flex items-center gap-2">
                          <ShieldAlert className="h-3 w-3" />
                          <span>TARGET IMSI EXPOSED: {dec.target_imsi_found}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}
