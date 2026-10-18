import React from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HelpTooltipProps {
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  label?: string;
}

export function HelpTooltip({
  text,
  position = 'bottom',
  className = '',
  label = 'Help guide',
}: HelpTooltipProps) {
  if (!text) return null;

  return (
    <span
      className={cn(
        'group relative inline-flex items-center text-ink-muted hover:text-ink cursor-help ml-1 align-middle',
        className,
      )}
      role="note"
      aria-label={`${label}: ${text}`}
      tabIndex={0}
    >
      <HelpCircle className="size-3.5 text-ink-muted/80 group-hover:text-ink transition-colors" aria-hidden="true" />
      <span
        className={cn(
          'pointer-events-none absolute z-50 invisible group-hover:visible group-focus:visible opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity duration-150',
          'w-56 p-2 rounded-lg bg-surface-raised border border-edge text-xs text-ink shadow-lg leading-relaxed',
          position === 'top' && 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
          position === 'bottom' && 'top-full left-1/2 -translate-x-1/2 mt-1.5',
          position === 'left' && 'right-full top-1/2 -translate-y-1/2 mr-1.5',
          position === 'right' && 'left-full top-1/2 -translate-y-1/2 ml-1.5',
        )}
      >
        {text}
      </span>
    </span>
  );
}

export default HelpTooltip;
