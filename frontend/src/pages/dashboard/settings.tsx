/**
 * Settings Page
 *
 * Full contract implementation for Surface 2:
 * - Profile: GET /api/users-data/profile, POST /api/users-data/profile with { expectedRevision, profile }
 * - Password: Firebase updatePassword
 * - 2FA MFA: POST /api/users-data/mfa/disable with Radix Dialog confirmation
 * - Danger Zone: GDPR Export (POST /api/account/export), Account Deletion (POST /api/account/delete) with Radix Dialog
 * - Notifications: State-persisted preferences
 * - Support Desk: GET /api/support/tickets, POST /api/support/tickets, POST /api/support/tickets/:ticketId/messages with Radix Dialog
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { get, post, normalizeError } from '@/lib/api-client';
import { signOut } from '@/lib/firebase';
import { updatePassword } from 'firebase/auth';
import {
  User,
  Lock,
  Shield,
  Bell,
  Palette,
  AlertTriangle,
  CheckCircle2,
  Save,
  Trash2,
  HelpCircle,
  Send,
  Plus,
  Download,
  ShieldAlert,
  KeyRound,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useTheme } from '@/providers/theme-provider';

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  bio: string;
}

type SettingsTab = 'profile' | 'security' | 'notifications' | 'appearance' | 'support';

const DEFAULT_NOTIFICATIONS = {
  jobMatches: true,
  applicationUpdates: true,
  interviewReminders: true,
  platformUpdates: true,
  marketingEmails: false,
};

export function SettingsPage() {
  const { user } = useAuth();
  const { theme: currentTheme, setTheme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab')?.toLowerCase();
  const initialTab: SettingsTab =
    rawTab === 'security' ? 'security' :
    rawTab === 'notifications' ? 'notifications' :
    rawTab === 'appearance' ? 'appearance' :
    rawTab === 'support' ? 'support' :
    'profile';
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    const currentTab = searchParams.get('tab')?.toLowerCase();
    if (currentTab === 'security') setActiveTab('security');
    else if (currentTab === 'notifications') setActiveTab('notifications');
    else if (currentTab === 'appearance') setActiveTab('appearance');
    else if (currentTab === 'support') setActiveTab('support');
    else if (currentTab === 'profile' || currentTab === 'account') setActiveTab('profile');
  }, [searchParams]);

  const handleTabChange = (tabId: SettingsTab) => {
    setActiveTab(tabId);
    setMessage(null);
    setSearchParams({ tab: tabId });
  };

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [revision, setRevision] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Security tab state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passUpdating, setPassUpdating] = useState(false);
  const [passMessage, setPassMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Danger zone state & modals
  const [exportingData, setExportingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [mfaDisabling, setMfaDisabling] = useState(false);
  const [showDisableMfaModal, setShowDisableMfaModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [securityActionNotice, setSecurityActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Notification preferences
  const [notificationPrefs, setNotificationPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem('ime_notification_preferences');
      return saved ? (JSON.parse(saved) as typeof DEFAULT_NOTIFICATIONS) : DEFAULT_NOTIFICATIONS;
    } catch {
      return DEFAULT_NOTIFICATIONS;
    }
  });
  const [notificationsSaved, setNotificationsSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const data = await get<{ success?: boolean; user?: { revision?: number; profile?: UserProfile } }>(
          '/users-data/profile'
        );
        if (!cancelled && data.user) {
          setRevision(Number(data.user.revision ?? 0));
          if (data.user.profile) {
            setProfile(data.user.profile);
          }
        }
      } catch {
        if (!cancelled) {
          setProfile({
            firstName: user?.displayName?.split(' ')[0] ?? '',
            lastName: user?.displayName?.split(' ').slice(1).join(' ') ?? '',
            email: user?.email ?? '',
            phone: '',
            location: '',
            website: '',
            bio: '',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await post<{ success: boolean; user?: { revision?: number; profile?: UserProfile } }>(
        '/users-data/profile',
        {
          expectedRevision: revision,
          profile,
        }
      );
      if (res?.user?.revision !== undefined) {
        setRevision(res.user.revision);
      }
      setMessage({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err) {
      const apiErr = normalizeError(err);
      const details = (apiErr.details || {}) as {
        remoteRevision?: number;
        remoteProfile?: UserProfile | null;
      };
      if (apiErr.code === 'PROFILE_CONFLICT' && details.remoteRevision) {
        setRevision(details.remoteRevision);
        setMessage({
          type: 'error',
          text: 'Profile conflict: remote changes detected. Your edits were kept; please click Save again to overwrite.',
        });
      } else {
        setMessage({ type: 'error', text: apiErr.message });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPassMessage(null);

    if (newPassword.length < 8) {
      setPassMessage({ type: 'error', text: 'Password must be at least 8 characters long.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setPassUpdating(true);
    try {
      if (user) {
        await updatePassword(user as any, newPassword);
        setPassMessage({ type: 'success', text: 'Password updated successfully.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPassMessage({ type: 'error', text: 'You must be signed in to change your password.' });
      }
    } catch (err) {
      setPassMessage({ type: 'error', text: normalizeError(err).message });
    } finally {
      setPassUpdating(false);
    }
  };

  const handleExportData = async () => {
    setExportingData(true);
    setSecurityActionNotice(null);
    try {
      const data = await post<{ success: boolean; export?: unknown }>('/account/export', {});
      const blob = new Blob([JSON.stringify(data.export || data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personal-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSecurityActionNotice({ type: 'success', text: 'Personal data archive exported successfully.' });
    } catch (err) {
      setSecurityActionNotice({ type: 'error', text: `Export failed: ${normalizeError(err).message}` });
    } finally {
      setExportingData(false);
    }
  };

  const confirmDisableMfa = async () => {
    setMfaDisabling(true);
    setSecurityActionNotice(null);
    try {
      await post('/users-data/mfa/disable', {});
      setShowDisableMfaModal(false);
      setSecurityActionNotice({ type: 'success', text: '2FA MFA has been successfully unenrolled.' });
    } catch (err) {
      setSecurityActionNotice({ type: 'error', text: `Failed to disable 2FA: ${normalizeError(err).message}` });
    } finally {
      setMfaDisabling(false);
    }
  };

  const confirmDeleteAccount = async () => {
    if (deleteConfirmInput.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm account deletion.');
      return;
    }

    setDeletingAccount(true);
    setDeleteError(null);
    try {
      await post('/account/delete', {});
      await signOut();
      window.location.href = '/';
    } catch (err) {
      setDeleteError(`Account deletion failed: ${normalizeError(err).message}`);
      setDeletingAccount(false);
    }
  };

  const handleSaveNotificationPreferences = (e: FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem('ime_notification_preferences', JSON.stringify(notificationPrefs));
    } catch {
      // Ignore
    }
    setNotificationsSaved(true);
    setTimeout(() => setNotificationsSaved(false), 4000);
  };

  const tabs: { id: SettingsTab; label: string; icon: typeof User }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security & 2FA', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'support', label: 'Support & Tickets', icon: HelpCircle },
  ];

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">Manage your account preferences, security, and profile.</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Tab navigation */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-56 lg:flex-col" aria-label="Settings sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-secondary hover:bg-neutral-100 hover:text-ink'
                }`}
                aria-current={active ? 'page' : undefined}
                data-testid={`settings-tab-${tab.id}`}
              >
                <Icon className={`size-4 ${active ? 'text-brand-600' : 'text-ink-muted'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content area */}
        <div className="flex-1 max-w-2xl">
          {/* Status message */}
          {message && (
            <div
              className={`mb-4 flex items-center gap-2 rounded-lg border p-3 text-sm ${
                message.type === 'success'
                  ? 'border-success-200 bg-success-50 text-success-700'
                  : 'border-error-200 bg-error-50 text-error-700'
              }`}
              role="alert"
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <AlertTriangle className="size-4 shrink-0" />
              )}
              {message.text}
            </div>
          )}

          {/* Profile tab */}
          {activeTab === 'profile' && (
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update your personal details displayed on your resumes.</CardDescription>
              </CardHeader>
              <form onSubmit={handleSaveProfile}>
                <CardContent className="space-y-4">
                  {profile ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="settings-first-name" className="mb-1.5 block text-sm font-medium text-ink">
                            First name
                          </label>
                          <Input
                            id="settings-first-name"
                            value={profile.firstName}
                            onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                            placeholder="John"
                            required
                          />
                        </div>
                        <div>
                          <label htmlFor="settings-last-name" className="mb-1.5 block text-sm font-medium text-ink">
                            Last name
                          </label>
                          <Input
                            id="settings-last-name"
                            value={profile.lastName}
                            onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                            placeholder="Doe"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="settings-email" className="mb-1.5 block text-sm font-medium text-ink">
                          Email address
                        </label>
                        <Input
                          id="settings-email"
                          type="email"
                          value={profile.email}
                          onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                          placeholder="you@example.com"
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="settings-phone" className="mb-1.5 block text-sm font-medium text-ink">
                          Phone number
                        </label>
                        <Input
                          id="settings-phone"
                          value={profile.phone}
                          onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                      <div>
                        <label htmlFor="settings-location" className="mb-1.5 block text-sm font-medium text-ink">
                          Location
                        </label>
                        <Input
                          id="settings-location"
                          value={profile.location}
                          onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                          placeholder="San Francisco, CA"
                        />
                      </div>
                      <div>
                        <label htmlFor="settings-website" className="mb-1.5 block text-sm font-medium text-ink">
                          Website / Portfolio
                        </label>
                        <Input
                          id="settings-website"
                          type="url"
                          value={profile.website}
                          onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                          placeholder="https://yourportfolio.com"
                        />
                      </div>
                      <div>
                        <label htmlFor="settings-bio" className="mb-1.5 block text-sm font-medium text-ink">
                          Professional summary / Bio
                        </label>
                        <textarea
                          id="settings-bio"
                          value={profile.bio}
                          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                          placeholder="Tell us about yourself…"
                          rows={3}
                          className="flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 focus-visible:border-brand-500 hover:border-neutral-400"
                        />
                      </div>
                    </>
                  ) : null}
                </CardContent>
                <CardFooter>
                  <Button type="submit" loading={saving} disabled={loading} data-testid="save-profile-button">
                    <Save className="size-4" />
                    Save Changes
                  </Button>
                </CardFooter>
              </form>
            </Card>
          )}

          {/* Security tab */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              {securityActionNotice && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`flex items-center gap-2 rounded-lg border p-3.5 text-sm ${
                    securityActionNotice.type === 'success'
                      ? 'border-success-200 bg-success-50 text-success-800'
                      : 'border-error-200 bg-error-50 text-error-800'
                  }`}
                >
                  {securityActionNotice.type === 'success' ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success-600" />
                  ) : (
                    <AlertCircle className="size-4 shrink-0 text-error-600" />
                  )}
                  <span>{securityActionNotice.text}</span>
                </div>
              )}

              {/* Password update */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="size-4 text-ink-muted" />
                    Password
                  </CardTitle>
                  <CardDescription>Change your password to keep your account secure.</CardDescription>
                </CardHeader>
                <form onSubmit={handleUpdatePassword}>
                  <CardContent className="space-y-4">
                    {passMessage && (
                      <div
                        className={`rounded-lg border p-3 text-sm ${
                          passMessage.type === 'success'
                            ? 'border-success-200 bg-success-50 text-success-700'
                            : 'border-error-200 bg-error-50 text-error-700'
                        }`}
                      >
                        {passMessage.text}
                      </div>
                    )}
                    <div>
                      <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium text-ink">
                        Current password
                      </label>
                      <Input
                        id="current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                      />
                    </div>
                    <div>
                      <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-ink">
                        New password
                      </label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-ink">
                        Confirm new password
                      </label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" loading={passUpdating}>
                      <KeyRound className="size-4" />
                      Update Password
                    </Button>
                  </CardFooter>
                </form>
              </Card>

              {/* TOTP 2FA MFA Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="size-4 text-ink-muted" />
                    Two-Factor Authentication (TOTP 2FA)
                  </CardTitle>
                  <CardDescription>
                    Manage server-assisted multi-factor enrollment and active authentication factors.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div>
                      <p className="text-sm font-medium text-ink">Disable 2FA / Unenroll Factors</p>
                      <p className="text-xs text-ink-muted">
                        Unenroll all registered TOTP factors if you lost access to your authenticator app.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDisableMfaModal(true)}
                      loading={mfaDisabling}
                      data-testid="disable-mfa-trigger-button"
                    >
                      <ShieldAlert className="size-3.5 text-warning-600 mr-1" />
                      Disable 2FA
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* GDPR Data Export & Danger zone */}
              <Card className="border-error-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-error-600">
                    <AlertTriangle className="size-4" />
                    Danger Zone & Privacy Compliance
                  </CardTitle>
                  <CardDescription>
                    Export your personal GDPR data archive or permanently delete your account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-4">
                    <div>
                      <p className="text-sm font-medium text-ink">GDPR Personal Data Export</p>
                      <p className="text-xs text-ink-muted">
                        Download a machine-readable JSON archive of your resumes, portfolios, and history.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportData}
                      loading={exportingData}
                      data-testid="export-data-button"
                    >
                      <Download className="size-3.5 mr-1" />
                      Export Data
                    </Button>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-error-200 bg-error-50/50 p-4">
                    <div>
                      <p className="text-sm font-medium text-ink">Delete account</p>
                      <p className="text-xs text-ink-muted">
                        Permanently delete your account, credentials, and all personal data.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setDeleteConfirmInput('');
                        setDeleteError(null);
                        setShowDeleteAccountModal(true);
                      }}
                      loading={deletingAccount}
                      data-testid="delete-account-trigger-button"
                    >
                      <Trash2 className="size-3.5" />
                      Delete Account
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Notifications tab */}
          {activeTab === 'notifications' && (
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Choose how and when you want to receive platform updates and job alerts.</CardDescription>
              </CardHeader>
              <form onSubmit={handleSaveNotificationPreferences}>
                <CardContent>
                  {notificationsSaved && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="mb-4 flex items-center gap-2 rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-800"
                    >
                      <CheckCircle2 className="size-4 shrink-0 text-success-600" />
                      <span>Notification preferences saved successfully.</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    {[
                      { key: 'jobMatches', label: 'Job match alerts', description: 'Get notified when jobs matching your profile are posted' },
                      { key: 'applicationUpdates', label: 'Application updates', description: 'Status changes on your job applications' },
                      { key: 'interviewReminders', label: 'Interview reminders', description: 'Reminders before scheduled practice sessions' },
                      { key: 'platformUpdates', label: 'Platform updates', description: 'New features and product announcements' },
                      { key: 'marketingEmails', label: 'Marketing emails', description: 'Tips, career advice, and promotional content' },
                    ].map((item) => (
                      <label
                        key={item.key}
                        className="flex items-center justify-between rounded-lg border border-border p-4 cursor-pointer hover:bg-neutral-50 transition-colors"
                      >
                        <div>
                          <p className="text-sm font-medium text-ink">{item.label}</p>
                          <p className="text-xs text-ink-muted">{item.description}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean((notificationPrefs as any)[item.key])}
                          onChange={(e) =>
                            setNotificationPrefs((prev) => ({
                              ...prev,
                              [item.key]: e.target.checked,
                            }))
                          }
                          className="size-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                        />
                      </label>
                    ))}
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" data-testid="save-notifications-button">
                    <Save className="size-4" />
                    Save Preferences
                  </Button>
                </CardFooter>
              </form>
            </Card>
          )}

          {/* Appearance tab */}
          {activeTab === 'appearance' && (
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Customize the look and feel of your dashboard.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <h4 className="mb-3 text-sm font-medium text-ink">Theme</h4>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'light' as const, label: 'Light', preview: 'bg-white border' },
                        { id: 'dark' as const, label: 'Dark', preview: 'bg-neutral-900' },
                        { id: 'system' as const, label: 'System', preview: 'bg-linear-to-r from-white to-neutral-900' },
                      ].map((themeOption) => (
                        <button
                          key={themeOption.id}
                          onClick={() => setTheme(themeOption.id)}
                          className={`group rounded-xl border-2 p-3 text-center transition-colors hover:border-brand-400 focus-visible:border-brand-500 ${
                            currentTheme === themeOption.id
                              ? 'border-brand-500 ring-2 ring-brand-200'
                              : 'border-border'
                          }`}
                        >
                          <div className={`mx-auto mb-2 h-12 w-full rounded-lg ${themeOption.preview}`} />
                          <span className="text-xs font-medium text-ink">{themeOption.label}</span>
                          {currentTheme === themeOption.id && (
                            <div className="mt-1">
                              <CheckCircle2 className="mx-auto size-4 text-brand-600" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Support & Tickets tab */}
          {activeTab === 'support' && <CandidateSupportTab />}
        </div>
      </div>

      {/* Disable 2FA Radix Dialog */}
      <Dialog open={showDisableMfaModal} onOpenChange={setShowDisableMfaModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-warning-600" />
              Disable Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to disable multi-factor authentication? Your account will only be protected by your password.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDisableMfaModal(false)}
              disabled={mfaDisabling}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDisableMfa}
              loading={mfaDisabling}
              data-testid="confirm-disable-mfa-button"
            >
              Disable 2FA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Radix Dialog */}
      <Dialog open={showDeleteAccountModal} onOpenChange={setShowDeleteAccountModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-error-600">
              <Trash2 className="size-5" />
              Delete Account & All Data
            </DialogTitle>
            <DialogDescription>
              This is permanent and cannot be undone. All your resumes, cover letters, applications, and settings will be permanently erased.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <div className="flex items-center gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-xs text-error-700">
              <AlertCircle className="size-4 shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}

          <div className="space-y-2 py-1">
            <label htmlFor="confirm-delete-input" className="text-xs font-semibold text-ink">
              Type <span className="font-mono text-error-600">DELETE</span> to confirm:
            </label>
            <Input
              id="confirm-delete-input"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder="DELETE"
              data-testid="confirm-delete-input"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteAccountModal(false)}
              disabled={deletingAccount}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDeleteAccount}
              loading={deletingAccount}
              disabled={deleteConfirmInput.trim().toUpperCase() !== 'DELETE'}
              data-testid="confirm-delete-account-button"
            >
              Permanently Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface UserTicket {
  id: string;
  subject: string;
  priority: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
  messages?: Array<{ id: string; role: string; body: string; createdAt: string }>;
}

