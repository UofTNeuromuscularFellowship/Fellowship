// ---------------------------------------------------------------------------
// Join MP3 files end to end.
//
// MP3 is a stream of self-contained frames, so files can be joined by
// appending their bytes. The catch is the header frame an encoder writes at
// the start of each file ("Xing", "Info" or "VBRI"): it states the length of
// THAT file, and a browser reading the joined file would believe the first
// part's length and stop the seek bar there. So each part's ID3 tags and
// header frame are dropped and only the audio frames are kept.
// ---------------------------------------------------------------------------

const BITRATES: Record<string, number[]> = {
  // kbit/s by index, layer III only
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

/** Length in bytes of the layer III frame whose header starts at i, or 0. */
function frameLength(b: Uint8Array, i: number): number {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return 0
  const version = (b[i + 1] >> 3) & 3 // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layer = (b[i + 1] >> 1) & 3 // 1 = layer III
  const br = (b[i + 2] >> 4) & 15
  const sr = (b[i + 2] >> 2) & 3
  if (version === 1 || layer !== 1 || br === 0 || br === 15 || sr === 3) return 0
  const kbps = BITRATES[version === 3 ? 'v1' : 'v2'][br]
  const rate = RATES[version][sr]
  const pad = (b[i + 2] >> 1) & 1
  return Math.floor(((version === 3 ? 144 : 72) * kbps * 1000) / rate) + pad
}

function hasTag(b: Uint8Array, from: number, to: number, tag: string): boolean {
  outer: for (let i = from; i + tag.length <= to; i++) {
    for (let j = 0; j < tag.length; j++) if (b[i + j] !== tag.charCodeAt(j)) continue outer
    return true
  }
  return false
}

/** The audio frames of one MP3 file, without tags or a length header. */
export function audioFrames(b: Uint8Array): Uint8Array {
  let start = 0
  // ID3v2 at the start: "ID3", version, flags, then a 4-byte syncsafe size
  while (start + 10 <= b.length && b[start] === 0x49 && b[start + 1] === 0x44 && b[start + 2] === 0x33) {
    const size = (b[start + 6] << 21) | (b[start + 7] << 14) | (b[start + 8] << 7) | b[start + 9]
    start += 10 + size + ((b[start + 5] & 0x10) ? 10 : 0)
  }
  while (start < b.length && !frameLength(b, start)) start++
  const first = frameLength(b, start)
  if (first && (hasTag(b, start, start + Math.min(first, 200), 'Xing') ||
    hasTag(b, start, start + Math.min(first, 200), 'Info') || hasTag(b, start, start + Math.min(first, 200), 'VBRI'))) {
    start += first
  }
  let end = b.length
  // ID3v1 at the end: "TAG" + 125 bytes
  if (end - start >= 128 && b[end - 128] === 0x54 && b[end - 127] === 0x41 && b[end - 126] === 0x47) end -= 128
  return b.subarray(start, end)
}

export function joinMp3(parts: Uint8Array[]): Uint8Array {
  const frames = parts.map(audioFrames)
  const out = new Uint8Array(frames.reduce((n, f) => n + f.length, 0))
  let at = 0
  for (const f of frames) { out.set(f, at); at += f.length }
  return out
}
