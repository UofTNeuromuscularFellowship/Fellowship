import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import './index.css'
import { AppErrorBoundary } from './components/AppErrorBoundary'

// After a new deploy, a tab opened earlier still asks for the old page files
// (Atlas3D-<oldhash>.js), which no longer exist. Reload once to pick up the
// new ones, rather than leaving a blank page. The timestamp stops a loop if
// the file is missing for some other reason; the error boundary takes it then.
window.addEventListener('vite:preloadError', (e) => {
  let last = 0
  try { last = Number(sessionStorage.getItem('nmf-chunk-reload') || 0) } catch { /* private mode */ }
  if (Date.now() - last < 30_000) return
  try { sessionStorage.setItem('nmf-chunk-reload', String(Date.now())) } catch { /* private mode */ }
  e.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
)
