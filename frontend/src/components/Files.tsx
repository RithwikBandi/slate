import { BadgeCheck, Download, ExternalLink, File as FileIcon, FileVideo, Image as ImageIcon, Star, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { DriveFile, Project } from '../lib/types'
import { useUploads } from '../lib/uploads'
import { cx, fmtBytes, fmtDay, toast } from '../lib/util'
import { useVault } from '../lib/vault'
import { Button } from './ui'

const iconFor = (f: DriveFile) => (f.mimeType.startsWith('video/') ? <FileVideo size={18} /> : f.mimeType.startsWith('image/') ? <ImageIcon size={18} /> : <FileIcon size={18} />)

interface Props {
  /** Drive folder to show. Null means it does not exist yet and is created on first upload. */
  folderId: string | null
  /** Creates the folder when needed and returns its id. */
  resolveFolder(): Promise<string>
  project?: Project
  /** Edited folders can mark one export as the Final. */
  canMarkFinal?: boolean
  accept?: string
  hint: string
}

export function Files({ folderId, resolveFolder, project, canMarkFinal, accept, hint }: Props) {
  const files = useVault((s) => (folderId ? s.files[folderId] : undefined))
  const mode = useVault((s) => s.mode)
  const queued = useUploads((s) => s.items.filter((i) => i.folderId === folderId && i.state !== 'done').length)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (folderId) void useVault.getState().loadFiles(folderId)
  }, [folderId])

  async function take(list: FileList | null) {
    const picked = Array.from(list ?? []).filter((f) => f.size > 0 || f.type)
    if (!picked.length) return
    setBusy(true)
    try {
      const id = await resolveFolder()
      useUploads.getState().add(picked, id, project?.id ?? null)
    } catch (e) {
      toast(`Could not start the upload: ${(e as Error).message}`, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void take(e.dataTransfer.files)
  }

  async function remove(f: DriveFile) {
    if (!folderId || !confirm(`Move "${f.name}" to your Drive trash? You can restore it from Drive for 30 days.`)) return
    try {
      await useVault.getState().removeFile(folderId, f.id)
      toast('Moved to Drive trash')
    } catch (e) {
      toast(`Could not delete: ${(e as Error).message}`, 'bad')
    }
  }

  const loading = folderId !== null && files === undefined

  return (
    <div>
      <div
        className="drop grid place-items-center px-6 py-8 text-center"
        data-over={over}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <Upload size={22} className="mb-2.5 text-lime" />
        <p className="font-semibold">{over ? 'Drop to upload' : 'Drag files here'}</p>
        <p className="mt-0.5 max-w-md text-[13.5px] text-mute">{hint}</p>
        <Button size="sm" className="mt-3.5" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Preparing…' : 'Choose files'}
        </Button>
        <input ref={input} type="file" multiple hidden accept={accept} onChange={(e) => { void take(e.target.files); e.target.value = '' }} />
      </div>

      {queued > 0 && <p className="mono mt-3 text-[12.5px] text-tape">{queued} upload{queued > 1 ? 's' : ''} in progress. Watch them in the tray, bottom right.</p>}

      <div className="mt-4">
        {loading && (
          <div className="grid gap-2">
            <div className="skeleton h-14" />
            <div className="skeleton h-14" />
          </div>
        )}
        {!loading && (files?.length ?? 0) === 0 && <p className="py-6 text-center text-[13.5px] text-dim">Nothing here yet.</p>}
        <ul className="grid gap-1">
          {files?.map((f) => {
            const isFinal = project?.finalFileId === f.id
            const verified = project?.verified.includes(f.id)
            return (
              <li key={f.id} className="row flex items-center gap-3 rounded-xl px-2.5 py-2">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-coal text-mute">
                  {f.thumbnailLink ? <img src={f.thumbnailLink} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : iconFor(f)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{f.name}</p>
                  <p className="mono flex flex-wrap items-center gap-x-2.5 text-[12px] text-dim">
                    <span>{fmtBytes(f.size)}</span>
                    <span>{fmtDay(f.createdTime)}</span>
                    {isFinal && <span className="text-lime">FINAL</span>}
                    {verified && (
                      <span className="inline-flex items-center gap-1 text-lime" title="The uploaded size matches your local file exactly">
                        <BadgeCheck size={12} /> size verified
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canMarkFinal && project && (
                    <Button
                      size="sm"
                      icon
                      variant="ghost"
                      aria-label={isFinal ? 'This is the final export' : 'Mark as final export'}
                      title={isFinal ? 'This is the final export' : 'Mark as the final export'}
                      aria-pressed={isFinal}
                      onClick={() => useVault.getState().patchProject(project.id, { finalFileId: isFinal ? null : f.id, localCleared: false })}
                    >
                      <Star size={16} className={cx(isFinal && 'fill-lime text-lime')} />
                    </Button>
                  )}
                  {f.webContentLink ? (
                    <a className="btn btn-sm btn-ghost icon-btn" href={f.webContentLink} download={f.name} target="_blank" rel="noreferrer" aria-label={`Download ${f.name}`} title="Download">
                      <Download size={16} />
                    </a>
                  ) : (
                    <Button size="sm" icon variant="ghost" disabled aria-label="Download unavailable" title={mode === 'demo' ? 'Sample file: nothing to download' : 'Download unavailable'}>
                      <Download size={16} />
                    </Button>
                  )}
                  {f.webViewLink && (
                    <a className="btn btn-sm btn-ghost icon-btn" href={f.webViewLink} target="_blank" rel="noreferrer" aria-label={`Open ${f.name} in Google Drive`} title="Open in Google Drive">
                      <ExternalLink size={16} />
                    </a>
                  )}
                  <Button size="sm" icon variant="danger" aria-label={`Delete ${f.name}`} title="Move to Drive trash" onClick={() => remove(f)}>
                    <Trash2 size={16} />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
