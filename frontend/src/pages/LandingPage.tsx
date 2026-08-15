/**
 * LandingPage — E-RAKSHAK public landing page.
 *
 * Routes used (all pre-existing — none created):
 *  - /dashboard          — "Get Started" (same as original Dashboard button)
 *  - /login              — "Sign In"
 *  - /investigations/new — "New Investigation"
 */

import { lazy, Suspense } from 'react'
import { useNavigate }    from 'react-router-dom'
import { motion }         from 'motion/react'
import {
  MapPin, Radio, FileSearch, ChevronRight,
  Cpu, Database, BarChart3, ArrowRight,
  CheckCircle, Zap, LogIn, PlayCircle,
  Sun, Moon,
} from 'lucide-react'
import { useThemeContext } from '@/hooks/useThemeContext'
import { Logo }            from '@/components/ui/Logo'

// TechBackground: full-canvas atmospheric Three.js scene — lazy-loaded so
// Three.js (~500 kB) doesn't block the initial page paint.
const TechBackground = lazy(() =>
  import('@/components/landing/TechBackground').then((m) => ({ default: m.TechBackground }))
)

// ---------------------------------------------------------------------------
// Static data (unchanged from original)
// ---------------------------------------------------------------------------

const FEATURES = [
  { icon: FileSearch, title: 'Multi-Tower CDR Ingestion', desc: 'Ingest historical telecom logs containing CGI, sector, timing, and location observations for the target.' },
  { icon: Radio,      title: 'Adjacent Tower Intelligence', desc: 'Resolve relevant cell towers and their geographical information to build multi-tower observation sets.' },
  { icon: MapPin,     title: 'Multi-Tower Trilateration', desc: 'Combine overlapping tower signal regions to estimate a refined probable suspect location.' },
  { icon: Cpu,        title: 'Kalman Movement Filtering', desc: 'Smooth sequential location estimates and reduce deviation across the suspect\'s movement path.' },
  { icon: BarChart3,  title: 'Probability Heatmap', desc: 'Visualize probable suspect zones and narrow the search from a broad radius toward block/street level.' },
  { icon: Database,   title: 'Auditable Investigation Data', desc: 'Maintain timestamped investigation data, fixes, traces, and analysis results for case workflows.' },
]

const PIPELINE_STEPS = [
  'Upload CDR File',
  'Select Time Range',
  'Validation & Parsing',
  'Tower Identification',
  'Trilateration',
  'Kalman Filtering',
  'GeoJSON Heatmap',
  'Live Tracking',
  'Export Report',
]

