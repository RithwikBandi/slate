import { ArrowLeft, BadgeCheck, Check, Download, ExternalLink, Eye, FileJson, FolderPlus, Link2, MessageSquare, ThumbsUp, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Files } from '../components/Files'
import { Button, CopyButton, KitField, Modal, StatusPill } from '../components/ui'
import { STATUSES, type FolderRef, type Kit, type Project, type Status } from '../lib/types'
import { copyText, cx, fmtDay, kitText, toast, ytId } from '../lib/util'
import { driveApi, seriesNames, useProject, useVault } from '../lib/vault'

const TABS = [
  { id: 'files', label: 'Files' },
  { id: 'kit', label: 'Kit' },
  { id: 'publish', label: 'Publish' },
  { id: 'notes', label: 'Notes' },
] as const
type TabId = (typeof TABS)[number]['id']

const DEFAULT_FOLDERS: { name: string; kind: FolderRef['kind'] }[] = [
  { name: 'Raw footage', kind: 'raw' },
  { name: 'Edited', kind: 'edited' },
  { name: 'Thumbnails', kind: 'thumbs' },
]
const FOLDER_HINT: Record<FolderRef['kind'], string> = {
  raw: 'Camera originals and B-roll. They upload in chunks and resume if the connection drops.',
  edited: 'Every export of the cut. The newest becomes the Final; star a different one to change it.',
  thumbs: 'Thumbnail options and their source files.',
  custom: 'Anything else this video needs.',
}

export default function VideoDetail() {
  const { id } = useParams()
  const p = useProject(id)
  const projects = useVault((s) => s.db.projects)
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'files') as TabId
  const allSeries = useMemo(() => seriesNames(projects), [projects])

  if (!p)
    return (
      <div className="grid place-items-center py-24 text-center">
        <h1 className="display text-[30px]">That video is not in your vault</h1>
        <p className="mt-2 text-mute">It may have been deleted, or the link is from another account.</p>
        <Link to="/app/videos" viewTransition className="btn btn-primary mt-6">
          Back to videos
        </Link>
      </div>
    )

  const patch = (v: Partial<Project>) => useVault.getState().patchProject(p.id, v)

  const setDate = (publishDate: string | null) =>
    patch({ publishDate, status: publishDate && p.status === 'ready' ? 'scheduled' : !publishDate && p.status === 'scheduled' ? 'ready' : p.status })

  return (
    <div className="grid gap-6" data-status={p.status}>
      <header>
        <Link to="/app/videos" viewTransition className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-mute transition-colors hover:text-paper">
          <ArrowLeft size={15} /> Videos
        </Link>
        <div className="flex items-start gap-3">
          {p.episode ? <span className="display mt-1 text-[clamp(22px,3vw,34px)] text-[var(--st)]">#{String(p.episode).padStart(2, '0')}</span> : null}
          <input
            className="display w-full min-w-0 bg-transparent text-[clamp(28px,4.2vw,48px)] outline-none placeholder:text-dim"
            style={{ viewTransitionName: 'slate-title' }}
            value={p.title}
            onChange={(e) => patch({ title: e.target.value })}
            onBlur={(e) => !e.target.value.trim() && patch({ title: 'Untitled video' })}
            aria-label="Working title"
            maxLength={140}
          />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="vd-status" className="label mb-1.5 block">
              Stage
            </label>
            <select id="vd-status" className="input" value={p.status} onChange={(e) => patch({ status: e.target.value as Status })}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="vd-date" className="label mb-1.5 block">
              Publish date
            </label>
            <input id="vd-date" type="date" className="input" value={p.publishDate ?? ''} onChange={(e) => setDate(e.target.value || null)} />
          </div>
          <div>
            <label htmlFor="vd-series" className="label mb-1.5 block">
              Series
            </label>
            <input id="vd-series" className="input" list="vd-series-list" value={p.series} onChange={(e) => patch({ series: e.target.value })} placeholder="None" />
            <datalist id="vd-series-list">
              {allSeries.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="vd-ep" className="label mb-1.5 block">
              Episode / day
            </label>
            <input id="vd-ep" type="number" min={1} className="input" value={p.episode ?? ''} onChange={(e) => patch({ episode: e.target.value ? Math.max(1, Number(e.target.value)) : null })} placeholder="None" />
          </div>
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto rounded-full border border-line bg-coal p-1 sm:w-fit" role="tablist" aria-label="Video sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="tab shrink-0" onClick={() => setParams(t.id === 'files' ? {} : { tab: t.id }, { replace: true })}>
            {t.label}
          </button>
        ))}
      </div>

      <div key={tab} className="rise">
        {tab === 'files' && <FilesTab p={p} />}
        {tab === 'kit' && <KitTab p={p} />}
        {tab === 'publish' && <PublishTab p={p} goKit={() => setParams({ tab: 'kit' }, { replace: true })} goFiles={() => setParams({}, { replace: true })} />}
        {tab === 'notes' && <NotesTab p={p} />}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Files
