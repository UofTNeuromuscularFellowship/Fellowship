import Calculators from './Calculators'

// ---------------------------------------------------------------------------
// The EMG / NCS calculators, free and signed-out, at /tools/calculators.
//
// This page is served on the marketing host (www.neuromuscular.ca/tools/…) as
// well as on the app host. Every outbound link here is therefore ABSOLUTE: an
// in-app route such as /login would start a second portal session on the
// marketing origin, which is exactly what keeping the portal on one host is
// for.
//
// The calculators are pure client-side arithmetic. They read and write
// nothing, so using them involves no program, no session and no patient data.
// ---------------------------------------------------------------------------

const MARKETING = 'https://www.neuromuscular.ca'
const SIGN_IN = 'https://app.neuromuscular.ca/login'

export default function PublicCalculators() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <a href={MARKETING} className="flex items-center gap-2.5 text-ink no-underline">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M5.8 12.6h2.1l1.2-4 1.9 7.4 1.6-8.6 1.7 6.2 1-1h3.1" />
            </svg>
            <span>
              <span className="block font-display text-base font-semibold leading-tight">Neuromuscular</span>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-muted">Free tools</span>
            </span>
          </a>
          <a href={SIGN_IN}
            className="whitespace-nowrap rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:border-accent">
            Program sign-in
          </a>
        </div>
      </header>

      {/* Calculators brings its own heading and its own "educational use only,
          not medical advice" notice, so this page adds neither - a second
          title and a second disclaimer stacked above them read as a mistake.
          It adds only what the component cannot say for itself. */}
      <div className="border-b border-line bg-accent-soft">
        <p className="mx-auto max-w-5xl px-4 py-2 text-xs text-ink">
          Free to use, no account needed. Nothing you enter leaves your browser.
        </p>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Calculators />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-baseline justify-between gap-3 px-4 py-6 text-sm text-muted">
          <span>Part of the Neuromuscular Fellowship Manager.</span>
          <a href={MARKETING} className="text-accent hover:underline">About the platform</a>
        </div>
      </footer>
    </div>
  )
}
