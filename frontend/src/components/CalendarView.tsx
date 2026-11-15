import { Check, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { videoPath } from '../lib/flow'
import { stageInfo, type Video } from '../lib/types'
import { addDays, cx, dayDiff, fmtDay, isoDay, parseDay, relDay, today } from '../lib/util'
import { useVault } from '../lib/vault'
import { Button, StagePill } from './ui'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`
const MAX_CHIPS = 3

function Chip({ v, draggable }: { v: Video; draggable: boolean }) {
  return (
    <Link
      to={videoPath(v.id, 'publish')}
      viewTransition
      draggable={draggable}
      onClick={(e) => e.stopPropagation()}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/slate-video', v.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      data-stage={v.stage}
      title={`${v.title} · ${stageInfo(v.stage).label}`}
      className="flex items-center gap-1 truncate rounded-md border-l-[3px] border-[var(--st)] bg-[color-mix(in_srgb,var(--st)_14%,transparent)] px-1.5 py-1 text-[11.5px] font-semibold leading-tight transition-transform duration-200 hover:-translate-y-px"
    >
      {v.stage === 'published' && <Check size={11} strokeWidth={3} className="shrink-0 text-[var(--st)]" />}
      <span className="truncate">{v.episode ? `#${v.episode} ` : ''}{v.title}</span>
    </Link>
  )
}

function MiniRow({ v }: { v: Video }) {
  return (
    <li>
      <Link to={videoPath(v.id, 'publish')} viewTransition data-stage={v.stage} className="row flex items-center gap-3 rounded-xl px-2.5 py-2">
        <span className="h-8 w-1 shrink-0 rounded-full bg-[var(--st)]" />
        <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold">{v.title}</span><span className="mono block text-[11.5px] text-dim">{v.publishDate ? (v.stage === 'published' ? fmtDay(v.publishDate, true) : relDay(v.publishDate)) : 'No date'}</span></span>
      </Link>
    </li>
  )
}

