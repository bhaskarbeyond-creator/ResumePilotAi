import React, { useState, useEffect } from 'react';
import { 
    MdAutoAwesome, 
    MdCheck, 
    MdClose, 
    MdEdit, 
    MdWarningAmber, 
    MdInfoOutline, 
    MdContentCopy 
} from 'react-icons/md';
import { sanitizeRichText } from '../../../utils/sanitizeHtml';

/**
 * AiDraftReviewModal — Strict AI Review & Confirmation Gate
 * 
 * Guarantees zero silent mutation of candidate data:
 * - Visually contrasts candidate's current data vs generated AI draft
 * - Alerts user if replacing existing content
 * - Allows in-modal editing before committing
 * - Requires explicit [Add to Resume] confirmation
 */
export default function AiDraftReviewModal({
    isOpen = false,
    onClose = () => {},
    onAccept = () => {},
    draftTitle = 'AI Draft — Review Before Adding',
    draftContent = '',
    existingContent = '',
    targetFieldLabel = 'Summary',
    roleLabel = 'Professional',
    disclaimer = 'Grounded strictly in the career information you provided. Verify all facts, dates, and metrics before adding.'
}) {
    const [editableText, setEditableText] = useState(draftContent);
    const [isEditing, setIsEditing] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        setEditableText(draftContent);
        setIsEditing(false);
        setCopied(false);
    }, [draftContent, isOpen]);

    if (!isOpen) return null;

    const hasExisting = Boolean(String(existingContent || '').trim());
    const isHtml = String(editableText || '').includes('<li') || String(editableText || '').includes('<ul');

    const handleCopy = () => {
        const plain = editableText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        navigator.clipboard?.writeText(plain);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div 
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ai-draft-modal-title"
            >
                {/* Modal Header */}
                <div className="px-5 py-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 text-white flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-amber-300">
                            <MdAutoAwesome className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black tracking-widest uppercase bg-white/20 px-2 py-0.5 rounded text-amber-200">
                                    AI Draft
                                </span>
                                <span className="text-[10px] font-bold text-indigo-100 capitalize">
                                    {roleLabel}
                                </span>
                            </div>
                            <h2 id="ai-draft-modal-title" className="text-sm font-bold text-white">
                                {draftTitle}
                            </h2>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                        aria-label="Close modal"
                    >
                        <MdClose className="w-5 h-5" />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-5 space-y-4 overflow-y-auto flex-1 text-slate-700">
                    {/* Overwrite Warning (If user already has text) */}
                    {hasExisting && (
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                            <MdWarningAmber className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Your existing {targetFieldLabel.toLowerCase()} will be replaced</p>
                                <p className="text-[11px] text-amber-700 mt-0.5">
                                    Adding this draft will update your current {targetFieldLabel.toLowerCase()}. You can review or edit it below before accepting.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Disclaimer Banner */}
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-500 flex items-start gap-2">
                        <MdInfoOutline className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                        <span>{disclaimer}</span>
                    </div>

                    {/* Comparison: Current vs Draft (if existing) */}
                    {hasExisting && (
                        <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Current {targetFieldLabel}:
                            </span>
                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 max-h-24 overflow-y-auto leading-relaxed">
                                {existingContent.replace(/<[^>]*>/g, ' ').trim()}
                            </div>
                        </div>
                    )}

                    {/* Draft Content Display / Editor */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1">
                                <MdAutoAwesome className="w-3 h-3" />
                                <span>Suggested Draft:</span>
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                    <MdContentCopy className="w-3 h-3" />
                                    <span>{copied ? 'Copied ✓' : 'Copy Text'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(!isEditing)}
                                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                                >
                                    <MdEdit className="w-3 h-3" />
                                    <span>{isEditing ? 'Preview Mode' : 'Edit Draft'}</span>
                                </button>
                            </div>
                        </div>

                        {isEditing ? (
                            <textarea
                                value={editableText}
                                onChange={(e) => setEditableText(e.target.value)}
                                rows={6}
                                className="w-full p-3 rounded-xl border border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs text-slate-800 leading-relaxed font-sans shadow-inner outline-hidden resize-y"
                                placeholder="Edit draft before adding..."
                            />
                        ) : (
                            <div className="p-3.5 rounded-xl bg-indigo-50/40 border border-indigo-100 text-xs text-slate-800 leading-relaxed max-h-60 overflow-y-auto space-y-2">
                                {isHtml ? (
                                    <div 
                                        className="prose prose-xs max-w-none prose-ul:my-1 prose-li:my-0.5 text-slate-800"
                                        dangerouslySetInnerHTML={{ __html: sanitizeRichText(editableText) }} 
                                    />
                                ) : (
                                    <p className="whitespace-pre-line">{editableText}</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Modal Actions */}
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                    >
                        Discard / Dismiss
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onAccept(editableText);
                            onClose();
                        }}
                        className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold transition-all cursor-pointer shadow-sm hover:shadow-md"
                    >
                        <MdCheck className="w-4 h-4" />
                        <span>Add to Resume</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
