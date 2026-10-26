/**
 * Sign-out confirmation.
 *
 * ## Why a confirmation exists for signing out
 *
 * Signing out of this app is not a reversible, cost-free action: a preview session is destroyed
 * (`clearPreviewSession`), unsaved drafts in the editors are gone, and the person has to complete
 * the whole sign-in flow again — including, for an operator with MFA enrolled, a second factor.
 * The previous behaviour signed out on a single `onSelect` from a dropdown, which is one
 * mistimed arrow key away from losing work.
 *
 * ## Keyboard contract (asserted in `tests/session-lifecycle.spec.ts`)
 *
 * Focus moves into the dialog on open, `Tab` cycles within it, `Escape` cancels **and returns
 * focus to the menu item that opened it** (Radix restores focus to the trigger on close), and the
 * destructive action is *not* the initial focus — so `Enter` cannot sign someone out by accident.
 *
 * @module components/auth/logout-confirm-dialog
 */

import { useState, type ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface LogoutConfirmDialogProps {
  /** Runs the actual sign-out. The dialog closes before it is called, so a failure cannot trap the UI. */
  onConfirm: () => void | Promise<void>;
  /** The control that opens the dialog — a menu item renders `<span>` content, so this is a node. */
  children: ReactNode;
  /** Where the confirmation is opened from, for diagnostics in the test output. */
  triggerLabel?: string;
}

export function LogoutConfirmDialog({ onConfirm, children, triggerLabel = 'Sign out' }: LogoutConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    setOpen(false);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md" data-testid="logout-confirm-dialog" aria-describedby="logout-confirm-description">
        <DialogHeader>
          <DialogTitle>Sign out of IME365?</DialogTitle>
          <DialogDescription id="logout-confirm-description">
            You will need to sign in again. Anything you have not saved will be lost.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          {/* Cancel is first in DOM order, so it is what `Enter` reaches first and what the
           * dialog focuses on open. The destructive action is deliberate, not reflexive. */}
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Stay signed in
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy} data-testid="logout-confirm">
            {busy ? 'Signing out…' : triggerLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
