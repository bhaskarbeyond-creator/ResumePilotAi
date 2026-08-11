import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// ----------------------------------------------
// 1. Worker configuration
// ----------------------------------------------
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const version = pdfjsLib.version || '3.11.174';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.js`;
}

// ----------------------------------------------
// 2. Constants & limits
// ----------------------------------------------
const MAX_PDF_PAGES = 100;
const EXTRACTION_TIMEOUT_MS = 30000;
const MIN_READABLE_TEXT_LENGTH = 20;

// ----------------------------------------------
// 3. Main exported function
// ----------------------------------------------
export async function extractTextFromResumeFile(file, onProgress, signal) {
    if (!file) throw new Error('No file provided.');

    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        throw new Error(`File exceeds ${MAX_SIZE / 1024 / 1024} MB limit.`);
    }

    const fileName = file.name.toLowerCase();
    const fileType = file.type || '';

    // DOCX
    if (
        fileName.endsWith('.docx') ||
        fileType.includes('word') ||
        fileType.includes('officedocument')
    ) {
        return await extractDocx(file, onProgress, signal);
    }

    // PDF
    if (fileName.endsWith('.pdf') || fileType.includes('pdf')) {
        return await extractPdf(file, onProgress, signal);
    }

    // Images
    if (
        fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ||
        fileName.endsWith('.png') || fileName.endsWith('.webp') ||
        fileType.startsWith('image/')
    ) {
        return await extractImageOcr(file, onProgress, signal);
    }

    // RTF
    if (fileName.endsWith('.rtf') || fileType.includes('rtf')) {
        return await extractRtf(file, onProgress, signal);
    }

    // Legacy DOC
    if (fileName.endsWith('.doc') || fileType === 'application/msword') {
        return await extractLegacyDoc(file, onProgress, signal);
    }

    // Fallback – plain text
    return await readTextFile(file, signal);
}

// ----------------------------------------------
// 4. DOCX extractor
// ----------------------------------------------
async function extractDocx(file, onProgress, signal) {
    try {
        const arrayBuffer = await readFileWithSignal(file, signal);
        if (typeof onProgress === 'function') onProgress(30);
        const result = await mammoth.extractRawText({ arrayBuffer });
        if (typeof onProgress === 'function') onProgress(80);
        if (result && result.value && result.value.trim().length > MIN_READABLE_TEXT_LENGTH) {
            if (typeof onProgress === 'function') onProgress(100);
            return cleanText(result.value);
        }
        console.warn('Mammoth returned little text, falling back to text reader.');
        return await readTextFile(file, signal);
    } catch (err) {
        console.warn('DOCX extraction failed, falling back to text reader.', err);
        return await readTextFile(file, signal);
    }
}

// ----------------------------------------------
// 5. PDF extractor
// ----------------------------------------------
async function extractPdf(file, onProgress, signal) {
    try {
        const arrayBuffer = await readFileWithSignal(file, signal);
        if (typeof onProgress === 'function') onProgress(20);

        const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version || '3.11.174'}/cmaps/`,
            cMapPacked: true,
            isEvalSupported: false,
        });

        const pdfDoc = await withTimeout(
            loadingTask.promise,
            EXTRACTION_TIMEOUT_MS,
            'PDF loading timed out.'
        );

        if (signal?.aborted) throw new Error('Extraction cancelled.');

        const totalPages = Math.min(pdfDoc.numPages, MAX_PDF_PAGES);
        let fullText = '';

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            if (signal?.aborted) throw new Error('Extraction cancelled.');
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item) => item.str).join(' ');
            fullText += pageText + '\n';
            const progress = 20 + Math.floor((pageNum / totalPages) * 70);
            if (typeof onProgress === 'function') onProgress(Math.min(progress, 90));
        }

        if (fullText.trim().length > MIN_READABLE_TEXT_LENGTH) {
            if (typeof onProgress === 'function') onProgress(100);
            return cleanText(fullText);
        }

        throw new Error('PDF contains no readable text.');
    } catch (err) {
        console.warn('PDF extraction failed, falling back to text reader.', err);
        return await readTextFile(file, signal);
    }
}

// ----------------------------------------------
// 6. Image OCR – returns base64 marker for vision AI
// ----------------------------------------------
async function extractImageOcr(file, onProgress, signal) {
    if (typeof onProgress === 'function') onProgress(10);
    try {
        const arrayBuffer = await readFileWithSignal(file, signal);
        if (typeof onProgress === 'function') onProgress(50);
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        if (typeof onProgress === 'function') onProgress(100);
        return `[IMAGE_RESUME_BASE64:${file.type || 'image/jpeg'}]${base64}`;
    } catch (imgErr) {
        console.warn('Image processing failed:', imgErr);
        throw new Error('Could not process image file. Please upload a PDF or DOCX version of your resume.');
    }
}

