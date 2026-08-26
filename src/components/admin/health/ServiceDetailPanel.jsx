import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FiX, FiPlay, FiAlertTriangle, FiCheckCircle, FiExternalLink } from 'react-icons/fi';
import { describeState, describePosture, formatCheckedAt, formatMetric, humanizeMetricKey, CONFIGURATION_LABEL, GROUP_LABEL } from '../../../utils/healthPresentation';

function Field({ label, children }) {
  return (
    <div className="border-b border-slate-100 py-2.5 last:border-b-0 sm:grid sm:grid-cols-3 sm:gap-3">
      <dt className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-xs text-slate-800 sm:col-span-2 sm:mt-0">{children}</dd>
    </div>
  );
}

function ListOrEmpty({ items, empty }) {
  if (!items || items.length === 0) return <span className="text-slate-400">{empty}</span>;
  return (
    <ul className="space-y-0.5">
      {items.map(item => <li key={item} className="flex gap-1.5"><span aria-hidden="true" className="text-slate-300">•</span><span>{item}</span></li>)}
    </ul>
  );
}

export default function ServiceDetailPanel({ open, loading, error, detail, onClose, onTest, testing, testResult, canTest }) {
  const closeRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const service = detail?.service || null;
  const tone = service ? describeState(service.state) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in" role="presentation" onClick={onClose}>
      <aside
        role="dialog"
        data-testid="health-detail-panel"
        aria-modal="true"
        aria-label={service ? `${service.name} operational detail` : 'Service operational detail'}
        onClick={e => e.stopPropagation()}
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden bg-white rounded-3xl shadow-2xl border border-slate-200"
      >
        <header className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-6 py-5 text-white flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              {service ? (GROUP_LABEL[service.group] || service.group) : 'Platform Health'}
            </p>
            <h2 className="truncate text-lg font-extrabold text-slate-900">{service?.name || 'Service detail'}</h2>
            {service && (
              <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${tone.badge}`}>
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                {tone.label}
              </span>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close service detail"
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <FiX className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {loading && (
            <div className="space-y-3" aria-busy="true">
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
              <div className="h-32 animate-pulse rounded-xl bg-slate-200" />
              <p className="sr-only" role="status">Loading service detail…</p>
            </div>
          )}

          {!loading && error && (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
              <p className="font-bold">Service detail is unavailable.</p>
              <p className="mt-0.5">{error}</p>
            </div>
          )}

          {!loading && !error && service && (
            <div className="space-y-5">
              <section className={`rounded-2xl border p-3.5 ${tone.badge}`}>
                <p className="text-[11px] font-extrabold uppercase tracking-wide">Why this state</p>
                <p className="mt-1 text-xs leading-relaxed">{service.reason}</p>
                <p className="mt-2 text-[11px] font-semibold opacity-80">{tone.meaning}</p>
              </section>

              <section>
                <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Operational facts</h3>
                <dl>
                  <Field label="Service">{service.name}</Field>
                  <Field label="Status">{tone.label}</Field>
                  <Field label="Posture">{describePosture(service)}</Field>
                  <Field label="Last checked">{formatCheckedAt(service.lastCheckedAt || detail.checkedAt)}</Field>
                  <Field label="Dependency">{service.dependency || 'None'}</Field>
                  <Field label="Retryable">{service.retryable ? 'Yes' : 'No'}</Field>
                  <Field label="Configuration state">{CONFIGURATION_LABEL[service.configuration] || service.configuration}</Field>
                  <Field label="Error category">{service.errorCategory || <span className="text-slate-400">None recorded</span>}</Field>
                  <Field label="Criticality">{service.critical ? 'Critical to platform operation' : 'Non-critical'}</Field>
                </dl>
              </section>

              <section>
                <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Impact</h3>
                <dl>
                  <Field label="Affected features"><ListOrEmpty items={service.affectedFeatures} empty="No user-facing feature is affected." /></Field>
                  <Field label="Affected UI modules">
                    {service.affectedUiModules?.length ? (
                      <ul className="space-y-0.5">
                        {service.affectedUiModules.map(module => (
                          <li key={module}>
                            {module.startsWith('/adm') ? (
                              <Link to={module.replace(/^\/adm/, '/adm')} onClick={onClose} className="inline-flex items-center gap-1 font-semibold text-indigo-700 underline-offset-2 hover:underline">
                                {module} <FiExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                              </Link>
                            ) : <span className="font-mono text-[11px]">{module}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : <span className="text-slate-400">No admin module is affected.</span>}
                  </Field>
                  <Field label="Affected APIs">
                    {service.affectedApis?.length ? (
                      <ul className="space-y-0.5 font-mono text-[11px]">
                        {service.affectedApis.map(api => <li key={api}>{api}</li>)}
                      </ul>
                    ) : <span className="text-slate-400">No API is directly gated by this service.</span>}
                  </Field>
                  <Field label="Endpoints in matrix">
                    {detail.relatedEndpoints?.length
                      ? `${detail.relatedEndpoints.length} registered endpoint(s) resolve their state from this service.`
                      : <span className="text-slate-400">No registered endpoint resolves its state from this service.</span>}
                  </Field>
                </dl>
              </section>

              {service.remediation && (
                <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3.5">
                  <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-700">Remediation guidance</h3>
                  <p className="mt-1 text-xs leading-relaxed text-indigo-950">{service.remediation}</p>
                </section>
              )}

              {Object.keys(service.metrics || {}).length > 0 && (
                <section>
                  <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Observed values</h3>
                  <dl className="rounded-2xl border border-slate-200 bg-slate-50/60 px-3">
                    {Object.entries(service.metrics).map(([key, value]) => (
                      <Field key={key} label={humanizeMetricKey(key)}>{formatMetric(value)}</Field>
                    ))}
                  </dl>
                  <p className="mt-1.5 text-[10px] text-slate-400">
                    Values are observations from the last check. A value that could not be read is shown as “Data unavailable”, never as zero.
                  </p>
                </section>
              )}

              <section>
                <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Provider test</h3>
                {service.testable ? (
                  canTest ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onTest(service.id)}
                        disabled={testing}
                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <FiPlay aria-hidden="true" /> {testing ? 'Running safe test…' : 'Run safe provider test'}
                      </button>
                      <p className="mt-1.5 text-[10px] text-slate-500">
                        The test performs a read-only reachability/authentication check. It never sends a message, charges a card, or writes user data. The action is audited.
                      </p>
                      {testResult && (
                        <div role="status" className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs ${testResult.passed ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                          {testResult.passed ? <FiCheckCircle className="mt-0.5 flex-none" aria-hidden="true" /> : <FiAlertTriangle className="mt-0.5 flex-none" aria-hidden="true" />}
                          <div>
                            <p className="font-bold">{testResult.passed ? 'Test passed' : 'Test failed'}</p>
                            <p className="mt-0.5">{testResult.detail}</p>
                            {testResult.errorCategory && <p className="mt-0.5 font-mono text-[10px]">Category: {testResult.errorCategory}</p>}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      This service exposes a safe provider test, but running it requires the SUPER_ADMIN role. Server-side authorization is authoritative.
                    </p>
                  )
                ) : (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    No safe automated test exists for this service. Its state is derived from configuration and dependency probes only.
                  </p>
                )}
              </section>

              <section>
                <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Relevant audit events</h3>
                {detail.auditSource !== 'ok' ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">Audit trail unavailable — no events are inferred.</p>
                ) : detail.auditEvents?.length ? (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {detail.auditEvents.map(event => (
                      <li key={event.id} className="px-3 py-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-slate-800">{event.action}</span>
                          <span className="rounded bg-slate-100 px-1.5 text-[9px] font-extrabold uppercase text-slate-600">{event.severity}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {event.actorEmail || 'unknown actor'} · {event.pathname || 'no path'} · {formatCheckedAt(event.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">No audit event in the recent window references this service.</p>
                )}
                <Link to="/adm/audit-logs" onClick={onClose} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:underline">
                  Open full audit trail <FiExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                </Link>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
