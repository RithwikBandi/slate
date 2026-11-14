import { getToken } from './auth'
import { Conflict, type Db, type DriveAPI, type DriveFile, type UploadHooks } from './types'

const API = 'https://www.googleapis.com/drive/v3'
const UP = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER = 'application/vnd.google-apps.folder'
const FILE_FIELDS = 'id,name,size,mimeType,createdTime,thumbnailLink,webViewLink,webContentLink'
const CHUNK = 8 * 1024 * 1024 // must be a multiple of 256 KiB

export class DriveError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function g(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken()
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) },
  })
  if (!res.ok) {
    let message = `Google Drive request failed (${res.status})`
    try {
      message = (await res.json()).error?.message ?? message
    } catch {
      /* non-JSON error body */
    }
    throw new DriveError(res.status, message)
  }
  return res
}

const enc = encodeURIComponent
const lit = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const json = { 'Content-Type': 'application/json; charset=UTF-8' }

function multipart(meta: object, body: string, type: string) {
  const b = `slate${Math.random().toString(36).slice(2)}`
  return {
    type: `multipart/related; boundary=${b}`,
    body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${type}\r\n\r\n${body}\r\n--${b}--`,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toFile = (f: any): DriveFile => ({
  id: f.id,
  name: f.name,
  size: Number(f.size ?? 0),
  mimeType: f.mimeType ?? '',
  createdTime: f.createdTime ?? new Date().toISOString(),
  thumbnailLink: f.thumbnailLink,
  webViewLink: f.webViewLink,
  webContentLink: f.webContentLink,
})

type ChunkResult = { done: true; id: string } | { done: false; next: number }

function putChunk(url: string, blob: Blob, start: number, total: number, h: UploadHooks): Promise<ChunkResult> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    const end = start + blob.size
    x.open('PUT', url)
    x.setRequestHeader('Content-Range', total === 0 ? 'bytes */0' : `bytes ${start}-${end - 1}/${total}`)
    x.upload.onprogress = (e) => h.onProgress(start + e.loaded)
    x.onload = () => {
      if (x.status === 200 || x.status === 201) {
        try {
          resolve({ done: true, id: JSON.parse(x.responseText).id })
        } catch {
          reject(new Error('Upload finished but Drive sent an unreadable reply'))
        }
      } else if (x.status === 308) {
        const m = /bytes=0-(\d+)/.exec(x.getResponseHeader('Range') ?? '')
        resolve({ done: false, next: m ? Number(m[1]) + 1 : end })
      } else reject(new DriveError(x.status, `Upload failed (${x.status})`))
    }
    x.onerror = () => reject(new Error('Network error during upload'))
    x.onabort = () => reject(new DOMException('Upload paused', 'AbortError'))
    if (h.signal.aborted) return reject(new DOMException('Upload paused', 'AbortError'))
    h.signal.addEventListener('abort', () => x.abort(), { once: true })
    x.send(blob)
  })
}

/** Ask Drive how many bytes of a resumable session it already has. */
async function probe(url: string, total: number, fallback: number): Promise<number | { id: string }> {
  try {
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Range': `bytes */${total}` } })
    if (r.status === 200 || r.status === 201) return { id: (await r.json()).id }
    if (r.status === 308) {
      const m = /bytes=0-(\d+)/.exec(r.headers.get('Range') ?? '')
      return m ? Number(m[1]) + 1 : 0
    }
  } catch {
    /* fall through */
  }
  return fallback
}

export function googleDrive(): DriveAPI {
  let rootId = ''
  let dbId = ''

  async function mkFolder(name: string, parentId: string | null, appProperties?: Record<string, string>) {
    const res = await g('/files?fields=id', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ name, mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}), ...(appProperties ? { appProperties } : {}) }),
    })
    return (await res.json()).id as string
  }

  return {
    kind: 'google',

    async open(empty: Db) {
      const rootQ = `mimeType='${FOLDER}' and trashed=false and appProperties has { key='slate' and value='root' }`
      const found = await (await g(`/files?q=${enc(rootQ)}&fields=files(id)&pageSize=1`)).json()
      rootId = found.files?.[0]?.id ?? (await mkFolder('Slate', null, { slate: 'root' }))

      const dbQ = `'${rootId}' in parents and name='slate.db.json' and trashed=false`
      const dbs = await (await g(`/files?q=${enc(dbQ)}&fields=files(id,version)&pageSize=1`)).json()
      if (dbs.files?.[0]) {
        dbId = dbs.files[0].id
        const db = (await (await g(`/files/${dbId}?alt=media`)).json()) as Db
        return { rootId, db, rev: String(dbs.files[0].version) }
      }
      const mp = multipart({ name: 'slate.db.json', parents: [rootId] }, JSON.stringify(empty), 'application/json')
      const made = await (
        await g(`${UP}/files?uploadType=multipart&fields=id,version`, { method: 'POST', headers: { 'Content-Type': mp.type }, body: mp.body })
      ).json()
      dbId = made.id
      return { rootId, db: empty, rev: String(made.version) }
    },

    async saveDb(db, rev) {
      const cur = await (await g(`/files/${dbId}?fields=version`)).json()
      if (String(cur.version) !== rev) throw new Conflict()
      const res = await g(`${UP}/files/${dbId}?uploadType=media&fields=version`, { method: 'PATCH', headers: json, body: JSON.stringify(db) })
      return String((await res.json()).version)
    },

    createFolder: (name, parentId) => mkFolder(name, parentId),

    async listFiles(folderId) {
      const q = `'${folderId}' in parents and trashed=false and mimeType!='${FOLDER}'`
      const res = await g(`/files?q=${enc(q)}&fields=files(${FILE_FIELDS})&orderBy=createdTime desc&pageSize=200`)
      return ((await res.json()).files ?? []).map(toFile).filter((f: DriveFile) => f.name !== 'Publish kit.txt')
    },

    async upload(file, folderId, h) {
      const s = h.session
      const finish = async (id: string) => toFile(await (await g(`/files/${id}?fields=${FILE_FIELDS}`)).json())

      if (!s.url) {
        const meta = { name: file.name, parents: [folderId] }
        const type = file.type || 'application/octet-stream'
        const res = await g(`${UP}/files?uploadType=resumable`, {
          method: 'POST',
          headers: { ...json, 'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(file.size) },
          body: JSON.stringify(meta),
        })
        s.url = res.headers.get('Location') ?? undefined
        if (!s.url) {
          // Browser could not read the session URL (CORS). Let the auth server start the session instead;
          // the file bytes still go straight from this browser to Google.
          const r = await fetch('/api/drive/init', {
            method: 'POST',
            headers: { 'X-Slate': '1', 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...meta, mimeType: type, size: file.size }),
          })
          if (!r.ok) throw new Error('Could not start the upload session')
          s.url = (await r.json()).location
        }
        s.offset = 0
      } else {
        const at = await probe(s.url, file.size, s.offset)
        if (typeof at !== 'number') return finish(at.id)
        s.offset = at
      }

      for (;;) {
        const end = Math.min(s.offset + CHUNK, file.size)
        const r = await putChunk(s.url!, file.slice(s.offset, end), s.offset, file.size, h)
        if (r.done) return finish(r.id)
        s.offset = r.next
        h.onProgress(s.offset)
      }
    },

    async trash(id) {
      await g(`/files/${id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ trashed: true }) })
    },

    async rename(id, name) {
      await g(`/files/${id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ name }) })
    },

    async quota() {
      const q = (await (await g('/about?fields=storageQuota')).json()).storageQuota ?? {}
      return { used: Number(q.usage ?? 0), limit: q.limit ? Number(q.limit) : null }
    },

    async shareLink(folderId) {
      await g(`/files/${folderId}/permissions`, { method: 'POST', headers: json, body: JSON.stringify({ role: 'reader', type: 'anyone' }) })
      return `https://drive.google.com/drive/folders/${folderId}`
    },

    async writeText(name, parentId, text) {
      const q = `'${parentId}' in parents and name='${lit(name)}' and trashed=false`
      const hit = (await (await g(`/files?q=${enc(q)}&fields=files(id)&pageSize=1`)).json()).files?.[0]
      if (hit) {
        await g(`${UP}/files/${hit.id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'text/plain; charset=UTF-8' }, body: text })
      } else {
        const mp = multipart({ name, parents: [parentId] }, text, 'text/plain; charset=UTF-8')
        await g(`${UP}/files?uploadType=multipart`, { method: 'POST', headers: { 'Content-Type': mp.type }, body: mp.body })
      }
    },

    folderUrl: (id) => `https://drive.google.com/drive/folders/${id}`,
  }
}
