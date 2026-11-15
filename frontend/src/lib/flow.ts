import { create } from 'zustand'
import { STAGES, stageIndex, type DriveItem, type SpaceId, type Stage, type Video } from './types'
import { addDays, dayDiff, today, wordCount } from './util'

// ---------------------------------------------------------------- global dialogs
export interface UploadRequest {
  files: File[]
  space?: SpaceId
  folderId?: string
  /** Attach the uploads to a video as soon as they finish. */
  videoId?: string
  as?: 'raw' | 'final' | 'thumb'
}

interface UIState {
  palette: boolean
  newIdea: { stage?: Stage; series?: string } | null
  upload: UploadRequest | null
  sendTo: DriveItem | null // an edited file being sent to Uploads
  linkRaw: DriveItem | null // a raw file being linked to a video
  share: DriveItem | null
  move: DriveItem[] | null
  pick: { videoId: string; kind: 'raw' | 'edit' | 'thumb' } | null // choose library files to attach to a video
}

export const useUI = create<UIState>(() => ({ palette: false, newIdea: null, upload: null, sendTo: null, linkRaw: null, share: null, move: null, pick: null }))
export const openUpload = (req: Partial<UploadRequest> = {}) => useUI.setState({ upload: { files: [], ...req } })
export const openNewIdea = (opts: { stage?: Stage; series?: string } = {}) => useUI.setState({ newIdea: opts })

// ---------------------------------------------------------------- paths
export const videoPath = (id: string, tab?: string) => `/app/v/${id}${tab ? `?tab=${tab}` : ''}`

// ---------------------------------------------------------------- readiness
export interface Check {
  key: string
  label: string
  ok: boolean
  tab: string
}

/** What a video still needs before it can go live. */
export function readiness(v: Video): { items: Check[]; done: number; total: number; ready: boolean } {
  const items: Check[] = [
    { key: 'title', label: 'Title', ok: !!v.kit.title.trim(), tab: 'kit' },
    { key: 'description', label: 'Description', ok: !!v.kit.description.trim(), tab: 'kit' },
    { key: 'final', label: 'Final export', ok: !!v.finalId, tab: 'footage' },
    { key: 'thumb', label: 'Thumbnail', ok: !!v.thumbId, tab: 'kit' },
    { key: 'date', label: 'Publish date', ok: !!v.publishDate, tab: 'publish' },
  ]
  const done = items.filter((i) => i.ok).length
  return { items, done, total: items.length, ready: items.slice(0, 3).every((i) => i.ok) }
}

// ---------------------------------------------------------------- the next step on a video
export interface NextStep {
  label: string
  hint: string
  tab: string
  /** Moving to this stage is part of the step. */
  advanceTo?: Stage
}

export function nextStep(v: Video): NextStep {
  switch (v.stage) {
    case 'idea': return { label: 'Start the script', hint: 'Turn the idea into a script', tab: 'script', advanceTo: 'script' }
    case 'script': return { label: 'Script done: start shooting', hint: 'Move to the shoot stage', tab: 'footage', advanceTo: 'shoot' }
    case 'shoot': return { label: 'Footage is in: start editing', hint: 'Link your raw footage, then cut', tab: 'footage', advanceTo: 'edit' }
    case 'edit': return { label: 'Add the final export', hint: 'Upload or pick the edited video and it moves to Uploads', tab: 'footage' }
    case 'ready': return { label: 'Choose a publish date', hint: 'Schedule it on your calendar', tab: 'publish' }
    case 'scheduled': return { label: 'Open publish mode', hint: 'Download, copy and paste into YouTube Studio', tab: 'publish' }
    case 'published': return { label: 'See how it did', hint: 'Add the link to track views', tab: 'publish' }
  }
}

// ---------------------------------------------------------------- uploads page buckets
export function splitUploads(videos: Video[]) {
  const t = today()
  const inUploads = videos.filter((v) => stageIndex(v.stage) >= stageIndex('ready'))
  const byDate = (a: Video, b: Video) => (a.publishDate ?? '9999').localeCompare(b.publishDate ?? '9999')
  return {
    ready: inUploads.filter((v) => v.stage === 'ready').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    overdue: inUploads.filter((v) => v.stage === 'scheduled' && v.publishDate && v.publishDate < t).sort(byDate),
    upcoming: inUploads.filter((v) => v.stage === 'scheduled' && v.publishDate && v.publishDate >= t).sort(byDate),
    published: inUploads.filter((v) => v.stage === 'published').sort((a, b) => (b.publishDate ?? b.publishedAt ?? '').localeCompare(a.publishDate ?? a.publishedAt ?? '')),
  }
}

// ---------------------------------------------------------------- dashboard rules
export interface NextUp {
  video: Video
  headline: string
  detail: string
  cta: string
  to: string
  urgent: boolean
}

