import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import type { Status } from '../lib/types'
import { seriesNames, useVault } from '../lib/vault'
import { Button, Modal, useUI } from './ui'

/** The one way a video enters Slate. Asks only for what is needed to start: a name, a series, a stage. */
export function NewVideo() {
  const open = useUI((s) => s.newVideo)
  const projects = useVault((s) => s.db.projects)
  const series = useMemo(() => seriesNames(projects), [projects])
  const nav = useNavigate()
  const [title, setTitle] = useState('')
  const [inSeries, setInSeries] = useState('')
  const [status, setStatus] = useState<Status>('idea')

  useEffect(() => {
    if (open) {
      setTitle('')
      setStatus('idea')
      setInSeries(localStorage.getItem('slate-last-series') ?? '')
    }
  }, [open])

  const close = () => useUI.setState({ newVideo: false })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    localStorage.setItem('slate-last-series', inSeries.trim())
    const p = useVault.getState().createProject({ title, series: inSeries.trim(), status })
    close()
    nav(`/app/v/${p.id}`, { viewTransition: true })
  }

  return (
    <Modal open={open} onOpenChange={(o) => useUI.setState({ newVideo: o })} title="New video" description="Give it a working name. Folders in your Drive are created when you add the first file.">
      <form onSubmit={submit} className="grid gap-4">
        <div>
          <label htmlFor="nv-title" className="label mb-1.5 block">
            Working title
          </label>
          <input id="nv-title" className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The prototype meeting" maxLength={140} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nv-series" className="label mb-1.5 block">
              Series (optional)
            </label>
            <input id="nv-series" className="input" list="nv-series-list" value={inSeries} onChange={(e) => setInSeries(e.target.value)} placeholder="Numbers episodes for you" />
            <datalist id="nv-series-list">
              {series.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="nv-status" className="label mb-1.5 block">
              Where is it now?
            </label>
            <select id="nv-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="idea">Just an idea</option>
              <option value="editing">Shot, in edit</option>
              <option value="ready">Edited, ready to publish</option>
            </select>
          </div>
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!title.trim()}>
            Create video
          </Button>
        </div>
      </form>
    </Modal>
  )
}
