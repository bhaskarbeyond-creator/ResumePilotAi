import React, { useEffect } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EnterpriseConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function EnterpriseConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  busy = false,
  onConfirm,
  onClose,
}: EnterpriseConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, busy, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface-raised border border-edge shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-edge bg-surface/50">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'size-9 rounded-xl flex items-center justify-center shrink-0',
                variant === 'danger' && 'bg-rose-500/10 text-rose-500',
                variant === 'warning' && 'bg-amber-500/10 text-amber-500',
                variant === 'primary' && 'bg-accent/10 text-accent',
              )}
            >
              {variant === 'danger' || variant === 'warning' ? (
                <AlertTriangle className="size-5" />
              ) : (
                <Info className="size-5" />
              )}
            </div>
            <h3 id="confirm-dialog-title" className="text-base font-bold text-ink">
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="p-1.5 text-ink-muted hover:text-ink rounded-lg transition-colors"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-6 text-sm text-ink-muted leading-relaxed">
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 bg-surface/50 border-t border-edge">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={variant === 'danger' ? 'destructive' : 'primary'}
            onClick={() => onConfirm()}
            disabled={busy}
          >
            {busy ? 'Processing…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default EnterpriseConfirmModal;
