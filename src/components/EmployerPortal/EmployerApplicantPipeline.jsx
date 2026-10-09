import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FiUsers, FiRefreshCw, FiSearch, FiMail, FiFileText, FiZoomIn, FiZoomOut, FiPrinter, FiDownload, FiX } from 'react-icons/fi';
import { AuthContext } from '../../context/AuthContext';
import { getJobApplications, getEmployerApplicationResume, updateApplicationStatus } from '../../services/api/platform';
import { useEmployerWorkspace, EMPLOYER_DATA_STATUS } from './useEmployerWorkspace';
import { EmployerPageHeader, EmployerLoading, EmployerErrorState, EmployerEmptyState } from './EmployerStates';
import SendMessageDialog from '../Dashboard/EmployerDashboard/SendMessageDialog';
import TemplateRenderer from '../TemplateRenderer';
import { normalizeResumeData } from '../../utils/resumeData';
import { sanitizeRichText } from '../../utils/sanitizeHtml';
// DIR-056 SUB-056-5: the shared print contract. Printing renders a subtree into
// a FRESH document, which inherits none of the app's CSS — so the stylesheets and
// the print rules both have to be carried across explicitly.
import { buildPrintableDocument } from '../../utils/printSurface';
// DIR-067: the centralized cross-platform export client — the recruiter drawer now
// produces real PDF/DOCX instead of a dead-end `.html` artefact.
import { downloadResumePdf, downloadResumeDocx } from '../../utils/exportDownloader';

/**
 * ATS stage -> Cuba status-pill tone (DIR-010).
 *
 * TONE MAPPING (semantic, not decorative):
 *   pending   -> warning  awaiting recruiter action
 *   shortlisted -> primary brand beat, the recruiter's positive gate
 *   interview -> info     scheduled/active conversation
 *   offer     -> success  extended, still reversible
 *   accepted  -> success
 *   hired     -> success-hi the terminal win, a deeper green so it outranks offer
 *   rejected  -> danger   terminal loss
 *   withdrawn -> neutral  candidate-initiated exit, deliberately de-emphasised
 *
 * The previous values were Tailwind `bg-*-50 text-*-700 border-*-200` tints. Those
 * were tuned against a single surface: as soon as the same pill sat on
 * --cuba-canvas or inside the glass resume modal the composited text dropped
 * below 4.5:1. These opaque tones are surface-independent - see the note above
 * the token block in cuba-tokens.css and the probe that proves it.
 */
const STAGE_TONE = {
    pending: 'cuba-pill-warning',
    shortlisted: 'cuba-pill-primary',
    interview: 'cuba-pill-info',
    offer: 'cuba-pill-success',
    hired: 'cuba-pill-success-hi',
    accepted: 'cuba-pill-success',
    rejected: 'cuba-pill-danger',
    withdrawn: 'cuba-pill-neutral',
};

const stageClass = (status) => `${STAGE_TONE[String(status || '').toLowerCase()] || 'cuba-pill-neutral'} px-2.5 py-1 text-xs`;

/**
 * The hiring stages a recruiter can drive an application through. `apiStatus`
 * is the value the authoritative PATCH /api/job-applications/:id/status
 * contract accepts; `stage` is what the pipeline displays. The backend
 * transition map (backend/index.js) is the authority — the UI only offers
 * stages the server would accept from the current one.
 */
const STAGE_OPTIONS = [
    { stage: 'interview', apiStatus: 'interview', label: 'Interview' },
    { stage: 'offer', apiStatus: 'accepted', label: 'Offer' },
    { stage: 'hired', apiStatus: 'accepted', label: 'Hired' },
    { stage: 'rejected', apiStatus: 'rejected', label: 'Rejected' },
];

/** Mirrors allowedTransitions in backend/index.js so the UI never offers a move the server refuses. */
const ALLOWED_TRANSITIONS = {
    pending: ['interview', 'accepted', 'rejected'],
    interview: ['accepted', 'rejected', 'pending'],
    accepted: ['interview', 'rejected'],
    rejected: ['pending', 'interview'],
};

