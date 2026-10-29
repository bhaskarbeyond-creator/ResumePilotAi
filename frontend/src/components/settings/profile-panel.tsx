/**
 * Settings → Master Profile.
 *
 * Reads and writes the real `users` profile projection through
 * GET/POST /api/users-data/profile with optimistic concurrency: every save
 * names the revision it builds on (`expectedRevision`), and the revision the
 * server returns becomes the next baseline.
 *
 * 409 PROFILE_CONFLICT never touches the form. The banner offers three
 * explicit choices and nothing is retried on its own:
 *   - Keep my edits: re-send the edited fields on top of the revision the
 *     server reported as current (another conflict repeats this workflow);
 *   - Review differences: a dialog listing this form's values next to the
 *     newer saved ones;
 *   - Discard my edits: fetch the latest version and replace the form only
 *     once that fetch succeeded.
 *
 * A save that resolves late never erases typing done while it was in flight
 * (rebaseDraftAfterSave). The same fields seed new resumes
 * (lib/master-profile.ts) and cover letters.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, RefreshCw, Save, Undo2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NoticeRegions, type Notice } from '@/components/settings/notice-regions';
import { queryKeys } from '@/hooks/use-api-hooks';
import { useRestoreFocusWhenIdle } from '@/hooks/use-restore-focus-when-idle';
import {
  PROFILE_FIELDS,
  changedProfileFields,
  clearRegistrationProfileSyncFlag,
  fetchProfile,
  readRegistrationProfileSyncFailed,
  saveProfile,
  toAccountError,
  validateProfile,
  type AccountApiError,
  type ProfileConflict,
  type ProfileFieldKey,
  type ProfileFieldSpec,
  type ProfileFields,
  type ProfileSnapshot,
} from '@/lib/account-settings';
import { describeProfileConflict, rebaseDraftAfterSave, settingsProfileCompleteness } from '@/lib/master-profile';
import { cn } from '@/lib/utils';

const SPEC = Object.fromEntries(PROFILE_FIELDS.map((field) => [field.key, field])) as Record<ProfileFieldKey, ProfileFieldSpec>;

const GROUPS: ReadonlyArray<{ legend: string; fields: ReadonlyArray<{ key: ProfileFieldKey; half?: boolean }> }> = [
  { legend: 'Name and headline', fields: [{ key: 'firstname', half: true }, { key: 'lastname', half: true }, { key: 'occupation' }] },
  { legend: 'Contact and location', fields: [{ key: 'phone', half: true }, { key: 'country', half: true }, { key: 'address' }, { key: 'city', half: true }, { key: 'postalCode', half: true }] },
  { legend: 'Links', fields: [{ key: 'websiteUrl' }, { key: 'linkedinUrl' }, { key: 'githubUrl' }] },
  { legend: 'Summary', fields: [{ key: 'summary' }] },
];

const fieldId = (key: ProfileFieldKey) => `settings-profile-${key}`;

/**
 * The signed-in user's Master Profile. Kept with the Settings chunk (not in the
 * shared hooks module) so the profile client loads only with this page.
 */
function useMasterProfile() {
  return useQuery<ProfileSnapshot, AccountApiError>({
    queryKey: queryKeys.dashboard.profile,
    queryFn: ({ signal }) => fetchProfile(signal),
    staleTime: 30_000,
  });
}

export function ProfilePanel() {
  const query = useMasterProfile();

  // Data wins over a failed background refetch, so an open draft is never replaced.
  if (query.data) return <ProfileForm snapshot={query.data} />;

  if (!query.isError) {
    return (
      <Card aria-busy="true">
        <CardContent className="space-y-4 py-6">
          <p className="text-sm text-ink-muted">Loading your Master Profile…</p>
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-9 animate-pulse rounded-lg bg-canvas-soft" aria-hidden="true" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-6">
        <div role="alert" className="space-y-1">
          <p className="text-sm font-medium text-ink">Your Master Profile could not be loaded.</p>
          <p className="text-sm text-ink-muted">{query.error.message}</p>
        </div>
        <p className="text-sm text-ink-muted">Nothing is shown here until the saved version loads, so nothing can be overwritten by mistake.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()} aria-busy={query.isFetching || undefined}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {query.isFetching ? 'Retrying…' : 'Retry'}
        </Button>
      </CardContent>
    </Card>
  );
}

