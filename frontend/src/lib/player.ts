import { create } from 'zustand'
import type { DriveItem } from './types'

export interface PlaySource {
  item: DriveItem
  /** The video this file belongs to: lets the player store timestamped notes on it. */
  videoId?: string
  /** Other clips to step through with Next / Previous (for example, the files in a folder). */
  queue?: DriveItem[]
}

interface PlayerState {
  src: PlaySource | null
  play(item: DriveItem, opts?: { videoId?: string; queue?: DriveItem[] }): void
  close(): void
  step(dir: 1 | -1): void
}

export const usePlayer = create<PlayerState>((set, get) => ({
  src: null,
  play: (item, opts = {}) => set({ src: { item, videoId: opts.videoId, queue: opts.queue?.length ? opts.queue : undefined } }),
  close: () => set({ src: null }),
  step(dir) {
    const s = get().src
    if (!s?.queue) return
    const i = s.queue.findIndex((x) => x.id === s.item.id)
    const next = s.queue[i + dir]
    if (next) set({ src: { ...s, item: next } })
  },
}))
