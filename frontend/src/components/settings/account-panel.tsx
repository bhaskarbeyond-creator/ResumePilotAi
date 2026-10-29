/**
 * Settings → Account & Data: personal data export and account deletion.
 *
 * Export: POST /api/account/export returns the owner-scoped archive, saved as
 * ime365-data-export-YYYY-MM-DD.json (application/json). Sections the server
 * could not read (exportWarnings) are listed and the download is labelled
 * incomplete, never complete.
 *
 * Deletion: POST /api/account/delete runs the backend saga. Personal data is
 * removed in one MariaDB transaction, then the sign-in identity is deleted.
 *  - 200 { success: true }: finished. The session and this account's browser
 *    state are cleared and the home page loads.
 *  - 503 ACCOUNT_IDENTITY_DELETE_FAILED: the data is gone and only identity
 *    removal is pending. "Retry identity removal" re-sends the same request,
 *    which the saga's durable ledger makes safe: it skips the data step when
 *    the state is IDENTITY_PENDING (backend/services/accountDeletion.js).
 *  - 403 RECENT_AUTH_REQUIRED: nothing was deleted; sign in again first.
 *  - anything else, including a 2xx without `success: true`: not reported as
 *    deleted.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, LogIn, LogOut, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NoticeRegions, type Notice } from '@/components/settings/notice-regions';
import { useRestoreFocusWhenIdle } from '@/hooks/use-restore-focus-when-idle';
import {
  DELETION_CONFIRMATION_WORD,
  classifyDeletionFailure,
  clearAccountLocalState,
  isDeletionConfirmed,
  requestAccountDeletion,
  requestDataExport,
  toAccountError,
  type DataExport,
  type ExportWarning,
} from '@/lib/account-settings';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';

export function AccountPanel() {
  return (
    <div className="space-y-6">
      <ExportCard />
      <DeleteAccountCard />
    </div>
  );
}

/**
 * Start the download, then release the object URL on a later task: revoking
 * synchronously can cancel the download in some browsers.
 */
