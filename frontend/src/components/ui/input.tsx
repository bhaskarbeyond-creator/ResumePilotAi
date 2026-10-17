/**
 * Input component
 *
 * Accessible text input with error state, icon support, and size variants.
 */

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-lg border bg-surface px-3 py-1.5',
          'text-sm text-ink placeholder:text-ink-muted',
          'transition-colors duration-200',
          'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-500 focus-visible:border-brand-500',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
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
Input.displayName = 'Input';

export { Input };
