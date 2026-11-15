import { FileVideo, Film, Image as ImageIcon, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { openUpload, useUI } from '../lib/flow'
import { SPACES, stageIndex, type SpaceId } from '../lib/types'
import { useTransfers } from '../lib/uploads'
import { cx, fmtBytes, guessEdited, plural, stripExt, toast } from '../lib/util'
import { useVault } from '../lib/vault'
import { FolderPicker, type PickerRoot } from './FolderPicker'
import { Button, Modal } from './ui'

const NEW = '__new__'
const KINDS: { id: SpaceId; label: string; hint: string; icon: typeof Film; as: 'raw' | 'final' | 'thumb' }[] = [
  { id: 'raw', label: 'Raw footage', hint: 'Camera originals and B-roll', icon: FileVideo, as: 'raw' },
  { id: 'edited', label: 'Edited video', hint: 'A finished cut, ready for YouTube', icon: Film, as: 'final' },
  { id: 'thumbs', label: 'Thumbnail', hint: 'A cover image', icon: ImageIcon, as: 'thumb' },
]

/** Every upload goes through here, so every file is classified (raw or edited), filed in a folder, and optionally attached to a video. */
export function UploadDialog() {
  const req = useUI((s) => s.upload)
  const spaces = useVault((s) => s.db.spaces)
  const videos = useVault((s) => s.db.videos)
  const picker = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [space, setSpace] = useState<SpaceId>('raw')
  const [folder, setFolder] = useState<string | null>(null)
  const [folderLabel, setFolderLabel] = useState('')
  const [videoId, setVideoId] = useState('')
  const [over, setOver] = useState(false)
  const [suggested, setSuggested] = useState(false)
  const close = () => useUI.setState({ upload: null })

  // Reset whenever the dialog opens.
  useEffect(() => {
    if (!req) return
    setFiles(req.files)
    setSpace(req.space ?? (req.files.length && req.files.every((f) => guessEdited(f.name)) ? 'edited' : 'raw'))
    setSuggested(!req.space && req.files.length > 0 && req.files.every((f) => guessEdited(f.name)))
    setVideoId(req.videoId ?? '')
    setFolder(req.folderId ?? null)
  }, [req])

  const roots: PickerRoot[] = useMemo(() => (spaces ? SPACES.filter((s) => s.id === space).map((s) => ({ id: spaces[s.id], space: s.id, label: s.label })) : []), [spaces, space])
  const kind = KINDS.find((k) => k.id === space)!
  const total = files.reduce((n, f) => n + f.size, 0)
  const open = videos.filter((v) => (space === 'edited' ? true : stageIndex(v.stage) < stageIndex('published')))
  const add = (list: FileList | File[]) => {
    const picked = Array.from(list).filter((f) => f.size > 0 || f.type)
    if (!picked.length) return
    setFiles((cur) => [...cur, ...picked])
    if (!req?.space && picked.every((f) => guessEdited(f.name)) && files.length === 0) { setSpace('edited'); setSuggested(true) }
  }

  const start = () => {
    if (!folder || !files.length) return
    const store = useVault.getState()
    let attachTo = videoId
    if (videoId === NEW) {
      const title = stripExt(files[0].name).replace(/[_-]+/g, ' ').trim() || 'Untitled video'
      attachTo = store.createVideo({ title, stage: space === 'raw' ? 'shoot' : 'edit' }).id
    }
    useTransfers.getState().upload(files, { space, folderId: folder, attach: attachTo ? { videoId: attachTo, as: kind.as } : undefined })
    toast(`Uploading ${plural(files.length, 'file')} to ${folderLabel || kind.label}`, 'info')
    close()
  }

  return (
    <Modal open={req !== null} onOpenChange={(o) => !o && close()} title="Upload" description="Tell Slate what these files are and where they belong, so they land in the right place and the right workflow." wide>
      {!spaces ? (
        <p className="py-10 text-center text-mute">Setting up your library…</p>
      ) : (
        <div className="grid gap-5">
          {/* 1. files */}
          <div
            className="drop grid place-items-center px-5 py-5 text-center"
            data-over={over}
            onDragOver={(e) => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files) }}
          >
            {files.length === 0 ? (
              <>
                <Upload size={22} className="mb-2 text-lime" />
                <p className="font-semibold">Drag files here</p>
                <Button size="sm" className="mt-3" onClick={() => picker.current?.click()}>Choose files</Button>
              </>
            ) : (
              <div className="w-full text-left">
                <ul className="grid max-h-36 gap-1 overflow-auto">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-raise">
                      <FileVideo size={16} className="shrink-0 text-mute" />
                      <span className="min-w-0 flex-1 truncate text-[14px]">{f.name}</span>
                      <span className="mono text-[12px] text-dim">{fmtBytes(f.size)}</span>
                      <button type="button" className="text-dim hover:text-bad" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}><X size={15} /></button>
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => picker.current?.click()}>Add more</Button>
              </div>
            )}
            <input ref={picker} type="file" multiple hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = '' }} />
          </div>

          {/* 2. what are they */}
          <fieldset>
            <legend className="label mb-2">What are these files?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {KINDS.map((k) => (
                <label key={k.id} className={cx('flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors', space === k.id ? 'border-lime bg-lime/10' : 'border-line hover:border-line2')}>
                  <input type="radio" name="upload-kind" className="sr-only" checked={space === k.id} onChange={() => { setSpace(k.id); setFolder(null); setSuggested(false); if (k.id === 'thumbs') setVideoId('') }} />
                  <k.icon size={20} className={space === k.id ? 'text-lime' : 'text-mute'} />
                  <span><span className="block font-semibold">{k.label}</span><span className="block text-[12.5px] text-mute">{k.hint}</span></span>
                </label>
              ))}
            </div>
            {suggested && <p className="mt-2 text-[12.5px] text-lime">The file names look like finished exports, so Edited is selected. Change it if that is wrong.</p>}
          </fieldset>

          {/* 3. where, and which video */}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <p className="label mb-2">Save in folder</p>
              {roots.length > 0 && <FolderPicker key={space} roots={roots} initial={req?.folderId} height={170} onChange={(id, r) => { setFolder(id); setFolderLabel(r.label) }} />}
            </div>
            <div>
              <label htmlFor="up-video" className="label mb-2 block">Attach to a video (optional)</label>
              <select id="up-video" className="input" value={videoId} onChange={(e) => setVideoId(e.target.value)}>
                <option value="">Just save it in the Library</option>
                {space !== 'thumbs' && <option value={NEW}>+ New video from this file</option>}
                {open.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
              </select>
              <p className="mt-2 text-[13px] text-mute">
                {space === 'raw' && 'Linked footage shows up on the video, which moves to the Shoot stage.'}
                {space === 'edited' && 'An attached edit becomes the final export and the video moves to Uploads, ready to schedule.'}
                {space === 'thumbs' && 'The thumbnail is shown on the video everywhere it appears.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="mono text-[12.5px] text-mute">{files.length ? `${plural(files.length, 'file')} · ${fmtBytes(total)}` : 'No files chosen yet'}</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={close}>Cancel</Button>
              <Button variant="primary" onClick={start} disabled={!files.length || !folder}>
                <Upload size={16} /> Upload {files.length > 1 ? plural(files.length, 'file') : ''}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export { openUpload }
