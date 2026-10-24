import { useAiSettingsContext } from '../context/AiSettingsContext';

export function useRoleGate() {
  const {
    effectiveRole,
    isSuperAdmin,
    isAdmin,
    isAuditorOrSupport,
    isReadOnly,
  } = useAiSettingsContext();

  return {
    effectiveRole,
    isSuperAdmin,
    isAdmin,
    isAuditorOrSupport,
    isReadOnly,
  };
}
