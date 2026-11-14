import { ChevronDown, Pause, Play, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { useUploads } from '../lib/uploads'
import { cx, fmtBytes } from '../lib/util'
import { Button } from './ui'

/** Always-visible dock for uploads, so you can keep working (or switch pages) while footage goes up. */
export function UploadTray() {
  const items = useUploads((s) => s.items)
  const { pause, resume, cancel, clearDone } = useUploads.getState()
  const [open, setOpen] = useState(true)
  if (!items.length) return null

  const total = items.reduce((n, i) => n + i.size, 0)
  const sent = items.reduce((n, i) => n + Math.min(i.sent, i.size), 0)
  const active = items.filter((i) => i.state === 'uploading' || i.state === 'queued').length
  const failed = items.filter((i) => i.state === 'error').length
  const pct = total ? Math.round((sent / total) * 100) : 100

  return (
    <section className="card fixed bottom-[76px] right-3 z-40 w-[min(380px,calc(100vw-24px))] overflow-hidden shadow-[0_30px_70px_-30px_#000] md:bottom-4 md:right-4" aria-label="Uploads">
      <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="mono w-11 text-[15px] font-semibold text-lime">{pct}%</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{active ? `Uploading ${active} file${active > 1 ? 's' : ''}` : failed ? `${failed} upload${failed > 1 ? 's' : ''} need attention` : 'Uploads complete'}</span>
          <span className="mono block text-[11.5px] text-dim">
            {fmtBytes(sent)} of {fmtBytes(total)}
          </span>
        </span>
        <ChevronDown size={18} className={cx('text-mute transition-transform duration-300', !open && 'rotate-180')} />
      </button>
      <div className="film mx-4 mb-3" data-state={failed && !active ? 'error' : 'uploading'}>
        <i style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      {open && (
        <div className="max-h-[42vh] overflow-auto border-t border-line px-2 py-2">
          <ul className="grid gap-0.5">
            {items.map((i) => (
              <li key={i.id} className="rounded-xl px-2 py-2">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{i.name}</p>
                  <span className={cx('mono shrink-0 text-[11.5px]', i.state === 'error' ? 'text-bad' : i.state === 'done' ? 'text-lime' : 'text-dim')}>
                    {i.state === 'done' ? 'DONE' : i.state === 'error' ? 'FAILED' : i.state === 'paused' ? 'PAUSED' : i.state === 'queued' ? 'QUEUED' : `${Math.round((i.sent / Math.max(1, i.size)) * 100)}%`}
                  </span>
                  {i.state === 'uploading' && (
                    <Button size="sm" icon variant="ghost" aria-label={`Pause ${i.name}`} title="Pause" onClick={() => pause(i.id)}>
                      <Pause size={14} />
                    </Button>
                  )}
                  {i.state === 'paused' && (
                    <Button size="sm" icon variant="ghost" aria-label={`Resume ${i.name}`} title="Resume" onClick={() => resume(i.id)}>
                      <Play size={14} />
                    </Button>
                  )}
                  {i.state === 'error' && (
                    <Button size="sm" icon variant="ghost" aria-label={`Retry ${i.name}`} title="Retry from where it stopped" onClick={() => resume(i.id)}>
                      <RotateCcw size={14} />
                    </Button>
                  )}
                  {i.state !== 'done' && (
                    <Button size="sm" icon variant="danger" aria-label={`Cancel ${i.name}`} title="Cancel upload" onClick={() => cancel(i.id)}>
                      <X size={14} />
                    </Button>
                  )}
                </div>
                {i.state !== 'done' && (
                  <div className="film mt-1.5" data-state={i.state}>
                    <i style={{ transform: `scaleX(${i.sent / Math.max(1, i.size)})` }} />
                  </div>
                )}
                {i.error && <p className="mt-1 text-[12px] text-bad">{i.error}</p>}
              </li>
            ))}
          </ul>
          {items.some((i) => i.state === 'done') && (
            <div className="px-2 pb-1 pt-2">
              <Button size="sm" variant="ghost" onClick={clearDone}>
                Clear finished
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
