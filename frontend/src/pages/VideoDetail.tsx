import { ArrowLeft, ArrowRight, Check, Clapperboard, Download, ExternalLink, Eye, FileJson, FolderOpen, Library, MessageSquare, Play, ScrollText, Star, ThumbsUp, Trash2, Unlink, Upload } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Teleprompter } from '../components/Teleprompter'
import { Button, CopyButton, KitField, Modal, StagePill } from '../components/ui'
import { nextStep, openUpload, readiness, useUI } from '../lib/flow'
import { usePlayer } from '../lib/player'
import { STAGES, stageIndex, type DriveItem, type Kit, type Video } from '../lib/types'
import { useTransfers } from '../lib/uploads'
import { cx, fmtBytes, fmtClock, fmtDay, kitText, readMinutes, toast, wordCount, ytId } from '../lib/util'
import { driveApi, seriesNames, useFiles, useVault, useVideo } from '../lib/vault'

const TABS = [
  { id: 'script', label: 'Script' },
  { id: 'footage', label: 'Footage' },
  { id: 'kit', label: 'Kit' },
  { id: 'publish', label: 'Publish' },
  { id: 'notes', label: 'Notes' },
] as const
type TabId = (typeof TABS)[number]['id']

export default function VideoDetail() {
  const { id } = useParams()
  const v = useVideo(id)
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'script') as TabId
  const [final, thumb] = useFiles([v?.finalId, v?.thumbId])
  const editItems = useFiles(v?.editIds ?? [])
  const go = (t: string) => setParams(t === 'script' ? {} : { tab: t }, { replace: true })

  if (!v)
    return (
      <div className="grid place-items-center py-24 text-center">
        <h1 className="display text-[30px]">That video is not in your vault</h1>
        <p className="mt-2 text-mute">It may have been deleted, or the link is from another account.</p>
        <Link to="/app/ideas" viewTransition className="btn btn-primary mt-6">Back to Ideas</Link>
      </div>
    )

  const patch = (p: Partial<Video>) => useVault.getState().patchVideo(v.id, p)
  const step = nextStep(v)
  const r = readiness(v)
  const poster = (thumb ?? final)?.thumbnailLink?.replace(/=s\d+$/, '=s800')
  const play = () => final && usePlayer.getState().play(final, { videoId: v.id, queue: editItems.filter((x): x is DriveItem => !!x) })
  const back = stageIndex(v.stage) >= stageIndex('ready') ? { to: '/app/uploads', label: 'Uploads' } : { to: '/app/ideas', label: 'Ideas' }

  return (
    <div className="grid gap-6" data-stage={v.stage}>
      <header>
        <Link to={back.to} viewTransition className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-mute transition-colors hover:text-paper"><ArrowLeft size={15} /> {back.label}</Link>
        <div className="flex items-start gap-3">
          {v.episode ? <span className="display mt-1 text-[clamp(22px,3vw,34px)] text-[var(--st)]">#{String(v.episode).padStart(2, '0')}</span> : null}
          <input className="display w-full min-w-0 bg-transparent text-[clamp(28px,4.2vw,48px)] outline-none placeholder:text-dim" style={{ viewTransitionName: 'slate-title' }} value={v.title} onChange={(e) => patch({ title: e.target.value })} onBlur={(e) => !e.target.value.trim() && patch({ title: 'Untitled video' })} aria-label="Working title" maxLength={140} />
        </div>

        {/* where it is in the workflow */}
        <ol className="mt-5 flex flex-wrap items-center gap-1.5" aria-label="Workflow stage">
          {STAGES.map((s, i) => {
            const at = stageIndex(v.stage)
            return (
              <li key={s.id} className="flex items-center gap-1.5">
                <button type="button" data-stage={s.id} title={s.hint} aria-current={s.id === v.stage ? 'step' : undefined} onClick={() => useVault.getState().setStage(v.id, s.id)} className={cx('pill cursor-pointer transition-transform hover:-translate-y-px', s.id !== v.stage && (i < at ? 'opacity-70' : '!bg-transparent opacity-45 hover:opacity-100'), s.id === v.stage && '!bg-[var(--st)] !text-carbon')}>{i < at && <Check size={11} strokeWidth={3} />}{s.label}</button>
                {i < STAGES.length - 1 && <span className="h-px w-3 bg-line2" aria-hidden="true" />}
              </li>
            )
          })}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => { if (step.advanceTo) useVault.getState().setStage(v.id, step.advanceTo); go(step.tab) }}>{step.label} <ArrowRight size={16} /></Button>
          <span className="text-[13.5px] text-mute">{step.hint}</span>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="mb-4 flex gap-1 overflow-x-auto rounded-full border border-line bg-coal p-1 sm:w-fit" role="tablist" aria-label="Video sections">
            {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="tab shrink-0" onClick={() => go(t.id)}>{t.label}</button>)}
          </div>
          <div key={tab} className="rise">
            {tab === 'script' && <ScriptTab v={v} />}
            {tab === 'footage' && <FootageTab v={v} />}
            {tab === 'kit' && <KitTab v={v} thumb={thumb} />}
            {tab === 'publish' && <PublishTab v={v} final={final} goKit={() => go('kit')} goFootage={() => go('footage')} />}
            {tab === 'notes' && <NotesTab v={v} final={final} onDelete={() => { useVault.getState().removeVideo(v.id); toast('Video deleted'); nav('/app/ideas', { viewTransition: true }) }} />}
          </div>
        </div>

        <aside className="grid content-start gap-4">
          <div className="card overflow-hidden">
            <button type="button" onClick={play} disabled={!final} className="group relative block aspect-video w-full bg-coal" aria-label={final ? 'Play the final export' : 'No final export yet'}>
              {poster ? <img src={poster} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-dim"><Clapperboard size={36} /></span>}
              {final && <span className="absolute inset-0 grid place-items-center bg-black/20 transition group-hover:bg-black/40"><span className="grid h-14 w-14 place-items-center rounded-full bg-paper text-carbon shadow-xl transition-transform group-hover:scale-110"><Play size={22} fill="currentColor" className="ml-1" /></span></span>}
            </button>
            <div className="flex items-center justify-between gap-2 p-3"><StagePill stage={v.stage} /><span className="mono text-[12px] text-mute">{final ? (final.durationMs ? fmtClock(final.durationMs / 1000) : fmtBytes(final.size)) : 'No final export'}</span></div>
          </div>

          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between"><p className="label">Ready to publish</p><span className={cx('mono text-[12px]', r.ready ? 'text-lime' : 'text-mute')}>{r.done}/{r.total}</span></div>
            <ul className="grid gap-1">
              {r.items.map((c) => (
                <li key={c.key}>
                  <button type="button" onClick={() => go(c.tab)} className="row flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13.5px]">
                    <span className={cx('grid h-5 w-5 place-items-center rounded-full border', c.ok ? 'border-lime bg-lime text-carbon' : 'border-line2 text-transparent')}><Check size={12} strokeWidth={3} /></span>
                    <span className={c.ok ? 'text-mute' : 'font-semibold'}>{c.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="card grid gap-3 p-4">
            <div><label htmlFor="vd-date" className="label mb-1.5 block">Publish date</label><input id="vd-date" type="date" className="input" value={v.publishDate ?? ''} onChange={(e) => useVault.getState().setDate(v.id, e.target.value || null)} /></div>
            <div className="grid grid-cols-[1fr_88px] gap-2">
              <div><label htmlFor="vd-series" className="label mb-1.5 block">Series</label><input id="vd-series" className="input" list="vd-series-list" value={v.series} onChange={(e) => patch({ series: e.target.value })} placeholder="None" /><SeriesList /></div>
              <div><label htmlFor="vd-ep" className="label mb-1.5 block">Episode</label><input id="vd-ep" type="number" min={1} className="input" value={v.episode ?? ''} onChange={(e) => patch({ episode: e.target.value ? Math.max(1, Number(e.target.value)) : null })} /></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function SeriesList() {
  const videos = useVault((s) => s.db.videos)
  const names = useMemo(() => seriesNames(videos), [videos])
  return <datalist id="vd-series-list">{names.map((s) => <option key={s} value={s} />)}</datalist>
}

// ------------------------------------------------------------------ Script
function ScriptTab({ v }: { v: Video }) {
  const [prompter, setPrompter] = useState(false)
  const set = (p: Partial<Video>) => useVault.getState().patchVideo(v.id, p)
  return (
    <div className="grid gap-4">
      <div className="card grid gap-5 p-5 md:p-6">
        <div>
          <label htmlFor="sc-pitch" className="label mb-1.5 block">What is this video about?</label>
          <textarea id="sc-pitch" className="input" rows={2} value={v.pitch} onChange={(e) => set({ pitch: e.target.value })} placeholder="The hook, the story, why anyone would watch" />
        </div>
        <div>
          <div className="mb-1.5 flex items-end justify-between gap-3">
            <label htmlFor="sc-script" className="label">Script</label>
            <span className="mono text-[12px] text-dim">{wordCount(v.script)} words · about {fmtClock(readMinutes(v.script) * 60)} spoken</span>
          </div>
          <textarea id="sc-script" className="input min-h-[340px] text-[16px] leading-[1.7]" value={v.script} onChange={(e) => set({ script: e.target.value })} placeholder={'Hook:\n\nBeat 1:\n\nBeat 2:\n\nClose:'} />
          <p className="mt-2 text-[12.5px] text-dim">Saved to your Drive as you type.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setPrompter(true)} disabled={!v.script.trim()}><ScrollText size={16} /> Teleprompter</Button>
          <CopyButton text={v.script} label="Copy script" what="the script" />
        </div>
      </div>
      {prompter && <Teleprompter text={v.script} title={v.title} onClose={() => setPrompter(false)} />}
    </div>
  )
}

// ------------------------------------------------------------------ Footage
function FileRow({ id, item, actions, tag }: { id: string; item: DriveItem | undefined; actions: ReactNode; tag?: ReactNode }) {
  return (
    <li className="row flex items-center gap-3 rounded-xl px-2.5 py-2">
      <div className="grid h-11 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-coal text-dim">{item?.thumbnailLink ? <img src={item.thumbnailLink} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <Clapperboard size={18} />}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{item?.name ?? 'File unavailable'}</p>
        <p className="mono flex flex-wrap items-center gap-x-2.5 text-[12px] text-dim">{item ? <><span>{fmtBytes(item.size)}</span>{item.durationMs ? <span>{fmtClock(item.durationMs / 1000)}</span> : null}<span>{fmtDay(item.modifiedTime)}</span></> : <span>It may have been deleted from Drive</span>}{tag}</p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5" data-id={id}>{actions}</div>
    </li>
  )
}

function FootageTab({ v }: { v: Video }) {
  const raws = useFiles(v.rawIds)
  const edits = useFiles(v.editIds)
  const store = useVault.getState()
  const playAll = (item: DriveItem, list: (DriveItem | undefined)[]) => usePlayer.getState().play(item, { videoId: v.id, queue: list.filter((x): x is DriveItem => !!x) })
  const finalVerified = v.finalId !== null && v.verified.includes(v.finalId)
  const icon = (label: string, onClick: () => void, el: ReactNode, danger?: boolean) => <Button size="sm" icon variant={danger ? 'danger' : 'ghost'} aria-label={label} title={label} onClick={onClick}>{el}</Button>

  return (
    <div className="grid gap-4">
      <section className="card p-5" aria-label="Raw footage">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="display text-[22px]">Raw footage</h2><p className="text-[13px] text-mute">Camera files for this video.</p></div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => useUI.setState({ pick: { videoId: v.id, kind: 'raw' } })}><Library size={15} /> From Library</Button>
            <Button size="sm" variant="primary" onClick={() => openUpload({ space: 'raw', videoId: v.id, as: 'raw' })}><Upload size={15} /> Upload</Button>
          </div>
        </div>
        {v.rawIds.length === 0 ? <p className="rounded-xl border border-dashed border-line2 px-4 py-6 text-center text-[13.5px] text-dim">No raw footage linked yet. Upload it here or pick clips you already put in the Library.</p> : (
          <ul className="grid gap-1">{v.rawIds.map((id, i) => <FileRow key={id} id={id} item={raws[i]} actions={<>{raws[i] && icon('Play', () => playAll(raws[i]!, raws), <Play size={16} />)}{raws[i] && icon('Download', () => useTransfers.getState().download(raws[i]!), <Download size={16} />)}{icon('Unlink from this video', () => store.unlinkRaw(v.id, id), <Unlink size={16} />, true)}</>} />)}</ul>
        )}
      </section>

      <section className="card p-5" aria-label="Edited exports">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="display text-[22px]">Edited exports</h2><p className="text-[13px] text-mute">Every cut of this video. Star the one that gets published.</p></div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => useUI.setState({ pick: { videoId: v.id, kind: 'edit' } })}><Library size={15} /> From Library</Button>
            <Button size="sm" variant="primary" onClick={() => openUpload({ space: 'edited', videoId: v.id, as: 'final' })}><Upload size={15} /> Upload</Button>
          </div>
        </div>
        {v.editIds.length === 0 ? <p className="rounded-xl border border-dashed border-line2 px-4 py-6 text-center text-[13.5px] text-dim">No edit yet. When you add the export, this video moves to Uploads, ready to schedule.</p> : (
          <ul className="grid gap-1">
            {v.editIds.map((id, i) => {
              const isFinal = v.finalId === id
              return <FileRow key={id} id={id} item={edits[i]} tag={<>{isFinal && <span className="text-lime">FINAL</span>}{v.verified.includes(id) && <span className="text-lime">size verified</span>}</>} actions={<>
                {icon(isFinal ? 'This is the final export' : 'Make this the final export', () => store.setFinal(v.id, isFinal ? null : id), <Star size={16} className={cx(isFinal && 'fill-lime text-lime')} />)}
                {edits[i] && icon('Play', () => playAll(edits[i]!, edits), <Play size={16} />)}
                {edits[i] && icon('Download', () => useTransfers.getState().download(edits[i]!), <Download size={16} />)}
                {icon('Unlink from this video', () => store.unlinkEdit(v.id, id), <Unlink size={16} />, true)}</>} />
            })}
          </ul>
        )}
        {v.finalId && (
          <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-xl bg-coal px-3 py-2.5 text-[13.5px]">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-lime)]" checked={v.localCleared} onChange={(e) => store.patchVideo(v.id, { localCleared: e.target.checked })} />
            <span>{finalVerified ? 'The final is in Drive and its size matched your file, so it is safe to free up this computer.' : 'The final is in Drive.'} <b>I deleted my local copy.</b></span>
          </label>
        )}
      </section>

      {v.legacyFolderId && <a className="btn btn-sm w-fit" href={driveApi().folderUrl(v.legacyFolderId)} target="_blank" rel="noreferrer"><FolderOpen size={15} /> Older files for this video (first version of Slate)</a>}
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
        const x = j[k]
        if (typeof x === 'string' && x.trim()) return x
        if (Array.isArray(x) && x.length) return x.join(', ')
      }
      return undefined
    }
    const out: Partial<Kit> = { title: s('title'), description: s('description', 'desc'), pinnedComment: s('pinnedComment', 'pinned_comment', 'comment', 'firstComment', 'first_comment'), tags: s('tags', 'keywords'), shorts: s('shorts', 'shortsCaption'), reels: s('reels', 'reelsCaption', 'caption') }
    for (const k of Object.keys(out) as (keyof Kit)[]) if (out[k] === undefined) delete out[k]
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

function KitTab({ v, thumb }: { v: Video; thumb: DriveItem | undefined }) {
  const templates = useVault((s) => s.db.templates)
  const [importing, setImporting] = useState(false)
  const [raw, setRaw] = useState('')
  const k = v.kit
  const set = (p: Partial<Kit>) => useVault.getState().patchKit(v.id, p)
  const parsed = useMemo(() => (raw.trim() ? parseKit(raw) : null), [raw])
  const apply = (id: string) => {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    const join = (a: string, b: string) => (a.trim() ? `${a.trimEnd()}\n\n${b}` : b)
    set(t.kind === 'comment' ? { pinnedComment: join(k.pinnedComment, t.body) } : { description: join(k.description, t.body) })
    toast(`Added "${t.name}"`)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_290px]">
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
        <div className="card p-4">
          <p className="label mb-3">Thumbnail</p>
          <div className="mb-3 aspect-video overflow-hidden rounded-xl border border-line bg-coal">{thumb?.thumbnailLink ? <img src={thumb.thumbnailLink} alt="Thumbnail" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <p className="grid h-full place-items-center text-[13px] text-dim">No thumbnail yet</p>}</div>
          <div className="flex gap-2"><Button size="sm" onClick={() => useUI.setState({ pick: { videoId: v.id, kind: 'thumb' } })}><Library size={14} /> Library</Button><Button size="sm" variant="primary" onClick={() => openUpload({ space: 'thumbs', videoId: v.id, as: 'thumb' })}><Upload size={14} /> Upload</Button></div>
        </div>
        <div className="card grid gap-3 p-4">
          <p className="label">Shortcuts</p>
          <CopyButton text={kitText(v)} label="Copy whole kit" what="the whole kit" className="w-full" />
          <Button size="sm" className="w-full" onClick={() => setImporting(true)}><FileJson size={15} /> Import kit</Button>
        </div>
        <div className="card p-4">
          <p className="label mb-3">Snippets</p>
          {templates.length ? <ul className="grid gap-1.5">{templates.map((t) => <li key={t.id}><button type="button" className="row flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left" onClick={() => apply(t.id)}><span className="min-w-0"><span className="block truncate font-semibold">{t.name}</span><span className="label">{t.kind}</span></span><span className="text-[12.5px] font-semibold text-lime">Add</span></button></li>)}</ul> : <p className="text-[13.5px] text-dim">Reusable sign-offs and hashtag sets live in Settings.</p>}
        </div>
      </aside>
      <Modal open={importing} onOpenChange={setImporting} title="Import a kit" description='Paste JSON with any of: "title", "description", "comment", "tags". Fields you leave out are not touched.'>
        <textarea className="input mono min-h-[180px] text-[13px]" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={'{\n  "title": "…",\n  "description": "…",\n  "comment": "…"\n}'} aria-label="Kit JSON" />
        <p className={cx('mt-2 text-[13px]', raw.trim() && !parsed ? 'text-bad' : 'text-dim')}>{!raw.trim() ? 'Nothing pasted yet.' : parsed ? `Found: ${Object.keys(parsed).join(', ')}.` : 'That is not valid kit JSON.'}</p>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setImporting(false)}>Cancel</Button><Button variant="primary" disabled={!parsed} onClick={() => { set(parsed!); setImporting(false); setRaw(''); toast('Kit imported') }}>Import</Button></div>
      </Modal>
    </div>
  )
}