type Busy = 'idle' | 'saving' | 'overwriting' | 'reloading';

function ProfileForm({ snapshot }: { snapshot: ProfileSnapshot }) {
  const queryClient = useQueryClient();
  const [baseline, setBaseline] = useState<ProfileFields>(snapshot.fields);
  const [draft, setDraft] = useState<ProfileFields>(snapshot.fields);
  const [revision, setRevision] = useState(snapshot.revision);
  const [attempted, setAttempted] = useState(false);
  // Registration created the account but could not store the typed names.
  const [notice, setNotice] = useState<Notice | null>(() => (readRegistrationProfileSyncFailed()
    ? { tone: 'info', text: 'Your account was created, but the name you entered at sign-up was not saved. Enter it below and save.' }
    : null));
  const [conflict, setConflict] = useState<ProfileConflict | null>(null);
  const [busy, setBusy] = useState<Busy>('idle');
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const saveRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const changes = changedProfileFields(draft, baseline);
  const dirty = Object.keys(changes).length > 0;
  const liveErrors = validateProfile(draft);
  const invalid = Object.keys(liveErrors).length > 0;
  // Errors show for fields the user changed, and for every field after a save attempt.
  const shownErrors = Object.fromEntries(Object.entries(liveErrors).filter(([key]) => attempted || key in changes)) as Partial<Record<ProfileFieldKey, string>>;
  const canSave = dirty && !invalid && busy === 'idle' && !conflict;
  const completeness = settingsProfileCompleteness(baseline);
  useRestoreFocusWhenIdle(busy !== 'idle', saveRef);

  // Set on every mount: StrictMode (dev) mounts, unmounts and mounts again.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // While nothing is unsaved (and no conflict is open), the form mirrors the
  // latest saved version (a refetch or another tab). With unsaved edits it
  // keeps them; the next save reports any conflict instead of replacing either side.
  useEffect(() => {
    if (dirty || busyRef.current || conflict) return;
    setBaseline(snapshot.fields);
    setDraft(snapshot.fields);
    setRevision(snapshot.revision);
  }, [snapshot, dirty, conflict]);

  // Warn before a reload or tab close would drop unsaved edits.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const update = (key: ProfileFieldKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const begin = (next: Busy) => {
    busyRef.current = true;
    setBusy(next);
  };
  const end = () => {
    busyRef.current = false;
    if (mountedRef.current) setBusy('idle');
  };

  const adopt = (saved: ProfileSnapshot, submitted: ProfileFields | null) => {
    setBaseline(saved.fields);
    // A late response never erases fields typed after the request began.
    setDraft((current) => (submitted ? rebaseDraftAfterSave(current, submitted, saved.fields) : saved.fields));
    setRevision(saved.revision);
    setConflict(null);
    setAttempted(false);
    queryClient.setQueryData(queryKeys.dashboard.profile, saved);
  };

  const reportConflict = (remote: ProfileConflict | null, again: boolean) => {
    setConflict(remote ?? { revision: null, fields: null });
    setNotice({
      tone: 'error',
      text: `${again ? 'Your Master Profile changed again' : 'Your Master Profile was changed in another tab or device'}${remote?.revision != null ? ` (saved revision ${remote.revision})` : ''}. Your edits are still in this form and nothing was saved. Choose how to continue.`,
    });
  };

  /** Send the edited fields on top of `expectedRevision`. Never retried automatically. */
  const send = async (expectedRevision: number, mode: Busy, again: boolean) => {
    const submitted = draft;
    const edited = changedProfileFields(submitted, baseline);
    begin(mode);
    setNotice(null);
    try {
      const saved = await saveProfile(edited, expectedRevision);
      if (!mountedRef.current) return;
      adopt(saved, submitted);
      clearRegistrationProfileSyncFlag();
      setNotice({ tone: 'success', text: 'Master Profile saved.' });
    } catch (error) {
      if (!mountedRef.current) return;
      const failure = toAccountError(error);
      if (failure.isProfileConflict) reportConflict(failure.remote, again);
      else setNotice({ tone: 'error', text: `Your changes were not saved. ${failure.message}` });
    } finally {
      end();
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    if (conflict) {
      setNotice({ tone: 'error', text: 'Your Master Profile was changed elsewhere. Choose one of the options above before saving.' });
      return;
    }
    if (!dirty) {
      setNotice({ tone: 'info', text: 'No changes to save. Your Master Profile is up to date.' });
      return;
    }
    setAttempted(true);
    const firstInvalid = PROFILE_FIELDS.find((field) => liveErrors[field.key]);
    if (firstInvalid) {
      setNotice({ tone: 'error', text: 'Some fields need attention. Fix them, then save again.' });
      formRef.current?.querySelector<HTMLElement>(`#${fieldId(firstInvalid.key)}`)?.focus();
      return;
    }
    await send(revision, 'saving', false);
  };

  /** A: explicit overwrite on top of the revision the server reported as current. */
  const keepMine = async () => {
    if (busyRef.current || !conflict) return;
    if (invalid) {
      setAttempted(true);
      setNotice({ tone: 'error', text: 'Some fields need attention. Fix them, then choose again.' });
      return;
    }
    if (conflict.revision === null) {
      // The server did not say which version won: read it first, then ask again.
      begin('overwriting');
      try {
        const latest = await fetchProfile();
        if (!mountedRef.current) return;
        setConflict({ revision: latest.revision, fields: latest.fields });
        setNotice({ tone: 'error', text: `Loaded the current saved version (revision ${latest.revision}) for comparison. Your edits are still in this form. Choose again to continue.` });
      } catch (error) {
        if (mountedRef.current) setNotice({ tone: 'error', text: `The current saved version could not be loaded. Your edits are still in this form. ${toAccountError(error).message}` });
      } finally {
        end();
      }
      return;
    }
    await send(conflict.revision, 'overwriting', true);
  };

  /** C: replace the form only after the latest version loaded. */
  const discardAndReload = async () => {
    if (busyRef.current) return;
    begin('reloading');
    setNotice(null);
    try {
      const latest = await fetchProfile();
      if (!mountedRef.current) return;
      adopt(latest, null);
      setNotice({ tone: 'info', text: 'Loaded the newer saved version. Your unsaved edits were discarded.' });
    } catch (error) {
      if (mountedRef.current) setNotice({ tone: 'error', text: `The newer version could not be loaded, so your edits were kept. ${toAccountError(error).message}` });
    } finally {
      end();
    }
  };

  const discard = () => {
    if (busyRef.current) return;
    setDraft(baseline);
    setAttempted(false);
    setNotice({ tone: 'info', text: 'Unsaved changes discarded.' });
  };

  const saveHint = conflict
    ? 'Resolve the change made elsewhere before saving.'
    : !dirty ? 'Nothing to save yet.' : invalid ? 'Fix the highlighted fields to save.' : '';

  return (
    <div className="space-y-6">
      <CompletenessCard completeness={completeness} />
      <Card>
        <form ref={formRef} noValidate onSubmit={onSubmit} aria-label="Master Profile">
          <CardContent className="space-y-6 pt-6">
            <div>
              <label htmlFor="settings-profile-email" className="mb-1.5 block text-sm font-medium text-ink">Sign-in email</label>
              <Input id="settings-profile-email" type="email" value={snapshot.email} readOnly aria-describedby="settings-profile-email-hint" className="bg-canvas-soft" />
              <p id="settings-profile-email-hint" className="mt-1 text-xs text-ink-muted">Managed by your sign-in provider, so it cannot be edited here.</p>
            </div>
            {GROUPS.map((group) => (
              <fieldset key={group.legend} className="min-w-0 space-y-4">
                <legend className="mb-2 text-sm font-semibold text-ink">{group.legend}</legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {group.fields.map(({ key, half }) => (
                    <ProfileField key={key} spec={SPEC[key]} value={draft[key]} error={shownErrors[key]} half={half} onChange={update} />
                  ))}
                </div>
              </fieldset>
            ))}
            <NoticeRegions notice={notice} />
            {conflict && (
              <ConflictBanner
                conflict={conflict}
                draft={draft}
                busy={busy}
                onKeepMine={() => void keepMine()}
                onDiscard={() => void discardAndReload()}
              />
            )}
          </CardContent>
          <CardFooter className="flex flex-wrap items-center gap-2">
            <Button
              ref={saveRef}
              type="submit"
              aria-disabled={!canSave || undefined}
              aria-busy={busy === 'saving' || undefined}
              aria-describedby={saveHint ? 'settings-profile-save-hint' : undefined}
              className={cn(!canSave && 'opacity-60')}
            >
              <Save className="size-4" aria-hidden="true" />
              {busy === 'saving' ? 'Saving…' : 'Save Master Profile'}
            </Button>
            {dirty && busy === 'idle' && !conflict && (
              <Button type="button" variant="ghost" onClick={discard}>
                <Undo2 className="size-4" aria-hidden="true" />
                Discard changes
              </Button>
            )}
            <span className="text-xs text-ink-muted">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
            {saveHint && <span id="settings-profile-save-hint" className="sr-only">{saveHint}</span>}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

function ConflictBanner({ conflict, draft, busy, onKeepMine, onDiscard }: {
  conflict: ProfileConflict;
  draft: ProfileFields;
  busy: Busy;
  onKeepMine: () => void;
  onDiscard: () => void;
}) {
  const working = busy !== 'idle';
  return (
    <section
      aria-labelledby="settings-profile-conflict-title"
      aria-describedby="settings-profile-conflict-description"
      className="space-y-3 rounded-lg border border-warning-200 bg-warning-50 p-4"
    >
      <h3 id="settings-profile-conflict-title" className="text-sm font-semibold text-warning-800">
        Changed in another tab or device
      </h3>
      <p id="settings-profile-conflict-description" className="text-sm text-warning-800">
        {conflict.revision !== null
          ? `A newer version (revision ${conflict.revision}) was saved while you were editing. `
          : 'A newer version was saved while you were editing. '}
        Your edits are still here. Keeping them replaces only the fields you edited; fields you did not edit keep the newer saved values.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onKeepMine} aria-disabled={working || undefined} aria-busy={busy === 'overwriting' || undefined}>
          <Upload className="size-4" aria-hidden="true" />
          {busy === 'overwriting' ? 'Saving your edits…' : 'Keep my edits and overwrite'}
        </Button>
        <ConflictReviewDialog conflict={conflict} draft={draft} disabled={working} />
        <Button type="button" size="sm" variant="outline" onClick={onDiscard} aria-disabled={working || undefined} aria-busy={busy === 'reloading' || undefined}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {busy === 'reloading' ? 'Loading…' : 'Discard my edits and load the newer version'}
        </Button>
      </div>
    </section>
  );
}

function ConflictReviewDialog({ conflict, draft, disabled }: { conflict: ProfileConflict; draft: ProfileFields; disabled: boolean }) {
  const rows = describeProfileConflict(draft, conflict.fields);
  const remoteLabel = conflict.revision !== null ? `Saved version (revision ${conflict.revision})` : 'Saved version';
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" aria-disabled={disabled || undefined} onClick={(event) => { if (disabled) event.preventDefault(); }}>
          <Eye className="size-4" aria-hidden="true" />
          Review differences
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review differences</DialogTitle>
          <DialogDescription>
            Your version is what this form holds now (not saved). The saved version is what another tab or device stored.
            Closing this window keeps your edits.
          </DialogDescription>
        </DialogHeader>
        {conflict.fields === null ? (
          <p className="text-sm text-ink-secondary">The newer saved version could not be read, so it cannot be compared here. Choose “Discard my edits and load the newer version” to see it, or keep your edits.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-secondary">Every field in this form already matches the newer saved version.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <caption className="sr-only">Fields that differ between your version and the saved version</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="w-1/4 py-2 pr-3 font-semibold text-ink">Field</th>
                  <th scope="col" className="py-2 pr-3 font-semibold text-ink">Your version</th>
                  <th scope="col" className="py-2 font-semibold text-ink">{remoteLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b border-border align-top">
                    <th scope="row" className="py-2 pr-3 font-medium text-ink">{row.label}</th>
                    <td className="break-words py-2 pr-3 text-ink-secondary">{row.local || <em className="text-ink-muted">(empty)</em>}</td>
                    <td className="break-words py-2 text-ink-secondary">{row.remote || <em className="text-ink-muted">(empty)</em>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Back to my edits</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompletenessCard({ completeness }: { completeness: ReturnType<typeof settingsProfileCompleteness> }) {
  const { filled, total, percent, missing } = completeness;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Profile completeness</CardTitle>
        <CardDescription id="settings-profile-completeness-explainer">
          Counts the {total} saved fields resumes and cover letters use: name, headline, phone, city, country, LinkedIn and summary.
          Address, postal code, website and GitHub are optional and not counted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Master Profile completeness"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${filled} of ${total} fields filled (${percent}%)`}
            aria-describedby="settings-profile-completeness-explainer"
            className="h-2 flex-1 overflow-hidden rounded-full bg-canvas-soft"
          >
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-sm font-medium text-ink">{filled} of {total} filled</span>
        </div>
        {missing.length > 0 ? (
          <ul aria-label="Suggested next steps" className="list-disc space-y-1 pl-5 text-sm text-ink-secondary">
            {missing.map((item) => (
              <li key={item.key}>
                <a href={`#${fieldId(item.key)}`} className="text-brand-700 underline-offset-2 hover:underline">{item.label}</a>: {item.suggestion}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-secondary">Every counted field is filled.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileField({ spec, value, error, half, onChange }: {
  spec: ProfileFieldSpec;
  value: string;
  error?: string;
  half?: boolean;
  onChange: (key: ProfileFieldKey, value: string) => void;
}) {
  const id = fieldId(spec.key);
  const hintId = spec.hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const countId = spec.kind === 'multiline' ? `${id}-count` : undefined;
  const describedBy = [hintId, countId, errorId].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    value,
    maxLength: spec.maxLength,
    'aria-describedby': describedBy,
    'aria-required': spec.required || undefined,
    error: Boolean(error),
  };
  return (
    <div className={cn('min-w-0', !half && 'sm:col-span-2')}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {spec.label}
        {spec.required && <span className="ml-1 text-xs font-normal text-ink-muted">(required)</span>}
      </label>
      {spec.kind === 'multiline' ? (
        <Textarea {...common} rows={5} onChange={(event) => onChange(spec.key, event.target.value)} />
      ) : (
        <Input
          {...common}
          type={spec.kind === 'url' ? 'url' : spec.kind === 'tel' ? 'tel' : 'text'}
          inputMode={spec.kind === 'url' ? 'url' : spec.kind === 'tel' ? 'tel' : undefined}
          autoComplete={spec.autoComplete ?? 'off'}
          placeholder={spec.kind === 'url' ? 'https://' : undefined}
          onChange={(event) => onChange(spec.key, event.target.value)}
        />
      )}
      {spec.hint && <p id={hintId} className="mt-1 text-xs text-ink-muted">{spec.hint}</p>}
      {countId && <p id={countId} className="mt-1 text-xs text-ink-muted">{value.length} of {spec.maxLength} characters</p>}
      {error && <p id={errorId} className="mt-1 text-xs font-medium text-error-700">{error}</p>}
    </div>
  );
}
