import * as RD from '@radix-ui/react-dialog'
import { Check, Copy, X } from 'lucide-react'
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { stageInfo, type Stage } from '../lib/types'
import { copyText, cx, dismissToast, toast, useToasts } from '../lib/util'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'soft' | 'primary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; icon?: boolean }
export function Button({ variant = 'soft', size = 'md', icon, className, type = 'button', ...rest }: BtnProps) {
  return (
    <button
      type={type}
      className={cx('btn', variant === 'primary' && 'btn-primary', variant === 'ghost' && 'btn-ghost', variant === 'danger' && 'btn-ghost btn-danger', size === 'sm' && 'btn-sm', size === 'lg' && 'btn-lg', icon && 'icon-btn', className)}
      {...rest}
    />
  )
}

/** Copies text, then confirms in place: the icon morphs to a check for a moment. */
export function CopyButton({ text, label, what, className, onCopied }: { text: string; label?: string; what?: string; className?: string; onCopied?: () => void }) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const empty = !text.trim()
  return (
    <button
      type="button"
      disabled={empty}
      aria-label={label ? undefined : `Copy ${what ?? 'text'}`}
      title={empty ? 'Nothing to copy yet' : `Copy ${what ?? 'text'}`}
      className={cx('btn btn-sm', !label && 'icon-btn', done && 'btn-primary', className)}
      onClick={async () => {
        if (!(await copyText(text))) return toast('Your browser blocked copying. Select the text and copy it manually.', 'bad')
        setDone(true)
        onCopied?.()
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setDone(false), 1400)
      }}
    >
      {done ? <Check size={15} strokeWidth={3} /> : <Copy size={15} />}
      {label && <span>{done ? 'Copied' : label}</span>}
    </button>
  )
}

export function Modal({ open, onOpenChange, title, description, wide, children }: { open: boolean; onOpenChange(o: boolean): void; title: string; description?: string; wide?: boolean; children: ReactNode }) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="overlay" />
        <RD.Content className="dialog" data-wide={wide ? '' : undefined}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <RD.Title className="display text-[26px]">{title}</RD.Title>
              {description ? <RD.Description className="mt-1.5 text-mute">{description}</RD.Description> : <RD.Description className="sr-only">{title}</RD.Description>}
            </div>
            <RD.Close asChild>
              <Button variant="ghost" icon aria-label="Close">
                <X size={17} />
              </Button>
            </RD.Close>
          </div>
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}

/** Text field with a live character counter (turns red past the platform limit) and a copy button. */
export function KitField({ label, value, onChange, max, rows = 1, placeholder, hint, mono }: { label: string; value: string; onChange(v: string): void; max?: number; rows?: number; placeholder?: string; hint?: string; mono?: boolean }) {
  const over = max !== undefined && value.length > max
  const id = `f-${label.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between gap-3">
        <label htmlFor={id} className="label">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {max !== undefined && (
            <span className={cx('mono text-[11.5px]', over ? 'text-bad' : value.length > max * 0.9 ? 'text-tape' : 'text-dim')}>
              {value.length.toLocaleString()} / {max.toLocaleString()}
            </span>
          )}
          <CopyButton text={value} what={label.toLowerCase()} />
        </div>
      </div>
      {rows > 1 ? (
        <textarea id={id} className={cx('input', mono && 'mono text-[13px]')} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {over ? <p className="mt-1 text-[12.5px] text-bad">Over the limit by {(value.length - max!).toLocaleString()} characters.</p> : hint ? <p className="mt-1 text-[12.5px] text-dim">{hint}</p> : null}
    </div>
  )
}

export function StagePill({ stage }: { stage: Stage }) {
  return (
    <span className="pill" data-stage={stage}>
      {stageInfo(stage).label}
    </span>
  )
}

/** Circular meter. `value` is 0..1; null means the plan has no fixed limit. */
export function Ring({ value, size = 92, children }: { value: number | null; size?: number; children?: ReactNode }) {
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value ?? 0))
  const color = v > 0.9 ? 'var(--color-bad)' : v > 0.75 ? 'var(--color-tape)' : 'var(--color-lime)'
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset 0.9s var(--ease)' }} />
      </svg>
      <div className="absolute text-center">{children}</div>
    </div>
  )
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-coal text-lime">{icon}</div>
      <h3 className="display text-[22px]">{title}</h3>
      <p className="mt-1.5 max-w-sm text-mute">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Toaster() {
  const list = useToasts((s) => s.list)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast" data-kind={t.kind}>
          {t.kind === 'ok' && <Check size={15} strokeWidth={3} />}
          <span className="min-w-0 truncate">{t.msg}</span>
          {t.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                t.action!.run()
                dismissToast(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <clipPath id="lg-c">
          <rect x="4" y="6" width="56" height="18" rx="6" />
        </clipPath>
        <g clipPath="url(#lg-c)">
          <rect x="4" y="6" width="56" height="18" fill="var(--color-lime)" />
          <path d="M12 6h9l-9 18H3zM30 6h9l-9 18h-9zM48 6h9l-9 18h-9z" fill="var(--color-carbon)" />
        </g>
        <rect x="4" y="29" width="56" height="29" rx="8" fill="var(--color-paper)" />
      </svg>
      <span className="display text-[21px] lowercase" style={{ letterSpacing: '-0.04em' }}>
        slate
      </span>
    </span>
  )
}

export const Spinner = ({ size = 18 }: { size?: number }) => <span className="spin inline-block rounded-full border-2 border-line2 border-t-lime" style={{ width: size, height: size }} role="progressbar" aria-label="Loading" />

export const Skeleton = ({ className }: { className?: string }) => <div className={cx('skeleton', className)} aria-hidden="true" />

/** A row of mutually exclusive options. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange(v: T): void; options: { id: T; label: ReactNode; title?: string }[]; label: string }) {
  return (
    <div className="flex rounded-full border border-line bg-coal p-1" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" title={o.title} aria-selected={value === o.id} className="tab inline-flex !h-8 items-center gap-2" onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Thin film-strip progress bar. */
export const Progress = ({ value, state }: { value: number; state?: string }) => (
  <div className="film" data-state={state}>
    <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, value))})` }} />
  </div>
)

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="mono rounded-md border border-line2 bg-coal px-1.5 py-0.5 text-[11px] text-mute">{children}</kbd>
