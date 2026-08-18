/**
 * Shared validation and utilities for DOCX export responses.
 *
 * Verifies ZIP/PK magic bytes (`0x50, 0x4b`) before saving to ensure
 * a JSON error response is never downloaded as a corrupt `.docx` file.
 */

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
