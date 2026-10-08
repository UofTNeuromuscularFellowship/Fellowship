import { useCallback, useEffect, useRef, useState } from 'react'
import { chapterAudio, type ListenRequest } from '../lib/nmdxAudio'

// ---------------------------------------------------------------------------
// The NMDx read-aloud player, like a podcast player for one topic.
//
// A topic plays as chapters, one after another: overview, then each section.
// Back 15 s and ahead 30 s cross into the neighbouring chapter at the edges.
// Speed is remembered on this device. The phone's lock screen, headphones and
// car controls work too, through the Media Session API.
//
// The next chapter is requested as soon as one starts, so it is usually ready
// by the time it is needed.
// ---------------------------------------------------------------------------

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2]
const BACK = 15
const AHEAD = 30
const RATE_KEY = 'nmdx.listenRate'

function readRate(): number {
  try { const r = Number(localStorage.getItem(RATE_KEY)); return SPEEDS.includes(r) ? r : 1 } catch { return 1 }
}

function clock(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

const btn = 'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-medium text-ink hover:bg-accent-soft disabled:opacity-40'

export default function NmdxListenPlayer({ request, onClose }: { request: ListenRequest; onClose: () => void }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState(readRate)
  const [attempt, setAttempt] = useState(0)
  // Where to start the chapter once it loads: 0, or "end" when rewinding into it.
  const startAt = useRef<number | 'end'>(0)
  const autoplay = useRef(true)
  const { entryId, entryName, chapters } = request
  const chapter = chapters[index]

  // A new topic starts from the top.
  useEffect(() => { startAt.current = 0; autoplay.current = true; setIndex(0) }, [request])

  // Load the current chapter, and ask for the next one so it is ready in time.
  useEffect(() => {
    let live = true
    const el = audio.current
    if (!el || !chapter) return
    setLoading(true); setError(''); setTime(0); setDuration(0)
    chapterAudio(entryId, chapter)
      .then((url) => {
        if (!live) return
        el.src = url
        el.defaultPlaybackRate = rate
        el.playbackRate = rate
        if (autoplay.current) el.play().catch(() => setPlaying(false))
      })
      .catch((e: Error) => { if (live) { setError(e.message); setLoading(false) } })
    const next = chapters[index + 1]
    if (next) chapterAudio(entryId, next).catch(() => {})
    return () => { live = false }
    // rate is applied separately below; reloading on a speed change would restart the chapter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, chapter, chapters, index, attempt])

  useEffect(() => {
    const el = audio.current
    if (el) { el.defaultPlaybackRate = rate; el.playbackRate = rate }
    try { localStorage.setItem(RATE_KEY, String(rate)) } catch { /* private mode */ }
  }, [rate])

  const goChapter = useCallback((i: number, at: number | 'end' = 0) => {
    if (i < 0 || i >= chapters.length) return
    startAt.current = at
    autoplay.current = true
    setIndex(i)
  }, [chapters.length])

  const toggle = useCallback(() => {
    const el = audio.current
    if (!el || loading) return
    if (el.paused) { autoplay.current = true; el.play().catch(() => {}) } else { autoplay.current = false; el.pause() }
  }, [loading])

  const skip = useCallback((by: number) => {
    const el = audio.current
    if (!el || loading) return
    const t = el.currentTime + by
    if (t < 0 && index > 0) goChapter(index - 1, 'end')
    else if (t >= (el.duration || Infinity) && index < chapters.length - 1) goChapter(index + 1)
    else el.currentTime = Math.max(0, Math.min(t, el.duration || t))
  }, [loading, index, chapters.length, goChapter])

  const seek = useCallback((t: number) => {
    const el = audio.current
    if (el && Number.isFinite(t)) el.currentTime = Math.max(0, Math.min(t, el.duration || t))
  }, [])

  // Lock screen, headphone and car controls.
  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined
    if (!ms || !chapter) return
    try {
      ms.metadata = new MediaMetadata({ title: `${entryName}: ${chapter.label}`, artist: 'NMDx', album: entryName })
    } catch { /* older browsers */ }
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => { try { ms.setActionHandler(a, h) } catch { /* unsupported */ } }
    set('play', () => { autoplay.current = true; audio.current?.play().catch(() => {}) })
    set('pause', () => { autoplay.current = false; audio.current?.pause() })
    set('seekbackward', (d) => skip(-(d.seekOffset || BACK)))
    set('seekforward', (d) => skip(d.seekOffset || AHEAD))
    set('seekto', (d) => { if (d.seekTime != null) seek(d.seekTime) })
    set('previoustrack', index > 0 ? () => goChapter(index - 1) : null)
    set('nexttrack', index < chapters.length - 1 ? () => goChapter(index + 1) : null)
    return () => {
      for (const a of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack'] as MediaSessionAction[]) set(a, null)
    }
  }, [chapter, entryName, index, chapters.length, skip, seek, goChapter])

  useEffect(() => {
    const ms = navigator.mediaSession
    if (!ms?.setPositionState || !duration) return
    try { ms.setPositionState({ duration, position: Math.min(time, duration), playbackRate: rate }) } catch { /* ignore */ }
  }, [time, duration, rate])

  // Stop the sound when the player closes or the page is left.
  useEffect(() => () => { audio.current?.pause() }, [])

  const atEnd = index === chapters.length - 1

  return (
    <section aria-label="Read aloud" className="rounded-lg border border-line bg-surface p-3 shadow-sm">
      <audio
        ref={audio}
        preload="auto"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget
          setDuration(el.duration)
          if (startAt.current === 'end') el.currentTime = Math.max(0, el.duration - BACK)
          startAt.current = 0
          setLoading(false)
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { if (!atEnd) goChapter(index + 1); else setPlaying(false) }}
        onError={() => { if (audio.current?.src) { setError('The audio could not be played.'); setLoading(false) } }}
      />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{entryName}</p>
          <label className="mt-0.5 flex items-center gap-1 text-xs text-muted">
            <span className="sr-only">Chapter</span>
            <select
              value={index}
              onChange={(e) => goChapter(Number(e.target.value))}
              className="max-w-[16rem] truncate rounded border border-line bg-surface px-1 py-0.5 text-xs text-ink"
            >
              {chapters.map((c, i) => <option key={c.key} value={i}>{c.label}</option>)}
            </select>
            <span>{index + 1} of {chapters.length}</span>
          </label>
        </div>
        <button type="button" onClick={onClose} className={btn} aria-label="Close player" title="Close">✕</button>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs tabular-nums text-muted">
        <span className="w-10 text-right">{clock(time)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={1}
          value={Math.min(time, duration || 0)}
          disabled={loading || !duration}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Position in chapter"
          className="h-1.5 flex-1 cursor-pointer accent-[rgb(var(--c-accent))]"
        />
        <span className="w-10">{clock(duration)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-1 sm:justify-between">
        <div className="flex items-center gap-1">
          <button type="button" className={btn} onClick={() => goChapter(index - 1)} disabled={index === 0} aria-label="Previous chapter" title="Previous chapter">⏮</button>
          <button type="button" className={btn} onClick={() => skip(-BACK)} disabled={loading} aria-label={`Back ${BACK} seconds`} title={`Back ${BACK} seconds`}>↺ {BACK}</button>
          <button
            type="button"
            onClick={toggle}
            disabled={loading}
            aria-label={playing ? 'Pause' : 'Play'}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent text-lg text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : playing ? '❚❚' : '▶'}
          </button>
          <button type="button" className={btn} onClick={() => skip(AHEAD)} disabled={loading} aria-label={`Ahead ${AHEAD} seconds`} title={`Ahead ${AHEAD} seconds`}>{AHEAD} ↻</button>
          <button type="button" className={btn} onClick={() => goChapter(index + 1)} disabled={atEnd} aria-label="Next chapter" title="Next chapter">⏭</button>
        </div>
        <label className="flex items-center gap-1 text-xs text-muted">
          Speed
          <select
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="rounded border border-line bg-surface px-1 py-0.5 text-xs text-ink"
          >
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
      </div>

      {loading && !error && (
        <p className="mt-2 text-xs text-muted">
          Preparing audio. The first listen of a section can take up to a minute; after that it starts straight away.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-700 dark:text-rose-300">
          {error}{' '}
          <button type="button" className="underline" onClick={() => { autoplay.current = true; setAttempt((n) => n + 1) }}>Try again</button>
        </p>
      )}
    </section>
  )
}
