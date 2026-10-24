import { useAiSettingsContext } from '../context/AiSettingsContext';

export function useRevisionConflict() {
  const {
    revision,
    revisionConflict,
    setRevisionConflict,
    commitSettingsPatch,
    loadSettings,
  } = useAiSettingsContext();

  const handleReloadServerState = () => {
    setRevisionConflict(null);
    void loadSettings();
  };

  const handleForceOverwrite = async () => {
    if (!revisionConflict?.pendingPayload) return;
    try {
      await commitSettingsPatch(
        revisionConflict.pendingPayload,
        'Overwritten server configuration successfully.',
        { force: true }
      );
    } catch {
      /* error surfaced by commitSettingsPatch */
    }
  };

  return {
    revision,
    revisionConflict,
    handleReloadServerState,
    handleForceOverwrite,
  };
}
