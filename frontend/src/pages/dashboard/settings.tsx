/**
 * Settings (/dashboard/settings), candidate dashboard.
 *
 * Each section is addressable by ?tab= (case-insensitive; legacy links use
 * ?tab=Profile). The section links push history, so back/forward and refresh
 * restore the section:
 *   profile (default)  Master Profile: GET/POST /api/users-data/profile
 *   security | 2fa     password (Firebase) and second factors (POST /api/users-data/mfa/disable)
 *   account            data export (POST /api/account/export) and deletion (POST /api/account/delete)
 *   appearance         colour theme (this device)
 * Sections that moved keep their old links: ?tab=support opens the Help Desk
 * (/dashboard/support) and ?tab=notifications the notifications inbox. Any
 * other value shows the Master Profile.
 *
 * Every section stays mounted (inactive ones are hidden), so unsaved Master
 * Profile edits survive switching sections.
 */
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Palette, Receipt, Shield, User, UserCog } from 'lucide-react';
import { AccountPanel } from '@/components/settings/account-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { BillingInvoicesPanel } from '@/components/settings/billing-invoices-panel';
import { ProfilePanel } from '@/components/settings/profile-panel';
import { SecurityPanel } from '@/components/settings/security-panel';
import { cn } from '@/lib/utils';

type SettingsTab = 'profile' | 'security' | 'account' | 'billing' | 'appearance';

const TABS: ReadonlyArray<{ id: SettingsTab; label: string; icon: typeof User; description: string }> = [
  { id: 'profile', label: 'Master Profile', icon: User, description: 'Your contact details and summary. New resumes and cover letters start from these values.' },
  { id: 'security', label: 'Security & 2FA', icon: Shield, description: 'Your password and two-factor authentication.' },
  { id: 'account', label: 'Account & Data', icon: UserCog, description: 'Download a copy of your data or delete your account.' },
  { id: 'billing', label: 'Billing & Invoices', icon: Receipt, description: 'Your subscription invoices, GST/tax breakdowns, and printable tax receipts.' },
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'How the dashboard looks on this device.' },
];

const MOVED: Record<string, string> = {
  support: '/dashboard/support',
  notifications: '/dashboard/notifications',
};

function resolveTab(value: string): SettingsTab {
  if (value === 'security' || value === '2fa') return 'security';
  if (value === 'billing' || value === 'invoices' || value === 'receipts') return 'billing';
  if (value === 'account' || value === 'appearance') return value;
  return 'profile';
}

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const requested = (searchParams.get('tab') ?? '').trim().toLowerCase();
  const movedTo = Object.hasOwn(MOVED, requested) ? MOVED[requested] : null;
  if (movedTo) return <Navigate to={movedTo} replace />;
  const active = resolveTab(requested);

  return (
    <div className="relative p-4 lg:p-6 xl:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">Your Master Profile, sign-in security, data and appearance.</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav aria-label="Settings sections" className="shrink-0 lg:w-56">
          <ul className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap lg:flex-col">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const current = tab.id === active;
              return (
                <li key={tab.id} className="min-w-0">
                  <Link
                    to={`/dashboard/settings?tab=${tab.id}`}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-brand-500',
                      current ? 'bg-brand-50 text-brand-700' : 'text-ink-secondary hover:bg-neutral-100 hover:text-ink',
                    )}
                  >
                    <Icon className={cn('size-4 shrink-0', current ? 'text-brand-600' : 'text-ink-muted')} aria-hidden="true" />
                    <span className="min-w-0">{tab.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 lg:max-w-3xl">
          {TABS.map((tab) => (
            <section key={tab.id} aria-labelledby={`settings-heading-${tab.id}`} hidden={tab.id !== active} className="space-y-4">
              <div>
                <h2 id={`settings-heading-${tab.id}`} className="text-lg font-semibold text-ink">{tab.label}</h2>
                <p className="mt-1 text-sm text-ink-muted">{tab.description}</p>
              </div>
              {tab.id === 'profile' && <ProfilePanel />}
              {tab.id === 'security' && <SecurityPanel />}
              {tab.id === 'account' && <AccountPanel />}
              {tab.id === 'billing' && <BillingInvoicesPanel active={active === 'billing'} />}
              {tab.id === 'appearance' && <AppearancePanel />}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
