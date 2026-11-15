import { CalendarDays, Clapperboard, FileText, Film } from 'lucide-react'
import { useRef, type PointerEvent } from 'react'
import { Link, useViewTransitionState } from 'react-router'
import { readiness, videoPath } from '../lib/flow'
import type { Video } from '../lib/types'
import { cx, relDay, wordCount } from '../lib/util'
import { useFiles } from '../lib/vault'
import { StagePill } from './ui'

/** The tab a video opens on, by where it is in the workflow. */
export const defaultTab = (v: Video) => (v.stage === 'idea' || v.stage === 'script' ? 'script' : v.stage === 'shoot' || v.stage === 'edit' ? 'footage' : 'publish')

/** One video. Tilts toward the pointer; its title morphs into the video page heading on open. */
export function VideoCard({ v, i = 0, compact, draggable }: { v: Video; i?: number; compact?: boolean; draggable?: boolean }) {
  const href = videoPath(v.id, defaultTab(v))
  const opening = useViewTransitionState(href)
  const ref = useRef<HTMLAnchorElement>(null)
  const [thumb, final] = useFiles([v.thumbId, v.finalId])
  const img = (thumb ?? final)?.thumbnailLink
  const r = readiness(v)
  const published = v.stage === 'published'

  const move = (e: PointerEvent) => {
    const el = ref.current
    if (!el || e.pointerType !== 'mouse') return
    const b = el.getBoundingClientRect()
    const x = (e.clientX - b.left) / b.width
    const y = (e.clientY - b.top) / b.height
    el.style.setProperty('--ry', `${(x - 0.5) * 6}deg`)
    el.style.setProperty('--rx', `${(0.5 - y) * 6}deg`)
    el.style.setProperty('--gx', `${x * 100}%`)
    el.style.setProperty('--gy', `${y * 100}%`)
  }
  const leave = () => {
    ref.current?.style.setProperty('--rx', '0deg')
    ref.current?.style.setProperty('--ry', '0deg')
  }

  return (
    <Link
      ref={ref}
      to={href}
      viewTransition
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/slate-video', v.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onPointerMove={move}
      onPointerLeave={leave}
      data-stage={v.stage}
      className={cx('card tilt rise block', compact ? 'p-3.5' : 'p-3')}
      style={{ ['--i' as string]: i }}
    >
      {!compact && (
        <div className="plate mb-3 flex aspect-[16/9] items-end justify-between p-3" style={img ? { backgroundImage: `linear-gradient(to top, rgba(12,13,16,0.85), rgba(12,13,16,0.05) 60%), url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
          <span className="display text-[40px] leading-none text-paper/90">{v.episode ? `#${String(v.episode).padStart(2, '0')}` : <Clapperboard size={30} className="opacity-60" />}</span>
          <StagePill stage={v.stage} />
        </div>
      )}
      <h3 className="display line-clamp-2 text-[18px] leading-[1.12]" style={{ viewTransitionName: opening ? 'slate-title' : undefined }}>
        {v.title}
      </h3>
      {compact && v.pitch && <p className="mt-1.5 line-clamp-2 text-[13px] text-mute">{v.pitch}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-mute">
        {v.publishDate && (
          <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} /> {relDay(v.publishDate)}</span>
        )}
        {compact && wordCount(v.script) > 0 && <span className="inline-flex items-center gap-1.5"><FileText size={13} /> {wordCount(v.script)} words</span>}
        {(v.rawIds.length > 0 || v.editIds.length > 0) && <span className="inline-flex items-center gap-1.5"><Film size={13} /> {v.rawIds.length} raw · {v.editIds.length} cut</span>}
        {!compact && !published && <span className={cx('mono', r.ready && 'text-lime')}>{r.done}/{r.total} ready</span>}
      </div>
      {!compact && v.series && <p className="label mt-2.5 truncate">{v.series}</p>}
    </Link>
  )
}
