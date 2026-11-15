// ---------------------------------------------------------------- workflow
// One video travels through seven stages. The Ideas board shows the first four; Uploads shows the last three.
export type Stage = 'idea' | 'script' | 'shoot' | 'edit' | 'ready' | 'scheduled' | 'published'

export interface StageInfo {
  id: Stage
  label: string
  hint: string
  group: 'ideas' | 'uploads'
}

export const STAGES: StageInfo[] = [
  { id: 'idea', label: 'Idea', hint: 'A concept worth making', group: 'ideas' },
  { id: 'script', label: 'Script', hint: 'Writing what you will say', group: 'ideas' },
  { id: 'shoot', label: 'Shoot', hint: 'Filming and collecting raw footage', group: 'ideas' },
  { id: 'edit', label: 'Edit', hint: 'Cutting the video', group: 'ideas' },
  { id: 'ready', label: 'Ready', hint: 'Edited, waiting for a publish date', group: 'uploads' },
  { id: 'scheduled', label: 'Scheduled', hint: 'Has a publish date', group: 'uploads' },
  { id: 'published', label: 'Published', hint: 'Live on the channel', group: 'uploads' },
]
export const IDEA_STAGES = STAGES.filter((s) => s.group === 'ideas')
export const UPLOAD_STAGES = STAGES.filter((s) => s.group === 'uploads')
export const stageIndex = (s: Stage) => STAGES.findIndex((x) => x.id === s)
export const stageInfo = (s: Stage) => STAGES[stageIndex(s)]

export interface Kit {
  title: string
  description: string
  pinnedComment: string
  tags: string
  shorts: string
  reels: string
}

/** A timestamped review note, added while watching a cut in the player. */
export interface Marker {
  id: string
  t: number // seconds into the video
  text: string
  at: string // ISO 8601
}

export interface Video {
  id: string
  title: string
  pitch: string // what the idea is about, in a few lines
  script: string
  stage: Stage
  series: string
  episode: number | null
  publishDate: string | null // YYYY-MM-DD
  youtubeUrl: string
  createdAt: string // ISO 8601
  updatedAt: string
  publishedAt: string | null
  kit: Kit
  notes: string
  markers: Marker[]
  rawIds: string[] // Drive file ids of linked raw footage
  editIds: string[] // linked edited exports (versions)
  finalId: string | null // the export that gets published
  thumbId: string | null
  verified: string[] // uploaded file ids whose size matched the local file
  localCleared: boolean
  legacyFolderId: string | null // folder from the first version of Slate, kept reachable
}

export interface Template {
  id: string
  name: string
  kind: 'description' | 'hashtags' | 'comment'
  body: string
}

export type SpaceId = 'raw' | 'edited' | 'thumbs'

export interface Spaces {
  root: string
  raw: string
  edited: string
  thumbs: string
}

export const SPACES: { id: SpaceId; label: string; hint: string }[] = [
  { id: 'raw', label: 'Raw footage', hint: 'Camera originals and B-roll' },
  { id: 'edited', label: 'Edited', hint: 'Finished cuts and exports' },
  { id: 'thumbs', label: 'Thumbnails', hint: 'Cover images' },
]

export interface Db {
  v: 2
  videos: Video[]
  templates: Template[]
  spaces: Spaces | null
}

// ---------------------------------------------------------------- Drive
export interface DriveItem {
  id: string
  name: string
  kind: 'folder' | 'file'
  mimeType: string
  size: number
  createdTime: string
  modifiedTime: string
  parent: string | null
  thumbnailLink?: string
  webViewLink?: string
  durationMs?: number
  width?: number
  height?: number
  local?: string // demo mode only: blob URL of a file added in this session
}

export interface Quota {
  used: number
  limit: number | null // null = no fixed limit
}

export interface Profile {
  name: string
  email: string
  picture?: string
}

export interface Permission {
  id: string
  type: 'user' | 'anyone'
  role: 'reader' | 'writer' | 'owner' | 'commenter'
  email?: string
  name?: string
}

export interface UploadSession {
  url?: string
  offset: number
}

export interface UploadHooks {
  onProgress(sent: number): void
  signal: AbortSignal
  session: UploadSession
}

export interface DownloadHooks {
  onProgress(sent: number, total: number): void
  signal: AbortSignal
}

/** Storage backend. Implemented by the real Google Drive adapter and by the in-browser demo. */
export interface DriveAPI {
  kind: 'google' | 'demo'
  /** Finds (or creates) the vault. `hint` skips the lookups when ids from a previous visit are known. */
  open(empty: Db, hint?: { rootId: string; dbId: string }): Promise<{ rootId: string; dbId: string; db: unknown; rev: string }>
  saveDb(db: Db, rev: string): Promise<string>
  createFolder(name: string, parentId: string): Promise<DriveItem>
  list(folderId: string, pageToken?: string): Promise<{ items: DriveItem[]; next?: string }>
  search(query: string): Promise<DriveItem[]>
  get(id: string): Promise<DriveItem | null>
  upload(file: File, folderId: string, hooks: UploadHooks): Promise<DriveItem>
  move(id: string, fromId: string, toId: string): Promise<void>
  rename(id: string, name: string): Promise<void>
  trash(id: string): Promise<void>
  quota(): Promise<Quota>
  permissions(id: string): Promise<Permission[]>
  share(id: string, to: { type: 'user' | 'anyone'; role: 'reader' | 'writer'; email?: string }): Promise<Permission>
  unshare(id: string, permissionId: string): Promise<void>
  /** A URL a <video> element can stream from. */
  mediaUrl(item: DriveItem): Promise<string>
  download(item: DriveItem, hooks: DownloadHooks): Promise<void>
  writeText(name: string, parentId: string, text: string): Promise<void>
  folderUrl(id: string): string
}

/** Thrown by saveDb when the remote database changed since we last read it. */
export class Conflict extends Error {
  constructor() {
    super('The vault changed in another tab or device')
  }
}

export class AuthError extends Error {
  constructor() {
    super('Your session ended. Sign in again.')
  }
}
