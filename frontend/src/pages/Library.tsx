import * as DM from '@radix-ui/react-dropdown-menu'
import { ArrowDownToLine, ArrowUpDown, ChevronRight, Clapperboard, Download, File as FileIcon, FileVideo, Film, Folder, FolderPlus, Image as ImageIcon, LayoutGrid, Link2, List, MoreHorizontal, Pencil, Play, Search, Send, Share2, Trash2, Upload, UserPlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Button, Empty, Modal, Segmented, Skeleton, Spinner } from '../components/ui'
import { openUpload, useUI } from '../lib/flow'
import { usePlayer } from '../lib/player'
import { SPACES, type DriveItem, type SpaceId } from '../lib/types'
import { useTransfers } from '../lib/uploads'
import { cx, fmtBytes, fmtClock, fmtDay, isImageItem, isVideoItem, plural, toast } from '../lib/util'
import { driveApi, useVault } from '../lib/vault'

type View = 'grid' | 'list'
type Sort = 'name' | 'date' | 'size'
const trails = new Map<string, { id: string; name: string }[]>()

const itemIcon = (i: DriveItem, size = 20) => (i.kind === 'folder' ? <Folder size={size} className="text-lime" /> : isVideoItem(i) ? <FileVideo size={size} /> : isImageItem(i) ? <ImageIcon size={size} /> : <FileIcon size={size} />)

/** The chain of folders from the space root down to `folderId`, rebuilt from Drive if we arrived by link. */
function useTrail(folderId: string | undefined, rootId: string | undefined) {
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    if (!folderId || !rootId || folderId === rootId) return setTrail([])
    const cached = trails.get(folderId)
    if (cached) return setTrail(cached)
    let live = true
    void (async () => {
      const chain: { id: string; name: string }[] = []
      let id: string | null = folderId
      for (let n = 0; n < 10 && id && id !== rootId; n++) {
        const it: DriveItem | null = await useVault.getState().getItem(id)
        if (!it) break
        chain.unshift({ id: it.id, name: it.name })
        id = it.parent
      }
      trails.set(folderId, chain)
      if (live) setTrail(chain)
    })()
    return () => {
      live = false
    }
  }, [folderId, rootId])
  return trail
}