function FilesTab({ p }: { p: Project }) {
  const folders = p.folderId ? p.folders : DEFAULT_FOLDERS.map((f) => ({ ...f, id: '' }))
  const [sel, setSel] = useState(folders[0].name)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const current = folders.find((f) => f.name === sel) ?? folders[0]
  const verifiedFinal = p.finalFileId !== null && p.verified.includes(p.finalFileId)

  const resolveFolder = async () => {
    const ready = await useVault.getState().ensureFolders(p.id)
    const hit = ready.folders.find((f) => f.name === current.name) ?? ready.folders[0]
    return hit.id
  }

  const addFolder = async (e: FormEvent) => {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    if (folders.some((f) => f.name.toLowerCase() === clean.toLowerCase())) return toast('A folder with that name already exists', 'bad')
    try {
      await useVault.getState().addFolder(p.id, clean)
      setSel(clean)
      setName('')
      setAdding(false)
    } catch (err) {
      toast(`Could not create the folder: ${(err as Error).message}`, 'bad')
    }
  }

  const share = async () => {
    if (!confirm('This makes the video folder viewable by anyone who has the link (view only). Continue?')) return
    try {
      const link = await useVault.getState().shareProject(p.id)
      toast((await copyText(link)) ? 'Share link copied' : link, 'ok')
    } catch (err) {
      toast(`Could not create the link: ${(err as Error).message}`, 'bad')
    }
  }

  return (
    <div className="grid gap-4">
      {p.finalFileId && (
        <div className={cx('card flex flex-wrap items-center gap-x-4 gap-y-2 p-4', verifiedFinal && 'border-lime/40')}>
          <BadgeCheck size={20} className={verifiedFinal ? 'text-lime' : 'text-mute'} />
          <p className="min-w-0 flex-1 text-[14px]">
            {verifiedFinal ? (
              <>
                <b>The final export is in Drive</b> and its size matched your local file. It is safe to free up space on this computer.
              </>
            ) : (
              <>
                <b>A final export is marked.</b> Slate did not upload it, so it was not size-checked.
              </>
            )}
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-[13.5px] font-semibold">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-lime)]" checked={p.localCleared} onChange={(e) => useVault.getState().patchProject(p.id, { localCleared: e.target.checked })} />
            I deleted my local copy
          </label>
        </div>
      )}

      <div className="card p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 flex-wrap gap-1.5" role="tablist" aria-label="Folders">
            {folders.map((f) => (
              <button key={f.name} type="button" role="tab" aria-selected={f.name === current.name} className={cx('btn btn-sm', f.name === current.name ? 'btn-primary' : 'btn-ghost')} onClick={() => setSel(f.name)}>
                {f.name}
              </button>
            ))}
            {adding ? (
              <form onSubmit={addFolder} className="flex items-center gap-1.5">
                <input className="input h-8 w-40 py-0 text-[13px]" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Folder name" aria-label="New folder name" maxLength={60} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
                <Button size="sm" type="submit" disabled={!name.trim()}>
                  Add
                </Button>
              </form>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setAdding(true)} title="Add your own folder to this video, for example Music or B-roll">
                <FolderPlus size={15} /> Folder
              </Button>
            )}
          </div>
          {p.folderId && (
            <>
              <a className="btn btn-sm btn-ghost" href={driveApi().folderUrl(p.folderId)} target="_blank" rel="noreferrer" title="Open this video's folder in Google Drive">
                <ExternalLink size={15} /> Drive
              </a>
              <Button size="sm" variant="ghost" onClick={share} title="Create a view-only link for an editor or collaborator">
                <Link2 size={15} /> Share
              </Button>
            </>
          )}
        </div>
        <Files
          key={current.id || current.name}
          folderId={current.id || null}
          resolveFolder={resolveFolder}
          project={p}
          canMarkFinal={current.kind === 'edited'}
          accept={current.kind === 'thumbs' ? 'image/*,.psd,.fig' : current.kind === 'custom' ? undefined : 'video/*,audio/*,.mov,.mp4,.mkv,.mxf,.braw'}
          hint={FOLDER_HINT[current.kind]}
        />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Kit
function parseKit(text: string): Partial<Kit> | null {
  try {
    const j = JSON.parse(text)
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null
    const s = (...keys: string[]) => {
      for (const k of keys) {
        const v = j[k]
        if (typeof v === 'string' && v.trim()) return v
        if (Array.isArray(v) && v.length) return v.join(', ')
      }
      return undefined
    }
    const out: Partial<Kit> = {
      title: s('title'),
      description: s('description', 'desc'),
      pinnedComment: s('pinnedComment', 'pinned_comment', 'comment', 'firstComment', 'first_comment'),
      tags: s('tags', 'keywords'),
      shorts: s('shorts', 'shortsCaption'),
      reels: s('reels', 'reelsCaption', 'caption'),
      notes: s('notes'),
    }
    for (const k of Object.keys(out) as (keyof Kit)[]) if (out[k] === undefined) delete out[k]
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

function KitTab({ p }: { p: Project }) {
  const templates = useVault((s) => s.db.templates)
  const [importing, setImporting] = useState(false)
  const [raw, setRaw] = useState('')
  const k = p.kit
  const set = (v: Partial<Kit>) => useVault.getState().patchKit(p.id, v)
  const parsed = useMemo(() => (raw.trim() ? parseKit(raw) : null), [raw])

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    const join = (a: string, b: string) => (a.trim() ? `${a.trimEnd()}\n\n${b}` : b)
    if (t.kind === 'comment') set({ pinnedComment: join(k.pinnedComment, t.body) })
    else set({ description: join(k.description, t.body) })
    toast(`Added "${t.name}"`)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="card grid gap-5 p-5 md:p-6">
        <KitField label="Title" value={k.title} onChange={(title) => set({ title })} max={100} placeholder="The title viewers will see" />
        <KitField label="Description" value={k.description} onChange={(description) => set({ description })} max={5000} rows={9} placeholder="What happens, links, hashtags" />
        <KitField label="Tags" value={k.tags} onChange={(tags) => set({ tags })} max={500} placeholder="comma, separated, tags" hint="YouTube allows about 500 characters of tags in total." />
        <KitField label="Pinned comment" value={k.pinnedComment} onChange={(pinnedComment) => set({ pinnedComment })} max={10000} rows={3} placeholder="The first comment you pin under the video" />
        <div className="grid gap-5 border-t border-line pt-5 md:grid-cols-2">
          <KitField label="Shorts caption" value={k.shorts} onChange={(shorts) => set({ shorts })} max={100} rows={2} placeholder="If the Shorts title differs" />
          <KitField label="Reels caption" value={k.reels} onChange={(reels) => set({ reels })} max={2200} rows={2} placeholder="For cross-posting to Instagram" />
        </div>
      </div>

      <aside className="grid content-start gap-4">
        <div className="card grid gap-3 p-5">
          <p className="label">Shortcuts</p>
          <CopyButton text={kitText(p)} label="Copy whole kit" what="the whole kit" className="w-full" />
          <Button size="sm" className="w-full" onClick={() => setImporting(true)} title="Paste kit JSON, for example from your editing assistant">
            <FileJson size={15} /> Import kit
          </Button>
        </div>
        <div className="card p-5">
          <p className="label mb-3">Templates</p>
          {templates.length ? (
            <ul className="grid gap-1.5">
              {templates.map((t) => (
                <li key={t.id}>
                  <button type="button" className="row flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left" onClick={() => applyTemplate(t.id)} title={`Add to the ${t.kind === 'comment' ? 'pinned comment' : 'description'}`}>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{t.name}</span>
                      <span className="label">{t.kind}</span>
                    </span>
                    <span className="text-[12.5px] font-semibold text-lime">Add</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-dim">
              Reusable sign-offs and hashtag sets live in the{' '}
              <Link to="/app/library" viewTransition className="ulink text-paper">
                Library
              </Link>
              .
            </p>
          )}
        </div>
      </aside>

      <Modal open={importing} onOpenChange={setImporting} title="Import a kit" description='Paste JSON with any of: "title", "description", "comment", "tags", "notes". Fields you leave out are not touched.'>
        <textarea className="input mono min-h-[180px] text-[13px]" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={'{\n  "title": "…",\n  "description": "…",\n  "comment": "…"\n}'} aria-label="Kit JSON" />
        <p className={cx('mt-2 text-[13px]', raw.trim() && !parsed ? 'text-bad' : 'text-dim')}>{!raw.trim() ? 'Nothing pasted yet.' : parsed ? `Found: ${Object.keys(parsed).join(', ')}.` : 'That is not valid kit JSON.'}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setImporting(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!parsed}
            onClick={() => {
              set(parsed!)
              setImporting(false)
              setRaw('')
              toast('Kit imported')
            }}
          >
            Import
          </Button>
        </div>
      </Modal>
    </div>
  )
}

// ------------------------------------------------------------------ Publish mode
function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <li className={cx('card flex gap-4 p-4 transition-colors duration-300 md:p-5', done && 'border-lime/40')}>
      <span className={cx('mono grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[13px] font-semibold transition-colors duration-300', done ? 'border-lime bg-lime text-carbon' : 'border-line2 text-mute')}>
        {done ? <Check size={15} strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  )
}

function PublishTab({ p, goKit, goFiles }: { p: Project; goKit(): void; goFiles(): void }) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const [url, setUrl] = useState(p.youtubeUrl)
  const edited = p.folders.find((f) => f.kind === 'edited')
  const files = useVault((s) => (edited ? s.files[edited.id] : undefined))
  const final = files?.find((f) => f.id === p.finalFileId)
  const mark = (k: string) => setDone((d) => new Set(d).add(k))
  const k = p.kit

  useEffect(() => {
    if (edited) void useVault.getState().loadFiles(edited.id)
  }, [edited])

  const missing = (what: string) => (
    <p className="text-[13.5px] text-mute">
      No {what} yet.{' '}
      <button type="button" className="ulink font-semibold text-paper" onClick={goKit}>
        Write it in Kit
      </button>
    </p>
  )
  const preview = (text: string, key: string, what: string) => (
    <div className="flex items-start gap-3">
      <p className="line-clamp-3 min-w-0 flex-1 whitespace-pre-wrap rounded-xl bg-coal px-3 py-2 text-[13.5px] text-mute">{text}</p>
      <CopyButton text={text} label="Copy" what={what} onCopied={() => mark(key)} />
    </div>
  )

  const publish = (e: FormEvent) => {
    e.preventDefault()
    if (url.trim() && !ytId(url)) return toast('That does not look like a YouTube link', 'bad')
    useVault.getState().patchProject(p.id, { status: 'published', youtubeUrl: url.trim() })
    toast('Marked as published')
  }

  if (p.status === 'published')
    return (
      <div className="card grid place-items-center gap-5 p-8 text-center md:p-12">
        <span className="stamp">PUBLISHED</span>
        <div>
          <p className="display text-[26px]">{k.title || p.title}</p>
          <p className="mono mt-1.5 text-[12.5px] text-mute">{fmtDay(p.publishedAt, true)}</p>
        </div>
        {p.youtubeUrl ? (
          <a href={p.youtubeUrl} target="_blank" rel="noreferrer" className="btn">
            <ExternalLink size={16} /> Watch on YouTube
          </a>
        ) : (
          <form onSubmit={publish} className="flex w-full max-w-md gap-2">
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste the YouTube link to see its stats" aria-label="YouTube link" />
            <Button type="submit" disabled={!url.trim()}>
              Save
            </Button>
          </form>
        )}
        <Stats url={p.youtubeUrl} />
        <CopyButton text={k.pinnedComment} label="Copy pinned comment" what="the pinned comment" />
        <Button size="sm" variant="ghost" onClick={() => useVault.getState().patchProject(p.id, { status: 'ready' })}>
          Not published after all
        </Button>
      </div>
    )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-[26px]">Publish mode</h2>
          <p className="mt-1 text-mute">Keep YouTube Studio open in another tab and work down the list.</p>
        </div>
        <span className="mono text-[12.5px] text-mute">{done.size} of 5 copied</span>
      </div>
      <ol className="grid gap-2.5">
        <Step n={1} title="Download the final export" done={done.has('file')}>
          {final?.webContentLink ? (
            <a href={final.webContentLink} download={final.name} target="_blank" rel="noreferrer" className="btn btn-sm" onClick={() => mark('file')}>
              <Download size={15} /> {final.name}
            </a>
          ) : final ? (
            <p className="text-[13.5px] text-mute">{final.name} is a sample file, so there is nothing to download in demo mode.</p>
          ) : (
            <p className="text-[13.5px] text-mute">
              No final export is marked.{' '}
              <button type="button" className="ulink font-semibold text-paper" onClick={goFiles}>
                Add one in Files
              </button>
            </p>
          )}
        </Step>
        <Step n={2} title="Title" done={done.has('title')}>
          {k.title.trim() ? preview(k.title, 'title', 'the title') : missing('title')}
        </Step>
        <Step n={3} title="Description" done={done.has('description')}>
          {k.description.trim() ? preview(k.description, 'description', 'the description') : missing('description')}
        </Step>
        <Step n={4} title="Tags" done={done.has('tags')}>
          {k.tags.trim() ? preview(k.tags, 'tags', 'the tags') : <p className="text-[13.5px] text-dim">No tags. They are optional.</p>}
        </Step>
        <Step n={5} title="Pinned comment (after it is live)" done={done.has('comment')}>
          {k.pinnedComment.trim() ? preview(k.pinnedComment, 'comment', 'the pinned comment') : missing('pinned comment')}
        </Step>
        <Step n={6} title="Paste the link and close it out" done={false}>
          <form onSubmit={publish} className="flex flex-wrap gap-2">
            <input className="input min-w-0 flex-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/shorts/… (optional)" aria-label="YouTube link" />
            <Button variant="primary" type="submit">
              Mark as published
            </Button>
          </form>
        </Step>
      </ol>
    </div>
  )
}

type StatState = { s: 'idle' | 'loading' | 'nokey' | 'error' } | { s: 'ok'; views: number | null; likes: number | null; comments: number | null }

function Stats({ url }: { url: string }) {
  const mode = useVault((s) => s.mode)
  const id = ytId(url)
  const [st, setSt] = useState<StatState>({ s: 'idle' })

  useEffect(() => {
    if (!id || mode !== 'google') return
    let live = true
    setSt({ s: 'loading' })
    fetch(`/api/yt?id=${id}`)
      .then(async (r) => {
        if (!live) return
        if (r.status === 501) return setSt({ s: 'nokey' })
        if (!r.ok) return setSt({ s: 'error' })
        const j = await r.json()
        setSt({ s: 'ok', views: j.views, likes: j.likes, comments: j.comments })
      })
      .catch(() => live && setSt({ s: 'error' }))
    return () => {
      live = false
    }
  }, [id, mode])

  if (!id) return null
  if (mode === 'demo') return <p className="text-[13px] text-dim">Live YouTube stats appear here when you use your own account.</p>
  if (st.s === 'loading' || st.s === 'idle') return <div className="skeleton h-16 w-full max-w-md" />
  if (st.s === 'nokey') return <p className="text-[13px] text-dim">Stats are off: the server has no YouTube API key (optional, free).</p>
  if (st.s !== 'ok') return <p className="text-[13px] text-dim">Could not load stats for this video.</p>
  const cell = (icon: ReactNode, n: number | null, label: string) => (
    <div className="rounded-2xl border border-line bg-coal px-5 py-3">
      <p className="display flex items-center justify-center gap-2 text-[24px]">
        {icon} {n === null ? 'hidden' : n.toLocaleString()}
      </p>
      <p className="label mt-1">{label}</p>
    </div>
  )
  return (
    <div className="grid w-full max-w-md grid-cols-3 gap-2.5">
      {cell(<Eye size={17} className="text-mute" />, st.views, 'Views')}
      {cell(<ThumbsUp size={17} className="text-mute" />, st.likes, 'Likes')}
      {cell(<MessageSquare size={17} className="text-mute" />, st.comments, 'Comments')}
    </div>
  )
}

// ------------------------------------------------------------------ Notes
function NotesTab({ p }: { p: Project }) {
  const nav = useNavigate()
  const remove = async () => {
    const where = p.folderId ? ' Its folder moves to your Drive trash, where you can restore it for 30 days.' : ''
    if (!confirm(`Delete "${p.title}" from Slate?${where}`)) return
    try {
      await useVault.getState().removeProject(p.id)
      toast('Video deleted')
      nav('/app/videos', { viewTransition: true })
    } catch (e) {
      toast(`Could not delete: ${(e as Error).message}`, 'bad')
    }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="card p-5 md:p-6">
        <label htmlFor="vd-notes" className="label mb-1.5 block">
          Notes for this video
        </label>
        <textarea id="vd-notes" className="input min-h-[280px]" value={p.kit.notes} onChange={(e) => useVault.getState().patchKit(p.id, { notes: e.target.value })} placeholder="Hook ideas, shot list, what to fix in the next cut, feedback from friends…" />
        <p className="mt-2 text-[12.5px] text-dim">Saved automatically. A readable copy of the kit and notes is kept beside the footage in Drive.</p>
      </div>
      <aside className="grid content-start gap-4">
        <div className="card grid gap-2.5 p-5 text-[13.5px]">
          <p className="label">Details</p>
          <p className="flex justify-between gap-3">
            <span className="text-mute">Stage</span> <StatusPill status={p.status} />
          </p>
          <p className="flex justify-between gap-3">
            <span className="text-mute">Created</span> <span className="mono">{fmtDay(p.createdAt, true)}</span>
          </p>
          <p className="flex justify-between gap-3">
            <span className="text-mute">Last change</span> <span className="mono">{fmtDay(p.updatedAt, true)}</span>
          </p>
        </div>
        <div className="card p-5">
          <p className="label mb-3">Remove</p>
          <Button variant="danger" size="sm" className="w-full" onClick={remove}>
            <Trash2 size={15} /> Delete this video
          </Button>
        </div>
      </aside>
    </div>
  )
}
