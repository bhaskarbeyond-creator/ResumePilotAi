import { ConfigureProviderDialog } from '../providers/ConfigureProviderDialog';
import { KeyPoolManagerDialog } from '../providers/KeyPoolManagerDialog';
import { CooldownsDialog } from '../providers/CooldownsDialog';
import { ClearKeyConfirmDialog } from '../providers/ClearKeyConfirmDialog';
import { ModelDiscoveryDialog } from '../discovery/ModelDiscoveryDialog';
import { IntegrationSnippetsDialog } from '../gateway/IntegrationSnippetsDialog';
import { QuotaResetConfirmDialog } from '../quotas/QuotaResetConfirmDialog';

export function AiSettingsDialogs() {
  return (
    <>
      <ConfigureProviderDialog />
      <KeyPoolManagerDialog />
      <CooldownsDialog />
      <ClearKeyConfirmDialog />
      <ModelDiscoveryDialog />
      <IntegrationSnippetsDialog />
      <QuotaResetConfirmDialog />
    </>
  );
}
