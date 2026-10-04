import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { createTrackedJob, deleteTrackedJob, getTrackedJobs, updateTrackedJob } from '../../services/api/platform';
import {
    buildInterviewIcs, companyMonogram, filterAndSortTrackedJobs, interviewIcsFilename,
    INTERVIEW_FORMATS, INTERVIEW_ROUNDS, isUpcomingInterview, JOB_TRACKER_STATUSES,
    JOB_TRACKER_STAGES, nextStage, normalizeInterviewAtValue, relativeTimeLabel,
    stageForStatus, summarizePipeline, validateTrackedJob, WORK_MODES,
} from '../../utils/jobTracker';
import { downloadTextFile } from '../../utils/interviewCoach';

// The stage list is the single source of truth for the board; the persisted
// `status` enum is untouched (see JOB_TRACKER_STAGES in utils/jobTracker.js).
const EMPTY_FORM = Object.freeze({
    title: '', company: '', location: '', url: '', notes: '', deadline: '', status: 'wishlist',
    salary: '', dateApplied: '', contactPerson: '', contactEmail: '', workMode: 'Remote',
    interviewRound: '', interviewAt: '', interviewFormat: '', interviewLink: '',
});

/** Builds an empty form pre-seeded with a stage, used by "Add Job" per column. */
const formForStatus = (status) => ({ ...EMPTY_FORM, status });

// Shared control styling so every form field resolves through the same Cuba
// Executive tokens instead of one-off legacy utility classes (AC-1).
const FIELD_STYLE = {
    marginTop: '0.25rem',
    width: '100%',
    borderRadius: '0.5rem',
    border: '1px solid var(--cuba-line-strong)',
    background: 'transparent',
    color: 'var(--cuba-ink)',
    padding: '0.5rem 0.75rem',
    fontWeight: 400,
};
const LABEL_STYLE = { fontSize: '0.875rem', fontWeight: 500, color: 'var(--cuba-ink)' };
const ERROR_STYLE = { fontSize: '0.75rem', color: 'var(--cuba-danger)' };

// AC-2: stage colour indicators. Every value is an existing Cuba Executive token
// (no random colours), and each one is also exposed as text in the column header
// so stage is never communicated by colour alone (INV-4).
const STAGE_DOTS = Object.freeze({
    wishlist: 'var(--cuba-ink-muted)',
    applied: 'var(--cuba-primary)',
    interview: 'var(--cuba-warning)',
    offer: 'var(--cuba-success)',
    rejected: 'var(--cuba-danger)',
});

// Quick-action menu rows share one style so the menu reads as a single surface.
const MENU_ITEM_STYLE = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '0.5rem 0.75rem',
    fontSize: '0.8125rem',
    color: 'var(--cuba-ink)',
};

/**
 * AC-3: the quick-action menu items for one card.
 *
 * Extracted so the 3-dot trigger and this panel stay inside ONE wrapper div per
 * card. That shared wrapper is load-bearing for INV-4: the document-level
 * outside-click handler closes the menu whenever a mousedown lands outside the
 * open menu's wrapper, so if the trigger lived outside it, every click
 * would immediately dismiss the menu it had just opened.
 *
 * `actions` MUST be supplied by the parent. This component destructures it, so
 * omitting the prop throws and takes the whole board down when a menu opens.
 */
function QuickActionItems({ job, actions }) {
    const {
        addNote, startEditing, openInterviewScheduler, exportInterview,
        openJobUrl, openCoverLetter, archiveJob, setOpenMenuId, setDeleteTarget,
    } = actions;
    return (
        <>
            <button type="button" role="menuitem" onClick={() => addNote(job)} className="w-full hover:bg-[var(--cuba-canvas)]" style={MENU_ITEM_STYLE}>Add note</button>
            <button type="button" role="menuitem" onClick={() => { setOpenMenuId(null); startEditing(job); }} className="w-full hover:bg-[var(--cuba-canvas)]" style={MENU_ITEM_STYLE}>Edit details</button>
            <button
                type="button"
                role="menuitem"
                onClick={() => openInterviewScheduler(job)}
                data-testid={`tracker-schedule-${job.id}`}
                className="w-full hover:bg-[var(--cuba-canvas)]"
                style={MENU_ITEM_STYLE}
            >
                Schedule interview
            </button>
            <button
                type="button"
                role="menuitem"
                onClick={() => { setOpenMenuId(null); exportInterview(job); }}
                data-testid={`tracker-export-${job.id}`}
                className="w-full hover:bg-[var(--cuba-canvas)]"
                style={MENU_ITEM_STYLE}
            >
                Export to calendar (.ics)
            </button>
            {/* AC-11 (5): navigates through the CLIENT router instead of a raw
                <a href>, so the SPA is never torn down and re-hydrated by a full
                document load. The tracked job's role and company travel as query
                params so the builder opens with real role context pre-filled
                (CoverLetterRoute reads them) rather than an empty form. */}
            <button
                type="button"
                role="menuitem"
                onClick={() => { setOpenMenuId(null); openCoverLetter(job); }}
                data-testid={`tracker-cover-letter-${job.id}`}
                className="w-full hover:bg-[var(--cuba-canvas)]"
                style={MENU_ITEM_STYLE}
            >
                View linked cover letter
            </button>
            <button
                type="button"
                role="menuitem"
                onClick={() => openJobUrl(job)}
                className="w-full hover:bg-[var(--cuba-canvas)]"
                style={MENU_ITEM_STYLE}
            >
                Open job URL
            </button>
            <button
                type="button"
                role="menuitem"
                onClick={() => archiveJob(job)}
                className="w-full hover:bg-[var(--cuba-canvas)]"
                style={MENU_ITEM_STYLE}
            >
                Archive / reject
            </button>
            <button
                type="button"
                role="menuitem"
                onClick={() => { setOpenMenuId(null); setDeleteTarget(job); }}
                className="w-full hover:bg-[var(--cuba-canvas)]"
                style={{ ...MENU_ITEM_STYLE, color: 'var(--cuba-danger)' }}
            >
                Delete card
            </button>
        </>
    );
}

