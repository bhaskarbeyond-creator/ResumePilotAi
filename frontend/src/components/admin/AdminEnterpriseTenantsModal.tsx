import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Building2, ShieldAlert, X } from 'lucide-react';
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
  const lifecycleTrigger = useRef<HTMLButtonElement>(null);
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
  const field = (key: 'displayName' | 'slug' | 'domain' | 'administratorEmail' | 'seatLimit' | 'monthlyAiCredits', label: string, type = 'text') => <label className="block min-w-0 space-y-1 text-sm" key={key}><span className="block break-words font-semibold text-ink">{label}</span><input aria-label={label} className="block w-full min-w-0 max-w-full rounded-xl border border-border bg-surface p-3 text-sm focus-visible:ring-2 focus-visible:ring-brand-500" type={type} value={input[key]} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} onChange={e => {
    const value = e.target.value;
    if (key === 'slug') setEditedSlug(true);
    setInput(old => ({ ...old, [key]: type === 'number' ? Number(value) : value, ...(key === 'displayName' && !editedSlug ? { slug: slugify(value) } : {}) }));
  }} />{errors[key] && <span id={`${key}-error`} role="alert" className="block break-words text-error-700">{errors[key]}</span>}</label>;
  return <section className="min-w-0 rounded-2xl border border-border bg-surface/95 p-4 md:p-6 space-y-4" aria-label="Multi-Tenant Organizations Directory">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><h3 className="min-w-0 break-words font-bold">Multi-Tenant Organizations Directory</h3><Button ref={createTrigger} className="shrink-0 whitespace-normal" onClick={() => { setError(''); setOpen(true); }}>+ Create Enterprise Tenant</Button></div>
    <label className="block min-w-0 text-sm">Data source <select aria-label="Data source" value={mode} onChange={e => { setMessage(''); setTenantMode(e.target.value as typeof mode); }} className="mt-1 block w-full min-w-0 max-w-full border border-border rounded-lg p-2 sm:w-auto"><option>LIVE</option><option>LOCAL DEMO</option></select></label>
    <p className="break-words text-xs text-ink-muted">{mode === 'LIVE' ? 'LIVE — server records only. Empty results may also indicate a backend registry outage: the existing list endpoint masks some failures.' : 'LOCAL DEMO — browser-only sample records. Not customers, verified domains, or provisioned infrastructure. Storage may be memory-only if browser persistence is unavailable.'}</p>
    <div className="flex min-w-0 flex-wrap items-center gap-2"><input aria-label="Search organizations" placeholder="Search name or slug" value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 flex-1 basis-40 border border-border rounded-lg p-2" /><select aria-label="Lifecycle filter" value={status} onChange={e => setStatus(e.target.value)} className="min-w-0 max-w-full border border-border rounded-lg p-2"><option value="">All lifecycle states</option><option>ACTIVE</option><option>SUSPENDED</option></select><select aria-label="Isolation filter" value={tier} onChange={e => setTier(e.target.value)} className="min-w-0 max-w-full border border-border rounded-lg p-2"><option value="">All isolation tiers</option>{TIERS.map(t => <option key={t}>{t}</option>)}</select><Button variant="outline" className="shrink-0" onClick={() => setRefresh(n => n + 1)}>Refresh</Button></div>
    {loading && <p role="status">Loading tenant registry…</p>}{error && <p role="alert" className="break-words text-error-700">ERROR — {error}</p>}{message && <p role="status" className="break-words">{message}</p>}
    {!loading && !error && tenants.length === 0 && <p>No tenant records returned. Confirm backend registry health before treating this as an empty registry.</p>}
    {tenants.filter(t => `${t.displayName} ${t.slug}`.toLowerCase().includes(search.toLowerCase()) && (!status || t.lifecycleState === status) && (!tier || t.isolationTier === tier)).map(t => <article key={t.id} className="min-w-0 rounded-xl border border-border p-4 space-y-2 break-words"><h4 className="break-words font-bold">{t.displayName}</h4><p className="break-words text-sm">{t.slug} · {t.isolationTier} · {t.lifecycleState ?? 'Lifecycle not returned'} · {t.source}</p><p className="break-all text-xs">ID: {t.id}</p><p className="text-xs text-ink-muted">Seats / AI usage: unavailable in registry response. Domain: not configured by this workflow.</p><Button variant="outline" className="min-w-0 whitespace-normal" disabled={t.source !== 'LIVE' || !['ACTIVE', 'SUSPENDED'].includes(t.lifecycleState ?? '')} onClick={(event) => { lifecycleTrigger.current = event.currentTarget; setTarget(t); setReason(''); setError(''); }}>{t.lifecycleState === 'SUSPENDED' ? 'Activate tenant' : 'Suspend tenant'}</Button></article>)}

    {/* ─── Create Enterprise Tenant — Cuba M3 executive glass dialog ─── */}
    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}>
      <DialogContent
        hideCloseButton
        aria-describedby={undefined}
        onCloseAutoFocus={event => { event.preventDefault(); createTrigger.current?.focus(); }}
        className="w-[calc(100%-2rem)] max-w-lg p-0 gap-0 rounded-2xl md:rounded-3xl bg-surface/95 border-border backdrop-blur-xl flex flex-col max-h-[90vh] overflow-hidden motion-reduce:animate-none"
      >
        <div className="flex min-w-0 shrink-0 items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200">
              <Building2 className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="break-words text-base font-bold text-ink">Create Enterprise Tenant</DialogTitle>
              <p className="break-words text-xs text-ink-muted">Provision a tenant record and its default workspace.</p>
            </div>
          </div>
          <DialogClose
            aria-label="Close Create Enterprise Tenant dialog"
            disabled={busy}
            className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-canvas-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 cursor-pointer"
          >
            <X className="size-5" aria-hidden="true" />
          </DialogClose>
        </div>

        <form onSubmit={create} noValidate className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
            <DialogDescription className="break-words text-xs text-ink-muted">
              Domain, quota and administrator invitation fields are validated for planning only; the backend does not accept them in provisioning. DEDICATED isolation is unsupported live; existing REGULATED tenants remain visible.
            </DialogDescription>
            {field('displayName', 'Organization Name')}{field('slug', 'Organization Slug')}{field('domain', 'Primary Business Domain')}
            <label className="block min-w-0 space-y-1 text-sm">
              <span className="block break-words font-semibold text-ink">Isolation Tier</span>
              <select aria-label="Isolation Tier" className="block w-full min-w-0 max-w-full border border-border p-3 rounded-xl" value={input.isolationTier} onChange={e => setInput({ ...input, isolationTier: e.target.value as CreateTenantInput['isolationTier'] })}>{TIERS.map(t => <option key={t}>{t}</option>)}</select>
            </label>
            {field('seatLimit', 'Contract Seat Quota (not applied)', 'number')}{field('monthlyAiCredits', 'Monthly AI Credits (not applied)', 'number')}
            <div className="flex min-w-0 flex-wrap gap-2">{[25000, 50000, 100000, 250000].map(n => <Button key={n} type="button" variant="outline" className="shrink-0 whitespace-normal" onClick={() => setInput({ ...input, monthlyAiCredits: n })}>{n.toLocaleString('en-US')}</Button>)}</div>
            {field('administratorEmail', 'Tenant Administrator Email (invitation unavailable)', 'email')}
            <label className="block min-w-0 space-y-1 text-sm">
              <span className="block break-words font-semibold text-ink">Data Residency</span>
              <select aria-label="Data Residency" className="block w-full min-w-0 max-w-full border border-border p-3 rounded-xl" value={input.region} onChange={e => setInput({ ...input, region: e.target.value as CreateTenantInput['region'] })}>{REGIONS.map(r => <option key={r}>{r}</option>)}</select>
            </label>
            {error && <p role="alert" className="break-words">ERROR — {error}</p>}
          </div>
          <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-neutral-50/50 p-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>Cancel</Button>
            </DialogClose>
            <Button type="submit" loading={busy} disabled={busy} className="min-w-0 whitespace-normal">{mode === 'LIVE' ? 'Create server tenant record' : 'Create LOCAL DEMO record'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    {/* ─── Tenant lifecycle confirmation — Cuba M3 executive glass dialog ─── */}
    <Dialog open={!!target} onOpenChange={v => { if (!v && !busy) setTarget(null); }}>
      <DialogContent
        hideCloseButton
        aria-describedby={undefined}
        onCloseAutoFocus={event => { event.preventDefault(); lifecycleTrigger.current?.focus(); }}
        className="w-[calc(100%-2rem)] max-w-md p-0 gap-0 rounded-2xl md:rounded-3xl bg-surface/95 border-border backdrop-blur-xl flex flex-col max-h-[90vh] overflow-hidden motion-reduce:animate-none"
      >
        <div className="flex min-w-0 shrink-0 items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${target?.lifecycleState === 'ACTIVE' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
              <ShieldAlert className="size-5" aria-hidden="true" />
            </div>
            <DialogTitle className="min-w-0 break-words text-base font-bold text-ink">
              {target?.lifecycleState === 'ACTIVE' ? 'Suspend tenant access?' : 'Activate tenant access?'}
            </DialogTitle>
          </div>
          <DialogClose
            aria-label="Close tenant lifecycle dialog"
            disabled={busy}
            className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-canvas-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 cursor-pointer"
          >
            <X className="size-5" aria-hidden="true" />
          </DialogClose>
        </div>
        <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto p-5 text-xs">
          <DialogDescription className="break-words text-xs text-ink-muted">
            Changes server lifecycle controls for {target?.displayName}. Suspension restricts tenant access. The current backend does not persist a reason supplied by this interface.
          </DialogDescription>
          {target?.lifecycleState === 'ACTIVE' && (
            <label htmlFor="tenant-suspension-reason" className="block min-w-0 space-y-1">
              <span className="block font-semibold text-ink">Reason</span>
              <textarea id="tenant-suspension-reason" className="block w-full min-w-0 max-w-full border border-border p-3 rounded-xl" value={reason} onChange={e => setReason(e.target.value)} />
            </label>
          )}
          {error && <p role="alert" className="break-words">ERROR — {error}</p>}
        </div>
        <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-neutral-50/50 p-4">
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>Cancel</Button>
          </DialogClose>
          <Button
            className="min-w-0 whitespace-normal"
            disabled={busy || (target?.lifecycleState === 'ACTIVE' && !reason.trim())}
            variant={target?.lifecycleState === 'ACTIVE' ? 'destructive' : 'primary'}
            onClick={async () => { if (!target || lock.current) return; lock.current = true; setBusy(true); try { const result = await toggleTenantLifecycle(target.id, target.lifecycleState === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE', reason); setMessage(`LIVE — server confirmed ${result.lifecycleState}.`); setTarget(null); } catch (e) { setError(errorMessage(e)); } finally { lock.current = false; setBusy(false); } }}
          >
            Confirm lifecycle change
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
