import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, Pause, Play, RotateCcw, X } from 'lucide-react'
import { useTransfers, type Transfer } from '../lib/uploads'
import { cx, fmtBytes, fmtEta, fmtSpeed } from '../lib/util'
import { Button, Progress } from './ui'

const label = (t: Transfer) =>
  t.state === 'done' ? 'Done' : t.state === 'error' ? 'Failed' : t.state === 'paused' ? 'Paused' : t.state === 'queued' ? 'Waiting' : t.state === 'starting' ? 'Starting…' : `${Math.round((t.sent / Math.max(1, t.size)) * 100)}%`

/** Always-visible dock for uploads and downloads. It opens the instant a transfer is requested. */
export function TransferTray() {
  const items = useTransfers((s) => s.items)
  const open = useTransfers((s) => s.open)
  const { setOpen, pause, resume, cancel, clearDone } = useTransfers.getState()
  if (!items.length) return null

  const live = items.filter((i) => i.state !== 'done' && i.state !== 'error' && i.state !== 'paused')
  const total = items.reduce((n, i) => n + i.size, 0)
  const sent = items.reduce((n, i) => n + Math.min(i.sent, i.size), 0)
  const failed = items.filter((i) => i.state === 'error').length
  const speed = live.reduce((n, i) => n + i.speed, 0)
  const eta = speed > 0 ? (live.reduce((n, i) => n + Math.max(0, i.size - i.sent), 0)) / speed : 0
  const pct = total ? sent / total : 1
  const ups = items.filter((i) => i.dir === 'up').length
  const downs = items.length - ups

  const head = live.length
    ? `${ups && downs ? 'Transferring' : downs ? 'Downloading' : 'Uploading'} ${live.length} file${live.length > 1 ? 's' : ''}`
    : failed
      ? `${failed} need${failed === 1 ? 's' : ''} attention`
      : 'All transfers complete'

  return (
    <section className="card tray-in fixed bottom-[76px] right-3 z-40 w-[min(400px,calc(100vw-24px))] overflow-hidden shadow-[0_30px_70px_-30px_#000] md:bottom-4 md:right-4" aria-label="Transfers">
      <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="mono w-11 text-[15px] font-semibold text-lime">{Math.round(pct * 100)}%</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{head}</span>
          <span className="mono block truncate text-[11.5px] text-dim">{fmtBytes(sent)} of {fmtBytes(total)}{speed > 0 ? ` · ${fmtSpeed(speed)} · ${fmtEta(eta)}` : ''}</span>
        </span>
        <ChevronDown size={18} className={cx('text-mute transition-transform duration-300', !open && 'rotate-180')} />
      </button>
      <div className="mx-4 mb-3"><Progress value={pct} state={failed && !live.length ? 'error' : 'uploading'} /></div>
      {open && (
        <div className="max-h-[42vh] overflow-auto border-t border-line px-2 py-2">
          <ul className="grid gap-0.5">
            {items.map((i) => (
              <li key={i.id} className="rounded-xl px-2 py-2">
                <div className="flex items-center gap-2">
                  {i.state === 'done' ? <Check size={15} className="shrink-0 text-lime" strokeWidth={3} /> : i.dir === 'up' ? <ArrowUpFromLine size={15} className="shrink-0 text-mute" /> : <ArrowDownToLine size={15} className="shrink-0 text-mute" />}
                  <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{i.name}</p>
                  <span className={cx('mono shrink-0 text-[11.5px]', i.state === 'error' ? 'text-bad' : i.state === 'done' ? 'text-lime' : 'text-dim')}>{label(i)}</span>
                  {i.state === 'active' && i.dir === 'up' && <Button size="sm" icon variant="ghost" aria-label={`Pause ${i.name}`} title="Pause" onClick={() => pause(i.id)}><Pause size={14} /></Button>}
                  {i.state === 'paused' && <Button size="sm" icon variant="ghost" aria-label={`Resume ${i.name}`} title="Resume" onClick={() => resume(i.id)}><Play size={14} /></Button>}
                  {i.state === 'error' && <Button size="sm" icon variant="ghost" aria-label={`Retry ${i.name}`} title="Retry" onClick={() => resume(i.id)}><RotateCcw size={14} /></Button>}
                  {i.state !== 'done' && <Button size="sm" icon variant="danger" aria-label={`Cancel ${i.name}`} title="Cancel" onClick={() => cancel(i.id)}><X size={14} /></Button>}
                </div>
                {i.state !== 'done' && (
                  <div className="mt-1.5">
                    <Progress value={i.sent / Math.max(1, i.size)} state={i.state} />
                    {i.state === 'active' && i.speed > 0 && <p className="mono mt-1 text-[11px] text-dim">{fmtSpeed(i.speed)} · {fmtEta((i.size - i.sent) / i.speed)}</p>}
                  </div>
                )}
                {i.error && <p className="mt-1 text-[12px] text-bad">{i.error}</p>}
              </li>
            ))}
          </ul>
          {items.some((i) => i.state === 'done') && <div className="px-2 pb-1 pt-2"><Button size="sm" variant="ghost" onClick={clearDone}>Clear finished</Button></div>}
        </div>
      )}
    </section>
  )
}
