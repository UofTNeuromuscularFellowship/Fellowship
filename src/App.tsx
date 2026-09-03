import { lazy, Suspense } from 'react'
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
import Calculators from './pages/Calculators'
import StudyTools from './pages/StudyTools'
import TeachingCases from './pages/TeachingCases'
import Handbook from './pages/Handbook'
import People from './pages/People'
import MyTeaching from './pages/MyTeaching'
import RateTeaching from './pages/RateTeaching'
import Vacation from './pages/Vacation'
import Evaluations from './pages/Evaluations'
import FeedbackReview from './pages/FeedbackReview'
import Library from './pages/Library'
import TestDirectory from './pages/TestDirectory'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

// Code-split: the 3D atlas pulls in three.js, which must not weigh down the
// main portal bundle for the many users who never open it.
const Atlas3D = lazy(() => import('./pages/Atlas3D'))

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>{children}</Suspense>
  )
}

function Shell({ children, allow }: { children: React.ReactNode; allow?: ('fellow' | 'supervisor' | 'director' | 'admin' | 'assistant')[] }) {
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
      {/* Not wrapped in ProtectedRoute: someone arriving from a reset email has
          no session yet — redeeming the token in the page is what creates one.
          ChangePassword sends anyone with neither a token nor a session to
          /login itself. */}
      <Route path="/change-password" element={<ChangePassword />} />
      <Route path="/dashboard" element={<Shell><Dashboard /></Shell>} />
      <Route path="/teaching" element={<Shell><TeachingSchedule /></Shell>} />
      <Route path="/clinic" element={<Shell><ClinicRotations /></Shell>} />
      <Route path="/cases" element={<Shell allow={['fellow', 'supervisor', 'director']}><Cases /></Shell>} />
      <Route path="/teaching-cases" element={<Shell allow={['supervisor', 'director']}><TeachingCases /></Shell>} />
      <Route path="/competency" element={<Shell allow={['fellow', 'director', 'admin']}><Competency /></Shell>} />
      <Route path="/calculators" element={<Shell allow={['fellow', 'supervisor', 'director']}><Calculators /></Shell>} />
      <Route path="/study" element={<Shell allow={['fellow', 'supervisor', 'director']}><StudyTools /></Shell>} />
      {/* The EMG atlas and NCS guide now live in the 3D Atlas, which carries
          the same clinical text beside the anatomy. Old links follow. */}
      <Route path="/emg-atlas" element={<Navigate to="/atlas-3d" replace />} />
      <Route path="/nerve-guide" element={<Navigate to="/atlas-3d" replace />} />
      <Route path="/test-mode" element={<Shell allow={['fellow', 'supervisor', 'director']}><StudyTools /></Shell>} />
      <Route
        path="/atlas-3d"
        element={
          <Shell allow={['fellow', 'supervisor', 'director']}>
            <LazyPage><Atlas3D /></LazyPage>
          </Shell>
        }
      />
      <Route path="/handbook" element={<Shell><Handbook /></Shell>} />
      <Route path="/people" element={<Shell allow={['director', 'admin']}><People /></Shell>} />
      <Route path="/my-teaching" element={<Shell allow={['fellow', 'supervisor', 'director', 'assistant']}><MyTeaching /></Shell>} />
      <Route path="/rate-teaching" element={<Shell allow={['fellow']}><RateTeaching /></Shell>} />
      <Route path="/vacation" element={<Shell allow={['fellow', 'supervisor', 'director', 'assistant']}><Vacation /></Shell>} />
      <Route path="/evaluations" element={<Shell allow={['fellow', 'supervisor', 'director']}><Evaluations /></Shell>} />
      {/* Cross-session ratings and topic demand — director and program admin,
          matching the RPCs behind the page. */}
      <Route path="/feedback-review" element={<Shell allow={['director', 'admin']}><FeedbackReview /></Shell>} />
      {/* The shelf is readable by everyone who trains or teaches here; only the
          director and admin can put anything on it (enforced in the page and by
          RLS, not by this route). Library itself is a light import — the pdf.js
          reader inside it is lazily loaded when a document is opened. */}
      <Route path="/library" element={<Shell allow={['fellow', 'supervisor', 'director', 'admin']}><Library /></Shell>} />
      <Route path="/test-directory" element={<Shell allow={['fellow', 'supervisor', 'director']}><TestDirectory /></Shell>} />
      <Route path="/settings" element={<Shell><Settings /></Shell>} />
      {/* Legacy path redirects */}
      <Route path="/home" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
