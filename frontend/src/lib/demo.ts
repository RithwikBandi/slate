import { addDays, saveBlob, today, uid } from './util'
import type { Db, DriveAPI, DriveItem, Kit, Permission, Profile, Stage, Video } from './types'

// Demo mode: a pretend Drive that lives only in this browser. Nothing is uploaded anywhere.
// It behaves like the real thing (nested folders, move, rename, share, stream, download) so every
// workflow can be tried without signing in. All sample videos play the bundled /sample.mp4.

const KEY = 'slate-demo-v2'
export const DEMO_PROFILE: Profile = { name: 'Demo creator', email: 'demo@slate.local' }
const SAMPLE = '/sample.mp4'
const POSTER = '/sample-poster.jpg'
const MB = 1024 * 1024

interface Store {
  db: Db
  items: Record<string, DriveItem>
  perms: Record<string, Permission[]>
  rev: number
}

let mem: Store | null = null

const blankKit = (k: Partial<Kit> = {}): Kit => ({ title: '', description: '', pinnedComment: '', tags: '', shorts: '', reels: '', ...k })

function seed(): Store {
  const now = Date.now()
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString()
  const items: Record<string, DriveItem> = {}
  const add = (i: DriveItem) => (items[i.id] = i)
  const folder = (id: string, name: string, parent: string): string => {
    add({ id, name, kind: 'folder', mimeType: 'application/vnd.google-apps.folder', size: 0, createdTime: iso(6), modifiedTime: iso(2), parent })
    return id
  }
  const clip = (name: string, mb: number, parent: string, daysAgo: number, mime = 'video/mp4'): string => {
    const id = uid('f')
    add({ id, name, kind: 'file', mimeType: mime, size: Math.round(mb * MB), createdTime: iso(daysAgo), modifiedTime: iso(daysAgo), parent, thumbnailLink: POSTER, durationMs: 14000, width: 1080, height: 1920 })
    return id
  }
  const root = 'demo-root'
  const spaces = { root, raw: folder('demo-raw', 'Raw footage', root), edited: folder('demo-edited', 'Edited footage', root), thumbs: folder('demo-thumbs', 'Thumbnails', root) }

  const d4 = folder('demo-d4', 'Day 04 · Pricing', spaces.raw)
  const d5 = folder('demo-d5', 'Day 05 · Rejections', spaces.raw)
  const d6 = folder('demo-d6', 'Day 06 · Tools', spaces.raw)
  const rawPricing = clip('pricing_take.mov', 420, d4, 6, 'video/quicktime')
  const rawRej = clip('A001_main_take.mov', 504, d5, 3, 'video/quicktime')
  const rawRejB1 = clip('broll_phone.mov', 48, d5, 3, 'video/quicktime')
  const rawRejB2 = clip('broll_desk.mov', 41, d5, 3, 'video/quicktime')
  const rawTools = clip('tools_take1.mov', 380, d6, 2, 'video/quicktime')
  const rawTools2 = clip('tools_screen_capture.mov', 210, d6, 2, 'video/quicktime')

  const shorts = folder('demo-shorts', 'Shorts', spaces.edited)
  const pricingFinal = clip('pricing-final-v2.mp4', 44, shorts, 1)
  const pricingDraft = clip('pricing-draft-v1.mp4', 51, shorts, 2)
  const toolsFinal = clip('tools-final-v1.mp4', 38, shorts, 1)
  const meetingFinal = clip('prototype-meeting-final.mp4', 92, shorts, 4)
  const coldFinal = clip('first-cold-calls-final.mp4', 61, shorts, 5)
  const rejCut = clip('rejections-rough-cut.mp4', 57, spaces.edited, 1)

  const thumb = uid('f')
  add({ id: thumb, name: 'pricing-thumb.jpg', kind: 'file', mimeType: 'image/jpeg', size: Math.round(0.4 * MB), createdTime: iso(1), modifiedTime: iso(1), parent: spaces.thumbs, thumbnailLink: POSTER })

  const t = today()
  const description = "Today was the biggest day yet.\n\nWe presented our website prototype to the client, and she loved it.\n\nFollow along for the final decision.\n\n#dayinthelife #webdesign #agencylife #shorts"
  const base = (): Video => ({
    id: uid('v'), title: '', pitch: '', script: '', stage: 'idea', series: '', episode: null, publishDate: null, youtubeUrl: '',
    createdAt: iso(7), updatedAt: iso(1), publishedAt: null, kit: blankKit(), notes: '', markers: [], rawIds: [], editIds: [], finalId: null,
    thumbId: null, verified: [], localCleared: false, legacyFolderId: null,
  })
  const make = (p: Partial<Video> & { title: string; stage: Stage }): Video => ({ ...base(), ...p })
  const S = 'Another Day in the Making'

  const videos: Video[] = [
    make({
      title: 'Pricing my first website', stage: 'ready', series: S, episode: 4, publishDate: null,
      pitch: 'What I charged for a first site, why it was too low, and the number I would quote today.',
      script: "Hook: I priced my first website at ₹6,000 and I still think about it.\n\nBeat 1: Why I picked that number (fear, not maths).\nBeat 2: The three questions that fix pricing.\nBeat 3: The number I quote now.\n\nClose: Tell me your first price in the comments.",
      kit: blankKit({ title: 'I priced my first website. Here is the number.', description, pinnedComment: 'Too low or too high? Be honest.', tags: 'pricing, web design, freelancing' }),
      rawIds: [rawPricing], editIds: [pricingDraft, pricingFinal], finalId: pricingFinal, thumbId: thumb, verified: [pricingFinal],
      markers: [{ id: uid('m'), t: 3.2, text: 'Cut the pause before "six thousand"', at: iso(1) }, { id: uid('m'), t: 9.5, text: 'Add the price as on-screen text', at: iso(1) }],
    }),
    make({
      title: 'A day of rejections', stage: 'edit', series: S, episode: 5,
      pitch: 'Twenty calls, three conversations, one useful sentence.',
      script: 'Open on the third call. Keep it under 40 seconds.\n\nThe line that matters: "Come back when it is a priority."',
      rawIds: [rawRej, rawRejB1, rawRejB2], editIds: [rejCut],
    }),
    make({
      title: 'Tools I use every day', stage: 'scheduled', series: S, episode: 6, publishDate: addDays(t, 3),
      pitch: 'The five tools that run a one-person agency.',
      kit: blankKit({ title: 'The 5 tools that run my one-person agency', description }),
      rawIds: [rawTools, rawTools2], editIds: [toolsFinal], finalId: toolsFinal, verified: [toolsFinal],
    }),
    make({
      title: 'The prototype meeting', stage: 'published', series: S, episode: 3, publishDate: addDays(t, -1), publishedAt: iso(1),
      kit: blankKit({ title: 'She said "I\'m impressed with your work"', description, pinnedComment: 'Decision comes tomorrow. Do you think she says yes?' }),
      editIds: [meetingFinal], finalId: meetingFinal, verified: [meetingFinal],
    }),
    make({
      title: 'First cold calls', stage: 'published', series: S, episode: 2, publishDate: addDays(t, -2), publishedAt: iso(2),
      kit: blankKit({ title: 'I made 20 cold calls. This is what happened.', description }),
      editIds: [coldFinal], finalId: coldFinal,
    }),
    make({
      title: 'Handling "it is too expensive"', stage: 'script',
      pitch: 'Three replies that keep the conversation going without discounting.',
      script: 'Hook: The fastest way to lose a client is to say "I can do it for less".\n\nBeat 1: What the objection really means.\nBeat 2: ',
    }),
    make({ title: 'Home studio tour', stage: 'shoot', pitch: 'A 40-second tour of a desk that earns money.' }),
    make({ title: 'Why I started an agency', stage: 'idea', pitch: 'The origin story. One take at the desk, no b-roll.' }),
  ]

  const db: Db = {
    v: 2,
    spaces,
    templates: [
      { id: uid('t'), name: 'Series sign-off', kind: 'description', body: "That's another day in the making. See you tomorrow.\n\n#dayinthelife #buildinpublic #shorts" },
      { id: uid('t'), name: 'Core hashtags', kind: 'hashtags', body: '#dayinthelife #agencylife #buildinpublic #shorts' },
      { id: uid('t'), name: 'Question pin', kind: 'comment', body: 'What would you have done differently? Tell me below and I will reply to every one.' },
    ],
    videos,
  }
  return { db, items, perms: {}, rev: 1 }
}

