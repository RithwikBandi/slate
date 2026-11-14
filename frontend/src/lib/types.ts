export type Status = 'idea' | 'editing' | 'ready' | 'scheduled' | 'published'

export const STATUSES: { id: Status; label: string; hint: string }[] = [
  { id: 'idea', label: 'Idea', hint: 'Captured, not shot yet' },
  { id: 'editing', label: 'In edit', hint: 'Footage is in, cut in progress' },
  { id: 'ready', label: 'Ready', hint: 'Final export and kit are done' },
  { id: 'scheduled', label: 'Scheduled', hint: 'Has a publish date' },
  { id: 'published', label: 'Published', hint: 'Live on the channel' },
]

export interface Kit {
  title: string
  description: string
  pinnedComment: string
  tags: string
  shorts: string
  reels: string
  notes: string
}

export interface FolderRef {
  id: string
  name: string
  kind: 'raw' | 'edited' | 'thumbs' | 'custom'
}

export interface Project {
  id: string
  title: string
  status: Status
  series: string
  episode: number | null
  publishDate: string | null // YYYY-MM-DD
  youtubeUrl: string
  createdAt: string // ISO 8601
  updatedAt: string
  publishedAt: string | null
  folderId: string | null // Drive folder, created on first need
  folders: FolderRef[]
  kit: Kit
  finalFileId: string | null
  verified: string[] // file ids whose uploaded size matched the local file
  localCleared: boolean
}

export interface Template {
  id: string
  name: string
  kind: 'description' | 'hashtags' | 'comment'
  body: string
}

export interface Db {
  v: 1
  projects: Project[]
  templates: Template[]
  libraryFolderId: string | null
}

export interface DriveFile {
  id: string
  name: string
  size: number
  mimeType: string
  createdTime: string
  thumbnailLink?: string
  webViewLink?: string
  webContentLink?: string
}

export interface Quota {
  used: number
  limit: number | null // null = unlimited plan
}

export interface Profile {
  name: string
  email: string
  picture?: string
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

/** Storage backend. Implemented by the real Google Drive adapter and by the in-browser demo. */
export interface DriveAPI {
  kind: 'google' | 'demo'
  open(empty: Db): Promise<{ rootId: string; db: Db; rev: string }>
  saveDb(db: Db, rev: string): Promise<string>
  createFolder(name: string, parentId: string): Promise<string>
  listFiles(folderId: string): Promise<DriveFile[]>
  upload(file: File, folderId: string, hooks: UploadHooks): Promise<DriveFile>
  trash(id: string): Promise<void>
  rename(id: string, name: string): Promise<void>
  quota(): Promise<Quota>
  shareLink(folderId: string): Promise<string>
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
