/**
 * Settings Page
 *
 * Account settings: profile info, email, password change, connected accounts,
 * preferences, and danger zone (account deletion).
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/loading';
import { get, post, normalizeError } from '@/lib/api-client';
import {
  User,
  Mail,
  Lock,
  Shield,
  Bell,
  Palette,
  AlertTriangle,
  CheckCircle2,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Globe,
  Upload,
  HelpCircle,
  Send,
  Plus,
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

export function SettingsPage() {
  const { user } = useAuth();
  const { theme: currentTheme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const data = await get<{ profile: UserProfile }>('/users/profile');
        if (!cancelled) setProfile(data.profile);
      } catch (err) {
        if (!cancelled) {
          // Initialize with fallback from auth
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
    return () => { cancelled = true; };
  }, [user]);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setMessage(null);
    try {
      await post('/users/profile', profile);
      setMessage({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err) {
      const apiErr = normalizeError(err);
      setMessage({ type: 'error', text: apiErr.message });
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: typeof User }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'support', label: 'Support & Tickets', icon: HelpCircle },
  ];

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">Manage your account preferences and profile.</p>
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
                onClick={() => { setActiveTab(tab.id); setMessage(null); }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-secondary hover:bg-neutral-100 hover:text-ink'
                }`}
                aria-current={active ? 'page' : undefined}
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
              {message.type === 'success' ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
              {message.text}
            </div>
          )}

          {/* Profile tab */}
          {activeTab === 'profile' && (
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update your personal information and public profile.</CardDescription>
              </CardHeader>
              <form onSubmit={handleSaveProfile}>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="space-y-4">
                      <Skeleton className="h-9 w-full" />
                      <Skeleton className="h-9 w-full" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  ) : profile ? (
                    <>
                      {/* Avatar area */}
                      <div className="flex items-center gap-4">
                        <div className="flex size-16 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
                          {(profile.firstName?.[0] ?? '').toUpperCase()}{(profile.lastName?.[0] ?? '').toUpperCase()}
                        </div>
                        <div>
                          <Button type="button" variant="outline" size="sm">
                            <Upload className="size-3.5" />
                            Upload photo
                          </Button>
                          <p className="mt-1 text-xs text-ink-muted">JPG, PNG or GIF. Max 2MB.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="settings-firstName" className="mb-1.5 block text-sm font-medium text-ink">First name</label>
                          <Input
                            id="settings-firstName"
                            value={profile.firstName}
                            onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                            placeholder="John"
                          />
                        </div>
                        <div>
                          <label htmlFor="settings-lastName" className="mb-1.5 block text-sm font-medium text-ink">Last name</label>
                          <Input
                            id="settings-lastName"
                            value={profile.lastName}
                            onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                            placeholder="Doe"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="settings-email" className="mb-1.5 block text-sm font-medium text-ink">
                          <span className="flex items-center gap-1.5"><Mail className="size-3.5 text-ink-muted" /> Email</span>
                        </label>
                        <Input
                          id="settings-email"
                          type="email"
                          value={profile.email}
                          disabled
                          className="bg-neutral-50"
                        />
                        <p className="mt-1 text-xs text-ink-muted">Email is managed through your authentication provider.</p>
                      </div>

                      <div>
                        <label htmlFor="settings-phone" className="mb-1.5 block text-sm font-medium text-ink">Phone</label>
                        <Input
                          id="settings-phone"
                          type="tel"
                          value={profile.phone}
                          onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>

                      <div>
                        <label htmlFor="settings-location" className="mb-1.5 block text-sm font-medium text-ink">
                          <span className="flex items-center gap-1.5"><Globe className="size-3.5 text-ink-muted" /> Location</span>
                        </label>
                        <Input
                          id="settings-location"
                          value={profile.location}
                          onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                          placeholder="New York, NY"
                        />
                      </div>

                      <div>
                        <label htmlFor="settings-bio" className="mb-1.5 block text-sm font-medium text-ink">Bio</label>
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
                  <Button type="submit" loading={saving} disabled={loading}>
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
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="size-4 text-ink-muted" />
                    Password
                  </CardTitle>
                  <CardDescription>Change your password to keep your account secure.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium text-ink">Current password</label>
                    <Input id="current-password" type="password" placeholder="••••••••" autoComplete="current-password" />
                  </div>
                  <div>
                    <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-ink">New password</label>
                    <Input id="new-password" type="password" placeholder="••••••••" autoComplete="new-password" />
                  </div>
                  <div>
                    <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-ink">Confirm new password</label>
                    <Input id="confirm-password" type="password" placeholder="••••••••" autoComplete="new-password" />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button>
                    <Lock className="size-4" />
                    Update Password
                  </Button>
                </CardFooter>
              </Card>

              {/* Danger zone */}
              <Card className="border-error-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-error-600">
                    <AlertTriangle className="size-4" />
                    Danger Zone
                  </CardTitle>
                  <CardDescription>Irreversible actions that will permanently affect your account.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between rounded-lg border border-error-200 bg-error-50/50 p-4">
                    <div>
                      <p className="text-sm font-medium text-ink">Delete account</p>
                      <p className="text-xs text-ink-muted">Permanently delete your account and all data.</p>
                    </div>
                    <Button variant="destructive" size="sm">
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
                <CardDescription>Choose how and when you want to be notified.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: 'Job match alerts', description: 'Get notified when jobs matching your profile are posted' },
                    { label: 'Application updates', description: 'Status changes on your job applications' },
                    { label: 'Interview reminders', description: 'Reminders before scheduled practice sessions' },
                    { label: 'Platform updates', description: 'New features and product announcements' },
                    { label: 'Marketing emails', description: 'Tips, career advice, and promotional content' },
                  ].map((item) => (
                    <label
                      key={item.label}
                      className="flex items-center justify-between rounded-lg border border-border p-4 cursor-pointer hover:bg-neutral-50 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink">{item.label}</p>
                        <p className="text-xs text-ink-muted">{item.description}</p>
                      </div>
                      <input
                        type="checkbox"
                        defaultChecked
                        className="size-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                      />
                    </label>
                  ))}
                </div>
              </CardContent>
              <CardFooter>
                <Button>
                  <Save className="size-4" />
                  Save Preferences
                </Button>
              </CardFooter>
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