// ------------------------------------------------------------------ Publish
function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <li className={cx('card flex gap-4 p-4 transition-colors duration-300 md:p-5', done && 'border-lime/40')}>
      <span className={cx('mono grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[13px] font-semibold transition-colors duration-300', done ? 'border-lime bg-lime text-carbon' : 'border-line2 text-mute')}>{done ? <Check size={15} strokeWidth={3} /> : n}</span>
      <div className="min-w-0 flex-1"><p className="font-semibold">{title}</p><div className="mt-2">{children}</div></div>
    </li>
  )
}

function PublishTab({ v, final, goKit, goFootage }: { v: Video; final: DriveItem | undefined; goKit(): void; goFootage(): void }) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const [url, setUrl] = useState(v.youtubeUrl)
  const mark = (k: string) => setDone((d) => new Set(d).add(k))
  const k = v.kit
  const r = readiness(v)

  const missing = (what: string) => <p className="text-[13.5px] text-mute">No {what} yet. <button type="button" className="ulink font-semibold text-paper" onClick={goKit}>Write it in Kit</button></p>
  const preview = (text: string, key: string, what: string) => (
    <div className="flex items-start gap-3"><p className="line-clamp-3 min-w-0 flex-1 whitespace-pre-wrap rounded-xl bg-coal px-3 py-2 text-[13.5px] text-mute">{text}</p><CopyButton text={text} label="Copy" what={what} onCopied={() => mark(key)} /></div>
  )
  const publish = (e: FormEvent) => {
    e.preventDefault()
    if (url.trim() && !ytId(url)) return toast('That does not look like a YouTube link', 'bad')
    const s = useVault.getState()
    s.patchVideo(v.id, { youtubeUrl: url.trim() })
    s.setStage(v.id, 'published')
    toast('Marked as published')
  }

  if (v.stage === 'published')
    return (
      <div className="card grid place-items-center gap-5 p-8 text-center md:p-12">
        <span className="stamp">PUBLISHED</span>
        <div><p className="display text-[26px]">{k.title || v.title}</p><p className="mono mt-1.5 text-[12.5px] text-mute">{fmtDay(v.publishDate ?? v.publishedAt, true)}</p></div>
        {v.youtubeUrl ? <a href={v.youtubeUrl} target="_blank" rel="noreferrer" className="btn"><ExternalLink size={16} /> Watch on YouTube</a> : (
          <form onSubmit={publish} className="flex w-full max-w-md gap-2"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste the YouTube link to see its stats" aria-label="YouTube link" /><Button type="submit" disabled={!url.trim()}>Save</Button></form>
        )}
        <Stats url={v.youtubeUrl} />
        <CopyButton text={k.pinnedComment} label="Copy pinned comment" what="the pinned comment" />
        <Button size="sm" variant="ghost" onClick={() => useVault.getState().setStage(v.id, v.publishDate ? 'scheduled' : 'ready')}>Not published after all</Button>
      </div>
    )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="display text-[26px]">Publish mode</h2><p className="mt-1 text-mute">Keep YouTube Studio open in another tab and work down the list.</p></div>
        <span className="mono text-[12.5px] text-mute">{done.size} of 5 copied</span>
      </div>
      {!r.ready && <p className="rounded-2xl border border-tape/40 bg-tape/10 px-4 py-3 text-[13.5px]">Before you post: still missing {r.items.slice(0, 3).filter((c) => !c.ok).map((c) => c.label.toLowerCase()).join(', ')}.</p>}
      <ol className="grid gap-2.5">
        <Step n={1} title="Download the final export" done={done.has('file')}>
          {final ? <Button size="sm" onClick={() => { useTransfers.getState().download(final); mark('file') }}><Download size={15} /> {final.name} · {fmtBytes(final.size)}</Button> : <p className="text-[13.5px] text-mute">No final export is marked. <button type="button" className="ulink font-semibold text-paper" onClick={goFootage}>Add one in Footage</button></p>}
        </Step>
        <Step n={2} title="Title" done={done.has('title')}>{k.title.trim() ? preview(k.title, 'title', 'the title') : missing('title')}</Step>
        <Step n={3} title="Description" done={done.has('description')}>{k.description.trim() ? preview(k.description, 'description', 'the description') : missing('description')}</Step>
        <Step n={4} title="Tags" done={done.has('tags')}>{k.tags.trim() ? preview(k.tags, 'tags', 'the tags') : <p className="text-[13.5px] text-dim">No tags. They are optional.</p>}</Step>
        <Step n={5} title="Pinned comment (after it is live)" done={done.has('comment')}>{k.pinnedComment.trim() ? preview(k.pinnedComment, 'comment', 'the pinned comment') : missing('pinned comment')}</Step>
        <Step n={6} title="Paste the link and close it out" done={false}>
          <form onSubmit={publish} className="flex flex-wrap gap-2"><input className="input min-w-0 flex-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/shorts/… (optional)" aria-label="YouTube link" /><Button variant="primary" type="submit">Mark as published</Button></form>
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
    return () => { live = false }
  }, [id, mode])
  if (!id) return null
  if (mode === 'demo') return <p className="text-[13px] text-dim">Live YouTube stats appear here when you use your own account.</p>
  if (st.s === 'loading' || st.s === 'idle') return <div className="skeleton h-16 w-full max-w-md" />
  if (st.s === 'nokey') return <p className="text-[13px] text-dim">Stats are off: the server has no YouTube API key (optional, free).</p>
  if (st.s !== 'ok') return <p className="text-[13px] text-dim">Could not load stats for this video.</p>
  const cell = (icon: ReactNode, n: number | null, label: string) => <div className="rounded-2xl border border-line bg-coal px-5 py-3"><p className="display flex items-center justify-center gap-2 text-[24px]">{icon} {n === null ? 'hidden' : n.toLocaleString()}</p><p className="label mt-1">{label}</p></div>
  return <div className="grid w-full max-w-md grid-cols-3 gap-2.5">{cell(<Eye size={17} className="text-mute" />, st.views, 'Views')}{cell(<ThumbsUp size={17} className="text-mute" />, st.likes, 'Likes')}{cell(<MessageSquare size={17} className="text-mute" />, st.comments, 'Comments')}</div>
}

