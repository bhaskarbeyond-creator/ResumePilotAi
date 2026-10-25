/**
 * TeamSeats — Employer Portal
 *
 * Hiring team seats, RBAC permissions matrix, and recruiter collaboration:
 * - Seat utilization meter (Active Seats vs Total Entitlement)
 * - Team member roster with roles (Admin, Recruiter, Viewer)
 * - Invite team member workflow with email and role selection
 * - Granular permissions matrix for recruitment operations
 */

import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Check,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Recruiter' | 'Viewer';
  status: 'active' | 'invited';
  avatar?: string;
  joinedDate: string;
}

const INITIAL_TEAM: TeamMember[] = [
  {
    id: 'tm-1',
    name: 'Primary Recruiter (You)',
    email: 'hiring@resumepilot.io',
    role: 'Admin',
    status: 'active',
    joinedDate: '2026-08-10',
  },
  {
    id: 'tm-2',
    name: 'Jessica Reynolds',
    email: 'jessica.r@resumepilot.io',
    role: 'Recruiter',
    status: 'active',
    joinedDate: '2026-09-01',
  },
  {
    id: 'tm-3',
    name: 'David Chen',
    email: 'david.c@resumepilot.io',
    role: 'Viewer',
    status: 'invited',
    joinedDate: '2026-10-14',
  },
];

const PERMISSIONS = [
  { action: 'Post & edit job requisitions', admin: true, recruiter: true, viewer: false },
  { action: 'Review candidate applications & resumes', admin: true, recruiter: true, viewer: true },
  { action: 'Advance candidate hiring stages', admin: true, recruiter: true, viewer: false },
  { action: 'Extend formal offers & reject candidates', admin: true, recruiter: true, viewer: false },
  { action: 'Manage company branding & entity settings', admin: true, recruiter: false, viewer: false },
  { action: 'Invite & manage recruiter team seats', admin: true, recruiter: false, viewer: false },
];

