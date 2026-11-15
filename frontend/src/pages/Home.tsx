import { AlertTriangle, ArrowRight, Flame, Info, Lightbulb, Plus, Upload } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { Button, Ring, Skeleton } from '../components/ui'
import { attention, nextUp, openNewIdea, openUpload, pipelineCounts, videoPath, weekPlan } from '../lib/flow'
import { STAGES } from '../lib/types'
import { cx, fmtBytes, fmtDay, streak } from '../lib/util'
import { useVault } from '../lib/vault'

const greeting = () => {
  const h = new Date().getHours()
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/** A working day in one screen: what to do next, what is blocked, and what is coming. */
export default function Home() {
  const videos = useVault((s) => s.db.videos)
  const profile = useVault((s) => s.profile)
  const quota = useVault((s) => s.quota)
  const spaces = useVault((s) => s.db.spaces)

  const counts = useMemo(() => pipelineCounts(videos), [videos])
  const next = useMemo(() => nextUp(videos), [videos])
  const issues = useMemo(() => attention(videos).slice(0, 5), [videos])
  const week = useMemo(() => weekPlan(videos), [videos])
  const run = useMemo(() => streak(videos), [videos])
  const used = quota && quota.limit ? quota.used / quota.limit : null

  return (
    <div className="grid gap-6">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="display mt-2 text-[clamp(34px,5vw,54px)]">{greeting()}, {profile?.name.split(' ')[0] ?? 'creator'}.</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openNewIdea()}><Lightbulb size={16} /> New idea</Button>
          <Button variant="primary" onClick={() => openUpload()} disabled={!spaces}><Upload size={16} /> Upload</Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="card rise relative overflow-hidden p-6 md:p-7" style={{ ['--i' as string]: 1 }} data-stage={next?.video.stage} aria-label="Up next">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl" style={{ background: 'var(--st, var(--color-lime))' }} />
          <p className="label">Do this next</p>
          {next ? (
            <>
              <p className={cx('mono mt-3 text-[12.5px] font-semibold uppercase tracking-wider', next.urgent ? 'text-bad' : 'text-[var(--st)]')}>{next.headline}</p>
              <h2 className="display mt-1.5 text-[clamp(26px,3.4vw,38px)]">{next.video.title}</h2>
              <p className="mt-2 max-w-lg text-mute">{next.detail}</p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <Link to={next.to} viewTransition className="btn btn-primary">{next.cta} <ArrowRight size={17} /></Link>
                <Link to={videoPath(next.video.id)} viewTransition className="btn">Open video</Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="display mt-3 text-[clamp(24px,3vw,32px)]">Nothing is waiting on you.</h2>
              <p className="mt-2 max-w-md text-mute">That is a good place to start the next one. Capture an idea, or put footage in the Library.</p>
              <div className="mt-5 flex flex-wrap gap-2.5"><Button variant="primary" onClick={() => openNewIdea()}><Plus size={17} strokeWidth={2.6} /> New idea</Button><Button onClick={() => openUpload()} disabled={!spaces}><Upload size={16} /> Upload footage</Button></div>
            </>
          )}
        </section>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <Link to="/app/settings" viewTransition className="card rise flex items-center gap-4 p-5 transition-colors hover:border-line2" style={{ ['--i' as string]: 2 }} aria-label="Storage details">
            <Ring value={used} size={76}><span className="mono text-[13px] font-semibold">{!quota ? '…' : used === null ? '∞' : `${Math.round(used * 100)}%`}</span></Ring>
            <div className="min-w-0"><p className="label">Drive storage</p>{quota ? <><p className="mt-1 truncate font-semibold">{fmtBytes(quota.used)}</p><p className="truncate text-[12.5px] text-dim">{quota.limit ? `of ${fmtBytes(quota.limit)}` : 'no fixed limit'}</p></> : <Skeleton className="mt-2 h-5 w-24" />}</div>
          </Link>
          <div className="card rise flex items-center gap-4 p-5" style={{ ['--i' as string]: 3 }}>
            <div className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-full border border-line bg-coal"><Flame size={28} className={run ? 'text-tape' : 'text-dim'} /></div>
            <div><p className="label">Publishing streak</p><p className="display mt-1 text-[30px] leading-none">{run} <span className="text-[15px] text-mute">day{run === 1 ? '' : 's'}</span></p></div>
          </div>
        </div>
      </div>

      {/* the whole pipeline, each number a doorway */}
      <section className="rise grid gap-2.5 sm:grid-cols-[4fr_3fr]" style={{ ['--i' as string]: 4 }} aria-label="Pipeline">
        {([['ideas', '/app/ideas', 'In production'], ['uploads', '/app/uploads', 'On YouTube track']] as const).map(([g, to, label]) => (
          <Link key={g} to={to} viewTransition className="card group p-4 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-line2">
            <div className="mb-3 flex items-center justify-between"><p className="label">{label}</p><ArrowRight size={15} className="text-dim transition-transform group-hover:translate-x-1" /></div>
            <div className={cx('grid gap-2', g === 'ideas' ? 'grid-cols-4' : 'grid-cols-3')}>
              {STAGES.filter((s) => s.group === g).map((s) => (
                <div key={s.id} data-stage={s.id}><p className="display text-[34px] leading-none" style={{ color: counts[s.id] ? 'var(--st)' : 'var(--color-dim)' }}>{counts[s.id]}</p><p className="label mt-2">{s.label}</p></div>
              ))}
            </div>
          </Link>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card rise p-5" style={{ ['--i' as string]: 5 }} aria-label="Needs attention">
          <h2 className="display mb-3 text-[22px]">Needs attention</h2>
          {issues.length === 0 ? <p className="rounded-xl bg-coal px-4 py-5 text-[14px] text-mute">Nothing is blocked. Everything close to publishing has what it needs.</p> : (
            <ul className="grid gap-1">
              {issues.map((a) => (
                <li key={a.id}>
                  <Link to={a.to} viewTransition className="row flex items-start gap-3 rounded-xl px-3 py-2.5 text-[14px]">
                    {a.level === 'info' ? <Info size={16} className="mt-0.5 shrink-0 text-ice" /> : <AlertTriangle size={16} className={cx('mt-0.5 shrink-0', a.level === 'bad' ? 'text-bad' : 'text-tape')} />}
                    <span className="min-w-0 flex-1">{a.text}</span><ArrowRight size={14} className="mt-1 shrink-0 text-dim" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card rise p-5" style={{ ['--i' as string]: 6 }} aria-label="This week">
          <div className="mb-3 flex items-center justify-between"><h2 className="display text-[22px]">This week</h2><Link to="/app/uploads?view=calendar" viewTransition className="ulink text-[13px] font-semibold text-mute hover:text-paper">Calendar</Link></div>
          <ol className="grid gap-1">
            {week.map((d, i) => (
              <li key={d.date} className="flex items-center gap-3 rounded-xl px-3 py-2">
                <span className={cx('mono w-[86px] shrink-0 text-[12.5px]', i === 0 ? 'font-bold text-lime' : 'text-mute')}>{i === 0 ? 'Today' : fmtDay(d.date)}</span>
                {d.videos.length ? <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">{d.videos.map((v) => <Link key={v.id} to={videoPath(v.id, 'publish')} viewTransition data-stage={v.stage} className="max-w-full truncate rounded-md border-l-[3px] border-[var(--st)] bg-[color-mix(in_srgb,var(--st)_14%,transparent)] px-2 py-1 text-[12.5px] font-semibold">{v.title}</Link>)}</span> : <span className="text-[13px] text-dim">{i === 0 ? 'Nothing scheduled' : '–'}</span>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
