import { Command } from 'cmdk'
import { Clapperboard, House, Lightbulb, Library, Plus, Send, Settings, Upload } from 'lucide-react'
import { useNavigate } from 'react-router'
import { openNewIdea, openUpload, useUI, videoPath } from '../lib/flow'
import { stageInfo } from '../lib/types'
import { useVault } from '../lib/vault'

const PAGES = [
  { to: '/app', label: 'Home', icon: House },
  { to: '/app/ideas', label: 'Ideas', icon: Lightbulb },
  { to: '/app/library', label: 'Library', icon: Library },
  { to: '/app/uploads', label: 'Uploads', icon: Send },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

/** Cmd/Ctrl+K: jump to any video or page, or start something, without touching the mouse. */
export function Palette() {
  const open = useUI((s) => s.palette)
  const videos = useVault((s) => s.db.videos)
  const spaces = useVault((s) => s.db.spaces)
  const nav = useNavigate()
  const close = () => useUI.setState({ palette: false })
  const go = (to: string) => {
    close()
    nav(to, { viewTransition: true })
  }

  return (
    <Command.Dialog open={open} onOpenChange={(o) => useUI.setState({ palette: o })} label="Search Slate">
      <Command.Input placeholder="Search videos, or jump to a page…" />
      <Command.List>
        <Command.Empty>No match. Try a title or a series name.</Command.Empty>
        <Command.Group heading="Actions">
          <Command.Item onSelect={() => { close(); openNewIdea() }}><Plus size={16} /> New idea</Command.Item>
          {spaces && <Command.Item onSelect={() => { close(); openUpload() }}><Upload size={16} /> Upload files</Command.Item>}
        </Command.Group>
        <Command.Group heading="Go to">
          {PAGES.map((p) => <Command.Item key={p.to} onSelect={() => go(p.to)}><p.icon size={16} /> {p.label}</Command.Item>)}
        </Command.Group>
        {videos.length > 0 && (
          <Command.Group heading="Videos">
            {videos.map((v) => (
              <Command.Item key={v.id} value={`${v.title} ${v.series} ${v.id}`} onSelect={() => go(videoPath(v.id))}>
                <Clapperboard size={16} /><span className="min-w-0 flex-1 truncate">{v.title}</span><span className="mono text-[11px] uppercase text-dim">{stageInfo(v.stage).label}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  )
}
