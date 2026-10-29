export interface PlatformCredentialStatus { hasDedicatedBYOK: boolean; credentialCount: number; providers: string[] }
export function parsePlatformCredentialStatus(value: unknown): PlatformCredentialStatus {
  if (!value || typeof value !== 'object') throw new Error('Invalid platform status');
  const v = value as Record<string, unknown>;
  if (v.success !== true || typeof v.hasDedicatedBYOK !== 'boolean' || !Number.isSafeInteger(v.credentialCount) || (v.credentialCount as number) < 0 || !Array.isArray(v.providers) || v.providers.some(p => typeof p !== 'string') || v.providers.length !== v.credentialCount || v.hasDedicatedBYOK !== (v.providers.length > 0)) throw new Error('Invalid platform status');
  return { hasDedicatedBYOK:v.hasDedicatedBYOK, credentialCount:v.credentialCount as number, providers:v.providers as string[] };
}
