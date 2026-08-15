/**
 * Shared validation for PDF export responses.
 *
 * `responseType: 'blob'` means an error body (JSON) arrives as a Blob too. Handing that
 * straight to the browser saves a file named `resume.pdf` that is actually an error
 * document — the user sees a "successful" download that no PDF reader can open.
 * Every download path therefore verifies the `%PDF-` magic bytes before saving and
 * surfaces the server's message when the payload is not a PDF.
 */

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

/** True when the buffer begins with the PDF magic number. */
export function isPdfBuffer(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < PDF_MAGIC.length) return false;
    const bytes = new Uint8Array(arrayBuffer.slice(0, PDF_MAGIC.length));
    return PDF_MAGIC.every((byte, index) => bytes[index] === byte);
}

/** Extracts a safe, human-readable message from a non-PDF error payload. */
export function readExportErrorMessage(arrayBuffer, fallback = 'Download failed: the server did not return a valid PDF.') {
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
 * Verifies an export response body and returns a genuine PDF Blob.
 * Throws an Error carrying the server-provided reason when the body is not a PDF.
 */
export async function toValidatedPdfBlob(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    if (!isPdfBuffer(arrayBuffer)) {
        const error = new Error(readExportErrorMessage(arrayBuffer));
        error.code = 'EXPORT_NOT_PDF';
        throw error;
    }
    return new Blob([arrayBuffer], { type: 'application/pdf' });
}

/** Builds a filesystem-safe PDF filename from resume data. */
export function pdfFileName(firstname, lastname, fallback = 'resume') {
    const raw = `${firstname || ''}_${lastname || ''}`.trim().replace(/^_+|_+$/g, '');
    // \p{M} keeps combining marks, without which Indic and other scripts using vowel
    // signs (e.g. "రావు") would be silently mangled into unreadable filenames.
    const safe = raw.replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '_').replace(/_{2,}/g, '_').slice(0, 80);
    return `${safe || fallback}.pdf`;
}