/** The one thing that deserves attention right now, with a button that goes straight to it. */
export function nextUp(videos: Video[]): NextUp | null {
  const t = today()
  const oldest = (a: Video, b: Video) => a.updatedAt.localeCompare(b.updatedAt)
  const due = videos.filter((v) => (v.stage === 'scheduled' || v.stage === 'ready') && v.publishDate && dayDiff(v.publishDate, t) <= 1).sort((a, b) => a.publishDate!.localeCompare(b.publishDate!))[0]
  if (due) {
    const n = dayDiff(due.publishDate!, t)
    return { video: due, headline: n < 0 ? 'Overdue: publish this now' : n === 0 ? 'Publish today' : 'Publish tomorrow', detail: readiness(due).ready ? 'Everything is ready. Walk through publish mode.' : 'It is missing a few things. Check the list before you post.', cta: 'Open publish mode', to: videoPath(due.id, 'publish'), urgent: n <= 0 }
  }
  const ready = videos.filter((v) => v.stage === 'ready').sort(oldest)[0]
  if (ready) return { video: ready, headline: 'Schedule your next upload', detail: 'This edit is finished and waiting for a date.', cta: 'Pick a date', to: videoPath(ready.id, 'publish'), urgent: false }
  const editing = videos.filter((v) => v.stage === 'edit').sort(oldest)[0]
  if (editing) return { video: editing, headline: 'Finish the edit', detail: editing.rawIds.length ? `${editing.rawIds.length} raw clip${editing.rawIds.length === 1 ? '' : 's'} linked. Upload the export when it is done.` : 'Link the raw footage you are cutting from.', cta: 'Open footage', to: videoPath(editing.id, 'footage'), urgent: false }
  const shooting = videos.filter((v) => v.stage === 'shoot').sort(oldest)[0]
  if (shooting) return { video: shooting, headline: 'Upload the footage you shot', detail: 'Put the raw clips in the Library and link them here.', cta: 'Add footage', to: videoPath(shooting.id, 'footage'), urgent: false }
  const scripting = videos.filter((v) => v.stage === 'script').sort(oldest)[0]
  if (scripting) return { video: scripting, headline: 'Finish the script', detail: `${wordCount(scripting.script)} words so far.`, cta: 'Keep writing', to: videoPath(scripting.id, 'script'), urgent: false }
  const idea = videos.filter((v) => v.stage === 'idea').sort(oldest)[0]
  if (idea) return { video: idea, headline: 'Turn an idea into a script', detail: idea.pitch || 'Start with the hook.', cta: 'Write the script', to: videoPath(idea.id, 'script'), urgent: false }
  return null
}

export interface Attention {
  id: string
  videoId: string
  level: 'bad' | 'warn' | 'info'
  text: string
  to: string
}

/** Things that will bite later: gaps on videos that are close to publishing, and stalled work. */
export function attention(videos: Video[]): Attention[] {
  const t = today()
  const out: Attention[] = []
  for (const v of videos) {
    const push = (level: Attention['level'], text: string, tab: string) => out.push({ id: `${v.id}:${text}`, videoId: v.id, level, text: `${v.title}: ${text}`, to: videoPath(v.id, tab) })
    const r = readiness(v)
    if (v.stage === 'scheduled' && v.publishDate) {
      const n = dayDiff(v.publishDate, t)
      if (n < 0) push('bad', 'scheduled in the past and not published', 'publish')
      else if (n <= 3) for (const c of r.items.filter((i) => !i.ok && i.key !== 'date' && i.key !== 'thumb')) push(n <= 1 ? 'bad' : 'warn', `no ${c.label.toLowerCase()} yet (publishes ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`})`, c.tab)
    }
    if (v.stage === 'ready' && !v.finalId) push('warn', 'marked ready but has no final export', 'footage')
    if (v.stage === 'edit' && v.rawIds.length === 0) push('info', 'in edit with no raw footage linked', 'footage')
    const idle = dayDiff(t, v.updatedAt.slice(0, 10))
    if ((v.stage === 'script' || v.stage === 'shoot' || v.stage === 'edit') && idle >= 7) push('info', `untouched for ${idle} days`, v.stage === 'script' ? 'script' : 'footage')
    if (v.stage === 'idea' && idle >= 21) push('info', `idea sitting for ${idle} days`, 'script')
  }
  const rank = { bad: 0, warn: 1, info: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}

/** The next seven days, with whatever is scheduled on each. */
export function weekPlan(videos: Video[]): { date: string; videos: Video[] }[] {
  const t = today()
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(t, i)
    return { date, videos: videos.filter((v) => v.publishDate === date && v.stage !== 'published') }
  })
}

export const pipelineCounts = (videos: Video[]) => Object.fromEntries(STAGES.map((s) => [s.id, videos.filter((v) => v.stage === s.id).length])) as Record<Stage, number>
