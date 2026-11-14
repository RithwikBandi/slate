import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Files } from '../components/Files'
import { Button, CopyButton, Modal } from '../components/ui'
import type { Template } from '../lib/types'
import { uid } from '../lib/util'
import { useVault } from '../lib/vault'

const KIND_LABEL: Record<Template['kind'], string> = { description: 'Description block', hashtags: 'Hashtag set', comment: 'Pinned comment' }
const blank = (): Template => ({ id: uid('t'), name: '', kind: 'description', body: '' })

export default function Library() {
  const templates = useVault((s) => s.db.templates)
  const libraryId = useVault((s) => s.db.libraryFolderId)
  const [editing, setEditing] = useState<Template | null>(null)

  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!editing || !editing.name.trim() || !editing.body.trim()) return
    useVault.getState().saveTemplate({ ...editing, name: editing.name.trim() })
    setEditing(null)
  }

  return (
    <div className="grid gap-8">
      <header className="rise">
        <p className="label">Write it once, reuse it on every video</p>
        <h1 className="display mt-2 text-[clamp(32px,4.4vw,48px)]">Library</h1>
      </header>

      <section className="rise" style={{ ['--i' as string]: 1 }} aria-label="Templates">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="display text-[22px]">Templates</h2>
          <Button size="sm" onClick={() => setEditing(blank())}>
            <Plus size={15} strokeWidth={2.6} /> New template
          </Button>
        </div>
        {templates.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => (
              <article key={t.id} className="card flex flex-col p-5 transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-line2">
                <p className="label">{KIND_LABEL[t.kind]}</p>
                <h3 className="display mt-1.5 text-[19px]">{t.name}</h3>
                <p className="mt-2.5 line-clamp-4 flex-1 whitespace-pre-wrap text-[13.5px] text-mute">{t.body}</p>
                <div className="mt-4 flex items-center gap-1.5">
                  <CopyButton text={t.body} label="Copy" what={t.name} />
                  <Button size="sm" icon variant="ghost" aria-label={`Edit ${t.name}`} title="Edit" onClick={() => setEditing(t)}>
                    <Pencil size={15} />
                  </Button>
                  <Button size="sm" icon variant="danger" aria-label={`Delete ${t.name}`} title="Delete" onClick={() => confirm(`Delete the template "${t.name}"?`) && useVault.getState().removeTemplate(t.id)}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="card p-8 text-center text-mute">No templates yet. Save your standard sign-off, link block or hashtag set, then add it to any kit in one click.</p>
        )}
      </section>

      <section className="rise" style={{ ['--i' as string]: 2 }} aria-label="Assets">
        <h2 className="display mb-1 text-[22px]">Assets</h2>
        <p className="mb-3 text-mute">Files you reuse across videos: logo, end card, music, sound effects.</p>
        <div className="card p-4 md:p-5">
          <Files folderId={libraryId} resolveFolder={() => useVault.getState().ensureLibrary()} hint="Stored in a Library folder inside your Slate vault in Drive." />
        </div>
      </section>

      <Modal open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing && templates.some((t) => t.id === editing.id) ? 'Edit template' : 'New template'}>
        {editing && (
          <form onSubmit={save} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tp-name" className="label mb-1.5 block">
                  Name
                </label>
                <input id="tp-name" className="input" autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Series sign-off" maxLength={60} />
              </div>
              <div>
                <label htmlFor="tp-kind" className="label mb-1.5 block">
                  Used for
                </label>
                <select id="tp-kind" className="input" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as Template['kind'] })}>
                  {Object.entries(KIND_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="tp-body" className="label mb-1.5 block">
                Text
              </label>
              <textarea id="tp-body" className="input min-h-[160px]" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={!editing.name.trim() || !editing.body.trim()}>
                Save template
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
