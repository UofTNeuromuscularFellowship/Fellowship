import type { UserRole } from '../types/database'

// ---------------------------------------------------------------------------
// The portal's map, in one place.
//
// This file is the single source of truth for what the portal contains and who
// may see it. The desktop rail, the collapsible panel, the section overviews
// and the mobile home screen are all four renderings of THIS, not four lists
// that have to be kept in step. The old flat sidebar had already drifted once —
// a page was reachable by URL and missing from the menu — and that is the class
// of bug this shape removes.
//
// Roles are declared per item; a group is visible when at least one of its
// items is. Nothing is hard-coded about which groups a role sees.
// ---------------------------------------------------------------------------

export interface NavItem {
  to: string
  label: string
  /** One line in the section overview, saying what the tool is for. */
  blurb: string
  allow?: UserRole[]
  /** EMG Toolkit entitlement key. The item is shown only when the current
   *  program has this tool switched on (site_tools). */
  tool?: string
  /** Shown to platform admins only, whatever their site role. */
  platformOnly?: boolean
}

export interface NavGroup {
  id: string
  label: string
  /** Shown under the group title on its overview page. */
  tagline: string
  icon: IconName
  items: NavItem[]
}

export type IconName =
  | 'home'
  | 'clinic'
  | 'teaching'
  | 'caselog'
  | 'emg'
  | 'program'
  | 'settings'
  | 'platform'

export const NAV: NavGroup[] = [
  {
    id: 'home',
    label: 'Home',
    tagline: 'Your week at a glance',
    icon: 'home',
    items: [
      {
        to: '/dashboard',
        label: 'Dashboard',
        blurb: 'This week’s clinics and teaching, your notes and quick links.',
      },
    ],
  },
  {
    id: 'clinic',
    label: 'Clinic',
    tagline: 'Where you are and when',
    icon: 'clinic',
    items: [
      {
        to: '/clinic',
        label: 'Clinic schedule',
        blurb: 'Your rotation through the sites, week by week.',
      },
    ],
  },
  {
    id: 'teaching',
    label: 'Teaching',
    tagline: 'Sessions, cases and feedback',
    icon: 'teaching',
    items: [
      {
        to: '/teaching',
        label: 'Teaching schedule',
        blurb: 'The citywide teaching calendar, with topics and presenters.',
      },
      {
        to: '/my-teaching',
        label: 'Teaching assignments',
        blurb: 'Sessions you are down to give, and what you owe.',
        allow: ['fellow', 'supervisor', 'director', 'assistant'],
      },
      {
        to: '/teaching-cases',
        label: 'Teaching cases',
        blurb: 'Cases prepared for the teaching sessions.',
        allow: ['supervisor', 'director'],
      },
      {
        to: '/evaluations',
        label: 'Evaluations',
        blurb: 'Assessments of the fellow, and the forms behind them.',
        allow: ['fellow', 'supervisor', 'director'],
      },
      {
        to: '/rate-teaching',
        label: 'Rate teaching',
        blurb: 'Rate a session you attended. Ratings are anonymous.',
        allow: ['fellow'],
      },
      {
        to: '/feedback-review',
        label: 'Feedback review',
        blurb: 'Ratings across sessions and which topics are in demand.',
        allow: ['director', 'admin'],
      },
    ],
  },
  {
    id: 'caselog',
    label: 'Case Log',
    tagline: 'What you have seen and done',
    icon: 'caselog',
    items: [
      {
        to: '/cases',
        label: 'Case log',
        blurb: 'Log a study, and review what has been logged.',
        allow: ['fellow', 'supervisor', 'director'],
      },
      {
        to: '/competency',
        label: 'Competency',
        blurb: 'Progress against the numbers the fellowship expects.',
        allow: ['fellow', 'director', 'admin'],
      },
    ],
  },
  {
    id: 'emg',
    label: 'EMG Toolkit',
    tagline: 'The things you reach for mid-study',
    icon: 'emg',
    items: [
      {
        to: '/test-directory',
        tool: 'test-directory',
        label: 'Diagnostic test directory',
        blurb: 'Where to send genetic and antibody testing, with requisitions.',
        allow: ['fellow', 'supervisor', 'director'],
      },
      {
        to: '/atlas-3d',
        tool: 'atlas-3d',
        label: '3D atlas',
        blurb: 'Muscles, nerves and needle insertion points in three dimensions.',
        allow: ['fellow', 'supervisor', 'director'],
      },
      {
        to: '/waveforms',
        tool: 'waveforms',
        label: 'Waveforms & images Library',
        blurb: 'Teaching traces, ultrasound, MRI and biopsy, annotated.',
        allow: ['fellow', 'supervisor', 'director'],
      },
      {
        to: '/library',
        tool: 'library',
        label: 'Literature library',
        blurb: 'Reference texts, guidelines and your reading list.',
        allow: ['fellow', 'supervisor', 'director', 'admin'],
      },
      {
        to: '/calculators',
        tool: 'calculators',
        label: 'EMG/NCS calculators',
        blurb: 'Reference values and the calculations you repeat.',
        allow: ['fellow', 'supervisor', 'director'],
      },
      {
        to: '/study',
        tool: 'study',
        label: 'Test your anatomy knowledge',
        blurb: 'Self-testing on muscles, nerves and root levels.',
        allow: ['fellow', 'supervisor', 'director'],
      },
    ],
  },
  {
    id: 'program',
    label: 'Program',
    tagline: 'How the fellowship runs',
    icon: 'program',
    items: [
      {
        to: '/handbook',
        label: 'Handbook',
        blurb: 'Housekeeping, EMG reporting, and site-by-site guides.',
      },
      {
        to: '/people',
        label: 'People',
        blurb: 'Fellows, supervisors and their accounts.',
        allow: ['director', 'admin'],
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    tagline: 'Your account and your time away',
    icon: 'settings',
    items: [
      {
        to: '/settings',
        label: 'General settings',
        blurb: 'Your details, password, notifications and appearance.',
      },
      {
        to: '/vacation',
        label: 'Vacation & away dates',
        blurb: 'Book leave and see who else is away.',
        allow: ['fellow', 'supervisor', 'director', 'assistant'],
      },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    tagline: 'Programs using this portal',
    icon: 'platform',
    items: [
      {
        to: '/platform',
        label: 'Programs',
        blurb: 'Create fellowship programs, appoint their directors and choose which toolkit items each may use.',
        platformOnly: true,
      },
    ],
  },
]

/** The groups this role can see, with the items they cannot see removed. */
export function navFor(
  role: UserRole | undefined,
  opts?: { hideClinic?: boolean; tools?: Set<string>; platformAdmin?: boolean },
): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (i.platformOnly) return !!opts?.platformAdmin
      // A teaching-only supervisor runs no fellowship clinics, so the clinic
      // schedule is noise for them. Everything teaching-related stays put.
      if (opts?.hideClinic && i.to === '/clinic') return false
      // A toolkit item the program has not been granted is not offered. (The
      // route and the database refuse it too; this only keeps the menu honest.)
      if (i.tool && opts?.tools && !opts.tools.has(i.tool)) return false
      return !i.allow || (role && i.allow.includes(role))
    }),
  })).filter((g) => g.items.length > 0)
}