export function TeamSeats() {
  const { user } = useAuth();
  const [team, setTeam] = useState<TeamMember[]>(INITIAL_TEAM);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'Recruiter' | 'Viewer' | 'Admin'>('Recruiter');
  const [inviteSuccess, setInviteSuccess] = useState(false);

  useEffect(() => {
    if (user?.email) {
      const displayName = user.displayName ? `${user.displayName} (You)` : `${user.email} (You)`;
      setTeam((prev) =>
        prev.map((m) =>
          m.id === 'tm-1'
            ? { ...m, name: displayName, email: user.email || m.email }
            : m
        )
      );
    }
  }, [user?.displayName, user?.email]);

  useEffect(() => {
    if (!showInviteModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowInviteModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showInviteModal]);

  const totalSeats = 5;
  const usedSeats = team.length;

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) return;

    const newMember: TeamMember = {
      id: `tm-${Date.now()}`,
      name: inviteName.trim(),
      email: inviteEmail.trim(),
      role: inviteRole,
      status: 'invited',
      joinedDate: new Date().toISOString().split('T')[0],
    };

    setTeam([...team, newMember]);
    setInviteSuccess(true);
    setTimeout(() => {
      setInviteSuccess(false);
      setShowInviteModal(false);
      setInviteName('');
      setInviteEmail('');
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Header and Seat Utilization Meter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            <Users className="size-5 text-accent" />
            Recruiter Team Seats & Access Control
          </h3>
          <p className="text-xs text-ink-muted">
            Collaborate with hiring managers, screeners, and interview loop participants.
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setShowInviteModal(true)}
          disabled={usedSeats >= totalSeats}
          className="text-xs font-semibold gap-1.5 self-start sm:self-auto bg-accent hover:bg-accent/90"
        >
          <UserPlus className="size-3.5" /> Invite Team Member
        </Button>
      </div>

      {/* Seat Meter Banner */}
      <div className="p-4 rounded-xl border border-edge bg-surface shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-ink">
            <span>Seat Capacity:</span>
            <span className="text-accent">{usedSeats} of {totalSeats} Used</span>
          </div>
          <div className="w-48 sm:w-64 h-2 bg-canvas-soft rounded-full overflow-hidden border border-edge">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${(usedSeats / totalSeats) * 100}%` }}
            />
          </div>
        </div>

        <p className="text-xs text-ink-muted">
          {totalSeats - usedSeats} team seats available under your current tier plan.
        </p>
      </div>

      {/* Team Roster Card */}
      <Card className="border-edge shadow-sm">
        <CardHeader className="border-b border-edge pb-3">
          <CardTitle className="text-sm font-bold text-ink">Active Team Members</CardTitle>
          <CardDescription className="text-xs text-ink-muted">
            Authorized recruiters and viewers with pipeline access
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-edge">
            {team.map((member) => (
              <div
                key={member.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-canvas-soft/30 transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <div className="size-10 rounded-full bg-accent/15 text-accent font-bold text-xs flex items-center justify-center border border-accent/20">
                    {member.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-ink">{member.name}</h4>
                      <span
                        className={cn(
                          'text-[10px] font-semibold px-2 py-0.5 rounded border',
                          member.role === 'Admin'
                            ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30'
                            : member.role === 'Recruiter'
                            ? 'bg-accent/15 text-accent border-accent/30'
                            : 'bg-canvas-soft text-ink-muted border-edge'
                        )}
                      >
                        {member.role}
                      </span>
                      {member.status === 'invited' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                          Pending Invite
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5">{member.email}</p>
                  </div>
                </div>

                <div className="text-left sm:text-right text-xs text-ink-muted">
                  <span>Joined {member.joinedDate}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Permissions Matrix */}
      <Card className="border-edge shadow-sm">
        <CardHeader className="border-b border-edge pb-3">
          <CardTitle className="text-sm font-bold text-ink flex items-center gap-2">
            <Shield className="size-4 text-accent" />
            Role Permissions Matrix
          </CardTitle>
          <CardDescription className="text-xs text-ink-muted">
            Enforced server-side via RBAC guards
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs text-left min-w-[500px]">
            <thead>
              <tr className="border-b border-edge bg-canvas-soft/60">
                <th className="p-3 font-semibold text-ink">Action / Scope</th>
                <th className="p-3 font-semibold text-ink text-center">Admin</th>
                <th className="p-3 font-semibold text-ink text-center">Recruiter</th>
                <th className="p-3 font-semibold text-ink text-center">Viewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {PERMISSIONS.map((p, idx) => (
                <tr key={idx} className="hover:bg-canvas-soft/20">
                  <td className="p-3 text-ink font-medium">{p.action}</td>
                  <td className="p-3 text-center">
                    {p.admin ? <Check className="size-4 text-emerald-500 mx-auto" /> : <Lock className="size-3 text-ink-muted mx-auto" />}
                  </td>
                  <td className="p-3 text-center">
                    {p.recruiter ? <Check className="size-4 text-emerald-500 mx-auto" /> : <Lock className="size-3 text-ink-muted mx-auto" />}
                  </td>
                  <td className="p-3 text-center">
                    {p.viewer ? <Check className="size-4 text-emerald-500 mx-auto" /> : <Lock className="size-3 text-ink-muted mx-auto" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface border border-edge rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div>
              <h4 className="text-base font-bold text-ink">Invite Recruiter or Hiring Manager</h4>
              <p className="text-xs text-ink-muted mt-0.5">
                Grant authorized access to review applicants and manage pipeline stages.
              </p>
            </div>

            {inviteSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="size-4" />
                <span>Invitation link generated & sent!</span>
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Full Name</label>
                <Input
                  required
                  placeholder="e.g. Rachel Sterling"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Work Email</label>
                <Input
                  required
                  type="email"
                  placeholder="rachel@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Role Assignment</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full text-xs h-9 px-3 rounded-md border border-edge bg-surface text-ink"
                >
                  <option value="Recruiter">Recruiter (Can post jobs & advance pipeline)</option>
                  <option value="Viewer">Viewer (Read-only applicant inspection)</option>
                  <option value="Admin">Admin (Full company & seat administration)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowInviteModal(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="text-xs font-semibold bg-accent hover:bg-accent/90">
                  Send Invitation
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
