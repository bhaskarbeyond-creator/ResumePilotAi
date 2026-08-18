/**
 * Shared validation, utilities, and execution helper for DOCX export.
 *
 * Verifies ZIP/PK magic bytes (`0x50, 0x4b`) before saving to ensure
 * a JSON error response is never downloaded as a corrupt `.docx` file.
 */

import axios from 'axios';
import download from 'downloadjs';
import config from '../conf/configuration';
import { trackDownload, trackEvent, trackEngagement } from './ga4';
import { IncrementDownloads, addOneToNumberOfDocumentsDownloaded } from '../firestore/dbOperations';

const DOCX_MAGIC = [0x50, 0x4b]; // PK zip container magic bytes

/** True when the buffer begins with the ZIP magic number. */
export function isDocxBuffer(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < DOCX_MAGIC.length) return false;
    const bytes = new Uint8Array(arrayBuffer.slice(0, DOCX_MAGIC.length));
    return DOCX_MAGIC.every((byte, index) => bytes[index] === byte);
}

/** Extracts a safe, human-readable message from a non-DOCX error payload. */
export function readDocxExportErrorMessage(arrayBuffer, fallback = 'Download failed: the server did not return a valid Word document.') {
    try {
        const text = new TextDecoder().decode(arrayBuffer);
        const parsed = JSON.parse(text);
        const error = parsed?.error;
        const message = typeof error === 'string' ? error : error?.message;
        return message ? `Download failed: ${message}` : fallback;
    } catch {
        return fallback;
    }
}

/**
 * Verifies an export response body and returns a genuine DOCX Blob.
 * Throws an Error carrying the server-provided reason when the body is not a DOCX.
 */
export async function toValidatedDocxBlob(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    if (!isDocxBuffer(arrayBuffer)) {
        const error = new Error(readDocxExportErrorMessage(arrayBuffer));
        error.code = 'EXPORT_NOT_DOCX';
        throw error;
    }
    return new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** Builds a filesystem-safe DOCX filename from resume data. */
export function docxFileName(firstname, lastname, fallback = 'resume') {
    const raw = `${firstname || ''}_${lastname || ''}`.trim().replace(/^_+|_+$/g, '');
    const safe = raw.replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '_').replace(/_{2,}/g, '_').slice(0, 80);
    return `${safe || fallback}.docx`;
}

/**
 * Authoritative client-side DOCX download helper.
 * Persists the latest draft (if persistLatest provided), requests /api/export-docx,
 * validates the ZIP/OOXML package, triggers browser download, and logs analytics.
 */
export async function executeDocxDownload({
    resumeId,
    resumeName = 'Cv1',
    language = 'en',
    firstname = '',
    lastname = '',
    userId = null,
    colors = null,
    persistLatest = null,
}) {
    if (!resumeId) {
        throw new Error('Resume ID is required for DOCX export');
    }
    if (typeof persistLatest === 'function') {
        const saved = await persistLatest({ manual: true });
        if (!saved) {
            throw new Error('Resume must be saved before export');
        }
    }

    const response = await axios.post(
        `${config.provider}://${config.backendUrl}/api/export-docx`,
        {
            language,
            resumeId,
            resumeName,
            colors,
        },
        {
            responseType: 'blob',
        }
    );

    const docxBlob = await toValidatedDocxBlob(response.data);
    const fileName = docxFileName(firstname, lastname);

    download(docxBlob, fileName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    trackDownload(resumeName, 'resume_docx');
    trackEvent('download_document_docx', 'Documents', resumeName, 1);
    trackEngagement('document_downloaded_docx', {
        template_name: resumeName,
        document_type: 'resume_docx',
    });

    if (userId) {
        await Promise.allSettled([
            IncrementDownloads(),
            addOneToNumberOfDocumentsDownloaded(userId),
        ]);
    }

    return true;
}
