import { ChevronRight, Folder, Film, Image as ImageIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useUI, videoPath } from '../lib/flow'
import { SPACES, stageIndex, type DriveItem, type SpaceId } from '../lib/types'
import { cx, fmtBytes, fmtClock, plural, stripExt, toast } from '../lib/util'
import { useVault } from '../lib/vault'
import { Button, Modal, Skeleton } from './ui'

const labelOf = (name: string) => stripExt(name).replace(/[_-]+/g, ' ').trim() || 'Untitled video'

/** Edited file in the Library -> a video in Uploads. This is the step that turns a file into something you publish. */
function SendToUploads() {
  const item = useUI((s) => s.sendTo)
  const videos = useVault((s) => s.db.videos)
  const nav = useNavigate()
  const open = useMemo(() => videos.filter((v) => v.stage !== 'published'), [videos])
  const owner = item ? videos.find((v) => v.editIds.includes(item.id)) : undefined
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [title, setTitle] = useState('')
  const [videoId, setVideoId] = useState('')
  const [final, setFinal] = useState(true)
  const close = () => useUI.setState({ sendTo: null })

  useEffect(() => {
    if (!item) return
    setTitle(labelOf(item.name))
    setFinal(true)
    setMode(owner || open.length ? (owner ? 'existing' : 'new') : 'new')
    setVideoId(owner?.id ?? open.find((v) => v.stage === 'edit')?.id ?? open[0]?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item])

  const go = () => {
    if (!item) return
    const s = useVault.getState()
    let id = videoId
    if (mode === 'new') id = s.createVideo({ title, stage: 'edit' }).id
    if (!id) return
    s.linkEdit(id, item.id, { final })
    close()
    toast('Sent to Uploads', 'ok', { label: 'Open', run: () => nav(videoPath(id, 'kit'), { viewTransition: true }) })
    nav(`/app/uploads?focus=${id}`, { viewTransition: true })
  }

  return (
    <Modal open={item !== null} onOpenChange={(o) => !o && close()} title="Send to Uploads" description="This edited video becomes part of your YouTube pipeline: title, description, schedule and publish checklist.">
      {item && (
        <div className="grid gap-4">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-coal p-3">
            <Film size={20} className="text-lime" />
            <div className="min-w-0"><p className="truncate font-semibold">{item.name}</p><p className="mono text-[12px] text-dim">{fmtBytes(item.size)}{item.durationMs ? ` · ${fmtClock(item.durationMs / 1000)}` : ''}</p></div>
          </div>
          {owner && <p className="rounded-xl bg-lime/10 px-3 py-2 text-[13px] text-lime">Already attached to “{owner.title}”. You can change its role below.</p>}
          <div role="radiogroup" aria-label="Where should it go" className="grid gap-2">
            <label className={cx('flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5', mode === 'new' ? 'border-lime bg-lime/10' : 'border-line')}>
              <input type="radio" name="send-mode" checked={mode === 'new'} onChange={() => setMode('new')} className="mt-1 accent-[var(--color-lime)]" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Make it a new video</span>
                {mode === 'new' && <input className="input mt-2" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Video title" maxLength={140} />}
              </span>
            </label>
            <label className={cx('flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5', mode === 'existing' ? 'border-lime bg-lime/10' : 'border-line', open.length === 0 && 'pointer-events-none opacity-50')}>
              <input type="radio" name="send-mode" checked={mode === 'existing'} onChange={() => setMode('existing')} className="mt-1 accent-[var(--color-lime)]" disabled={open.length === 0} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Add it to a video I already planned</span>
                {mode === 'existing' && (
                  <select className="input mt-2" value={videoId} onChange={(e) => setVideoId(e.target.value)} aria-label="Video">
                    {open.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
                  </select>
                )}
              </span>
            </label>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-[14px]">
            <input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} className="h-4 w-4 accent-[var(--color-lime)]" />
            This is the final export that gets published
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button variant="primary" onClick={go} disabled={mode === 'new' ? !title.trim() : !videoId}>Send to Uploads</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Raw clip in the Library -> a video it belongs to. */
function LinkRaw() {
  const item = useUI((s) => s.linkRaw)
  const videos = useVault((s) => s.db.videos)
  const nav = useNavigate()
  const open = useMemo(() => videos.filter((v) => stageIndex(v.stage) < stageIndex('published')), [videos])
  const [videoId, setVideoId] = useState('')
  const [title, setTitle] = useState('')
  const close = () => useUI.setState({ linkRaw: null })

  useEffect(() => {
    if (!item) return
    const owner = videos.find((v) => v.rawIds.includes(item.id))
    setVideoId(owner?.id ?? open.find((v) => v.stage === 'shoot')?.id ?? open[0]?.id ?? '__new__')
    setTitle(labelOf(item.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item])

  const go = () => {
    if (!item) return
    const s = useVault.getState()
    const id = videoId === '__new__' ? s.createVideo({ title, stage: 'shoot' }).id : videoId
    s.linkRaw(id, item.id)
    close()
    toast('Linked to the video', 'ok', { label: 'Open', run: () => nav(videoPath(id, 'footage'), { viewTransition: true }) })
  }

  return (
    <Modal open={item !== null} onOpenChange={(o) => !o && close()} title="Link to a video" description="Attach this clip to the video it belongs to, so it is one click away when you edit.">
      {item && (
        <div className="grid gap-4">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-coal p-3"><Film size={20} className="text-mute" /><p className="truncate font-semibold">{item.name}</p></div>
          <div>
            <label htmlFor="lr-video" className="label mb-1.5 block">Video</label>
            <select id="lr-video" className="input" value={videoId} onChange={(e) => setVideoId(e.target.value)}>
              {open.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
              <option value="__new__">+ New video from this clip</option>
            </select>
          </div>
          {videoId === '__new__' && <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New video title" maxLength={140} />}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" onClick={go} disabled={videoId === '__new__' && !title.trim()}>Link</Button></div>
        </div>
      )}
    </Modal>
  )
}

/** Choose files already in the Library and attach them to a video (footage tab and thumbnail). */
function LibraryPick() {
  const req = useUI((s) => s.pick)
  const spaces = useVault((s) => s.db.spaces)
  const video = useVault((s) => s.db.videos.find((v) => v.id === req?.videoId))
  const [space, setSpace] = useState<SpaceId>('raw')
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([])
  const [sel, setSel] = useState<DriveItem[]>([])
  const close = () => useUI.setState({ pick: null })

  const allowed: SpaceId[] = req?.kind === 'raw' ? ['raw'] : req?.kind === 'edit' ? ['edited'] : ['thumbs']
  useEffect(() => {
    if (req) {
      setSpace(allowed[0])
      setTrail([])
      setSel([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req])

  const root = spaces?.[space]
  const current = trail[trail.length - 1]?.id ?? root
  const listing = useVault((s) => (current ? s.listings[current] : undefined))
  useEffect(() => {
    if (current && req) void useVault.getState().loadFolder(current)
  }, [current, req])

  const single = req?.kind === 'thumb'
  const toggle = (i: DriveItem) => setSel((cur) => (cur.some((x) => x.id === i.id) ? cur.filter((x) => x.id !== i.id) : single ? [i] : [...cur, i]))
  const confirm = () => {
    if (!req || !sel.length) return
    const s = useVault.getState()
    if (req.kind === 'raw') sel.forEach((i) => s.linkRaw(req.videoId, i.id))
    else if (req.kind === 'edit') sel.forEach((i, n) => s.linkEdit(req.videoId, i.id, { final: n === sel.length - 1 && !video?.finalId }))
    else s.patchVideo(req.videoId, { thumbId: sel[0].id })
    toast(`Added ${plural(sel.length, 'file')}`)
    close()
  }

  const title = req?.kind === 'raw' ? 'Add raw footage' : req?.kind === 'edit' ? 'Add an edited export' : 'Choose a thumbnail'
  return (
    <Modal open={req !== null} onOpenChange={(o) => !o && close()} title={title} description="Pick from files already in your Library. Need something new? Upload it from the same tab." wide>
      {req && spaces && (
        <div className="grid gap-3">
          <nav className="mono flex flex-wrap items-center gap-1 text-[12.5px] text-mute" aria-label="Folder path">
            <button type="button" className="rounded-md px-1.5 py-0.5 hover:bg-raise hover:text-paper" onClick={() => setTrail([])}>{SPACES.find((s) => s.id === space)?.label}</button>
            {trail.map((t, i) => <span key={t.id} className="flex items-center gap-1"><ChevronRight size={12} /><button type="button" className="rounded-md px-1.5 py-0.5 hover:bg-raise hover:text-paper" onClick={() => setTrail(trail.slice(0, i + 1))}>{t.name}</button></span>)}
          </nav>
          <div className="h-[320px] overflow-auto rounded-2xl border border-line bg-coal p-1.5">
            {!listing ? <div className="grid gap-1.5"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : listing.items.length === 0 ? <p className="grid h-full place-items-center text-[13.5px] text-dim">Nothing in this folder yet.</p> : (
              <ul>
                {listing.items.map((i) =>
                  i.kind === 'folder' ? (
                    <li key={i.id}><button type="button" className="row flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left" onClick={() => setTrail([...trail, { id: i.id, name: i.name }])}><Folder size={18} className="text-lime" /><span className="flex-1 truncate">{i.name}</span><ChevronRight size={15} className="text-dim" /></button></li>
                  ) : (
                    <li key={i.id}>
                      <label className={cx('row flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2', sel.some((x) => x.id === i.id) && 'bg-lime/10')}>
                        <input type={single ? 'radio' : 'checkbox'} name="pick" checked={sel.some((x) => x.id === i.id)} onChange={() => toggle(i)} className="h-4 w-4 accent-[var(--color-lime)]" />
                        <span className="grid h-10 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-raise text-mute">{i.thumbnailLink ? <img src={i.thumbnailLink} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : req.kind === 'thumb' ? <ImageIcon size={16} /> : <Film size={16} />}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold">{i.name}</span><span className="mono block text-[11.5px] text-dim">{fmtBytes(i.size)}{i.durationMs ? ` · ${fmtClock(i.durationMs / 1000)}` : ''}</span></span>
                      </label>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="mono text-[12.5px] text-mute">{sel.length ? `${plural(sel.length, 'file')} selected` : 'Nothing selected'}</p>
            <div className="flex gap-2"><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" disabled={!sel.length} onClick={confirm}>Add to video</Button></div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export function LinkDialogs() {
  return (
    <>
      <SendToUploads />
      <LinkRaw />
      <LibraryPick />
    </>
  )
}
