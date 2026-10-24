import { useAiSettingsContext } from '../context/AiSettingsContext';

export function useFeatureFlag() {
  const { v2Enabled, handleRestoreV2Flag } = useAiSettingsContext();

  return {
    v2Enabled,
    handleRestoreV2Flag,
  };
}