// ------------------------------------------------------------------ Notes
function NotesTab({ v, final, onDelete }: { v: Video; final: DriveItem | undefined; onDelete(): void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_290px]">
      <div className="grid gap-4">
        <div className="card p-5 md:p-6">
          <label htmlFor="vd-notes" className="label mb-1.5 block">Notes for this video</label>
          <textarea id="vd-notes" className="input min-h-[220px]" value={v.notes} onChange={(e) => useVault.getState().patchVideo(v.id, { notes: e.target.value })} placeholder="Feedback, ideas for the next cut, things to remember…" />
          <p className="mt-2 text-[12.5px] text-dim">Saved automatically.</p>
        </div>
        <div className="card p-5 md:p-6">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="display text-[22px]">Review notes</h2>{final && <Button size="sm" onClick={() => usePlayer.getState().play(final, { videoId: v.id })}><Play size={14} /> Review in player</Button>}</div>
          {v.markers.length === 0 ? <p className="text-[13.5px] text-dim">No timestamped notes. Open the final in the player and press <b>N</b> on a frame to pin a note to that second.</p> : (
            <ul className="grid gap-1">{v.markers.map((m) => <li key={m.id} className="row flex items-start gap-3 rounded-xl px-3 py-2.5"><span className="mono rounded-md bg-lime px-1.5 py-0.5 text-[12px] font-bold text-carbon">{fmtClock(m.t)}</span><p className="min-w-0 flex-1 whitespace-pre-wrap text-[14px]">{m.text}</p><button type="button" className="text-dim hover:text-bad" aria-label="Delete note" onClick={() => useVault.getState().removeMarker(v.id, m.id)}><Trash2 size={15} /></button></li>)}</ul>
          )}
        </div>
      </div>
      <aside className="grid content-start gap-4">
        <div className="card grid gap-2.5 p-5 text-[13.5px]"><p className="label">Details</p><p className="flex justify-between gap-3"><span className="text-mute">Stage</span> <StagePill stage={v.stage} /></p><p className="flex justify-between gap-3"><span className="text-mute">Created</span> <span className="mono">{fmtDay(v.createdAt, true)}</span></p><p className="flex justify-between gap-3"><span className="text-mute">Last change</span> <span className="mono">{fmtDay(v.updatedAt, true)}</span></p></div>
        <div className="card p-5"><p className="label mb-3">Remove</p><Button variant="danger" size="sm" className="w-full" onClick={() => confirm(`Delete "${v.title}" from Slate? Its files stay in your Library.`) && onDelete()}><Trash2 size={15} /> Delete this video</Button></div>
      </aside>
    </div>
  )
}
