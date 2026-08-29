import React from 'react';

const personalFields = ['firstname', 'lastname', 'email', 'phone', 'occupation'];

function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The final checkpoint is deliberately presentation-only: it makes the real
 * preview, template picker, persistence state and export actions discoverable
 * in one place without creating a second resume representation or bypassing
 * the existing export entitlement checks.
 */
const ReviewStep = ({ resumeData, templateName, saveState, onNavigate, onChooseTemplate, onPreview, onDownload, isDownloading }) => {
    const missingPersonalFields = personalFields.filter((field) => !hasText(resumeData?.[field]));
    const checks = [
        {
            id: 'personal',
            label: 'Personal details',
            description: missingPersonalFields.length
                ? `Add ${missingPersonalFields.length} required ${missingPersonalFields.length === 1 ? 'field' : 'fields'} before finishing.`
                : 'Name, contact details, and target role are ready.',
            ready: missingPersonalFields.length === 0,
            path: 'heading',
        },
        {
            id: 'summary',
            label: 'Professional summary',
            description: hasText(resumeData?.summary) ? 'A summary will appear in supported templates.' : 'Optional, but recommended for a stronger opening.',
            ready: hasText(resumeData?.summary),
            path: 'summary',
        },
        {
            id: 'experience',
            label: 'Work history',
            description: (resumeData?.employments || []).some((item) => hasText(item?.jobTitle) || hasText(item?.employer))
                ? 'Experience details are included.'
                : 'Optional for students and early-career candidates.',
            ready: (resumeData?.employments || []).some((item) => hasText(item?.jobTitle) || hasText(item?.employer)),
            path: 'work-history',
        },
        {
            id: 'skills',
            label: 'Skills',
            description: (resumeData?.skills || []).some((item) => hasText(item?.skillName) || hasText(item?.name))
                ? 'Skills are included.'
                : 'Optional, but helps recruiters scan your strengths.',
            ready: (resumeData?.skills || []).some((item) => hasText(item?.skillName) || hasText(item?.name)),
            path: 'skills',
        },
    ];
    const requiredReady = checks[0].ready;
    const saved = saveState?.status === 'saved';

    return (
        <section className="mx-auto min-h-full w-full max-w-4xl px-4 py-6 sm:px-6" aria-labelledby="review-export-title">
            <div className="mb-6">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">Final check</p>
                <h1 id="review-export-title" className="text-2xl font-bold tracking-tight text-slate-900">Review and export</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    Confirm the essentials, choose a template, then open the live preview or download your resume. Your draft remains editable after export.
                </p>
            </div>

            <div className={`mb-5 rounded-xl border p-4 ${saved ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`} role="status" aria-live="polite">
                <div className="flex items-start gap-3">
                    <span aria-hidden="true" className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${saved ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>{saved ? '✓' : '!'}</span>
                    <div>
                        <p className={`text-sm font-semibold ${saved ? 'text-emerald-900' : 'text-amber-900'}`}>{saved ? 'All changes saved' : (saveState?.message || 'Changes are still being saved')}</p>
                        <p className={`mt-1 text-xs ${saved ? 'text-emerald-800' : 'text-amber-800'}`}>{saved ? 'You can safely preview, download, or return to the dashboard.' : 'Wait for the save confirmation before leaving the builder.'}</p>
                    </div>
                </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-base font-bold text-slate-900">Content checklist</h2>
                            <p className="mt-1 text-xs text-slate-500"><span className="font-semibold text-slate-700">Required</span> means needed before you finish; the other sections are optional.</p>
                        </div>
                    </div>
                    <ul className="divide-y divide-slate-100" aria-label="Resume content checklist">
                        {checks.map((check, index) => (
                            <li key={check.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${check.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{check.ready ? '✓' : index === 0 ? '!' : '○'}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-800">{check.label} {index === 0 && <span className="ml-1 text-[10px] uppercase tracking-wide text-indigo-700">Required</span>}</p>
                                    <p className="mt-0.5 text-xs leading-5 text-slate-500">{check.description}</p>
                                </div>
                                <button type="button" onClick={() => onNavigate(check.path)} className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 hover:text-indigo-900">
                                    Edit<span className="sr-only"> {check.label}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Template and export actions">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Presentation</p>
                    <h2 className="mt-2 text-base font-bold text-slate-900">{templateName}</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">This template is applied to the live preview and your download.</p>
                    <button type="button" onClick={onChooseTemplate} className="mt-4 flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800">
                        Change template
                    </button>
                    <button type="button" onClick={onPreview} className="mt-2 flex min-h-10 w-full items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 transition-colors hover:border-indigo-300 hover:bg-indigo-100">
                        Open live preview
                    </button>
                    <button type="button" onClick={onDownload} disabled={isDownloading || !requiredReady} aria-describedby={!requiredReady ? 'export-requirement' : undefined} className="mt-2 flex min-h-10 w-full items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                        {isDownloading ? 'Preparing download…' : 'Download PDF'}
                    </button>
                    {!requiredReady && <p id="export-requirement" className="mt-2 text-xs leading-5 text-amber-800">Complete your required personal details to enable download.</p>}
                </aside>
            </div>
        </section>
    );
};

export default ReviewStep;
