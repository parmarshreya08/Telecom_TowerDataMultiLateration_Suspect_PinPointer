import { useMemo } from 'react'
import { Radio, MapPin } from 'lucide-react'

/**
 * SuratTowerCoverage — decorative homepage visual that mirrors the live-map
 * tower markers, conveying how many cell sites are indexed across Surat.
 *
 * Purely presentational: positions are deterministic pseudo-random so the
 * scatter looks organic but is stable across renders.
 */

interface TowerDot { x: number; y: number; big: boolean }

// Deterministic PRNG (mulberry32) so the layout never shifts between renders.
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function SuratTowerCoverage({ count = 3046 }: { count?: number }) {
  const dots = useMemo<TowerDot[]>(() => {
    const rand = mulberry32(20260807)
    const out: TowerDot[] = []
    const TOTAL = 96
    for (let i = 0; i < TOTAL; i++) {
      // Cluster toward the centre with a couple of satellites, like real coverage.
      const cluster = rand()
      let cx = 0.5, cy = 0.5, spread = 0.34
      if (cluster > 0.75) { cx = 0.26; cy = 0.3; spread = 0.16 }
      else if (cluster > 0.5) { cx = 0.74; cy = 0.68; spread = 0.16 }

      const angle = rand() * Math.PI * 2
      const radius = Math.sqrt(rand()) * spread
      const x = Math.min(0.97, Math.max(0.03, cx + Math.cos(angle) * radius))
      const y = Math.min(0.95, Math.max(0.05, cy + Math.sin(angle) * radius))
      out.push({ x, y, big: rand() > 0.86 })
    }
    return out
  }, [])

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-slate-800 bg-[#070e1c]">
      {/* Faint grid */}
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px), linear-gradient(to right, rgba(59,130,246,0.5) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
        }}
        aria-hidden="true"
      />

      {/* Schematic river + roads for a map-like feel */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-5 70 C 20 62, 32 78, 55 66 S 85 74, 108 60" fill="none" stroke="rgba(56,189,248,0.28)" strokeWidth="1.6" />
        <path d="M-5 30 C 25 34, 40 20, 60 30 S 88 24, 108 34" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
        <path d="M30 -5 C 36 30, 28 60, 42 105" fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="1" />
        <path d="M72 -5 C 66 35, 78 65, 70 105" fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="1" />
      </svg>

      {/* Tower markers */}
      {dots.map((d, i) => (
        <span
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[3px] border border-white/80 bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.7)]"
          style={{
            left: `${d.x * 100}%`,
            top: `${d.y * 100}%`,
            width: d.big ? 12 : 9,
            height: d.big ? 12 : 9,
          }}
        >
          <span className="absolute inset-0 flex items-center justify-center text-[6px] font-bold text-white">▲</span>
        </span>
      ))}

      {/* Central coverage pulse */}
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-400/40" />
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-400/50" />
      <span className="absolute left-1/2 top-1/2 flex h-3 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <span className="absolute h-6 w-6 animate-ping rounded-full bg-red-500/40" />
        <span className="h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
      </span>

      {/* Overlay: count */}
      <div className="absolute left-3 top-3 rounded-lg border border-slate-700/70 bg-slate-950/80 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <Radio className="h-3 w-3 text-blue-400" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
            Cell Sites Indexed
          </span>
        </div>
        <div className="font-mono text-xl font-black leading-tight text-white">
          {count.toLocaleString()}
        </div>
      </div>

      {/* Overlay: operators */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
        {['Airtel', 'Jio', 'Vi', 'BSNL'].map((op) => (
          <span
            key={op}
            className="rounded border border-slate-700/70 bg-slate-950/80 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-slate-300 backdrop-blur-sm"
          >
            {op}
          </span>
        ))}
      </div>

      {/* Overlay: location */}
      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-slate-700/70 bg-slate-950/80 px-2.5 py-1.5 font-mono text-[10px] text-emerald-400 backdrop-blur-sm">
        <MapPin className="h-3 w-3" />
        SURAT · GUJARAT
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg border border-slate-700/70 bg-slate-950/80 px-2.5 py-1.5 backdrop-blur-sm">
        <span className="h-2.5 w-2.5 rounded-[2px] border border-white/80 bg-blue-500" />
        <span className="font-mono text-[9px] text-slate-300">Tower node</span>
      </div>
    </div>
  )
}
