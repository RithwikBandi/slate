import { FlipHorizontal2, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx, fmtClock, readMinutes } from '../lib/util'

/** Full-screen scrolling script for reading to camera. Space starts and stops, arrows change speed. */
export function Teleprompter({ text, title, onClose }: { text: string; title: string; onClose(): void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(() => Number(localStorage.getItem('slate-tp-speed')) || 55) // px per second
  const [size, setSize] = useState(() => Number(localStorage.getItem('slate-tp-size')) || 46)
  const [mirror, setMirror] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    localStorage.setItem('slate-tp-speed', String(speed))
    localStorage.setItem('slate-tp-size', String(size))
  }, [speed, size])

  // Scroll by whole elapsed time, so the speed is the same on 60 Hz and 120 Hz screens.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let pos = scroller.current?.scrollTop ?? 0
    const tick = (now: number) => {
      const el = scroller.current
      if (!el) return
      pos += ((now - last) / 1000) * speed
      last = now
      el.scrollTop = pos
      const max = el.scrollHeight - el.clientHeight
      setProgress(max > 0 ? el.scrollTop / max : 1)
      if (el.scrollTop >= max - 1) return setPlaying(false)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSpeed((s) => Math.min(240, s + 10)) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSpeed((s) => Math.max(10, s - 10)) }
      else if (e.key === 'Escape') onClose()
      else if (e.key === 'r') restart()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  const restart = () => {
    scroller.current?.scrollTo({ top: 0 })
    setProgress(0)
    setPlaying(false)
  }
  const minutes = readMinutes(text)

  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-black text-paper" role="dialog" aria-modal="true" aria-label={`Teleprompter: ${title}`}>
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button type="button" className="glass-btn" onClick={onClose} aria-label="Close teleprompter (Esc)"><X size={20} /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          <p className="mono text-[12px] text-paper/55">about {fmtClock(minutes * 60)} read aloud</p>
        </div>
        <div className="hidden items-center gap-1 sm:flex">
          <button type="button" className="pbtn" onClick={() => setSize((s) => Math.max(24, s - 4))} aria-label="Smaller text"><Minus size={18} /></button>
          <span className="mono w-9 text-center text-[12px] text-paper/70">{size}</span>
          <button type="button" className="pbtn" onClick={() => setSize((s) => Math.min(120, s + 4))} aria-label="Larger text"><Plus size={18} /></button>
        </div>
        <button type="button" className={cx('pbtn', mirror && 'pbtn-on')} onClick={() => setMirror((m) => !m)} aria-label="Mirror text" aria-pressed={mirror} title="Mirror, for a beam-splitter prompter"><FlipHorizontal2 size={19} /></button>
        <button type="button" className="pbtn" onClick={restart} aria-label="Back to the start (R)"><RotateCcw size={19} /></button>
      </header>
      <div className="relative min-h-0 flex-1">
        <div ref={scroller} className="h-full overflow-y-scroll px-[8vw] scroll-smooth-off" style={{ transform: mirror ? 'scaleX(-1)' : undefined, scrollbarWidth: 'none' }} onWheel={() => setPlaying(false)}>
          <div style={{ height: '45vh' }} />
          <p className="mx-auto max-w-4xl whitespace-pre-wrap font-semibold leading-[1.45]" style={{ fontSize: size }}>{text.trim() || 'Your script is empty. Write it on the Script tab, then come back.'}</p>
          <div style={{ height: '70vh' }} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[30%] bg-gradient-to-b from-black to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-black to-transparent" />
        <div className="pointer-events-none absolute inset-x-[6vw] top-[45%] h-[3px] rounded-full bg-lime/70 shadow-[0_0_24px_rgba(198,244,50,0.5)]" aria-hidden="true" />
      </div>
      <footer className="flex items-center gap-4 border-t border-white/10 px-4 py-3">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => setPlaying((p) => !p)}>{playing ? <><Pause size={18} fill="currentColor" /> Pause</> : <><Play size={18} fill="currentColor" /> Start</>}</button>
        <label className="flex flex-1 items-center gap-3 text-[13px] text-paper/70">
          <span className="mono w-16">{speed} px/s</span>
          <input type="range" min={10} max={240} step={5} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Scroll speed" className="vol-range w-full max-w-sm" style={{ ['--v' as string]: `${((speed - 10) / 230) * 100}%` }} />
        </label>
        <span className="mono hidden text-[12px] text-paper/55 sm:block">{Math.round(progress * 100)}%</span>
      </footer>
    </div>,
    document.body,
  )
}
