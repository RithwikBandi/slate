import { ArrowRight, Lightbulb, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { VideoCard } from '../components/VideoCard'
import { Button, Empty } from '../components/ui'
import { openNewIdea } from '../lib/flow'
import { IDEA_STAGES, stageIndex, type Stage } from '../lib/types'
import { cx, plural } from '../lib/util'
import { seriesNames, useVault } from '../lib/vault'

/** The pre-production board: an idea becomes a script, then footage, then an edit. Drag cards between columns. */
export default function Ideas() {
  const videos = useVault((s) => s.db.videos)
  const [q, setQ] = useState('')
  const [series, setSeries] = useState('')
  const [dropOn, setDropOn] = useState<Stage | null>(null)

  const all = useMemo(() => videos.filter((v) => stageIndex(v.stage) < stageIndex('ready')), [videos])
  const inUploads = videos.length - all.length
  const names = useMemo(() => seriesNames(videos), [videos])
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return all.filter((v) => (!series || v.series === series) && (!n || `${v.title} ${v.pitch} ${v.script}`.toLowerCase().includes(n)))
  }, [all, q, series])

  return (
    <div className="grid gap-5">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">{plural(all.length, 'video')} in production</p>
          <h1 className="display mt-2 text-[clamp(32px,4.4vw,48px)]">Ideas</h1>
        </div>
        <Button variant="primary" onClick={() => openNewIdea()}><Plus size={17} strokeWidth={2.6} /> New idea</Button>
      </header>

      <div className="rise flex flex-wrap items-center gap-2.5" style={{ ['--i' as string]: 1 }}>
        <label className="input flex h-10 max-w-xs flex-1 items-center gap-2 py-0">
          <Search size={15} className="text-dim" />
          <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dim" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ideas and scripts" aria-label="Search ideas and scripts" />
        </label>
        {names.length > 0 && (
          <select className="input h-10 w-auto py-0" value={series} onChange={(e) => setSeries(e.target.value)} aria-label="Filter by series">
            <option value="">All series</option>
            {names.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
        {inUploads > 0 && <Link to="/app/uploads" viewTransition className="ml-auto inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-mute transition-colors hover:text-paper">{plural(inUploads, 'video')} in Uploads <ArrowRight size={14} /></Link>}
      </div>

      {all.length === 0 ? (
        <div className="card">
          <Empty icon={<Lightbulb size={24} />} title="No ideas on the board" body="Capture the next video in a few seconds: a title and what it is about. Then write the script, link the footage, and edit." action={<Button variant="primary" onClick={() => openNewIdea()}><Plus size={17} strokeWidth={2.6} /> New idea</Button>} />
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-3 md:-mx-8 md:px-8">
          <div className="grid min-w-[920px] grid-cols-4 gap-3">
            {IDEA_STAGES.map((col) => {
              const items = shown.filter((v) => v.stage === col.id)
              return (
                <section
                  key={col.id}
                  data-stage={col.id}
                  aria-label={col.label}
                  className={cx('rounded-[22px] border p-2.5 transition-colors duration-200', dropOn === col.id ? 'border-[var(--st)] bg-[color-mix(in_srgb,var(--st)_8%,transparent)]' : 'border-line bg-coal')}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes('text/slate-video')) { e.preventDefault(); setDropOn(col.id) } }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOn(null) }}
                  onDrop={(e) => { const id = e.dataTransfer.getData('text/slate-video'); setDropOn(null); if (id) useVault.getState().setStage(id, col.id) }}
                >
                  <header className="flex items-start justify-between gap-2 px-2 pb-2.5 pt-1.5">
                    <div><span className="pill !bg-transparent !px-0">{col.label}</span><p className="mt-0.5 text-[12px] text-dim">{col.hint}</p></div>
                    <div className="flex items-center gap-1.5"><span className="mono text-[12px] text-dim">{items.length}</span><button type="button" className="grid h-7 w-7 place-items-center rounded-lg text-mute transition-colors hover:bg-raise hover:text-paper" aria-label={`Add an idea to ${col.label}`} title={`Add to ${col.label}`} onClick={() => openNewIdea({ stage: col.id })}><Plus size={16} /></button></div>
                  </header>
                  <div className="grid min-h-[140px] content-start gap-2.5">
                    {items.map((v, i) => <VideoCard key={v.id} v={v} i={i} compact draggable />)}
                    {items.length === 0 && <p className="px-2 py-8 text-center text-[12.5px] text-dim">{q || series ? 'Nothing matches' : 'Drag a card here'}</p>}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
