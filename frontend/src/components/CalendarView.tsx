import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { videoPath } from '../lib/flow'
import type { Video } from '../lib/types'
import { addDays, cx, isoDay, parseDay, today } from '../lib/util'
import { useVault } from '../lib/vault'
import { Button } from './ui'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`

function Chip({ v, draggable }: { v: Video; draggable: boolean }) {
  return (
    <Link
      to={videoPath(v.id, 'publish')}
      viewTransition
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/slate-video', v.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      data-stage={v.stage}
      title={v.title}
      className={cx('block truncate rounded-md border-l-[3px] border-[var(--st)] bg-[color-mix(in_srgb,var(--st)_14%,transparent)] px-1.5 py-1 text-[11.5px] font-semibold leading-tight transition-transform duration-200 hover:-translate-y-px', v.stage === 'published' && 'opacity-60')}
    >
      {v.episode ? `#${v.episode} ` : ''}
      {v.title}
    </Link>
  )
}

/** A month grid. Drag a video onto a day to schedule it, or back to the side list to clear its date. */
export function CalendarView() {
  const videos = useVault((s) => s.db.videos)
  const [month, setMonth] = useState(() => firstOfMonth(today()))
  const [over, setOver] = useState<string | null>(null)
  const now = today()

  const cells = useMemo(() => {
    const lead = (parseDay(month).getDay() + 6) % 7 // Monday first
    const start = addDays(month, -lead)
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [month])

  const byDay = useMemo(() => {
    const m = new Map<string, Video[]>()
    for (const v of videos) if (v.publishDate && v.stage !== 'idea') m.set(v.publishDate, [...(m.get(v.publishDate) ?? []), v])
    return m
  }, [videos])
  const loose = useMemo(() => videos.filter((v) => v.stage === 'ready'), [videos])

  const shift = (n: number) => {
    const d = parseDay(month)
    d.setMonth(d.getMonth() + n)
    setMonth(isoDay(d))
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
    if (v && v.stage !== 'published' && (v.stage === 'ready' || v.stage === 'scheduled')) useVault.getState().setDate(v.id, day)
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-[26px]">{parseDay(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <div className="flex items-center gap-1.5">
          <Button icon aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft size={18} /></Button>
          <Button onClick={() => setMonth(firstOfMonth(now))}>Today</Button>
          <Button icon aria-label="Next month" onClick={() => shift(1)}><ChevronRight size={18} /></Button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_250px]">
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line">
            {WEEKDAYS.map((d) => <p key={d} className="label px-2 py-2.5 text-center">{d}</p>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const inMonth = day.slice(0, 7) === month.slice(0, 7)
              const items = byDay.get(day) ?? []
              return (
                <div
                  key={day}
                  onDragOver={(e) => allow(e, day)}
                  onDragLeave={() => setOver(null)}
                  onDrop={(e) => drop(e, day)}
                  className={cx('min-h-[84px] border-line p-1.5 transition-colors duration-150 md:min-h-[108px]', i % 7 !== 6 && 'border-r', i < 35 && 'border-b', !inMonth && 'bg-coal/60', over === day && 'bg-lime/10')}
                >
                  <p className={cx('mono mb-1 grid h-6 w-6 place-items-center rounded-full text-[11.5px]', day === now ? 'bg-lime font-bold text-carbon' : inMonth ? 'text-mute' : 'text-dim')}>{Number(day.slice(8))}</p>
                  <div className="grid gap-1">{items.map((v) => <Chip key={v.id} v={v} draggable={v.stage === 'ready' || v.stage === 'scheduled'} />)}</div>
                </div>
              )
            })}
          </div>
        </div>
        <aside
          className={cx('card h-fit p-4 transition-colors duration-150', over === 'loose' && 'border-lime')}
          onDragOver={(e) => allow(e, 'loose')}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => drop(e, null)}
          aria-label="Ready to schedule"
        >
          <p className="label mb-3">Ready to schedule ({loose.length})</p>
          {loose.length ? <div className="grid gap-1.5">{loose.map((v) => <Chip key={v.id} v={v} draggable />)}</div> : <p className="text-[13px] text-dim">Nothing is waiting for a date. Drag a scheduled video here to clear its date.</p>}
        </aside>
      </div>
    </div>
  )
}
