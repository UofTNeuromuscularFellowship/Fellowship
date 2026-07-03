import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'
import Landing from './pages/Landing'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import Dashboard from './pages/Dashboard'
import TeachingSchedule from './pages/TeachingSchedule'
import ClinicRotations from './pages/ClinicRotations'
import Cases from './pages/Cases'
import Competency from './pages/Competency'
import Handbook from './pages/Handbook'
import People from './pages/People'
import MyTeaching from './pages/MyTeaching'
import RateTeaching from './pages/RateTeaching'
import Vacation from './pages/Vacation'
import Evaluations from './pages/Evaluations'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

function Shell({ children, allow }: { children: React.ReactNode; allow?: ('fellow' | 'supervisor' | 'director' | 'admin')[] }) {
  return (
    <ProtectedRoute allow={allow}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute skipPasswordGate>
            <ChangePassword />
          </ProtectedRoute>
        }
      />
      <Route path="/dashboard" element={<Shell><Dashboard /></Shell>} />
      <Route path="/teaching" element={<Shell><TeachingSchedule /></Shell>} />
      <Route path="/clinic" element={<Shell><ClinicRotations /></Shell>} />
      <Route path="/cases" element={<Shell allow={['fellow', 'supervisor', 'director']}><Cases /></Shell>} />
      <Route path="/competency" element={<Shell allow={['fellow', 'director', 'admin']}><Competency /></Shell>} />
      <Route path="/handbook" element={<Shell><Handbook /></Shell>} />
      <Route path="/people" element={<Shell allow={['director', 'admin']}><People /></Shell>} />
      <Route path="/my-teaching" element={<Shell allow={['supervisor', 'director']}><MyTeaching /></Shell>} />
      <Route path="/rate-teaching" element={<Shell allow={['fellow']}><RateTeaching /></Shell>} />
      <Route path="/vacation" element={<Shell allow={['fellow', 'director']}><Vacation /></Shell>} />
      <Route path="/evaluations" element={<Shell allow={['fellow', 'supervisor', 'director']}><Evaluations /></Shell>} />
      <Route path="/settings" element={<Shell allow={['director']}><Settings /></Shell>} />
      {/* Legacy path redirects */}
      <Route path="/home" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
