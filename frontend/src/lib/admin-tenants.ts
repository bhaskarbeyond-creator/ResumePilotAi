/** Mandate 11K: platform contracts. No production write falls back to browser storage.
 * Backend gaps: no domain challenge/verification API; provisioning accepts only
 * displayName/slug/isolationTier/region. Platform listing omits quotas and revisions
 * and currently masks non-403 service errors as empty results.
 */
export const STORAGE_KEY = 'ime365_enterprise_tenants_v1';
export const TIERS = ['STANDARD', 'ENTERPRISE', 'DEDICATED'] as const;
export const SERVER_TIERS = ['STANDARD', 'ENTERPRISE', 'REGULATED'] as const;
export const REGIONS = ['US_EAST', 'EU_CENTRAL', 'AP_SOUTH'] as const;
export const ENTERPRISE_ROLES = ['ENTERPRISE_ADMIN', 'ENTERPRISE_MANAGER', 'ENTERPRISE_MEMBER', 'ENTERPRISE_VIEWER'] as const;
export interface TenantQuotaPolicy { seatLimit: number; monthlyAiCredits: number; seatsUsed?: number; creditsUsed?: number }
export interface DnsVerificationRecord { host: string; type: 'TXT'; value: string; domain: string; status: 'UNAVAILABLE' }
export interface CompanyVerificationEntry { id: string; companyName: string; status: 'VERIFIED' | 'PENDING_REVIEW' | 'REJECTED'; maskedTaxId?: string }
export interface EnterpriseTenant { id: string; displayName: string; slug: string; isolationTier: typeof TIERS[number] | 'REGULATED'; lifecycleState?: 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'DELETING' | 'DELETED'; region?: string; quotas?: TenantQuotaPolicy; source: 'LIVE' | 'LOCAL DEMO' }
export interface CreateTenantInput { displayName: string; slug: string; domain: string; isolationTier: typeof TIERS[number]; seatLimit: number; monthlyAiCredits: number; administratorEmail: string; region: typeof REGIONS[number] }
export class TenantError extends Error { constructor(public code: string, message: string) { super(message); this.name = 'TenantError'; } }
export function slugify(name: string): string { return name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, ''); }
export function validDomain(domain: string): boolean { return domain.length <= 253 && /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(domain); }
export function positiveInteger(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
export function validateCreateTenant(input: CreateTenantInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.displayName.trim().length < 2 || input.displayName.length > 120) errors.displayName = 'Use 2–120 characters.';
  if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(input.slug)) errors.slug = 'Use 1–80 lowercase letters, digits and internal hyphens.';
  if (!validDomain(input.domain)) errors.domain = 'Enter a hostname without protocol, path or trailing slash.';
  if (!TIERS.includes(input.isolationTier)) errors.isolationTier = 'Unsupported isolation tier.';
  if (!positiveInteger(input.seatLimit) || input.seatLimit > 100000) errors.seatLimit = 'Use 1–100,000 seats.';
  if (!positiveInteger(input.monthlyAiCredits)) errors.monthlyAiCredits = 'Use a positive safe integer.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.administratorEmail)) errors.administratorEmail = 'Enter a valid email.';
  if (!REGIONS.includes(input.region)) errors.region = 'Unsupported region.';
  return errors;
}
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TenantError('INVALID_RESPONSE', 'Invalid tenant response.'); return value as Record<string, unknown>; }
export function parseTenant(value: unknown, source: EnterpriseTenant['source'] = 'LIVE'): EnterpriseTenant {
  const t = object(value);
  if (typeof t.id !== 'string' || !t.id || typeof t.displayName !== 'string' || !t.displayName || typeof t.slug !== 'string' || !/^[a-z0-9-]{1,80}$/.test(t.slug) || ![...TIERS, ...SERVER_TIERS].includes(t.isolationTier as EnterpriseTenant['isolationTier'])) throw new TenantError('INVALID_RESPONSE', 'Invalid tenant identity.');
  if (t.lifecycleState !== undefined && !['PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DELETING', 'DELETED'].includes(String(t.lifecycleState))) throw new TenantError('INVALID_RESPONSE', 'Invalid lifecycle state.');
  return { id: t.id, displayName: t.displayName, slug: t.slug, isolationTier: t.isolationTier as EnterpriseTenant['isolationTier'], lifecycleState: t.lifecycleState as EnterpriseTenant['lifecycleState'], region: typeof t.region === 'string' ? t.region : undefined, source };
}
export function decodeStorage(raw: string | null): EnterpriseTenant[] | null {
  if (!raw) return null;
  try { const data = object(JSON.parse(raw)); if (data.version !== 1 || !Array.isArray(data.tenants)) return null; return data.tenants.map(t => parseTenant(t, 'LOCAL DEMO')); } catch { return null; }
}
export function serializeTenants(tenants: EnterpriseTenant[]): string { return JSON.stringify({ version: 1, tenants: tenants.map(t => parseTenant(t, 'LOCAL DEMO')) }); }
export function seedTenants(): EnterpriseTenant[] { return ['Acme Corp', 'Northwind Careers', 'Globex Talent', 'Initech HR'].map((name, i) => ({ id: `demo-${i}`, displayName: `${name} · DEMO`, slug: slugify(name), isolationTier: 'STANDARD', lifecycleState: 'ACTIVE', source: 'LOCAL DEMO' })); }
let mode: 'LIVE' | 'LOCAL DEMO' = 'LIVE';
let memory: EnterpriseTenant[] | null = null;
const listeners = new Set<() => void>();
export function getTenantMode() { return mode; }
export function notifyTenantSubscribers(): void {
  for (const listener of listeners) listener();
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try { const channel = new BroadcastChannel(STORAGE_KEY); channel.postMessage('refresh'); channel.close(); } catch { /* Cross-tab transport unavailable; manual refresh remains available. */ }
  }
}
export function setTenantMode(next: typeof mode): void { mode = next; notifyTenantSubscribers(); }
export function subscribeTenants(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) { memory = null; listener(); } };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  let channel: BroadcastChannel | undefined;
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try { channel = new BroadcastChannel(STORAGE_KEY); channel.onmessage = () => { memory = null; listener(); }; } catch { /* Storage events remain available for demo mode. */ }
  }
  return () => { channel?.close(); listeners.delete(listener); if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); };
}
function readDemo(): EnterpriseTenant[] {
  try { memory = decodeStorage(localStorage.getItem(STORAGE_KEY)) ?? memory ?? seedTenants(); localStorage.setItem(STORAGE_KEY, serializeTenants(memory)); } catch { memory ??= seedTenants(); }
  return memory;
}
function saveDemo(tenants: EnterpriseTenant[]): void { memory = tenants; try { localStorage.setItem(STORAGE_KEY, serializeTenants(tenants)); } catch { /* memory-only demo; never live persistence */ } notifyTenantSubscribers(); }
async function request<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> { const { enterpriseRequest } = await import('./enterprise-api'); return enterpriseRequest<T>(path, { method, body }); }
export async function listEnterpriseTenants(): Promise<EnterpriseTenant[]> {
  if (mode === 'LOCAL DEMO') return readDemo();
  const response = object(await request<unknown>('/platform/tenants'));
  if (!Array.isArray(response.tenants)) throw new TenantError('INVALID_RESPONSE', 'Tenant list is invalid.');
  return response.tenants.map(t => parseTenant(t));
}
export async function createEnterpriseTenant(input: CreateTenantInput): Promise<EnterpriseTenant> {
  if (Object.keys(validateCreateTenant(input)).length) throw new TenantError('VALIDATION', 'Correct the highlighted fields.');
  if (mode === 'LOCAL DEMO') {
    const tenants = readDemo();
    if (tenants.some(t => t.slug === input.slug)) throw new TenantError('TENANT_SLUG_CONFLICT', 'Slug already exists in demo.');
    const tenant: EnterpriseTenant = { id: crypto.randomUUID(), displayName: `${input.displayName} · DEMO`, slug: input.slug, isolationTier: input.isolationTier, lifecycleState: 'ACTIVE', region: input.region, source: 'LOCAL DEMO' };
    saveDemo([...tenants, tenant]); return tenant;
  }
  if (input.isolationTier === 'DEDICATED') throw new TenantError('UNSUPPORTED_TIER', 'DEDICATED is not supported by the live backend (STANDARD, ENTERPRISE, REGULATED). No record was created.');
  const response = object(await request<unknown>('/tenants', 'POST', { displayName: input.displayName.trim(), slug: input.slug, isolationTier: input.isolationTier, region: input.region }));
  const tenant = parseTenant(response.tenant); notifyTenantSubscribers(); return tenant;
}
export async function updateTenantQuotas(_tenantId: string, _quotas: Partial<TenantQuotaPolicy>): Promise<EnterpriseTenant> { throw new TenantError('UNAVAILABLE', 'Monthly credit overrides are unsupported. Commercial updates require a configuration revision, plan, currency and billing status not exposed by this directory.'); }
export async function toggleTenantLifecycle(tenantId: string, state: 'ACTIVE' | 'SUSPENDED', reason = ''): Promise<EnterpriseTenant> {
  if (!['ACTIVE', 'SUSPENDED'].includes(state)) throw new TenantError('VALIDATION', 'Invalid lifecycle state.');
  if (state === 'SUSPENDED' && !reason.trim()) throw new TenantError('VALIDATION', 'A suspension reason is required.');
  if (mode === 'LOCAL DEMO') throw new TenantError('UNAVAILABLE', 'Demo records cannot suspend real access.');
  const response = object(await request<unknown>(`/platform/tenants/${encodeURIComponent(tenantId)}/${state === 'ACTIVE' ? 'reactivate' : 'suspend'}`, 'POST'));
  const confirmed = object(response.tenant);
  if (confirmed.id !== tenantId || confirmed.lifecycleState !== state) throw new TenantError('INVALID_RESPONSE', 'Server did not confirm the requested transition.');
  const tenants = await listEnterpriseTenants(); const tenant = tenants.find(t => t.id === tenantId);
  notifyTenantSubscribers();
  if (!tenant) throw new TenantError('REFRESH_FAILED', 'Transition confirmed, but registry refresh did not return the tenant.');
  return tenant;
}
/** Unbound configuration preview only. No server challenge registration exists. */
export function generateDnsTxtChallenge(domain: string): DnsVerificationRecord {
  if (!validDomain(domain)) throw new TenantError('VALIDATION', 'Invalid domain.');
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return { host: `_ime365-challenge.${domain.toLowerCase()}`, type: 'TXT', domain: domain.toLowerCase(), value: `ime365-verification=${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`, status: 'UNAVAILABLE' };
}
export async function verifyDnsTxtRecord(_tenantId: string): Promise<{ verified: boolean; message: string }> { throw new TenantError('UNAVAILABLE', 'No tenant-bound DNS challenge or verification endpoint exists. Domain ownership has not been established.'); }
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Operation failed.'; }
