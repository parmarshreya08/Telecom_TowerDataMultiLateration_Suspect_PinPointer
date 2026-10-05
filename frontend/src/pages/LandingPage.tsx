/**
 * LandingPage — E-RAKSHAK public landing page.
 *
 * Includes Hero section, Live Interactive Engine Playground, Problem/Solution,
 * Features, Pipeline Steps, Tech Stack, and Footer.
 */

import { lazy, Suspense, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  MapPin, Radio, FileSearch, ChevronRight,
  Cpu, Database, BarChart3,
  CheckCircle, Zap, LogIn, Sparkles,
  Sun, Moon,
} from 'lucide-react'
import { useThemeContext } from '@/hooks/useThemeContext'
import { Logo } from '@/components/ui/Logo'
import { LiveEngineTester } from '@/components/landing/LiveEngineTester'
import { BtsDetectorTester } from '@/components/landing/BtsDetectorTester'
import { SdrEngineTester } from '@/components/landing/SdrEngineTester'
import { cn } from '@/utils'

// TechBackground: full-canvas atmospheric Three.js scene — lazy-loaded so
// Three.js (~500 kB) doesn't block the initial page paint.
const TechBackground = lazy(() =>
  import('@/components/landing/TechBackground').then((m) => ({ default: m.TechBackground }))
)

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const FEATURES = [
  { icon: FileSearch, title: 'Multi-Tower CDR Ingestion', desc: 'Ingest historical telecom logs containing CGI, sector, timing, and location observations for the target.' },
  { icon: Radio, title: 'Adjacent Tower Intelligence', desc: 'Resolve relevant cell towers and their geographical information to build multi-tower observation sets.' },
  { icon: MapPin, title: 'Multi-Tower Trilateration', desc: 'Combine overlapping tower signal regions to estimate a refined probable suspect location.' },
  { icon: Cpu, title: 'Kalman Movement Filtering', desc: 'Smooth sequential location estimates and reduce deviation across the suspect\'s movement path.' },
  { icon: BarChart3, title: 'Probability Heatmap', desc: 'Visualize probable suspect zones and narrow the search from a broad radius toward block/street level.' },
  { icon: Database, title: 'Auditable Investigation Data', desc: 'Maintain timestamped investigation data, fixes, traces, and analysis results for case workflows.' },
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
  { label: 'FastAPI', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { label: 'PostgreSQL', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { label: 'Python 3.12', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  { label: 'React 19', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  { label: 'TypeScript', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { label: 'Pydantic v2', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  { label: 'Socket.io', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  { label: 'Leaflet', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useThemeContext()

  const handleScrollToEngine = () => {
    const el = document.getElementById('try-engine-section')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const typingPhrases = ['Suspect Pin', 'Search Zone', 'Geo-Fence']
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [typedText, setTypedText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const current = typingPhrases[phraseIndex]
    let timer: ReturnType<typeof setTimeout>
    
    if (isDeleting) {
      timer = setTimeout(() => {
        setTypedText(current.substring(0, typedText.length - 1))
        if (typedText.length === 0) {
          setIsDeleting(false)
          setPhraseIndex((prev) => (prev + 1) % typingPhrases.length)
        }
      }, 50)
    } else {
      timer = setTimeout(() => {
        setTypedText(current.substring(0, typedText.length + 1))
        if (typedText.length === current.length) {
          timer = setTimeout(() => setIsDeleting(true), 2500)
        }
      }, 100)
    }
    
    return () => clearTimeout(timer)
  }, [typedText, isDeleting, phraseIndex])

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 text-surface-900 dark:text-surface-100 transition-colors duration-200">

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-surface-200/80 bg-white/90 backdrop-blur-md dark:border-surface-800/80 dark:bg-[#060e1a]/90 transition-colors duration-200">
        <div className="mx-auto flex h-16 sm:h-18 max-w-7xl items-center justify-between px-6">

          {/* Brand */}
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <span className="text-lg sm:text-xl font-bold tracking-wide text-surface-900 dark:text-white">
                E-RAKSHAK
              </span>
              <span className="ml-3 hidden text-xs sm:text-sm text-surface-500 dark:text-slate-400 md:inline font-normal">
                Telecom Investigation Platform
              </span>
            </div>
          </div>

          {/* Nav actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-surface-500 hover:text-surface-900 hover:bg-surface-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-surface-800/80 transition-colors cursor-pointer"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Try Engine shortcut */}
            <button
              onClick={handleScrollToEngine}
              className="hidden md:inline-flex btn items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800/80 dark:bg-blue-950/60 dark:text-blue-300 transition-colors cursor-pointer select-none"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Try Engine Live
            </button>

            {/* Sign In */}
            <button
              onClick={() => navigate('/login')}
              className="hidden sm:inline-flex btn items-center gap-2 rounded-lg border border-surface-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-surface-700 hover:border-primary-400 hover:text-primary-700 hover:bg-primary-50 hover:shadow-md hover:-translate-y-0.5 dark:border-surface-700/80 dark:bg-surface-800/80 dark:text-surface-200 dark:hover:border-primary-500/60 dark:hover:text-primary-300 dark:hover:bg-primary-900/30 dark:hover:shadow-lg dark:hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] active:shadow-sm select-none cursor-pointer"
              aria-label="Sign in to E-RAKSHAK"
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign In
            </button>
          </div>
        </div>

        {/* Mobile: Sign In & Try Engine on xs */}
        <div className="sm:hidden flex items-center justify-end gap-2 px-6 pb-2">
          <button
            onClick={handleScrollToEngine}
            className="inline-flex btn items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:border-blue-800/80 dark:bg-blue-950/60 dark:text-blue-300 select-none cursor-pointer"
          >
            <Sparkles className="h-3 w-3" />
            Try Engine
          </button>
          <button
            onClick={() => navigate('/login')}
            className="inline-flex btn items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1 text-xs font-semibold text-surface-700 dark:border-surface-700/80 dark:bg-surface-800/80 dark:text-surface-200 select-none cursor-pointer"
            aria-label="Sign in to E-RAKSHAK"
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign In
          </button>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden min-h-[calc(100vh-4.5rem)]"
        aria-label="Hero section"
      >
        <div className="absolute inset-0 hero-bg-layer-dark pointer-events-none" aria-hidden="true" />
        <div className="absolute inset-0 hero-bg-layer-light pointer-events-none" aria-hidden="true" />

        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }} aria-hidden="true">
          <Suspense fallback={null}>
            <TechBackground isDark={isDark} className="w-full h-full" />
          </Suspense>
        </div>

        <div className="absolute inset-0 hero-overlay-dark pointer-events-none" style={{ zIndex: 2 }} aria-hidden="true" />
        <div className="absolute inset-0 hero-overlay-light pointer-events-none" style={{ zIndex: 2 }} aria-hidden="true" />

        <div
          className="absolute inset-0 bg-grid-pattern pointer-events-none opacity-5 dark:opacity-10 transition-opacity duration-300"
          style={{ zIndex: 3 }}
          aria-hidden="true"
        />

        <div
          className="relative mx-auto max-w-7xl px-6 pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-16 sm:pb-20 md:pb-24 lg:pb-28 flex items-center min-h-[calc(100vh-4.5rem)]"
          style={{ zIndex: 4 }}
        >
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center w-full">
            <div className="max-w-2xl">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              >
                {/* Badge */}
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/90 text-blue-700 dark:border-blue-500/30 dark:bg-blue-950/60 dark:text-blue-300 px-4 py-1.5 text-xs font-medium backdrop-blur-md shadow-xs ring-1 ring-blue-500/10 transition-colors duration-300">
                  <Zap className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 transition-colors duration-300" aria-hidden="true" />
                  <span>DOMAIN · Telecom &amp; Security Systems</span>
                </div>

                {/* Headline */}
                <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                  <span className="text-surface-900 dark:text-white transition-colors duration-300">
                    From Tower Signals
                  </span>
                  <br />
                  <span className="hero-gradient-text font-bold tracking-tight">
                    to a Precise {typedText}
                    <span className="animate-pulse opacity-70">|</span>
                  </span>
                </h1>

                {/* Sub-headline */}
                <p className={cn(
                  'mb-8 max-w-lg text-base leading-relaxed sm:text-lg',
                  isDark ? 'text-slate-300' : 'text-surface-600'
                )}>
                  Refine coarse telecom location data using multi-tower trilateration, Kalman filtering, and probability heatmaps.
                </p>

                {/* Trust signals */}
                <div className={cn(
                  'mb-9 flex flex-wrap items-center gap-x-7 gap-y-2 text-xs font-medium',
                  isDark ? 'text-slate-400' : 'text-surface-500'
                )}>
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

                {/* Primary CTAs — Sign In + Try Live Engine */}
                <div className="flex flex-wrap items-center gap-4 mt-6">
                  <button
                    onClick={() => navigate('/login')}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 hover:shadow-xl hover:shadow-blue-600/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] active:shadow-lg shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2.5 text-sm sm:text-base select-none cursor-pointer"
                    aria-label="Sign in to E-RAKSHAK"
                  >
                    <LogIn className="h-4.5 w-4.5" aria-hidden="true" />
                    Sign In
                  </button>

                  <button
                    onClick={handleScrollToEngine}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-blue-700 dark:text-blue-300 bg-blue-50/90 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/80 hover:bg-blue-100 dark:hover:bg-blue-900/60 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 text-sm sm:text-base select-none cursor-pointer"
                  >
                    <Sparkles className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                    Try Live Engine
                  </button>
                </div>
              </motion.div>
            </div>

            {/* Visual Graphic Right Side */}
            <div className="hidden lg:flex justify-center relative w-full h-[400px]">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                className="relative w-full h-full"
              >
                {/* Static Image Placeholder */}
                <div className="absolute inset-0 rounded-2xl border border-white/20 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col">
                  {/* Top Bar */}
                  <div className="h-8 w-full border-b border-white/10 flex items-center px-4 gap-1.5 bg-surface-900/90 backdrop-blur-md z-10 absolute top-0 left-0 right-0">
                    <div className="h-2 w-2 rounded-full bg-red-400"></div>
                    <div className="h-2 w-2 rounded-full bg-amber-400"></div>
                    <div className="h-2 w-2 rounded-full bg-emerald-400"></div>
                    <span className="ml-2 text-[10px] text-surface-400 font-mono tracking-widest">E-RAKSHAK // TACTICAL_VIEW</span>
                  </div>
                  {/* Map Image */}
                  <div className="flex-1 w-full h-full">
                    <img 
                      src="https://images.unsplash.com/photo-1524661135-423995f22d0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" 
                      alt="Tactical Map Placeholder" 
                      className="w-full h-full object-cover"
                    />
                    {/* Overlay gradient to make it look embedded */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#081223] via-transparent to-transparent opacity-80 pointer-events-none"></div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LIVE INTERACTIVE ENGINE PLAYGROUND ──────────────────────────── */}
      <section
        id="try-engine-section"
        className="py-20 px-6 bg-surface-100/70 dark:bg-[#040a14] border-y border-surface-200 dark:border-surface-800/80"
      >
        <div className="mx-auto max-w-7xl flex flex-col gap-24">
          <LiveEngineTester isDark={isDark} />
          
          <div className="w-full h-px bg-surface-200 dark:bg-surface-800/80"></div>
          
          <BtsDetectorTester isDark={isDark} />

          <div className="w-full h-px bg-surface-200 dark:bg-surface-800/80"></div>
          
          <SdrEngineTester isDark={isDark} />
        </div>
      </section>

      {/* ── Problem & Solution ────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800">
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
                className="relative overflow-hidden p-6 rounded-2xl bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 shadow-sm group hover:shadow-lg transition-all duration-300"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                whileHover={{ y: -5 }}
              >
                {/* Glow effect on hover */}
                <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-primary-400/10 blur-2xl group-hover:bg-primary-500/20 transition-colors duration-500"></div>
                <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 rounded-full bg-blue-400/10 blur-2xl group-hover:bg-blue-500/20 transition-colors duration-500"></div>
                
                <div className="relative z-10 mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/60 group-hover:scale-110 transition-all duration-300">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="relative z-10 mb-2 text-base font-bold text-surface-900 dark:text-surface-100 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">{title}</h3>
                <p className="relative z-10 text-sm leading-relaxed text-surface-600 dark:text-surface-400">{desc}</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 relative">
            <div className="hidden lg:block absolute top-1/2 left-0 w-full h-0.5 bg-surface-200 dark:bg-surface-800 -translate-y-1/2 z-0"></div>
            {PIPELINE_STEPS.map((step, i) => (
              <motion.div 
                key={step} 
                className="relative z-10 flex flex-col items-center gap-3 p-4 rounded-xl bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 shadow-sm hover:shadow-md hover:border-primary-400 dark:hover:border-primary-600 transition-all cursor-default group"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300 font-bold group-hover:scale-110 transition-transform">
                  {i + 1}
                </div>
                <span className="text-sm font-semibold text-center text-surface-800 dark:text-surface-200">{step}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech Stack ───────────────────────────────────────────────────── */}
      <section className="py-20 bg-white dark:bg-surface-950 overflow-hidden border-y border-surface-200 dark:border-surface-800">
        <div className="mx-auto max-w-4xl text-center mb-10 px-6">
          <p className="section-label mb-2">Technology Stack</p>
          <h2 className="text-2xl font-bold">Built with Production-Grade Tech</h2>
        </div>
        
        {/* Infinite Scrolling Marquee */}
        <div className="relative w-full flex overflow-x-hidden group">
          <div className="absolute top-0 left-0 bottom-0 w-24 bg-gradient-to-r from-white dark:from-surface-950 to-transparent z-10"></div>
          <div className="absolute top-0 right-0 bottom-0 w-24 bg-gradient-to-l from-white dark:from-surface-950 to-transparent z-10"></div>
          
          <div className="flex w-max min-w-full shrink-0 animate-[marquee_30s_linear_infinite] group-hover:[animation-play-state:paused] gap-4 px-4">
            {[...STACK, ...STACK, ...STACK].map(({ label, color }, i) => (
              <div 
                key={`${label}-${i}`} 
                className={cn(
                  "flex items-center justify-center rounded-2xl px-6 py-4 text-sm font-bold shadow-sm hover:shadow-md transition-shadow cursor-pointer select-none min-w-40 border border-surface-200 dark:border-surface-800",
                  color
                )}
              >
                {label}
              </div>
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
                  { label: 'CDR Operators Supported', value: '4' },
                  { label: 'Localization Algorithms', value: '3' },
                  { label: 'Export Formats', value: '5' },
                  { label: 'API Endpoints', value: '2 (expandable)' },
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
              className="btn btn-lg bg-white text-primary-700 hover:bg-primary-50 dark:bg-surface-100 dark:text-primary-800 dark:hover:bg-surface-200 select-none cursor-pointer"
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

      {/* ── Mobile Sticky FAB ───────────────────────────────────────────────── */}
      <div className="md:hidden fixed bottom-6 right-6 z-50">
        <button
          onClick={handleScrollToEngine}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all"
          aria-label="Try Engine Live"
        >
          <Sparkles className="h-6 w-6 animate-pulse" />
        </button>
      </div>

    </div>
  )
}
