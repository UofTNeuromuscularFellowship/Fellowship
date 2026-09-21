// ---------------------------------------------------------------------------
// An email as the recipient will see it.
//
// The HTML comes from the database's own email builder (conf_preview), so the
// preview is the real thing rather than a front-end imitation of it. It is
// shown in a sandboxed frame with scripts off: the text inside was typed by a
// coordinator and escaped by the builder, but a preview should never be the
// place that assumption gets tested.
// ---------------------------------------------------------------------------

export function EmailPreview({ subject, html, note }: { subject: string; html: string; note?: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="border-b border-line bg-paper px-4 py-2 text-xs">
        <span className="text-muted">Subject: </span>
        <span className="font-medium text-ink">{subject}</span>
        {note && <span className="ml-2 text-muted">· {note}</span>}
      </div>
      <iframe
        title="Email preview"
        sandbox=""
        className="block h-[26rem] w-full bg-white"
        srcDoc={`<!doctype html><meta charset="utf-8"><base target="_blank"><body style="margin:0;padding:20px;background:#fff">${html}</body>`}
      />
    </div>
  )
}

/** The placeholders the invitation and message builders fill in. */
export function PlaceholderHelp() {
  return (
    <p className="text-xs text-muted">
      You can use <code className="rounded bg-paper px-1">{'{first_name}'}</code>,{' '}
      <code className="rounded bg-paper px-1">{'{event_name}'}</code> and{' '}
      <code className="rounded bg-paper px-1">{'{dates}'}</code>. A blank line starts a new paragraph.
    </p>
  )
}
