import { create } from 'zustand'
import { fetchSession, logout } from './auth'
import { DEMO_PROFILE, demoDrive, resetDemo } from './demo'
import { googleDrive } from './drive'
import { Conflict, type Db, type DriveAPI, type DriveFile, type FolderRef, type Kit, type Profile, type Project, type Quota, type Status, type Template } from './types'
import { kitText, toast, uid } from './util'

const MODE_KEY = 'slate-mode'
const cacheKey = (email: string) => `slate-cache:${email}`

export const emptyKit = (): Kit => ({ title: '', description: '', pinnedComment: '', tags: '', shorts: '', reels: '', notes: '' })
export const emptyDb = (): Db => ({ v: 1, projects: [], templates: [], libraryFolderId: null })

const blankProject = (): Project => {
  const now = new Date().toISOString()
  return {
    id: uid('p'),
    title: 'Untitled video',
    status: 'idea',
    series: '',
    episode: null,
    publishDate: null,
    youtubeUrl: '',
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    folderId: null,
    folders: [],
    kit: emptyKit(),
    finalFileId: null,
    verified: [],
    localCleared: false,
  }
}

/** Fill in fields that older saved data may not have. */
function normalize(db: Partial<Db> | null | undefined): Db {
  const base = emptyDb()
  if (!db || typeof db !== 'object') return base
  return {
    v: 1,
    libraryFolderId: db.libraryFolderId ?? null,
    templates: Array.isArray(db.templates) ? db.templates : [],
    projects: (Array.isArray(db.projects) ? db.projects : []).map((p) => ({ ...blankProject(), ...p, kit: { ...emptyKit(), ...p.kit } })),
  }
}

/** Two copies of the vault diverged: keep whichever version of each video was edited last. */
function merge(local: Db, remote: Db): Db {
  const byId = new Map(remote.projects.map((p) => [p.id, p]))
  for (const p of local.projects) {
    const r = byId.get(p.id)
    if (!r || p.updatedAt >= r.updatedAt) byId.set(p.id, p)
  }
  const templates = new Map(remote.templates.map((t) => [t.id, t]))
  for (const t of local.templates) templates.set(t.id, t)
  return { v: 1, projects: [...byId.values()], templates: [...templates.values()], libraryFolderId: local.libraryFolderId ?? remote.libraryFolderId }
}

let api: DriveAPI | null = null
let rev = ''
let dirty = false
let saveTimer: ReturnType<typeof setTimeout> | undefined
let booting: Promise<void> | null = null
const kitTimers = new Map<string, ReturnType<typeof setTimeout>>()
const renameTimers = new Map<string, ReturnType<typeof setTimeout>>()
const folderJobs = new Map<string, Promise<Project>>()

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
  files: Record<string, DriveFile[] | undefined>
  saving: 'idle' | 'saving' | 'saved' | 'error'
  error: string

  boot(): Promise<void>
  enterDemo(): Promise<void>
  signOut(): Promise<void>
  retry(): Promise<void>

  createProject(input: { title: string; series?: string; status?: Status; publishDate?: string | null }): Project
  patchProject(id: string, patch: Partial<Project>): void
  patchKit(id: string, patch: Partial<Kit>): void
  removeProject(id: string): Promise<void>
  ensureFolders(id: string): Promise<Project>
  addFolder(id: string, name: string): Promise<void>
  shareProject(id: string): Promise<string>

  loadFiles(folderId: string, force?: boolean): Promise<void>
  removeFile(folderId: string, fileId: string): Promise<void>
  uploaded(folderId: string, projectId: string | null, file: DriveFile, localSize: number): void

  saveTemplate(t: Template): void
  removeTemplate(id: string): void
  ensureLibrary(): Promise<string>
  refreshQuota(): Promise<void>
}

