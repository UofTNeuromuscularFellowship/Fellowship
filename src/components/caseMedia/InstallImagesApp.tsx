import { useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// "Put this on your home screen" — a separate installable app for the image
// library, so a photo taken in clinic is two taps from being uploaded instead
// of six.
//
// The portal already ships one manifest, at /dashboard. A browser installs the
// manifest the CURRENT page points at, so this page swaps the <link rel=manifest>
// (and the Apple touch icon and title, which iOS reads from the document rather
// than the manifest) for as long as it is mounted, and puts them back on the way
// out. Installing from here therefore gives an icon that opens straight into
// this page; installing from anywhere else still gives the whole portal.
//
// Android exposes beforeinstallprompt, so the install can be a button. iOS never
// fires it and has no API at all — Safari's own Share ▸ Add to Home Screen is
// the only route — so there the component explains that instead of pretending
// to have a button that would do nothing.
// ---------------------------------------------------------------------------

const IMAGES_MANIFEST = '/manifest-images.webmanifest'
const IMAGES_APPLE_ICON = '/icons/images-apple-touch-icon.png'
const IMAGES_TITLE = 'NM Images'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Swap the document's install identity to this page's, and restore it after. */
function useImagesManifest() {
  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
    const appleTitle = document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-title"]',
    )

    const before = {
      manifest: manifest?.getAttribute('href') ?? null,
      icon: appleIcon?.getAttribute('href') ?? null,
      title: appleTitle?.getAttribute('content') ?? null,
    }

    manifest?.setAttribute('href', IMAGES_MANIFEST)
    appleIcon?.setAttribute('href', IMAGES_APPLE_ICON)
    appleTitle?.setAttribute('content', IMAGES_TITLE)

    return () => {
      if (before.manifest !== null) manifest?.setAttribute('href', before.manifest)
      if (before.icon !== null) appleIcon?.setAttribute('href', before.icon)
      if (before.title !== null) appleTitle?.setAttribute('content', before.title)
    }
  }, [])
}

export function InstallImagesApp() {
  useImagesManifest()

  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [showIos, setShowIos] = useState(false)

  // Already running from the home screen: there is nothing to offer.
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true)

  const isIos =
    typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault()
      setPrompt(e as InstallPromptEvent)
    }
    function onInstalled() {
      setPrompt(null)
      setDismissed(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (standalone || dismissed) return null
  if (!prompt && !isIos) return null

  return (
    <div className="rounded-md border border-line bg-paper/60 px-4 py-3 md:hidden">
      <div className="flex items-start gap-3">
        <img src="/icons/images-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Keep this on your home screen</p>
          <p className="mt-0.5 text-sm text-muted">
            Opens straight here, so an image can go up from the clinic room without navigating the
            portal.
          </p>

          {prompt ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  void prompt.prompt().then(() => setPrompt(null))
                }}
                className="min-h-[40px] rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white"
              >
                Add to home screen
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="min-h-[40px] px-2 text-sm font-semibold text-muted"
              >
                Not now
              </button>
            </div>
          ) : (
            <div className="mt-2">
              <button
                onClick={() => setShowIos((s) => !s)}
                className="min-h-[40px] text-sm font-semibold text-accent"
              >
                {showIos ? 'Hide how' : 'How do I do that?'}
              </button>
              {showIos && (
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink">
                  <li>
                    Tap the Share button at the bottom of Safari — the square with an arrow coming
                    out of it.
                  </li>
                  <li>Scroll down and choose <span className="font-semibold">Add to Home Screen</span>.</li>
                  <li>Tap <span className="font-semibold">Add</span>. The icon opens on this page.</li>
                </ol>
              )}
              <button
                onClick={() => setDismissed(true)}
                className="mt-1 block min-h-[36px] text-sm font-semibold text-muted"
              >
                Not now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
