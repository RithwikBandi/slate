import { addDays, saveBlob, today, uid } from './util'
import type { Db, DriveAPI, DriveItem, Kit, Permission, Profile, Stage, Video } from './types'

// Demo mode: a pretend Drive that lives only in this browser. Nothing is uploaded anywhere.
// It behaves like the real thing (nested folders, move, rename, share, stream, download) so every
// workflow can be tried without signing in. The sample videos are short excerpts of Rithwik's own
// daily Shorts and raw takes, bundled in /demo (each clip's poster and media share a name).

const KEY = 'slate-demo-v3'
export const DEMO_PROFILE: Profile = { name: 'ItsRithwik', email: 'demo@slate.local' }
const SAMPLE = '/sample.mp4'
const POSTER = '/sample-poster.jpg'
const MB = 1024 * 1024
/** A seeded clip keeps its poster in /demo/NAME.jpg; the matching excerpt is /demo/NAME.mp4. */
const mediaOf = (i: DriveItem): string => i.local ?? (i.thumbnailLink?.startsWith('/demo/') && i.mimeType.startsWith('video/') ? i.thumbnailLink.replace(/\.jpg$/, '.mp4') : SAMPLE)

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
  const clip = (name: string, mb: number, parent: string, daysAgo: number, media: string, secs: number, mime = 'video/mp4'): string => {
    const id = uid('f')
    add({ id, name, kind: 'file', mimeType: mime, size: Math.round(mb * MB), createdTime: iso(daysAgo), modifiedTime: iso(daysAgo), parent, thumbnailLink: `/demo/${media}.jpg`, durationMs: secs * 1000, width: 1080, height: 1920 })
    return id
  }
  const root = 'demo-root'
  const spaces = { root, raw: folder('demo-raw', 'Raw footage', root), edited: folder('demo-edited', 'Edited footage', root), thumbs: folder('demo-thumbs', 'Thumbnails', root) }

  const day2 = folder('demo-d2', 'Day 02 · Sales day', spaces.raw)
  const day3 = folder('demo-d3', 'Day 03 · Prototype meeting', spaces.raw)
  const QT = 'video/quicktime'
  const rawCalls = clip('broll_cold_calling.MOV', 96, day2, 4, 'r1', 8, QT)
  const rawSheet = clip('broll_leadsheet.MOV', 74, day2, 4, 'r2', 8, QT)
  const rawMeet = clip('broll_meet_demo.MOV', 118, day2, 4, 'r3', 8, QT)
  const rawResearch = clip('broll_researching.MOV', 88, day2, 4, 'r4', 8, QT)
  const rawNotes = clip('broll_taking_notes.MOV', 77, day2, 4, 'r5', 8, QT)
  const rawFinish = clip('Video_3_FinishLine.MOV', 25, day3, 3, 'r6', 3, QT)

  const shorts = folder('demo-shorts', 'Shorts', spaces.edited)
  const sundayFinal = clip('Video_5_v3.mp4', 48, shorts, 0, 'd5', 12)
  const sundayDraft = clip('Video_5_v2.mp4', 50, shorts, 0, 'd5', 12)
  const saturdayFinal = clip('Video_4_v3.mp4', 43, shorts, 1, 'd4', 10)
  const meetingFinal = clip('Video_3_v2.mp4', 41, shorts, 2, 'd3', 12)
  const salesFinal = clip('Video_2_v2.mp4', 89, shorts, 3, 'd2', 12)
  clip('Video_5_v1.mp4', 57, shorts, 0, 'd5', 12) // an earlier cut, not linked to a video yet: shows Send to Uploads

  const thumb = uid('f')
  add({ id: thumb, name: 'ItsRithwik_Thumbnail.jpg', kind: 'file', mimeType: 'image/jpeg', size: Math.round(0.4 * MB), createdTime: iso(1), modifiedTime: iso(1), parent: spaces.thumbs, thumbnailLink: '/demo/thumb.jpg' })

  const t = today()
  const tagsLine = '#buildinpublic #dayinthelife #shorts'
  const base = (): Video => ({
    id: uid('v'), title: '', pitch: '', script: '', stage: 'idea', series: '', episode: null, publishDate: null, youtubeUrl: '',
    createdAt: iso(7), updatedAt: iso(1), publishedAt: null, kit: blankKit(), notes: '', markers: [], rawIds: [], editIds: [], finalId: null,
    thumbId: null, verified: [], localCleared: false, legacyFolderId: null,
  })
  const make = (p: Partial<Video> & { title: string; stage: Stage }): Video => ({ ...base(), ...p })
  const S = 'Another Day in the Making'

  const videos: Video[] = [
    make({
      title: 'Sunday: the app I stayed up building', stage: 'ready', series: S, episode: 5, publishDate: null,
      pitch: 'A late night, an idea that became a working app, and a Sunday that started at 2 PM.',
      script: "Today was a little different. I stayed up late last night, working on an idea and actually turning it into a working application. So, naturally, my Sunday started at 2 PM.\n\nApart from that, I got back to prospect follow-ups, continued building the application, and finally cleared some long-pending tasks on my GitHub and portfolio.\n\nI also spent some time researching YouTube and working on what's next.\n\nBut there's something I'm particularly excited about.\n\nI'll be sharing the application I've been building in tomorrow's video. I'll dedicate an entire video to the idea, what it does, and how I built it.\n\nSo, stay tuned.\n\nStill figuring out, still building.\n\nSee you tomorrow.",
      kit: blankKit({ title: 'I stayed up late and built a working app', description: `Today was a little different.\n\nI stayed up late turning an idea into a working application, so my Sunday started at 2 PM.\n\nTomorrow: the app itself.\n\n${tagsLine}`, pinnedComment: 'The app reveal is tomorrow. Any guesses what it does?', tags: 'build in public, day in the life, indie developer, web app' }),
      editIds: [sundayDraft, sundayFinal], finalId: sundayFinal, thumbId: thumb, verified: [sundayFinal],
      markers: [{ id: uid('m'), t: 3.0, text: 'Zoom should ease in slowly, not snap', at: iso(0) }, { id: uid('m'), t: 9.5, text: 'Captions must stay below the face', at: iso(0) }],
    }),
    make({
      title: 'Slate: the app reveal', stage: 'script', series: S, episode: 6,
      pitch: 'Show the app I teased for two days. The app is the hero, not me.',
      script: "Remember the app I stayed up late building? This is it.\n\nIt's called Slate.\n\nEvery video I make has a script, raw footage, edits, a thumbnail, a title. And all of it was scattered everywhere.\n\nSo I built one place for all of it.\n\nA video starts as an idea on this board.\n\nI write the script right inside it, and there's even a teleprompter.\n\nMy footage sits in a library, raw and edited, and it plays right in the app.\n\nAnd when the video is ready, the title, description and tags are waiting. I just copy, paste, publish.\n\nThe best part: nothing is stored with me. Everything stays in your own Google Drive.\n\nIt's live, it's free, and the code is open on GitHub.\n\nWould you use it? Tell me in the comments.\n\nStill figuring out, still building.",
    }),
    make({
      title: 'Saturday at the office', stage: 'published', series: S, episode: 4, publishDate: addDays(t, -1), publishedAt: iso(1),
      kit: blankKit({ title: 'A call forwarding issue cost me a prospect', description: `It was Saturday, but we still had office.\n\nOne discovery call, one forwarding mistake, and an idea I turned into a working app.\n\n${tagsLine}`, pinnedComment: 'Has a small technical mistake ever cost you a client?' }),
      editIds: [saturdayFinal], finalId: saturdayFinal, verified: [saturdayFinal],
    }),
    make({
      title: 'The prototype meeting', stage: 'published', series: S, episode: 3, publishDate: addDays(t, -2), publishedAt: iso(2),
      kit: blankKit({ title: 'She said "I\'m impressed with your work"', description: `We presented our website prototype to the client, and she loved it.\n\nFollow along for the final decision.\n\n${tagsLine}`, pinnedComment: 'Decision comes tomorrow. Do you think she says yes?' }),
      rawIds: [rawFinish], editIds: [meetingFinal], finalId: meetingFinal, verified: [meetingFinal],
    }),
    make({
      title: 'Sales day: 50 cold calls', stage: 'published', series: S, episode: 2, publishDate: addDays(t, -3), publishedAt: iso(3),
      kit: blankKit({ title: '50 cold calls, one closed client', description: `A full day of calls, a closed client and my first proper discovery call.\n\n${tagsLine}` }),
      rawIds: [rawCalls, rawSheet, rawMeet, rawResearch, rawNotes], editIds: [salesFinal], finalId: salesFinal,
    }),
    make({ title: 'My video workflow, start to finish', stage: 'shoot', pitch: 'Idea, script, shoot, edit, publish: how one daily Short gets made.' }),
    make({ title: 'A week of building in public', stage: 'idea', pitch: 'Seven days, what worked, what did not.' }),
    make({ title: 'What I would tell myself on day one', stage: 'idea', pitch: 'One take at the desk, no b-roll.' }),
  ]

  const db: Db = {
    v: 2,
    spaces,
    templates: [
      { id: uid('t'), name: 'Series sign-off', kind: 'description', body: "Still figuring out, still building. See you tomorrow.\n\n#dayinthelife #buildinpublic #shorts" },
      { id: uid('t'), name: 'Core hashtags', kind: 'hashtags', body: '#dayinthelife #buildinpublic #shorts' },
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
      return mediaOf(item)
    },

    async download(item, { onProgress, signal }) {
      const res = await fetch(mediaOf(item), { signal })
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
