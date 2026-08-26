import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { extractTextFromResumeFile } from '../../services/resumeParser';
import { parseResumeTextToStructuredData } from '../../services/aiService';
import { normalizeRawDataToTempJson, mapTempJsonToResumePayload } from '../../services/resumeFieldMapper';

// Constants for validation
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/rtf',
    'text/rtf',
    'text/plain',
];
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.rtf'];

const ResumeImportModal = ({
    isOpen,
    onClose,
    onImportData,
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [status, setStatus] = useState('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [parsedResult, setParsedResult] = useState(null);
    const [fileName, setFileName] = useState('');
    const [progress, setProgress] = useState(0);
    const fileInputRef = useRef(null);
    const modalRef = useRef(null);
    const requestControllerRef = useRef(null);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            requestControllerRef.current?.abort();
            requestControllerRef.current = null;
            setStatus('idle');
            setErrorMessage('');
            setParsedResult(null);
            setFileName('');
            setProgress(0);
        }
    }, [isOpen]);

    const handleFileSelect = useCallback(
        async (file) => {
            if (!file) return;

            // Validate file type
            const ext = '.' + file.name.split('.').pop()?.toLowerCase();
            if (!ALLOWED_EXTENSIONS.includes(ext) || (file.type && !ALLOWED_TYPES.includes(file.type))) {
                setStatus('error');
                setErrorMessage('Unsupported file format. Please upload PDF, DOCX, DOC, TXT, or RTF.');
                return;
            }

            // Validate file size
            if (file.size > MAX_FILE_SIZE) {
                setStatus('error');
                setErrorMessage('File exceeds 10MB limit. Please compress or use a smaller file.');
                return;
            }

            requestControllerRef.current?.abort();
            const requestController = new AbortController();
            requestControllerRef.current = requestController;
            setFileName(file.name);
            setStatus('extracting');
            setErrorMessage('');
            setParsedResult(null);
            setProgress(10);

            try {
                // Step 1: Extract text with live progress tracking
                setProgress(30);
                const rawText = await extractTextFromResumeFile(
                    file,
                    (percent) => setProgress(30 + Math.floor(percent * 0.3))
                );

                if (!rawText || rawText.trim().length < 20) {
                    throw new Error('No readable text found in document. Please try a text-based PDF or DOCX.');
                }
                setProgress(60);

                // Step 2: AI Parse
                setStatus('parsing');
                const structuredData = await parseResumeTextToStructuredData(rawText, { signal: requestController.signal });
                setProgress(90);

                // Fallback regex for contact info (guarantees)
                const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                const phoneMatch = rawText.match(/(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/);
                if (!structuredData.email && emailMatch) structuredData.email = emailMatch[0];
                if (!structuredData.phone && phoneMatch) structuredData.phone = phoneMatch[0];

                // Step 3: Convert into standardized Temp JSON
                const tempJson = normalizeRawDataToTempJson(structuredData, rawText);

                setParsedResult(tempJson);
                setStatus('success');
                setProgress(100);
            } catch (err) {
                if (err?.name === 'AbortError') {
                    setStatus('idle');
                    setProgress(0);
                    return;
                }
                console.error('Resume import error:', err);
                setStatus('error');
                setErrorMessage(err.message || 'Failed to import resume. Please try another file.');
                setProgress(0);
            } finally {
                if (requestControllerRef.current === requestController) requestControllerRef.current = null;
            }
        },
        []
    );

    const handleDrop = useCallback(
        (e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileSelect(file);
        },
        [handleFileSelect]
    );

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleApply = useCallback(() => {
        if (parsedResult) {
            // Accurately map temp JSON fields to full builder payload
            const finalPayload = mapTempJsonToResumePayload(parsedResult, {});
            onImportData(finalPayload);
            onClose();
        }
    }, [parsedResult, onImportData, onClose]);

    // Keyboard shortcut: Escape to close
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-labelledby="resume-import-title"
                onClick={(e) => {
                    if (e.target === e.currentTarget) onClose();
                }}
            >
                <motion.div
                    ref={modalRef}
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-100"
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-5 text-white flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                    />
                                </svg>
                            </div>
                            <div>
                                <h3 id="resume-import-title" className="font-bold text-lg">
                                    Import from Existing Resume
                                </h3>
                                <p className="text-xs text-blue-100">
                                    Upload your old PDF or DOCX to pre-fill all fields instantly with AI
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            aria-label="Close modal"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        {status === 'idle' && (
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 ${isDragging
                                        ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]'
                                        : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50'
                                    }`}
                            >
                                <div className="w-16 h-16 mx-auto mb-4 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        />
                                    </svg>
                                </div>
                                <h4 className="font-semibold text-slate-800 text-sm mb-1">
                                    Drag and drop your resume file here
                                </h4>
                                <p className="text-xs text-slate-500 mb-4">
                                    Supports PDF, DOCX, DOC, TXT, RTF, JPG, JPEG, PNG (up to 10MB)
                                </p>
                                <label className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-md hover:shadow-lg transition-all duration-200">
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                                        />
                                    </svg>
                                    Browse Document
                                    <input
                                        type="file"
                                        accept=".pdf,.docx,.doc,.txt,.rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={(e) => handleFileSelect(e.target.files?.[0])}
                                    />
                                </label>
                            </div>
                        )}

                        {(status === 'extracting' || status === 'parsing') && (
                            <div className="py-8 text-center">
                                <div className="relative w-20 h-20 mx-auto mb-6">
                                    <div className="absolute inset-0 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                                    <div className="absolute inset-2 bg-indigo-50 rounded-full flex items-center justify-center">
                                        <svg
                                            className="w-8 h-8 text-indigo-600 animate-pulse"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M13 10V3L4 14h7v7l9-11h-7z"
                                            />
                                        </svg>
                                    </div>
                                </div>
                                <h4 className="font-bold text-slate-800 text-base mb-1">
                                    {status === 'extracting' ? 'Reading Resume Document...' : 'AI Engine Analyzing Career History...'}
                                </h4>
                                <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                                    {status === 'extracting'
                                        ? `Extracting text content from ${fileName}`
                                        : 'Extracting contact info, work history, education, and skills into builder steps.'}
                                </p>
                                {/* Progress bar */}
                                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden max-w-xs mx-auto">
                                    <motion.div
                                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ duration: 0.3 }}
                                    />
                                </div>
                                <p className="text-xs text-slate-400 mt-2">{Math.round(progress)}%</p>
                                {/* Cancel button during loading */}
                                <button
                                    onClick={() => {
                                        requestControllerRef.current?.abort();
                                        requestControllerRef.current = null;
                                        setStatus('idle');
                                        setProgress(0);
                                    }}
                                    className="mt-4 px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}

                        {status === 'success' && parsedResult && (
                            <div className="space-y-4">
                                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-3">
                                    <div className="p-2 bg-emerald-500 text-white rounded-xl">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h5 className="font-bold text-emerald-900 text-sm">Resume Successfully Parsed!</h5>
                                        <p className="text-xs text-emerald-700">AI extracted career data from {fileName}</p>
                                    </div>
                                </div>

                                {/* Data preview grid */}
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                        <span className="text-slate-400 block mb-0.5 font-medium">Candidate Name</span>
                                        <span className="font-semibold text-slate-800 truncate block">
                                            {parsedResult.firstname || parsedResult.lastname
                                                ? `${parsedResult.firstname || ''} ${parsedResult.lastname || ''}`.trim() || '—'
                                                : 'Detected'}
                                        </span>
                                    </div>
                                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                        <span className="text-slate-400 block mb-0.5 font-medium">Occupation</span>
                                        <span className="font-semibold text-slate-800 truncate block">
                                            {parsedResult.occupation || 'Detected'}
                                        </span>
                                    </div>
                                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                        <span className="text-slate-400 block mb-0.5 font-medium">Work History</span>
                                        <span className="font-semibold text-slate-800 block">
                                            {parsedResult.employments?.length || 0} positions
                                        </span>
                                    </div>
                                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                        <span className="text-slate-400 block mb-0.5 font-medium">Education</span>
                                        <span className="font-semibold text-slate-800 block">
                                            {parsedResult.educations?.length || 0} degrees
                                        </span>
                                    </div>
                                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl col-span-2">
                                        <span className="text-slate-400 block mb-0.5 font-medium">Key Skills Extracted</span>
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                            {(parsedResult.skills || []).slice(0, 8).map((sk, i) => (
                                                <span
                                                    key={i}
                                                    className="px-2 py-0.5 bg-indigo-100 text-indigo-700 font-medium text-[11px] rounded-md"
                                                >
                                                    {sk.skillName || sk.name}
                                                </span>
                                            ))}
                                            {(parsedResult.skills?.length || 0) > 8 && (
                                                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 font-medium text-[11px] rounded-md">
                                                    +{(parsedResult.skills?.length || 0) - 8} more
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {status === 'error' && (
                            <div className="p-6 text-center">
                                <div className="w-12 h-12 mx-auto mb-3 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                    </svg>
                                </div>
                                <h4 className="font-bold text-slate-800 text-sm mb-1">Import Failed</h4>
                                <p className="text-xs text-rose-600 mb-4">{errorMessage}</p>
                                <button
                                    onClick={() => {
                                        setStatus('idle');
                                        setErrorMessage('');
                                    }}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                                >
                                    Try Another Document
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex items-center justify-between">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                        >
                            Cancel
                        </button>
                        {status === 'success' && (
                            <button
                                onClick={handleApply}
                                className="flex items-center px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
                            >
                                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Apply All to Builder Steps
                            </button>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default ResumeImportModal;