/**
 * Centralized cross-platform export downloader — DIR-064.
 *
 * WHY THIS EXISTS
 *   PDF and DOCX export used to be hand-rolled at every call site: six portals
 *   each assembled their own `axios.post(..., { responseType: 'blob' })`, their own
 *   magic-byte check and their own `download(...)` call. That duplication is how a
 *   JSON error body could be saved as a corrupt `resume.pdf`, and how a platform-
 *   specific detail could creep into one path but not another.
 *
 *   This module is the SINGLE source for both formats. It is pure JavaScript
 *   (axios + downloadjs) with no Windows-only tooling — no `winget`, no PowerShell,
 *   no platform paths — so it behaves identically on the Linux production host and
 *   in a local XAMPP environment.
 *
 * SINGLE-SOURCE VALIDATION
 *   The `%PDF-` and `PK` (zip/OOXML) magic-byte validators and the filesystem-safe
 *   filename builders live in ./pdfDownload.js and ./docxDownload.js, are unit
 *   tested, and are re-exported here so every consumer imports from one module.
 *
 * SECURITY
 *   The Firebase ID token is read per request and used only as a `Bearer` header;
 *   it is never logged, persisted, or placed in the DOM. Filenames derived from
 *   user-controlled candidate names are sanitised against path traversal.
 */

import axios from 'axios';
import download from 'downloadjs';
import config from '../conf/configuration';
import fire from '../conf/fire';
import { trackDownload, trackEvent, trackEngagement } from './ga4';
import { IncrementDownloads, addOneToNumberOfDocumentsDownloaded } from '../services/api/platform';
import {
    isPdfBuffer,
    readExportErrorMessage,
    toValidatedPdfBlob,
    pdfFileName,
} from './pdfDownload';
import {
    isDocxBuffer,
    readDocxExportErrorMessage,
    toValidatedDocxBlob,
    docxFileName,
    executeDocxDownload,
} from './docxDownload';

// Re-export the low-level, independently unit-tested primitives so every export
// surface can import its validator, filename builder and legacy DOCX helper from
// ONE module instead of reaching into two.
export {
    isPdfBuffer,
    isDocxBuffer,
    readExportErrorMessage,
    readDocxExportErrorMessage,
    toValidatedPdfBlob,
    toValidatedDocxBlob,
    pdfFileName,
    docxFileName,
    executeDocxDownload,
};

/** Canonical export kinds. */
export const EXPORT_KIND = Object.freeze({ PDF: 'pdf', DOCX: 'docx' });

/** OOXML (Word) media type. */
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Filesystem-safe filename guard.
 *
 * The server never supplies the filename, but a candidate name is user-controlled
 * and could contain path separators or `..` traversal. Strip everything that is not
 * a letter/mark/number/underscore/hyphen, collapse runs, and never return empty.
 */
export function sanitizeExportFileName(name, fallback = 'resume') {
    const raw = String(name == null ? '' : name);
    const safe = raw
        .replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_+|_+$/g, '');
    return safe.slice(0, 80) || fallback;
}

/** Absolute backend URL for an export endpoint path. */
function backendUrl(pathname) {
    return `${config.provider}://${config.backendUrl}${pathname}`;
}

/**
 * Resolve the Authorization header for an export request.
 *
 * The Bearer token is read from Firebase per request and NEVER logged or stored.
 * A missing/failed token yields an unauthenticated request rather than an error,
 * matching the previous per-portal behaviour.
 */
async function resolveAuthHeaders(withAuth) {
    if (!withAuth) return {};
    try {
        const user = fire.auth?.()?.currentUser;
        const token = user && typeof user.getIdToken === 'function'
            ? await user.getIdToken().catch(() => null)
            : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
        return {};
    }
}

const EXPORT_SPECS = Object.freeze({
    pdf: {
        endpoint: '/api/export',
        validate: toValidatedPdfBlob,
        mime: 'application/pdf',
        buildName: (firstname, lastname) => pdfFileName(firstname, lastname),
        analyticsEvent: 'download_document',
        engagement: 'document_downloaded',
        downloadType: 'resume',
    },
    docx: {
        endpoint: '/api/export-docx',
        validate: toValidatedDocxBlob,
        mime: DOCX_MIME,
        buildName: (firstname, lastname) => docxFileName(firstname, lastname),
        analyticsEvent: 'download_document_docx',
        engagement: 'document_downloaded_docx',
        downloadType: 'resume_docx',
    },
});