function store(): Store {
  if (mem) return mem
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return (mem = JSON.parse(raw) as Store)
  } catch {
    /* corrupt or unavailable: reseed */
  }
  return (mem = seed())
}

function persist() {
  try {
    const s = store()
    const items = Object.fromEntries(Object.entries(s.items).map(([k, v]) => [k, { ...v, local: undefined }]))
    localStorage.setItem(KEY, JSON.stringify({ ...s, items }))
  } catch {
    /* storage full or blocked: the demo still works for this session */
  }
}

export function resetDemo() {
  mem = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const byName = (a: DriveItem, b: DriveItem) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.kind === 'folder' ? -1 : 1)
const OWNER: Permission = { id: 'owner', type: 'user', role: 'owner', email: DEMO_PROFILE.email, name: 'You' }

export function demoDrive(): DriveAPI {
  return {
    kind: 'demo',

    async open() {
      const s = store()
      return { rootId: 'demo-root', dbId: 'demo-db', db: structuredClone(s.db), rev: String(s.rev) }
    },

    async saveDb(db) {
      const s = store()
      s.db = structuredClone(db)
      s.rev++
      persist()
      return String(s.rev)
    },

    async createFolder(name, parentId) {
      await sleep(120)
      const now = new Date().toISOString()
      const item: DriveItem = { id: uid('d'), name, kind: 'folder', mimeType: 'application/vnd.google-apps.folder', size: 0, createdTime: now, modifiedTime: now, parent: parentId }
      store().items[item.id] = item
      persist()
      return item
    },

    async list(folderId) {
      await sleep(140)
      return { items: Object.values(store().items).filter((i) => i.parent === folderId).sort(byName) }
    },

    async search(q) {
      await sleep(100)
      const n = q.toLowerCase()
      return Object.values(store().items).filter((i) => i.name.toLowerCase().includes(n)).sort(byName).slice(0, 40)
    },

    async get(id) {
      return store().items[id] ?? null
    },

    upload(file, folderId, h) {
      return new Promise<DriveItem>((resolve, reject) => {
        const s = h.session
        const perTick = Math.max(file.size / 28, 1) // about 2.5 s for any size, so progress is visible
        const stop = () => {
          clearInterval(timer)
          reject(new DOMException('Upload paused', 'AbortError'))
        }
        const timer = setInterval(() => {
          s.offset = Math.min(file.size, s.offset + perTick)
          h.onProgress(s.offset)
          if (s.offset < file.size) return
          clearInterval(timer)
          h.signal.removeEventListener('abort', stop)
          const now = new Date().toISOString()
          const made: DriveItem = {
            id: uid('f'), name: file.name, kind: 'file', mimeType: file.type || 'application/octet-stream', size: file.size,
            createdTime: now, modifiedTime: now, parent: folderId, local: URL.createObjectURL(file),
            ...(file.type.startsWith('video/') ? { thumbnailLink: POSTER } : {}), ...(file.type.startsWith('image/') ? { thumbnailLink: URL.createObjectURL(file) } : {}),
          }
          store().items[made.id] = made
          persist()
          resolve(made)
        }, 90)
        if (h.signal.aborted) return stop()
        h.signal.addEventListener('abort', stop, { once: true })
      })
    },

    async move(id, _from, toId) {
      const it = store().items[id]
      if (it) it.parent = toId
      persist()
    },

    async rename(id, name) {
      const it = store().items[id]
      if (it) it.name = name
      persist()
    },

    async trash(id) {
      const s = store()
      const drop = (x: string) => {
        for (const c of Object.values(s.items)) if (c.parent === x) drop(c.id)
        delete s.items[x]
      }
      drop(id)
      persist()
    },

    async quota() {
      const used = Object.values(store().items).reduce((n, f) => n + f.size, 0)
      return { used: used + 2.1 * 1024 * MB, limit: 15 * 1024 * MB }
    },

    async permissions(id) {
      return [OWNER, ...(store().perms[id] ?? [])]
    },

    async share(id, to) {
      const p: Permission = { id: uid('perm'), type: to.type, role: to.role, email: to.email, name: to.email }
      const s = store()
      s.perms[id] = [...(s.perms[id] ?? []).filter((x) => !(to.type === 'anyone' && x.type === 'anyone')), p]
      persist()
      return p
    },

    async unshare(id, permissionId) {
      const s = store()
      s.perms[id] = (s.perms[id] ?? []).filter((p) => p.id !== permissionId)
      persist()
    },

    async mediaUrl(item) {
      return item.local ?? SAMPLE
    },

    async download(item, { onProgress, signal }) {
      const res = await fetch(item.local ?? SAMPLE, { signal })
      const total = Number(res.headers.get('content-length') || 0) || item.size
      const reader = res.body!.getReader()
      const chunks: Uint8Array[] = []
      let got = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        got += value.length
        onProgress(got, total)
        await sleep(60) // slow enough to see the progress
      }
      saveBlob(item.name, new Blob(chunks as BlobPart[], { type: item.mimeType }))
    },

    async writeText() {},

    folderUrl: () => 'https://drive.google.com/drive/my-drive',
  }
}