export default function Library() {
  const spaces = useVault((s) => s.db.spaces)
  const videos = useVault((s) => s.db.videos)
  const [params, setParams] = useSearchParams()
  const space = (SPACES.find((s) => s.id === params.get('space'))?.id ?? 'raw') as SpaceId
  const root = spaces?.[space]
  const current = params.get('f') || root
  const listing = useVault((s) => (current ? s.listings[current] : undefined))
  const busy = useVault((s) => (current ? s.busy[current] : false))
  const trail = useTrail(params.get('f') ?? undefined, root)

  const [view, setView] = useState<View>(() => (localStorage.getItem('slate-lib-view') as View) || 'grid')
  const [sort, setSort] = useState<Sort>('name')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<DriveItem[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState<string | null>(null) // 'page' or a folder id
  const [renaming, setRenaming] = useState<DriveItem | null>(null)
  const [deleting, setDeleting] = useState<DriveItem[] | null>(null)
  const [newFolder, setNewFolder] = useState(false)
  const [lightbox, setLightbox] = useState<DriveItem | null>(null)
  const dragDepth = useRef(0)

  useEffect(() => {
    if (current) void useVault.getState().loadFolder(current)
    setSelected(new Set())
    setQ('')
    setResults(null)
  }, [current])

  // Global search across the Library, after a short pause in typing.
  useEffect(() => {
    if (q.trim().length < 2) return setResults(null)
    let live = true
    const t = setTimeout(async () => {
      try {
        const r = await driveApi().search(q.trim())
        if (live) setResults(r)
      } catch {
        if (live) setResults([])
      }
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q])

  // Which videos each file belongs to, so cards can say "In Uploads".
  const usage = useMemo(() => {
    const m = new Map<string, { title: string; role: 'raw' | 'edit' | 'final'; videoId: string; stage: string }>()
    for (const v of videos) {
      v.rawIds.forEach((id) => m.set(id, { title: v.title, role: 'raw', videoId: v.id, stage: v.stage }))
      v.editIds.forEach((id) => m.set(id, { title: v.title, role: v.finalId === id ? 'final' : 'edit', videoId: v.id, stage: v.stage }))
    }
    return m
  }, [videos])

  const items = useMemo(() => {
    const base = results ?? listing?.items ?? []
    const needle = q.trim().toLowerCase()
    const list = results ? base : needle ? base.filter((i) => i.name.toLowerCase().includes(needle)) : base
    return [...list].sort((a, b) => (a.kind !== b.kind ? (a.kind === 'folder' ? -1 : 1) : sort === 'date' ? b.modifiedTime.localeCompare(a.modifiedTime) : sort === 'size' ? b.size - a.size : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })))
  }, [listing, results, q, sort])
  const folders = items.filter((i) => i.kind === 'folder')
  const files = items.filter((i) => i.kind === 'file')
  const playable = useMemo(() => files.filter(isVideoItem), [files])

  const go = (next: { space?: SpaceId; folder?: string | null }) => {
    const p = new URLSearchParams()
    p.set('space', next.space ?? space)
    if (next.folder) p.set('f', next.folder)
    setParams(p)
  }
  const openFolder = (f: DriveItem) => {
    trails.set(f.id, [...trail, { id: f.id, name: f.name }])
    go({ folder: f.id })
  }
  const setViewMode = (v: View) => {
    setView(v)
    localStorage.setItem('slate-lib-view', v)
  }

  const openItem = (i: DriveItem) => {
    if (i.kind === 'folder') return openFolder(i)
    if (isVideoItem(i)) return usePlayer.getState().play(i, { queue: playable, videoId: usage.get(i.id)?.videoId })
    if (isImageItem(i)) return setLightbox(i)
    if (i.webViewLink) window.open(i.webViewLink, '_blank', 'noopener')
    else toast('This type of file cannot be previewed here. Download it instead.', 'info')
  }

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const chosen = items.filter((i) => selected.has(i.id))

  // ---- drag and drop: files from the computer upload, items from this page move
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')
  const onPageDrop = (e: DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragOver(null)
    if (hasFiles(e) && current) openUpload({ files: Array.from(e.dataTransfer.files), space, folderId: current })
  }
  const dropOnFolder = (e: DragEvent, f: DriveItem) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(null)
    dragDepth.current = 0
    const ids: string[] = JSON.parse(e.dataTransfer.getData('text/slate-items') || '[]')
    if (ids.length) {
      const moving = items.filter((i) => ids.includes(i.id) && i.id !== f.id)
      void useVault.getState().moveItems(moving, f.id)
    } else if (hasFiles(e)) openUpload({ files: Array.from(e.dataTransfer.files), space, folderId: f.id })
  }
  const dragStart = (e: DragEvent, i: DriveItem) => {
    const ids = selected.has(i.id) ? [...selected] : [i.id]
    e.dataTransfer.setData('text/slate-items', JSON.stringify(ids))
    e.dataTransfer.effectAllowed = 'move'
  }

  const menu = (i: DriveItem) => (
    <ItemMenu
      item={i}
      space={space}
      onOpen={() => openItem(i)}
      onRename={() => setRenaming(i)}
      onDelete={() => setDeleting([i])}
    />
  )

  const spaceInfo = SPACES.find((s) => s.id === space)!
  const loading = !spaces || (!listing && !results)

  return (
    <div
      className="relative grid gap-5"
      onDragEnter={(e) => { if (hasFiles(e)) { dragDepth.current++; setDragOver('page') } }}
      onDragOver={(e) => { if (hasFiles(e)) e.preventDefault() }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragOver(null) }}
      onDrop={onPageDrop}
    >
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Your footage, organised like Drive</p>
          <h1 className="display mt-2 text-[clamp(32px,4.4vw,48px)]">Library</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setNewFolder(true)} disabled={!current}><FolderPlus size={16} /> New folder</Button>
          <Button variant="primary" onClick={() => openUpload({ space, folderId: current })} disabled={!current}><Upload size={16} /> Upload</Button>
        </div>
      </header>

      <div className="rise flex flex-wrap items-center gap-3" style={{ ['--i' as string]: 1 }}>
        <Segmented
          label="Library space"
          value={space}
          onChange={(s) => go({ space: s, folder: null })}
          options={SPACES.map((s) => ({ id: s.id, label: s.label, title: s.hint }))}
        />
        <label className="input ml-auto flex h-10 w-full max-w-xs items-center gap-2 py-0 sm:w-64">
          <Search size={15} className="text-dim" />
          <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dim" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your Library" aria-label="Search your Library" />
          {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="text-dim hover:text-paper"><X size={15} /></button>}
        </label>
        <div className="flex items-center gap-1">
          <DM.Root>
            <DM.Trigger asChild><Button icon aria-label="Sort"><ArrowUpDown size={16} /></Button></DM.Trigger>
            <DM.Portal>
              <DM.Content className="menu" align="end" sideOffset={6}>
                {(['name', 'date', 'size'] as Sort[]).map((s) => <DM.Item key={s} className={cx('menu-item', sort === s && 'is-on')} onSelect={() => setSort(s)}>Sort by {s === 'date' ? 'last changed' : s}</DM.Item>)}
              </DM.Content>
            </DM.Portal>
          </DM.Root>
          <Segmented label="Layout" value={view} onChange={setViewMode} options={[{ id: 'grid', label: <LayoutGrid size={15} />, title: 'Grid' }, { id: 'list', label: <List size={15} />, title: 'List' }]} />
        </div>
      </div>

      {/* breadcrumb */}
      <nav className="mono rise flex flex-wrap items-center gap-1 text-[13px] text-mute" style={{ ['--i' as string]: 2 }} aria-label="Folder path">
        <Crumb label={spaceInfo.label} onClick={() => go({ folder: null })} active={!params.get('f')} onDropItems={(ids) => root && void useVault.getState().moveItems(items.filter((i) => ids.includes(i.id)), root)} />
        {trail.map((t, i) => (
          <span key={t.id} className="flex items-center gap-1">
            <ChevronRight size={13} />
            <Crumb label={t.name} onClick={() => { trails.set(t.id, trail.slice(0, i + 1)); go({ folder: t.id }) }} active={i === trail.length - 1} onDropItems={(ids) => void useVault.getState().moveItems(items.filter((x) => ids.includes(x.id)), t.id)} />
          </span>
        ))}
        {busy && listing && <span className="ml-2 inline-flex items-center gap-1.5 text-dim"><Spinner size={12} /> Refreshing</span>}
        {results && <span className="ml-2 text-lime">Results across your whole Library</span>}
      </nav>

      {/* bulk actions */}
      {chosen.length > 0 && (
        <div className="bulk glass-solid sticky top-[68px] z-20 flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5" role="toolbar" aria-label="Selected items">
          <span className="font-semibold">{plural(chosen.length, 'item')} selected</span>
          <span className="flex-1" />
          <Button size="sm" onClick={() => useUI.setState({ move: chosen })}>Move</Button>
          {chosen.every((i) => i.kind === 'file') && <Button size="sm" onClick={() => { chosen.forEach((i) => useTransfers.getState().download(i)); setSelected(new Set()) }}><Download size={14} /> Download</Button>}
          <Button size="sm" variant="danger" onClick={() => setDeleting(chosen)}><Trash2 size={14} /> Delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {/* content */}
      {loading ? (
        <div className={view === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid gap-2'}>
          {Array.from({ length: view === 'grid' ? 8 : 6 }, (_, i) => <Skeleton key={i} className={view === 'grid' ? 'aspect-[4/3]' : 'h-16'} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <Empty
            icon={space === 'raw' ? <FileVideo size={24} /> : space === 'edited' ? <Film size={24} /> : <ImageIcon size={24} />}
            title={q ? 'Nothing matches that search' : `No ${spaceInfo.label.toLowerCase()} here yet`}
            body={q ? 'Try a different word, or clear the search.' : space === 'raw' ? 'Drop your camera files here. Make a folder per video or per day, whichever helps you find things.' : space === 'edited' ? 'Upload finished cuts here, then send them to Uploads to schedule and publish them.' : 'Thumbnails you upload live here, ready to attach to videos.'}
            action={!q && <Button variant="primary" onClick={() => openUpload({ space, folderId: current })}><Upload size={16} /> Upload to {spaceInfo.label}</Button>}
          />
        </div>
      ) : (
        <>
          {folders.length > 0 && (
            <section aria-label="Folders">
              <h2 className="label mb-2">Folders</h2>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {folders.map((f) => (
                  <div
                    key={f.id}
                    draggable
                    onDragStart={(e) => dragStart(e, f)}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(f.id) }}
                    onDragLeave={() => setDragOver((d) => (d === f.id ? null : d))}
                    onDrop={(e) => dropOnFolder(e, f)}
                    className={cx('fcard group flex items-center gap-3 rounded-2xl border p-3 transition-[border-color,background-color,transform] duration-200', dragOver === f.id ? 'scale-[1.02] border-lime bg-lime/10' : selected.has(f.id) ? 'border-lime/60 bg-lime/5' : 'border-line bg-panel hover:border-line2')}
                  >
                    <input type="checkbox" aria-label={`Select ${f.name}`} checked={selected.has(f.id)} onChange={() => toggle(f.id)} className={cx('h-4 w-4 accent-[var(--color-lime)]', selected.size === 0 && 'opacity-0 group-hover:opacity-100 focus:opacity-100')} />
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openFolder(f)} onDoubleClick={() => openFolder(f)}>
                      <Folder size={26} className="shrink-0 text-lime" fill="currentColor" fillOpacity={0.15} />
                      <span className="min-w-0"><span className="block truncate font-semibold">{f.name}</span><span className="mono block text-[11.5px] text-dim">{fmtDay(f.modifiedTime)}</span></span>
                    </button>
                    {menu(f)}
                  </div>
                ))}
              </div>
            </section>
          )}

          {files.length > 0 && (
            <section aria-label="Files">
              <h2 className="label mb-2">{plural(files.length, 'file')}</h2>
              {view === 'grid' ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {files.map((f, i) => {
                    const u = usage.get(f.id)
                    const on = selected.has(f.id)
                    return (
                      <article key={f.id} draggable onDragStart={(e) => dragStart(e, f)} className={cx('fcard group card rise overflow-hidden transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5', on && '!border-lime')} style={{ ['--i' as string]: Math.min(i, 12) }}>
                        <div className="relative aspect-video cursor-pointer overflow-hidden bg-coal" onClick={() => openItem(f)} role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openItem(f))} aria-label={`${isVideoItem(f) ? 'Play' : 'Open'} ${f.name}`}>
                          {f.thumbnailLink ? <img src={f.thumbnailLink} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-dim">{itemIcon(f, 34)}</div>}
                          {isVideoItem(f) && <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100"><span className="grid h-12 w-12 place-items-center rounded-full bg-paper text-carbon shadow-xl"><Play size={20} fill="currentColor" className="ml-0.5" /></span></span>}
                          {f.durationMs ? <span className="mono absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px]">{fmtClock(f.durationMs / 1000)}</span> : null}
                          <input type="checkbox" aria-label={`Select ${f.name}`} checked={on} onClick={(e) => e.stopPropagation()} onChange={() => toggle(f.id)} className={cx('absolute left-2.5 top-2.5 h-4 w-4 accent-[var(--color-lime)]', selected.size === 0 && !on && 'opacity-0 group-hover:opacity-100 focus:opacity-100')} />
                          {u && <span className="absolute left-2.5 bottom-2 max-w-[70%] truncate rounded-md bg-lime px-1.5 py-0.5 text-[11px] font-bold text-carbon">{u.role === 'raw' ? 'Raw' : u.role === 'final' ? 'Final' : 'Cut'} · {u.title}</span>}
                        </div>
                        <div className="flex items-start gap-2 p-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold" title={f.name}>{f.name}</p>
                            <p className="mono mt-0.5 text-[11.5px] text-dim">{fmtBytes(f.size)} · {fmtDay(f.modifiedTime)}</p>
                          </div>
                          {menu(f)}
                        </div>
                        {space === 'edited' && isVideoItem(f) && !(u && u.stage !== 'edit' && u.stage !== 'idea') && (
                          <button type="button" className="send flex w-full items-center justify-center gap-2 border-t border-line bg-lime/10 py-2 text-[13px] font-semibold text-lime transition-colors hover:bg-lime hover:text-carbon" onClick={() => useUI.setState({ sendTo: f })}><Send size={14} /> Send to Uploads</button>
                        )}
                        {space === 'raw' && isVideoItem(f) && !u && (
                          <button type="button" className="flex w-full items-center justify-center gap-2 border-t border-line py-2 text-[13px] font-semibold text-mute transition-colors hover:bg-raise hover:text-paper" onClick={() => useUI.setState({ linkRaw: f })}><Link2 size={14} /> Link to a video</button>
                        )}
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="mono hidden grid-cols-[28px_56px_1fr_120px_90px_110px_40px] items-center gap-3 border-b border-line px-3 py-2 text-[11px] uppercase tracking-wider text-dim md:grid"><span /><span /><span>Name</span><span>Used in</span><span>Length</span><span>Changed</span><span /></div>
                  {files.map((f) => {
                    const u = usage.get(f.id)
                    return (
                      <div key={f.id} draggable onDragStart={(e) => dragStart(e, f)} className="row group grid grid-cols-[28px_56px_1fr_40px] items-center gap-3 px-3 py-2 md:grid-cols-[28px_56px_1fr_120px_90px_110px_40px]">
                        <input type="checkbox" aria-label={`Select ${f.name}`} checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="h-4 w-4 accent-[var(--color-lime)]" />
                        <button type="button" onClick={() => openItem(f)} className="relative grid h-10 w-14 place-items-center overflow-hidden rounded-md bg-coal text-dim" aria-label={`Open ${f.name}`}>
                          {f.thumbnailLink ? <img src={f.thumbnailLink} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : itemIcon(f, 18)}
                        </button>
                        <button type="button" onClick={() => openItem(f)} className="min-w-0 text-left"><span className="block truncate font-semibold">{f.name}</span><span className="mono block text-[11.5px] text-dim md:hidden">{fmtBytes(f.size)} · {fmtDay(f.modifiedTime)}</span><span className="mono hidden text-[11.5px] text-dim md:block">{fmtBytes(f.size)}</span></button>
                        <span className="hidden truncate text-[12.5px] text-lime md:block">{u ? u.title : ''}</span>
                        <span className="mono hidden text-[12.5px] text-mute md:block">{f.durationMs ? fmtClock(f.durationMs / 1000) : ''}</span>
                        <span className="mono hidden text-[12.5px] text-mute md:block">{fmtDay(f.modifiedTime)}</span>
                        {menu(f)}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}
          {listing?.next && !results && (
            <div className="grid place-items-center"><Button onClick={() => current && void useVault.getState().loadMore(current)} disabled={busy}>{busy ? <Spinner size={14} /> : <ArrowDownToLine size={15} />} Load more</Button></div>
          )}
        </>
      )}

      {/* drop overlay */}
      {dragOver === 'page' && current && (
        <div className="pointer-events-none fixed inset-0 z-[55] grid place-items-center bg-carbon/80 backdrop-blur-sm" aria-hidden="true">
          <div className="rounded-[32px] border-2 border-dashed border-lime bg-lime/5 px-14 py-12 text-center">
            <Upload size={40} className="mx-auto mb-3 text-lime" />
            <p className="display text-[30px]">Drop to upload</p>
            <p className="mt-1 text-mute">into {trail[trail.length - 1]?.name ?? spaceInfo.label}. You will choose what they are next.</p>
          </div>
        </div>
      )}

      <RenameDialog item={renaming} onClose={() => setRenaming(null)} />
      <NewFolderDialog open={newFolder} parent={current} onClose={() => setNewFolder(false)} onCreated={(f) => openFolder(f)} />
      <DeleteDialog items={deleting} onClose={() => { setDeleting(null); setSelected(new Set()) }} />
      <Modal open={lightbox !== null} onOpenChange={(o) => !o && setLightbox(null)} title={lightbox?.name ?? ''} wide>
        {lightbox && <img src={(lightbox.local ?? lightbox.thumbnailLink)?.replace(/=s\d+$/, '=s1600')} alt={lightbox.name} className="max-h-[70vh] w-full rounded-2xl object-contain" referrerPolicy="no-referrer" />}
      </Modal>
    </div>
  )
}

function Crumb({ label, onClick, active, onDropItems }: { label: string; onClick(): void; active: boolean; onDropItems(ids: string[]): void }) {
  const [over, setOver] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('text/slate-items')) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const ids = JSON.parse(e.dataTransfer.getData('text/slate-items') || '[]'); if (ids.length) onDropItems(ids) }}
      className={cx('rounded-md px-2 py-1 transition-colors hover:bg-raise hover:text-paper', active && 'font-semibold text-paper', over && 'bg-lime/20 text-lime')}
    >
      {label}
    </button>
  )
}

/** Everything you can do to a file or folder, in one menu. */
function ItemMenu({ item, space, onOpen, onRename, onDelete }: { item: DriveItem; space: SpaceId; onOpen(): void; onRename(): void; onDelete(): void }) {
  const video = isVideoItem(item)
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button type="button" className="icon-btn btn btn-ghost btn-sm shrink-0" aria-label={`Actions for ${item.name}`} onClick={(e) => e.stopPropagation()}><MoreHorizontal size={17} /></button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content className="menu" align="end" sideOffset={6}>
          <DM.Item className="menu-item" onSelect={onOpen}>{item.kind === 'folder' ? <Folder size={15} /> : video ? <Play size={15} /> : <FileIcon size={15} />}{item.kind === 'folder' ? 'Open' : video ? 'Play' : 'Open'}</DM.Item>
          {item.kind === 'file' && <DM.Item className="menu-item" onSelect={() => useTransfers.getState().download(item)}><Download size={15} /> Download</DM.Item>}
          {video && space === 'edited' && <DM.Item className="menu-item" onSelect={() => useUI.setState({ sendTo: item })}><Send size={15} /> Send to Uploads</DM.Item>}
          {video && space === 'raw' && <DM.Item className="menu-item" onSelect={() => useUI.setState({ linkRaw: item })}><Clapperboard size={15} /> Link to a video</DM.Item>}
          <DM.Separator className="menu-sep" />
          <DM.Item className="menu-item" onSelect={() => useUI.setState({ share: item })}>{item.kind === 'folder' ? <UserPlus size={15} /> : <Share2 size={15} />} Share…</DM.Item>
          <DM.Item className="menu-item" onSelect={onRename}><Pencil size={15} /> Rename</DM.Item>
          <DM.Item className="menu-item" onSelect={() => useUI.setState({ move: [item] })}><ChevronRight size={15} /> Move to…</DM.Item>
          <DM.Separator className="menu-sep" />
          <DM.Item className="menu-item is-danger" onSelect={onDelete}><Trash2 size={15} /> Delete</DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}

function RenameDialog({ item, onClose }: { item: DriveItem | null; onClose(): void }) {
  const [name, setName] = useState('')
  useEffect(() => setName(item?.name ?? ''), [item])
  return (
    <Modal open={item !== null} onOpenChange={(o) => !o && onClose()} title="Rename">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (item && name.trim()) void useVault.getState().renameItem(item, name); onClose() }}>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} aria-label="New name" maxLength={200} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={!name.trim() || name === item?.name}>Rename</Button></div>
      </form>
    </Modal>
  )
}

function NewFolderDialog({ open, parent, onClose, onCreated }: { open: boolean; parent: string | undefined; onClose(): void; onCreated(f: DriveItem): void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setName('') }, [open])
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="New folder" description="A real folder in your Drive. Make one per video, per day, or per shoot.">
      <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); if (!parent || !name.trim()) return; setBusy(true); const f = await useVault.getState().createFolder(parent, name); setBusy(false); onClose(); if (f) onCreated(f) }}>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Day 07 · Pricing" aria-label="Folder name" maxLength={120} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={!name.trim() || busy}>{busy ? 'Creating…' : 'Create folder'}</Button></div>
      </form>
    </Modal>
  )
}

function DeleteDialog({ items, onClose }: { items: DriveItem[] | null; onClose(): void }) {
  return (
    <Modal open={items !== null} onOpenChange={(o) => !o && onClose()} title={items ? `Delete ${items.length === 1 ? `"${items[0].name}"` : plural(items.length, 'item')}?` : 'Delete'} description="They move to your Google Drive trash, where you can restore them for 30 days. Videos that use these files lose the link.">
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Keep</Button>
        <Button variant="primary" className="!border-bad !bg-bad !text-white" onClick={() => { if (items) void useVault.getState().trashItems(items); onClose() }}><Trash2 size={15} /> Move to trash</Button>
      </div>
    </Modal>
  )
}
