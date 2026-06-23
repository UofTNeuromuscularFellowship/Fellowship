import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TeachingSchedule from './pages/TeachingSchedule'
import ClinicRotations from './pages/ClinicRotations'
import Cases from './pages/Cases'
import Competency from './pages/Competency'
import Handbook from './pages/Handbook'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell><Dashboard /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/teaching"
        element={
          <ProtectedRoute>
            <AppShell><TeachingSchedule /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clinic"
        element={
          <ProtectedRoute>
            <AppShell><ClinicRotations /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cases"
        element={
          <ProtectedRoute allow={['fellow', 'supervisor', 'director']}>
            <AppShell><Cases /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/competency"
        element={
          <ProtectedRoute allow={['fellow', 'director', 'admin']}>
            <AppShell><Competency /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/handbook"
        element={
          <ProtectedRoute>
            <AppShell><Handbook /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
