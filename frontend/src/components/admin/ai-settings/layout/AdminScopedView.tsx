import React from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAiSettingsContext } from '../context/AiSettingsContext';
import { QuotaGovernanceTab } from '../quotas/QuotaGovernanceTab';

export function AdminScopedView() {
  const { toastMsg, setToastMsg } = useAiSettingsContext();

  return (
    <div className="space-y-5 min-w-0" data-testid="admin-ai-quota-only-view">
      {toastMsg && (
        <div
          role="status"
          className="rounded-xl border border-success-100 bg-success-50 px-4 py-3 text-xs font-semibold text-success-700 flex items-center justify-between gap-2"
        >
          <span>{toastMsg}</span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="underline font-bold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <section
        data-testid="super-admin-restriction-notice"
        aria-label="Super-Admin credential restriction notice"
        className="rounded-2xl border border-brand-200 bg-brand-50/70 p-5 space-y-2"
      >
        <div className="flex items-center gap-2 text-brand-800 font-bold text-sm">
          <Lock className="size-4 shrink-0" />
          <h2>Provider Credentials Require Super-Admin Authorization</h2>
        </div>
        <p className="text-xs text-ink-secondary leading-relaxed">
          API keys, multi-key rotation pools, custom provider endpoints, and live model routing
          policies are restricted to <strong>SUPER_ADMIN</strong> operators. As a{' '}
          <strong>System Admin</strong>, you have full operational authority over platform-wide AI
          daily request quotas and user usage resets below. For general module toggles (such as
          Resume Import), visit{' '}
          <Link to="/admin/settings" className="font-bold text-brand-700 underline">
            Platform Settings &amp; Modules
          </Link>
          .
        </p>
      </section>

      <QuotaGovernanceTab />
    </div>
  );
}
