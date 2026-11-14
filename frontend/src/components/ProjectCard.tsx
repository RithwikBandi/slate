import { BadgeCheck, CalendarDays } from 'lucide-react'
import { useRef, type PointerEvent } from 'react'
import { Link, useViewTransitionState } from 'react-router'
import type { Project } from '../lib/types'
import { cx, relDay } from '../lib/util'
import { StatusPill } from './ui'

export const kitProgress = (p: Project) => [p.kit.title, p.kit.description, p.kit.pinnedComment].filter((s) => s.trim()).length

/** One video. Tilts toward the pointer; its title morphs into the detail page heading on open. */
export function ProjectCard({ p, i = 0, compact, draggable }: { p: Project; i?: number; compact?: boolean; draggable?: boolean }) {
  const href = `/app/v/${p.id}`
  const opening = useViewTransitionState(href)
  const ref = useRef<HTMLAnchorElement>(null)

  const move = (e: PointerEvent) => {
    const el = ref.current
    if (!el || e.pointerType !== 'mouse') return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--ry', `${(x - 0.5) * 7}deg`)
    el.style.setProperty('--rx', `${(0.5 - y) * 7}deg`)
    el.style.setProperty('--gx', `${x * 100}%`)
    el.style.setProperty('--gy', `${y * 100}%`)
  }
  const leave = () => {
    ref.current?.style.setProperty('--rx', '0deg')
    ref.current?.style.setProperty('--ry', '0deg')
  }
  const kit = kitProgress(p)

  return (
    <Link
      ref={ref}
      to={href}
      viewTransition
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/slate-project', p.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onPointerMove={move}
      onPointerLeave={leave}
      data-status={p.status}
      className={cx('card tilt rise block', compact ? 'p-3' : 'p-3.5')}
      style={{ ['--i' as string]: i }}
    >
      {!compact && (
        <div className="plate mb-3.5 flex aspect-[16/9] items-end justify-between p-3.5">
          <span className="display text-[44px] leading-none text-paper/90">{p.episode ? `#${String(p.episode).padStart(2, '0')}` : '·'}</span>
          <StatusPill status={p.status} />
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <h3 className="display line-clamp-2 text-[18px] leading-[1.12]" style={{ viewTransitionName: opening ? 'slate-title' : undefined }}>
          {p.title}
        </h3>
        {compact && <span className="mono mt-0.5 shrink-0 text-[12px] text-dim">{p.episode ? `#${p.episode}` : ''}</span>}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-mute">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays size={13} /> {relDay(p.publishDate)}
        </span>
        <span className={cx('mono', kit === 3 && 'text-lime')}>Kit {kit}/3</span>
        {p.finalFileId && (
          <span className="inline-flex items-center gap-1 text-lime" title="A final export is in Drive">
            <BadgeCheck size={13} /> Final
          </span>
        )}
      </div>
      {!compact && p.series && <p className="label mt-2.5 truncate">{p.series}</p>}
    </Link>
  )
}
