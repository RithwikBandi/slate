import { create } from 'zustand'
import type { Project } from './types'

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

export function ytId(url: string): string | null {
  const m = /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/.exec(url.trim())
  return m ? m[1] : null
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function downloadText(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Plain-text version of a publish kit: what gets written next to the footage in Drive. */
export function kitText(p: Project): string {
  const k = p.kit
  const block = (label: string, body: string) => (body.trim() ? `${label}\n${'-'.repeat(label.length)}\n${body.trim()}\n\n` : '')
  return (
    `${p.title}\n${'='.repeat(Math.max(4, p.title.length))}\n` +
    `Status: ${p.status}${p.series ? `  |  Series: ${p.series}${p.episode ? ` #${p.episode}` : ''}` : ''}` +
    `${p.publishDate ? `  |  Publish: ${p.publishDate}` : ''}${p.youtubeUrl ? `\nLink: ${p.youtubeUrl}` : ''}\n\n` +
    block('TITLE', k.title) +
    block('DESCRIPTION', k.description) +
    block('TAGS', k.tags) +
    block('PINNED COMMENT', k.pinnedComment) +
    block('SHORTS CAPTION', k.shorts) +
    block('REELS CAPTION', k.reels) +
    block('NOTES', k.notes)
  )
}

/** Consecutive days (ending today or yesterday) with at least one published video. */
export function streak(projects: Project[]): number {
  const days = new Set(
    projects.filter((p) => p.status === 'published').map((p) => p.publishDate ?? (p.publishedAt ? isoDay(new Date(p.publishedAt)) : '')),
  )
  let day = today()
  if (!days.has(day)) day = addDays(day, -1)
  let n = 0
  while (days.has(day)) {
    n++
    day = addDays(day, -1)
  }
  return n
}

// ---- toasts (tiny global store so non-React code can report outcomes) ----
export interface Toast {
  id: string
  msg: string
  kind: 'ok' | 'bad' | 'info'
}
export const useToasts = create<{ list: Toast[] }>(() => ({ list: [] }))
export function toast(msg: string, kind: Toast['kind'] = 'ok') {
  const id = uid('t')
  useToasts.setState((s) => ({ list: [...s.list.slice(-3), { id, msg, kind }] }))
  setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) })), kind === 'bad' ? 6000 : 3200)
}
