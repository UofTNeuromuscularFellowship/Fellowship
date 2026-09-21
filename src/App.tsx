import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'
import { CoursesFrame } from './components/AttendeeShell'
import { useAuth } from './context/AuthContext'
import Landing from './pages/Landing'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import Dashboard from './pages/Dashboard'
import TeachingSchedule from './pages/TeachingSchedule'
import ClinicRotations from './pages/ClinicRotations'
import Cases from './pages/Cases'
import Competency from './pages/Competency'
import Calculators from './pages/Calculators'
import PublicCalculators from './pages/PublicCalculators'
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
import UltrasoundPrimer from './pages/UltrasoundPrimer'
import CaseMediaLibrary from './pages/CaseMedia'
import Settings from './pages/Settings'
import Platform from './pages/Platform'
import SectionOverview from './pages/SectionOverview'
import NotFound from './pages/NotFound'

// Code-split: the 3D atlas pulls in three.js, which must not weigh down the
// main portal bundle for the many users who never open it.
const Atlas3D = lazy(() => import('./pages/Atlas3D'))

// Conference management: a coordinator workspace few members open, and the
// signed-out pages invitees and speakers reach from email. Both are split out
// so neither adds weight to the everyday portal bundle.
const Conferences = lazy(() => import('./pages/Conferences'))
const ConferenceEvent = lazy(() => import('./pages/ConferenceEvent'))
const ConferenceBadges = lazy(() => import('./pages/ConferenceBadges'))
const EventPublic = lazy(() => import('./pages/public/EventPublic'))
const SpeakerDisclosure = lazy(() => import('./pages/public/SpeakerDisclosure'))
const RegisterPublic = lazy(() => import('./pages/public/RegisterPublic'))
const MyCourses = lazy(() => import('./pages/MyCourses'))
const EventInPortal = lazy(() => import('./pages/public/EventPublic').then((m) => ({ default: m.EventInPortal })))

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>{children}</Suspense>
  )
}

/**
 * Signed in, but no program required: My courses is for conference
 * attendees (who belong to no program) as much as for members.
 */
function SignedIn({ children }: { children: React.ReactNode }) {
  const { session, loading, profileReady } = useAuth()
  const location = useLocation()
  if (loading || (session && !profileReady)) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-sm text-muted">Loading…</p></div>
  }
  if (!session) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  return <CoursesFrame><LazyPage>{children}</LazyPage></CoursesFrame>
}

function Shell({ children, allow, platformOnly }: {
  children: React.ReactNode
  allow?: ('fellow' | 'supervisor' | 'director' | 'admin' | 'assistant')[]
  platformOnly?: boolean
}) {
  return (
    <ProtectedRoute allow={allow} platformOnly={platformOnly}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      {/* Free and signed-out. Also served on the marketing host - see
          PublicCalculators for why its links are absolute. */}
      <Route path="/tools/calculators" element={<PublicCalculators />} />
      <Route path="/tools" element={<Navigate to="/tools/calculators" replace />} />
      {/* Not wrapped in ProtectedRoute: someone arriving from a reset email has
          no session yet — redeeming the token in the page is what creates one.
          ChangePassword sends anyone with neither a token nor a session to
          /login itself. */}
      <Route path="/change-password" element={<ChangePassword />} />
      {/* Conference invitees and speakers are not portal members. These pages
          take a private token from their email and never ask anyone to sign
          in - see pages/public/EventPublic.tsx. (/speaker, not /s: /s/:groupId
          is the section overview.) */}
      <Route path="/e/:token" element={<LazyPage><EventPublic /></LazyPage>} />
      <Route path="/e/:token/:view" element={<LazyPage><EventPublic /></LazyPage>} />
      <Route path="/speaker/:token" element={<LazyPage><SpeakerDisclosure /></LazyPage>} />
      <Route path="/r/:token" element={<LazyPage><RegisterPublic /></LazyPage>} />
      {/* A member's or an attendee's own courses, from any program. */}
      <Route path="/courses" element={<SignedIn><MyCourses /></SignedIn>} />
      <Route path="/courses/:token" element={<SignedIn><EventInPortal /></SignedIn>} />
      <Route path="/courses/:token/:view" element={<SignedIn><EventInPortal /></SignedIn>} />
      <Route path="/dashboard" element={<Shell><Dashboard /></Shell>} />
      {/* One route serving every area's overview. The list of areas lives in
          lib/navigation.ts; SectionOverview sends an unknown or forbidden id to
          the dashboard rather than showing an error. */}
      <Route path="/s/:groupId" element={<Shell><SectionOverview /></Shell>} />
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
      {/* Hidden from the menu (see AppShell) and narrowed to the director while
          it is withdrawn, so a fellow who bookmarked it cannot still open it.
          Widen this allow list back to ['fellow', 'supervisor', 'director'] to
          publish it again. */}
      <Route path="/ultrasound" element={<Shell allow={['director', 'admin']}><UltrasoundPrimer /></Shell>} />
      <Route path="/waveforms" element={<Shell allow={['fellow', 'supervisor', 'director']}><CaseMediaLibrary /></Shell>} />
      {/* Conference management: the fellowship director or a program admin,
          matching is_director_or_admin() behind every conf_* table. Gated on
          the 'conference' toolkit entry like the other optional modules. */}
      <Route path="/events" element={<Shell allow={['director', 'admin']}><LazyPage><Conferences /></LazyPage></Shell>} />
      <Route path="/events/:id" element={<Shell allow={['director', 'admin']}><LazyPage><ConferenceEvent /></LazyPage></Shell>} />
      {/* Printable sheet: signed in, but without the portal frame around it. */}
      <Route
        path="/events/:id/badges"
        element={<ProtectedRoute allow={['director', 'admin']}><LazyPage><ConferenceBadges /></LazyPage></ProtectedRoute>}
      />
      <Route path="/settings" element={<Shell><Settings /></Shell>} />
      {/* Platform admin only: the programs using this portal. Not part of any
          program, so no site role applies — see ProtectedRoute. */}
      <Route path="/platform" element={<Shell platformOnly><Platform /></Shell>} />
      {/* Legacy path redirects */}
      <Route path="/home" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
