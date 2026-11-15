import { CalendarDays, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { CalendarView } from '../components/CalendarView'
import { Empty } from '../components/ui'
import { splitUploads } from '../lib/flow'
import { today } from '../lib/util'
import { useVault } from '../lib/vault'

/** What has gone out and what is coming up, on one calendar. */
export default function Calendar() {
  const videos = useVault((s) => s.db.videos)
  const b = useMemo(() => splitUploads(videos), [videos])
  const month = today().slice(0, 7)
  const thisMonth = b.published.filter((v) => v.publishDate?.startsWith(month)).length
  const stats = [
    { n: b.upcoming.length, label: 'Upcoming', tone: 'text-[#5eead4]' },
    { n: b.ready.length, label: 'Ready to schedule', tone: 'text-lime' },
    { n: b.overdue.length, label: 'Overdue', tone: b.overdue.length ? 'text-bad' : 'text-dim' },
    { n: thisMonth, label: 'Published this month', tone: 'text-paper' },
  ]
  const empty = b.upcoming.length + b.ready.length + b.overdue.length + b.published.length === 0

  return (
    <div className="grid gap-6">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Uploaded and upcoming, at a glance</p>
          <h1 className="display mt-2 text-[clamp(32px,4.4vw,48px)]">Calendar</h1>
        </div>
        <Link to="/app/uploads" viewTransition className="btn">Open Uploads</Link>
      </header>

      <section className="rise grid grid-cols-2 gap-2.5 sm:grid-cols-4" style={{ ['--i' as string]: 1 }} aria-label="Summary">
        {stats.map((s) => <div key={s.label} className="card p-4"><p className={`display text-[34px] leading-none ${s.tone}`}>{s.n}</p><p className="label mt-2">{s.label}</p></div>)}
      </section>

      {empty ? (
        <div className="card">
          <Empty icon={<CalendarDays size={24} />} title="Your calendar is empty" body="Once a video has an edited export it can be scheduled here, and everything you publish stays on the calendar as a record." action={<Link to="/app/library?space=edited" viewTransition className="btn btn-primary"><Plus size={16} strokeWidth={2.6} /> Add an edited video</Link>} />
        </div>
      ) : (
        <div className="rise" style={{ ['--i' as string]: 2 }}><CalendarView /></div>
      )}
    </div>
  )
}
