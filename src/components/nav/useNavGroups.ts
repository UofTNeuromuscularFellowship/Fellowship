import { useAuth } from '../../context/AuthContext'
import { navFor, type NavGroup } from '../../lib/navigation'

/** The areas this person sees — the one list the rail, panel and tiles share. */
export function useNavGroups(): NavGroup[] {
  const { profile, site, tools, isPlatformAdmin, courseCount, runsRounds, runsConferences } = useAuth()
  const role = profile?.role
  const hideClinic = role === 'supervisor' && profile?.teaching_only === true
  return site
    ? navFor(role, { hideClinic, tools, platformAdmin: isPlatformAdmin, courses: courseCount > 0, runsRounds, runsConferences })
    : navFor(undefined, { platformAdmin: isPlatformAdmin }).filter((g) => g.id === 'platform')
}