const STACK = [
  { label: 'FastAPI',     color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { label: 'PostgreSQL',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { label: 'Python 3.12', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  { label: 'React 19',    color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  { label: 'TypeScript',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { label: 'Pydantic v2', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  { label: 'Socket.io',   color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  { label: 'Leaflet',     color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useThemeContext()

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 text-surface-900 dark:text-surface-100">

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-surface-200 bg-white/80 backdrop-blur dark:border-surface-800 dark:bg-surface-900/80">
        <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-6">

          {/* Brand */}
          <div className="flex items-center gap-4">
            <Logo size={64} />
            <div>
              <span className="text-xl font-bold tracking-wide">E-RAKSHAK</span>
              <span className="ml-3 hidden text-sm text-surface-400 sm:inline">
                Telecom Investigation Platform
              </span>
            </div>
          </div>

          {/* Nav actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Sign In — uses existing /login route */}
            <button
              onClick={() => navigate('/login')}
              className="hidden sm:inline-flex btn btn-md btn-secondary text-sm"
              aria-label="Sign in to E-RAKSHAK"
            >
              <LogIn className="h-4 w-4" />
              Sign In
            </button>

          </div>
        </div>

        {/* Mobile: Sign In below on xs */}
        <div className="sm:hidden flex items-center justify-end gap-2 px-6 pb-2">
          <button
            onClick={() => navigate('/login')}
            className="btn btn-sm btn-secondary text-xs"
            aria-label="Sign in to E-RAKSHAK"
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign In
          </button>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden text-white"
        style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #060d1a 0%, #0c1a33 55%, #07111f 100%)' }}
        aria-label="Hero section"
      >
        {/* ── Three.js atmospheric background — full canvas, pointer-events:none ── */}
        {/* Occupies the entire hero, sits behind all content.                       */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 0 }}
          aria-hidden="true"
        >
          <Suspense fallback={null}>
            <TechBackground className="w-full h-full" />
          </Suspense>
        </div>

        {/* Dark gradient overlay — keeps text readable regardless of animation    */}
        {/* Stronger on the left where content lives, lighter on the right.        */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: [
              'linear-gradient(to right, rgba(6,13,26,0.90) 0%, rgba(6,13,26,0.70) 50%, rgba(6,13,26,0.30) 100%)',
              'linear-gradient(to bottom, rgba(6,13,26,0.20) 0%, transparent 30%, transparent 70%, rgba(6,13,26,0.40) 100%)',
            ].join(', '),
            zIndex: 1,
          }}
          aria-hidden="true"
        />

        {/* Faint grid — very low opacity so it doesn't fight the Three.js scene   */}
        <div
          className="absolute inset-0 bg-grid-pattern pointer-events-none"
          style={{ opacity: 0.07, zIndex: 2 }}
          aria-hidden="true"
        />

        {/* Left-side radial glow — anchors the content area visually              */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '5%', top: '30%',
            width: 600, height: 600,
            transform: 'translate(-20%, -50%)',
            background: 'radial-gradient(circle, rgba(37,99,235,0.10) 0%, transparent 65%)',
            zIndex: 2,
          }}
          aria-hidden="true"
        />

        {/* ── Hero content ─────────────────────────────────────────────────── */}
        <div
          className="relative mx-auto max-w-7xl px-6 py-28 lg:py-36 flex items-center min-h-screen"
          style={{ zIndex: 3 }}
        >
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              {/* Badge */}
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary-700/50 bg-primary-950/60 px-4 py-1.5 text-xs text-primary-300 backdrop-blur-sm">
                <Zap className="h-3 w-3" aria-hidden="true" />
                <span>ERH26_PS_09 · Telecom &amp; Security Systems</span>
              </div>

              {/* Headline */}
              <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                From Tower Signals<br />
                <span
                  style={{
                    background: 'linear-gradient(95deg, #93c5fd 0%, #38bdf8 55%, #60a5fa 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  to a Precise Suspect Pin
                </span>
              </h1>

              {/* Sub-headline */}
              <p className="mb-9 max-w-lg text-base leading-relaxed text-slate-300 sm:text-lg">
                Refine coarse telecom location data using multi-tower trilateration, Kalman filtering, and probability heatmaps.
              </p>

              {/* Trust signals */}
              <div className="mb-10 flex flex-wrap items-center gap-x-7 gap-y-2 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                  Multi-Tower Analysis
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400" aria-hidden="true" />
                  Trilateration + Kalman
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400" aria-hidden="true" />
                  Probability Heatmaps
                </span>
              </div>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-4 mt-8">
                <button
                  onClick={() => navigate('/login')}
                  className="btn btn-lg w-full sm:w-64 text-base justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: 'white',
                    boxShadow: '0 0 24px rgba(37,99,235,0.35)',
                  }}
                  aria-label="Sign in to E-RAKSHAK"
                >
                  <LogIn className="h-5 w-5 mr-2" aria-hidden="true" />
                  Sign In
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Problem & Solution ────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white dark:bg-surface-900 border-y border-surface-200 dark:border-surface-800">
        <div className="mx-auto max-w-5xl">
          <motion.div
            className="mb-14 text-center max-w-3xl mx-auto"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold text-surface-900 dark:text-surface-100 mb-4">
              From a Broad Radius to an Actionable Search Zone
            </h2>
            <p className="text-base text-surface-600 dark:text-surface-400 leading-relaxed">
              Single-tower location records can leave investigators with a large operational radius. E-Rakshak combines multiple tower observations and sequential filtering to narrow that uncertainty into a confidence-aware search zone.
            </p>
          </motion.div>

          <div className="grid gap-10 md:grid-cols-3 text-center">
            {/* The Challenge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400 mb-5">
                <Radio className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100 mb-2">The Challenge</h3>
              <p className="text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
                Single-tower data can leave officers searching across a broad radius.
              </p>
            </motion.div>
            
            {/* The Solution */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 mb-5">
                <Cpu className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100 mb-2">The Solution</h3>
              <p className="text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
                Combine multiple tower observations to narrow the probable location.
              </p>
            </motion.div>

            {/* The Result */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 mb-5">
                <MapPin className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100 mb-2">The Result</h3>
              <p className="text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
                Generate a confidence-aware location estimate, heatmap, and movement trace.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Platform Features ────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="mx-auto max-w-6xl">
          <motion.div
            className="mb-12 text-center"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="section-label mb-2">Platform Features</p>
            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
              From Telecom Signals to a High-Precision Search Zone
            </h2>
            <p className="mt-3 text-surface-600 dark:text-surface-400">
              An end-to-end multi-tower localization workflow.
            </p>
          </motion.div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={title}
                className="card-hover p-5 group"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                whileHover={{ y: -3 }}
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 group-hover:bg-primary-200 dark:group-hover:bg-primary-900/50 transition-colors">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mb-1.5 text-sm font-semibold text-surface-900 dark:text-surface-100">{title}</h3>
                <p className="text-xs leading-relaxed text-surface-500 dark:text-surface-400">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Workflow ─────────────────────────────────────────────────────── */}
      <section className="bg-surface-100 py-20 px-6 dark:bg-surface-900">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <p className="section-label mb-2">Investigation Workflow</p>
            <h2 className="text-2xl font-bold">How It Works</h2>
          </div>
          <div className="flex flex-wrap items-start justify-center gap-2">
            {PIPELINE_STEPS.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-card dark:bg-surface-800">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-2xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="text-xs font-medium text-surface-700 dark:text-surface-300">{step}</span>
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-surface-300 dark:text-surface-600" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech Stack ───────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="mx-auto max-w-4xl text-center">
          <p className="section-label mb-2">Technology Stack</p>
          <h2 className="mb-8 text-2xl font-bold">Built with Production-Grade Tech</h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {STACK.map(({ label, color }) => (
              <span key={label} className={`rounded-full px-4 py-1.5 text-sm font-medium ${color}`}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── About ────────────────────────────────────────────────────────── */}
      <section className="bg-surface-100 py-20 px-6 dark:bg-surface-900">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-12 md:grid-cols-2 items-center">
            <div>
              <p className="section-label mb-2">About the Platform</p>
              <h2 className="mb-4 text-2xl font-bold">Designed for Law Enforcement</h2>
              <p className="mb-5 text-sm leading-relaxed text-surface-500 dark:text-surface-400">
                E-Rakshak was developed for the Surat City Police Cyber Crime Cell as part of the
                E-Rakshak Hackathon organized by NEXUS and SVNIT Surat. The platform standardizes
                heterogeneous telecom data from multiple operators into a unified intelligence format.
              </p>
              <ul className="space-y-3">
                {[
                  'Supports Airtel, Jio, Vi, and BSNL CDR formats',
                  'SHA-256 deduplication prevents duplicate uploads',
                  'Quality scoring ensures data integrity',
                  'Fully audited with structured logging',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
                    <CheckCircle className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-surface-200 bg-white p-6 dark:border-surface-700 dark:bg-surface-800">
              <div className="flex items-center gap-3 mb-5">
                <Logo size={40} />
                <div>
                  <p className="font-semibold text-surface-900 dark:text-surface-100">E-Rakshak</p>
                  <p className="text-xs text-surface-400">Telecom Investigation Platform v1.0</p>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'CDR Operators Supported',  value: '4' },
                  { label: 'Localization Algorithms',  value: '3' },
                  { label: 'Export Formats',           value: '5' },
                  { label: 'API Endpoints',            value: '2 (expandable)' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between border-b border-surface-100 pb-3 last:border-0 last:pb-0 dark:border-surface-700">
                    <span className="text-xs text-surface-500 dark:text-surface-400">{label}</span>
                    <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* ── CTA banner ───────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-primary-600 text-white">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-3 text-2xl font-bold">Ready to Start an Investigation?</h2>
          <p className="mb-7 text-primary-200 text-sm">
            Sign in to access the dashboard and upload CDR files.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => navigate('/login')}
              className="btn btn-lg bg-white text-primary-700 hover:bg-primary-50 dark:bg-surface-100 dark:text-primary-800 dark:hover:bg-surface-200"
              aria-label="Sign in"
            >
              <LogIn className="h-5 w-5" aria-hidden="true" />
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-surface-200 bg-white py-8 px-6 dark:border-surface-800 dark:bg-surface-900">
        <div className="mx-auto max-w-7xl flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-surface-500 dark:text-surface-400">
            <Logo size={16} aria-hidden="true" />
            <span>E-Rakshak · Surat City Police · Cyber Crime Cell</span>
          </div>
          <p className="text-xs text-surface-400">
            For authorized law enforcement use only. All data is protected.
          </p>
        </div>
      </footer>

    </div>
  )
}
