// ---------------------------------------------------------------------------
// Light and dark.
//
// Three states, not two: light, dark, and "follow this device". Following the
// device is the default, because a phone that switches to dark at sunset should
// take the portal with it without anyone being asked.
//
// The chosen state is per device, in localStorage. It is deliberately NOT in
// the user's profile: someone reading on a bright ward computer and again on a
// phone at night wants different answers, and syncing the choice would fight
// them.
// ---------------------------------------------------------------------------

export type ThemeChoice = 'light' | 'dark' | 'system'

const KEY = 'nmf-theme'

export function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  } catch {
    // Private browsing, or storage disabled. Following the device is a good
    // answer when we are not allowed to remember anything.
    return 'system'
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

export function resolve(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice
}

/** Put it on <html>, where the `dark` class and color-scheme both belong. */
export function apply(choice: ThemeChoice): void {
  const dark = resolve(choice) === 'dark'
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  // Tells the browser to render form controls, scrollbars and the address bar
  // to match. Without it a dark page keeps white scrollbars.
  root.style.colorScheme = dark ? 'dark' : 'light'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#0D1117' : '#0E7C86')
}

export function saveChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(KEY, choice)
  } catch {
    // Not being able to remember the choice is not a reason to refuse it for
    // this session.
  }
  apply(choice)
}

/**
 * While the choice is "system", follow the device live — someone who has their
 * phone set to switch at sunset should see the portal switch with it, without
 * reloading. Returns an unsubscribe.
 */
export function watchSystem(onChange: () => void): () => void {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!mq) return () => {}
  const handler = () => onChange()
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
