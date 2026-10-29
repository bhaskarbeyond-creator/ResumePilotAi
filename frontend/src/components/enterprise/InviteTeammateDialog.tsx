import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Shield, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type AssignableInviteRole,
  INVITE_ROLE_METADATA,
  type InviteMemberResult,
  SEAT_LIMIT_CONFLICT_MESSAGE,
  inviteEnterpriseMember,
  isSeatLimitConflictError,
  normalizeError,
  validateInviteEmail,
} from '@/lib/enterprise-seats';

export interface InviteTeammateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId?: string | null;
  canAssignOwner?: boolean;
  onInvited: (result: InviteMemberResult) => Promise<void> | void;
  onSeatLimitConflict?: () => void;
  onReviewInvites?: () => void;
}

export function InviteTeammateDialog({
  open,
  onOpenChange,
  tenantId,
  canAssignOwner = false,
  onInvited,
  onSeatLimitConflict,
  onReviewInvites,
}: InviteTeammateDialogProps) {
  const emailFieldId = useId();
  const emailHintId = useId();
  const emailErrorId = useId();
  const roleFieldId = useId();
  const roleDescId = useId();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableInviteRole>('MEMBER');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [seatLimitReached, setSeatLimitReached] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const availableRoles: AssignableInviteRole[] = canAssignOwner
    ? ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']
    : ['ADMIN', 'MEMBER', 'VIEWER'];

  useEffect(() => {
    if (!canAssignOwner && role === 'OWNER') {
      setRole('MEMBER');
    }
  }, [canAssignOwner, role]);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && submitting) return;
    if (!nextOpen) {
      setFieldError(null);
      setSubmitError(null);
      setSeatLimitReached(false);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const validationMessage = validateInviteEmail(email);
    if (validationMessage) {
      setFieldError(validationMessage);
      return;
    }

    setFieldError(null);
    setSubmitError(null);
    setSeatLimitReached(false);
    setSubmitting(true);

    try {
      const result = await inviteEnterpriseMember({ email, role }, tenantId);
      // Reset and close only after confirmed backend success
      setEmail('');
      setRole('MEMBER');
      setFieldError(null);
      setSubmitError(null);
      setSeatLimitReached(false);
      onOpenChange(false);
      await onInvited(result);
    } catch (err) {
      const normalized = normalizeError(err);
      if (isSeatLimitConflictError(normalized)) {
        // Exact required 409 SEAT_LIMIT_REACHED message; preserve email & role and keep modal open
        setSeatLimitReached(true);
        setSubmitError(SEAT_LIMIT_CONFLICT_MESSAGE);
        onSeatLimitConflict?.();
      } else {
        setSubmitError(normalized.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectedRoleMeta = INVITE_ROLE_METADATA[role];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-ink">
            <UserPlus className="size-5 text-brand-600 shrink-0" aria-hidden="true" />
            <span>Invite Teammate</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-ink-muted">
            Send a workspace invitation and assign role permissions. Each active member or pending invite reserves one workspace seat.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-4">
          {submitError && (
            <div
              role="alert"
              className="rounded-xl border border-error-200 bg-error-50 p-3.5 text-xs text-error-800 dark:border-error-900 dark:bg-error-950/50 dark:text-error-200 space-y-2.5"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p className="font-semibold leading-relaxed">{submitError}</p>
              </div>
              {seatLimitReached && (
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link to="/pricing" onClick={() => handleClose(false)}>
                      Upgrade Enterprise Tier
                    </Link>
                  </Button>
                  {onReviewInvites && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        handleClose(false);
                        onReviewInvites();
                      }}
                    >
                      Review Pending Invites
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor={emailFieldId} className="mb-1.5 block text-sm font-medium text-ink">
              Work Email Address
            </label>
            <Input
              id={emailFieldId}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldError) setFieldError(null);
              }}
              placeholder="user@example.com"
              disabled={submitting}
              error={Boolean(fieldError)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? `${emailHintId} ${emailErrorId}` : emailHintId}
            />
            <p id={emailHintId} className="mt-1 text-xs text-ink-muted">
              We will normalize and queue an enterprise invitation to this address.
            </p>
            {fieldError && (
              <p id={emailErrorId} role="alert" className="mt-1 text-xs font-medium text-error-600">
                {fieldError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={roleFieldId} className="mb-1.5 block text-sm font-medium text-ink">
              Workspace Role
            </label>
            <Select
              value={role}
              onValueChange={(val) => setRole(val as AssignableInviteRole)}
              disabled={submitting}
            >
              <SelectTrigger id={roleFieldId} aria-describedby={roleDescId}>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((roleKey) => (
                  <SelectItem key={roleKey} value={roleKey}>
                    {INVITE_ROLE_METADATA[roleKey].label} ({roleKey})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div
              id={roleDescId}
              className="mt-2 rounded-xl border border-border bg-neutral-50/70 p-3 text-xs dark:bg-neutral-900/50"
            >
              <p className="flex items-center gap-1.5 font-semibold text-ink">
                <Shield className="size-3.5 text-brand-600 shrink-0" aria-hidden="true" />
                <span>{selectedRoleMeta.label}: {selectedRoleMeta.summary}</span>
              </p>
              <p className="mt-1 text-ink-muted">{selectedRoleMeta.permissionsHint}</p>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? 'Sending Invitation…' : 'Send Invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
