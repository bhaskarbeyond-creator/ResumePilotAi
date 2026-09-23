import React, { useEffect, useState } from 'react';
import { computeResumeCompleteness, normalizePortfolioData } from '../../utils/portfolioData.js';
import { normalizeResumeData } from '../../utils/resumeData.js';

export default function CreateWebCvDialog({ open, resumes, loading, onUseResume, onStartBlank, onCancel }) {
    const [mode, setMode] = useState('resume');
    const [selectedId, setSelectedId] = useState('');

    useEffect(() => {
        if (!open) return;
        setMode(resumes.length ? 'resume' : 'blank');
        setSelectedId(resumes[0]?.id || '');
    }, [open, resumes]);

    if (!open) return null;

    const selected = resumes.find((item) => item.id === selectedId);

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="create-webcv-title">
            <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="border-b border-slate-200 px-6 py-5">
                    <h2 id="create-webcv-title" className="text-xl font-semibold text-slate-900">Create Web CV</h2>
                    <p className="mt-1 text-sm text-slate-600">Use an existing resume or start with a private blank draft. Portfolio edits never change the resume.</p>
                </div>
                <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
                    <button type="button" onClick={() => setMode('resume')} className={`rounded-xl border px-4 py-4 text-left ${mode === 'resume' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                        <p className="font-medium text-slate-900">Use my resume</p>
                        <p className="mt-1 text-sm text-slate-500">Import real master data immediately. No re-entry.</p>
                    </button>
                    <button type="button" onClick={() => setMode('blank')} className={`rounded-xl border px-4 py-4 text-left ${mode === 'blank' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                        <p className="font-medium text-slate-900">Start blank</p>
                        <p className="mt-1 text-sm text-slate-500">Create an empty private draft and write it from scratch.</p>
                    </button>
                </div>
                {mode === 'resume' ? (
                    <div className="px-6 pb-5">
                        {loading ? <p className="text-sm text-slate-500">Loading resumes…</p> : null}
                        {!loading && !resumes.length ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">No resumes found. Start blank, or create a resume first.</p> : null}
                        <div className="max-h-72 space-y-2 overflow-y-auto">
                            {resumes.map((resume) => {
                                const data = normalizeResumeData(resume.data || resume.item || resume);
                                const completeness = computeResumeCompleteness(data);
                                const updated = resume.updatedAt ? (() => { try { const d = typeof resume.updatedAt?.toDate === 'function' ? resume.updatedAt.toDate() : new Date(resume.updatedAt); return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : 'Unknown'; } catch { return 'Unknown'; } })() : 'Unknown';
                                return (
                                    <label key={resume.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${selectedId === resume.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                                        <input type="radio" name="webcv-resume" className="mt-1" checked={selectedId === resume.id} onChange={() => setSelectedId(resume.id)} />
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-slate-900">{data.title && data.title.trim().toLowerCase() !== 'untitled resume' ? data.title : data.occupation ? `${data.occupation} Resume` : [data.firstname, data.lastname].filter(Boolean).join(' ') || 'Resume'}</p>
                                            <p className="text-xs text-slate-500">Updated {updated} · {completeness.score}% complete · {data.occupation || 'No title'}</p>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
                <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
                    <button type="button" onClick={onCancel} className="text-sm font-medium text-slate-600 hover:text-slate-900">Cancel</button>
                    <button
                        type="button"
                        onClick={() => (mode === 'blank' ? onStartBlank() : selected && onUseResume(selected))}
                        disabled={mode === 'resume' && !selected}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                        Create private draft
                    </button>
                </div>
            </div>
        </div>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function previewResumeLabel(resume) {
    const data = normalizePortfolioData(resume?.data || resume);
    return data.heading.fullName || 'Resume';
}
