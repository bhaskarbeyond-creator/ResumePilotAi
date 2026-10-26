import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAiSettingsContext } from '../context/AiSettingsContext';

export function QuotaResetConfirmDialog() {
  const {
    activeDialog,
    closeDialog,
    dialogTarget,
    quotaSaving,
    handleConfirmQuotaReset,
  } = useAiSettingsContext();

  return (
    <>
      {/* 1. Confirm Per-User Quota Reset Dialog */}
      <Dialog
        open={activeDialog === 'confirm-reset-user-quota'}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset User Daily AI Quota</DialogTitle>
            <DialogDescription>
              Clear today&apos;s AI usage count for user{' '}
              <span className="font-mono">{dialogTarget}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={quotaSaving}
              onClick={() => void handleConfirmQuotaReset(false)}
            >
              Confirm Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Confirm Global Quota Reset Dialog */}
      <Dialog
        open={activeDialog === 'confirm-reset-all-quotas'}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset All Daily AI Quotas</DialogTitle>
            <DialogDescription>
              Clear daily AI usage counters for every user across the platform? This operation is
              audited in MariaDB.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={quotaSaving}
              onClick={() => void handleConfirmQuotaReset(true)}
              className="bg-error-600 hover:bg-error-700 text-white"
            >
              Reset All Counters
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