export const useVault = create<VaultState>((set, get) => {
  const writeCache = () => {
    const { profile, db, mode } = get()
    if (mode !== 'google' || !profile) return
    try {
      localStorage.setItem(cacheKey(profile.email), JSON.stringify(db))
    } catch {
      /* cache is best effort */
    }
  }

  async function flush() {
    saveTimer = undefined
    if (!api || !get().rootId) return
    set({ saving: 'saving' })
    try {
      try {
        rev = await api.saveDb(get().db, rev)
      } catch (e) {
        if (!(e instanceof Conflict)) throw e
        const remote = await api.open(emptyDb())
        const merged = merge(get().db, normalize(remote.db))
        set({ db: merged })
        rev = await api.saveDb(merged, remote.rev)
      }
      dirty = false
      writeCache()
      set({ saving: 'saved' })
    } catch (e) {
      set({ saving: 'error' })
      toast(`Could not save to Drive: ${(e as Error).message}`, 'bad')
    }
  }

  const schedule = () => {
    dirty = true
    clearTimeout(saveTimer)
    saveTimer = setTimeout(flush, 900)
  }

  const mutate = (fn: (db: Db) => Db) => {
    set({ db: fn(get().db) })
    schedule()
  }

  const project = (id: string) => get().db.projects.find((p) => p.id === id)

  /** Keep a human-readable copy of the kit next to the footage, so the vault is useful without Slate. */
  function scheduleKitFile(id: string) {
    clearTimeout(kitTimers.get(id))
    kitTimers.set(
      id,
      setTimeout(() => {
        const p = project(id)
        if (p?.folderId && api) api.writeText('Publish kit.txt', p.folderId, kitText(p)).catch(() => {})
      }, 4000),
    )
  }

  async function openVault() {
    try {
      const o = await driveApi().open(emptyDb())
      rev = o.rev
      const remote = normalize(o.db)
      set({ db: dirty ? merge(get().db, remote) : remote, rootId: o.rootId, phase: 'ready', error: '' })
      localStorage.setItem(MODE_KEY, get().mode ?? '')
      writeCache()
      if (dirty) schedule()
      void get().refreshQuota()
    } catch (e) {
      set({ phase: 'error', error: (e as Error).message })
    }
  }

  return {
    phase: 'boot',
    mode: null,
    profile: null,
    db: emptyDb(),
    rootId: '',
    quota: null,
    files: {},
    saving: 'idle',
    error: '',

    boot() {
      booting ??= (async () => {
        if (get().phase === 'ready') return
        if (localStorage.getItem(MODE_KEY) === 'demo') return get().enterDemo()
        set({ phase: 'loading' })
        const profile = await fetchSession()
        if (!profile) {
          localStorage.removeItem(MODE_KEY)
          set({ phase: 'signedOut' })
          return
        }
        api = googleDrive()
        set({ mode: 'google', profile })
        try {
          const cached = localStorage.getItem(cacheKey(profile.email))
          if (cached) set({ db: normalize(JSON.parse(cached)), phase: 'ready' }) // instant paint, refreshed below
        } catch {
          /* no usable cache */
        }
        await openVault()
      })().finally(() => {
        booting = null
      })
      return booting
    },

    async enterDemo() {
      api = demoDrive()
      dirty = false
      set({ mode: 'demo', profile: DEMO_PROFILE, phase: 'loading', files: {} })
      await openVault()
    },

    async signOut() {
      clearTimeout(saveTimer)
      if (dirty) await flush()
      if (get().mode === 'google') await logout()
      localStorage.removeItem(MODE_KEY)
      api = null
      rev = ''
      set({ phase: 'signedOut', mode: null, profile: null, db: emptyDb(), rootId: '', files: {}, quota: null, saving: 'idle' })
    },

    async retry() {
      set({ phase: 'boot' })
      if (get().mode === 'demo') {
        resetDemo()
        return get().enterDemo()
      }
      await get().boot()
    },

    createProject({ title, series = '', status = 'idea', publishDate = null }) {
      const inSeries = series ? get().db.projects.filter((p) => p.series === series) : []
      const p: Project = {
        ...blankProject(),
        title: title.trim() || 'Untitled video',
        series,
        status,
        publishDate,
        episode: series ? Math.max(0, ...inSeries.map((x) => x.episode ?? 0)) + 1 : null,
      }
      mutate((db) => ({ ...db, projects: [p, ...db.projects] }))
      return p
    },

    patchProject(id, patch) {
      const before = project(id)
      if (!before) return
      const next: Project = { ...before, ...patch, updatedAt: new Date().toISOString() }
      if (next.status === 'published' && !next.publishedAt) next.publishedAt = new Date().toISOString()
      if (next.status !== 'published') next.publishedAt = null
      mutate((db) => ({ ...db, projects: db.projects.map((p) => (p.id === id ? next : p)) }))
      scheduleKitFile(id)
      if (patch.title && patch.title !== before.title && before.folderId) {
        clearTimeout(renameTimers.get(id))
        renameTimers.set(id, setTimeout(() => api?.rename(before.folderId!, next.title).catch(() => {}), 2500))
      }
    },

    patchKit(id, patch) {
      const p = project(id)
      if (p) get().patchProject(id, { kit: { ...p.kit, ...patch } })
    },

    async removeProject(id) {
      const p = project(id)
      if (!p) return
      mutate((db) => ({ ...db, projects: db.projects.filter((x) => x.id !== id) }))
      if (p.folderId) await driveApi().trash(p.folderId)
    },

    ensureFolders(id) {
      const existing = project(id)
      if (!existing) return Promise.reject(new Error('That video no longer exists'))
      if (existing.folderId) return Promise.resolve(existing)
      let job = folderJobs.get(id)
      if (!job) {
        job = (async () => {
          const d = driveApi()
          const folderId = await d.createFolder(existing.title, get().rootId)
          const names: [string, FolderRef['kind']][] = [
            ['Raw footage', 'raw'],
            ['Edited', 'edited'],
            ['Thumbnails', 'thumbs'],
          ]
          const ids = await Promise.all(names.map(([n]) => d.createFolder(n, folderId)))
          get().patchProject(id, { folderId, folders: names.map(([name, kind], i) => ({ id: ids[i], name, kind })) })
          return project(id)!
        })().finally(() => folderJobs.delete(id))
        folderJobs.set(id, job)
      }
      return job
    },

    async addFolder(id, name) {
      const p = await get().ensureFolders(id)
      const folderId = await driveApi().createFolder(name.trim(), p.folderId!)
      get().patchProject(id, { folders: [...project(id)!.folders, { id: folderId, name: name.trim(), kind: 'custom' }] })
    },

    async shareProject(id) {
      const p = await get().ensureFolders(id)
      return driveApi().shareLink(p.folderId!)
    },

    async loadFiles(folderId, force = false) {
      if (!force && get().files[folderId]) return
      try {
        const list = await driveApi().listFiles(folderId)
        set((s) => ({ files: { ...s.files, [folderId]: list } }))
      } catch (e) {
        set((s) => ({ files: { ...s.files, [folderId]: s.files[folderId] ?? [] } }))
        toast(`Could not list files: ${(e as Error).message}`, 'bad')
      }
    },

    async removeFile(folderId, fileId) {
      await driveApi().trash(fileId)
      set((s) => ({ files: { ...s.files, [folderId]: (s.files[folderId] ?? []).filter((f) => f.id !== fileId) } }))
      const owner = get().db.projects.find((p) => p.finalFileId === fileId)
      if (owner) get().patchProject(owner.id, { finalFileId: null, localCleared: false })
      void get().refreshQuota()
    },

    uploaded(folderId, projectId, file, localSize) {
      set((s) => ({ files: { ...s.files, [folderId]: [file, ...(s.files[folderId] ?? []).filter((f) => f.id !== file.id)] } }))
      const p = projectId ? project(projectId) : null
      if (p) {
        const patch: Partial<Project> = {}
        if (file.size === localSize) patch.verified = [...p.verified, file.id]
        const folder = p.folders.find((f) => f.id === folderId)
        if (folder?.kind === 'edited') patch.finalFileId = file.id // newest export becomes the final
        if (p.status === 'idea') patch.status = 'editing'
        get().patchProject(p.id, patch)
      }
      void get().refreshQuota()
    },

    saveTemplate(t) {
      mutate((db) => ({ ...db, templates: db.templates.some((x) => x.id === t.id) ? db.templates.map((x) => (x.id === t.id ? t : x)) : [...db.templates, t] }))
    },

    removeTemplate(id) {
      mutate((db) => ({ ...db, templates: db.templates.filter((t) => t.id !== id) }))
    },

    async ensureLibrary() {
      const have = get().db.libraryFolderId
      if (have) return have
      const id = await driveApi().createFolder('Library', get().rootId)
      mutate((db) => ({ ...db, libraryFolderId: id }))
      return id
    },

    async refreshQuota() {
      try {
        set({ quota: await driveApi().quota() })
      } catch {
        /* the meter is informational */
      }
    },
  }
})

export const useProject = (id: string | undefined) => useVault((s) => s.db.projects.find((p) => p.id === id))
export const seriesNames = (projects: Project[]) => [...new Set(projects.map((p) => p.series).filter(Boolean))].sort()