// ----------------------------------------------
// 7. RTF extractor
// ----------------------------------------------
async function extractRtf(file, onProgress, signal) {
    try {
        const rawContent = await readTextFileRaw(file, signal);
        if (typeof onProgress === 'function') onProgress(50);
        let text = rawContent
            .replace(/\\par[d]?/g, '\n')
            .replace(/\\\n/g, '\n')
            .replace(/\\[a-z]+[-]?\d*\s?/gi, '')
            .replace(/[{}]/g, '')
            .replace(/\\'[0-9a-fA-F]{2}/g, '')
            .replace(/\\\*/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        if (typeof onProgress === 'function') onProgress(100);
        if (text.length > MIN_READABLE_TEXT_LENGTH) {
            return cleanText(text);
        }
        throw new Error('RTF file contains no readable text.');
    } catch (err) {
        console.warn('RTF extraction failed, falling back to text reader.', err);
        return await readTextFile(file, signal);
    }
}

// ----------------------------------------------
// 8. Legacy DOC extractor
// ----------------------------------------------
async function extractLegacyDoc(file, onProgress, signal) {
    try {
        const arrayBuffer = await readFileWithSignal(file, signal);
        if (typeof onProgress === 'function') onProgress(30);
        // Try mammoth first (some .doc files are actually docx)
        try {
            const result = await mammoth.extractRawText({ arrayBuffer });
            if (result && result.value && result.value.trim().length > MIN_READABLE_TEXT_LENGTH) {
                if (typeof onProgress === 'function') onProgress(100);
                return cleanText(result.value);
            }
        } catch (_) { }
        // Binary text extraction
        if (typeof onProgress === 'function') onProgress(60);
        const bytes = new Uint8Array(arrayBuffer);
        let extracted = '';
        let currentWord = '';
        for (let i = 0; i < bytes.length; i++) {
            const byte = bytes[i];
            if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13 || byte === 9) {
                currentWord += String.fromCharCode(byte);
            } else {
                if (currentWord.length > 3) {
                    extracted += currentWord + ' ';
                }
                currentWord = '';
            }
        }
        if (currentWord.length > 3) extracted += currentWord;
        if (typeof onProgress === 'function') onProgress(100);
        if (extracted.trim().length > MIN_READABLE_TEXT_LENGTH) {
            return cleanText(extracted);
        }
        throw new Error('Legacy .doc file contains no extractable text.');
    } catch (err) {
        console.warn('Legacy DOC extraction failed, falling back to text reader.', err);
        return await readTextFile(file, signal);
    }
}

// ----------------------------------------------
// 9. Plain text file reader
// ----------------------------------------------
function readTextFile(file, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('Extraction cancelled.'));
            return;
        }
        const reader = new FileReader();
        let isResolved = false;
        const abortHandler = () => {
            reader.abort();
            isResolved = true;
            reject(new Error('Extraction cancelled.'));
        };
        signal?.addEventListener('abort', abortHandler);
        reader.onload = (e) => {
            if (isResolved) return;
            signal?.removeEventListener('abort', abortHandler);
            const raw = e.target?.result || '';
            const cleaned = cleanText(raw);
            if (cleaned.trim().length < MIN_READABLE_TEXT_LENGTH) {
                reject(new Error('File appears to be empty or binary. Please upload a PDF or DOCX resume.'));
            } else {
                resolve(cleaned);
            }
        };
        reader.onerror = () => {
            if (isResolved) return;
            signal?.removeEventListener('abort', abortHandler);
            reject(new Error('Failed to read file.'));
        };
        reader.readAsText(file);
    });
}

function readTextFileRaw(file, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('Extraction cancelled.'));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result || '');
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsText(file);
    });
}

// ----------------------------------------------
// 10. Helpers
// ----------------------------------------------
function readFileWithSignal(file, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('Extraction cancelled.'));
            return;
        }
        const reader = new FileReader();
        let isResolved = false;
        const abortHandler = () => {
            reader.abort();
            isResolved = true;
            reject(new Error('Extraction cancelled.'));
        };
        signal?.addEventListener('abort', abortHandler);
        reader.onload = (e) => {
            if (isResolved) return;
            signal?.removeEventListener('abort', abortHandler);
            resolve(e.target?.result);
        };
        reader.onerror = () => {
            if (isResolved) return;
            signal?.removeEventListener('abort', abortHandler);
            reject(new Error('Failed to read file.'));
        };
        reader.readAsArrayBuffer(file);
    });
}

function cleanText(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim();
}

function withTimeout(promise, ms, message) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
    ]);
}