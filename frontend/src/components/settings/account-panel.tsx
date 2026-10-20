/**
 * Settings → Account & Data: personal data export and account deletion.
 *
 * Export: POST /api/account/export returns the owner-scoped archive, saved as a
 * JSON file; sections the server could not read are listed, never hidden.
 * Deletion: POST /api/account/delete runs the backend saga. Personal data is
 * removed in one MariaDB transaction, then the sign-in identity is deleted.
 * 503 ACCOUNT_IDENTITY_DELETE_FAILED means the data is gone and only the
 * identity step is pending (retryable); 403 RECENT_AUTH_REQUIRED means nothing
 * was deleted because the sign-in is older than the server's window.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, LogIn, LogOut, RotateCcw, Trash2 } from 'lucide-react';
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
  requestAccountDeletion,
  requestDataExport,
  toAccountError,
  type ExportWarning,
} from '@/lib/account-settings';
import { useAuth } from '@/providers/auth-provider';

export function AccountPanel() {
  return (
    <div className="space-y-6">
      <ExportCard />
      <DeleteAccountCard />
    </div>
  );
}

function saveJsonFile(fileName: string, json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
      saveJsonFile(archive.fileName, archive.json);
      setWarnings(archive.warnings);
      setNotice({
        tone: 'success',
        text: archive.warnings.length
          ? `Downloaded ${archive.fileName}. ${archive.warnings.length} ${archive.warnings.length === 1 ? 'section' : 'sections'} could not be included; see the list below.`
          : `Downloaded ${archive.fileName}.`,
      });
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
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-secondary" aria-label="Sections not included">
            {warnings.map((warning) => (
              <li key={`${warning.section}-${warning.status}`}>
                <span className="font-medium text-ink">{warning.section}</span>: {warning.message}
              </li>
            ))}
          </ul>
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

type DeletePhase = 'confirm' | 'busy' | 'partial' | 'sign-in';
const CONFIRMATION_WORD = 'DELETE';

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
  const busy = phase === 'busy';

  // The footer actions change with the outcome; keep focus on the next step.
  useEffect(() => {
    if (phase === 'partial' || phase === 'sign-in') primaryRef.current?.focus();
  }, [phase]);

  // End the session and reload at the home page, so nothing cached from this
  // account stays in memory.
  const leave = async () => {
    await signOut();
    window.location.assign('/');
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
    if (!retrying && typed.trim() !== CONFIRMATION_WORD) {
      setInputError(`Type ${CONFIRMATION_WORD} in capital letters to confirm.`);
      inputRef.current?.focus();
      return;
    }
    busyRef.current = true;
    setPhase('busy');
    setNotice(null);
    try {
      await requestAccountDeletion();
      await leave();
      return;
    } catch (error) {
      const failure = toAccountError(error);
      if (failure.code === 'ACCOUNT_IDENTITY_DELETE_FAILED') {
        setIdentityPending(true);
        setPhase('partial');
        setNotice({
          tone: 'error',
          text: retrying
            ? 'The retry did not finish either. Removing your sign-in identity is still pending. Try again in a moment, or sign out and contact support.'
            : 'Your personal data was deleted, but removing your sign-in identity is still pending. Retry now. If it keeps failing, sign out and contact support.',
        });
      } else if (failure.needsRecentSignIn) {
        setPhase('sign-in');
        setNotice({
          tone: 'error',
          text: `For your security, ${retrying ? 'finishing the deletion' : 'deleting your account'} needs a sign-in from the last 10 minutes. ${retrying ? '' : 'Nothing was deleted. '}Sign in again, then return here.`,
        });
      } else {
        setPhase(retrying ? 'partial' : 'confirm');
        setNotice({ tone: 'error', text: retrying ? `Removing your sign-in identity failed. ${failure.message}` : `Your account was not deleted. ${failure.message}` });
      }
    } finally {
      busyRef.current = false;
    }
  };

  const title = identityPending ? 'Your personal data was deleted' : 'Delete your account?';

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
                Type {CONFIRMATION_WORD} to confirm
              </label>
              <Input
                ref={inputRef}
                id="settings-delete-confirmation"
                value={typed}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                error={Boolean(inputError)}
                aria-describedby={inputError ? 'settings-delete-confirmation-error' : undefined}
                readOnly={busy}
                onChange={(event) => { setTyped(event.target.value); setInputError(''); }}
              />
              {inputError && <p id="settings-delete-confirmation-error" className="mt-1 text-xs font-medium text-error-700">{inputError}</p>}
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
                <Button ref={primaryRef} type="submit" variant="destructive" aria-disabled={busy || undefined} aria-busy={busy || undefined}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {busy ? 'Retrying…' : 'Retry identity removal'}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} aria-disabled={busy || undefined}>Cancel</Button>
                <Button type="submit" variant="destructive" aria-disabled={busy || undefined} aria-busy={busy || undefined}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  {busy ? 'Deleting…' : 'Delete my account'}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
