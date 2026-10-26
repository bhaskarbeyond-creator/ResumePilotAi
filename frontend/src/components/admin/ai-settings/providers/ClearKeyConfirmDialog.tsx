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

export function ClearKeyConfirmDialog() {
  const { activeDialog, closeDialog, dialogTarget, saving, handleConfirmClearKey } =
    useAiSettingsContext();

  return (
    <Dialog
      open={activeDialog === 'confirm-clear-key'}
      onOpenChange={(open) => !open && closeDialog()}
    >
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove Stored API Key</DialogTitle>
          <DialogDescription>
            Permanently delete the server-stored API key for{' '}
            <strong className="text-ink">{dialogTarget}</strong> from MariaDB? Any active requests
            will fail over to secondary providers.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void handleConfirmClearKey()}
            className="bg-error-600 hover:bg-error-700 text-white"
          >
            Remove Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