const ZOOM_MIN = 60;
const ZOOM_MAX = 150;
const ZOOM_STEP = 10;
/** A4 content width at 96dpi — the rendered page keeps this width while `zoom` scales it. */
const RESUME_PAGE_WIDTH = 794;

/**
 * Resume templates are authored as `Cv7`, but stored documents can carry a
 * lowercase or unprefixed id. Resolve to the canonical registry id.
 */
const getCanonicalTemplateId = (doc) => {
    const raw = doc?.template || doc?.data?.template || 'Cv1';
    const cv = String(raw).match(/^cv\s*(\d+)$/i);
    if (cv) return `Cv${cv[1]}`;
    const cover = String(raw).match(/^cover\s*(\d+)$/i);
    if (cover) return `Cover${cover[1]}`;
    return raw || 'Cv1';
};

/**
 * Applicant ATS Pipeline — /employer/applicants
 *
 * Aggregates the applications of every requisition the signed-in recruiter owns
 * by reading the authoritative per-job application endpoint. The same
 * SendMessageDialog used elsewhere in the recruiter flow handles candidate
 * communication, and stage changes are written back through the existing
 * application status contract rather than a local-only UI state.
 */
const EmployerApplicantPipeline = ({ showToast }) => {
    const user = useContext(AuthContext);
    const { status, error, jobs, reload, metrics } = useEmployerWorkspace(user?.uid);
    const [rows, setRows] = useState([]);
    const [loadingApplicants, setLoadingApplicants] = useState(false);
    const [applicantError, setApplicantError] = useState(null);
    const [search, setSearch] = useState('');
    const [messageTarget, setMessageTarget] = useState(null);
    const [resumeTarget, setResumeTarget] = useState(null);
    const [resumePayload, setResumePayload] = useState(null);
    const [resumeLoading, setResumeLoading] = useState(false);
    const [resumeError, setResumeError] = useState(null);
    const [zoom, setZoom] = useState(100);
    const [stageBusyId, setStageBusyId] = useState(null);
    const [exportBusy, setExportBusy] = useState(null);
    const [exportError, setExportError] = useState('');
    const [drawerTab, setDrawerTab] = useState('resume');
    const printFrameRef = useRef(null);

    const loadPipeline = useCallback(async (jobList) => {
        if (!Array.isArray(jobList) || jobList.length === 0) {
            setRows([]);
            setApplicantError(null);
            return;
        }
        setLoadingApplicants(true);
        setApplicantError(null);
        try {
            // Sequential per-job reads keep the backend load predictable; the
            // endpoint is authoritative and already owner-scoped.
            const collected = [];
            for (const job of jobList) {
                // eslint-disable-next-line no-await-in-loop
                const applications = await getJobApplications(job.id);
                (Array.isArray(applications) ? applications : []).forEach((application) => {
                    collected.push({
                        id: application.id,
                        jobId: job.id,
                        jobTitle: job.title,
                        // MySQL returns raw snake_case rows from getApplications(),
                        // so every field must accept both casings. Reading only the
                        // camelCase keys silently rendered "Applicant" / "—" on live data.
                        applicantName: application.applicantName || application.applicant_name || application.fullName || application.userName || 'Applicant',
                        applicantEmail: application.applicantEmail || application.applicant_email || application.email || '',
                        applicantPhone: application.applicantPhone || application.applicant_phone || '',
                        status: String(application.status || 'pending').toLowerCase(),
                        appliedAt: application.appliedAt || application.createdAt || application.created_at || null,
                        revision: Number(application.revision || 0),
                        resumeId: application.resumeId || application.resume_id || null,
                        resumeUrl: application.resumeUrl || application.resume_url || null,
                        coverLetter: application.coverLetter || application.cover_letter || '',
                    });
                });
            }
            setRows(collected);
        } catch (pipelineError) {
            setApplicantError(pipelineError);
            setRows([]);
        } finally {
            setLoadingApplicants(false);
        }
    }, []);

    useEffect(() => {
        if (status === EMPLOYER_DATA_STATUS.READY) {
            loadPipeline(jobs);
        }
    }, [status, jobs, loadPipeline]);

    const visibleRows = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return rows;
        return rows.filter(row => `${row.applicantName} ${row.applicantEmail} ${row.jobTitle}`.toLowerCase().includes(term));
    }, [rows, search]);

    const stageCounts = useMemo(() => {
        const counts = rows.reduce((acc, row) => {
            acc[row.status] = (acc[row.status] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [rows]);

    /**
     * Opens the in-modal resume viewer and fetches the candidate's real document
     * through the employer-scoped RBAC endpoint.
     */
    const handleViewResume = useCallback(async (row) => {
        setResumeTarget(row);
        setResumePayload(null);
        setResumeError(null);
        setResumeLoading(true);
        setZoom(100);
        try {
            const data = await getEmployerApplicationResume(row.jobId, row.id);
            setResumePayload(data);
        } catch (fetchError) {
            setResumeError(fetchError);
        } finally {
            setResumeLoading(false);
        }
    }, []);

    const closeResume = useCallback(() => {
        setResumeTarget(null);
        setResumePayload(null);
        setResumeError(null);
        setResumeLoading(false);
    }, []);

    /**
     * Writes the stage through the authoritative status contract. The server is
     * the owner of the transition rules, so the row is refreshed from the API
     * response rather than optimistically re-labelled.
     */
    const handleStageChange = useCallback(async (row, apiStatus) => {
        if (!apiStatus || apiStatus === row.status) return;
        setStageBusyId(row.id);
        try {
            const result = await updateApplicationStatus(row.id, apiStatus, '', {
                expectedStatus: row.status,
                expectedRevision: row.revision,
            });
            const nextRevision = Number(result?.revision ?? row.revision + 1);
            setRows(current => current.map(item => (
                item.id === row.id && item.jobId === row.jobId
                    ? { ...item, status: apiStatus, revision: nextRevision }
                    : item
            )));
            showToast?.('Stage updated', 'success', `Applicant moved to ${apiStatus}.`);
        } catch (transitionError) {
            showToast?.('Stage update failed', 'error', transitionError?.message || 'Please try again.');
        } finally {
            setStageBusyId(null);
        }
    }, [showToast]);

    const availableStages = useCallback((currentStatus) => {
        const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
        return STAGE_OPTIONS.filter(option => allowed.includes(option.apiStatus));
    }, []);

    /** Prints only the rendered resume surface, never the surrounding recruiter chrome. */
    const handlePrint = useCallback(() => {
        const node = printFrameRef.current;
        if (!node || typeof window === 'undefined') return;
        const frame = document.createElement('iframe');
        frame.setAttribute('aria-hidden', 'true');
        frame.style.position = 'fixed';
        frame.style.right = '0';
        frame.style.bottom = '0';
        frame.style.width = '0';
        frame.style.height = '0';
        frame.style.border = '0';
        document.body.appendChild(frame);
        const frameDoc = frame.contentDocument;
        frameDoc.open();
        // DIR-056 SUB-056-5: a fresh document inherits NO application CSS, so the
        // resume used to print completely unstyled (no page breaks, unbounded
        // photos). buildPrintableDocument carries the live stylesheets AND the
        // shared print contract across the boundary.
        frameDoc.write(buildPrintableDocument({
            title: resumeTarget?.applicantName || 'Resume',
            innerHTML: node.innerHTML,
        }));
        frameDoc.close();
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(() => { document.body.removeChild(frame); }, 1000);
    }, [resumeTarget]);

    // DIR-067: the hand-rolled `.html` blob export is gone. The drawer now produces
    // real PDF/DOCX through the centralized client (see runExport below), so a
    // recruiter gets a document they can actually use.

    /** The cover letter is applicant-authored HTML, so it is sanitized before it reaches the DOM. */
    const safeCoverLetter = useMemo(
        () => sanitizeRichText(resumeTarget?.coverLetter || ''),
        [resumeTarget?.coverLetter],
    );

    const resumeDocument = resumePayload?.resume || null;
    const resumeTemplateId = useMemo(
        () => getCanonicalTemplateId(resumeDocument),
        [resumeDocument],
    );
    const resumeValues = useMemo(
        () => (resumeDocument ? normalizeResumeData(resumeDocument, { template: resumeTemplateId }) : null),
        [resumeDocument, resumeTemplateId],
    );
    const contact = resumeDocument
        ? {
            name: [resumeDocument.firstname, resumeDocument.lastname].filter(Boolean).join(' ') || resumeTarget?.applicantName || 'Applicant',
            email: resumeDocument.email || resumeTarget?.applicantEmail || '',
            phone: resumeDocument.phone || resumeTarget?.applicantPhone || '',
            role: resumeDocument.targetRole || resumeDocument.occupation || resumeTarget?.jobTitle || '',
        }
        : null;
    /**
     * DIR-067: the recruiter drawer exports the candidate's REAL resume through the
     * centralized client, never a hand-rolled `.html` blob. A published candidate
     * resume is served by the same-origin public export routes, so no owner Bearer
     * token is needed and the payload is magic-byte validated before it is saved.
     */
    const runExport = useCallback(async (kind) => {
        const doc = resumeDocument;
        if (!doc?.id) return;
        setExportError('');
        setExportBusy(kind);
        try {
            const options = {
                resumeId: String(doc.id),
                resumeName: resumeTemplateId,
                language: 'en',
                firstname: doc.firstname || '',
                lastname: doc.lastname || '',
                withAuth: false,
                analytics: false,
                // DIR-069: the employer claim lets a recruiter export the candidate's
                // DOCX even while it is still a draft. The server re-verifies that the
                // job belongs to this recruiter and that the application references
                // exactly this resume, so the client value is never trusted as authority.
                jobId: resumeTarget?.jobId || null,
                applicationId: resumeTarget?.id || null,
            };
            if (kind === 'docx') {
                await downloadResumeDocx({ ...options, endpoint: '/api/public-export-docx' });
            } else {
                await downloadResumePdf({ ...options, endpoint: '/api/public-export' });
            }
        } catch (error) {
            const validated = error?.code === 'EXPORT_NOT_PDF' || error?.code === 'EXPORT_NOT_DOCX';
            setExportError(validated
                ? error.message
                : 'This resume could not be exported. The candidate may not have published it yet.');
        } finally {
            setExportBusy(null);
        }
    }, [resumeDocument, resumeTemplateId, resumeTarget]);

    const handleDownloadPdf = useCallback(() => { void runExport('pdf'); }, [runExport]);
    const handleDownloadDocx = useCallback(() => { void runExport('docx'); }, [runExport]);



    if (status === EMPLOYER_DATA_STATUS.LOADING || status === EMPLOYER_DATA_STATUS.IDLE) {
        return <EmployerLoading label="Loading your applicant pipeline…" />;
    }

    if (status === EMPLOYER_DATA_STATUS.ERROR) {
        return <EmployerErrorState error={error} onRetry={() => reload().catch(() => {})} title="We could not load your applicant pipeline" />;
    }


    if (metrics.totalJobs === 0) {
        return (
            <div>
                <EmployerPageHeader
                    eyebrow="Requisitions & Applicants"
                    title="Applicant ATS Pipeline"
                    description="Every applicant across your requisitions, with their current hiring stage."
                />
                <EmployerEmptyState
                    icon={<FiUsers className="h-5 w-5" aria-hidden="true" />}
                    title="No requisitions to build a pipeline from"
                    description="Post your first role and applicants will flow into this pipeline automatically as they apply."
                />
            </div>
        );
    }

    if (applicantError) {
        return <EmployerErrorState error={applicantError} onRetry={() => loadPipeline(jobs)} title="We could not load applications for your requisitions" />;
    }

    const headerActions = (
        <button
            type="button"
            onClick={() => { reload().then(() => loadPipeline(jobs)).catch(() => {}); }}
            disabled={loadingApplicants}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 cuba-focusable"
        >
            <FiRefreshCw className="h-4 w-4" aria-hidden="true" />
            {loadingApplicants ? 'Refreshing…' : 'Refresh'}
        </button>
    );


    return (
        <div>
            <EmployerPageHeader
                eyebrow="Requisitions & Applicants"
                title="Applicant ATS Pipeline"
                description="Every applicant across your requisitions, with their current hiring stage."
                actions={headerActions}
            />

            {stageCounts.length > 0 && (
                <ul className="mb-4 flex flex-wrap gap-2" aria-label="Pipeline stage summary">
                    {stageCounts.map(([stage, count]) => (
                        <li key={stage} className={`capitalize ${stageClass(stage)}`}>
                            {stage}: {count}
                        </li>
                    ))}
                </ul>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <label htmlFor="employer-applicant-search" className="sr-only">Search applicants</label>
                <div className="relative">
                    <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <input
                        id="employer-applicant-search"
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search by candidate, email, or role"
                        className="cuba-field w-full rounded-xl py-2.5 pl-9 pr-3 text-sm placeholder:text-slate-400"
                    />
                </div>

                {loadingApplicants && (
                    <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600" role="status" aria-live="polite">
                        Loading applications for {metrics.totalJobs} requisition{metrics.totalJobs === 1 ? '' : 's'}…
                    </p>
                )}

                {!loadingApplicants && visibleRows.length === 0 && (
                    <div className="mt-4">
                        <EmployerEmptyState
                            icon={<FiUsers className="h-5 w-5" aria-hidden="true" />}
                            title={search ? 'No applicants match your search' : 'No applicants yet'}
                            description={search
                                ? 'Try a different candidate name, email, or role.'
                                : 'Once candidates apply to your postings they will appear here with their current pipeline stage.'}
                        />
                    </div>
                )}


                {!loadingApplicants && visibleRows.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                            <caption className="sr-only">Applicants across your job postings</caption>
                            <thead>
                                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                                    <th scope="col" className="py-2.5 pr-4 font-bold">Candidate</th>
                                    <th scope="col" className="py-2.5 pr-4 font-bold">Role</th>
                                    <th scope="col" className="py-2.5 pr-4 font-bold">Resume</th>
                                    <th scope="col" className="py-2.5 pr-4 font-bold">Stage</th>
                                    <th scope="col" className="py-2.5 pr-4 font-bold">Applied</th>
                                    <th scope="col" className="py-2.5 font-bold text-right">Contact</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visibleRows.map((row) => (
                                    <tr key={`${row.jobId}-${row.id}`}>
                                        <td className="py-3 pr-4">
                                            <span className="block font-bold text-slate-800">{row.applicantName}</span>
                                            {row.applicantEmail && <span className="block text-xs text-slate-500">{row.applicantEmail}</span>}
                                        </td>
                                        <td className="py-3 pr-4 text-slate-700">{row.jobTitle}</td>
                                        <td className="py-3 pr-4">
                                            {row.resumeId ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleViewResume(row)}
                                                    className="cuba-btn-primary inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                                                >
                                                    <FiFileText className="h-3.5 w-3.5" aria-hidden="true" />
                                                    View Resume
                                                </button>
                                            ) : (
                                                <span className="text-xs text-slate-400">Not attached</span>
                                            )}
                                        </td>
                                        <td className="py-3 pr-4">
                                            <span className={`capitalize ${stageClass(row.status)}`}>
                                                {row.status}
                                            </span>
                                            <label className="sr-only" htmlFor={`stage-${row.jobId}-${row.id}`}>
                                                Move {row.applicantName} to another hiring stage
                                            </label>
                                            <select
                                                id={`stage-${row.jobId}-${row.id}`}
                                                value=""
                                                disabled={stageBusyId === row.id || availableStages(row.status).length === 0}
                                                onChange={(event) => handleStageChange(row, event.target.value)}
                                                className="cuba-field mt-1.5 block w-full max-w-[9.5rem] rounded-lg px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <option value="">Move stage…</option>
                                                {availableStages(row.status).map(option => (
                                                    <option key={`${option.stage}-${option.apiStatus}`} value={option.apiStatus}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="py-3 pr-4 text-xs text-slate-600">
                                            {row.appliedAt ? new Date(row.appliedAt).toLocaleDateString() : '—'}
                                        </td>
                                        <td className="py-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => setMessageTarget(row)}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 cuba-focusable"
                                            >
                                                <FiMail className="h-3.5 w-3.5" aria-hidden="true" />
                                                Message
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {messageTarget && (
                <SendMessageDialog
                    isOpen
                    onClose={() => setMessageTarget(null)}
                    applicationId={messageTarget.id}
                    applicantName={messageTarget.applicantName}
                    showToast={showToast}
                />
            )}

            {resumeTarget && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
                        onClick={closeResume}
                        aria-hidden="true"
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="employer-resume-dialog-title"
                        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                    >
                        <header className="flex flex-wrap items-start gap-3 border-b border-slate-200 px-5 py-4">
                            <div className="min-w-0 flex-1">
                                <h2 id="employer-resume-dialog-title" className="truncate text-base font-bold text-slate-900">
                                    {contact?.name || resumeTarget.applicantName}
                                    <span className="sr-only"> resume preview</span>
                                </h2>
                                <p className="mt-0.5 truncate text-xs text-slate-500">
                                    {resumeTarget.jobTitle}
                                    {contact?.role ? ` · ${contact.role}` : ''}
                                </p>
                                {(contact?.email || contact?.phone) && (
                                    <p className="mt-1 truncate text-xs text-slate-600">
                                        {[contact.email, contact.phone].filter(Boolean).join(' · ')}
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-none items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setZoom(current => Math.max(ZOOM_MIN, current - ZOOM_STEP))}
                                    disabled={!resumeValues || zoom <= ZOOM_MIN}
                                    aria-label="Zoom out resume preview"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cuba-focusable"
                                >
                                    <FiZoomOut className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <span className="w-12 text-center text-xs font-bold text-slate-600" aria-live="polite">{zoom}%</span>
                                <button
                                    type="button"
                                    onClick={() => setZoom(current => Math.min(ZOOM_MAX, current + ZOOM_STEP))}
                                    disabled={!resumeValues || zoom >= ZOOM_MAX}
                                    aria-label="Zoom in resume preview"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cuba-focusable"
                                >
                                    <FiZoomIn className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={handlePrint}
                                    disabled={!resumeValues}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cuba-focusable"
                                >
                                    <FiPrinter className="h-4 w-4" aria-hidden="true" />
                                    Print
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDownloadPdf}
                                    disabled={!resumeValues || exportBusy !== null}
                                    aria-label="Download candidate resume as PDF"
                                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cuba-focusable"
                                >
                                    <FiDownload className="h-4 w-4" aria-hidden="true" />
                                    {exportBusy === 'pdf' ? 'Preparing…' : 'PDF'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDownloadDocx}
                                    disabled={!resumeValues || exportBusy !== null}
                                    aria-label="Download candidate resume as Word DOCX"
                                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cuba-focusable"
                                >
                                    <FiFileText className="h-4 w-4" aria-hidden="true" />
                                    {exportBusy === 'docx' ? 'Preparing…' : 'Word'}
                                </button>
                                <button
                                    type="button"
                                    onClick={closeResume}
                                    aria-label="Close resume preview"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition-colors hover:bg-slate-50 cuba-focusable"
                                >
                                    <FiX className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                        </header>
                        {/* DIR-067: the cover letter is decoupled from the A4 canvas and
                            presented as a clean tabbed view beside it. */}
                        {!resumeLoading && !resumeError && resumeValues && safeCoverLetter && (
                            <div
                                role="tablist"
                                aria-label="Candidate documents"
                                className="flex flex-none gap-1 border-b border-slate-200 bg-white px-4 pt-3"
                            >
                                {[{ id: 'resume', label: 'Resume' }, { id: 'cover', label: 'Cover letter' }].map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        role="tab"
                                        id={`recruiter-tab-${tab.id}`}
                                        aria-selected={drawerTab === tab.id}
                                        aria-controls={`recruiter-panel-${tab.id}`}
                                        tabIndex={drawerTab === tab.id ? 0 : -1}
                                        onClick={() => setDrawerTab(tab.id)}
                                        onKeyDown={(event) => {
                                            const order = ['resume', 'cover'];
                                            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                                            event.preventDefault();
                                            const at = order.indexOf(drawerTab);
                                            const nextAt = event.key === 'Home' ? 0
                                                : event.key === 'End' ? order.length - 1
                                                    : (at + (event.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length;
                                            setDrawerTab(order[nextAt]);
                                        }}
                                        className={`-mb-px rounded-t-lg border border-b-0 px-3 py-2 text-xs font-bold transition-colors cuba-focusable ${drawerTab === tab.id ? 'border-slate-200 bg-slate-50 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        {exportError && (
                            <p role="alert" className="flex-none border-b border-rose-200 bg-rose-50 px-5 py-2 text-xs font-bold text-rose-700">
                                {exportError}
                            </p>
                        )}
                        <div
                            role="tabpanel"
                            id="recruiter-panel-resume"
                            aria-labelledby="recruiter-tab-resume"
                            hidden={Boolean(safeCoverLetter) && drawerTab !== 'resume'}
                            className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4"
                        >
                            {resumeLoading && (
                                <p role="status" aria-live="polite" className="py-16 text-center text-sm text-slate-500">
                                    Loading candidate resume…
                                </p>
                            )}

                            {!resumeLoading && resumeError && (
                                <p role="alert" className="py-16 text-center text-sm font-bold text-rose-600">
                                    {resumeError.message || 'This resume could not be loaded.'}
                                </p>
                            )}

                            {!resumeLoading && !resumeError && !resumeDocument && (
                                <p role="status" className="py-16 text-center text-sm text-slate-500">
                                    No resume was attached to this application.
                                </p>
                            )}

                            {!resumeLoading && !resumeError && resumeValues && (
                                /*
                                 * The page uses a fixed pixel width and the `zoom` scale is
                                 * applied to it, so zooming genuinely enlarges the CV.
                                 * A percentage width would self-cancel: at a higher zoom the
                                 * percentage resolves against the shrunken zoomed space and
                                 * the visible width would stay constant. The fixed width
                                 * simply overflows the scrollable viewport, which is the
                                 * expected behaviour of a document preview.
                                 */
                                <div data-testid="employer-resume-canvas" className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4">
                                    <div
                                        ref={printFrameRef}
                                        data-testid="employer-resume-page"
                                        className="mx-auto bg-white shadow-sm"
                                        style={{ width: `${RESUME_PAGE_WIDTH}px`, zoom: zoom / 100 }}
                                    >
                                        <TemplateRenderer
                                            templateId={resumeTemplateId}
                                            values={resumeValues}
                                            language="en"
                                            loadingFallback={
                                                <div className="flex min-h-48 items-center justify-center bg-slate-50 p-6 text-sm text-slate-500">
                                                    Loading template…
                                                </div>
                                            }
                                            errorFallback={
                                                <div role="alert" className="flex min-h-48 items-center justify-center bg-slate-50 p-6 text-sm text-slate-600">
                                                    This resume template could not be rendered.
                                                </div>
                                            }
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {safeCoverLetter && (
                            <div
                                role="tabpanel"
                                id="recruiter-panel-cover"
                                aria-labelledby="recruiter-tab-cover"
                                hidden={drawerTab !== 'cover'}
                                className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4"
                            >
                                <section className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Cover letter</h3>
                                    <div
                                        className="mt-3 max-w-none text-sm leading-relaxed text-slate-700 [&_p]:mb-3"
                                        dangerouslySetInnerHTML={{ __html: safeCoverLetter }}
                                    />
                                </section>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmployerApplicantPipeline;
