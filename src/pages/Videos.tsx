import { Clapperboard, Columns3, LayoutGrid, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ProjectCard } from '../components/ProjectCard'
import { Button, Empty, useUI } from '../components/ui'
import { STATUSES, type Status } from '../lib/types'
import { cx } from '../lib/util'
import { seriesNames, useVault } from '../lib/vault'

type View = 'board' | 'grid'

export default function Videos() {
  const projects = useVault((s) => s.db.projects)
  const [params, setParams] = useSearchParams()
  const status = params.get('status') as Status | null
  const [view, setView] = useState<View>(() => (localStorage.getItem('slate-view') as View) || 'board')
  const [q, setQ] = useState('')
  const [series, setSeries] = useState('')
  const [dropOn, setDropOn] = useState<Status | null>(null)

  const allSeries = useMemo(() => seriesNames(projects), [projects])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return projects.filter((p) => (!series || p.series === series) && (!needle || `${p.title} ${p.kit.title} ${p.series}`.toLowerCase().includes(needle)))
  }, [projects, q, series])

  const pick = (v: View) => {
    setView(v)
    localStorage.setItem('slate-view', v)
  }
  const setStatus = (s: Status | null) => setParams(s ? { status: s } : {}, { replace: true })

  // A status filter only makes sense as a flat list, so it implies the grid.
  const mode: View = status ? 'grid' : view
  const gridItems = status ? shown.filter((p) => p.status === status) : shown

  return (
    <div className="grid gap-5">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">{projects.length} video{projects.length === 1 ? '' : 's'}</p>
          <h1 className="display mt-2 text-[clamp(32px,4.4vw,48px)]">Videos</h1>
        </div>
        <div className="flex rounded-full border border-line bg-coal p-1" role="tablist" aria-label="Layout">
          <button type="button" role="tab" aria-selected={mode === 'board'} className="tab inline-flex items-center gap-2 !h-8" onClick={() => { setStatus(null); pick('board') }}>
            <Columns3 size={15} /> Board
          </button>
          <button type="button" role="tab" aria-selected={mode === 'grid'} className="tab inline-flex items-center gap-2 !h-8" onClick={() => pick('grid')}>
            <LayoutGrid size={15} /> Grid
          </button>
        </div>
      </header>

      <div className="rise flex flex-wrap items-center gap-2.5" style={{ ['--i' as string]: 1 }}>
        <label className="input flex h-10 max-w-xs flex-1 items-center gap-2 py-0">
          <Search size={15} className="text-dim" />
          <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dim" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title" aria-label="Filter videos by title" />
        </label>
        {allSeries.length > 0 && (
          <select className="input h-10 w-auto py-0" value={series} onChange={(e) => setSeries(e.target.value)} aria-label="Filter by series">
            <option value="">All series</option>
            {allSeries.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
        {mode === 'grid' && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={cx('pill cursor-pointer', !status && '!bg-paper !text-carbon')} onClick={() => setStatus(null)}>
              All
            </button>
            {STATUSES.map((s) => (
              <button key={s.id} type="button" data-status={s.id} className={cx('pill cursor-pointer', status === s.id && '!bg-[var(--st)] !text-carbon')} onClick={() => setStatus(status === s.id ? null : s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="card">
          <Empty
            icon={<Clapperboard size={24} />}
            title="No videos yet"
            body="Start one for the video you are working on right now."
            action={
              <Button variant="primary" onClick={() => useUI.setState({ newVideo: true })}>
                <Plus size={17} strokeWidth={2.6} /> New video
              </Button>
            }
          />
        </div>
      ) : mode === 'board' ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-3 md:-mx-8 md:px-8">
          <div className="grid min-w-[1080px] grid-cols-5 gap-3">
            {STATUSES.map((col) => {
              const items = shown.filter((p) => p.status === col.id)
              return (
                <section
                  key={col.id}
                  data-status={col.id}
                  aria-label={col.label}
                  className={cx('rounded-[22px] border p-2.5 transition-colors duration-200', dropOn === col.id ? 'border-[var(--st)] bg-[color-mix(in_srgb,var(--st)_8%,transparent)]' : 'border-line bg-coal')}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('text/slate-project')) {
                      e.preventDefault()
                      setDropOn(col.id)
                    }
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOn(null)
                  }}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData('text/slate-project')
                    setDropOn(null)
                    if (id) useVault.getState().patchProject(id, { status: col.id })
                  }}
                >
                  <header className="flex items-center justify-between px-2 pb-2.5 pt-1.5" title={col.hint}>
                    <span className="pill !bg-transparent !px-0">{col.label}</span>
                    <span className="mono text-[12px] text-dim">{items.length}</span>
                  </header>
                  <div className="grid min-h-[120px] content-start gap-2.5">
                    {items.map((p, i) => (
                      <ProjectCard key={p.id} p={p} i={i} compact draggable />
                    ))}
                    {items.length === 0 && <p className="px-2 py-6 text-center text-[12.5px] text-dim">Drag a video here</p>}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      ) : gridItems.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {gridItems.map((p, i) => (
            <ProjectCard key={p.id} p={p} i={i} />
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-mute">No videos match that filter.</p>
      )}
    </div>
  )
}
