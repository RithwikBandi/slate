import { create } from 'zustand'
import type { DriveItem, Video } from './types'

export const uid = (prefix = 'p') =>
  `${prefix}_${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')}`

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 MB'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const v = n / 1024 ** i
  return `${v >= 100 || i < 2 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export const fmtSpeed = (bps: number) => (bps > 0 ? `${fmtBytes(bps)}/s` : '')

/** 83 -> "1:23", 3723 -> "1:02:03" */
export function fmtClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec % 60)
  const m = Math.floor((sec / 60) % 60)
  const h = Math.floor(sec / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export const fmtEta = (sec: number) => (!Number.isFinite(sec) || sec <= 0 ? '' : sec < 60 ? `${Math.ceil(sec)}s left` : sec < 3600 ? `${Math.ceil(sec / 60)} min left` : `${(sec / 3600).toFixed(1)} h left`)

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const today = () => isoDay(new Date())
export const parseDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (iso: string, n: number) => {
  const d = parseDay(iso)
  d.setDate(d.getDate() + n)
  return isoDay(d)
}
export const dayDiff = (a: string, b: string) => Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / 86400000)

export function fmtDay(iso: string | null | undefined, withYear = false): string {
  if (!iso) return 'No date'
  const d = iso.length === 10 ? parseDay(iso) : new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) })
}

export function relDay(iso: string | null): string {
  if (!iso) return 'Unscheduled'
  const n = dayDiff(iso, today())
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  return n > 0 ? `In ${n} days` : `${-n} days ago`
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`
  return fmtDay(iso, true)
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)
export const readMinutes = (t: string) => wordCount(t) / 150 // spoken pace, words per minute

export function ytId(url: string): string | null {
  const m = /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/.exec(url.trim())
  return m ? m[1] : null
}

export const stripExt = (name: string) => name.replace(/\.[^./]+$/, '')
export const isVideoItem = (i: DriveItem) => i.kind === 'file' && (i.mimeType.startsWith('video/') || /\.(mp4|mov|m4v|mkv|webm|avi|mxf)$/i.test(i.name))
export const isImageItem = (i: DriveItem) => i.kind === 'file' && i.mimeType.startsWith('image/')

/** Guess whether a dropped file is a finished export or camera footage, from its name. */
export const guessEdited = (name: string) => /(final|export|master|render|edit|cut|v\d+|publish)/i.test(name)

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export const downloadText = (name: string, text: string, type = 'application/json') => saveBlob(name, new Blob([text], { type }))

/** Plain-text version of a publish kit, used by "Copy whole kit". */
export function kitText(v: Video): string {
  const k = v.kit
  const block = (label: string, body: string) => (body.trim() ? `${label}\n${'-'.repeat(label.length)}\n${body.trim()}\n\n` : '')
  return (
    `${v.title}\n${'='.repeat(Math.max(4, v.title.length))}\n` +
    `${v.series ? `Series: ${v.series}${v.episode ? ` #${v.episode}` : ''}  |  ` : ''}Stage: ${v.stage}${v.publishDate ? `  |  Publish: ${v.publishDate}` : ''}${v.youtubeUrl ? `\nLink: ${v.youtubeUrl}` : ''}\n\n` +
    block('TITLE', k.title) +
    block('DESCRIPTION', k.description) +
    block('TAGS', k.tags) +
    block('PINNED COMMENT', k.pinnedComment) +
    block('SHORTS CAPTION', k.shorts) +
    block('REELS CAPTION', k.reels) +
    block('NOTES', v.notes)
  )
}

/** Consecutive days (ending today or yesterday) with at least one published video. */
export function streak(videos: Video[]): number {
  const days = new Set(videos.filter((v) => v.stage === 'published').map((v) => v.publishDate ?? (v.publishedAt ? isoDay(new Date(v.publishedAt)) : '')))
  let day = today()
  if (!days.has(day)) day = addDays(day, -1)
  let n = 0
  while (days.has(day)) {
    n++
    day = addDays(day, -1)
  }
  return n
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  const d = (...a: A) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
  d.cancel = () => clearTimeout(t)
  return d
}

// ---- toasts (tiny global store so non-React code can report outcomes) ----
export interface Toast {
  id: string
  msg: string
  kind: 'ok' | 'bad' | 'info'
  action?: { label: string; run(): void }
}
export const useToasts = create<{ list: Toast[] }>(() => ({ list: [] }))
export function toast(msg: string, kind: Toast['kind'] = 'ok', action?: Toast['action']) {
  const id = uid('t')
  useToasts.setState((s) => ({ list: [...s.list.slice(-3), { id, msg, kind, action }] }))
  setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) })), action ? 8000 : kind === 'bad' ? 6500 : 3200)
}
export const dismissToast = (id: string) => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) }))