/** The toolkit key a path needs, if any — used by ProtectedRoute. */
export function toolForPath(pathname: string): string | undefined {
  if (pathname === '/ultrasound') return 'ultrasound'
  if (pathname === '/test-mode') return 'study'
  return itemForPath(NAV, pathname)?.tool
}

/**
 * Which group a path belongs to, so the rail can show where you are.
 *
 * Matches the group's own overview route as well as its items. Without the
 * first check, standing on /s/emg highlighted whichever group happened to be
 * first while the main area showed the EMG toolkit.
 */
export function groupForPath(groups: NavGroup[], pathname: string): NavGroup | undefined {
  const overview = pathname.match(/^\/s\/([^/]+)$/)
  if (overview) return groups.find((g) => g.id === overview[1])
  return groups.find((g) => g.items.some((i) => i.to === pathname))
}

export function itemForPath(groups: NavGroup[], pathname: string): NavItem | undefined {
  for (const g of groups) {
    const hit = g.items.find((i) => i.to === pathname)
    if (hit) return hit
  }
  return undefined
}

/** The overview route for a group, e.g. /s/emg. */
export function overviewPath(groupId: string): string {
  return `/s/${groupId}`
}

/**
 * Where a rail icon or a phone tile should go.
 *
 * An area holding one tool goes straight to that tool. An overview listing a
 * single card is a step that teaches nothing — you already knew what you
 * clicked. The phone did this from the start; this is the desktop catching up,
 * and it keeps the two behaving the same way.
 *
 * Applies to Home (the dashboard) and Clinic (the clinic schedule) today, and
 * to any future area until it gains a second tool, at which point the overview
 * starts appearing on its own.
 */
export function landingPath(group: NavGroup): string {
  return group.items.length === 1 ? group.items[0].to : overviewPath(group.id)
}
