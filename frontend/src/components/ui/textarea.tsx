/**
 * Textarea component
 *
 * Accessible multi-line text input with error state and size variants.
 */

import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex w-full rounded-lg border bg-surface px-3 py-2',
          'text-sm text-ink placeholder:text-ink-muted',
          'transition-colors duration-200',
          'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-500 focus-visible:border-brand-500',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'resize-none',
          error
            ? 'border-error-500 focus-visible:outline-error-500 focus-visible:border-error-500'
            : 'border-border hover:border-neutral-400',
          className,
        )}
        ref={ref}
        aria-invalid={error || undefined}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };