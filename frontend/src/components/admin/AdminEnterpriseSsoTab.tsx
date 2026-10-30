/**
 * Enterprise SSO (SAML 2.0) configuration tab.
 *
 * The trust store behind this screen is the security boundary for every tenant
 * that enables SSO, so the screen is deliberately explicit: it shows which
 * certificate bytes will be pinned, which ACS URL the IdP must call, and what
 * mode the save is operating in. All decisions live in `lib/saml-admin.ts`, which
 * is pure and unit-tested; this component renders and calls the API.
 *
 * Contracts used (and the only ones that exist):
 *   GET /api/auth/saml/:tenantId/config    → { success, config | null }
 *   PUT /api/auth/saml/:tenantId/config    → { success, config }
 *   GET /api/auth/saml/:tenantId/metadata  → SP metadata XML (anonymous)
 */

import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient, get, put } from '@/lib/api-client';
import {
  acsUrlFor,
  buildConfigPayload,
  emptyForm,
  formFromConfig,
  metadataDownloadName,
  payloadSummary,
  samlStatus,
  spMetadataUrlFor,
  validateSamlForm,
  type SamlAdminForm,
  type SamlConfigView,
  type SamlFormErrors,
} from '@/lib/saml-admin';
import { AlertCircle, CheckCircle2, Copy, Download, KeyRound, Loader2, ShieldCheck } from 'lucide-react';

const SAML_BASE = '/api/auth/saml';

function spBaseUrl(): string {
  if (typeof window === 'undefined') return `https://example.invalid${SAML_BASE}`;
  return `${window.location.origin}${SAML_BASE}`;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-error-700 mt-1">{message}</p>;
}

export function AdminEnterpriseSsoTab() {
  const [form, setForm] = useState<SamlAdminForm>(() => emptyForm(''));
  const [errors, setErrors] = useState<SamlFormErrors>({});
  const [config, setConfig] = useState<SamlConfigView | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const status = samlStatus(config);
  const tenantId = form.tenantId.trim();
  const acsUrl = useMemo(() => (tenantId ? acsUrlFor(spBaseUrl(), tenantId) : ''), [tenantId]);

  const update = useCallback((patch: Partial<SamlAdminForm>) => {
    setForm(current => ({ ...current, ...patch }));
    setNotice(null);
  }, []);

  const loadConfig = useCallback(async () => {
    if (!tenantId) {
      setErrors({ tenantId: 'Enter the tenant slug first.' });
      return;
    }
    setLoading(true);
    setErrors({});
    setNotice(null);
    try {
      const response = await get<{ success: boolean; config: SamlConfigView | null }>(
        `${SAML_BASE}/${encodeURIComponent(tenantId)}/config`,
      );
      const loaded = response?.config ?? null;
      setConfig(loaded);
      setForm(formFromConfig(loaded, tenantId));
      setNotice({
        kind: 'ok',
        text: loaded ? 'Configuration loaded.' : 'This tenant has no SSO configuration yet.',
      });
    } catch (error) {
      const apiError = error as { response?: { status?: number; data?: { error?: { code?: string; message?: string } } } };
      const statusCode = apiError?.response?.status;
      setConfig(null);
      setNotice({
        kind: 'error',
        text:
          statusCode === 401 || statusCode === 403
            ? 'You need a recent administrator sign-in to read this trust configuration.'
            : apiError?.response?.data?.error?.message || 'The configuration could not be loaded.',
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const saveConfig = useCallback(async () => {
    const validation = validateSamlForm(form);
    setErrors(validation);
    if (Object.keys(validation).length) {
      setNotice({ kind: 'error', text: 'Fix the highlighted fields before saving.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const payload = buildConfigPayload(form);
      const response = await put<{ success: boolean; config: SamlConfigView }>(
        `${SAML_BASE}/${encodeURIComponent(tenantId)}/config`,
        payload,
      );
      setConfig(response?.config ?? null);
      setForm(formFromConfig(response?.config ?? null, tenantId));
      setNotice({ kind: 'ok', text: 'SSO configuration saved. The IdP trust is now pinned to these certificates.' });
    } catch (error) {
      const apiError = error as { response?: { status?: number; data?: { error?: { code?: string; message?: string } } } };
      const code = apiError?.response?.data?.error?.code;
      const message = apiError?.response?.data?.error?.message;
      setNotice({
        kind: 'error',
        text:
          code === 'SAML_METADATA_INVALID'
            ? `The IdP metadata was rejected: ${message || 'it is not valid SAML metadata.'}`
            : code === 'SAML_CERT_INVALID'
              ? `A certificate was rejected: ${message || 'not valid X.509 base64 DER.'}`
              : message || 'The configuration could not be saved.',
      });
    } finally {
      setSaving(false);
    }
  }, [form, tenantId]);

  const downloadMetadata = useCallback(async () => {
    if (!tenantId) {
      setErrors({ tenantId: 'Enter the tenant slug first.' });
      return;
    }
    try {
      const response = await apiClient.get<string>(spMetadataUrlFor(SAML_BASE, tenantId), {
        responseType: 'text',
      });
      const blob = new Blob([response.data], { type: 'application/samlmetadata+xml' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = metadataDownloadName(tenantId);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice({ kind: 'ok', text: 'Service provider metadata downloaded. Import it at your IdP.' });
    } catch {
      setNotice({ kind: 'error', text: 'The service provider metadata could not be downloaded.' });
    }
  }, [tenantId]);

  const copyAcs = useCallback(async () => {
    if (!acsUrl) return;
    try {
      await navigator.clipboard.writeText(acsUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({ kind: 'error', text: 'Clipboard access was blocked by the browser.' });
    }
  }, [acsUrl]);

  return (
    <div className="space-y-6" data-testid="admin-sso-tab">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" />
            Enterprise SSO · SAML 2.0
            <span
              data-testid="saml-status-badge"
              data-status={status}
              className={
                status === 'ACTIVE'
                  ? 'ml-2 rounded-full bg-success-50 border border-success-200 px-2.5 py-0.5 text-xs font-bold text-success-700'
                  : status === 'DISABLED'
                    ? 'ml-2 rounded-full bg-warning-50 border border-warning-200 px-2.5 py-0.5 text-xs font-bold text-warning-700'
                    : 'ml-2 rounded-full bg-surface-2 border border-border px-2.5 py-0.5 text-xs font-bold text-ink-muted'
              }
            >
              {status === 'ACTIVE' ? 'SSO ACTIVE' : status === 'DISABLED' ? 'CONFIGURED · DISABLED' : 'UNCONFIGURED'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-ink-muted">
            The certificates saved here are the <strong>only</strong> keys this platform will accept assertions from.
            Import the service provider metadata at your IdP before enabling SSO, otherwise sign-in will be refused.
          </p>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <label htmlFor="saml-tenant" className="text-xs font-semibold text-ink-secondary">
                Tenant slug
              </label>
              <Input
                id="saml-tenant"
                data-testid="saml-tenant-slug"
                value={form.tenantId}
                onChange={event => update({ tenantId: event.target.value })}
                placeholder="acme-corp"
                autoComplete="off"
                spellCheck={false}
              />
              <FieldError message={errors.tenantId} />
            </div>
            <Button
              type="button"
              variant="secondary"
              data-testid="saml-load"
              onClick={loadConfig}
              disabled={loading || !tenantId}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              <span className="ml-2">Load configuration</span>
            </Button>
          </div>

          {tenantId && (
            <div className="rounded-xl border border-border bg-surface-2 p-3 space-y-2">
              <div>
                <p className="text-xs font-semibold text-ink-secondary">Assertion Consumer Service (ACS) URL</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code data-testid="saml-acs-url" className="break-all rounded bg-surface px-2 py-1 text-xs">
                    {acsUrl}
                  </code>
                  <Button type="button" size="sm" variant="ghost" data-testid="saml-copy-acs" onClick={copyAcs}>
                    <Copy className="size-3.5" />
                    <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>
                  </Button>
                </div>
              </div>
              <Button type="button" size="sm" variant="secondary" data-testid="saml-download-metadata" onClick={downloadMetadata}>
                <Download className="size-3.5" />
                <span className="ml-2">Download SP metadata</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Identity provider trust</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div role="radiogroup" aria-label="Configuration source" className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="saml-mode"
                data-testid="saml-mode-metadata"
                checked={form.mode === 'metadata'}
                onChange={() => update({ mode: 'metadata' })}
              />
              Configure from IdP metadata
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="saml-mode"
                data-testid="saml-mode-manual"
                checked={form.mode === 'manual'}
                onChange={() => update({ mode: 'manual' })}
              />
              Manual entry
            </label>
          </div>

          {form.mode === 'metadata' ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="saml-metadata-xml" className="text-xs font-semibold text-ink-secondary">
                  IdP metadata XML
                </label>
                <textarea
                  id="saml-metadata-xml"
                  data-testid="saml-metadata-xml"
                  className="mt-1 w-full rounded-xl border border-border bg-surface p-3 font-mono text-xs"
                  rows={6}
                  value={form.metadataXml}
                  onChange={event => update({ metadataXml: event.target.value, metadataUrl: '' })}
                  placeholder="<md:EntityDescriptor …>"
                  spellCheck={false}
                />
                <FieldError message={errors.metadataXml} />
              </div>
              <div>
                <label htmlFor="saml-metadata-url" className="text-xs font-semibold text-ink-secondary">
                  …or metadata URL
                </label>
                <Input
                  id="saml-metadata-url"
                  data-testid="saml-metadata-url"
                  value={form.metadataUrl}
                  onChange={event => update({ metadataUrl: event.target.value, metadataXml: '' })}
                  placeholder="https://idp.example.com/app/metadata"
                  spellCheck={false}
                />
                <FieldError message={errors.metadataUrl} />
                <p className="mt-1 text-xs text-ink-muted">
                  The server fetches this URL itself, over https, and refuses private or loopback addresses.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="saml-entity-id" className="text-xs font-semibold text-ink-secondary">
                  IdP entity ID
                </label>
                <Input
                  id="saml-entity-id"
                  data-testid="saml-entity-id"
                  value={form.entityId}
                  onChange={event => update({ entityId: event.target.value })}
                  placeholder="https://idp.example.com/metadata"
                  spellCheck={false}
                />
                <FieldError message={errors.entityId} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="saml-sso-url" className="text-xs font-semibold text-ink-secondary">
                    SSO URL
                  </label>
                  <Input
                    id="saml-sso-url"
                    data-testid="saml-sso-url"
                    value={form.ssoUrl}
                    onChange={event => update({ ssoUrl: event.target.value })}
                    placeholder="https://idp.example.com/sso"
                    spellCheck={false}
                  />
                  <FieldError message={errors.ssoUrl} />
                </div>
                <div>
                  <label htmlFor="saml-slo-url" className="text-xs font-semibold text-ink-secondary">
                    Single logout URL (optional)
                  </label>
                  <Input
                    id="saml-slo-url"
                    data-testid="saml-slo-url"
                    value={form.sloUrl}
                    onChange={event => update({ sloUrl: event.target.value })}
                    placeholder="https://idp.example.com/slo"
                    spellCheck={false}
                  />
                  <FieldError message={errors.sloUrl} />
                </div>
              </div>
              <div>
                <label htmlFor="saml-certificates" className="text-xs font-semibold text-ink-secondary">
                  IdP signing certificate(s) — one per line
                </label>
                <textarea
                  id="saml-certificates"
                  data-testid="saml-certificates"
                  className="mt-1 w-full rounded-xl border border-border bg-surface p-3 font-mono text-xs"
                  rows={5}
                  value={form.certificates}
                  onChange={event => update({ certificates: event.target.value })}
                  placeholder="-----BEGIN CERTIFICATE-----"
                  spellCheck={false}
                />
                <FieldError message={errors.certificates} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="saml-enabled"
                checked={form.enabled}
                onChange={event => update({ enabled: event.target.checked })}
              />
              SSO enabled for this tenant
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="saml-jit"
                checked={form.jitProvisioning}
                onChange={event => update({ jitProvisioning: event.target.checked })}
              />
              Create accounts on first sign-in
            </label>
            <label className="flex items-center gap-2 text-sm">
              Default role
              <select
                data-testid="saml-default-role"
                className="rounded-lg border border-border bg-surface px-2 py-1 text-sm"
                value={form.defaultRole}
                onChange={event => update({ defaultRole: event.target.value })}
              >
                <option value="MEMBER">MEMBER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="VIEWER">VIEWER</option>
              </select>
            </label>
          </div>

          <p className="text-xs text-ink-muted">{payloadSummary(buildConfigPayload(form))}</p>

          {notice && (
            <div
              role="status"
              data-testid="saml-notice"
              className={
                notice.kind === 'ok'
                  ? 'flex items-start gap-2 rounded-xl border border-success-200 bg-success-50 p-3 text-sm text-success-800'
                  : 'flex items-start gap-2 rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-800'
              }
            >
              {notice.kind === 'ok' ? <CheckCircle2 className="size-4 mt-0.5" /> : <AlertCircle className="size-4 mt-0.5" />}
              <span>{notice.text}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="button" data-testid="saml-save" onClick={saveConfig} disabled={saving || !tenantId}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              <span className="ml-2">Save SSO configuration</span>
            </Button>
            <p className="text-xs text-ink-muted">
              Saving requires a recent administrator sign-in. A change takes effect on the next sign-in attempt.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminEnterpriseSsoTab;
