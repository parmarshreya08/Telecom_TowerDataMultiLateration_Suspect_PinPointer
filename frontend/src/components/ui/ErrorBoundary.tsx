import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}
interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex h-full w-full flex-col items-center justify-center bg-surface-100 p-6 text-center dark:bg-surface-950">
          <p className="text-sm font-semibold text-surface-700 dark:text-surface-200">Map failed to render</p>
          <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">An unexpected error occurred.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-3 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}