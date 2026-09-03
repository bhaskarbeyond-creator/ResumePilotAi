import React, { useEffect, useRef } from 'react';
import { MdAutoAwesome, MdClose, MdWarningAmber } from 'react-icons/md';

/**
 * ConfirmRegenerateModal
 * Replaces the browser's default window.confirm popup with a polished,
 * accessible, enterprise-grade modal dialog when regenerating Job Descriptions.
 */
const ConfirmRegenerateModal = ({
    isOpen,
    onClose,
    onConfirm,
    targetRole = '',
    existingTextSnippet = '',
    isGenerating = false,
}) => {
    const modalRef = useRef(null);
    const returnFocusRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            returnFocusRef.current = document.activeElement;
            document.body.style.overflow = 'hidden';
            // Auto focus confirm button after animation
            const timer = setTimeout(() => {
                modalRef.current?.querySelector('[data-autofocus="true"]')?.focus();
            }, 60);
            return () => clearTimeout(timer);
        } else {
            document.body.style.overflow = 'unset';
            returnFocusRef.current?.focus?.();
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
            if (e.key === 'Tab' && modalRef.current) {
                const focusable = modalRef.current.querySelectorAll(
                    'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget && !isGenerating) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in"
            onClick={handleBackdropClick}
            role="presentation"
        >
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-regenerate-title"
                aria-describedby="confirm-regenerate-desc"
                className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-indigo-100 p-6 overflow-hidden transition-all duration-200 transform scale-100 animate-in zoom-in-95"
            >
                {/* Header Decoration */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 border border-amber-300 flex items-center justify-center text-amber-800 shadow-2xs shrink-0">
                            <MdWarningAmber className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 id="confirm-regenerate-title" className="text-sm font-bold text-slate-900">
                                Replace Existing Job Requirements?
                            </h3>
                            <p className="text-[11px] text-slate-500 font-medium">
                                Target Role Tailoring & ATS Copilot
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isGenerating}
                        className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors"
                        aria-label="Close modal"
                    >
                        <MdClose className="w-4 h-4" />
                    </button>
                </div>

                {/* Body Content */}
                <div className="mt-4 space-y-3">
                    <p id="confirm-regenerate-desc" className="text-xs text-slate-600 leading-relaxed">
                        Your target requirements already contain custom text. Regenerating will synthesize fresh, industry-standard responsibilities and key qualifications tailored to:
                    </p>

                    <div className="p-2.5 rounded-xl bg-indigo-50/80 border border-indigo-100 flex items-center gap-2">
                        <span className="text-[11px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md shrink-0">
                            Target Role
                        </span>
                        <span className="text-xs font-semibold text-indigo-950 truncate">
                            {targetRole || 'Current Profession'}
                        </span>
                    </div>

                    {existingTextSnippet && (
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                Current text will be replaced
                            </span>
                            <p className="text-[11px] text-slate-600 italic line-clamp-2">
                                "{existingTextSnippet.slice(0, 120)}{existingTextSnippet.length > 120 ? '...' : ''}"
                            </p>
                        </div>
                    )}

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <MdAutoAwesome className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span>You can always manually edit or paste custom text at any time.</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isGenerating}
                        className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        data-autofocus="true"
                        onClick={onConfirm}
                        disabled={isGenerating}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 rounded-xl shadow-xs shadow-indigo-200 transition-all hover:shadow-sm disabled:opacity-50"
                    >
                        {isGenerating ? (
                            <>
                                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                <span>Generating...</span>
                            </>
                        ) : (
                            <>
                                <MdAutoAwesome className="w-3.5 h-3.5" />
                                <span>Regenerate & Replace</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmRegenerateModal;
