import { createClient } from 'npm:@supabase/supabase-js@2'
import { joinMp3 } from './mp3.ts'

// ---------------------------------------------------------------------------
// Listen to an NMDx topic.
//
// The NMDx page sends one chapter of a topic as plain text (the summary, one
// section, or part of a long section). This function turns it into speech
// with a neural voice, saves the MP3 in the private nmdx-audio bucket and
// returns a link to it that lasts a few hours.
//
// Audio is saved under a hash of the text and the voice settings, so each
// chapter is made once and then shared by everyone. Editing a topic changes
// its text, so the next listener gets fresh audio automatically.
//
// The voice is OpenAI's gpt-4o-mini-tts, which reads in a natural, human
// style. It needs the OPENAI_API_KEY secret. NMDX_TTS_VOICE picks another
// of its voices.
//
// Only members of a program (or the website coordinator) can use it, since
// each new chapter costs a little to make.
// ---------------------------------------------------------------------------

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const BUCKET = 'nmdx-audio'
const MODEL = 'gpt-4o-mini-tts'
const VOICE = Deno.env.get('NMDX_TTS_VOICE') || 'sage'
const INSTRUCTIONS =
  'You are a neurologist recording an audio teaching episode for neurology residents and fellows. ' +
  'Speak warmly and naturally, as if explaining to a colleague, at a steady, unhurried pace. ' +
  'Pronounce medical terms, drug names and gene names accurately. Read abbreviations such as ALS, CIDP, EMG and CK as letters. ' +
  'Pause briefly before each new section heading.'
const MAX_TEXT = 12000 // one chapter; the page splits longer sections into parts
const PIECE = 2500 // characters per speech request
const LINK_SECONDS = 6 * 60 * 60

/** Split text into pieces of at most PIECE characters, at paragraph or sentence ends. */
function pieces(text: string): string[] {
  const out: string[] = []
  let cur = ''
  const push = (s: string) => {
    if (cur && cur.length + s.length + 2 > PIECE) { out.push(cur); cur = '' }
    cur = cur ? `${cur}\n\n${s}` : s
  }
  for (const para of text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)) {
    if (para.length <= PIECE) { push(para); continue }
    let sentence = ''
    for (const s of para.split(/(?<=[.!?])\s+/)) {
      if (sentence && sentence.length + s.length + 1 > PIECE) { push(sentence); sentence = '' }
      sentence = sentence ? `${sentence} ${s}` : s.slice(0, PIECE)
    }
    if (sentence) push(sentence)
  }
  if (cur) out.push(cur)
  return out
}

async function speak(input: string, key: string): Promise<Uint8Array> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, voice: VOICE, input, instructions: INSTRUCTIONS, response_format: 'mp3' }),
    })
    if (res.ok) return new Uint8Array(await res.arrayBuffer())
    if (attempt < 2 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      continue
    }
    throw new Error(`speech ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
}

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: who } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } }
    if (!who?.user) return json({ error: 'Please sign in again.' }, 401)
    const uid = who.user.id
    const [{ data: member }, { data: pa }] = await Promise.all([
      admin.from('site_memberships').select('id').eq('user_id', uid).eq('status', 'active').limit(1).maybeSingle(),
      admin.from('platform_admins').select('user_id').eq('user_id', uid).maybeSingle(),
    ])
    if (!member && !pa) return json({ error: 'Listening is for program members.' }, 403)

    const body = await req.json().catch(() => ({}))
    const entryId = String(body.entryId ?? '')
    const chapter = String(body.chapter ?? '')
    const text = String(body.text ?? '').trim()
    if (!/^[a-z0-9-]{1,80}$/.test(entryId) || !/^[a-z0-9-]{1,40}$/.test(chapter)) return json({ error: 'Unknown topic.' }, 400)
    if (!text || text.length > MAX_TEXT) return json({ error: 'That section is too long to read aloud.' }, 400)

    const hash = (await sha256(`${MODEL}|${VOICE}|${INSTRUCTIONS}|${text}`)).slice(0, 20)
    const name = `${chapter}-${hash}.mp3`
    const path = `${entryId}/${name}`
    const store = admin.storage.from(BUCKET)

    const { data: found } = await store.list(entryId, { search: name, limit: 1 })
    if (!found?.some((f) => f.name === name)) {
      const key = Deno.env.get('OPENAI_API_KEY')
      if (!key) return json({ error: 'Read aloud is not set up yet. Ask the website coordinator to add the voice service key.' }, 503)
      const parts = pieces(text)
      // Make the pieces side by side, a few at a time.
      const audio: Uint8Array[] = new Array(parts.length)
      let next = 0
      await Promise.all(Array.from({ length: Math.min(4, parts.length) }, async () => {
        while (next < parts.length) { const i = next++; audio[i] = await speak(parts[i], key) }
      }))
      const { error: upErr } = await store.upload(path, joinMp3(audio), { contentType: 'audio/mpeg', upsert: true })
      if (upErr) throw new Error(`upload: ${upErr.message}`)
    }

    const { data: signed, error: signErr } = await store.createSignedUrl(path, LINK_SECONDS)
    if (signErr || !signed) throw new Error(`sign: ${signErr?.message}`)
    return json({ url: signed.signedUrl })
  } catch (e) {
    console.error('nmdx-audio:', String(e))
    return json({ error: 'The audio could not be made just now. Please try again.' }, 500)
  }
})