const DEFAULT_USER_TICKETS: UserTicket[] = [
  {
    id: 'tk-1',
    subject: 'Assistance with ATS export typography formatting',
    priority: 'normal',
    status: 'IN_PROGRESS',
    createdAt: 'Yesterday',
    messages: [
      { id: 'm-1', role: 'USER', body: 'Hi support team, I noticed my skills section was wrapped on two lines in template #4. Is there an option to adjust bullet margin?', createdAt: 'Yesterday' },
      { id: 'm-2', role: 'STAFF', body: 'Hello! You can switch the spacing density from Comfortable to Compact under the Resume Builder > Design tab to adjust bullet line-height.', createdAt: '4 hours ago' },
    ],
  },
];

function CandidateSupportTab() {
  const [tickets, setTickets] = useState<UserTicket[]>(DEFAULT_USER_TICKETS);
  const [selectedTicketId, setSelectedTicketId] = useState<string>(DEFAULT_USER_TICKETS[0]?.id ?? '');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newPriority, setNewPriority] = useState('normal');
  const [newMessage, setNewMessage] = useState('');
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || tickets[0];

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newMessage.trim()) return;

    setSubmitting(true);
    setTimeout(() => {
      const created: UserTicket = {
        id: `tk-${Date.now()}`,
        subject: newSubject,
        priority: newPriority,
        status: 'OPEN',
        createdAt: 'Just now',
        messages: [{ id: `m-${Date.now()}`, role: 'USER', body: newMessage, createdAt: 'Just now' }],
      };
      setTickets([created, ...tickets]);
      setSelectedTicketId(created.id);
      setShowNewModal(false);
      setNewSubject('');
      setNewMessage('');
      setSubmitting(false);
    }, 600);
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;

    const newMsg = {
      id: `m-${Date.now()}`,
      role: 'USER',
      body: replyText,
      createdAt: 'Just now',
    };

    setTickets((prev) =>
      prev.map((t) =>
        t.id === selectedTicket.id
          ? { ...t, messages: [...(t.messages || []), newMsg] }
          : t,
      ),
    );
    setReplyText('');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-bold text-ink">Support & Help Desk</CardTitle>
            <CardDescription className="text-xs">
              Reach out directly to our engineering support team for account, billing, or export assistance.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowNewModal(true)}>
            <Plus className="size-4 mr-1.5" />
            New Ticket
          </Button>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
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
                        <span className="text-[10px] text-ink-muted">Created {selectedTicket.createdAt}</span>
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
                      <Button type="submit" size="sm" disabled={!replyText.trim()}>
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

      {/* New Ticket Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/40 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-ink">Submit Support Ticket</h3>
            <form onSubmit={handleCreateTicket} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-ink block mb-1">Subject</label>
                <Input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="Summary of issue or question..."
                  required
                  className="text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Priority</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                >
                  <option value="low">Low Priority</option>
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Message Description</label>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Provide context or steps to reproduce..."
                  required
                  rows={4}
                  className="w-full rounded-lg border border-border bg-surface p-2.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowNewModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={submitting}>
                  Submit Ticket
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
