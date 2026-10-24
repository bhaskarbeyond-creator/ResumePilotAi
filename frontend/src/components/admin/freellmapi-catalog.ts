/** Shared server-catalog contract. Provider/model lists and runtime evidence come only from the authenticated API. */
export interface ProviderCatalogEntry {
  id: string;
  name: string;
  label: string;
  group: 'search' | 'models';
  type: string;
  keyless?: boolean;
  accessCategory?: string;
  privacy?: string | null;
  quota?: string | null;
  hint?: string;
  docUrl: string;
  baseUrl: string;
  customBaseUrl?: string;
  defaultModel: string;
  recommendedModels: string[];
  intelligenceScore?: number | null;
  speedScore?: number | null;
  reliabilityScore?: number | null;
  latencyMs?: number | null;
  configuredOnServer: boolean;
  hasKey?: boolean;
  keysCount: number;
  status: 'healthy' | 'issues' | 'cooldown' | 'disabled' | 'unverified';
  enabled: boolean;
  disabled?: boolean;
  credentialSource?: string;
  maskedKey?: string;
  cooldownRemainingSeconds?: number;
  cooldownReason?: string | null;
}
