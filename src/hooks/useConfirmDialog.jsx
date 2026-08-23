import React, { useCallback, useMemo, useRef, useState } from 'react';
import EnterpriseConfirmModal from '../enterprise/components/EnterpriseConfirmModal';

/**
 * Promise-based confirmation backed by the frozen Enterprise modal.
 *
 * Admin previously called `window.confirm` for destructive operations. That is
 * a native browser dialog: it looks nothing like the product, cannot be styled,
 * is not reachable by the Playwright suite as a normal element, is suppressible
 * by the browser, and blocks the main thread. Enterprise already solved this
 * with EnterpriseConfirmModal, so this reuses that component rather than
 * introducing a second confirmation style.
 *
 * The `confirm()` returned here is a drop-in for `window.confirm` apart from
 * being async, which keeps each call site a one-line change:
 *
 *   if (!(await confirm({ title, message }))) return;
 *
 * `busy` keeps the dialog open and its buttons disabled while the confirmed
 * action runs, so a slow mutation cannot be double-submitted.
 */
export default function useConfirmDialog() {
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const resolverRef = useRef(null);

  const settle = useCallback(result => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    setBusy(false);
    if (resolve) resolve(result);
  }, []);

  const confirm = useCallback(options => {
    // A pending dialog is declined rather than orphaned, so its awaiting caller
    // never hangs.
    if (resolverRef.current) settle(false);

    const config = typeof options === 'string' ? { message: options } : (options || {});
    return new Promise(resolve => {
      resolverRef.current = resolve;
      setDialog({
        title: config.title || 'Confirm action',
        message: config.message || 'Are you sure?',
        confirmLabel: config.confirmLabel || 'Confirm',
        cancelLabel: config.cancelLabel || 'Cancel',
        variant: config.variant || 'danger',
        // When set, the action runs inside the dialog so the user sees progress
        // on the control they just clicked.
        onRun: config.onRun,
      });
    });
  }, [settle]);

  const handleConfirm = useCallback(async () => {
    const run = dialog?.onRun;
    if (typeof run !== 'function') {
      settle(true);
      return;
    }
    setBusy(true);
    try {
      await run();
      settle(true);
    } catch (error) {
      settle(false);
      throw error;
    }
  }, [dialog, settle]);

  const confirmationDialog = useMemo(() => (
    <EnterpriseConfirmModal
      isOpen={Boolean(dialog)}
      title={dialog?.title}
      message={dialog?.message}
      confirmLabel={dialog?.confirmLabel}
      cancelLabel={dialog?.cancelLabel}
      variant={dialog?.variant}
      busy={busy}
      onConfirm={handleConfirm}
      onClose={() => !busy && settle(false)}
    />
  ), [dialog, busy, handleConfirm, settle]);

  return { confirm, confirmationDialog, confirmBusy: busy };
}
