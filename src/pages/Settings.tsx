import { Download, ExternalLink, HardDrive, LogOut, RotateCcw } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, Ring } from '../components/ui'
import { resetDemo } from '../lib/demo'
import { downloadText, fmtBytes, today } from '../lib/util'
import { driveApi, useVault } from '../lib/vault'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export default function Settings() {
  const profile = useVault((s) => s.profile)
  const mode = useVault((s) => s.mode)
  const quota = useVault((s) => s.quota)
  const db = useVault((s) => s.db)
  const rootId = useVault((s) => s.rootId)
  const nav = useNavigate()
  const used = quota && quota.limit ? quota.used / quota.limit : null

  useEffect(() => {
    void useVault.getState().refreshQuota()
  }, [])

  const leave = async () => {
    await useVault.getState().signOut()
    nav('/', { replace: true })
  }

  return (
    <div className="grid gap-5">
      <header className="rise">
        <p className="label">Account, storage and your data</p>
        <h1 className="display mt-2 text-[clamp(32px,4.4vw,48px)]">Settings</h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card rise p-6" style={{ ['--i' as string]: 1 }} aria-label="Account">
          <p className="label mb-4">Account</p>
          <div className="flex items-center gap-4">
            {profile?.picture ? (
              <img src={profile.picture} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-full" />
            ) : (
              <span className="display grid h-14 w-14 place-items-center rounded-full bg-lime text-[24px] text-carbon">{profile?.name?.[0]?.toUpperCase()}</span>
            )}
            <div className="min-w-0">
              <p className="display truncate text-[22px]">{profile?.name}</p>
              <p className="truncate text-mute">{mode === 'demo' ? 'Demo mode: nothing leaves this browser' : profile?.email}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={leave}>
              <LogOut size={16} /> {mode === 'demo' ? 'Exit demo' : 'Sign out'}
            </Button>
            {mode === 'demo' && (
              <Button
                variant="ghost"
                onClick={() => {
                  if (!confirm('Reset the demo back to its sample videos?')) return
                  resetDemo()
                  void useVault.getState().enterDemo()
                }}
              >
                <RotateCcw size={16} /> Reset demo data
              </Button>
            )}
          </div>
          {mode === 'google' && (
            <p className="mt-4 text-[12.5px] text-dim">
              Signing out revokes Slate's access. Your files stay in your Drive. You can also remove access any time at{' '}
              <a className="ulink text-mute" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
                myaccount.google.com/permissions
              </a>
              .
            </p>
          )}
        </section>

        <section className="card rise p-6" style={{ ['--i' as string]: 2 }} aria-label="Storage">
          <p className="label mb-4">Storage</p>
          <div className="flex items-center gap-5">
            <Ring value={used} size={104}>
              <span className="mono text-[17px] font-semibold">{used === null ? '∞' : `${Math.round(used * 100)}%`}</span>
            </Ring>
            <div className="min-w-0">
              <p className="display text-[26px]">{quota ? fmtBytes(quota.used) : 'Checking…'}</p>
              <p className="text-mute">{quota ? (quota.limit ? `used of ${fmtBytes(quota.limit)}` : 'used, no fixed limit on this plan') : ''}</p>
              <p className="mt-1 text-[12.5px] text-dim">Read live from your Google account. Gmail and Photos count toward it too.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <a className="btn" href="https://one.google.com/storage" target="_blank" rel="noreferrer">
              <HardDrive size={16} /> Manage Google storage
            </a>
            {mode === 'google' && rootId && (
              <a className="btn btn-ghost" href={driveApi().folderUrl(rootId)} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Open vault in Drive
              </a>
            )}
          </div>
        </section>

        <section className="card rise p-6" style={{ ['--i' as string]: 3 }} aria-label="Your data">
          <p className="label mb-4">Your data</p>
          <p className="text-mute">
            {db.projects.length} video{db.projects.length === 1 ? '' : 's'} and {db.templates.length} template{db.templates.length === 1 ? '' : 's'}. Everything lives in the <b className="text-paper">Slate</b> folder in your own Drive; Slate has no database of its own.
          </p>
          <Button className="mt-5" onClick={() => downloadText(`slate-export-${today()}.json`, JSON.stringify(db, null, 2))}>
            <Download size={16} /> Export everything as JSON
          </Button>
        </section>

        <section className="card rise p-6" style={{ ['--i' as string]: 4 }} aria-label="Keyboard shortcuts">
          <p className="label mb-4">Keyboard</p>
          <dl className="grid gap-3 text-[14px]">
            {[
              [isMac ? '⌘ K' : 'Ctrl K', 'Search videos and pages'],
              ['N', 'New video'],
              ['Esc', 'Close any dialog'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4">
                <dt className="text-mute">{v}</dt>
                <dd>
                  <kbd className="mono rounded-lg border border-line2 bg-coal px-2.5 py-1 text-[12.5px]">{k}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <p className="text-[12.5px] text-dim">
        <Link to="/privacy" className="ulink">
          Privacy
        </Link>
        {'  ·  '}
        <Link to="/terms" className="ulink">
          Terms
        </Link>
      </p>
    </div>
  )
}