function saveJsonFile(archive: DataExport) {
  const url = URL.createObjectURL(new Blob([archive.json], { type: archive.mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = archive.fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

function ExportCard() {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [warnings, setWarnings] = useState<ExportWarning[]>([]);
  useRestoreFocusWhenIdle(busy, buttonRef);

  const run = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    setWarnings([]);
    try {
      const archive = await requestDataExport();
      saveJsonFile(archive);
      setWarnings(archive.warnings);
      setNotice(archive.warnings.length
        ? {
          tone: 'warning',
          text: `Downloaded ${archive.fileName}, but the export is incomplete: ${archive.warnings.length} ${archive.warnings.length === 1 ? 'section' : 'sections'} could not be fully included. See the list below.`,
        }
        : { tone: 'success', text: `Downloaded ${archive.fileName}.` });
    } catch (error) {
      setNotice({ tone: 'error', text: `Your data was not exported. ${toAccountError(error).message}` });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="size-4 text-ink-muted" aria-hidden="true" />
          Download your data
        </CardTitle>
        <CardDescription>
          A JSON file with your profile, resumes, cover letters, portfolios, applications, job tracker, favourites,
          notifications, messages and billing history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button ref={buttonRef} type="button" variant="outline" onClick={() => void run()} aria-disabled={busy || undefined} aria-busy={busy || undefined}>
          <Download className="size-4" aria-hidden="true" />
          {busy ? 'Preparing your file…' : 'Download my data'}
        </Button>
        <NoticeRegions notice={notice} />
        {warnings.length > 0 && (
          <section aria-labelledby="settings-export-warning-title" className="space-y-2 rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
            <h3 id="settings-export-warning-title" className="flex items-center gap-2 font-semibold">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              This download may be incomplete
            </h3>
            <p>Everything else in the file was exported. These sections are missing or partial:</p>
            <ul className="list-disc space-y-1 pl-5" aria-label="Sections not included">
              {warnings.map((warning, index) => (
                <li key={`${warning.section}-${warning.status}-${index}`}>
                  <span className="font-medium">{warning.section}</span>
                  {' '}({warning.status === 'PARTIAL' ? 'partly exported' : 'not exported'}): {warning.message}
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function DeleteAccountCard() {
  return (
    <Card className="border-error-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-error-700">
          <Trash2 className="size-4" aria-hidden="true" />
          Delete your account
        </CardTitle>
        <CardDescription>Permanently delete your account and personal data. This cannot be undone.</CardDescription>
      </CardHeader>
      <CardContent>
        <DeleteAccountDialog />
      </CardContent>
    </Card>
  );
}

type DeletePhase = 'confirm' | 'busy' | 'partial' | 'sign-in' | 'leaving';

function DeleteAccountDialog() {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<DeletePhase>('confirm');
  const [typed, setTyped] = useState('');
  const [inputError, setInputError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [identityPending, setIdentityPending] = useState(false);
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const busy = phase === 'busy' || phase === 'leaving';
  const confirmed = isDeletionConfirmed(typed);
  const deleteBlocked = busy || (!identityPending && !confirmed);

  // The footer actions change with the outcome; keep focus on the next step.
  useEffect(() => {
    if (phase === 'partial' || phase === 'sign-in') primaryRef.current?.focus();
  }, [phase]);

  // End the session, drop this account's browser state and reload at the home
  // page, so nothing cached from this account stays in memory.
  const leave = async () => {
    busyRef.current = true;
    setPhase('leaving');
    try {
      await signOut();
    } finally {
      clearAccountLocalState(safeStorage('local'), safeStorage('session'));
      window.location.assign('/');
    }
  };

  const onOpenChange = (next: boolean) => {
    if (busyRef.current) return;
    if (next) {
      setPhase('confirm');
      setTyped('');
      setInputError('');
      setNotice(null);
      setIdentityPending(false);
    }
    setOpen(next);
  };

  const remove = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busyRef.current) return;
    const retrying = identityPending;
    if (!retrying && !isDeletionConfirmed(typed)) {
      setInputError(`Type ${DELETION_CONFIRMATION_WORD} in capital letters to confirm.`);
      inputRef.current?.focus();
      return;
    }
    busyRef.current = true;
    setPhase('busy');
    setNotice(null);
    try {
      await requestAccountDeletion();
    } catch (error) {
      busyRef.current = false;
      const outcome = classifyDeletionFailure(error);
      const failure = toAccountError(error);
      if (outcome === 'identity-pending') {
        setIdentityPending(true);
        setPhase('partial');
        setNotice({
          tone: 'error',
          text: retrying
            ? 'The retry did not finish either. Removing your sign-in identity is still pending. Try again in a moment, or sign out and contact support.'
            : 'Your personal data was deleted, but removing your sign-in identity is still pending. Retry now. If it keeps failing, sign out and contact support.',
        });
      } else if (outcome === 'recent-auth') {
        setPhase('sign-in');
        setNotice({
          tone: 'error',
          text: retrying
            ? 'For your security, finishing the deletion needs a sign-in from the last 10 minutes. Sign in again, then return here.'
            : 'For your security, deleting your account needs a sign-in from the last 10 minutes. Nothing was deleted. Sign in again, then return here.',
        });
      } else if (outcome === 'unconfirmed') {
        setPhase(retrying ? 'partial' : 'confirm');
        setNotice({
          tone: 'error',
          text: 'The server did not confirm the deletion, so your account may not be deleted. Try again; repeating the request is safe.',
        });
      } else {
        setPhase(retrying ? 'partial' : 'confirm');
        setNotice({ tone: 'error', text: retrying ? `Removing your sign-in identity failed. ${failure.message}` : `Your account was not deleted. ${failure.message}` });
      }
      return;
    }
    // Confirmed by the server: only now is the session ended.
    await leave();
  };

  const title = identityPending ? 'Your personal data was deleted' : 'Delete your account?';
  const hintVisible = !identityPending && typed.length > 0 && !confirmed && !inputError;
  const describedBy = inputError ? 'settings-delete-confirmation-error' : 'settings-delete-confirmation-hint';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive">
          <Trash2 className="size-4" aria-hidden="true" />
          Delete account…
        </Button>
      </DialogTrigger>
      <DialogContent
        onEscapeKeyDown={(event) => { if (busyRef.current) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (busyRef.current) event.preventDefault(); }}
        onOpenAutoFocus={(event) => {
          // Focus the confirmation field, never the destructive button.
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <form noValidate onSubmit={(event) => void remove(event)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {identityPending
                ? 'Only the removal of your sign-in identity is left. Until it finishes you can still sign in, but your data is gone.'
                : 'This permanently deletes your Master Profile, resumes, cover letters, portfolios, job applications and tracker, favourites, messages, notifications and support tickets, then removes your sign-in identity. Payment records, invoices and security audit logs are retained. This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          {!identityPending && phase !== 'sign-in' && (
            <div>
              <label htmlFor="settings-delete-confirmation" className="mb-1.5 block text-sm font-medium text-ink">
                Type {DELETION_CONFIRMATION_WORD} to confirm
              </label>
              <Input
                ref={inputRef}
                id="settings-delete-confirmation"
                value={typed}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                error={Boolean(inputError)}
                aria-describedby={describedBy}
                readOnly={busy}
                onChange={(event) => { setTyped(event.target.value); setInputError(''); }}
              />
              {inputError
                ? <p id="settings-delete-confirmation-error" className="mt-1 text-xs font-medium text-error-700">{inputError}</p>
                : (
                  <p id="settings-delete-confirmation-hint" className={cn('mt-1 text-xs', hintVisible ? 'font-medium text-error-700' : 'text-ink-muted')}>
                    {hintVisible
                      ? `Type ${DELETION_CONFIRMATION_WORD} in capital letters to confirm.`
                      : `The delete button stays unavailable until you type ${DELETION_CONFIRMATION_WORD} exactly.`}
                  </p>
                )}
            </div>
          )}
          <NoticeRegions notice={notice} />
          <DialogFooter className="gap-2">
            {phase === 'sign-in' ? (
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button ref={primaryRef} type="button" onClick={() => void signOut()}>
                  <LogIn className="size-4" aria-hidden="true" />
                  Sign in again
                </Button>
              </>
            ) : identityPending ? (
              <>
                <Button type="button" variant="outline" onClick={() => { if (!busyRef.current) void leave(); }} aria-disabled={busy || undefined}>
                  <LogOut className="size-4" aria-hidden="true" />
                  Sign out
                </Button>
                <Button ref={primaryRef} type="submit" variant="destructive" aria-disabled={busy || undefined} aria-busy={phase === 'busy' || undefined}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {phase === 'busy' ? 'Retrying…' : 'Retry identity removal'}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} aria-disabled={busy || undefined}>Cancel</Button>
                <Button
                  type="submit"
                  variant="destructive"
                  aria-disabled={deleteBlocked || undefined}
                  aria-busy={phase === 'busy' || undefined}
                  className={cn(deleteBlocked && 'opacity-60')}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {phase === 'busy' ? 'Deleting…' : 'Delete my account'}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}
