import { ArrowDownToLine, ArrowRight, Check, FolderTree, HardDrive, Lightbulb, MessageSquarePlus, Plus, Send, Share2, ShieldCheck, Upload } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Logo } from '../components/ui'
import { signIn, wakeServer } from '../lib/auth'
import type { DriveItem } from '../lib/types'
import { toast } from '../lib/util'
import { useVault } from '../lib/vault'

const Player = lazy(() => import('../components/Player').then((m) => ({ default: m.Player })))

// Three of Rithwik's own daily Shorts, side by side: the clip the landing player and the demo fall back to.
const SAMPLE: DriveItem = { id: 'sample', name: 'another-day-in-the-making.mp4', kind: 'file', mimeType: 'video/mp4', size: 1684339, createdTime: '', modifiedTime: '', parent: null, thumbnailLink: '/sample-poster.jpg', durationMs: 12000 }

const G = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

// ---------------------------------------------------------------- live timecode, like the readout on a camera
function Timecode({ className }: { className?: string }) {
  const el = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const f = Math.floor(((now - t0) / 1000) * 24)
      const p = (n: number) => String(n).padStart(2, '0')
      if (el.current) el.current.textContent = `${p(Math.floor(f / 86400))}:${p(Math.floor(f / 1440) % 60)}:${p(Math.floor(f / 24) % 60)}:${p(f % 24)}`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <span ref={el} className={className}>00:00:00:00</span>
}

// ---------------------------------------------------------------- the five scenes of the reel: real recordings of the app (public/app), not mock-ups
const SCENES = [
  { n: '01', tag: 'Ideas', title: 'Catch it before it is gone.', body: 'A title and a few lines is all an idea needs. Move it across the board as it becomes a script, a shoot and an edit.', points: ['Script editor with a built-in teleprompter', 'Drag ideas between stages', 'Series and episode numbers, automatic'], clip: 'ideas' },
  { n: '02', tag: 'Library', title: 'Footage gets a real home.', body: 'Raw footage and edited video, in folders you make, on your own Google Drive. Drag, move, share, rename. Like Drive, built for creators.', points: ['Raw and Edited spaces, nested folders', 'Uploads that resume and verify size', 'Share a folder with your editor'], clip: 'library' },
  { n: '03', tag: 'Hand-off', title: 'Edited file in. Upload out.', body: 'Press Send to Uploads on a finished cut and it becomes a video with a checklist, a date and a place in your pipeline.', points: ['One click from Library to Uploads', 'Many cuts, one marked final', 'Know what is missing before you post'], clip: 'send' },
  { n: '04', tag: 'Review', title: 'Watch it where it lives.', body: 'A player built for reviewing. Stream straight from Drive, pin a note to the exact second, and never open Drive to watch a cut.', points: ['Timestamped review notes', 'Frame-step, speed, picture in picture', 'Resumes where you stopped'], clip: 'player' },
  { n: '05', tag: 'Publish', title: 'Schedule. Copy. Post.', body: 'Upcoming, overdue and published, in one pipeline. Publish mode walks you down the list beside YouTube Studio.', points: ['Calendar with drag-to-schedule', 'Title, description and comment, one tap each', 'Views once it is live'], clip: 'publish' },
]

/** One scene of the reel: a muted, looping screen recording of the real app. Still frame only when the visitor prefers reduced motion. */
function SceneClip({ clip, label }: { clip: string; label: string }) {
  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (still) return <img src={`/app/${clip}.jpg`} alt={`Slate: ${label}`} className="block w-full" loading="lazy" />
  return <video src={`/app/${clip}.mp4`} poster={`/app/${clip}.jpg`} className="block w-full" autoPlay muted loop playsInline preload="metadata" aria-label={`Screen recording of Slate: ${label}`} />
}


