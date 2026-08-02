import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Shield, MapPin, Radio, FileSearch, ChevronRight,
  Cpu, Database, BarChart3, ArrowRight,
  CheckCircle, Zap, LayoutDashboard,
} from 'lucide-react'
import { useThemeContext } from '@/contexts/ThemeContext'
import { useAuthContext } from '@/contexts/AuthContext'
import { Sun, Moon } from 'lucide-react'

const FEATURES = [
  { icon: FileSearch, title: 'CDR Ingestion',        desc: 'Automatic operator detection for Airtel, Jio, Vi, and BSNL CDR files.' },
  { icon: Radio,      title: 'Tower Detection',       desc: 'Heuristic classification engine identifies cell tower clusters.' },
  { icon: MapPin,     title: 'Trilateration',         desc: 'Geometric multilateration computes suspect position from 3+ towers.' },
  { icon: Cpu,        title: 'Kalman Filtering',      desc: 'State estimation smooths noisy location tracks in real-time.' },
  { icon: BarChart3,  title: 'Heatmap Generation',    desc: 'GeoJSON heatmaps visualize suspect movement density.' },
  { icon: Database,   title: 'Secure Persistence',    desc: 'PostgreSQL backend with SHA-256 deduplication and audit logs.' },
]

const PIPELINE_STEPS = [
  'Officer Login',
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
  { label: 'React 18',    color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  { label: 'TypeScript',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { label: 'Pydantic v2', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  { label: 'Socket.io',   color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  { label: 'Leaflet',     color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useThemeContext()
  const { isAuthenticated, officer, logout } = useAuthContext()

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 text-surface-900 dark:text-surface-100">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-surface-200 bg-white/80 backdrop-blur dark:border-surface-800 dark:bg-surface-900/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-bold tracking-wide">E-RAKSHAK</span>
              <span className="ml-2 hidden text-xs text-surface-400 sm:inline">
                Telecom Investigation Platform
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {isAuthenticated ? (
              /* ── Logged-in nav ── */
              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-surface-500 sm:block">
                  {officer?.name?.split(' ')[0]}
                </span>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="btn btn-md btn-primary text-sm"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </button>
                <button
                  onClick={logout}
                  className="btn btn-md btn-secondary text-sm"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              /* ── Guest nav ── */
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="btn btn-md btn-secondary text-sm"
                >
                  Sign In
                </button>
                <button
                  onClick={() => navigate('/register')}
                  className="btn btn-md btn-primary text-sm"
                >
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-950 to-surface-900 py-24 text-white">
        <div className="absolute inset-0 bg-grid-pattern opacity-30" />
        {/* Glow effect */}
        <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-600/10 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary-700 bg-primary-900/50 px-4 py-1.5 text-xs text-primary-300">
              <Zap className="h-3 w-3" />
              <span>Built for E-Rakshak Hackathon · Surat City Police</span>
            </div>
            <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Telecom CDR<br />
              <span className="text-primary-400">Investigation Platform</span>
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-surface-300">
              A professional forensic intelligence system for law enforcement. Upload CDR files,
              identify cell towers, and pinpoint suspect locations through trilateration and Kalman
              filtering — all from a secure, enterprise-grade dashboard.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              {isAuthenticated ? (
                <>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="btn btn-lg bg-primary-600 text-white hover:bg-primary-500 shadow-glow-primary"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Go to Dashboard
                  </button>
                  <button
                    onClick={() => navigate('/investigations/new')}
                    className="btn btn-lg border border-surface-600 text-surface-200 hover:bg-surface-800"
                  >
                    New Investigation <ArrowRight className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/register')}
                    className="btn btn-lg bg-primary-600 text-white hover:bg-primary-500 shadow-glow-primary"
                  >
                    Get Started <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => navigate('/login')}
                    className="btn btn-lg border border-surface-600 text-surface-200 hover:bg-surface-800"
                  >
                    Sign In
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <p className="section-label mb-2">Platform Features</p>
            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
              End-to-End Investigation Pipeline
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <motion.div
                key={title}
                className="card-hover p-5"
                whileHover={{ y: -2 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-1.5 text-sm font-semibold text-surface-900 dark:text-surface-100">{title}</h3>
                <p className="text-xs leading-relaxed text-surface-500 dark:text-surface-400">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Workflow ── */}
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
                  <ChevronRight className="h-4 w-4 text-surface-300 dark:text-surface-600" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech Stack ── */}
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

      {/* ── About ── */}
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
                    <CheckCircle className="h-4 w-4 shrink-0 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-surface-200 bg-white p-6 dark:border-surface-700 dark:bg-surface-800">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600">
                  <Shield className="h-5 w-5 text-white" />
                </div>
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
                    <span className="text-xs text-surface-500">{label}</span>
                    <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 px-6 bg-primary-600 text-white">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-3 text-2xl font-bold">Ready to Start an Investigation?</h2>
          <p className="mb-7 text-primary-200 text-sm">
            {isAuthenticated
              ? 'You are signed in. Head to the dashboard to manage your cases.'
              : 'Register your department account and begin uploading CDR files immediately.'
            }
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {isAuthenticated ? (
              <>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="btn btn-lg bg-white text-primary-700 hover:bg-primary-50"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Open Dashboard
                </button>
                <button
                  onClick={() => navigate('/investigations/new')}
                  className="btn btn-lg border border-primary-400 text-white hover:bg-primary-700"
                >
                  New Investigation
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate('/register')}
                  className="btn btn-lg bg-white text-primary-700 hover:bg-primary-50"
                >
                  Create Account
                </button>
                <button
                  onClick={() => navigate('/login')}
                  className="btn btn-lg border border-primary-400 text-white hover:bg-primary-700"
                >
                  Officer Login
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-surface-200 bg-white py-8 px-6 dark:border-surface-800 dark:bg-surface-900">
        <div className="mx-auto max-w-7xl flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-surface-500">
            <Shield className="h-4 w-4 text-primary-600" />
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
