import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State { return { error } }

  componentDidCatch(error: Error, info: any) {
    console.error('[NovaPOS Error]', error, info)
    // Log to electron-log via IPC
    try { window.api.settings.logError?.(`${error.message}\n${error.stack}`) } catch {}
  }

  render() {
    if (!this.state.error) return this.props.children
    const msg = this.state.error.message

    // User-friendly messages for known errors
    const friendlyMessage = msg.includes('database is locked')
      ? 'The database is temporarily busy. Please try again.'
      : msg.includes('no such column')
      ? 'A database update is needed. Please restart the app.'
      : msg.includes('UNIQUE constraint')
      ? 'This record already exists.'
      : msg.includes('NOT NULL constraint')
      ? 'A required field is missing.'
      : msg.includes('FOREIGN KEY constraint')
      ? 'This item is used elsewhere and cannot be deleted.'
      : 'An unexpected error occurred.'

    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500"/>
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Something went wrong</h2>
        <p className="text-slate-500 text-sm max-w-sm mb-6">{friendlyMessage}</p>
        <button onClick={() => this.setState({ error: null })}
          className="btn-primary flex items-center gap-2">
          <RefreshCw className="w-4 h-4"/> Try Again
        </button>
        <details className="mt-4 text-left max-w-sm">
          <summary className="text-xs text-slate-400 cursor-pointer">Technical details</summary>
          <pre className="text-xs text-slate-400 mt-2 bg-slate-50 p-3 rounded-lg overflow-auto max-h-32">{msg}</pre>
        </details>
      </div>
    )
  }
}
