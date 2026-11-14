import { Command } from 'cmdk'
import { CalendarDays, Clapperboard, House, Library, Plus, Settings } from 'lucide-react'
import { useNavigate } from 'react-router'
import { STATUSES } from '../lib/types'
import { useVault } from '../lib/vault'
import { useUI } from './ui'

const PAGES = [
  { to: '/app', label: 'Home', icon: House },
  { to: '/app/videos', label: 'Videos', icon: Clapperboard },
  { to: '/app/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/app/library', label: 'Library', icon: Library },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

/** Cmd/Ctrl+K: jump to any video or page without touching the mouse. */
export function Palette() {
  const open = useUI((s) => s.palette)
  const projects = useVault((s) => s.db.projects)
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
          <Command.Item
            onSelect={() => {
              close()
              useUI.setState({ newVideo: true })
            }}
          >
            <Plus size={16} /> New video
          </Command.Item>
        </Command.Group>
        <Command.Group heading="Go to">
          {PAGES.map((p) => (
            <Command.Item key={p.to} onSelect={() => go(p.to)}>
              <p.icon size={16} /> {p.label}
            </Command.Item>
          ))}
        </Command.Group>
        {projects.length > 0 && (
          <Command.Group heading="Videos">
            {projects.map((p) => (
              <Command.Item key={p.id} value={`${p.title} ${p.series} ${p.id}`} onSelect={() => go(`/app/v/${p.id}`)}>
                <Clapperboard size={16} />
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <span className="mono text-[11px] uppercase text-dim">{STATUSES.find((s) => s.id === p.status)?.label}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  )
}
