import { ArrowRight, Clapperboard, Flame, Lightbulb, Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ProjectCard, kitProgress } from '../components/ProjectCard'
import { Button, Empty, Ring, StatusPill, useUI } from '../components/ui'
import { STATUSES } from '../lib/types'
import { fmtBytes, relDay, streak, toast } from '../lib/util'
import { useVault } from '../lib/vault'

const greeting = () => {
  const h = new Date().getHours()
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Home() {
  const projects = useVault((s) => s.db.projects)
  const profile = useVault((s) => s.profile)
  const quota = useVault((s) => s.quota)
  const [idea, setIdea] = useState('')

  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s.id, projects.filter((p) => p.status === s.id).length])), [projects])
  const next = useMemo(
    () =>
      projects
        .filter((p) => p.status === 'ready' || p.status === 'scheduled')
        .sort((a, b) => (a.publishDate ?? '9999').localeCompare(b.publishDate ?? '9999'))[0],
    [projects],
  )
  const recent = useMemo(() => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4), [projects])
  const run = useMemo(() => streak(projects), [projects])
  const used = quota && quota.limit ? quota.used / quota.limit : null

  const capture = (e: FormEvent) => {
    e.preventDefault()
    if (!idea.trim()) return
    useVault.getState().createProject({ title: idea, status: 'idea' })
    setIdea('')
    toast('Idea captured')
  }

  return (
    <div className="grid gap-6">
      <header className="rise">
        <p className="label">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1 className="display mt-2 text-[clamp(34px,5vw,54px)]">
          {greeting()}, {profile?.name.split(' ')[0] ?? 'creator'}.
        </h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Up next: the one video that needs you today */}
        <section className="card rise relative overflow-hidden p-6 md:p-7" style={{ ['--i' as string]: 1 }} data-status={next?.status} aria-label="Up next">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl" style={{ background: 'var(--st, var(--color-lime))' }} />
          <p className="label">Up next</p>
          {next ? (
            <>
              <h2 className="display mt-3 text-[clamp(26px,3.4vw,38px)]">{next.title}</h2>
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <StatusPill status={next.status} />
                <span className="mono text-[12.5px] text-mute">{relDay(next.publishDate)}</span>
                <span className="mono text-[12.5px] text-mute">Kit {kitProgress(next)}/3</span>
                <span className="mono text-[12.5px] text-mute">{next.finalFileId ? 'Final in Drive' : 'No final export yet'}</span>
              </div>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <Link to={`/app/v/${next.id}?tab=publish`} viewTransition className="btn btn-primary">
                  Open publish mode <ArrowRight size={17} />
                </Link>
                <Link to={`/app/v/${next.id}`} viewTransition className="btn">
                  Open video
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="display mt-3 text-[clamp(24px,3vw,32px)]">Nothing is ready to publish.</h2>
              <p className="mt-2 max-w-md text-mute">When a video has its final export and kit, mark it Ready and it shows up here.</p>
              <Button variant="primary" className="mt-5" onClick={() => useUI.setState({ newVideo: true })}>
                <Plus size={17} strokeWidth={2.6} /> New video
              </Button>
            </>
          )}
        </section>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <Link to="/app/settings" viewTransition className="card rise flex items-center gap-4 p-5 transition-colors hover:border-line2" style={{ ['--i' as string]: 2 }} aria-label="Storage details">
            <Ring value={used} size={76}>
              <span className="mono text-[13px] font-semibold">{used === null ? '∞' : `${Math.round(used * 100)}%`}</span>
            </Ring>
            <div className="min-w-0">
              <p className="label">Drive storage</p>
              <p className="mt-1 truncate font-semibold">{quota ? fmtBytes(quota.used) : 'Checking…'}</p>
              <p className="truncate text-[12.5px] text-dim">{quota ? (quota.limit ? `of ${fmtBytes(quota.limit)}` : 'no fixed limit') : ''}</p>
            </div>
          </Link>
          <div className="card rise flex items-center gap-4 p-5" style={{ ['--i' as string]: 3 }}>
            <div className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-full border border-line bg-coal">
              <Flame size={28} className={run ? 'text-tape' : 'text-dim'} />
            </div>
            <div>
              <p className="label">Publishing streak</p>
              <p className="display mt-1 text-[30px] leading-none">
                {run} <span className="text-[15px] text-mute">day{run === 1 ? '' : 's'}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline: where every video stands */}
      <section className="rise grid grid-cols-2 gap-2.5 sm:grid-cols-5" style={{ ['--i' as string]: 4 }} aria-label="Pipeline">
        {STATUSES.map((s) => (
          <Link key={s.id} to={`/app/videos?status=${s.id}`} viewTransition data-status={s.id} className="card group p-4 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[var(--st)]" title={s.hint}>
            <p className="display text-[34px] leading-none" style={{ color: counts[s.id] ? 'var(--st)' : 'var(--color-dim)' }}>
              {counts[s.id]}
            </p>
            <p className="label mt-2">{s.label}</p>
          </Link>
        ))}
      </section>

      {/* Quick capture: ideas arrive when you are not at the desk */}
      <form onSubmit={capture} className="card rise flex items-center gap-3 p-2 pl-4" style={{ ['--i' as string]: 5 }}>
        <Lightbulb size={18} className="shrink-0 text-ice" />
        <input className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-dim" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Capture a video idea and press Enter" aria-label="Capture a video idea" maxLength={140} />
        <Button type="submit" size="sm" disabled={!idea.trim()}>
          Save idea
        </Button>
      </form>

      <section aria-label="Recently touched">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="display text-[22px]">Recently touched</h2>
          <Link to="/app/videos" viewTransition className="ulink text-[13.5px] font-semibold text-mute hover:text-paper">
            All videos
          </Link>
        </div>
        {recent.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {recent.map((p, i) => (
              <ProjectCard key={p.id} p={p} i={i + 6} />
            ))}
          </div>
        ) : (
          <div className="card">
            <Empty
              icon={<Clapperboard size={24} />}
              title="Your vault is empty"
              body="Create your first video. Slate makes a folder for it in your Google Drive and keeps its footage, edits and publish kit together."
              action={
                <Button variant="primary" onClick={() => useUI.setState({ newVideo: true })}>
                  <Plus size={17} strokeWidth={2.6} /> New video
                </Button>
              }
            />
          </div>
        )}
      </section>
    </div>
  )
}
