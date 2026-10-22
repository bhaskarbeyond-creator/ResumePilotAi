/** Shared server-catalog contract. Provider/model lists and runtime evidence come only from the authenticated API. */
export interface ProviderCatalogEntry {
  id: string;
  name: string;
  label: string;
  group: 'search' | 'models';
  type: string;
  keyless?: boolean;
  accessCategory?: string;
  privacy?: string;
  quota?: string;
  hint?: string;
  docUrl: string;
  baseUrl: string;
  defaultModel: string;
  recommendedModels: string[];
  intelligenceScore?: number | null;
  speedScore?: number | null;
  reliabilityScore?: number | null;
  latencyMs?: number | null;
  configuredOnServer: boolean;
  hasKey?: boolean;
  keysCount: number;
  status: 'healthy' | 'issues' | 'disabled' | 'unverified';
  enabled: boolean;
}