const REEL = [
  { clip: 'd2', day: 'DAY 02', title: '50 cold calls, one closed client', note: 'Sales day' },
  { clip: 'd3', day: 'DAY 03', title: '“I’m impressed with your work”', note: 'The prototype meeting' },
  { clip: 'd4', day: 'DAY 04', title: 'A call forwarding issue cost me a prospect', note: 'Saturday at the office' },
  { clip: 'd5', day: 'DAY 05', title: 'I stayed up late and built a working app', note: 'Sunday: the idea behind Slate' },
]

/** One of Rithwik's own Shorts, muted and looping. Plays only while it is on screen; a still frame for reduced motion. */
function ReelVideo({ clip, label }: { clip: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    const el = ref.current
    if (!el || still) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.play().catch(() => {}); else el.pause() }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [still])
  if (still) return <img src={`/demo/${clip}.jpg`} alt={label} className="h-full w-full object-cover" loading="lazy" />
  return <video ref={ref} src={`/demo/${clip}.mp4`} poster={`/demo/${clip}.jpg`} className="h-full w-full object-cover" muted loop playsInline preload="none" aria-label={label} />
}

export default function Landing() {
  const nav = useNavigate()
  const [status, setStatus] = useState('')
  const [scene, setScene] = useState(0)
  const [showPlayer, setShowPlayer] = useState(false)
  const reel = useRef<HTMLElement>(null)
  const playerBox = useRef<HTMLDivElement>(null)
  const clap = useRef<HTMLDivElement>(null)
  const returning = typeof localStorage !== 'undefined' && localStorage.getItem('slate-mode') === 'google'

  useEffect(() => {
    wakeServer() // free hosting can sleep: start waking it while the visitor reads
    const why = new URLSearchParams(location.search).get('auth')
    if (why) {
      toast(why === 'scope' ? 'Slate needs the Google Drive permission to store your videos. Please tick it when you sign in.' : why === 'cancelled' ? 'Sign-in was cancelled.' : 'Sign-in did not complete. Please try again.', 'bad')
      history.replaceState(null, '', '/')
    }
  }, [])

  // One scroll handler: the page-wide playhead, and which scene of the reel is on screen.
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const doc = document.documentElement
      doc.style.setProperty('--p', String(Math.min(1, window.scrollY / Math.max(1, doc.scrollHeight - innerHeight))))
      const r = reel.current
      if (r && window.innerWidth >= 900) {
        const p = Math.min(0.999, Math.max(0, -r.getBoundingClientRect().top / Math.max(1, r.offsetHeight - innerHeight)))
        setScene(Math.floor(p * SCENES.length))
      }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); document.documentElement.style.removeProperty('--p') }
  }, [])

  // Only fetch the video player when the visitor gets near it.
  useEffect(() => {
    const el = playerBox.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShowPlayer(true); io.disconnect() } }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const tilt = (e: React.PointerEvent) => {
    const el = clap.current
    if (!el || e.pointerType !== 'mouse') return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 14}deg`)
    el.style.setProperty('--rx', `${(0.5 - (e.clientY - r.top) / r.height) * 10}deg`)
  }

  const start = async () => {
    if (status) return
    setStatus('Connecting to Google…')
    if (!(await signIn(setStatus))) {
      setStatus('')
      toast('Sign-in is not reachable right now. You can try the demo in the meantime.', 'bad')
    }
  }
  const demo = async () => {
    await useVault.getState().enterDemo()
    nav('/app')
  }
  const cta = (
    <div className="flex flex-wrap items-center gap-3">
      {returning ? <Link to="/app" className="btn btn-primary btn-lg">Open Slate <ArrowRight size={18} /></Link> : <button type="button" className="btn btn-lg !border-paper !bg-paper !text-carbon" onClick={start} disabled={!!status}>{G} Continue with Google</button>}
      <button type="button" className="btn btn-lg !bg-transparent" onClick={demo}>Try the demo</button>
    </div>
  )

  return (
    <div className="landing overflow-x-clip">
      {/* viewfinder overlay: stays on screen the whole way down */}
      <div className="vf" aria-hidden="true">
        <i className="vf-c vf-tl" /><i className="vf-c vf-tr" /><i className="vf-c vf-bl" /><i className="vf-c vf-br" />
        <div className="vf-hud vf-hud-l"><span className="rec" /> <span className="mono">REC</span><span className="mono hidden text-paper/50 sm:inline">· 4K · 24 FPS</span></div>
        <div className="vf-hud vf-hud-r"><Timecode className="mono" /></div>
        <div className="vf-ruler"><i className="vf-playhead" /></div>
      </div>

      <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 px-6 pt-6 md:px-12">
        <a href="#top" aria-label="Slate"><Logo size={22} /></a>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-sm btn-ghost" onClick={demo}>Demo</button>
          {returning ? <Link to="/app" className="btn btn-sm btn-primary">Open</Link> : <button type="button" className="btn btn-sm btn-primary" onClick={start} disabled={!!status}>Sign in</button>}
        </div>
      </header>

      {/* ---------------------------------------------------------------- hero */}
      <section id="top" className="relative grid min-h-dvh items-center gap-10 overflow-hidden px-8 pb-28 pt-28 md:px-20 lg:grid-cols-[1.05fr_1fr]">
        <div className="grain" aria-hidden="true" />
        <div className="relative z-10">
          <p className="label !text-lime">The workspace for creators who post</p>
          <h1 className="display mt-5 text-[clamp(52px,9.6vw,148px)]">
            <span className="hero-line"><span style={{ ['--i' as string]: 0 }}>Ideas in.</span></span>
            <span className="hero-line"><span style={{ ['--i' as string]: 1 }} className="text-lime">Videos out.</span></span>
          </h1>
          <p className="rise mt-7 max-w-xl text-[clamp(16px,1.5vw,20px)] leading-relaxed text-paper/80" style={{ ['--i' as string]: 8 }}>Script it, store the footage, hand the edit to Uploads, review it in a real player, and publish. One workspace, on your own Google Drive. Free.</p>
          <div className="rise mt-8" style={{ ['--i' as string]: 10 }}>{cta}<p className="mono mt-3 min-h-[18px] text-[12px] text-mute" aria-live="polite">{status || 'No card. Your files never touch our servers.'}</p></div>
        </div>

        <div className="relative z-10 grid place-items-center" onPointerMove={tilt} onPointerLeave={() => { clap.current?.style.setProperty('--rx', '0deg'); clap.current?.style.setProperty('--ry', '0deg') }}>
          <div ref={clap} className="clap" role="img" aria-label="A clapperboard reading: Another Day in the Making, scene 6, take 1">
            <div className="clap-flash" />
            <div className="clap-arm"><span /></div>
            <div className="clap-stick"><span /></div>
            <div className="clap-body">
              <div className="clap-row"><label>PROD.</label><b>ANOTHER DAY IN THE MAKING</b></div>
              <div className="clap-grid">
                <div><label>SCENE</label><b>6</b></div><div><label>TAKE</label><b>1</b></div><div><label>ROLL</label><b>A006</b></div>
              </div>
              <div className="clap-row"><label>DIRECTOR</label><b>RITHWIK</b></div>
              <div className="clap-row"><label>DATE</label><b>{new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</b></div>
            </div>
          </div>
        </div>
        <p className="mono absolute bottom-24 left-1/2 hidden -translate-x-1/2 text-[11px] uppercase tracking-[0.3em] text-mute md:block">Scroll to roll</p>
      </section>

      {/* ---------------------------------------------------------------- the reel: five scenes of one workflow */}
      <section ref={reel} className="reel relative" style={{ ['--n' as string]: SCENES.length }} aria-label="How Slate works">
        <div className="reel-stick">
          <div className="mx-auto grid h-full max-w-[1240px] items-center gap-8 px-8 md:px-14 lg:grid-cols-[1fr_1.1fr]">
            <div className="max-w-lg">
              <ol className="mb-6 flex gap-2" aria-label="Scenes">{SCENES.map((s, i) => <li key={s.n}><i className="block h-1 rounded-full transition-all duration-500" style={{ width: i === scene ? 44 : 18, background: i <= scene ? 'var(--color-lime)' : 'var(--color-line2)' }} /></li>)}</ol>
              <div key={scene} className="rise">
                <p className="mono text-[13px] text-lime">{SCENES[scene].n} / 05 · {SCENES[scene].tag.toUpperCase()}</p>
                <h2 className="display mt-3 text-[clamp(34px,5vw,64px)]">{SCENES[scene].title}</h2>
                <p className="mt-4 text-[17px] leading-relaxed text-mute">{SCENES[scene].body}</p>
                <ul className="mt-5 grid gap-2">{SCENES[scene].points.map((p) => <li key={p} className="flex items-center gap-2.5 text-[15px]"><Check size={15} className="shrink-0 text-lime" strokeWidth={3} />{p}</li>)}</ul>
              </div>
            </div>
            <div className="monitor">
              <div className="monitor-bar"><i /><i /><i /><span className="mono">slate · {SCENES[scene].tag.toLowerCase()}</span></div>
              <div key={scene} className="monitor-screen"><SceneClip clip={SCENES[scene].clip} label={SCENES[scene].tag} /></div>
            </div>
          </div>
        </div>
        {/* small screens: no pinning, just the scenes one after another */}
        <div className="grid gap-16 px-8 pb-20 pt-4 lg:hidden">
          {SCENES.map((s) => (
            <article key={s.n} className="grid gap-5">
              <div><p className="mono text-[13px] text-lime">{s.n} / 05 · {s.tag.toUpperCase()}</p><h3 className="display mt-2 text-[34px]">{s.title}</h3><p className="mt-3 text-mute">{s.body}</p></div>
              <div className="monitor"><div className="monitor-bar"><i /><i /><i /><span className="mono">slate · {s.tag.toLowerCase()}</span></div><div className="monitor-screen"><SceneClip clip={s.clip} label={s.tag} /></div></div>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- the real player */}
      <section className="mx-auto max-w-[1240px] px-8 py-28 md:px-14" aria-label="Video player">
        <div className="mb-10 max-w-2xl">
          <p className="label">Try it</p>
          <h2 className="display mt-3 text-[clamp(38px,6vw,84px)]">This is the player. Press play.</h2>
          <p className="mt-4 text-[17px] text-mute">Move the mouse for controls. Double-tap the sides to skip. Press <kbd className="mono rounded border border-line2 px-1.5">?</kbd> for every shortcut. It is the same player you review your own cuts in.</p>
        </div>
        <div ref={playerBox} className="min-h-[300px]">
          {showPlayer && <Suspense fallback={<div className="skeleton aspect-video rounded-[28px]" />}><Player src={{ item: SAMPLE }} url="/sample.mp4" inline autoPlay={false} title="Another Day in the Making · three days, three cuts" /></Suspense>}
        </div>
      </section>


      {/* ---------------------------------------------------------------- his real videos, organised in Slate */}
      <section className="border-t border-line px-8 py-24 md:px-14" aria-label="Videos made with Slate">
        <div className="mx-auto max-w-[1240px]">
          <p className="label">Made with it</p>
          <h2 className="display mt-3 max-w-3xl text-[clamp(34px,5vw,64px)]">Five days. Four Shorts. All of it in here.</h2>
          <p className="mt-4 max-w-2xl text-[17px] text-mute">These are the daily Shorts Slate was built for: script, raw takes, edits and publish kit, kept in one Drive. Rithwik posts one a day.</p>
          <ul className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
            {REEL.map((r) => (
              <li key={r.clip} className="group">
                <div className="reel-card relative aspect-[9/16] overflow-hidden rounded-3xl border border-line bg-coal">
                  <ReelVideo clip={r.clip} label={r.title} />
                  <span className="mono absolute left-3 top-3 rounded-md bg-carbon/80 px-2 py-1 text-[11px] text-lime backdrop-blur">{r.day}</span>
                </div>
                <p className="mt-3 text-[15px] font-semibold leading-snug">{r.title}</p>
                <p className="mono mt-1 text-[11.5px] text-dim">{r.note}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- built for the way you work */}
      <section className="border-t border-line bg-coal px-8 py-28 md:px-14" aria-label="Features">
        <div className="mx-auto max-w-[1240px]">
          <h2 className="display max-w-3xl text-[clamp(38px,6vw,84px)]">Made by someone who posts every day.</h2>
          <div className="mt-14 grid gap-px overflow-hidden rounded-[28px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {[
              [Upload, 'Uploads that survive', 'Big files go up in chunks, resume after a drop, and are size-checked so you know when it is safe to clear your laptop.'],
              [FolderTree, 'Raw and Edited, in order', 'Two spaces, your own folders, drag to move. Everything is a real folder in your Drive.'],
              [Send, 'Send to Uploads', 'One click turns a finished cut into a video with a checklist, a date and a place in the pipeline.'],
              [MessageSquarePlus, 'Notes on the second', 'Pause on a frame and pin what to fix. Review a cut without a spreadsheet of timestamps.'],
              [Lightbulb, 'Idea to script', 'Capture an idea in seconds, write the script beside it, then read it off the teleprompter.'],
              [Share2, 'Share with your editor', 'Give an editor a folder, view or edit. Or a view-only link. Revoke it any time.'],
              [ArrowDownToLine, 'Download anything', 'Every raw clip and every export, from inside the app, with live progress.'],
              [HardDrive, 'Your Drive, only yours', 'Slate sees only what it creates. Nothing else in your Drive is ever listed.'],
            ].map(([Icon, t, b]) => {
              const I = Icon as typeof Upload
              return <div key={t as string} className="feat bg-coal p-7"><I size={22} className="text-lime" /><h3 className="display mt-5 text-[22px]">{t as string}</h3><p className="mt-2 text-[14.5px] leading-relaxed text-mute">{b as string}</p></div>
            })}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- privacy + questions */}
      <section className="mx-auto grid max-w-[1240px] gap-14 px-8 py-28 md:px-14 lg:grid-cols-2" aria-label="Privacy and questions">
        <div>
          <ShieldCheck size={30} className="text-lime" />
          <h2 className="display mt-5 text-[clamp(34px,5vw,64px)]">Your files never touch our servers.</h2>
          <p className="mt-5 text-[17px] leading-relaxed text-mute">Uploads travel from your browser straight to your Google Drive. Slate asks for the narrowest permission Google offers: it can only touch the files and folders it creates. Delete the Slate folder and everything is gone.</p>
        </div>
        <div className="grid content-start gap-3">
          {[['Is it free?', 'Yes. Slate runs on free hosting and uses your own Google storage, so there is nothing to pay Slate.'], ['Where do my videos live?', 'In a Slate folder in your Google Drive, in Raw and Edited folders you can see and organise from Drive too.'], ['Can I try it first?', 'Yes. The demo has sample videos and a working player, and stores nothing outside your browser.'], ['What if I stop using it?', 'Your files stay in your Drive, as normal folders and files. Export your data any time.']].map(([q, a]) => (
            <details key={q} className="faq group rounded-2xl border border-line bg-panel p-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{q}<Plus size={18} className="shrink-0 text-lime transition-transform duration-300 group-open:rotate-45" /></summary><p className="mt-3 text-[15px] leading-relaxed text-mute">{a}</p></details>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- closing */}
      <section className="relative overflow-hidden border-t border-line px-8 pb-12 pt-28 md:px-14">
        <div className="mx-auto max-w-[1240px]">
          <h2 className="display text-[clamp(64px,17vw,260px)] leading-[0.85]">Action<span className="text-lime">.</span></h2>
          <div className="mt-10">{cta}</div>
          <footer className="mt-24 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-[13.5px] text-mute">
            <Logo size={18} />
            <p>Built by <a href="https://rithwikbandi.tech" target="_blank" rel="noreferrer" className="ulink text-paper">Rithwik Bandi</a></p>
            <nav className="flex gap-5" aria-label="Legal"><Link to="/privacy" className="ulink">Privacy</Link><Link to="/terms" className="ulink">Terms</Link></nav>
          </footer>
        </div>
      </section>
    </div>
  )
}
