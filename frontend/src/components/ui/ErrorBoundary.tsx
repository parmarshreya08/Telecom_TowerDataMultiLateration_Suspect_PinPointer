import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Custom fallback UI. If omitted the default error card is shown. */
  fallback?: ReactNode
  /** Override the default error heading text. */
  label?: string
}

interface State {
  hasError: boolean
  message:  string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? 'An unexpected error occurred.' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-danger/20 bg-danger/5 p-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10">
            <AlertTriangle className="h-5 w-5 text-danger" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">
              {this.props.label ?? 'Something went wrong'}
            </p>
            <p className="mt-1 max-w-xs text-xs text-surface-500 dark:text-surface-400">
              {this.state.message}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
