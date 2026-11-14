import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '../components/ui'
import type { Project } from '../lib/types'
import { addDays, cx, isoDay, parseDay, today } from '../lib/util'
import { useVault } from '../lib/vault'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`

function Chip({ p }: { p: Project }) {
  return (
    <Link
      to={`/app/v/${p.id}`}
      viewTransition
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/slate-project', p.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      data-status={p.status}
      title={p.title}
      className="block truncate rounded-md border-l-[3px] border-[var(--st)] bg-[color-mix(in_srgb,var(--st)_14%,transparent)] px-1.5 py-1 text-[11.5px] font-semibold leading-tight transition-transform duration-200 hover:-translate-y-px"
    >
      {p.episode ? `#${p.episode} ` : ''}
      {p.title}
    </Link>
  )
}

export default function Calendar() {
  const projects = useVault((s) => s.db.projects)
  const [month, setMonth] = useState(() => firstOfMonth(today()))
  const [over, setOver] = useState<string | null>(null)
  const now = today()

  const cells = useMemo(() => {
    const first = parseDay(month)
    const lead = (first.getDay() + 6) % 7 // Monday-first
    const start = addDays(month, -lead)
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [month])

  const byDay = useMemo(() => {
    const m = new Map<string, Project[]>()
    for (const p of projects) if (p.publishDate) m.set(p.publishDate, [...(m.get(p.publishDate) ?? []), p])
    return m
  }, [projects])
  const loose = useMemo(() => projects.filter((p) => !p.publishDate && p.status !== 'published'), [projects])

  const shift = (n: number) => {
    const d = parseDay(month)
    d.setMonth(d.getMonth() + n)
    setMonth(isoDay(d))
  }

  const allow = (e: DragEvent, key: string) => {
    if (!e.dataTransfer.types.includes('text/slate-project')) return
    e.preventDefault()
    setOver(key)
  }
  const drop = (e: DragEvent, day: string | null) => {
    const id = e.dataTransfer.getData('text/slate-project')
    setOver(null)
    const p = projects.find((x) => x.id === id)
    if (!p) return
    const status = day && p.status === 'ready' ? 'scheduled' : !day && p.status === 'scheduled' ? 'ready' : p.status
    useVault.getState().patchProject(p.id, { publishDate: day, status })
  }

  return (
    <div className="grid gap-5">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Drag a video onto a day to schedule it</p>
          <h1 className="display mt-2 text-[clamp(32px,4.4vw,48px)]">{parseDay(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <Button icon aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft size={18} />
          </Button>
          <Button onClick={() => setMonth(firstOfMonth(now))}>Today</Button>
          <Button icon aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRight size={18} />
          </Button>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
        <div className="card rise overflow-hidden" style={{ ['--i' as string]: 1 }}>
          <div className="grid grid-cols-7 border-b border-line">
            {WEEKDAYS.map((d) => (
              <p key={d} className="label px-2 py-2.5 text-center">
                {d}
              </p>
            ))}
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
                  className={cx('min-h-[84px] border-line p-1.5 transition-colors duration-150 md:min-h-[112px]', i % 7 !== 6 && 'border-r', i < 35 && 'border-b', !inMonth && 'bg-coal/60', over === day && 'bg-lime/10')}
                >
                  <p className={cx('mono mb-1 grid h-6 w-6 place-items-center rounded-full text-[11.5px]', day === now ? 'bg-lime font-bold text-carbon' : inMonth ? 'text-mute' : 'text-dim')}>{Number(day.slice(8))}</p>
                  <div className="grid gap-1">
                    {items.map((p) => (
                      <Chip key={p.id} p={p} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <aside
          className={cx('card rise h-fit p-4 transition-colors duration-150', over === 'loose' && 'border-lime')}
          style={{ ['--i' as string]: 2 }}
          onDragOver={(e) => allow(e, 'loose')}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => drop(e, null)}
          aria-label="Unscheduled videos"
        >
          <p className="label mb-3">Unscheduled ({loose.length})</p>
          {loose.length ? (
            <div className="grid gap-1.5">
              {loose.map((p) => (
                <Chip key={p.id} p={p} />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-dim">Every video has a date. Drop one here to clear its date.</p>
          )}
        </aside>
      </div>
    </div>
  )
}