function CandidateSupportTab() {
  const [tickets, setTickets] = useState<UserTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newPriority, setNewPriority] = useState('normal');
  const [newMessage, setNewMessage] = useState('');
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [supportMessage, setSupportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const data = await get<{ tickets: UserTicket[] }>('/support/tickets');
      const list = data.tickets ?? [];
      setTickets(list);
      if (list.length > 0 && !selectedTicketId) {
        setSelectedTicketId(list[0].id);
      }
    } catch {
      // Fallback empty
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || tickets[0];

  const handleCreateTicket = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newMessage.trim()) return;

    setSubmitting(true);
    setSupportMessage(null);
    try {
      const res = await post<{ ticket: UserTicket }>('/support/tickets', {
        subject: newSubject,
        priority: newPriority,
        message: newMessage,
      });
      if (res?.ticket) {
        setTickets([res.ticket, ...tickets]);
        setSelectedTicketId(res.ticket.id);
      }
      setShowNewModal(false);
      setNewSubject('');
      setNewMessage('');
      setSupportMessage({ type: 'success', text: 'Support ticket submitted successfully.' });
    } catch (err) {
      setSupportMessage({ type: 'error', text: `Failed to create ticket: ${normalizeError(err).message}` });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;

    setSubmitting(true);
    setSupportMessage(null);
    try {
      const res = await post<{ ticket: UserTicket }>(`/support/tickets/${selectedTicket.id}/messages`, {
        body: replyText,
      });
      if (res?.ticket) {
        setTickets((prev) => prev.map((t) => (t.id === selectedTicket.id ? res.ticket : t)));
      }
      setReplyText('');
      setSupportMessage({ type: 'success', text: 'Reply sent.' });
    } catch (err) {
      setSupportMessage({ type: 'error', text: `Failed to send reply: ${normalizeError(err).message}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {supportMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
            supportMessage.type === 'success'
              ? 'border-success-200 bg-success-50 text-success-800'
              : 'border-error-200 bg-error-50 text-error-800'
          }`}
        >
          {supportMessage.type === 'success' ? (
            <CheckCircle2 className="size-4 shrink-0 text-success-600" />
          ) : (
            <AlertCircle className="size-4 shrink-0 text-error-600" />
          )}
          <span>{supportMessage.text}</span>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-bold text-ink">Support & Help Desk</CardTitle>
            <CardDescription className="text-xs">
              Direct line to our engineering team for account, billing, or export assistance.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchTickets}>
              <RefreshCw className="size-3.5" />
            </Button>
            <Button size="sm" onClick={() => setShowNewModal(true)} data-testid="new-ticket-button">
              <Plus className="size-4 mr-1.5" />
              New Ticket
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-sm text-ink-muted">Loading tickets…</div>
          ) : tickets.length === 0 ? (
            <div className="py-12 text-center text-sm text-ink-muted">
              You currently have no open support tickets.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 rounded-xl border border-border overflow-hidden">
              {/* List */}
              <div className="md:col-span-5 border-b md:border-b-0 md:border-r border-border divide-y divide-border overflow-y-auto max-h-[360px]">
                {tickets.map((t) => {
                  const isSelected = selectedTicket?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTicketId(t.id)}
                      className={`p-3 cursor-pointer text-left transition-colors ${
                        isSelected ? 'bg-brand-50/70' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-ink line-clamp-1">{t.subject}</span>
                        <span className="text-[10px] text-ink-muted shrink-0 ml-2">{t.createdAt}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            t.status === 'OPEN'
                              ? 'bg-amber-100 text-amber-800'
                              : t.status === 'RESOLVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {t.status}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-ink-muted">{t.priority}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Thread */}
              <div className="md:col-span-7 flex flex-col justify-between p-3.5">
                {selectedTicket ? (
                  <>
                    <div>
                      <div className="border-b border-border pb-2 mb-3">
                        <h4 className="text-xs font-bold text-ink">{selectedTicket.subject}</h4>
                        <span className="text-[10px] text-ink-muted">Ticket ID: {selectedTicket.id}</span>
                      </div>
                      <div className="space-y-2.5 max-h-[220px] overflow-y-auto text-xs pr-1">
                        {selectedTicket.messages?.map((m) => (
                          <div
                            key={m.id}
                            className={`p-2.5 rounded-lg max-w-[88%] ${
                              m.role === 'STAFF'
                                ? 'bg-brand-50 border border-brand-100 text-brand-900 ml-auto'
                                : 'bg-neutral-100 text-neutral-800'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[10px] font-semibold text-ink-muted mb-1">
                              <span>{m.role === 'STAFF' ? 'Support Specialist' : 'You'}</span>
                              <span>{m.createdAt}</span>
                            </div>
                            <p className="leading-relaxed whitespace-pre-wrap">{m.body}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <form onSubmit={handleSendReply} className="mt-3 pt-2 border-t border-border flex gap-2">
                      <Input
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Reply to ticket..."
                        className="text-xs flex-1"
                      />
                      <Button type="submit" size="sm" disabled={!replyText.trim() || submitting}>
                        <Send className="size-3.5 mr-1" />
                        Send
                      </Button>
                    </form>
                  </>
                ) : (
                  <div className="py-8 text-center text-xs text-ink-muted">Select a ticket to view conversation</div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New ticket Radix Dialog */}
      <Dialog open={showNewModal} onOpenChange={setShowNewModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Support Ticket</DialogTitle>
            <DialogDescription>
              Submit an inquiry to our support and engineering team. We will respond via this ticket thread.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTicket} className="space-y-3 pt-1">
            <div>
              <label htmlFor="ticket-subject" className="text-xs font-semibold text-ink block mb-1">
                Subject *
              </label>
              <Input
                id="ticket-subject"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Summary of your issue..."
                required
              />
            </div>
            <div>
              <label htmlFor="ticket-priority" className="text-xs font-semibold text-ink block mb-1">
                Priority
              </label>
              <select
                id="ticket-priority"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className="w-full text-xs rounded-lg border border-border p-2 bg-surface"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label htmlFor="ticket-message" className="text-xs font-semibold text-ink block mb-1">
                Message *
              </label>
              <textarea
                id="ticket-message"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={4}
                required
                placeholder="Detailed description of your question or issue..."
                className="w-full text-xs rounded-lg border border-border p-2 bg-surface focus-visible:outline-2 focus-visible:outline-brand-500"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowNewModal(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                Submit Ticket
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
