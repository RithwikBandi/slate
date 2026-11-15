import { create } from 'zustand'
import { useUI } from './flow'
import type { DriveItem, SpaceId, UploadSession } from './types'
import { toast, uid } from './util'
import { driveApi, useVault } from './vault'

export type TransferState = 'queued' | 'starting' | 'active' | 'paused' | 'done' | 'error'

export interface Transfer {
  id: string
  dir: 'up' | 'down'
  name: string
  size: number
  sent: number
  state: TransferState
  error: string
  startedAt: number
  speed: number // bytes per second, smoothed
  lastT: number
  lastB: number
  batch: string
  space?: SpaceId
  folderId?: string
  attach?: { videoId: string; as: 'raw' | 'final' | 'thumb' }
  file?: File
  session: UploadSession
  item?: DriveItem
}

interface TransferState_ {
  items: Transfer[]
  open: boolean
  setOpen(open: boolean): void
  upload(files: File[], target: { space: SpaceId; folderId: string; attach?: Transfer['attach'] }): void
  download(item: DriveItem): void
  pause(id: string): void
  resume(id: string): void
  cancel(id: string): void
  clearDone(): void
}

const MAX_UPLOADS = 3
const controllers = new Map<string, AbortController>()
const batches = new Map<string, { total: number; done: number; names: string[]; last?: DriveItem; space?: SpaceId }>()

export const useTransfers = create<TransferState_>((set, get) => {
  const patch = (id: string, p: Partial<Transfer>) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }))

  function progress(id: string, sent: number) {
    const t = get().items.find((i) => i.id === id)
    if (!t) return
    const now = performance.now()
    let { speed, lastT, lastB } = t
    if (now - lastT > 500) {
      const inst = ((sent - lastB) / (now - lastT)) * 1000
      speed = speed ? speed * 0.7 + inst * 0.3 : inst
      lastT = now
      lastB = sent
    }
    patch(id, { sent, speed, lastT, lastB, state: 'active' })
  }

  function pump() {
    const items = get().items.filter((i) => i.dir === 'up')
    let running = items.filter((i) => i.state === 'starting' || i.state === 'active').length
    for (const t of items) {
      if (running >= MAX_UPLOADS) break
      if (t.state !== 'queued') continue
      running++
      void runUp(t)
    }
  }

  async function runUp(t: Transfer) {
    const ctrl = new AbortController()
    controllers.set(t.id, ctrl)
    patch(t.id, { state: 'starting', error: '', startedAt: Date.now(), lastT: performance.now(), lastB: t.session.offset })
    try {
      const item = await driveApi().upload(t.file!, t.folderId!, { signal: ctrl.signal, session: t.session, onProgress: (sent) => progress(t.id, sent) })
      patch(t.id, { state: 'done', sent: t.size, item, speed: 0 })
      afterUpload(t, item)
    } catch (e) {
      const aborted = (e as Error).name === 'AbortError'
      if (!aborted && get().items.some((i) => i.id === t.id)) patch(t.id, { state: 'error', error: (e as Error).message, speed: 0 })
    } finally {
      controllers.delete(t.id)
      pump()
    }
  }

  function afterUpload(t: Transfer, item: DriveItem) {
    const vault = useVault.getState()
    vault.addItem(item)
    void vault.refreshQuota()
    if (t.attach) {
      const { videoId, as } = t.attach
      if (as === 'raw') vault.linkRaw(videoId, item.id)
      else if (as === 'final') {
        vault.linkEdit(videoId, item.id, { final: true })
        if (item.size === t.size) vault.markVerified(videoId, item.id)
      } else vault.patchVideo(videoId, { thumbId: item.id })
    }
    const b = batches.get(t.batch)
    if (!b) return
    b.done++
    b.names.push(item.name)
    b.last = item
    if (b.done < b.total) return
    batches.delete(t.batch)
    const where = b.space === 'raw' ? 'Raw footage' : b.space === 'edited' ? 'Edited' : 'Thumbnails'
    if (b.total === 1) {
      if (t.attach) toast(`Added "${item.name}" to the video`)
      else if (b.space === 'edited') toast(`Uploaded "${item.name}"`, 'ok', { label: 'Send to Uploads', run: () => useUI.setState({ sendTo: item }) })
      else if (b.space === 'raw') toast(`Uploaded "${item.name}"`, 'ok', { label: 'Link to a video', run: () => useUI.setState({ linkRaw: item }) })
      else toast(`Uploaded "${item.name}"`)
    } else toast(`Uploaded ${b.total} files to ${where}`)
  }

  return {
    items: [],
    open: false,
    setOpen: (open) => set({ open }),

    upload(files, target) {
      const batch = uid('b')
      batches.set(batch, { total: files.length, done: 0, names: [], space: target.space })
      const fresh = files.map<Transfer>((file) => ({
        id: uid('u'), dir: 'up', name: file.name, size: file.size, sent: 0, state: 'queued', error: '', startedAt: 0, speed: 0, lastT: 0, lastB: 0,
        batch, space: target.space, folderId: target.folderId, attach: target.attach, file, session: { offset: 0 },
      }))
      // The tray opens the instant files are chosen, before any network call.
      set((s) => ({ items: [...s.items, ...fresh], open: true }))
      pump()
    },

    download(item) {
      const t: Transfer = { id: uid('d'), dir: 'down', name: item.name, size: item.size, sent: 0, state: 'starting', error: '', startedAt: Date.now(), speed: 0, lastT: performance.now(), lastB: 0, batch: '', session: { offset: 0 }, item }
      set((s) => ({ items: [...s.items, t], open: true }))
      const ctrl = new AbortController()
      controllers.set(t.id, ctrl)
      // Not queued: the browser's save-file prompt must start inside the click that asked for it.
      void (async () => {
        try {
          await driveApi().download(item, { signal: ctrl.signal, onProgress: (sent, total) => { patch(t.id, { size: total || item.size }); progress(t.id, sent) } })
          patch(t.id, { state: 'done', sent: get().items.find((i) => i.id === t.id)?.size ?? item.size, speed: 0 })
          toast(`Downloaded "${item.name}"`)
        } catch (e) {
          const aborted = (e as Error).name === 'AbortError'
          if (aborted) set((s) => ({ items: s.items.filter((i) => i.id !== t.id) }))
          else patch(t.id, { state: 'error', error: (e as Error).message, speed: 0 })
        } finally {
          controllers.delete(t.id)
        }
      })()
    },

    pause(id) {
      patch(id, { state: 'paused', speed: 0 })
      controllers.get(id)?.abort()
    },

    resume(id) {
      const t = get().items.find((i) => i.id === id)
      if (!t) return
      if (t.dir === 'down' && t.item) {
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
        get().download(t.item)
        return
      }
      patch(id, { state: 'queued', error: '' })
      pump()
    },

    cancel(id) {
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
      controllers.get(id)?.abort()
      pump()
    },

    clearDone() {
      set((s) => ({ items: s.items.filter((i) => i.state !== 'done') }))
    },
  }
})

// Closing the tab would abandon in-flight transfers, so ask first.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (useTransfers.getState().items.some((i) => i.state === 'starting' || i.state === 'active' || i.state === 'queued')) e.preventDefault()
  })
}
