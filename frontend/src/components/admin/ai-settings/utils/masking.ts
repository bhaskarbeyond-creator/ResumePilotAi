import type { ProviderCatalogEntry } from '../types/ai-settings.types';
import { FRONTIER_IDS } from './constants';

export function splitKeys(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]+/)) {
    const trimmed = part.trim();
    if (trimmed && !/[•*]/.test(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

export function getProviderTier(p: ProviderCatalogEntry): 'frontier' | 'mesh' | 'search' {
  if (p.group === 'search' || p.type === 'search' || p.type === 'media') return 'search';
  if (FRONTIER_IDS.has(p.id)) return 'frontier';
  return 'mesh';
}

export function formatCredentialSource(source?: string, keyless?: boolean): string {
  if (source === 'mariadb-secret-store') return 'MariaDB Vault';
  if (source === 'environment') return 'Environment (.env)';
  if (source === 'mariadb-legacy-setting') return 'Legacy Store';
  if (source === 'keyless' || keyless) return 'Keyless / Local';
  return 'Not Configured';
}
