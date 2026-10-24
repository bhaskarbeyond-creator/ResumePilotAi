import { useAiSettingsContext } from '../context/AiSettingsContext';

export function useDialogUrlSync() {
  const { activeDialog, dialogTarget, openDialog, closeDialog } = useAiSettingsContext();

  return {
    activeDialog,
    dialogTarget,
    openDialog,
    closeDialog,
  };
}
