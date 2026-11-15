import { ChevronRight, Folder, FolderPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useUI } from '../lib/flow'
import { SPACES, type DriveItem, type SpaceId } from '../lib/types'
import { cx, plural } from '../lib/util'
import { useVault } from '../lib/vault'
import { Button, Modal, Skeleton } from './ui'

export interface PickerRoot {
  id: string
  space: SpaceId
  label: string
}

/** Browse folders and choose one. Calls onChange with the current folder every time it changes. */
export function FolderPicker({ roots, initial, exclude, onChange, height = 240 }: { roots: PickerRoot[]; initial?: string; exclude?: Set<string>; onChange(folderId: string, root: PickerRoot): void; height?: number }) {
  const [rootIdx, setRootIdx] = useState(Math.max(0, roots.findIndex((r) => r.id === initial)))
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const root = roots[rootIdx] ?? roots[0]
  const current = trail[trail.length - 1]?.id ?? root.id
  const listing = useVault((s) => s.listings[current])
  const busy = useVault((s) => s.busy[current])

  useEffect(() => {
    void useVault.getState().loadFolder(current)
    onChange(current, root)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, root.id])

  const folders = useMemo(() => (listing?.items ?? []).filter((i) => i.kind === 'folder' && !exclude?.has(i.id)), [listing, exclude])

  const create = async () => {
    if (!name.trim()) return
    const f = await useVault.getState().createFolder(current, name)
    setName('')
    setAdding(false)
    if (f) setTrail((t) => [...t, { id: f.id, name: f.name }])
  }

  return (
    <div>
      {roots.length > 1 && (
        <div className="mb-3 flex gap-1.5" role="tablist" aria-label="Library space">
          {roots.map((r, i) => (
            <button key={r.id} type="button" role="tab" aria-selected={i === rootIdx} className={cx('btn btn-sm', i === rootIdx ? 'btn-primary' : 'btn-ghost')} onClick={() => { setRootIdx(i); setTrail([]) }}>
              {r.label}
            </button>
          ))}
        </div>
      )}
      <nav className="mono mb-2 flex flex-wrap items-center gap-1 text-[12.5px] text-mute" aria-label="Folder path">
        <button type="button" className="rounded-md px-1.5 py-0.5 hover:bg-raise hover:text-paper" onClick={() => setTrail([])}>{root.label}</button>
        {trail.map((t, i) => (
          <span key={t.id} className="flex items-center gap-1">
            <ChevronRight size={12} />
            <button type="button" className="rounded-md px-1.5 py-0.5 hover:bg-raise hover:text-paper" onClick={() => setTrail(trail.slice(0, i + 1))}>{t.name}</button>
          </span>
        ))}
      </nav>
      <div className="overflow-auto rounded-2xl border border-line bg-coal p-1.5" style={{ height }}>
        {!listing && busy ? (
          <div className="grid gap-1.5"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : folders.length === 0 ? (
          <p className="grid h-full place-items-center px-4 text-center text-[13.5px] text-dim">No folders in here. You can upload to this folder, or make one below.</p>
        ) : (
          <ul>
            {folders.map((f) => (
              <li key={f.id}>
                <button type="button" className="row flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left" onClick={() => setTrail([...trail, { id: f.id, name: f.name }])}>
                  <Folder size={18} className="text-lime" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <ChevronRight size={15} className="text-dim" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {adding ? (
          <form className="flex flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); void create() }}>
            <input className="input h-9 py-0" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="New folder name" aria-label="New folder name" maxLength={80} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
            <Button size="sm" type="submit" disabled={!name.trim()}>Create</Button>
          </form>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}><FolderPlus size={15} /> New folder here</Button>
        )}
      </div>
    </div>
  )
}

/** Move one or more library items into another folder. */
export function MoveDialog() {
  const items = useUI((s) => s.move)
  const spaces = useVault((s) => s.db.spaces)
  const [target, setTarget] = useState<string | null>(null)
  const [targetLabel, setTargetLabel] = useState('')
  const close = () => useUI.setState({ move: null })

  const roots: PickerRoot[] = spaces ? SPACES.map((s) => ({ id: spaces[s.id], space: s.id, label: s.label })) : []
  const exclude = useMemo(() => new Set((items ?? []).filter((i) => i.kind === 'folder').map((i) => i.id)), [items])
  const startIn = items?.[0]?.parent && roots.find((r) => r.id === items[0].parent)?.id

  return (
    <Modal open={items !== null} onOpenChange={(o) => !o && close()} title={items ? `Move ${items.length === 1 ? `"${items[0].name}"` : plural(items.length, 'item')}` : 'Move'} description="Choose where it should go. Folders you open here are real folders in your Drive.">
      {items && roots.length > 0 && (
        <>
          <FolderPicker roots={roots} initial={startIn || roots[0].id} exclude={exclude} onChange={(id, r) => { setTarget(id); setTargetLabel(r.label) }} />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!target || items.every((i) => i.parent === target)}
              onClick={() => {
                void useVault.getState().moveItems(items as DriveItem[], target!)
                close()
              }}
            >
              Move here{targetLabel ? ` (${targetLabel})` : ''}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
