import { Globe, Link2, Trash2, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useUI } from '../lib/flow'
import type { Permission } from '../lib/types'
import { copyText, toast } from '../lib/util'
import { driveApi } from '../lib/vault'
import { Button, Modal, Skeleton } from './ui'

/** Share a file or folder with an editor: by email (viewer or editor), or with a view-only link. */
export function ShareDialog() {
  const item = useUI((s) => s.share)
  const [perms, setPerms] = useState<Permission[] | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'reader' | 'writer'>('writer')
  const [busy, setBusy] = useState(false)
  const close = () => useUI.setState({ share: null })

  const load = useCallback(async () => {
    if (!item) return
    try {
      setPerms(await driveApi().permissions(item.id))
    } catch (e) {
      setPerms([])
      toast(`Could not load sharing: ${(e as Error).message}`, 'bad')
    }
  }, [item])

  useEffect(() => {
    setPerms(null)
    setEmail('')
    void load()
  }, [load])

  const link = item ? (item.kind === 'folder' ? driveApi().folderUrl(item.id) : (item.webViewLink ?? `https://drive.google.com/file/d/${item.id}/view`)) : ''
  const anyone = perms?.find((p) => p.type === 'anyone')

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      await load()
      toast(ok)
    } catch (e) {
      toast(`Sharing failed: ${(e as Error).message}`, 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={item !== null} onOpenChange={(o) => !o && close()} title={item ? `Share "${item.name}"` : 'Share'} description={item?.kind === 'folder' ? 'Everyone you add can see everything in this folder, including files you add later.' : 'Give an editor access to this file.'}>
      {item && (
        <div className="grid gap-5">
          <form
            className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              if (!email.trim()) return
              void run(() => driveApi().share(item.id, { type: 'user', role, email: email.trim() }), `Shared with ${email.trim()}`).then(() => setEmail(''))
            }}
          >
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Editor's Google email" aria-label="Email address" />
            <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value as 'reader' | 'writer')} aria-label="Access level">
              <option value="writer">Can edit</option>
              <option value="reader">Can view</option>
            </select>
            <Button variant="primary" type="submit" disabled={busy || !email.trim()}><UserPlus size={16} /> Share</Button>
          </form>

          <section aria-label="People with access">
            <p className="label mb-2">People with access</p>
            {perms === null ? (
              <div className="grid gap-2"><Skeleton className="h-11" /><Skeleton className="h-11" /></div>
            ) : (
              <ul className="grid gap-1">
                {perms.filter((p) => p.type === 'user').map((p) => (
                  <li key={p.id} className="row flex items-center gap-3 rounded-xl px-3 py-2">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-raise text-[13px] font-bold uppercase">{(p.name ?? p.email ?? '?')[0]}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{p.name ?? p.email}</span>{p.email && p.name && p.email !== p.name && <span className="block truncate text-[12.5px] text-dim">{p.email}</span>}</span>
                    <span className="mono text-[12px] uppercase text-mute">{p.role === 'owner' ? 'Owner' : p.role === 'writer' ? 'Editor' : 'Viewer'}</span>
                    {p.role !== 'owner' && (
                      <button type="button" className="text-dim hover:text-bad" aria-label={`Remove ${p.email ?? p.name}`} disabled={busy} onClick={() => void run(() => driveApi().unshare(item.id, p.id), 'Access removed')}><Trash2 size={16} /></button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-coal p-4" aria-label="Link access">
            <div className="flex items-center gap-3">
              <Globe size={20} className={anyone ? 'text-lime' : 'text-mute'} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Anyone with the link can view</p>
                <p className="text-[12.5px] text-dim">{anyone ? 'Switched on. Anyone who has the link can watch and download.' : 'Off. Only people you added above can open it.'}</p>
              </div>
              <Button size="sm" disabled={busy || perms === null} onClick={() => void run(() => (anyone ? driveApi().unshare(item.id, anyone.id) : driveApi().share(item.id, { type: 'anyone', role: 'reader' })), anyone ? 'Link sharing off' : 'Link sharing on')}>
                {anyone ? 'Turn off' : 'Turn on'}
              </Button>
            </div>
          </section>

          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={async () => toast((await copyText(link)) ? 'Link copied' : link)}><Link2 size={16} /> Copy link</Button>
            <Button variant="primary" onClick={close}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