export default function JobTracker({ showToast }) {
    const user = useContext(AuthContext);
    const navigate = useNavigate();
    const [jobs, setJobs] = useState([]);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [retryCount, setRetryCount] = useState(0);
    const [draggedId, setDraggedId] = useState(null);
    const [dropTarget, setDropTarget] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    // DIR-020: the in-card quick-action menu + the interview scheduler dialog.
    const [openMenuId, setOpenMenuId] = useState(null);
    const [interviewDraft, setInterviewDraft] = useState(null);
    // INV-4: the outside-click guard must resolve against the REAL menu wrapper.
    // A single shared ref was overwritten by every card rendered after it, so
    // it pointed at whichever card happened to be last in the board. Each card
    // now registers its own wrapper by job id, so the containment test is exact
    // for the menu that is actually open.
    const menuNodes = useRef(new Map());
    const setMenuNode = useCallback((jobId, node) => {
        if (node) menuNodes.current.set(jobId, node);
        else menuNodes.current.delete(jobId);
    }, []);

    useEffect(() => {
        let active = true;
        setJobs([]);
        setForm(EMPTY_FORM);
        setEditingId(null);
        setShowForm(false);
        setErrors({});
        if (!user?.uid) {
            setLoading(false);
            return () => { active = false; };
        }
        setLoading(true);
        setLoadError('');
        getTrackedJobs(user.uid)
            .then((result) => { if (active) setJobs(result); })
            .catch((error) => {
                if (!active) return;
                console.error('Unable to load job tracker', error);
                setLoadError('Your job tracker could not be loaded.');
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [user?.uid, retryCount]);

    // Close the quick-action menu on an outside click or Escape (WCAG 2.1 dismissal).
    useEffect(() => {
        if (!openMenuId) return undefined;
        const onPointerDown = (event) => {
            const node = menuNodes.current.get(openMenuId);
            if (!node || !node.contains(event.target)) setOpenMenuId(null);
        };
        const onKeyDown = (event) => { if (event.key === 'Escape') setOpenMenuId(null); };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [openMenuId]);

    const formDirty = showForm && (Boolean(editingId) || Object.entries(form).some(([key, value]) => key !== 'status' && Boolean(value)));
    useEffect(() => {
        const warn = (event) => {
            if (!formDirty) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [formDirty]);

    const visibleJobs = useMemo(() => filterAndSortTrackedJobs(jobs, search), [jobs, search]);
    // AC-6: the ribbon reflects the WHOLE pipeline, never the filtered view, so
    // typing in search cannot silently change the reported interview rate.
    const summary = useMemo(() => summarizePipeline(jobs), [jobs]);

    const closeForm = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setErrors({});
        setShowForm(false);
    };

    const submit = async (event) => {
        event.preventDefault();
        const validation = validateTrackedJob(form);
        setErrors(validation.errors);
        if (!validation.valid || !user?.uid) return;
        setSaving(true);
        try {
            if (editingId) {
                const existing = jobs.find(job => job.id === editingId);
                const update = await updateTrackedJob(user.uid, editingId, validation.job, existing?.revision ?? null);
                setJobs((current) => current.map((job) => job.id === editingId ? { ...job, ...validation.job, ...update, updatedAt: update.updatedAt?.toDate?.() || new Date() } : job));
            } else {
                // A newly tracked job is applied-for-all-intents the moment it is
                // recorded, so stamp the real date before persisting. Without this
                // the row is written with date_applied = NULL and the card's
                // relative-time chip depends entirely on a client-side guess (INV-2:
                // never render a value MariaDB was not actually told about).
                const created = await createTrackedJob(user.uid, {
                    ...validation.job,
                    dateApplied: validation.job.dateApplied || new Date().toISOString().slice(0, 10),
                    order: jobs.filter((job) => job.status === validation.job.status).length,
                });
                setJobs((current) => [...current, created]);
            }
            showToast?.(editingId ? 'Tracked job updated' : 'Job added to tracker', 'success');
            closeForm();
        } catch (error) {
            setErrors({ form: error.message || 'The job could not be saved' });
            if (error.code === 'JOB_TRACKER_CONFLICT') setRetryCount(count => count + 1);
        } finally {
            setSaving(false);
        }
    };

    const startEditing = (job) => {
        setForm({
            title: job.title || '', company: job.company || '', location: job.location || '',
            url: job.url || '', notes: job.notes || '', deadline: job.deadline || '',
            status: job.status || 'wishlist', salary: job.salary || '',
            dateApplied: job.dateApplied || normalizeInterviewAtValue(job.dateApplied).slice(0, 10),
            contactPerson: job.contactPerson || '', contactEmail: job.contactEmail || '',
            workMode: WORK_MODES.includes(job.workMode) ? job.workMode : 'Remote',
            interviewRound: job.interviewRound || '',
            interviewAt: normalizeInterviewAtValue(job.interviewAt),
            interviewFormat: job.interviewFormat || '', interviewLink: job.interviewLink || '',
        });
        setEditingId(job.id);
        setErrors({});
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const moveJob = async (jobId, status) => {
        if (!user?.uid || !JOB_TRACKER_STATUSES.includes(status)) return;
        const existing = jobs.find((job) => job.id === jobId);
        if (!existing || existing.status === status) return;
        const previous = jobs;
        const order = jobs.filter((job) => job.status === status).length;
        // DIR-020 DEFECT: the optimistic update advanced `status` but LEFT the local
        // `revision` stale, so a second action fired before the PATCH response landed
        // (e.g. 1-click advance immediately followed by the ArrowRight keyboard path,
        // then the interview scheduler) sent `expectedRevision` one behind MariaDB.
        // The repository's CAS then answered 409 JOB_TRACKER_CONFLICT, the catch below
        // silently rolled the card back, and every later mutation cascaded into the
        // same conflict — leaving the card stranded in the previous column forever.
        //
        // The server assigns nextRevision = currentRevision + 1 deterministically, so
        // predicting it here keeps back-to-back operations CAS-correct while staying
        // strictly optimistic; the authoritative revision from the response (spread via
        // `...update`) overwrites this prediction the moment it arrives.
        setJobs((current) => current.map((job) => job.id === jobId
            ? { ...job, status, order, revision: Number(job.revision || 1) + 1, updatedAt: new Date() }
            : job));
        try {
            const update = await updateTrackedJob(user.uid, jobId, { status, order }, existing.revision ?? null);
            setJobs(current => current.map(job => job.id === jobId ? {
                ...job,
                revision: update.revision,
                // The server echoes the full authoritative row back, so the card
                // never keeps stale metadata after a move (INV-2).
                ...update,
                updatedAt: update.updatedAt?.toDate?.() || new Date(),
            } : job));
            showToast?.(`Moved to ${stageForStatus(status).label}`, 'success');
        } catch (error) {
            setJobs(previous);
            showToast?.(error.message || 'Unable to move job', 'error');
            if (error.code === 'JOB_TRACKER_CONFLICT') setRetryCount(count => count + 1);
        }
    };

    /**
     * DIR-020 AC-2: 1-click / keyboard stage advancement.
     *
     * Enter and Space are NOT handled here because the control is a native
     * <button>, which already activates on those keys; handling them again would
     * double-fire the PATCH and trip the optimistic revision CAS. The explicit
     * branch only covers ArrowRight/ArrowLeft, which no native control provides.
     */
    const advanceJob = (job, direction = 1) => {
        const index = JOB_TRACKER_STAGES.findIndex((stage) => stage.id === job.status);
        const target = JOB_TRACKER_STAGES[index + direction];
        if (!target) {
            showToast?.(`${job.company} is already in the ${stageForStatus(job.status).label} stage`, 'info');
            return;
        }
        moveJob(job.id, target.id);
    };

    const onStageKeyDown = (event, job, direction) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            advanceJob(job, direction);
        }
    };

    /**
     * AC-11 (4): export the RFC 5545 invite.
     *
     * When the card has no interview date yet, a bare error toast would dead-end
     * the action, so the scheduler is opened pre-filled for this card instead:
     * the user is prompted for the missing data and can then export immediately.
     */
    const exportInterview = (job) => {
        setOpenMenuId(null);
        const ics = buildInterviewIcs(job);
        if (!ics) {
            showToast?.('Add the interview date first - opening the scheduler', 'info');
            openInterviewScheduler(job);
            return;
        }
        // downloadTextFile is the proven, no-op-safe helper: it reports failure
        // instead of throwing, so a blocked download degrades to a toast rather
        // than an unhandled error.
        const downloaded = downloadTextFile(interviewIcsFilename(job), ics, 'text/calendar');
        showToast?.(downloaded ? 'Calendar invite downloaded' : 'Unable to export the calendar invite',
            downloaded ? 'success' : 'error');
    };

    /** AC-3 "Add Note": open the edit form scrolled to the notes field. */
    const addNote = (job) => {
        setOpenMenuId(null);
        startEditing(job);
    };

    /** AC-3: 1-click archival from the menu, reusing the same revision-guarded move. */
    const archiveJob = (job) => {
        setOpenMenuId(null);
        moveJob(job.id, 'rejected');
    };

    /**
     * AC-11 (6): open the job link, or PROMPT to add one when it is missing.
     *
     * The old behaviour only raised an error toast, which left the action with no
     * path forward. Opening the pre-filled edit form instead gives the user the
     * field they need, so the option stays 100% operational end-to-end.
     */
    const openJobUrl = (job) => {
        setOpenMenuId(null);
        if (!job.url) {
            showToast?.('This card has no job link yet - add one to open it', 'info');
            startEditing(job);
            return;
        }
        window.open(job.url, '_blank', 'noopener,noreferrer');
    };

    /**
     * AC-11 (5): navigate to the cover-letter builder through the CLIENT router
     * with this card's real role context attached as query params, so the builder
     * opens with the job title and company already populated.
     */
    const openCoverLetter = (job) => {
        const params = new URLSearchParams();
        if (job.title) params.set('role', job.title);
        if (job.company) params.set('company', job.company);
        const query = params.toString();
        navigate(`/dashboard/cover-letters${query ? `?${query}` : ''}`);
    };

    /** Opens the scheduler pre-filled from the card's current interview details. */
    const openInterviewScheduler = (job) => {
        setOpenMenuId(null);
        setErrors({});
        setInterviewDraft({
            id: job.id,
            title: job.title || '',
            company: job.company || '',
            interviewRound: job.interviewRound || '',
            interviewAt: normalizeInterviewAtValue(job.interviewAt),
            interviewFormat: job.interviewFormat || '',
            interviewLink: job.interviewLink || '',
        });
    };

    /**
     * The quick-action contract handed to every `QuickActionItems` menu.
     *
     * `QuickActionItems` destructures this object, so it MUST be passed: omitting
     * it throws `TypeError: Cannot destructure ... of 'undefined'` and takes the
     * entire board down the moment any 3-dot menu is opened.
     */
    const actions = {
        addNote,
        startEditing,
        openInterviewScheduler,
        exportInterview,
        openJobUrl,
        openCoverLetter,
        archiveJob,
        setOpenMenuId,
        setDeleteTarget,
    };

    /**
     * Persists the interview schedule together with the move into the
     * interviewing stage in ONE revision-guarded PATCH, so the stage and its
     * details can never disagree if the write fails midway.
     */
    const saveInterview = async (event) => {
        event.preventDefault();
        if (!user?.uid || !interviewDraft) return;
        const existing = jobs.find((job) => job.id === interviewDraft.id);
        if (!existing) return;
        if (!interviewDraft.interviewAt) {
            setErrors({ interviewAt: 'Choose the interview date and time' });
            return;
        }
        setSaving(true);
        setErrors({});
        try {
            const patch = {
                status: 'interview',
                interviewRound: interviewDraft.interviewRound,
                interviewAt: interviewDraft.interviewAt,
                interviewFormat: interviewDraft.interviewFormat,
                interviewLink: interviewDraft.interviewLink,
            };
            const update = await updateTrackedJob(user.uid, interviewDraft.id, patch, existing.revision ?? null);
            setJobs((current) => current.map((job) => (job.id === interviewDraft.id
                ? { ...job, ...patch, ...update, updatedAt: update.updatedAt?.toDate?.() || new Date() }
                : job)));
            setInterviewDraft(null);
            showToast?.('Interview scheduled', 'success');
        } catch (error) {
            setErrors({ form: error.message || 'Unable to schedule the interview' });
            if (error.code === 'JOB_TRACKER_CONFLICT') { setInterviewDraft(null); setRetryCount((count) => count + 1); }
        } finally {
            setSaving(false);
        }
    };

    const removeJob = async () => {
        if (!user?.uid || !deleteTarget) return;
        try {
            await deleteTrackedJob(user.uid, deleteTarget.id, deleteTarget.revision ?? null);
            setJobs((current) => current.filter((item) => item.id !== deleteTarget.id));
            setDeleteTarget(null);
            showToast?.('Tracked job deleted', 'success');
        } catch (error) {
            showToast?.(error.message || 'Unable to delete job', 'error');
            if (error.code === 'JOB_TRACKER_CONFLICT') { setDeleteTarget(null); setRetryCount(count => count + 1); }
        }
    };

    if (!user?.uid) return <main className="p-8 text-center" style={{ color: 'var(--cuba-ink-muted)' }}>Sign in to use your private job tracker.</main>;
    if (loading) return (
        <main className="flex min-h-64 items-center justify-center" aria-busy="true" style={{ color: 'var(--cuba-ink-muted)' }}>
            <p role="status">Loading job tracker…</p>
        </main>
    );
    if (loadError) return (
        <main className="flex min-h-64 items-center justify-center px-4">
            <div role="alert" className="text-center">
                <p className="mb-3" style={{ color: 'var(--cuba-ink)' }}>{loadError}</p>
                <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="cuba-btn-primary rounded-xl px-4 py-2 text-sm font-bold shadow-xs">Try again</button>
            </div>
        </main>
    );

    return (
        <main
            className="min-h-screen p-4 sm:p-6"
            style={{ background: 'var(--cuba-canvas)', color: 'var(--cuba-ink)' }}
        >
            {deleteTarget && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: 'color-mix(in srgb, var(--cuba-ink) 45%, transparent)' }}
                    role="presentation"
                    onKeyDown={(event) => { if (event.key === 'Escape') setDeleteTarget(null); }}
                >
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="tracker-delete-title"
                        className="w-full max-w-md rounded-2xl p-6 shadow-lg"
                        style={{ background: 'var(--cuba-elevated)', border: '1px solid var(--cuba-line)' }}
                    >
                        <h2 id="tracker-delete-title" className="text-lg font-semibold">Delete tracked job?</h2>
                        <p className="mt-2 text-sm" style={{ color: 'var(--cuba-ink-muted)' }}>
                            Delete {deleteTarget.title} at {deleteTarget.company}? This action cannot be undone.
                        </p>
                        <div className="mt-6 flex justify-end gap-2">
                            <button type="button" autoFocus onClick={() => setDeleteTarget(null)} className="cuba-btn-outline rounded-xl px-4 py-2 text-sm font-semibold">Cancel</button>
                            <button
                                type="button"
                                onClick={removeJob}
                                className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                                style={{ background: 'var(--cuba-danger)' }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="mx-auto max-w-[1600px]">
                {/* AC-5: the scheduler collects round, date/time, format and meeting link,
                    then persists them together with the move into 'interview' in ONE
                    revision-guarded PATCH so the stage and its details can never disagree. */}
                {interviewDraft && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        style={{ background: 'color-mix(in srgb, var(--cuba-ink) 45%, transparent)' }}
                        role="presentation"
                        onKeyDown={(event) => { if (event.key === 'Escape') setInterviewDraft(null); }}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="tracker-interview-title"
                            data-testid="tracker-interview-dialog"
                            className="w-full max-w-lg rounded-2xl p-6 shadow-lg"
                            style={{ background: 'var(--cuba-elevated)', border: '1px solid var(--cuba-line)' }}
                        >
                            <h2 id="tracker-interview-title" className="text-lg font-semibold">Schedule interview</h2>
                            <p className="mt-1 text-sm" style={{ color: 'var(--cuba-ink-muted)' }}>
                                {interviewDraft.title} · {interviewDraft.company}
                            </p>
                            <form onSubmit={saveInterview} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
                                {errors.form && (
                                    <p role="alert" className="text-sm font-semibold sm:col-span-2" style={ERROR_STYLE}>{errors.form}</p>
                                )}
                                <label style={LABEL_STYLE}>Round
                                    <select
                                        value={interviewDraft.interviewRound}
                                        onChange={(event) => setInterviewDraft({ ...interviewDraft, interviewRound: event.target.value })}
                                        style={FIELD_STYLE}
                                    >
                                        <option value="">Not set</option>
                                        {INTERVIEW_ROUNDS.map((round) => <option key={round} value={round}>{round}</option>)}
                                    </select>
                                </label>
                                <label style={LABEL_STYLE}>Format
                                    <select
                                        value={interviewDraft.interviewFormat}
                                        onChange={(event) => setInterviewDraft({ ...interviewDraft, interviewFormat: event.target.value })}
                                        style={FIELD_STYLE}
                                    >
                                        <option value="">Not set</option>
                                        {INTERVIEW_FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}
                                    </select>
                                </label>
                                <label className="sm:col-span-2" style={LABEL_STYLE}>Date &amp; time
                                    <input
                                        type="datetime-local"
                                        value={interviewDraft.interviewAt}
                                        onChange={(event) => setInterviewDraft({ ...interviewDraft, interviewAt: event.target.value })}
                                        aria-invalid={Boolean(errors.interviewAt)}
                                        style={FIELD_STYLE}
                                        data-testid="tracker-interview-at"
                                    />
                                    {errors.interviewAt && <span style={ERROR_STYLE}>{errors.interviewAt}</span>}
                                </label>
                                <label className="sm:col-span-2" style={LABEL_STYLE}>Meeting link
                                    <input
                                        type="url"
                                        value={interviewDraft.interviewLink}
                                        onChange={(event) => setInterviewDraft({ ...interviewDraft, interviewLink: event.target.value })}
                                        aria-invalid={Boolean(errors.interviewLink)}
                                        style={FIELD_STYLE}
                                        data-testid="tracker-interview-link"
                                    />
                                    {errors.interviewLink && <span style={ERROR_STYLE}>{errors.interviewLink}</span>}
                                </label>
                                <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                                    <button type="button" onClick={() => setInterviewDraft(null)} className="cuba-btn-outline rounded-xl px-4 py-2 text-sm font-semibold">Cancel</button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        data-testid="tracker-interview-save"
                                        className="cuba-btn-primary rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60"
                                    >
                                        {saving ? 'Saving…' : 'Save interview'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
                <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Job Tracker</h1>
                        <p className="mt-1 text-sm" style={{ color: 'var(--cuba-ink-muted)' }}>
                            Drag a card between stages, or use the controls on each card to advance it.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => { closeForm(); setForm(formForStatus('wishlist')); setShowForm(true); }}
                        className="cuba-btn-primary rounded-xl px-4 py-2 text-sm font-bold shadow-xs"
                        data-testid="tracker-add-job"
                    >
                        {/* AC-10: the single consolidated primary creation
                            action for the whole board; the per-column
                            "+ Add Job" duplicates are gone. */}
                        + Add Tracked Job
                    </button>
                </header>

                {/* AC-6: the pipeline analytics ribbon. Reads the whole pipeline, not the search filter. */}
                <section
                    aria-label="Pipeline analytics"
                    className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
                >
                    {[
                        { label: 'Active applications', value: summary.active, hint: `${summary.total} tracked in total` },
                        { label: 'Interview rate', value: `${summary.interviewRate}%`, hint: `of ${summary.submitted} submitted` },
                        { label: 'Pending responses', value: summary.pendingResponses, hint: 'awaiting company review' },
                        { label: 'Offers received', value: summary.offerCount, hint: `${summary.archivedCount} archived` },
                    ].map((metric) => (
                        <div
                            key={metric.label}
                            className="rounded-2xl p-4"
                            style={{ background: 'var(--cuba-card)', border: '1px solid var(--cuba-line)' }}
                        >
                            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--cuba-ink-muted)' }}>
                                {metric.label}
                            </p>
                            <p className="mt-1 text-2xl font-bold" style={{ color: 'var(--cuba-ink)' }}>{metric.value}</p>
                            <p className="mt-1 text-xs" style={{ color: 'var(--cuba-ink-subtle)' }}>{metric.hint}</p>
                        </div>
                    ))}
                </section>

                {showForm && (
                    <form
                        onSubmit={submit}
                        className="mb-6 rounded-2xl p-4 shadow-sm"
                        style={{ background: 'var(--cuba-card)', border: '1px solid var(--cuba-line)' }}
                        noValidate
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold">{editingId ? 'Edit tracked job' : 'Add a job'}</h2>
                            <button type="button" onClick={closeForm} className="cuba-btn-outline rounded-lg px-3 py-1 text-sm font-semibold">Cancel</button>
                        </div>
                        {errors.form && <p role="alert" className="mb-3 text-sm font-semibold" style={ERROR_STYLE}>{errors.form}</p>}
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <label style={LABEL_STYLE}>Job title *
                                <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-invalid={Boolean(errors.title)} style={FIELD_STYLE} />
                                {errors.title && <span style={ERROR_STYLE}>{errors.title}</span>}
                            </label>
                            <label style={LABEL_STYLE}>Company *
                                <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} aria-invalid={Boolean(errors.company)} style={FIELD_STYLE} />
                                {errors.company && <span style={ERROR_STYLE}>{errors.company}</span>}
                            </label>
                            <label style={LABEL_STYLE}>Location
                                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={FIELD_STYLE} />
                            </label>
                            <label style={LABEL_STYLE}>Work mode
                                <select value={form.workMode} onChange={(e) => setForm({ ...form, workMode: e.target.value })} style={FIELD_STYLE}>
                                    {WORK_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                                </select>
                            </label>
                            <label style={LABEL_STYLE}>Stage
                                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={FIELD_STYLE}>
                                    {JOB_TRACKER_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
                                </select>
                            </label>
                            <label style={LABEL_STYLE}>Compensation
                                <input value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="₹18L - ₹24L PA" style={FIELD_STYLE} />
                            </label>
                            <label style={LABEL_STYLE}>Applied date
                                <input type="date" value={form.dateApplied} onChange={(e) => setForm({ ...form, dateApplied: e.target.value })} style={FIELD_STYLE} />
                            </label>
                            <label style={LABEL_STYLE}>Deadline
                                <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} style={FIELD_STYLE} />
                            </label>
                            <label style={LABEL_STYLE}>Contact person
                                <input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} style={FIELD_STYLE} />
                            </label>
                            <label style={LABEL_STYLE}>Contact email
                                <input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} aria-invalid={Boolean(errors.contactEmail)} style={FIELD_STYLE} />
                                {errors.contactEmail && <span style={ERROR_STYLE}>{errors.contactEmail}</span>}
                            </label>
                            <label className="sm:col-span-2" style={LABEL_STYLE}>Job link
                                <input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} aria-invalid={Boolean(errors.url)} placeholder="https://…" style={FIELD_STYLE} />
                                {errors.url && <span style={ERROR_STYLE}>{errors.url}</span>}
                            </label>
                            <label style={LABEL_STYLE}>Interview round
                                <select value={form.interviewRound} onChange={(e) => setForm({ ...form, interviewRound: e.target.value })} style={FIELD_STYLE}>
                                    <option value="">Not scheduled</option>
                                    {INTERVIEW_ROUNDS.map((round) => <option key={round} value={round}>{round}</option>)}
                                </select>
                            </label>
                            <label style={LABEL_STYLE}>Interview date &amp; time
                                <input type="datetime-local" value={form.interviewAt} onChange={(e) => setForm({ ...form, interviewAt: e.target.value })} style={FIELD_STYLE} />
                            </label>
                            <label style={LABEL_STYLE}>Interview format
                                <select value={form.interviewFormat} onChange={(e) => setForm({ ...form, interviewFormat: e.target.value })} style={FIELD_STYLE}>
                                    <option value="">Not set</option>
                                    {INTERVIEW_FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}
                                </select>
                            </label>
                            <label style={LABEL_STYLE}>Meeting link
                                <input type="url" value={form.interviewLink} onChange={(e) => setForm({ ...form, interviewLink: e.target.value })} aria-invalid={Boolean(errors.interviewLink)} style={FIELD_STYLE} />
                                {errors.interviewLink && <span style={ERROR_STYLE}>{errors.interviewLink}</span>}
                            </label>
                            <label className="sm:col-span-2 lg:col-span-4" style={LABEL_STYLE}>Notes
                                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows="3" style={FIELD_STYLE} />
                            </label>
                        </div>
                        <button type="submit" disabled={saving} className="cuba-btn-primary mt-4 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-60">
                            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add to tracker'}
                        </button>
                    </form>
                )}

                <label htmlFor="tracker-search" className="sr-only">Search tracked jobs</label>
                <input
                    id="tracker-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search title, company, location, notes, salary or contact"
                    style={{ ...FIELD_STYLE, marginTop: 0, marginBottom: '1rem', maxWidth: '36rem' }}
                />

                {/*
                  AC-9: the five columns must fit a standard desktop viewport
                  (>=1280px) inside the dashboard shell WITHOUT a horizontal
                  window scrollbar. A responsive grid that reflows
                  (1 -> 2 -> 3 -> 5) plus `min-w-0` columns is used instead of a
                  fixed-width board, so no width is ever forced. `overflow-x-auto`
                  is deliberately NOT set: a reflowing grid needs no scrollbar at
                  any width, which also keeps the in-card menus from being clipped
                  by a scroll container.
                */}
                <div className="grid grid-cols-1 gap-3.5 overflow-x-visible pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="Job tracker board">
                    {JOB_TRACKER_STAGES.map((stage) => {
                        const columnJobs = visibleJobs.filter((job) => job.status === stage.id);
                        const isDropTarget = dropTarget === stage.id;
                        return (
                            <section
                                key={stage.id}
                                aria-labelledby={`tracker-column-${stage.id}`}
                                data-testid={`tracker-column-${stage.id}`}
                                // AC-9: `min-w-0` (not the previous `min-w-[280px]`) lets a grid column
                                // shrink to its share of the row, so five columns never force the
                                // page wider than the viewport. The canvas is a `rounded-xl`
                                // bordered surface per the Lead's viewport ruling.
                                className="flex min-w-0 flex-col rounded-xl p-3 transition-colors"
                                style={{
                                    background: isDropTarget ? 'var(--cuba-elevated)' : 'color-mix(in srgb, var(--cuba-canvas) 60%, transparent)',
                                    border: `1px solid ${isDropTarget ? 'var(--cuba-primary)' : 'var(--cuba-line)'}`,
                                }}
                                onDragOver={(event) => { event.preventDefault(); setDropTarget(stage.id); }}
                                onDragLeave={() => setDropTarget((current) => (current === stage.id ? null : current))}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    if (draggedId) moveJob(draggedId, stage.id);
                                    setDraggedId(null);
                                    setDropTarget(null);
                                }}
                            >
                                {/* AC-9: the count badge is `shrink-0` inside a padded
                                    flex header, so it can never be sliced by the column
                                    border no matter how narrow the column gets. */}
                                <div className="mb-2 flex items-center gap-2 pr-1">
                                    <h2
                                        id={`tracker-column-${stage.id}`}
                                        className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                            style={{ background: STAGE_DOTS[stage.id] }}
                                        />
                                        <span className="truncate">{stage.label}</span>
                                    </h2>
                                    <span
                                        className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums"
                                        style={{ background: 'var(--cuba-canvas)', color: 'var(--cuba-ink-muted)', border: '1px solid var(--cuba-line)' }}
                                        aria-label={`${columnJobs.length} cards in ${stage.label}`}
                                    >
                                        {columnJobs.length}
                                    </span>
                                </div>
                                <p className="mb-3 pr-1 text-xs leading-snug" style={{ color: 'var(--cuba-ink-subtle)' }}>{stage.hint}</p>
                                {/* AC-10: the repetitive full-width "+ Add Job" button that
                                    duplicated creation under every column description is GONE.
                                    Primary creation is consolidated into the single header action;
                                    this is the subtle per-column ghost affordance instead. */}
                                <button
                                    type="button"
                                    onClick={() => { closeForm(); setForm(formForStatus(stage.id)); setShowForm(true); }}
                                    aria-label={`Add a job to ${stage.label}`}
                                    title={`Add a job to ${stage.label}`}
                                    data-testid={`tracker-column-add-${stage.id}`}
                                    className="cuba-btn-outline mb-3 flex w-full items-center justify-center gap-1 rounded-lg border-dashed px-2 py-1 text-xs font-semibold"
                                >
                                    <span aria-hidden="true">+</span>
                                    Add to {stage.short}
                                </button>
                                <div className="flex-1 space-y-3">
                                    {columnJobs.map((job) => {
                                        const forward = nextStage(job.status);
                                        // The POST response already carries the authoritative
                                        // created_at/updated_at, but `createdAt` is kept as an
                                        // extra fallback so the relative-time chip can never
                                        // silently vanish from the card anatomy (AC-3).
                                        const appliedLabel = relativeTimeLabel(job.dateApplied || job.updatedAt || job.createdAt || new Date());
                                        const interviewSoon = isUpcomingInterview(job.interviewAt);
                                        const isOpen = openMenuId === job.id;
                                        return (
                                            <article
                                                key={job.id}
                                                data-testid={`tracker-card-${job.id}`}
                                                draggable
                                                onDragStart={() => setDraggedId(job.id)}
                                                onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}
                                                className="rounded-xl p-3 shadow-sm"
                                                style={{ background: 'var(--cuba-elevated)', border: '1px solid var(--cuba-line)' }}
                                                aria-label={`${job.title} at ${job.company}, ${stageForStatus(job.status).label} stage`}
                                            >
                                                {/* AC-10 (4-TIER ZERO-TRUNCATION CARD ANATOMY).
                                                    TIER 1 - header bar: compact monogram + company + 3-dot menu.
                                                    TIER 2 - full-width job title (below, never beside the avatar).
                                                    TIER 3 - metadata badges. TIER 4 - relative time + 1-click advance.
                                                    Defect fixed: `Staff Engineer...` was previously crammed into a
                                                    ~100px flex column squeezed between a 36px monogram and the
                                                    3-dot button, so it collapsed into an ellipsis. */}
                                                <div className="mb-2 flex items-center justify-between gap-2">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <span
                                                            aria-hidden="true"
                                                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
                                                            style={{ background: 'var(--cuba-primary-soft)', color: 'var(--cuba-primary-ink-strong)' }}
                                                        >
                                                            {companyMonogram(job.company)}
                                                        </span>
                                                        <span
                                                            data-testid={`tracker-company-${job.id}`}
                                                            className="truncate text-xs font-medium text-cuba-ink-muted"
                                                        >
                                                            {job.company}
                                                        </span>
                                                    </div>
                                                    {/* AC-10: the 3-dot quick-action trigger now
                                                        lives in the card header (top-right) instead
                                                        of a bulky full-width "Actions" button in the
                                                        control row.
                                                        IMPORTANT (INV-4): the trigger AND its panel
                                                        share ONE wrapper div, because the
                                                        outside-click handler closes the menu when a
                                                        mousedown lands outside that wrapper. Splitting
                                                        them would make every click on this trigger
                                                        immediately dismiss the menu it just opened.
                                                        The wrapper is registered per job id so the
                                                        guard resolves against THIS card. */}
                                                    <div className="relative shrink-0" ref={(node) => setMenuNode(job.id, node)}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setOpenMenuId(isOpen ? null : job.id)}
                                                            aria-expanded={isOpen}
                                                            aria-haspopup="menu"
                                                            aria-label={`Actions for ${job.title}`}
                                                            data-testid={`tracker-actions-${job.id}`}
                                                            className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold leading-none"
                                                            style={{ color: 'var(--cuba-ink-muted)', border: '1px solid var(--cuba-line)', background: 'var(--cuba-canvas)' }}
                                                        >
                                                            <span aria-hidden="true">&middot;&middot;&middot;</span>
                                                        </button>
                                                        {isOpen && (
                                                            <div
                                                                role="menu"
                                                                aria-label={`Actions for ${job.title}`}
                                                                data-testid={`tracker-menu-${job.id}`}
                                                                className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl shadow-lg"
                                                                style={{ background: 'var(--cuba-elevated)', border: '1px solid var(--cuba-line)' }}
                                                            >
                                                                <QuickActionItems job={job} actions={actions} />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* TIER 2 - the full-width job title.
                                                    AC-10 regression fix: this tier was dropped
                                                    during the header restructuring, so cards rendered
                                                    the company and then jumped straight to the
                                                    metadata badges with the job's most important
                                                    field missing entirely. `w-full` + `break-words`
                                                    (and no `truncate`) guarantee the title owns the
                                                    card width and wraps instead of ellipsising. */}
                                                <h3
                                                    data-testid={`tracker-title-${job.id}`}
                                                    className="w-full text-sm font-semibold leading-snug break-words mb-2"
                                                    style={{ color: 'var(--cuba-ink)' }}
                                                >
                                                    {job.title}
                                                </h3>

                                                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                                                    {job.workMode && (
                                                        <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: 'var(--cuba-canvas)', color: 'var(--cuba-ink-muted)', border: '1px solid var(--cuba-line)' }}>
                                                            {job.workMode}
                                                        </span>
                                                    )}
                                                    {job.salary && (
                                                        <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: 'var(--cuba-success-soft)', color: 'var(--cuba-success)' }}>
                                                            {job.salary}
                                                        </span>
                                                    )}
                                                    {job.contactPerson && (
                                                        <span className="truncate" style={{ color: 'var(--cuba-ink-subtle)' }}>
                                                            Contact: {job.contactPerson}
                                                        </span>
                                                    )}
                                                </div>

                                                {appliedLabel && (
                                                    <p className="mt-2 text-xs" style={{ color: 'var(--cuba-ink-subtle)' }}>{appliedLabel}</p>
                                                )}

                                                {job.status === 'interview' && job.interviewAt && (
                                                    <p
                                                        className="mt-2 text-xs font-semibold"
                                                        style={{ color: interviewSoon ? 'var(--cuba-warning)' : 'var(--cuba-ink-muted)' }}
                                                    >
                                                        {interviewSoon ? 'Upcoming · ' : ''}
                                                        {job.interviewRound ? `${job.interviewRound} · ` : ''}
                                                        {new Date(job.interviewAt).toLocaleString('en-US', {
                                                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                                                        })}
                                                    </p>
                                                )}
                                                {job.notes && (
                                                    <p className="mt-2 line-clamp-3 text-xs" style={{ color: 'var(--cuba-ink-muted)' }}>{job.notes}</p>
                                                )}

                                                {/* AC-2 + AC-10 + INV-4: the bulky `<select>` + `<-`/`->` pair and the
                                                full-width "Actions" button are replaced by ONE compact 1-click
                                                stage advancement pill. It is a native <button>, so Enter/Space
                                                activation is inherent, and ArrowRight/ArrowLeft still extend the
                                                same path to full keyboard operation. Explicit stage selection
                                                (moving backwards or to a non-adjacent column) remains available
                                                through drag-and-drop and the 3-dot menu. */}
                                                <div className="mt-3">
                                                    {forward ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => advanceJob(job, 1)}
                                                            onKeyDown={(event) => onStageKeyDown(event, job, 1)}
                                                            aria-label={`Advance ${job.title} to ${forward.label}`}
                                                            data-testid={`tracker-advance-${job.id}`}
                                                            className="cuba-btn-primary flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold"
                                                        >
                                                            {stageForStatus(job.status).short}
                                                            <span aria-hidden="true">&rarr;</span>
                                                        </button>
                                                    ) : (
                                                        <p
                                                            className="rounded-lg px-2 py-1.5 text-center text-xs font-semibold"
                                                            style={{ color: 'var(--cuba-ink-subtle)', border: '1px solid var(--cuba-line)' }}
                                                        >
                                                            {stageForStatus(job.status).label} &middot; final stage
                                                        </p>
                                                    )}
                                                </div>

                                            </article>
                                        );
                                    })}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>
        </main>
    );
}
