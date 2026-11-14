import { addDays, today, uid } from './util'
import type { Db, DriveAPI, DriveFile, Kit, Profile, Project, Status } from './types'

// Demo mode: a pretend Drive that lives only in this browser. Nothing is uploaded anywhere.
// It lets visitors try Slate without signing in, and lets the app be tested without Google.

const KEY = 'slate-demo-v1'
export const DEMO_PROFILE: Profile = { name: 'Demo creator', email: 'demo@slate.local' }

interface Store {
  db: Db
  files: Record<string, DriveFile[]>
  rev: number
}

let mem: Store | null = null
const MB = 1024 * 1024

function seed(): Store {
  const files: Record<string, DriveFile[]> = {}
  const t = today()
  const file = (name: string, mb: number, mimeType: string, daysAgo: number): DriveFile => ({
    id: uid('f'),
    name,
    size: Math.round(mb * MB),
    mimeType,
    createdTime: new Date(Date.now() - daysAgo * 86400000).toISOString(),
  })
  const kit = (k: Partial<Kit>): Kit => ({ title: '', description: '', pinnedComment: '', tags: '', shorts: '', reels: '', notes: '', ...k })

  const mk = (title: string, status: Status, episode: number | null, offset: number | null, k: Partial<Kit>, withFiles: boolean): Project => {
    const id = uid('p')
    const now = new Date().toISOString()
    const p: Project = {
      id,
      title,
      status,
      series: episode ? 'Another Day in the Making' : '',
      episode,
      publishDate: offset === null ? null : addDays(t, offset),
      youtubeUrl: '',
      createdAt: now,
      updatedAt: now,
      publishedAt: status === 'published' ? now : null,
      folderId: null,
      folders: [],
      kit: kit(k),
      finalFileId: null,
      verified: [],
      localCleared: false,
    }
    if (withFiles) {
      p.folderId = uid('d')
      p.folders = [
        { id: uid('d'), name: 'Raw footage', kind: 'raw' },
        { id: uid('d'), name: 'Edited', kind: 'edited' },
        { id: uid('d'), name: 'Thumbnails', kind: 'thumbs' },
      ]
      const [raw, edited, thumbs] = p.folders
      files[raw.id] = [file('A001_main_take.mov', 504, 'video/quicktime', 3), file('broll_desk.mov', 48, 'video/quicktime', 3)]
      const final = file(`${title.replace('Sample: ', '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-final-v2.mp4`, 44.4, 'video/mp4', 1)
      files[edited.id] = [final, file('draft-v1.mp4', 51.2, 'video/mp4', 2)]
      files[thumbs.id] = [file('thumb-a.png', 1.4, 'image/png', 1)]
      if (status !== 'editing') {
        p.finalFileId = final.id
        p.verified = [final.id]
      }
    }
    return p
  }

  const description =
    'Today was the biggest day yet.\n\nWe presented our website prototype to the client, and she loved it.\n\nFollow along for the final decision.\n\n#dayinthelife #webdesign #agencylife #shorts'

  const db: Db = {
    v: 1,
    libraryFolderId: null,
    templates: [
      { id: uid('t'), name: 'Series sign-off', kind: 'description', body: "That's another day in the making. See you tomorrow.\n\n#dayinthelife #buildinpublic #shorts" },
      { id: uid('t'), name: 'Core hashtags', kind: 'hashtags', body: '#dayinthelife #agencylife #buildinpublic #shorts' },
      { id: uid('t'), name: 'Question pin', kind: 'comment', body: 'What would you have done differently? Tell me below and I will reply to every one.' },
    ],
    projects: [
      mk('Sample: Pricing my first website', 'ready', 4, 0, { title: 'I priced my first website. Here is the number.', description, pinnedComment: 'Too low or too high? Be honest.', tags: 'pricing, web design, freelancing' }, true),
      mk('Sample: A day of rejections', 'editing', 5, 2, { notes: 'Open on the third call. Keep it under 40 seconds.' }, true),
      mk('Sample: Tools I use every day', 'scheduled', 6, 4, { title: 'The 5 tools that run my one-person agency', description }, true),
      mk('Sample: The prototype meeting', 'published', 3, -1, { title: 'She said "I\'m impressed with your work"', description, pinnedComment: 'Decision comes tomorrow. Do you think she says yes?' }, true),
      mk('Sample: First cold calls', 'published', 2, -2, { title: 'I made 20 cold calls. This is what happened.', description }, true),
      mk('Sample: Why I started an agency', 'idea', null, null, { notes: 'Origin story. Shoot at the desk, one take.' }, false),
    ],
  }
  return { db, files, rev: 1 }
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
    localStorage.setItem(KEY, JSON.stringify(mem))
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

export function demoDrive(): DriveAPI {
  return {
    kind: 'demo',

    async open() {
      const s = store()
      return { rootId: 'demo-root', db: structuredClone(s.db), rev: String(s.rev) }
    },

    async saveDb(db) {
      const s = store()
      s.db = structuredClone(db)
      s.rev++
      persist()
      return String(s.rev)
    },

    async createFolder() {
      const id = uid('d')
      store().files[id] = []
      persist()
      return id
    },

    async listFiles(folderId) {
      await new Promise((r) => setTimeout(r, 120))
      return [...(store().files[folderId] ?? [])]
    },

    upload(file, folderId, h) {
      return new Promise<DriveFile>((resolve, reject) => {
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
          const made: DriveFile = {
            id: uid('f'),
            name: file.name,
            size: file.size,
            mimeType: file.type || 'application/octet-stream',
            createdTime: new Date().toISOString(),
            webContentLink: URL.createObjectURL(file),
          }
          const st = store()
          st.files[folderId] = [made, ...(st.files[folderId] ?? [])]
          persist()
          resolve(made)
        }, 90)
        if (h.signal.aborted) return stop()
        h.signal.addEventListener('abort', stop, { once: true })
      })
    },

    async trash(id) {
      const s = store()
      for (const k of Object.keys(s.files)) s.files[k] = s.files[k].filter((f) => f.id !== id)
      delete s.files[id]
      persist()
    },

    async rename() {},

    async quota() {
      const used = Object.values(store().files).flat().reduce((n, f) => n + f.size, 0)
      return { used: used + 2.1 * 1024 * MB, limit: 15 * 1024 * MB }
    },

    async shareLink(folderId) {
      return `https://drive.google.com/drive/folders/${folderId} (demo link, not real)`
    },

    async writeText() {},

    folderUrl: () => 'https://drive.google.com/drive/my-drive',
  }
}
