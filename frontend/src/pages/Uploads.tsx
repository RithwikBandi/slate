import { CalendarDays, ExternalLink, Film, List, Play, Send } from 'lucide-react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CalendarView } from '../components/CalendarView'
import { Button, Empty, Segmented } from '../components/ui'
import { readiness, splitUploads, videoPath } from '../lib/flow'
import type { Video } from '../lib/types'
import { cx, fmtDay, relDay } from '../lib/util'
import { useFiles, useVault } from '../lib/vault'

type View = 'list' | 'calendar'

function Row({ v, focus }: { v: Video; focus: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [thumb, final] = useFiles([v.thumbId, v.finalId])
  const img = (thumb ?? final)?.thumbnailLink
  const r = readiness(v)
  const published = v.stage === 'published'
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focus])
  const tab = published ? 'publish' : r.ready ? 'publish' : (r.items.find((c) => !c.ok)?.tab ?? 'publish')

  return (
    <div ref={ref} data-stage={v.stage} className={cx('card rise flex flex-wrap items-center gap-4 p-3 transition-[border-color,box-shadow] duration-500', focus && '!border-lime shadow-[0_0_0_3px_rgba(198,244,50,0.18)]')}>
      <Link to={videoPath(v.id, tab)} viewTransition className="group relative block aspect-video w-36 shrink-0 overflow-hidden rounded-xl bg-coal sm:w-44" aria-label={`Open ${v.title}`}>
        {img ? <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <span className="grid h-full place-items-center text-dim"><Film size={26} /></span>}
        {v.episode && <span className="display absolute bottom-1.5 left-2 text-[22px] leading-none drop-shadow">#{String(v.episode).padStart(2, '0')}</span>}
      </Link>
      <div className="min-w-0 flex-1 basis-56">
        <Link to={videoPath(v.id, tab)} viewTransition className="display line-clamp-2 text-[19px] leading-[1.12] hover:underline">{v.title}</Link>
        <p className="mono mt-1 flex flex-wrap items-center gap-x-3 text-[12px] text-mute">
          {v.series && <span>{v.series}</span>}
          {v.publishDate && <span className={cx(!published && v.publishDate < new Date().toISOString().slice(0, 10) && 'text-bad')}>{published ? fmtDay(v.publishDate, true) : relDay(v.publishDate)}</span>}
          {!published && <span className={r.ready ? 'text-lime' : ''}>{r.done}/{r.total} ready</span>}
        </p>
        {!published && (
          <div className="mt-2 flex gap-1" aria-hidden="true">{r.items.map((c) => <i key={c.key} className="h-1 flex-1 rounded-full" style={{ background: c.ok ? 'var(--st)' : 'var(--color-line2)' }} />)}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {v.stage === 'ready' && (
          <label className="flex items-center gap-2">
            <span className="sr-only">Schedule {v.title}</span>
            <input type="date" className="input h-9 w-[148px] py-0 text-[13px]" onChange={(e) => e.target.value && useVault.getState().setDate(v.id, e.target.value)} aria-label={`Publish date for ${v.title}`} />
          </label>
        )}
        {!published && <Link to={videoPath(v.id, 'publish')} viewTransition className="btn btn-sm btn-primary"><Play size={14} fill="currentColor" /> Publish mode</Link>}
        {published && v.youtubeUrl && <a href={v.youtubeUrl} target="_blank" rel="noreferrer" className="btn btn-sm"><ExternalLink size={14} /> YouTube</a>}
        {published && !v.youtubeUrl && <Link to={videoPath(v.id, 'publish')} viewTransition className="btn btn-sm">Add link</Link>}
      </div>
    </div>
  )
}

function Section({ title, hint, count, children, tone }: { title: string; hint: string; count: number; children: ReactNode; tone?: string }) {
  if (!count) return null
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-baseline gap-3"><h2 className={cx('display text-[24px]', tone)}>{title}</h2><span className="mono text-[12.5px] text-dim">{count}</span><span className="hidden text-[13px] text-mute sm:block">{hint}</span></div>
      <div className="grid gap-2.5">{children}</div>
    </section>
  )
}

/** The YouTube pipeline: what is overdue, what is next, what is waiting for a date, and what already went out. */
export default function Uploads() {
  const videos = useVault((s) => s.db.videos)
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') === 'calendar' ? 'calendar' : 'list') as View
  const focus = params.get('focus')
  const b = useMemo(() => splitUploads(videos), [videos])
  const total = b.ready.length + b.overdue.length + b.upcoming.length + b.published.length

  return (
    <div className="grid gap-6">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">From edited file to published video</p>
          <h1 className="display mt-2 text-[clamp(32px,4.4vw,48px)]">Uploads</h1>
        </div>
        <Segmented label="View" value={view} onChange={(v) => setParams(v === 'list' ? {} : { view: v }, { replace: true })} options={[{ id: 'list', label: <><List size={15} /> Pipeline</> }, { id: 'calendar', label: <><CalendarDays size={15} /> Calendar</> }]} />
      </header>

      {total === 0 ? (
        <div className="card">
          <Empty
            icon={<Send size={24} />}
            title="Nothing in Uploads yet"
            body="Videos land here the moment they have an edited export. Upload a finished cut to the Edited space in your Library and press Send to Uploads."
            action={<Link to="/app/library?space=edited" viewTransition className="btn btn-primary">Open Edited footage</Link>}
          />
        </div>
      ) : view === 'calendar' ? (
        <CalendarView />
      ) : (
        <>
          <Section title="Overdue" hint="Scheduled in the past and not published" count={b.overdue.length} tone="text-bad">{b.overdue.map((v) => <Row key={v.id} v={v} focus={focus === v.id} />)}</Section>
          <Section title="Upcoming" hint="Scheduled, in date order" count={b.upcoming.length}>{b.upcoming.map((v) => <Row key={v.id} v={v} focus={focus === v.id} />)}</Section>
          <Section title="Ready to schedule" hint="Edited and waiting for a date" count={b.ready.length}>{b.ready.map((v) => <Row key={v.id} v={v} focus={focus === v.id} />)}</Section>
          <Section title="Published" hint="Previous uploads" count={b.published.length}>{b.published.map((v) => <Row key={v.id} v={v} focus={focus === v.id} />)}</Section>
          <div className="text-center"><Button variant="ghost" size="sm" onClick={() => setParams({ view: 'calendar' }, { replace: true })}><CalendarDays size={14} /> See it on the calendar</Button></div>
        </>
      )}
    </div>
  )
}
