import { Component, type ReactNode } from 'react'

/**
 * Last line of defence: without it, any error while rendering unmounts the
 * whole app and leaves a blank page. Shows a plain message and a reload.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err: unknown) { console.error(err) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper p-6">
        <div className="max-w-sm rounded-lg border border-line bg-surface p-6 text-center">
          <p className="font-semibold text-ink">This page didn’t load properly</p>
          <p className="mt-2 text-sm text-muted">The portal may have just been updated. Reloading usually fixes it.</p>
          <button className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
