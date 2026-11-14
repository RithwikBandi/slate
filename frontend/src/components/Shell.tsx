import { CalendarDays, Clapperboard, CloudAlert, House, Library, Plus, Search, Settings } from 'lucide-react'
import { Suspense, useEffect } from 'react'
import { Link, NavLink, Navigate, Outlet } from 'react-router'
import { signIn } from '../lib/auth'
import { cx, toast } from '../lib/util'
import { useVault } from '../lib/vault'
import { NewVideo } from './NewVideo'
import { Palette } from './Palette'
import { UploadTray } from './UploadTray'
import { Button, Logo, useUI } from './ui'

const NAV = [
  { to: '/app', label: 'Home', icon: House, end: true },
  { to: '/app/videos', label: 'Videos', icon: Clapperboard },
  { to: '/app/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/app/library', label: 'Library', icon: Library },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

function Splash({ label }: { label: string }) {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="text-center">
        <div className="mx-auto mb-5 h-9 w-9 rounded-full border-[3px] border-line border-t-lime spin" />
        <p className="label">{label}</p>
      </div>
    </div>
  )
}

export default function Shell() {
  const phase = useVault((s) => s.phase)
  const mode = useVault((s) => s.mode)
  const profile = useVault((s) => s.profile)
  const saving = useVault((s) => s.saving)
  const error = useVault((s) => s.error)

  useEffect(() => {
    void useVault.getState().boot()
  }, [])

  // Shortcuts: Cmd/Ctrl+K opens search; N starts a video (unless you are typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useUI.setState((s) => ({ palette: !s.palette }))
        return
      }
      const t = e.target as HTMLElement
      const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'n' && !useUI.getState().palette) {
        e.preventDefault()
        useUI.setState({ newVideo: true })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (phase === 'signedOut') return <Navigate to="/" replace />
  if (phase === 'error')
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="card max-w-md p-8 text-center">
          <CloudAlert size={30} className="mx-auto mb-4 text-bad" />
          <h1 className="display text-[26px]">Could not open your vault</h1>
          <p className="mt-2 text-mute">{error || 'Google Drive did not respond.'}</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="primary" onClick={() => useVault.getState().retry()}>
              Try again
            </Button>
            <Button onClick={() => useVault.getState().signOut()}>Sign out</Button>
          </div>
        </div>
      </div>
    )
  if (phase !== 'ready') return <Splash label={mode === 'demo' ? 'Loading the demo' : 'Opening your vault'} />

  const saveLabel = saving === 'saving' ? 'Saving…' : saving === 'error' ? 'Not saved' : saving === 'saved' ? (mode === 'demo' ? 'Saved in this browser' : 'Saved to Drive') : ''

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[236px_1fr]">
      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-coal px-3 py-5 md:flex">
        <Link to="/app" viewTransition className="mb-7 px-2.5" aria-label="Slate home">
          <Logo />
        </Link>
        <nav className="grid gap-1" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} viewTransition className={({ isActive }) => cx('rail-link', isActive && 'active')}>
              <n.icon size={18} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">
          <Link to="/app/settings" viewTransition className="flex items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-panel">
            {profile?.picture ? (
              <img src={profile.picture} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-lime font-bold text-carbon">{profile?.name?.[0]?.toUpperCase() ?? 'S'}</span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-semibold">{profile?.name}</span>
              <span className="block truncate text-[11.5px] text-dim">{mode === 'demo' ? 'Demo mode' : profile?.email}</span>
            </span>
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        {mode === 'demo' && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-tape px-4 py-1.5 text-center text-[13px] font-semibold text-carbon">
            <span>Demo mode: sample videos, stored only in this browser. Nothing is uploaded.</span>
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={async () => {
                if (!(await signIn((m) => toast(m, 'info')))) toast('Sign-in is not reachable right now. Please try again in a minute.', 'bad')
              }}
            >
              Use my Google Drive
            </button>
          </div>
        )}
        <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-line bg-carbon/85 px-4 py-3 backdrop-blur-md md:px-8">
          <Link to="/app" className="md:hidden" aria-label="Slate home">
            <Logo size={20} />
          </Link>
          <button
            type="button"
            onClick={() => useUI.setState({ palette: true })}
            className="input ml-auto flex h-10 w-auto min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-0 text-left text-dim md:ml-0 md:max-w-md"
            aria-label="Search videos and pages"
          >
            <Search size={16} />
            <span className="truncate">Search videos…</span>
            <kbd className="mono ml-auto hidden rounded-md border border-line px-1.5 py-0.5 text-[11px] sm:block">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
          <span className={cx('mono hidden text-[11.5px] lg:block', saving === 'error' ? 'text-bad' : 'text-dim')} aria-live="polite">
            {saveLabel}
          </span>
          <Button variant="primary" className="md:ml-auto" onClick={() => useUI.setState({ newVideo: true })}>
            <Plus size={17} strokeWidth={2.6} /> <span className="hidden sm:inline">New video</span>
          </Button>
        </header>

        <main className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8">
          <Suspense fallback={<div className="skeleton h-48" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-coal/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} viewTransition className={({ isActive }) => cx('grid place-items-center gap-0.5 py-2.5 text-[10.5px] font-semibold', isActive ? 'text-lime' : 'text-mute')}>
            <n.icon size={20} />
            {n.label}
          </NavLink>
        ))}
      </nav>

      <UploadTray />
      <Palette />
      <NewVideo />
    </div>
  )
}
