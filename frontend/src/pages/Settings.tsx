import { Download, ExternalLink, HardDrive, LogOut, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, CopyButton, Modal, Ring } from '../components/ui'
import { resetDemo } from '../lib/demo'
import type { Template } from '../lib/types'
import { downloadText, fmtBytes, plural, today, uid } from '../lib/util'
import { driveApi, useVault } from '../lib/vault'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const KIND: Record<Template['kind'], string> = { description: 'Description block', hashtags: 'Hashtag set', comment: 'Pinned comment' }
const blank = (): Template => ({ id: uid('t'), name: '', kind: 'description', body: '' })

export default function Settings() {
  const profile = useVault((s) => s.profile)
  const mode = useVault((s) => s.mode)
  const quota = useVault((s) => s.quota)
  const db = useVault((s) => s.db)
  const nav = useNavigate()
  const [editing, setEditing] = useState<Template | null>(null)
  const used = quota && quota.limit ? quota.used / quota.limit : null

  useEffect(() => {
    void useVault.getState().refreshQuota()
  }, [])

  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!editing || !editing.name.trim() || !editing.body.trim()) return
    useVault.getState().saveTemplate({ ...editing, name: editing.name.trim() })
    setEditing(null)
  }
  const leave = async () => {
    await useVault.getState().signOut()
    nav('/', { replace: true })
  }

  return (
    <div className="grid gap-5">
      <header className="rise">
        <p className="label">Account, storage, snippets and your data</p>
        <h1 className="display mt-2 text-[clamp(32px,4.4vw,48px)]">Settings</h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card rise p-6" style={{ ['--i' as string]: 1 }} aria-label="Account">
          <p className="label mb-4">Account</p>
          <div className="flex items-center gap-4">
            {profile?.picture ? <img src={profile.picture} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-full" /> : <span className="display grid h-14 w-14 place-items-center rounded-full bg-lime text-[24px] text-carbon">{profile?.name?.[0]?.toUpperCase()}</span>}
            <div className="min-w-0"><p className="display truncate text-[22px]">{profile?.name}</p><p className="truncate text-mute">{mode === 'demo' ? 'Demo mode: nothing leaves this browser' : profile?.email}</p></div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={leave}><LogOut size={16} /> {mode === 'demo' ? 'Exit demo' : 'Sign out'}</Button>
            {mode === 'demo' && <Button variant="ghost" onClick={() => { if (!confirm('Reset the demo back to its sample videos and files?')) return; resetDemo(); void useVault.getState().enterDemo() }}><RotateCcw size={16} /> Reset demo data</Button>}
          </div>
          {mode === 'google' && <p className="mt-4 text-[12.5px] text-dim">Signing out revokes Slate's access. Your files stay in your Drive. You can also remove access any time at <a className="ulink text-mute" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>.</p>}
        </section>

        <section className="card rise p-6" style={{ ['--i' as string]: 2 }} aria-label="Storage">
          <p className="label mb-4">Storage</p>
          <div className="flex items-center gap-5">
            <Ring value={used} size={104}><span className="mono text-[17px] font-semibold">{used === null ? '∞' : `${Math.round(used * 100)}%`}</span></Ring>
            <div className="min-w-0"><p className="display text-[26px]">{quota ? fmtBytes(quota.used) : 'Checking…'}</p><p className="text-mute">{quota ? (quota.limit ? `used of ${fmtBytes(quota.limit)}` : 'used, no fixed limit on this plan') : ''}</p><p className="mt-1 text-[12.5px] text-dim">Read live from your Google account. Gmail and Photos count toward it too.</p></div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <a className="btn" href="https://one.google.com/storage" target="_blank" rel="noreferrer"><HardDrive size={16} /> Manage Google storage</a>
            {mode === 'google' && db.spaces && <a className="btn btn-ghost" href={driveApi().folderUrl(db.spaces.root)} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open vault in Drive</a>}
          </div>
        </section>
      </div>

      <section className="card rise p-6" style={{ ['--i' as string]: 3 }} aria-label="Snippets">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="display text-[22px]">Snippets</h2><p className="text-[13.5px] text-mute">Sign-offs, link blocks and hashtag sets. Add them to any video's kit in one click.</p></div>
          <Button size="sm" onClick={() => setEditing(blank())}><Plus size={15} strokeWidth={2.6} /> New snippet</Button>
        </div>
        {db.templates.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {db.templates.map((t) => (
              <article key={t.id} className="flex flex-col rounded-2xl border border-line bg-coal p-4">
                <p className="label">{KIND[t.kind]}</p><h3 className="display mt-1.5 text-[18px]">{t.name}</h3>
                <p className="mt-2 line-clamp-3 flex-1 whitespace-pre-wrap text-[13.5px] text-mute">{t.body}</p>
                <div className="mt-3 flex items-center gap-1.5"><CopyButton text={t.body} label="Copy" what={t.name} /><Button size="sm" icon variant="ghost" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}><Pencil size={15} /></Button><Button size="sm" icon variant="danger" aria-label={`Delete ${t.name}`} onClick={() => confirm(`Delete the snippet "${t.name}"?`) && useVault.getState().removeTemplate(t.id)}><Trash2 size={15} /></Button></div>
              </article>
            ))}
          </div>
        ) : <p className="rounded-xl bg-coal p-6 text-center text-mute">No snippets yet.</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card rise p-6" style={{ ['--i' as string]: 4 }} aria-label="Your data">
          <p className="label mb-4">Your data</p>
          <p className="text-mute">{plural(db.videos.length, 'video')} and {plural(db.templates.length, 'snippet')}. Everything lives in the <b className="text-paper">Slate</b> folder in your own Drive; Slate has no database of its own.</p>
          <Button className="mt-5" onClick={() => downloadText(`slate-export-${today()}.json`, JSON.stringify(db, null, 2))}><Download size={16} /> Export everything as JSON</Button>
        </section>
        <section className="card rise p-6" style={{ ['--i' as string]: 5 }} aria-label="Keyboard shortcuts">
          <p className="label mb-4">Keyboard</p>
          <dl className="grid gap-3 text-[14px]">
            {[[isMac ? '⌘ K' : 'Ctrl K', 'Search videos and pages'], ['N', 'New idea'], ['U', 'Upload files'], ['Esc', 'Close any dialog'], ['?', 'Shortcuts inside the video player']].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4"><dt className="text-mute">{v}</dt><dd><kbd className="mono rounded-lg border border-line2 bg-coal px-2.5 py-1 text-[12.5px]">{k}</kbd></dd></div>
            ))}
          </dl>
        </section>
      </div>

      <p className="text-[12.5px] text-dim"><Link to="/privacy" className="ulink">Privacy</Link>{'  ·  '}<Link to="/terms" className="ulink">Terms</Link></p>

      <Modal open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing && db.templates.some((t) => t.id === editing.id) ? 'Edit snippet' : 'New snippet'}>
        {editing && (
          <form onSubmit={save} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="tp-name" className="label mb-1.5 block">Name</label><input id="tp-name" className="input" autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Series sign-off" maxLength={60} /></div>
              <div><label htmlFor="tp-kind" className="label mb-1.5 block">Used for</label><select id="tp-kind" className="input" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as Template['kind'] })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            </div>
            <div><label htmlFor="tp-body" className="label mb-1.5 block">Text</label><textarea id="tp-body" className="input min-h-[160px]" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} /></div>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" type="submit" disabled={!editing.name.trim() || !editing.body.trim()}>Save snippet</Button></div>
          </form>
        )}
      </Modal>
    </div>
  )
}
