import { create } from 'zustand'
import type { UploadSession } from './types'
import { toast, uid } from './util'
import { driveApi, useVault } from './vault'

export interface UploadItem {
  id: string
  file: File
  name: string
  size: number
  sent: number
  state: 'queued' | 'uploading' | 'paused' | 'done' | 'error'
  error: string
  folderId: string
  projectId: string | null
  session: UploadSession
}

interface UploadState {
  items: UploadItem[]
  add(files: File[], folderId: string, projectId: string | null): void
  pause(id: string): void
  resume(id: string): void
  cancel(id: string): void
  clearDone(): void
}

const MAX_PARALLEL = 2
const controllers = new Map<string, AbortController>()

export const useUploads = create<UploadState>((set, get) => {
  const patch = (id: string, p: Partial<UploadItem>) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }))

  function pump() {
    const { items } = get()
    let running = items.filter((i) => i.state === 'uploading').length
    for (const item of items) {
      if (running >= MAX_PARALLEL) break
      if (item.state !== 'queued') continue
      running++
      void run(item)
    }
  }

  async function run(item: UploadItem) {
    const ctrl = new AbortController()
    controllers.set(item.id, ctrl)
    patch(item.id, { state: 'uploading', error: '' })
    try {
      const file = await driveApi().upload(item.file, item.folderId, {
        signal: ctrl.signal,
        session: item.session,
        onProgress: (sent) => patch(item.id, { sent }),
      })
      patch(item.id, { state: 'done', sent: item.size })
      useVault.getState().uploaded(item.folderId, item.projectId, file, item.size)
      toast(`Uploaded ${item.name}`)
    } catch (e) {
      const aborted = (e as Error).name === 'AbortError'
      const still = get().items.find((i) => i.id === item.id)
      if (!aborted && still) patch(item.id, { state: 'error', error: (e as Error).message })
    } finally {
      controllers.delete(item.id)
      pump()
    }
  }

  return {
    items: [],

    add(files, folderId, projectId) {
      const fresh = files.map<UploadItem>((file) => ({
        id: uid('u'),
        file,
        name: file.name,
        size: file.size,
        sent: 0,
        state: 'queued',
        error: '',
        folderId,
        projectId,
        session: { offset: 0 },
      }))
      set((s) => ({ items: [...s.items, ...fresh] }))
      pump()
    },

    pause(id) {
      patch(id, { state: 'paused' })
      controllers.get(id)?.abort()
    },

    resume(id) {
      patch(id, { state: 'queued', error: '' })
      pump()
    },

    cancel(id) {
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
      controllers.get(id)?.abort()
    },

    clearDone() {
      set((s) => ({ items: s.items.filter((i) => i.state !== 'done') }))
    },
  }
})

// Closing the tab would abandon in-flight uploads, so ask first.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (useUploads.getState().items.some((i) => i.state === 'uploading' || i.state === 'queued')) e.preventDefault()
  })
}
