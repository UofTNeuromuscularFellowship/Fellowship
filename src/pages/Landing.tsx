import { Link } from 'react-router-dom'
import { Waveform } from '../components/ui/Waveform'

const SITES = [
  { name: 'Sunnybrook Health Sciences Centre', note: 'Adult neuromuscular centre' },
  { name: 'Toronto General Hospital', note: 'Adult neuromuscular centre' },
  { name: "St. Michael's Hospital", note: 'Adult neuromuscular centre' },
  { name: 'The Hospital for Sick Children', note: 'Pediatric neuromuscular exposure' },
]

const FACTS = [
  { label: 'Duration', value: '1–2 years' },
  { label: 'Start date', value: 'July 1' },
  { label: 'Positions per year', value: 'One' },
  { label: 'Didactic teaching', value: 'Set sessions every 2 weeks, year-round' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-3">
          <Waveform className="h-5 w-24 text-accent" />
          <span className="hidden font-display text-sm font-semibold sm:inline">
            City Wide Neuromuscular Fellowship
          </span>
        </div>
        <Link
          to="/login"
          className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Portal sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pb-16 pt-12 md:pt-20 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
          University of Toronto · Division of Neurology
        </p>
        <h1 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-bold leading-tight md:text-5xl">
          City Wide Neuromuscular Fellowship
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
          A clinical fellowship in neuromuscular medicine and electrodiagnostics — EMG and nerve
          conduction studies — training across Toronto's major academic neuromuscular centres and
          preparing fellows for academic or community-based careers in neuromuscular medicine.
        </p>
        <div className="mx-auto mt-10 max-w-lg">
          <Waveform className="h-10 w-full text-accent opacity-90" />
        </div>
      </section>

      {/* Facts */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px md:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.label} className="px-6 py-8 text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">{f.label}</p>
              <p className="mt-2 font-display text-lg font-semibold">{f.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Training sites */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="font-display text-2xl font-bold">Training sites</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Fellows train at the three major academic adult neuromuscular centres in Toronto, with
          additional experience at the Hospital for Sick Children.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {SITES.map((s) => (
            <div key={s.name} className="rounded-lg border border-line bg-surface p-5">
              <p className="font-display text-base font-semibold">{s.name}</p>
              <p className="mt-1 text-sm text-muted">{s.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Applying */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="font-display text-2xl font-bold">Applying</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            One fellowship position is offered per year, with an anticipated start date of July 1.
            Applications open one year prior to the start date. For application details, exact
            deadlines, and any questions about the program, contact the fellowship director or
            visit the program website.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-paper p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">Fellowship Director</p>
              <p className="mt-2 font-display text-base font-semibold">Dr. Aaron Izenberg</p>
              <p className="mt-1 text-sm text-muted">
                <a href="mailto:aaron.izenberg@sunnybrook.ca" className="text-accent hover:underline">
                  aaron.izenberg@sunnybrook.ca
                </a>
                <br />
                416-480-4475
              </p>
            </div>
            <div className="rounded-lg border border-line bg-paper p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">Program website</p>
              <p className="mt-2 font-display text-base font-semibold">neuromuscularto.ca</p>
              <p className="mt-1 text-sm text-muted">
                <a
                  href="https://www.neuromuscularto.ca"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  Visit the program site →
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="px-6 py-8 text-center text-xs text-muted">
        City Wide Neuromuscular Fellowship · University of Toronto · Division of Neurology
      </footer>
    </div>
  )
}
