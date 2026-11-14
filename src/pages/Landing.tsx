import { ArrowRight, Check, Copy, HardDrive, ShieldCheck, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Logo } from '../components/ui'
import { startShader } from '../landing/shader'
import { signIn, wakeServer } from '../lib/auth'
import { STATUSES } from '../lib/types'
import { toast } from '../lib/util'
import { useVault } from '../lib/vault'

const FAN = [
  { title: 'Why I started', ep: 7, kit: 0 },
  { title: 'A day of rejections', ep: 5, kit: 1 },
  { title: 'Pricing my first site', ep: 4, kit: 3 },
  { title: 'Tools I use daily', ep: 6, kit: 3 },
  { title: 'The prototype meeting', ep: 3, kit: 3 },
]

/** How far apart the fanned cards sit (percent of a card's width), sized so the fan always fits the screen. */
function fanSpread(): number {
  const vw = window.innerWidth
  const card = Math.min(300, vw * 0.62)
  return Math.max(8, Math.round(Math.min(78, ((vw / 2 - 20 - card / 2) / 2 / card) * 100)))
}

const G = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

export default function Landing() {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const nav = useNavigate()
  const [status, setStatus] = useState('')
  const [spread] = useState(fanSpread)
  const returning = typeof localStorage !== 'undefined' && localStorage.getItem('slate-mode') === 'google'

  useEffect(() => {
    wakeServer() // free hosting sleeps: start waking it while the visitor reads
    const why = new URLSearchParams(location.search).get('auth')
    if (why) {
      toast(why === 'scope' ? 'Slate needs the Google Drive permission to store your videos. Please tick it when you sign in.' : why === 'cancelled' ? 'Sign-in was cancelled.' : 'Sign-in did not complete. Please try again.', 'bad')
      history.replaceState(null, '', '/')
    }
    return canvas.current ? startShader(canvas.current) : undefined
  }, [])

  // Scroll choreography. Loaded after first paint so it never delays the hero.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let dead = false
    let cleanup = () => {}
    void (async () => {
      const [{ gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('lenis')])
      if (dead || !root.current) return
      gsap.registerPlugin(ScrollTrigger)
      const lenis = new Lenis({ lerp: 0.12 })
      lenis.on('scroll', ScrollTrigger.update)
      const tick = (time: number) => lenis.raf(time * 1000)
      gsap.ticker.add(tick)
      gsap.ticker.lagSmoothing(0)

      const ctx = gsap.context(() => {
        gsap.to('[data-hero]', { yPercent: -12, opacity: 0.25, ease: 'none', scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true } })
        const spread = fanSpread()
        gsap.utils.toArray<HTMLElement>('.fan-card').forEach((el, i) => {
          const k = i - 2
          gsap.fromTo(
            el,
            { x: 0, xPercent: 0, y: 60, rotation: 0, rotationX: 38, scale: 0.86 },
            { x: 0, xPercent: k * spread, y: Math.abs(k) * 26, rotation: k * 7, rotationX: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: '.fan', start: 'top 92%', end: 'top 28%', scrub: 0.6 } },
          )
        })
        gsap.utils.toArray<HTMLElement>('[data-rise]').forEach((el) => {
          gsap.from(el, { y: 44, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } })
        })
      }, root.current)

      cleanup = () => {
        ctx.revert()
        gsap.ticker.remove(tick)
        lenis.destroy()
      }
    })()
    return () => {
      dead = true
      cleanup()
    }
  }, [])

  const start = async () => {
    if (status) return
    setStatus('Connecting to Google…')
    const ok = await signIn(setStatus)
    if (!ok) {
      setStatus('')
      toast('Sign-in is not reachable right now. You can try the demo in the meantime.', 'bad')
    }
  }
  const demo = async () => {
    await useVault.getState().enterDemo()
    nav('/app')
  }

  const cta = (dark?: boolean) => (
    <div className="flex flex-wrap items-center gap-3">
      {returning ? (
        <Link to="/app" className="btn btn-primary btn-lg">
          Open Slate <ArrowRight size={18} />
        </Link>
      ) : (
        <button type="button" className="btn btn-lg !border-paper !bg-paper !text-carbon" onClick={start} disabled={!!status}>
          {G} Continue with Google
        </button>
      )}
      <button type="button" className={dark ? 'btn btn-lg !border-carbon/30 !bg-transparent !text-carbon hover:!bg-carbon/10' : 'btn btn-lg !bg-transparent'} onClick={demo}>
        Try the demo
      </button>
    </div>
  )

  return (
    <div ref={root} className="overflow-x-clip">
      {/* nav */}
      <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 px-4 py-4 md:px-10">
        <a href="#top" className="nav-pill px-4 py-2.5" aria-label="Slate">
          <Logo size={20} />
        </a>
        <nav className="nav-pill hidden items-center gap-1 px-2 py-1.5 sm:flex" aria-label="Sections">
          <a href="#how" className="btn btn-sm btn-ghost">
            How it works
          </a>
          <a href="#private" className="btn btn-sm btn-ghost">
            Privacy
          </a>
        </nav>
        <div className="nav-pill ml-auto flex items-center gap-1 px-2 py-1.5">
          <button type="button" className="btn btn-sm btn-ghost" onClick={demo}>
            Demo
          </button>
          {returning ? (
            <Link to="/app" className="btn btn-sm btn-primary">
              Open
            </Link>
          ) : (
            <button type="button" className="btn btn-sm btn-primary" onClick={start} disabled={!!status}>
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* hero */}
      <section id="top" className="relative flex min-h-dvh flex-col justify-end overflow-hidden px-5 pb-12 pt-32 md:px-10 md:pb-16">
        <canvas ref={canvas} className="shader" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-carbon to-transparent" />
        <div data-hero className="relative">
          <p className="label rise !text-lime">For creators who post every day</p>
          <h1 className="display mt-5 text-[clamp(52px,11.5vw,168px)]">
            <span className="hero-line">
              <span style={{ ['--i' as string]: 0 }}>Every video,</span>
            </span>
            <span className="hero-line">
              <span style={{ ['--i' as string]: 1 }}>ready to</span>
            </span>
            <span className="hero-line">
              <span style={{ ['--i' as string]: 2 }} className="text-lime">
                publish.
              </span>
            </span>
          </h1>
          <div className="rise mt-8 grid gap-7 md:grid-cols-[minmax(0,460px)_1fr] md:items-end" style={{ ['--i' as string]: 9 }}>
            <p className="text-[clamp(16px,1.5vw,20px)] leading-relaxed text-paper/80">Slate keeps each video's footage, edits and publish kit together in your own Google Drive. Free, and your files never pass through our servers.</p>
            <div className="md:justify-self-end">
              {cta()}
              <p className="mono mt-3 min-h-[18px] text-[12px] text-mute" aria-live="polite">
                {status}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* pipeline fan */}
      <section className="relative overflow-hidden px-5 pb-28 pt-24 md:px-10 md:pt-32">
        <div className="mx-auto max-w-5xl text-center" data-rise>
          <p className="label">One pipeline</p>
          <h2 className="display mt-4 text-[clamp(38px,6.6vw,92px)]">From idea to published.</h2>
          <p className="mx-auto mt-5 max-w-xl text-[17px] text-mute">Each video is a card that carries everything with it. Drag it forward as the work gets done.</p>
        </div>
        <div className="fan relative mx-auto mt-10 h-[460px] max-w-6xl md:h-[520px]">
          {FAN.map((c, i) => {
            const k = i - 2
            const st = STATUSES[i]
            return (
              <article key={c.title} className="fan-card flex flex-col p-5" data-status={st.id} style={{ ['--n' as string]: i, zIndex: 5 - Math.abs(k), transform: `translate(${k * spread}%, ${Math.abs(k) * 26}px) rotate(${k * 7}deg)` }}>
                <div className="plate flex flex-1 items-end justify-between p-4">
                  <span className="display text-[54px] leading-none">#{String(c.ep).padStart(2, '0')}</span>
                </div>
                <span className="pill mt-4 w-fit">{st.label}</span>
                <p className="display mt-2.5 text-[20px] leading-tight">{c.title}</p>
                <div className="mt-3 flex gap-1.5" aria-label={`Kit ${c.kit} of 3`}>
                  {[0, 1, 2].map((n) => (
                    <i key={n} className="h-1.5 flex-1 rounded-full" style={{ background: n < c.kit ? 'var(--st)' : 'var(--color-line2)' }} />
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* how it works: paper sheet */}
      <section id="how" className="sheet bg-paper px-5 pb-32 pt-24 text-carbon md:px-10 md:pt-32">
        <div className="mx-auto max-w-6xl">
          <div data-rise>
            <p className="label !text-carbon/60">How it works</p>
            <h2 className="display mt-4 text-[clamp(38px,6.6vw,92px)]">
              Drop it. Kit it.
              <br />
              Publish it.
            </h2>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            <article data-rise className="flex flex-col rounded-[28px] bg-carbon p-6 text-paper transition-transform duration-500 ease-slate hover:-translate-y-1.5">
              <span className="mono text-[13px] text-lime">01</span>
              <h3 className="display mt-3 text-[30px]">Drop it</h3>
              <p className="mt-2 text-mute">Drag raw footage and exports in. Uploads resume if the connection drops, and Slate checks the size so you know when it is safe to clear your laptop.</p>
              <div className="mt-6 grid gap-3 rounded-2xl border border-line bg-coal p-4">
                {[
                  ['A001_main_take.mov', 1],
                  ['final-v2.mp4', 0.62],
                ].map(([name, v]) => (
                  <div key={name as string}>
                    <p className="mono mb-1.5 flex justify-between text-[11.5px]">
                      <span className="flex items-center gap-1.5">
                        <Upload size={12} className="text-lime" /> {name}
                      </span>
                      <span className="text-dim">{v === 1 ? 'VERIFIED' : '62%'}</span>
                    </p>
                    <div className="film">
                      <i style={{ transform: `scaleX(${v})` }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <article data-rise className="flex flex-col rounded-[28px] bg-carbon p-6 text-paper transition-transform duration-500 ease-slate hover:-translate-y-1.5">
              <span className="mono text-[13px] text-lime">02</span>
              <h3 className="display mt-3 text-[30px]">Kit it</h3>
              <p className="mt-2 text-mute">Title, description, pinned comment and tags live with the video. Counters keep you inside YouTube's limits.</p>
              <div className="mt-6 grid gap-3 rounded-2xl border border-line bg-coal p-4">
                <div>
                  <p className="label mb-1.5 flex justify-between">
                    <span>Title</span>
                    <span className="mono normal-case tracking-normal text-dim">43 / 100</span>
                  </p>
                  <p className="rounded-xl border border-line px-3 py-2 text-[13.5px]">She said “I’m impressed with your work”</p>
                </div>
                <div>
                  <p className="label mb-1.5">Pinned comment</p>
                  <p className="rounded-xl border border-line px-3 py-2 text-[13.5px] text-mute">Decision comes tomorrow. Do you think she says yes?</p>
                </div>
              </div>
            </article>
            <article data-rise className="flex flex-col rounded-[28px] bg-carbon p-6 text-paper transition-transform duration-500 ease-slate hover:-translate-y-1.5">
              <span className="mono text-[13px] text-lime">03</span>
              <h3 className="display mt-3 text-[30px]">Publish it</h3>
              <p className="mt-2 text-mute">Publish mode walks you down the list beside YouTube Studio: download, copy, paste, done.</p>
              <ul className="mt-6 grid gap-2 rounded-2xl border border-line bg-coal p-4 text-[13.5px]">
                {['Download the final', 'Title', 'Description'].map((s, i) => (
                  <li key={s} className="flex items-center gap-3">
                    <span className={`grid h-6 w-6 place-items-center rounded-full ${i < 2 ? 'bg-lime text-carbon' : 'border border-line2 text-mute'}`}>{i < 2 ? <Check size={13} strokeWidth={3} /> : <span className="mono text-[11px]">3</span>}</span>
                    <span className="flex-1">{s}</span>
                    {i > 0 && <Copy size={14} className={i === 1 ? 'text-lime' : 'text-mute'} />}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      {/* privacy: lime sheet */}
      <section id="private" className="sheet bg-lime px-5 pb-32 pt-24 text-carbon md:px-10 md:pt-32">
        <div className="mx-auto max-w-6xl">
          <h2 data-rise className="display max-w-4xl text-[clamp(38px,6.6vw,92px)]">
            Your files never touch our servers.
          </h2>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              { icon: Upload, t: 'Straight to your Drive', b: 'Uploads travel from your browser to Google Drive directly. Slate is never in the middle.' },
              { icon: ShieldCheck, t: 'It only sees its own files', b: 'Slate asks for the narrowest Drive permission: it can touch the files it created, nothing else.' },
              { icon: HardDrive, t: 'No database, no lock-in', b: 'Everything is a folder in your Drive, with a readable kit beside each video. Delete the folder and it is gone.' },
            ].map((f) => (
              <div key={f.t} data-rise className="border-t-2 border-carbon pt-5">
                <f.icon size={26} />
                <h3 className="display mt-4 text-[26px]">{f.t}</h3>
                <p className="mt-2 text-[16px] text-carbon/75">{f.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* closing: carbon sheet */}
      <section className="sheet bg-carbon px-5 pb-10 pt-24 md:px-10 md:pt-32">
        <div className="mx-auto max-w-6xl">
          <div data-rise>
            <h2 className="display text-[clamp(38px,6.6vw,92px)]">
              Start with the video
              <br />
              you are editing now.
            </h2>
            <div className="mt-9">{cta()}</div>
          </div>
          <footer className="mt-24 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-[13.5px] text-mute">
            <Logo size={18} />
            <p>
              Built by{' '}
              <a href="https://rithwikbandi.tech" target="_blank" rel="noreferrer" className="ulink text-paper">
                Rithwik Bandi
              </a>
            </p>
            <nav className="flex gap-5" aria-label="Legal">
              <Link to="/privacy" className="ulink">
                Privacy
              </Link>
              <Link to="/terms" className="ulink">
                Terms
              </Link>
            </nav>
          </footer>
        </div>
      </section>
    </div>
  )
}
