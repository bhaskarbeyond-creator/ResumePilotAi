/**
 * Shared presentation primitives for the AI Multi-Provider Engine console.
 *
 * These components render what they are given and nothing else — no default
 * numbers, no implied health. A missing value renders as an explicit
 * "Not reported" state.
 */

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, Info, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Tone = 'ready' | 'degraded' | 'unavailable' | 'unconfigured' | 'unknown' | 'neutral';

const TONE_STYLES: Record<Tone, { chip: string; dot: string; icon: ReactNode }> = {
  ready: {
    chip: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-900',
    dot: 'bg-emerald-500',
    icon: <CheckCircle2 className="size-3.5" aria-hidden="true" />,
  },
  degraded: {
    chip: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-900',
    dot: 'bg-amber-500',
    icon: <AlertTriangle className="size-3.5" aria-hidden="true" />,
  },
  unavailable: {
    chip: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-900',
    dot: 'bg-rose-500',
    icon: <XCircle className="size-3.5" aria-hidden="true" />,
  },
  unconfigured: {
    chip: 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800/70 dark:text-neutral-200 dark:border-neutral-700',
    dot: 'bg-neutral-400',
    icon: <CircleSlash className="size-3.5" aria-hidden="true" />,
  },
  unknown: {
    chip: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/70 dark:text-slate-200 dark:border-slate-700',
    dot: 'bg-slate-400',
    icon: <Info className="size-3.5" aria-hidden="true" />,
  },
  neutral: {
    chip: 'bg-canvas-soft text-ink-secondary border-border',
    dot: 'bg-neutral-400',
    icon: null,
  },
};

export function StatusPill({
  tone = 'neutral',
  children,
  className,
  showDot = true,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  showDot?: boolean;
}) {
  const style = TONE_STYLES[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        style.chip,
        className,
      )}
    >
      {showDot ? <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden="true" /> : style.icon}
      {children}
    </span>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
  testId,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  testId?: string;
}) {
  return (
    <section
      id={id}
      data-testid={testId}
      className={cn(
        'rounded-2xl border border-border bg-surface shadow-xs',
        'transition-shadow duration-200 hover:shadow-sm',
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex flex-col gap-2 border-b border-border/70 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-bold text-ink">{title}</h3>}
            {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('px-4 py-4 sm:px-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
  action,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-center justify-between gap-1">
        <label htmlFor={htmlFor} className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
          {label}
        </label>
        {action}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  id,
  size = 'md',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  id?: string;
  size?: 'sm' | 'md';
}) {
  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const knob = size === 'sm' ? 'size-4' : 'size-5';
  const shift = size === 'sm' ? 'translate-x-4' : 'translate-x-5';
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-200',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        track,
        checked
          ? 'border-brand-600 bg-brand-600'
          : 'border-neutral-300 bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-700',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block rounded-full bg-white shadow-sm transition-transform duration-200',
          knob,
          checked ? shift : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export function InlineAlert({
  tone,
  title,
  children,
  onRetry,
  retryLabel = 'Retry',
  action,
  className,
}: {
  tone: 'info' | 'success' | 'warning' | 'error';
  title?: ReactNode;
  children?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: 'border-info-200 bg-info-50 text-info-700 dark:border-info-700/40 dark:bg-info-950/30 dark:text-info-200',
    success: 'border-success-200 bg-success-50 text-success-700 dark:border-success-700/40 dark:bg-success-950/30 dark:text-success-200',
    warning: 'border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-700/40 dark:bg-warning-950/30 dark:text-warning-200',
    error: 'border-error-200 bg-error-50 text-error-700 dark:border-error-700/40 dark:bg-error-950/30 dark:text-error-200',
  } as const;
  const icons = {
    info: <Info className="size-4 shrink-0" aria-hidden="true" />,
    success: <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />,
    warning: <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />,
    error: <XCircle className="size-4 shrink-0" aria-hidden="true" />,
  } as const;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex flex-col gap-2 rounded-xl border px-3.5 py-3 text-xs sm:flex-row sm:items-start', styles[tone], className)}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {icons[tone]}
        <div className="min-w-0 flex-1">
          {title && <p className="font-bold">{title}</p>}
          {children && <div className="mt-0.5 break-words leading-relaxed opacity-90">{children}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-start">
        {action}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-lg border border-current/25 bg-white/60 px-2.5 py-1 text-[11px] font-bold hover:bg-white dark:bg-white/10 dark:hover:bg-white/20"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center', className)}>
      {icon && <div className="text-ink-subtle" aria-hidden="true">{icon}</div>}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="max-w-md text-xs leading-relaxed text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  const valueTone =
    tone === 'ready'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'degraded'
        ? 'text-amber-700 dark:text-amber-300'
        : tone === 'unavailable'
          ? 'text-rose-700 dark:text-rose-300'
          : 'text-ink';
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-canvas-soft/60 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={cn('mt-0.5 truncate text-base font-extrabold tabular-nums', valueTone)} title={typeof value === 'string' ? value : undefined}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[10px] leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs text-ink-muted', className)}>
      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}

export function formatTime(iso?: string | null): string {
  if (!iso) return 'Not reported';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Not reported';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function relativeTime(iso?: string | null, now = Date.now()): string {
  if (!iso) return 'Not reported';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Not reported';
  const deltaSeconds = Math.round((now - date.getTime()) / 1000);
  if (Math.abs(deltaSeconds) < 5) return 'just now';
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
    ['month', 12],
    ['year', Number.POSITIVE_INFINITY],
  ];
  let value = deltaSeconds;
  for (const [unit, limit] of units) {
    if (Math.abs(value) < limit) return formatter.format(-Math.round(value), unit);
    value = value / limit;
  }
  return formatter.format(-Math.round(value), 'year');
}

/** A single requested fact, never a guess: "—" when the backend did not report it. */
export function valueOrDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}
