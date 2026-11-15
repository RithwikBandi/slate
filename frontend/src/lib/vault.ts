import { useEffect } from 'react'
import { create } from 'zustand'
import { fetchSession, logout } from './auth'
import { DEMO_PROFILE, demoDrive, resetDemo } from './demo'
import { googleDrive } from './drive'
import { Conflict, stageIndex, type Db, type DriveAPI, type DriveItem, type Kit, type Profile, type Quota, type Stage, type Template, type Video } from './types'
import { addDays, debounce, toast, today, uid } from './util'

const MODE_KEY = 'slate-mode'
const LAST_KEY = 'slate-last-v2'
const LS_KEY = 'slate-listings-v2'

export const emptyKit = (): Kit => ({ title: '', description: '', pinnedComment: '', tags: '', shorts: '', reels: '' })
export const emptyDb = (): Db => ({ v: 2, videos: [], templates: [], spaces: null })

export const blankVideo = (): Video => {
  const now = new Date().toISOString()
  return {
    id: uid('v'), title: 'Untitled video', pitch: '', script: '', stage: 'idea', series: '', episode: null, publishDate: null, youtubeUrl: '',
    createdAt: now, updatedAt: now, publishedAt: null, kit: emptyKit(), notes: '', markers: [], rawIds: [], editIds: [], finalId: null,
    thumbId: null, verified: [], localCleared: false, legacyFolderId: null,
  }
}

/** Accepts any saved shape (including the first version of Slate) and returns the current one. */
function normalize(raw: unknown): { db: Db; migrated: boolean } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (raw ?? {}) as any
  if (r.v === 2) {
    return {
      migrated: false,
      db: {
        v: 2,
        spaces: r.spaces ?? null,
        templates: Array.isArray(r.templates) ? r.templates : [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        videos: (Array.isArray(r.videos) ? r.videos : []).map((v: any) => ({ ...blankVideo(), ...v, kit: { ...emptyKit(), ...v.kit } })),
      },
    }
  }
  const stageMap: Record<string, Stage> = { idea: 'idea', editing: 'edit', ready: 'ready', scheduled: 'scheduled', published: 'published' }
  const old = Array.isArray(r.projects) ? r.projects : []
  return {
    migrated: old.length > 0 || r.v === 1,
    db: {
      v: 2,
      spaces: null,
      templates: Array.isArray(r.templates) ? r.templates : [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      videos: old.map((p: any): Video => {
        const { notes, ...kit } = p.kit ?? {}
        return {
          ...blankVideo(), id: p.id, title: p.title, stage: stageMap[p.status] ?? 'idea', series: p.series ?? '', episode: p.episode ?? null,
          publishDate: p.publishDate ?? null, youtubeUrl: p.youtubeUrl ?? '', createdAt: p.createdAt, updatedAt: p.updatedAt, publishedAt: p.publishedAt ?? null,
          kit: { ...emptyKit(), ...kit }, notes: notes ?? '', finalId: p.finalFileId ?? null, editIds: p.finalFileId ? [p.finalFileId] : [],
          verified: p.verified ?? [], localCleared: !!p.localCleared, legacyFolderId: p.folderId ?? null,
        }
      }),
    },
  }
}

/** Two copies of the vault diverged: keep whichever version of each video was edited last. */
function merge(local: Db, remote: Db): Db {
  const byId = new Map(remote.videos.map((v) => [v.id, v]))
  for (const v of local.videos) {
    const r = byId.get(v.id)
    if (!r || v.updatedAt >= r.updatedAt) byId.set(v.id, v)
  }
  const templates = new Map(remote.templates.map((t) => [t.id, t]))
  for (const t of local.templates) templates.set(t.id, t)
  return { v: 2, videos: [...byId.values()], templates: [...templates.values()], spaces: local.spaces ?? remote.spaces }
}

const sortItems = (a: DriveItem, b: DriveItem) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.kind === 'folder' ? -1 : 1)

