import { Lightbulb } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useUI, videoPath } from '../lib/flow'
import { seriesNames, useVault } from '../lib/vault'
import { Button, Modal } from './ui'

/** The one way an idea enters Slate: a title, and what it is about. The script comes next. */
export function NewIdea() {
  const req = useUI((s) => s.newIdea)
  const videos = useVault((s) => s.db.videos)
  const series = useMemo(() => seriesNames(videos), [videos])
  const nav = useNavigate()
  const [title, setTitle] = useState('')
  const [pitch, setPitch] = useState('')
  const [inSeries, setInSeries] = useState('')

  useEffect(() => {
    if (req) {
      setTitle('')
      setPitch('')
      setInSeries(req.series ?? localStorage.getItem('slate-last-series') ?? '')
    }
  }, [req])

  const close = () => useUI.setState({ newIdea: null })
  const create = (thenScript: boolean) => {
    if (!title.trim()) return
    localStorage.setItem('slate-last-series', inSeries.trim())
    const v = useVault.getState().createVideo({ title, pitch: pitch.trim(), series: inSeries.trim(), stage: req?.stage ?? 'idea' })
    close()
    if (thenScript) nav(videoPath(v.id, 'script'), { viewTransition: true })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    create(false)
  }

  return (
    <Modal open={req !== null} onOpenChange={(o) => !o && close()} title="New idea" description="Capture it now. You can write the script as soon as you are ready.">
      <form onSubmit={submit} className="grid gap-4">
        <div>
          <label htmlFor="ni-title" className="label mb-1.5 block">Title</label>
          <input id="ni-title" className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Handling “it is too expensive”" maxLength={140} />
        </div>
        <div>
          <label htmlFor="ni-pitch" className="label mb-1.5 block">What is it about?</label>
          <textarea id="ni-pitch" className="input" rows={4} value={pitch} onChange={(e) => setPitch(e.target.value)} placeholder="The hook, the story, why anyone would watch. A few lines is plenty." />
        </div>
        <div>
          <label htmlFor="ni-series" className="label mb-1.5 block">Series (optional)</label>
          <input id="ni-series" className="input" list="ni-series-list" value={inSeries} onChange={(e) => setInSeries(e.target.value)} placeholder="Numbers the episodes for you" />
          <datalist id="ni-series-list">{series.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button type="submit" disabled={!title.trim()}><Lightbulb size={16} /> Save idea</Button>
          <Button variant="primary" disabled={!title.trim()} onClick={() => create(true)}>Save and write the script</Button>
        </div>
      </form>
    </Modal>
  )
}
