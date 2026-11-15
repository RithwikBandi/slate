import { ChevronLeft, ChevronRight, Download, ExternalLink, Maximize, Minimize, MessageSquarePlus, Pause, PictureInPicture2, Play, Repeat, TriangleAlert, Volume1, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { usePlayer, type PlaySource } from '../lib/player'
import { useTransfers } from '../lib/uploads'
import { cx, fmtBytes, fmtClock, timeAgo, toast } from '../lib/util'
import { driveApi, useVault } from '../lib/vault'
import { Kbd } from './ui'

// ---------------------------------------------------------------- persisted preferences
const PREF_KEY = 'slate-player'
const POS_KEY = 'slate-positions'
interface Prefs { volume: number; muted: boolean; rate: number; loop: boolean }
const loadPrefs = (): Prefs => {
  try {
    return { volume: 1, muted: false, rate: 1, loop: false, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') }
  } catch {
    return { volume: 1, muted: false, rate: 1, loop: false }
  }
}
const savePrefs = (p: Prefs) => {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}
const readPos = (id: string): number => {
  try {
    return Number(JSON.parse(localStorage.getItem(POS_KEY) ?? '{}')[id] ?? 0)
  } catch {
    return 0
  }
}
const writePos = (id: string, t: number) => {
  try {
    const all = JSON.parse(localStorage.getItem(POS_KEY) ?? '{}')
    all[id] = t
    const keys = Object.keys(all)
    if (keys.length > 150) delete all[keys[0]]
    localStorage.setItem(POS_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))

// ---------------------------------------------------------------- clock: reads the video every frame while it matters
function useClock(vref: RefObject<HTMLVideoElement | null>, active: boolean) {
  const [s, set] = useState({ t: 0, d: 0, b: 0 })
  useEffect(() => {
    const v = vref.current
    if (!v) return
    let raf = 0
    const read = () => {
      let b = 0
      for (let i = 0; i < v.buffered.length; i++) if (v.currentTime >= v.buffered.start(i) - 0.1 && v.currentTime <= v.buffered.end(i) + 0.1) b = v.buffered.end(i)
      set((p) => (p.t === v.currentTime && p.d === (v.duration || 0) && p.b === b ? p : { t: v.currentTime, d: v.duration || 0, b }))
    }
    const tick = () => {
      read()
      raf = requestAnimationFrame(tick)
    }
    const events = ['loadedmetadata', 'timeupdate', 'seeked', 'progress', 'durationchange', 'emptied']
    events.forEach((e) => v.addEventListener(e, read))
    read()
    if (active) raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      events.forEach((e) => v.removeEventListener(e, read))
    }
  }, [vref, active])
  return s
}

// ---------------------------------------------------------------- timeline
function Timeline({ vref, active, markers, onMarker, scrubbing, setScrubbing, remaining, toggleRemaining }: {
  vref: RefObject<HTMLVideoElement | null>
  active: boolean
  markers: { id: string; t: number; text: string }[]
  onMarker(t: number): void
  scrubbing: boolean
  setScrubbing(b: boolean): void
  remaining: boolean
  toggleRemaining(): void
}) {
  const { t, d, b } = useClock(vref, active || scrubbing)
  const track = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const shown = drag ?? t
  const pct = d ? clamp(shown / d, 0, 1) * 100 : 0

  const at = (e: { clientX: number }) => {
    const r = track.current!.getBoundingClientRect()
    return clamp((e.clientX - r.left) / r.width, 0, 1) * (d || 0)
  }
  const down = (e: RPointerEvent) => {
    if (!d) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setScrubbing(true)
    setDrag(at(e))
  }
  const move = (e: RPointerEvent) => {
    const x = at(e)
    setHover(x)
    if (scrubbing && vref.current) {
      setDrag(x)
      const el = vref.current as HTMLVideoElement & { fastSeek?: (t: number) => void }
      if (el.fastSeek) el.fastSeek(x)
      else el.currentTime = x
    }
  }
  const up = (e: RPointerEvent) => {
    if (!scrubbing) return
    const x = at(e)
    if (vref.current) vref.current.currentTime = x
    setDrag(null)
    setScrubbing(false)
  }

  return (
    <div className="grid gap-1.5">
      <div
        ref={track}
        className="tl"
        data-scrub={scrubbing}
        role="slider"
        tabIndex={-1}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(d)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={`${fmtClock(shown)} of ${fmtClock(d)}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={() => !scrubbing && setHover(null)}
      >
        <div className="tl-track">
          <i className="tl-buf" style={{ width: `${d ? (b / d) * 100 : 0}%` }} />
          <i className="tl-played" style={{ width: `${pct}%` }} />
          {markers.map((m) => (
            <button key={m.id} type="button" className="tl-mark" style={{ left: `${d ? (m.t / d) * 100 : 0}%` }} title={`${fmtClock(m.t)}: ${m.text}`} aria-label={`Note at ${fmtClock(m.t)}: ${m.text}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => onMarker(m.t)} />
          ))}
          <b className="tl-thumb" style={{ left: `${pct}%` }} />
        </div>
        {hover !== null && d > 0 && (
          <span className="tl-tip mono" style={{ left: `${clamp((hover / d) * 100, 4, 96)}%` }}>
            {fmtClock(hover)}
          </span>
        )}
      </div>
      <div className="mono flex justify-between text-[12px] text-paper/80">
        <span>{fmtClock(shown)}</span>
        <button type="button" onClick={toggleRemaining} className="hover:text-paper" title="Switch between total length and time remaining">
          {remaining ? `-${fmtClock(Math.max(0, d - shown))}` : fmtClock(d)}
        </button>
      </div>
    </div>
  )
}