// ---- what we remember between visits so the app opens instantly ----
interface Last { email: string; profile: Profile; rootId: string; dbId: string; db: Db }
const readLast = (): Last | null => {
  try {
    const j = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null')
    return j && j.db && j.email ? j : null
  } catch {
    return null
  }
}
const clearLast = () => {
  try {
    localStorage.removeItem(LAST_KEY)
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}

interface Listing { items: DriveItem[]; next?: string; ts: number }

let api: DriveAPI | null = null
let rev = ''
let dbId = ''
let dirty = false
let saveTimer: ReturnType<typeof setTimeout> | undefined
let booting: Promise<void> | null = null
let opened: Promise<void> = Promise.resolve()
const inflight = new Map<string, Promise<DriveItem | null>>()
let flushHook: () => void = () => {}

export const driveApi = (): DriveAPI => {
  if (!api) throw new Error('The vault is not open')
  return api
}

type Phase = 'boot' | 'loading' | 'signedOut' | 'ready' | 'error'

interface VaultState {
  phase: Phase
  mode: 'google' | 'demo' | null
  profile: Profile | null
  db: Db
  rootId: string
  quota: Quota | null
  listings: Record<string, Listing | undefined>
  busy: Record<string, boolean>
  files: Record<string, DriveItem | undefined>
  saving: 'idle' | 'saving' | 'saved' | 'error'
  error: string
  stale: boolean

  boot(): Promise<void>
  enterDemo(): Promise<void>
  signOut(): Promise<void>
  retry(): Promise<void>

  createVideo(input: { title: string; pitch?: string; series?: string; stage?: Stage; script?: string }): Video
  patchVideo(id: string, patch: Partial<Video>): void
  patchKit(id: string, patch: Partial<Kit>): void
  setStage(id: string, stage: Stage): void
  setDate(id: string, date: string | null): void
  removeVideo(id: string): void
  linkRaw(id: string, fileId: string): void
  unlinkRaw(id: string, fileId: string): void
  linkEdit(id: string, fileId: string, opts?: { final?: boolean }): void
  unlinkEdit(id: string, fileId: string): void
  setFinal(id: string, fileId: string | null): void
  addMarker(id: string, t: number, text: string): void
  removeMarker(id: string, markerId: string): void
  markVerified(id: string, fileId: string): void

  loadFolder(id: string, force?: boolean): Promise<void>
  loadMore(id: string): Promise<void>
  createFolder(parentId: string, name: string): Promise<DriveItem | null>
  renameItem(item: DriveItem, name: string): Promise<void>
  moveItems(items: DriveItem[], toId: string): Promise<void>
  trashItems(items: DriveItem[]): Promise<void>
  addItem(item: DriveItem): void
  getItem(id: string): Promise<DriveItem | null>

  saveTemplate(t: Template): void
  removeTemplate(id: string): void
  refreshQuota(): Promise<void>
}

export const useVault = create<VaultState>((set, get) => {
  const writeLast = debounce(() => {
    const { profile, db, rootId, mode } = get()
    if (mode !== 'google' || !profile || !rootId || !dbId) return
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ email: profile.email, profile, rootId, dbId, db } satisfies Last))
    } catch {
      /* cache is best effort */
    }
  }, 400)

  const writeListings = debounce(() => {
    const { profile, listings, mode } = get()
    if (mode !== 'google' || !profile) return
    const recent = Object.entries(listings)
      .filter((e): e is [string, Listing] => !!e[1])
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, 24)
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ email: profile.email, listings: Object.fromEntries(recent) }))
    } catch {
      /* cache is best effort */
    }
  }, 1200)

  /** Writes the database to Drive. `inOpen` is set by the vault-opening code itself, which must not wait on itself. */
  async function flush(inOpen = false) {
    saveTimer = undefined
    if (!inOpen) await opened
    if (!api || get().phase !== 'ready') return
    set({ saving: 'saving' })
    try {
      try {
        rev = await api.saveDb(get().db, rev)
      } catch (e) {
        if (!(e instanceof Conflict)) throw e
        const remote = await api.open(emptyDb())
        const merged = merge(get().db, normalize(remote.db).db)
        set({ db: merged })
        rev = await api.saveDb(merged, remote.rev)
      }
      dirty = false
      set({ saving: 'saved' })
      writeLast()
    } catch (e) {
      set({ saving: 'error' })
      toast(`Could not save to Drive: ${(e as Error).message}`, 'bad')
    }
  }

  const schedule = () => {
    dirty = true
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void flush(), 900)
    writeLast()
  }
  flushHook = () => {
    if (dirty && get().phase === 'ready') {
      clearTimeout(saveTimer)
      void flush()
    }
  }

  const mutate = (fn: (db: Db) => Db) => {
    set({ db: fn(get().db) })
    schedule()
  }

  const video = (id: string) => get().db.videos.find((v) => v.id === id)
  const edit = (id: string, fn: (v: Video) => Partial<Video>) => {
    const before = video(id)
    if (!before) return
    const next: Video = { ...before, ...fn(before), updatedAt: new Date().toISOString() }
    mutate((db) => ({ ...db, videos: db.videos.map((v) => (v.id === id ? next : v)) }))
  }
  const atLeast = (v: Video, stage: Stage): Stage => (stageIndex(v.stage) < stageIndex(stage) ? stage : v.stage)

  const remember = (items: DriveItem[]) => set((s) => ({ files: { ...s.files, ...Object.fromEntries(items.map((i) => [i.id, i])) } }))

  async function ensureSpaces() {
    if (get().db.spaces) return
    const d = driveApi()
    const root = get().rootId
    const [raw, edited, thumbs] = await Promise.all([d.createFolder('Raw footage', root), d.createFolder('Edited footage', root), d.createFolder('Thumbnails', root)])
    set((s) => ({ db: { ...s.db, spaces: { root, raw: raw.id, edited: edited.id, thumbs: thumbs.id } } }))
    dirty = true
    await flush(true)
  }

  async function openVault(profile: Profile | null) {
    try {
      const last = readLast()
      const hint = get().mode === 'google' && last && profile && last.email === profile.email ? { rootId: last.rootId, dbId: last.dbId } : undefined
      const o = await driveApi().open(emptyDb(), hint)
      rev = o.rev
      dbId = o.dbId
      const { db: remote, migrated } = normalize(o.db)
      if (migrated && get().mode === 'google') void driveApi().writeText('slate.db.v1-backup.json', o.rootId, JSON.stringify(o.db)).catch(() => {})
      set({ db: dirty ? merge(get().db, remote) : remote, rootId: o.rootId, phase: 'ready', error: '', stale: false })
      if (get().mode === 'google') localStorage.setItem(MODE_KEY, 'google')
      writeLast()
      await ensureSpaces()
      if (migrated) {
        dirty = true
        void flush(true)
      }
      void get().refreshQuota()
      const sp = get().db.spaces
      if (sp) void Promise.all([get().loadFolder(sp.raw), get().loadFolder(sp.edited)])
    } catch (e) {
      if (get().phase === 'ready') {
        set({ stale: true })
        toast("Couldn't reach Google Drive. Showing your last saved copy.", 'bad')
      } else set({ phase: 'error', error: (e as Error).message })
    }
  }

  return {
    phase: 'boot', mode: null, profile: null, db: emptyDb(), rootId: '', quota: null, listings: {}, busy: {}, files: {}, saving: 'idle', error: '', stale: false,

    boot() {
      booting ??= (async () => {
        if (get().phase === 'ready') return
        if (localStorage.getItem(MODE_KEY) === 'demo') return get().enterDemo()
        let release!: () => void
        opened = new Promise<void>((r) => (release = r))
        try {
          // Returning visitor: paint the last vault right away, then confirm with the network.
          const last = localStorage.getItem(MODE_KEY) === 'google' ? readLast() : null
          if (last) {
            let ls: { email?: string; listings?: Record<string, Listing> } = {}
            try {
              ls = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')
            } catch {
              /* ignore */
            }
            const listings = ls.email === last.email ? ls.listings ?? {} : {}
            api = googleDrive()
            set({ mode: 'google', profile: last.profile, db: normalize(last.db).db, rootId: last.rootId, phase: 'ready', stale: true, listings, files: Object.fromEntries(Object.values(listings).flatMap((l) => l?.items ?? []).map((i) => [i.id, i])) })
          } else set({ phase: 'loading' })

          const profile = await fetchSession()
          if (!profile) {
            clearLast()
            localStorage.removeItem(MODE_KEY)
            set({ phase: 'signedOut', mode: null, profile: null, db: emptyDb(), rootId: '', listings: {}, files: {} })
            return
          }
          if (last && last.email !== profile.email) {
            clearLast()
            set({ db: emptyDb(), rootId: '', listings: {}, files: {}, phase: 'loading' })
          }
          api = googleDrive()
          set({ mode: 'google', profile })
          await openVault(profile)
        } finally {
          release()
        }
      })().finally(() => {
        booting = null
      })
      return booting
    },

    async enterDemo() {
      let release!: () => void
      opened = new Promise<void>((r) => (release = r))
      api = demoDrive()
      dirty = false
      localStorage.setItem(MODE_KEY, 'demo')
      set({ mode: 'demo', profile: DEMO_PROFILE, phase: 'loading', listings: {}, files: {}, db: emptyDb() })
      try {
        await openVault(DEMO_PROFILE)
      } finally {
        release()
      }
    },

    async signOut() {
      clearTimeout(saveTimer)
      if (dirty) await flush()
      if (get().mode === 'google') await logout()
      localStorage.removeItem(MODE_KEY)
      clearLast()
      api = null
      rev = ''
      dbId = ''
      set({ phase: 'signedOut', mode: null, profile: null, db: emptyDb(), rootId: '', listings: {}, files: {}, quota: null, saving: 'idle' })
    },

    async retry() {
      set({ phase: 'boot' })
      if (get().mode === 'demo') {
        resetDemo()
        return get().enterDemo()
      }
      await get().boot()
    },

    // ---------------------------------------------------------------- videos
    createVideo({ title, pitch = '', series = '', stage = 'idea', script = '' }) {
      const inSeries = series ? get().db.videos.filter((v) => v.series === series) : []
      const v: Video = { ...blankVideo(), title: title.trim() || 'Untitled video', pitch, script, series, stage, episode: series ? Math.max(0, ...inSeries.map((x) => x.episode ?? 0)) + 1 : null }
      mutate((db) => ({ ...db, videos: [v, ...db.videos] }))
      return v
    },

    patchVideo: (id, patch) => edit(id, () => patch),
    patchKit: (id, patch) => edit(id, (v) => ({ kit: { ...v.kit, ...patch } })),

    setStage(id, stage) {
      edit(id, (v) => {
        const patch: Partial<Video> = { stage }
        if (stage === 'published') {
          patch.publishedAt = v.publishedAt ?? new Date().toISOString()
          patch.publishDate = v.publishDate ?? today()
        } else patch.publishedAt = null
        if (stage === 'scheduled' && !v.publishDate) patch.publishDate = addDays(today(), 1)
        if (stage === 'ready') patch.publishDate = null
        if (stageIndex(stage) < stageIndex('ready')) patch.publishDate = null
        return patch
      })
    },

    setDate: (id, date) => edit(id, (v) => ({ publishDate: date, stage: date && v.stage === 'ready' ? 'scheduled' : !date && v.stage === 'scheduled' ? 'ready' : v.stage })),
    removeVideo: (id) => mutate((db) => ({ ...db, videos: db.videos.filter((v) => v.id !== id) })),

    linkRaw: (id, fileId) => edit(id, (v) => ({ rawIds: v.rawIds.includes(fileId) ? v.rawIds : [...v.rawIds, fileId], stage: atLeast(v, 'shoot') })),
    unlinkRaw: (id, fileId) => edit(id, (v) => ({ rawIds: v.rawIds.filter((x) => x !== fileId) })),

    linkEdit: (id, fileId, opts) =>
      edit(id, (v) => {
        const makeFinal = opts?.final ?? true
        const finalId = makeFinal || !v.finalId ? fileId : v.finalId
        return {
          editIds: v.editIds.includes(fileId) ? v.editIds : [...v.editIds, fileId],
          finalId,
          stage: stageIndex(v.stage) < stageIndex('ready') ? (v.publishDate ? 'scheduled' : 'ready') : v.stage,
          localCleared: finalId !== v.finalId ? false : v.localCleared,
        }
      }),
    unlinkEdit: (id, fileId) =>
      edit(id, (v) => {
        const editIds = v.editIds.filter((x) => x !== fileId)
        const finalId = v.finalId === fileId ? (editIds[editIds.length - 1] ?? null) : v.finalId
        return { editIds, finalId, stage: !finalId && v.stage === 'ready' ? 'edit' : v.stage }
      }),
    setFinal: (id, fileId) => edit(id, () => ({ finalId: fileId, localCleared: false })),

    addMarker: (id, t, text) => edit(id, (v) => ({ markers: [...v.markers, { id: uid('m'), t, text, at: new Date().toISOString() }].sort((a, b) => a.t - b.t) })),
    removeMarker: (id, markerId) => edit(id, (v) => ({ markers: v.markers.filter((m) => m.id !== markerId) })),
    markVerified: (id, fileId) => edit(id, (v) => ({ verified: v.verified.includes(fileId) ? v.verified : [...v.verified, fileId] })),

    // ---------------------------------------------------------------- library
    async loadFolder(id, force = false) {
      const cur = get().listings[id]
      if (!force && cur && Date.now() - cur.ts < 20_000) return
      if (get().busy[id]) return
      set((s) => ({ busy: { ...s.busy, [id]: true } }))
      try {
        const r = await driveApi().list(id)
        set((s) => ({ listings: { ...s.listings, [id]: { items: r.items, next: r.next, ts: Date.now() } }, busy: { ...s.busy, [id]: false } }))
        remember(r.items)
        writeListings()
      } catch (e) {
        set((s) => ({ busy: { ...s.busy, [id]: false }, listings: { ...s.listings, [id]: s.listings[id] ?? { items: [], ts: 0 } } }))
        toast(`Could not open the folder: ${(e as Error).message}`, 'bad')
      }
    },

    async loadMore(id) {
      const cur = get().listings[id]
      if (!cur?.next || get().busy[id]) return
      set((s) => ({ busy: { ...s.busy, [id]: true } }))
      try {
        const r = await driveApi().list(id, cur.next)
        set((s) => ({ listings: { ...s.listings, [id]: { items: [...cur.items, ...r.items], next: r.next, ts: Date.now() } }, busy: { ...s.busy, [id]: false } }))
        remember(r.items)
      } catch (e) {
        set((s) => ({ busy: { ...s.busy, [id]: false } }))
        toast(`Could not load more: ${(e as Error).message}`, 'bad')
      }
    },

    async createFolder(parentId, name) {
      try {
        const item = await driveApi().createFolder(name.trim(), parentId)
        get().addItem(item)
        return item
      } catch (e) {
        toast(`Could not create the folder: ${(e as Error).message}`, 'bad')
        return null
      }
    },

    async renameItem(item, name) {
      const clean = name.trim()
      if (!clean || clean === item.name) return
      const apply = (n: string) =>
        set((s) => {
          const l = item.parent ? s.listings[item.parent] : undefined
          return {
            files: { ...s.files, [item.id]: { ...(s.files[item.id] ?? item), name: n } },
            listings: l && item.parent ? { ...s.listings, [item.parent]: { ...l, items: l.items.map((i) => (i.id === item.id ? { ...i, name: n } : i)).sort(sortItems) } } : s.listings,
          }
        })
      apply(clean)
      try {
        await driveApi().rename(item.id, clean)
      } catch (e) {
        apply(item.name)
        toast(`Could not rename: ${(e as Error).message}`, 'bad')
      }
    },

    async moveItems(items, toId) {
      const moving = items.filter((i) => i.parent && i.parent !== toId && i.id !== toId)
      if (!moving.length) return
      set((s) => {
        const listings = { ...s.listings }
        for (const i of moving) {
          const from = listings[i.parent!]
          if (from) listings[i.parent!] = { ...from, items: from.items.filter((x) => x.id !== i.id) }
        }
        const to = listings[toId]
        if (to) listings[toId] = { ...to, items: [...to.items, ...moving.map((i) => ({ ...i, parent: toId }))].sort(sortItems) }
        return { listings, files: { ...s.files, ...Object.fromEntries(moving.map((i) => [i.id, { ...i, parent: toId }])) } }
      })
      const results = await Promise.allSettled(moving.map((i) => driveApi().move(i.id, i.parent!, toId)))
      if (results.some((r) => r.status === 'rejected')) {
        toast('Some items could not be moved. Refreshing.', 'bad')
        for (const id of new Set([toId, ...moving.map((i) => i.parent!)])) void get().loadFolder(id, true)
      } else toast(moving.length === 1 ? `Moved "${moving[0].name}"` : `Moved ${moving.length} items`)
    },

    async trashItems(items) {
      const ids = new Set(items.map((i) => i.id))
      set((s) => {
        const listings = { ...s.listings }
        for (const i of items) {
          const l = i.parent ? listings[i.parent] : undefined
          if (l && i.parent) listings[i.parent] = { ...l, items: l.items.filter((x) => !ids.has(x.id)) }
        }
        return { listings }
      })
      // Forget links to deleted files so no video points at nothing.
      mutate((db) => ({
        ...db,
        videos: db.videos.map((v) =>
          [...v.rawIds, ...v.editIds, v.finalId, v.thumbId].some((x) => x && ids.has(x))
            ? { ...v, rawIds: v.rawIds.filter((x) => !ids.has(x)), editIds: v.editIds.filter((x) => !ids.has(x)), finalId: v.finalId && ids.has(v.finalId) ? null : v.finalId, thumbId: v.thumbId && ids.has(v.thumbId) ? null : v.thumbId, updatedAt: new Date().toISOString() }
            : v,
        ),
      }))
      const results = await Promise.allSettled(items.map((i) => driveApi().trash(i.id)))
      if (results.some((r) => r.status === 'rejected')) {
        toast('Some items could not be deleted. Refreshing.', 'bad')
        for (const p of new Set(items.map((i) => i.parent!).filter(Boolean))) void get().loadFolder(p, true)
      } else toast(items.length === 1 ? 'Moved to Drive trash' : `Moved ${items.length} items to Drive trash`)
      void get().refreshQuota()
    },

    addItem(item) {
      set((s) => {
        const l = item.parent ? s.listings[item.parent] : undefined
        return {
          files: { ...s.files, [item.id]: item },
          listings: l && item.parent ? { ...s.listings, [item.parent]: { ...l, items: [item, ...l.items.filter((x) => x.id !== item.id)].sort(sortItems) } } : s.listings,
        }
      })
    },

    async getItem(id) {
      const hit = get().files[id]
      if (hit) return hit
      let p = inflight.get(id)
      if (!p) {
        p = driveApi()
          .get(id)
          .then((i) => {
            if (i) remember([i])
            return i
          })
          .catch(() => null)
          .finally(() => inflight.delete(id))
        inflight.set(id, p)
      }
      return p
    },

    saveTemplate: (t) => mutate((db) => ({ ...db, templates: db.templates.some((x) => x.id === t.id) ? db.templates.map((x) => (x.id === t.id ? t : x)) : [...db.templates, t] })),
    removeTemplate: (id) => mutate((db) => ({ ...db, templates: db.templates.filter((t) => t.id !== id) })),

    async refreshQuota() {
      try {
        set({ quota: await driveApi().quota() })
      } catch {
        /* the meter is informational */
      }
    },
  }
})

if (typeof window !== 'undefined') {
  // Save before the tab goes away.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushHook())
  window.addEventListener('pagehide', () => flushHook())
}

export const useVideo = (id: string | undefined) => useVault((s) => s.db.videos.find((v) => v.id === id))
export const seriesNames = (videos: Video[]) => [...new Set(videos.map((v) => v.series).filter(Boolean))].sort()

/** Look up Drive items by id (from cache, fetching any that are missing). */
export function useFiles(ids: (string | null | undefined)[]): (DriveItem | undefined)[] {
  const files = useVault((s) => s.files)
  const key = ids.join('|')
  useEffect(() => {
    for (const id of ids) if (id && !useVault.getState().files[id]) void useVault.getState().getItem(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return ids.map((id) => (id ? files[id] : undefined))
}