/**
 * Single cross-platform export client used by every portal surface.
 *
 * @param {object} options
 * @param {'pdf'|'docx'} options.kind           Export format.
 * @param {string} options.resumeId             Resume document id (required).
 * @param {string} [options.resumeName]         Template id (default 'Cv1').
 * @param {string} [options.language]           Locale for rendering (default 'en').
 * @param {string} [options.firstname]          Used to build the saved filename.
 * @param {string} [options.lastname]           Used to build the saved filename.
 * @param {object} [options.colors]             DOCX theme colours.
 * @param {string} [options.endpoint]           Override the request path/URL verbatim
 *                                              (e.g. same-origin '/api/public-export').
 * @param {boolean} [options.withAuth=true]     Attach a Firebase Bearer token.
 * @param {string} [options.fileName]           Explicit base filename (extension added).
 * @param {string} [options.documentType]       Analytics document_type override.
 * @param {boolean} [options.analytics=true]    Emit GA4 download analytics.
 * @param {boolean} [options.incrementCounts]   Increment download counters server-side.
 * @param {string} [options.userId]             User for the counter increment.
 * @param {Function} [options.persistLatest]    Persist draft before export.
 * @param {Function} [options.onStateChange]    Loading/error state observer.
 * @returns {Promise<boolean>} true once a genuine, validated file has been saved.
 */
export async function downloadResumeExport({
    kind,
    resumeId,
    resumeName = 'Cv1',
    language = 'en',
    firstname = '',
    lastname = '',
    colors = null,
    endpoint = null,
    withAuth = true,
    fileName = null,
    documentType = null,
    analytics = true,
    incrementCounts = false,
    userId = null,
    persistLatest = null,
    onStateChange = null,
    // DIR-069: an optional verified employer claim. When present, the public DOCX
    // route can export a DRAFT candidate resume for a recruiter who owns the job
    // and whose application references exactly this resume.
    jobId = null,
    applicationId = null,
} = {}) {
    const spec = EXPORT_SPECS[kind];
    if (!spec) throw new Error(`Unsupported export kind: ${kind}`);
    if (!resumeId) throw new Error(`Resume ID is required for ${String(kind).toUpperCase()} export`);

    const notify = (state) => {
        try { onStateChange?.(state); } catch { /* observers must never break a download */ }
    };

    if (typeof persistLatest === 'function') {
        notify('saving');
        const saved = await persistLatest({ manual: true });
        if (!saved) throw new Error('Resume must be saved before export');
    }

    notify('requesting');
    const headers = await resolveAuthHeaders(withAuth);
    // An explicit endpoint is honoured verbatim (relative stays same-origin); the
    // default resolves against the configured backend origin.
    const target = endpoint || backendUrl(spec.endpoint);

    const payload = { language, resumeId, resumeName };
    if (kind === EXPORT_KIND.DOCX && colors) payload.colors = colors;
    // DIR-069: forward the employer claim only when BOTH identifiers are present;
    // the server re-verifies ownership, so this is a request hint, not authority.
    if (jobId && applicationId) {
        payload.jobId = String(jobId);
        payload.applicationId = String(applicationId);
    }

    const response = await axios.post(target, payload, { responseType: 'blob', headers });

    // Magic-byte validation: a `responseType: 'blob'` response can carry a JSON
    // error body. Handing that to the browser would save a file that no reader can
    // open, so verify the `%PDF-` / `PK` signature and surface the server message.
    const blob = await spec.validate(response.data);

    const baseName = fileName
        ? sanitizeExportFileName(String(fileName).replace(/\.(pdf|docx)$/i, ''), 'resume')
        : (spec.buildName(firstname, lastname).replace(/\.(pdf|docx)$/i, '') || 'resume');
    const fullName = `${baseName}.${kind}`;

    notify('saving-file');
    download(blob, fullName, spec.mime);

    if (analytics) {
        trackDownload(resumeName, spec.downloadType);
        trackEvent(spec.analyticsEvent, 'Documents', resumeName, 1);
        trackEngagement(spec.engagement, {
            template_name: resumeName,
            document_type: documentType || spec.downloadType,
        });
    }

    if (incrementCounts) {
        await Promise.allSettled([
            IncrementDownloads(),
            addOneToNumberOfDocumentsDownloaded(userId || fire.auth?.()?.currentUser?.uid),
        ]);
    }

    notify('done');
    return true;
}

/** Download the resume as a validated PDF. */
export function downloadResumePdf(options = {}) {
    return downloadResumeExport({ ...options, kind: EXPORT_KIND.PDF });
}

/** Download the resume as a validated DOCX (OOXML) package. */
export function downloadResumeDocx(options = {}) {
    return downloadResumeExport({ ...options, kind: EXPORT_KIND.DOCX });
}