const Skip = ({ dir }: { dir: -1 | 1 }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir === -1 ? <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4.5H8" /> : <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1M20.5 4v4.5H16" />}
    <text x="12" y="15.2" textAnchor="middle" fontSize="7.4" fontWeight="700" fill="currentColor" stroke="none" fontFamily="ui-monospace,monospace">10</text>
  </svg>
)

// ---------------------------------------------------------------- the player
interface PlayerProps {
  src: PlaySource
  /** Fixed media URL (landing page demo). Skips Drive entirely. */
  url?: string
  inline?: boolean
  onClose?(): void
  title?: string
  autoPlay?: boolean
  muted?: boolean
}

export function Player({ src, url: fixedUrl, inline, onClose, title, autoPlay = true, muted: forceMuted }: PlayerProps) {
  const { item, videoId, queue } = src
  const box = useRef<HTMLDivElement>(null)
  const vref = useRef<HTMLVideoElement>(null)
  const prefs = useRef(loadPrefs())
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const clickTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const tap = useRef({ t: 0, zone: '' })
  const retried = useRef(false)

  const [url, setUrl] = useState<string | null>(fixedUrl ?? null)
  const [retry, setRetry] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(true)
  const [error, setError] = useState<null | { kind: 'auth' | 'codec' | 'missing' | 'network'; msg: string }>(null)
  const [muted, setMuted] = useState(forceMuted ?? prefs.current.muted)
  const [volume, setVolume] = useState(prefs.current.volume)
  const [rate, setRate] = useState(prefs.current.rate)
  const [loop, setLoop] = useState(prefs.current.loop)
  const [visible, setVisible] = useState(true)
  const [menu, setMenu] = useState<null | 'speed'>(null)
  const [fs, setFs] = useState(false)
  const [scrubbing, setScrubbing] = useState(false)
  const [remaining, setRemaining] = useState(false)
  const [notes, setNotes] = useState(false)
  const [help, setHelp] = useState(false)
  const [flash, setFlash] = useState<null | { id: number; label: string; zone: string }>(null)
  const [pulse, setPulse] = useState(0)
  const [resumed, setResumed] = useState<null | number>(null)
  const [preview, setPreview] = useState(false)
  const [draft, setDraft] = useState('')
  const noteBox = useRef<HTMLTextAreaElement>(null)

  const markers = useVault((s) => (videoId ? s.db.videos.find((v) => v.id === videoId)?.markers : undefined)) ?? []
  const isGoogle = useVault((s) => s.mode === 'google')
  const queueIdx = queue ? queue.findIndex((q) => q.id === item.id) : -1
  const canNext = !inline && queue && queueIdx >= 0 && queueIdx < queue.length - 1
  const canPrev = !inline && queue && queueIdx > 0
  const sticky = menu !== null || notes || scrubbing || help || !playing || !!error
  const showUi = visible || sticky

  // ---- resolve a streamable URL (needs a fresh token, so it is requested again on retry)
  useEffect(() => {
    if (fixedUrl) return
    let live = true
    setUrl(null)
    setError(null)
    setWaiting(true)
    driveApi()
      .mediaUrl(item)
      .then((u) => live && setUrl(u))
      .catch(() => live && setError({ kind: 'auth', msg: 'Your Google session needs a refresh.' }))
    return () => {
      live = false
    }
  }, [item, fixedUrl, retry])

  // ---- apply prefs and resume position once the video knows its length
  const onLoaded = () => {
    const v = vref.current!
    v.volume = volume
    v.muted = muted
    v.playbackRate = rate
    const saved = readPos(item.id)
    if (!inline && saved > 5 && saved < v.duration - 5) {
      v.currentTime = saved
      setResumed(saved)
      setTimeout(() => setResumed(null), 5000)
    }
    setWaiting(false)
  }

  useEffect(() => {
    if (vref.current) {
      vref.current.volume = volume
      vref.current.muted = muted
      vref.current.playbackRate = rate
      vref.current.loop = loop
    }
    savePrefs({ volume, muted: forceMuted ? prefs.current.muted : muted, rate, loop })
  }, [volume, muted, rate, loop, forceMuted])

  // ---- remember where you stopped
  useEffect(() => {
    const v = vref.current
    if (!v || inline) return
    const save = () => v.currentTime > 3 && writePos(item.id, v.ended ? 0 : v.currentTime)
    const id = setInterval(save, 4000)
    window.addEventListener('pagehide', save)
    return () => {
      save()
      clearInterval(id)
      window.removeEventListener('pagehide', save)
    }
  }, [item.id, inline])

  // ---- actions
  const toggle = useCallback(() => {
    const v = vref.current
    if (!v) return
    setPulse((n) => n + 1)
    if (v.paused || v.ended) void v.play().catch(() => {})
    else v.pause()
  }, [])
  const seek = useCallback((t: number) => {
    const v = vref.current
    if (v && Number.isFinite(v.duration)) v.currentTime = clamp(t, 0, v.duration)
  }, [])
  const skip = useCallback(
    (s: number, zone = s < 0 ? 'L' : 'R') => {
      const v = vref.current
      if (!v) return
      seek(v.currentTime + s)
      setFlash({ id: Date.now(), label: `${s > 0 ? '+' : ''}${s}s`, zone })
    },
    [seek],
  )
  const toggleFs = useCallback(() => {
    const el = box.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }
    if (document.fullscreenElement || doc.webkitFullscreenElement) void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
    else if (el?.requestFullscreen) void el.requestFullscreen().catch(() => {})
    else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen()
    else (vref.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void } | null)?.webkitEnterFullscreen?.()
  }, [])
  const togglePip = useCallback(async () => {
    const v = vref.current
    if (!v) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await v.requestPictureInPicture()
    } catch {
      toast('Picture-in-picture is not available for this video', 'bad')
    }
  }, [])
  const changeVolume = (v: number) => {
    setVolume(clamp(v, 0, 1))
    if (v > 0) setMuted(false)
  }
  const addNote = (text: string) => {
    const v = vref.current
    if (!videoId || !v || !text.trim()) return
    useVault.getState().addMarker(videoId, Math.round(v.currentTime * 10) / 10, text.trim())
    setDraft('')
  }
  const openNotes = useCallback(() => {
    if (!videoId) return toast('Open a video from Uploads or the Ideas board to keep timestamped notes on it', 'info')
    vref.current?.pause()
    setNotes(true)
    setTimeout(() => noteBox.current?.focus(), 60)
  }, [videoId])

  const poke = () => {
    setVisible(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setVisible(false), 2800)
  }
  useEffect(() => {
    poke()
    return () => {
      clearTimeout(hideTimer.current)
      clearTimeout(clickTimer.current)
    }
  }, [])

  // ---- fullscreen state, body lock, focus
  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])
  useEffect(() => {
    if (inline) return
    const prevOverflow = document.body.style.overflow
    const prevFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    box.current?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      prevFocus?.focus?.()
      if (document.fullscreenElement) void document.exitFullscreen()
    }
  }, [inline])

  // ---- hardware media keys and lock-screen controls
  useEffect(() => {
    if (!('mediaSession' in navigator) || inline) return
    navigator.mediaSession.metadata = new MediaMetadata({ title: title ?? item.name, artist: 'Slate' })
    navigator.mediaSession.setActionHandler('play', () => void vref.current?.play())
    navigator.mediaSession.setActionHandler('pause', () => vref.current?.pause())
    navigator.mediaSession.setActionHandler('seekbackward', () => skip(-10))
    navigator.mediaSession.setActionHandler('seekforward', () => skip(10))
    return () => {
      for (const a of ['play', 'pause', 'seekbackward', 'seekforward'] as const) navigator.mediaSession.setActionHandler(a, null)
    }
  }, [item, title, inline, skip])

  // ---- keyboard
  const onKey = useCallback(
    (e: KeyboardEvent | React.KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !(t as HTMLInputElement).type?.match(/range/)) {
        if (e.key === 'Escape') (t as HTMLElement).blur()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const v = vref.current
      const k = e.key
      const handled = () => {
        e.preventDefault()
        poke()
      }
      if (k === ' ' || k === 'k') { handled(); toggle() }
      else if (k === 'ArrowLeft') { handled(); skip(-5) }
      else if (k === 'ArrowRight') { handled(); skip(5) }
      else if (k === 'j') { handled(); skip(-10) }
      else if (k === 'l') { handled(); skip(10) }
      else if (k === 'ArrowUp') { handled(); changeVolume(volume + 0.05) }
      else if (k === 'ArrowDown') { handled(); changeVolume(volume - 0.05) }
      else if (k === 'm') { handled(); setMuted((x) => !x) }
      else if (k === 'f') { handled(); toggleFs() }
      else if (k === 'p') { handled(); void togglePip() }
      else if (k === 'r') { handled(); setLoop((x) => !x) }
      else if (k === 'n') { handled(); openNotes() }
      else if (k === '?') { handled(); setHelp((x) => !x) }
      else if (k === ',' || k === '.') { if (v?.paused) { handled(); seek(v.currentTime + (k === '.' ? 1 : -1) / 30) } }
      else if (k === '<' || k === '>') { handled(); setRate((r) => RATES[clamp(RATES.indexOf(r) + (k === '>' ? 1 : -1), 0, RATES.length - 1)] ?? 1) }
      else if (/^[0-9]$/.test(k) && v) { handled(); seek((v.duration || 0) * (Number(k) / 10)) }
      else if (k === 'N' && canNext) { handled(); usePlayer.getState().step(1) }
      else if (k === 'P' && canPrev) { handled(); usePlayer.getState().step(-1) }
      else if (k === 'Escape' && !inline) {
        handled()
        if (help) setHelp(false)
        else if (notes) setNotes(false)
        else if (document.fullscreenElement) void document.exitFullscreen()
        else onClose?.()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [volume, canNext, canPrev, help, notes, inline, toggle, skip, seek, toggleFs, togglePip, openNotes, onClose],
  )
  useEffect(() => {
    if (inline) return
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inline, onKey])

  // ---- tap / click on the picture
  const onSurface = (e: React.MouseEvent) => {
    poke()
    setMenu(null)
    const r = box.current!.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const zone = x < 0.33 ? 'L' : x > 0.67 ? 'R' : 'C'
    const now = performance.now()
    if (now - tap.current.t < 260 && tap.current.zone === zone) {
      clearTimeout(clickTimer.current)
      tap.current.t = 0
      if (zone === 'L') skip(-10, 'L')
      else if (zone === 'R') skip(10, 'R')
      else toggleFs()
      return
    }
    tap.current = { t: now, zone }
    clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(toggle, 230)
  }

  // ---- when the video cannot play, find out why
  const onError = async () => {
    const v = vref.current
    if (!v?.src || fixedUrl) return setError({ kind: 'codec', msg: 'This video could not be played.' })
    if (!retried.current) {
      retried.current = true // a stale token is the usual cause: ask for a fresh one once
      setRetry((n) => n + 1)
      return
    }
    try {
      const r = await fetch(v.src, { headers: { Range: 'bytes=0-0' } })
      if (r.status === 401 || r.status === 403) setError({ kind: 'auth', msg: 'Google refused to stream this file. Try again, or download it.' })
      else if (r.status === 404) setError({ kind: 'missing', msg: 'This file is no longer in your Drive.' })
      else setError({ kind: 'codec', msg: "Your browser can't play this format. Download it, or use the Drive preview." })
    } catch {
      setError({ kind: 'network', msg: 'Could not reach Google Drive. Check your connection.' })
    }
  }

  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
  const poster = item.thumbnailLink?.replace(/=s\d+$/, '=s1280')
  const body = (
    <div
      ref={box}
      tabIndex={inline ? 0 : -1}
      role={inline ? 'region' : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-label={`Video player: ${title ?? item.name}`}
      className={cx('player', inline && 'player-inline')}
      data-ui={showUi ? 'show' : 'hide'}
      data-fs={fs}
      onPointerMove={poke}
      onKeyDown={inline ? (e) => onKey(e) : undefined}
    >
      {preview && isGoogle ? (
        <iframe title="Drive preview" className="absolute inset-0 h-full w-full border-0" src={`https://drive.google.com/file/d/${item.id}/preview`} allow="autoplay; fullscreen" />
      ) : (
        <video
          ref={vref}
          className="player-video"
          src={url ?? undefined}
          poster={poster}
          playsInline
          preload="metadata"
          autoPlay={autoPlay && !inline}
          muted={forceMuted}
          loop={loop}
          onLoadedMetadata={onLoaded}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => (canNext ? usePlayer.getState().step(1) : setPlaying(false))}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => { setWaiting(false); setError(null) }}
          onCanPlay={() => setWaiting(false)}
          onSeeking={() => setWaiting(true)}
          onSeeked={() => setWaiting(false)}
          onError={onError}
        />
      )}

      {!preview && <div className="absolute inset-0" onClick={onSurface} aria-hidden="true" />}

      {/* feedback: spinner, big play pulse, skip ripples */}
      {waiting && !error && !preview && url !== null && <div className="player-center" aria-hidden="true"><span className="spin block h-12 w-12 rounded-full border-[3px] border-white/25 border-t-white" /></div>}
      {pulse > 0 && !waiting && <div key={pulse} className="player-pulse" aria-hidden="true">{playing ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" />}</div>}
      {!playing && !waiting && !error && !preview && (
        <button type="button" className="player-bigplay" onClick={toggle} aria-label="Play">
          <Play size={38} fill="currentColor" className="ml-1" />
        </button>
      )}
      {flash && <div key={flash.id} className="player-flash mono" data-zone={flash.zone} onAnimationEnd={() => setFlash(null)}>{flash.label}</div>}
      {resumed !== null && (
        <div className="player-chip">
          Resumed at {fmtClock(resumed)}
          <button type="button" onClick={() => { seek(0); setResumed(null) }}>Start over</button>
        </div>
      )}

      {/* error */}
      {error && (
        <div className="player-center">
          <div className="glass max-w-sm rounded-3xl p-6 text-center">
            <TriangleAlert className="mx-auto mb-3 text-tape" size={28} />
            <p className="font-semibold">{error.msg}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-sm" onClick={() => { retried.current = false; setError(null); setRetry((n) => n + 1) }}>Try again</button>
              {!inline && <button type="button" className="btn btn-sm" onClick={() => useTransfers.getState().download(item)}><Download size={14} /> Download</button>}
              {isGoogle && error.kind === 'codec' && <button type="button" className="btn btn-sm btn-primary" onClick={() => setPreview(true)}><ExternalLink size={14} /> Drive preview</button>}
            </div>
          </div>
        </div>
      )}

      {/* top bar */}
      {!inline && (
        <div className="player-top">
          <button type="button" className="glass-btn" onClick={onClose} aria-label="Close player (Esc)"><X size={20} /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{title ?? item.name}</p>
            <p className="mono truncate text-[12px] text-paper/60">{title ? `${item.name} · ` : ''}{fmtBytes(item.size)}{queue && queueIdx >= 0 ? ` · ${queueIdx + 1} of ${queue.length}` : ''}</p>
          </div>
          <button type="button" className="glass-btn hidden sm:grid" onClick={() => setHelp((h) => !h)} aria-label="Keyboard shortcuts (?)" title="Keyboard shortcuts"><span className="mono text-[15px]">?</span></button>
        </div>
      )}

      {/* control bar */}
      {!preview && (
        <div className="player-bar glass" onPointerDown={(e) => e.stopPropagation()}>
          <Timeline vref={vref} active={showUi && playing} markers={markers} onMarker={(t) => { seek(t); poke() }} scrubbing={scrubbing} setScrubbing={setScrubbing} remaining={remaining} toggleRemaining={() => setRemaining((r) => !r)} />
          <div className="mt-1 flex items-center gap-1">
            <div className="flex items-center gap-0.5">
              {canPrev && <button type="button" className="pbtn" onClick={() => usePlayer.getState().step(-1)} aria-label="Previous video (Shift+P)"><ChevronLeft size={22} /></button>}
              <button type="button" className="pbtn" onClick={() => skip(-10)} aria-label="Back 10 seconds (J)"><Skip dir={-1} /></button>
              <button type="button" className="pbtn pbtn-main" onClick={toggle} aria-label={playing ? 'Pause (Space)' : 'Play (Space)'}>{playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}</button>
              <button type="button" className="pbtn" onClick={() => skip(10)} aria-label="Forward 10 seconds (L)"><Skip dir={1} /></button>
              {canNext && <button type="button" className="pbtn" onClick={() => usePlayer.getState().step(1)} aria-label="Next video (Shift+N)"><ChevronRight size={22} /></button>}
            </div>
            <div className="vol group ml-1 hidden items-center sm:flex">
              <button type="button" className="pbtn" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute (M)' : 'Mute (M)'}><VolIcon size={20} /></button>
              <input type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume} onChange={(e) => changeVolume(Number(e.target.value))} aria-label="Volume" className="vol-range" style={{ ['--v' as string]: `${(muted ? 0 : volume) * 100}%` }} />
            </div>
            <div className="flex-1" />
            {videoId && (
              <button type="button" className={cx('pbtn relative', notes && 'pbtn-on')} onClick={() => (notes ? setNotes(false) : openNotes())} aria-label="Notes at this moment (N)" title="Add a note at this moment (N)">
                <MessageSquarePlus size={20} />
                {markers.length > 0 && <span className="pbadge mono">{markers.length}</span>}
              </button>
            )}
            <div className="relative">
              <button type="button" className={cx('pbtn mono !w-auto px-2.5 text-[13px] font-semibold', menu === 'speed' && 'pbtn-on')} onClick={() => setMenu(menu === 'speed' ? null : 'speed')} aria-label="Playback speed" aria-expanded={menu === 'speed'}>{rate}×</button>
              {menu === 'speed' && (
                <div className="pmenu glass" role="menu">
                  {RATES.map((r) => <button key={r} type="button" role="menuitemradio" aria-checked={r === rate} className={cx('pmenu-item mono', r === rate && 'is-on')} onClick={() => { setRate(r); setMenu(null) }}>{r}×{r === 1 ? <em>Normal</em> : null}</button>)}
                </div>
              )}
            </div>
            <button type="button" className={cx('pbtn hidden sm:grid', loop && 'pbtn-on')} onClick={() => setLoop((l) => !l)} aria-label="Loop (R)" aria-pressed={loop}><Repeat size={19} /></button>
            {'pictureInPictureEnabled' in document && <button type="button" className="pbtn hidden sm:grid" onClick={togglePip} aria-label="Picture in picture (P)"><PictureInPicture2 size={19} /></button>}
            {!inline && <button type="button" className="pbtn" onClick={() => { useTransfers.getState().download(item); toast('Download started') }} aria-label="Download"><Download size={19} /></button>}
            <button type="button" className="pbtn" onClick={toggleFs} aria-label={fs ? 'Exit full screen (F)' : 'Full screen (F)'}>{fs ? <Minimize size={20} /> : <Maximize size={20} />}</button>
          </div>
        </div>
      )}

      {/* notes drawer */}
      {notes && videoId && (
        <aside className="player-notes glass" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} aria-label="Timestamped notes">
          <header className="flex items-center justify-between px-4 pt-4">
            <h3 className="display text-[20px]">Notes</h3>
            <button type="button" className="pbtn" onClick={() => setNotes(false)} aria-label="Close notes"><X size={18} /></button>
          </header>
          <form className="px-4 pb-3 pt-3" onSubmit={(e) => { e.preventDefault(); addNote(draft) }}>
            <textarea ref={noteBox} className="input text-[14px]" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What needs to change right here?" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(draft) } }} />
            <div className="mt-2 flex items-center justify-between">
              <span className="mono text-[12px] text-paper/60">at {fmtClock(vref.current?.currentTime ?? 0)}</span>
              <button type="submit" className="btn btn-sm btn-primary" disabled={!draft.trim()}>Add note</button>
            </div>
          </form>
          <ul className="grid gap-1 overflow-auto px-2 pb-3">
            {markers.length === 0 && <li className="px-3 py-6 text-center text-[13.5px] text-paper/60">No notes yet. Pause on a frame, write what to fix, and it is pinned to that second.</li>}
            {markers.map((m) => (
              <li key={m.id} className="group flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5">
                <button type="button" className="mono mt-0.5 rounded-md bg-lime px-1.5 py-0.5 text-[12px] font-bold text-carbon" onClick={() => seek(m.t)}>{fmtClock(m.t)}</button>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-[14px]">{m.text}</p>
                  <p className="mono text-[11px] text-paper/45">{timeAgo(m.at)}</p>
                </div>
                <button type="button" className="pbtn !h-7 !w-7 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => useVault.getState().removeMarker(videoId, m.id)} aria-label="Delete note"><X size={14} /></button>
              </li>
            ))}
          </ul>
        </aside>
      )}

      {/* shortcuts */}
      {help && (
        <div className="player-center" onClick={() => setHelp(false)}>
          <div className="glass w-[min(520px,92vw)] rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="display mb-4 text-[22px]">Keyboard shortcuts</h3>
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2.5 text-[14px]">
              {[
                ['Play / pause', 'Space'], ['Back / forward 5 s', '← →'], ['Back / forward 10 s', 'J  L'], ['Volume', '↑ ↓'], ['Mute', 'M'], ['Full screen', 'F'],
                ['Picture in picture', 'P'], ['Add a note here', 'N'], ['Speed down / up', '<  >'], ['Frame step (paused)', ',  .'], ['Jump to 0–90 %', '0–9'], ['Loop', 'R'], ['Next / previous clip', 'Shift N  P'], ['Close', 'Esc'],
              ].map(([a, b]) => (
                <div key={a} className="contents"><dt className="text-paper/75">{a}</dt><dd className="text-right"><Kbd>{b}</Kbd></dd></div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  )
  return body
}

/** Mounted once in the app shell: plays whatever usePlayer.play() was last given. */
export function PlayerHost() {
  const src = usePlayer((s) => s.src)
  if (!src) return null
  return createPortal(<Player key={src.item.id} src={src} onClose={() => usePlayer.getState().close()} />, document.body)
}
