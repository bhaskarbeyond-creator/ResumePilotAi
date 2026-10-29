import { CheckCircle2, Clock, RotateCcw, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface InvoiceStatusBadgeProps {
  status: string;
  className?: string;
}

export function InvoiceStatusBadge({ status, className }: InvoiceStatusBadgeProps) {
  const normalized = (status || 'ISSUED').trim().toUpperCase();

  if (normalized === 'PAID') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
          className,
        )}
      >
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
        <span>PAID</span>
      </span>
    );
  }

  if (normalized === 'REFUNDED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200',
          className,
        )}
      >
        <RotateCcw className="size-3.5 shrink-0" aria-hidden="true" />
        <span>REFUNDED</span>
      </span>
    );
  }

  if (normalized === 'ISSUED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
          className,
        )}
      >
        <Clock className="size-3.5 shrink-0" aria-hidden="true" />
        <span>ISSUED</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-ink dark:bg-neutral-800',
        className,
      )}
    >
      <FileText className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{normalized}</span>
    </span>
  );
}