/** A month planner. Drag a video onto a day, or pick a day and schedule from the side panel. */
export function CalendarView() {
  const videos = useVault((s) => s.db.videos)
  const now = today()
  const [month, setMonth] = useState(() => firstOfMonth(now))
  const [selected, setSelected] = useState(now)
  const [over, setOver] = useState<string | null>(null)
  const [pick, setPick] = useState('')

  const cells = useMemo(() => {
    const lead = (parseDay(month).getDay() + 6) % 7 // Monday first
    const start = addDays(month, -lead)
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [month])

  const byDay = useMemo(() => {
    const m = new Map<string, Video[]>()
    for (const v of videos) if (v.publishDate && (v.stage === 'ready' || v.stage === 'scheduled' || v.stage === 'published')) m.set(v.publishDate, [...(m.get(v.publishDate) ?? []), v])
    return m
  }, [videos])
  const ready = useMemo(() => videos.filter((v) => v.stage === 'ready'), [videos])
  const upcoming = useMemo(() => videos.filter((v) => v.stage === 'scheduled' && v.publishDate && v.publishDate >= now).sort((a, b) => a.publishDate!.localeCompare(b.publishDate!)).slice(0, 5), [videos, now])
  const recent = useMemo(() => videos.filter((v) => v.stage === 'published').sort((a, b) => (b.publishDate ?? '').localeCompare(a.publishDate ?? '')).slice(0, 5), [videos])
  const onDay = byDay.get(selected) ?? []
  const canSchedule = selected >= now && ready.length > 0

  const shift = (n: number) => {
    const d = parseDay(month)
    d.setMonth(d.getMonth() + n)
    setMonth(isoDay(d))
  }
  const goToday = () => {
    setMonth(firstOfMonth(now))
    setSelected(now)
  }
  const allow = (e: DragEvent, key: string) => {
    if (!e.dataTransfer.types.includes('text/slate-video')) return
    e.preventDefault()
    setOver(key)
  }
  const drop = (e: DragEvent, day: string | null) => {
    const id = e.dataTransfer.getData('text/slate-video')
    setOver(null)
    const v = videos.find((x) => x.id === id)
    if (v && (v.stage === 'ready' || v.stage === 'scheduled')) {
      useVault.getState().setDate(v.id, day)
      if (day) setSelected(day)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-[28px]">{parseDay(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <ul className="hidden items-center gap-3 text-[12.5px] text-mute sm:flex" aria-label="Legend">
            {(['ready', 'scheduled', 'published'] as const).map((s) => <li key={s} data-stage={s} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[var(--st)]" />{stageInfo(s).label}</li>)}
          </ul>
          <div className="flex items-center gap-1.5">
            <Button icon aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft size={18} /></Button>
            <Button onClick={goToday}>Today</Button>
            <Button icon aria-label="Next month" onClick={() => shift(1)}><ChevronRight size={18} /></Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line">{WEEKDAYS.map((d) => <p key={d} className="label px-2 py-2.5 text-center">{d}</p>)}</div>
          <div className="grid grid-cols-7" role="grid" aria-label="Month">
            {cells.map((day, i) => {
              const inMonth = day.slice(0, 7) === month.slice(0, 7)
              const items = byDay.get(day) ?? []
              const isSel = day === selected
              return (
                <div
                  key={day}
                  role="gridcell"
                  tabIndex={0}
                  aria-selected={isSel}
                  aria-label={`${fmtDay(day, true)}${items.length ? `, ${items.length} video${items.length > 1 ? 's' : ''}` : ''}`}
                  onClick={() => setSelected(day)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(day))}
                  onDragOver={(e) => allow(e, day)}
                  onDragLeave={() => setOver(null)}
                  onDrop={(e) => drop(e, day)}
                  className={cx('min-h-[84px] cursor-pointer border-line p-1.5 text-left transition-colors duration-150 md:min-h-[112px]', i % 7 !== 6 && 'border-r', i < 35 && 'border-b', !inMonth && 'bg-coal/60', over === day && 'bg-lime/10', isSel && 'bg-raise/70 shadow-[inset_0_0_0_1.5px_var(--color-lime)]')}
                >
                  <p className={cx('mono mb-1 grid h-6 w-6 place-items-center rounded-full text-[11.5px]', day === now ? 'bg-lime font-bold text-carbon' : inMonth ? 'text-mute' : 'text-dim')}>{Number(day.slice(8))}</p>
                  <div className="grid gap-1">
                    {items.slice(0, MAX_CHIPS).map((v) => <Chip key={v.id} v={v} draggable={v.stage === 'ready' || v.stage === 'scheduled'} />)}
                    {items.length > MAX_CHIPS && <span className="mono px-1 text-[11px] text-dim">+{items.length - MAX_CHIPS} more</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <aside className="grid content-start gap-4">
          <section className="card p-4" aria-label="Selected day" aria-live="polite">
            <p className="label">{dayDiff(selected, now) === 0 ? 'Today' : relDay(selected)}</p>
            <h3 className="display mt-1 text-[24px]">{fmtDay(selected, true)}</h3>
            {onDay.length ? (
              <ul className="mt-3 grid gap-1">
                {onDay.map((v) => (
                  <li key={v.id} className="rounded-xl border border-line bg-coal p-3">
                    <div className="mb-2 flex items-center justify-between gap-2"><StagePill stage={v.stage} />{v.stage === 'published' && v.youtubeUrl && <a href={v.youtubeUrl} target="_blank" rel="noreferrer" className="text-mute hover:text-paper" aria-label="Watch on YouTube"><ExternalLink size={14} /></a>}</div>
                    <Link to={videoPath(v.id, 'publish')} viewTransition className="display block text-[17px] leading-tight hover:underline">{v.title}</Link>
                    {v.stage === 'scheduled' && <button type="button" className="mt-2 text-[12.5px] font-semibold text-mute hover:text-bad" onClick={() => useVault.getState().setDate(v.id, null)}>Unschedule</button>}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-[13.5px] text-dim">{selected < now ? 'Nothing was published on this day.' : 'Nothing scheduled.'}</p>}
            {canSchedule && (
              <form className="mt-4 grid gap-2 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); const id = pick || ready[0].id; useVault.getState().setDate(id, selected); setPick('') }}>
                <label htmlFor="cal-pick" className="label">Schedule a video here</label>
                <select id="cal-pick" className="input" value={pick || ready[0].id} onChange={(e) => setPick(e.target.value)}>{ready.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}</select>
                <Button variant="primary" type="submit" size="sm">Schedule for {fmtDay(selected)}</Button>
              </form>
            )}
          </section>

          <section className={cx('card p-4 transition-colors duration-150', over === 'loose' && 'border-lime')} onDragOver={(e) => allow(e, 'loose')} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, null)} aria-label="Ready to schedule">
            <p className="label mb-2">Ready to schedule ({ready.length})</p>
            {ready.length ? <ul className="grid gap-0.5">{ready.map((v) => <li key={v.id}><Chip v={v} draggable /></li>)}</ul> : <p className="text-[13px] text-dim">Nothing is waiting for a date. Drag a scheduled video here to clear its date.</p>}
          </section>

          <section className="card p-4" aria-label="Coming up">
            <p className="label mb-2">Coming up</p>
            {upcoming.length ? <ul className="grid gap-0.5">{upcoming.map((v) => <MiniRow key={v.id} v={v} />)}</ul> : <p className="text-[13px] text-dim">No videos are scheduled.</p>}
          </section>

          <section className="card p-4" aria-label="Recently published">
            <p className="label mb-2">Recently published</p>
            {recent.length ? <ul className="grid gap-0.5">{recent.map((v) => <MiniRow key={v.id} v={v} />)}</ul> : <p className="text-[13px] text-dim">Nothing published yet.</p>}
          </section>
        </aside>
      </div>
    </div>
  )
}
