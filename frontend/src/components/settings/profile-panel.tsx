/**
 * Settings → Master Profile.
 *
 * Reads and writes the real `users` profile projection through
 * GET/POST /api/users-data/profile with optimistic concurrency
 * (expectedRevision; 409 PROFILE_CONFLICT keeps the user's edits). The same
 * fields seed new resumes (lib/master-profile.ts) and cover letters.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Save, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NoticeRegions, type Notice } from '@/components/settings/notice-regions';
import { queryKeys } from '@/hooks/use-api-hooks';
import { useRestoreFocusWhenIdle } from '@/hooks/use-restore-focus-when-idle';
import {
  PROFILE_FIELDS,
  changedProfileFields,
  fetchProfile,
  saveProfile,
  toAccountError,
  validateProfile,
  type AccountApiError,
  type ProfileFieldKey,
  type ProfileFieldSpec,
  type ProfileFields,
  type ProfileSnapshot,
} from '@/lib/account-settings';
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
        <p className="text-sm font-medium text-ink">Your Master Profile could not be loaded.</p>
        <p className="text-sm text-ink-muted">{query.error.message}</p>
        <p className="text-sm text-ink-muted">Nothing is shown here until the saved version loads, so nothing can be overwritten by mistake.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()} aria-busy={query.isFetching || undefined}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {query.isFetching ? 'Retrying…' : 'Retry'}
        </Button>
      </CardContent>
    </Card>
  );
}

function ProfileForm({ snapshot }: { snapshot: ProfileSnapshot }) {
  const queryClient = useQueryClient();
  const [baseline, setBaseline] = useState<ProfileFields>(snapshot.fields);
  const [draft, setDraft] = useState<ProfileFields>(snapshot.fields);
  const [revision, setRevision] = useState(snapshot.revision);
  const [errors, setErrors] = useState<Partial<Record<ProfileFieldKey, string>>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [conflict, setConflict] = useState<ProfileSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const saveRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = Object.keys(changedProfileFields(draft, baseline)).length > 0;
  useRestoreFocusWhenIdle(saving, saveRef);

  // While nothing is unsaved, the form mirrors the latest saved version (a
  // refetch or another tab). With unsaved edits it keeps them, and the next
  // save reports the conflict instead of silently replacing either side.
  useEffect(() => {
    if (dirty || savingRef.current) return;
    setBaseline(snapshot.fields);
    setDraft(snapshot.fields);
    setRevision(snapshot.revision);
  }, [snapshot, dirty]);

  // Warn before a reload or tab close would drop unsaved edits.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const update = (key: ProfileFieldKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const found = validateProfile(draft);
    setErrors(found);
    const firstInvalid = PROFILE_FIELDS.find((field) => found[field.key]);
    if (firstInvalid) {
      setNotice({ tone: 'error', text: 'Some fields need attention. Fix them, then save again.' });
      formRef.current?.querySelector<HTMLElement>(`#${fieldId(firstInvalid.key)}`)?.focus();
      return;
    }
    // Only the fields changed since this form loaded are sent; after a conflict
    // the server merges them onto the newer version instead of reverting it.
    const changes = changedProfileFields(draft, baseline);
    if (Object.keys(changes).length === 0) {
      setNotice({ tone: 'info', text: 'No changes to save. Your Master Profile is up to date.' });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setNotice(null);
    try {
      const saved = await saveProfile(changes, revision, snapshot.email);
      setBaseline(saved.fields);
      setDraft(saved.fields);
      setRevision(saved.revision);
      setConflict(null);
      queryClient.setQueryData(queryKeys.dashboard.profile, saved);
      setNotice({ tone: 'success', text: 'Master Profile saved.' });
    } catch (error) {
      const failure = toAccountError(error, snapshot.email);
      if (failure.status === 409 && failure.remote) {
        setRevision(failure.remote.revision);
        setConflict(failure.remote);
        setNotice({
          tone: 'error',
          text: 'Your Master Profile was changed in another tab or device. Your edits are still in this form: save again to apply just your edits on top of the newer version, or load the newer version instead.',
        });
      } else {
        setNotice({ tone: 'error', text: `Your changes were not saved. ${failure.message}` });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const adoptNewer = (newer: ProfileSnapshot, message: string) => {
    setBaseline(newer.fields);
    setDraft(newer.fields);
    setRevision(newer.revision);
    setErrors({});
    setConflict(null);
    queryClient.setQueryData(queryKeys.dashboard.profile, newer);
    setNotice({ tone: 'info', text: message });
  };

  const loadNewer = () => {
    if (conflict) adoptNewer(conflict, 'Loaded the newer saved version. Your unsaved edits were discarded.');
  };

  // After a conflict the newest saved state is the other version, not the one
  // this form loaded, so discarding shows that version.
  const discard = () => {
    if (conflict) {
      adoptNewer(conflict, 'Unsaved changes discarded. Showing the newer saved version.');
      return;
    }
    setDraft(baseline);
    setErrors({});
    setNotice({ tone: 'info', text: 'Unsaved changes discarded.' });
  };

  return (
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
                  <ProfileField key={key} spec={SPEC[key]} value={draft[key]} error={errors[key]} half={half} onChange={update} />
                ))}
              </div>
            </fieldset>
          ))}
          <NoticeRegions notice={notice} />
          {conflict && (
            <Button type="button" variant="outline" size="sm" onClick={loadNewer}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Load the newer version
            </Button>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-2">
          <Button
            ref={saveRef}
            type="submit"
            aria-disabled={saving || undefined}
            aria-busy={saving || undefined}
          >
            <Save className="size-4" aria-hidden="true" />
            {saving ? 'Saving…' : 'Save Master Profile'}
          </Button>
          {dirty && !saving && (
            <Button type="button" variant="ghost" onClick={discard}>
              <Undo2 className="size-4" aria-hidden="true" />
              Discard changes
            </Button>
          )}
          <span className="text-xs text-ink-muted">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
        </CardFooter>
      </form>
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
