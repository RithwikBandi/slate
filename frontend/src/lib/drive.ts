import { getToken } from './auth'
import { saveBlob } from './util'
import { Conflict, type Db, type DriveAPI, type DriveItem, type DownloadHooks, type Permission, type UploadHooks } from './types'

const API = 'https://www.googleapis.com/drive/v3'
const UP = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER = 'application/vnd.google-apps.folder'
const ITEM_FIELDS = 'id,name,mimeType,size,createdTime,modifiedTime,parents,thumbnailLink,webViewLink,videoMediaMetadata(durationMillis,width,height)'
const CHUNK = 8 * 1024 * 1024 // must be a multiple of 256 KiB
const MB = 1024 * 1024

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
const toItem = (f: any): DriveItem => ({
  id: f.id,
  name: f.name,
  kind: f.mimeType === FOLDER ? 'folder' : 'file',
  mimeType: f.mimeType ?? '',
  size: Number(f.size ?? 0),
  createdTime: f.createdTime ?? new Date().toISOString(),
  modifiedTime: f.modifiedTime ?? f.createdTime ?? new Date().toISOString(),
  parent: f.parents?.[0] ?? null,
  thumbnailLink: f.thumbnailLink,
  webViewLink: f.webViewLink,
  durationMs: f.videoMediaMetadata?.durationMillis ? Number(f.videoMediaMetadata.durationMillis) : undefined,
  width: f.videoMediaMetadata?.width,
  height: f.videoMediaMetadata?.height,
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
    const res = await g(`/files?fields=${enc(ITEM_FIELDS)}`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ name, mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}), ...(appProperties ? { appProperties } : {}) }),
    })
    return toItem(await res.json())
  }

  async function readDb(id: string) {
    const [meta, db] = await Promise.all([g(`/files/${id}?fields=id,version,trashed`).then((r) => r.json()), g(`/files/${id}?alt=media`).then((r) => r.json())])
    if (meta.trashed) throw new DriveError(404, 'trashed')
    return { db, rev: String(meta.version) }
  }

  return {
    kind: 'google',

    async open(empty: Db, hint) {
      // Fast path: ids from the last visit. Two parallel requests, no searching.
      if (hint?.dbId && hint.rootId) {
        try {
          const { db, rev } = await readDb(hint.dbId)
          rootId = hint.rootId
          dbId = hint.dbId
          return { rootId, dbId, db, rev }
        } catch {
          /* stale ids: fall through to the lookup */
        }
      }
      // One query finds the vault folder and the database file (both are tagged).
      const q = `trashed=false and (appProperties has { key='slate' and value='root' } or appProperties has { key='slate' and value='db' })`
      const found = (await (await g(`/files?q=${enc(q)}&fields=files(id,mimeType,version,parents,appProperties)&pageSize=20`)).json()).files ?? []
      const root = found.find((f: { mimeType: string; appProperties?: { slate?: string } }) => f.mimeType === FOLDER && f.appProperties?.slate === 'root')
      rootId = root?.id ?? (await mkFolder('Slate', null, { slate: 'root' })).id

      let dbFile = found.find((f: { appProperties?: { slate?: string }; parents?: string[] }) => f.appProperties?.slate === 'db' && f.parents?.includes(rootId))
      if (!dbFile) {
        // A database from before files were tagged.
        const dbQ = `'${rootId}' in parents and name='slate.db.json' and trashed=false`
        dbFile = (await (await g(`/files?q=${enc(dbQ)}&fields=files(id,version)&pageSize=1`)).json()).files?.[0]
        if (dbFile) void g(`/files/${dbFile.id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ appProperties: { slate: 'db' } }) }).catch(() => {})
      }
      if (dbFile) {
        dbId = dbFile.id
        const db = await (await g(`/files/${dbId}?alt=media`)).json()
        return { rootId, dbId, db, rev: String(dbFile.version) }
      }
      const mp = multipart({ name: 'slate.db.json', parents: [rootId], appProperties: { slate: 'db' } }, JSON.stringify(empty), 'application/json')
      const made = await (await g(`${UP}/files?uploadType=multipart&fields=id,version`, { method: 'POST', headers: { 'Content-Type': mp.type }, body: mp.body })).json()
      dbId = made.id
      return { rootId, dbId, db: empty, rev: String(made.version) }
    },

    async saveDb(db, rev) {
      const cur = await (await g(`/files/${dbId}?fields=version`)).json()
      if (String(cur.version) !== rev) throw new Conflict()
      const res = await g(`${UP}/files/${dbId}?uploadType=media&fields=version`, { method: 'PATCH', headers: json, body: JSON.stringify(db) })
      return String((await res.json()).version)
    },

    createFolder: (name, parentId) => mkFolder(name, parentId),

    async list(folderId, pageToken) {
      const q = `'${folderId}' in parents and trashed=false`
      const res = await g(`/files?q=${enc(q)}&fields=${enc(`nextPageToken,files(${ITEM_FIELDS})`)}&orderBy=${enc('folder,name_natural')}&pageSize=100${pageToken ? `&pageToken=${enc(pageToken)}` : ''}`)
      const j = await res.json()
      return { items: (j.files ?? []).map(toItem), next: j.nextPageToken }
    },

    async search(query) {
      const q = `name contains '${lit(query)}' and trashed=false`
      const res = await g(`/files?q=${enc(q)}&fields=${enc(`files(${ITEM_FIELDS})`)}&pageSize=40&orderBy=${enc('modifiedTime desc')}`)
      return ((await res.json()).files ?? []).map(toItem).filter((i: DriveItem) => !i.name.startsWith('slate.db'))
    },

    async get(id) {
      try {
        const res = await g(`/files/${id}?fields=${enc(`${ITEM_FIELDS},trashed`)}`)
        const f = await res.json()
        return f.trashed ? null : toItem(f)
      } catch (e) {
        if (e instanceof DriveError && e.status === 404) return null
        throw e
      }
    },

    async upload(file, folderId, h) {
      const s = h.session
      const finish = async (id: string) => toItem(await (await g(`/files/${id}?fields=${enc(ITEM_FIELDS)}`)).json())

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
          // The browser could not read the session URL (CORS). Let the sign-in functions start the session;
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

    async move(id, fromId, toId) {
      await g(`/files/${id}?addParents=${enc(toId)}&removeParents=${enc(fromId)}&fields=id`, { method: 'PATCH', headers: json, body: '{}' })
    },

    async rename(id, name) {
      await g(`/files/${id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ name }) })
    },

    async trash(id) {
      await g(`/files/${id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ trashed: true }) })
    },

    async quota() {
      const q = (await (await g('/about?fields=storageQuota')).json()).storageQuota ?? {}
      return { used: Number(q.usage ?? 0), limit: q.limit ? Number(q.limit) : null }
    },

    async permissions(id) {
      const res = await g(`/files/${id}/permissions?fields=${enc('permissions(id,type,role,emailAddress,displayName)')}`)
      return ((await res.json()).permissions ?? []).map((p: { id: string; type: string; role: string; emailAddress?: string; displayName?: string }): Permission => ({
        id: p.id,
        type: p.type === 'anyone' ? 'anyone' : 'user',
        role: p.role as Permission['role'],
        email: p.emailAddress,
        name: p.displayName,
      }))
    },

    async share(id, to) {
      const body = to.type === 'anyone' ? { type: 'anyone', role: 'reader' } : { type: 'user', role: to.role, emailAddress: to.email }
      const res = await g(`/files/${id}/permissions?sendNotificationEmail=${to.type === 'user'}&fields=${enc('id,type,role,emailAddress,displayName')}`, { method: 'POST', headers: json, body: JSON.stringify(body) })
      const p = await res.json()
      return { id: p.id, type: p.type === 'anyone' ? 'anyone' : 'user', role: p.role, email: p.emailAddress, name: p.displayName }
    },

    async unshare(id, permissionId) {
      await g(`/files/${id}/permissions/${permissionId}`, { method: 'DELETE' })
    },

    // A <video> element cannot send an Authorization header, so the short-lived token rides in the URL.
    async mediaUrl(item) {
      return `${API}/files/${item.id}?alt=media&access_token=${enc(await getToken())}`
    },

    async download(item, { onProgress, signal }) {
      const w = window as unknown as { showSaveFilePicker?: (o: { suggestedName: string }) => Promise<{ createWritable(): Promise<{ write(c: Uint8Array): Promise<void>; close(): Promise<void> }> }> }
      // Big files stream straight to disk where the browser allows it; this must run inside the click.
      const handle = item.size > 50 * MB && w.showSaveFilePicker ? await w.showSaveFilePicker({ suggestedName: item.name }) : null
      if (!handle && item.size > 600 * MB) {
        // No streaming-to-disk in this browser and too big to hold in memory: let the browser download it.
        const a = Object.assign(document.createElement('a'), { href: await this.mediaUrl(item), download: item.name })
        document.body.append(a)
        a.click()
        a.remove()
        onProgress(item.size, item.size)
        return
      }
      const res = await g(`/files/${item.id}?alt=media`, { signal })
      const total = Number(res.headers.get('content-length') || item.size) || item.size
      const reader = res.body!.getReader()
      let got = 0
      if (handle) {
        const out = await handle.createWritable()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          await out.write(value)
          got += value.length
          onProgress(got, total)
        }
        await out.close()
        return
      }
      const chunks: Uint8Array[] = []
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        got += value.length
        onProgress(got, total)
      }
      saveBlob(item.name, new Blob(chunks as BlobPart[], { type: item.mimeType || 'application/octet-stream' }))
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
