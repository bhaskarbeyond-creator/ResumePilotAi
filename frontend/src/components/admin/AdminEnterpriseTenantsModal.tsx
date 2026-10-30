import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createEnterpriseTenant, errorMessage, getTenantMode, listEnterpriseTenants, REGIONS, setTenantMode, slugify, subscribeTenants, TIERS, toggleTenantLifecycle, validateCreateTenant, type CreateTenantInput, type EnterpriseTenant } from '@/lib/admin-tenants';

const initial: CreateTenantInput = { displayName: '', slug: '', domain: '', isolationTier: 'STANDARD', seatLimit: 20, monthlyAiCredits: 50000, administratorEmail: '', region: 'AP_SOUTH' };
export function AdminEnterpriseTenantsModal() {
  const [tenants, setTenants] = useState<EnterpriseTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState(getTenantMode());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [tier, setTier] = useState('');
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(initial);
  const [editedSlug, setEditedSlug] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const [target, setTarget] = useState<EnterpriseTenant | null>(null);
  const [reason, setReason] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => subscribeTenants(() => { setMode(getTenantMode()); setRefresh(n => n + 1); }), []);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setTenants([]);
    listEnterpriseTenants().then(data => { if (active) setTenants(data); }).catch(e => { if (active) setError(errorMessage(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
  async function create(event: React.FormEvent) {
    event.preventDefault(); if (lock.current) return;
    const validation = validateCreateTenant(input); setErrors(validation); if (Object.keys(validation).length) return;
    lock.current = true; setBusy(true); setError('');
    try { const tenant = await createEnterpriseTenant(input); setMessage(`${tenant.source} — ${tenant.displayName}: tenant record created. No invitation, domain or quota configuration was applied. Region is routing metadata, not proof of infrastructure residency.`); setOpen(false); setInput(initial); setEditedSlug(false); } catch (e) { setError(errorMessage(e)); } finally { lock.current = false; setBusy(false); }
  }
  const field = (key: 'displayName' | 'slug' | 'domain' | 'administratorEmail' | 'seatLimit' | 'monthlyAiCredits', label: string, type = 'text') => <label className="block space-y-1 text-sm" key={key}>{label}<input aria-label={label} className="w-full rounded-xl border border-border bg-surface p-3 focus-visible:ring-2 focus-visible:ring-brand-500" type={type} value={input[key]} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} onChange={e => {
    const value = e.target.value;
    if (key === 'slug') setEditedSlug(true);
    setInput(old => ({ ...old, [key]: type === 'number' ? Number(value) : value, ...(key === 'displayName' && !editedSlug ? { slug: slugify(value) } : {}) }));
  }} />{errors[key] && <span id={`${key}-error`} role="alert" className="text-error-700">{errors[key]}</span>}</label>;
  return <section className="rounded-2xl border border-border bg-surface/95 p-4 md:p-6 space-y-4" aria-label="Multi-Tenant Organizations Directory">
    <div className="flex flex-wrap justify-between gap-3"><h3 className="font-bold">Multi-Tenant Organizations Directory</h3><Button ref={createTrigger} onClick={() => { setError(''); setOpen(true); }}>+ Create Enterprise Tenant</Button></div>
    <label className="text-sm">Data source <select aria-label="Data source" value={mode} onChange={e => { setMessage(''); setTenantMode(e.target.value as typeof mode); }} className="border border-border rounded-lg p-2"><option>LIVE</option><option>LOCAL DEMO</option></select></label>
    <p className="text-xs text-ink-muted">{mode === 'LIVE' ? 'LIVE — server records only. Empty results may also indicate a backend registry outage: the existing list endpoint masks some failures.' : 'LOCAL DEMO — browser-only sample records. Not customers, verified domains, or provisioned infrastructure. Storage may be memory-only if browser persistence is unavailable.'}</p>
    <div className="flex flex-wrap gap-2"><input aria-label="Search organizations" placeholder="Search name or slug" value={search} onChange={e => setSearch(e.target.value)} className="border border-border rounded-lg p-2 min-w-0" /><select aria-label="Lifecycle filter" value={status} onChange={e => setStatus(e.target.value)}><option value="">All lifecycle states</option><option>ACTIVE</option><option>SUSPENDED</option></select><select aria-label="Isolation filter" value={tier} onChange={e => setTier(e.target.value)}><option value="">All isolation tiers</option>{TIERS.map(t => <option key={t}>{t}</option>)}</select><Button variant="outline" onClick={() => setRefresh(n => n + 1)}>Refresh</Button></div>
    {loading && <p role="status">Loading tenant registry…</p>}{error && <p role="alert" className="text-error-700">ERROR — {error}</p>}{message && <p role="status">{message}</p>}
    {!loading && !error && tenants.length === 0 && <p>No tenant records returned. Confirm backend registry health before treating this as an empty registry.</p>}
    {tenants.filter(t => `${t.displayName} ${t.slug}`.toLowerCase().includes(search.toLowerCase()) && (!status || t.lifecycleState === status) && (!tier || t.isolationTier === tier)).map(t => <article key={t.id} className="rounded-xl border border-border p-4 space-y-2 break-words"><h4 className="font-bold">{t.displayName}</h4><p className="text-sm">{t.slug} · {t.isolationTier} · {t.lifecycleState ?? 'Lifecycle not returned'} · {t.source}</p><p className="text-xs">ID: {t.id}</p><p className="text-xs text-ink-muted">Seats / AI usage: unavailable in registry response. Domain: not configured by this workflow.</p><Button variant="outline" disabled={t.source !== 'LIVE' || !['ACTIVE', 'SUSPENDED'].includes(t.lifecycleState ?? '')} onClick={() => { setTarget(t); setReason(''); setError(''); }}>{t.lifecycleState === 'SUSPENDED' ? 'Activate tenant' : 'Suspend tenant'}</Button></article>)}
    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); createTrigger.current?.focus(); }} className="w-[calc(100%-2rem)] rounded-2xl md:rounded-3xl bg-surface/95 border-border backdrop-blur-xl motion-reduce:animate-none"><DialogTitle>Create Enterprise Tenant</DialogTitle><DialogDescription>Creates a tenant record and default workspace. Domain, quota and administrator invitation fields are validated for planning only; the backend does not accept them in provisioning. DEDICATED isolation is unsupported live; existing REGULATED tenants remain visible.</DialogDescription><form onSubmit={create} noValidate className="space-y-4">{field('displayName', 'Organization Name')}{field('slug', 'Organization Slug')}{field('domain', 'Primary Business Domain')}
      <label className="block">Isolation Tier<select aria-label="Isolation Tier" className="block w-full border border-border p-3 rounded-xl" value={input.isolationTier} onChange={e => setInput({ ...input, isolationTier: e.target.value as CreateTenantInput['isolationTier'] })}>{TIERS.map(t => <option key={t}>{t}</option>)}</select></label>
      {field('seatLimit', 'Contract Seat Quota (not applied)', 'number')}{field('monthlyAiCredits', 'Monthly AI Credits (not applied)', 'number')}<div className="flex flex-wrap gap-2">{[25000, 50000, 100000, 250000].map(n => <Button key={n} type="button" variant="outline" onClick={() => setInput({ ...input, monthlyAiCredits: n })}>{n.toLocaleString('en-US')}</Button>)}</div>{field('administratorEmail', 'Tenant Administrator Email (invitation unavailable)', 'email')}
      <label className="block">Data Residency<select aria-label="Data Residency" className="block w-full border border-border p-3 rounded-xl" value={input.region} onChange={e => setInput({ ...input, region: e.target.value as CreateTenantInput['region'] })}>{REGIONS.map(r => <option key={r}>{r}</option>)}</select></label>
      {error && <p role="alert">ERROR — {error}</p>}<Button type="submit" loading={busy} disabled={busy}>{mode === 'LIVE' ? 'Create server tenant record' : 'Create LOCAL DEMO record'}</Button></form></DialogContent></Dialog>
    <Dialog open={!!target} onOpenChange={v => { if (!v && !busy) setTarget(null); }}><DialogContent className="w-[calc(100%-2rem)] rounded-2xl bg-surface/95 backdrop-blur-xl motion-reduce:animate-none"><DialogTitle>{target?.lifecycleState === 'ACTIVE' ? 'Suspend tenant access?' : 'Activate tenant access?'}</DialogTitle><DialogDescription>Changes server lifecycle controls for {target?.displayName}. Suspension restricts tenant access. The current backend does not persist a reason supplied by this interface.</DialogDescription>{target?.lifecycleState === 'ACTIVE' && <label>Reason<textarea className="block w-full border border-border p-3 rounded-xl" value={reason} onChange={e => setReason(e.target.value)} /></label>}{error && <p role="alert">{error}</p>}<Button disabled={busy || (target?.lifecycleState === 'ACTIVE' && !reason.trim())} variant={target?.lifecycleState === 'ACTIVE' ? 'destructive' : 'primary'} onClick={async () => { if (!target || lock.current) return; lock.current = true; setBusy(true); try { const result = await toggleTenantLifecycle(target.id, target.lifecycleState === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE', reason); setMessage(`LIVE — server confirmed ${result.lifecycleState}.`); setTarget(null); } catch (e) { setError(errorMessage(e)); } finally { lock.current = false; setBusy(false); } }}>Confirm lifecycle change</Button></DialogContent></Dialog>
  </section>;
}
