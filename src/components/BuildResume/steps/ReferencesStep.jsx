import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    MdDelete, 
    MdKeyboardArrowDown, 
    MdAdd, 
    MdCheck, 
    MdPeople,
    MdContentCopy,
    MdArrowUpward,
    MdArrowDownward 
} from 'react-icons/md';
import InputField from './components/InputField';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import StepWorkspaceLayout from '../components/StepWorkspaceLayout';
import QuickAddCommandBar from '../components/QuickAddCommandBar';

const ReferencesStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [references, setReferences] = useState(resumeData.references || []);
    const [expandedCards, setExpandedCards] = useState(new Set());

    useEffect(() => {
        if (resumeData.references && Array.isArray(resumeData.references)) {
            setReferences(resumeData.references);
        }
    }, [resumeData.references]);

    const createNewReference = () => ({
        id: Date.now(),
        name: '',
        reference: '',
    });

    const addReference = () => {
        const next = createNewReference();
        setReferences((prev) => [...prev, next]);
        setExpandedCards(new Set([next.id]));
    };

    const handleQuickAddAction = (actionId) => {
        switch (actionId) {
            case 'use-privacy-safe':
                setReferences([{
                    id: Date.now(),
                    name: 'Professional References',
                    reference: 'Available upon request'
                }]);
                break;
            case 'add-referee':
            default:
                addReference();
                break;
        }
    };

    const removeReference = (id) => {
        setReferences((prev) => prev.filter((item) => item.id !== id));
        setExpandedCards((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const moveReference = (id, direction) =>
        setReferences((current) => moveResumeItem(current, id, direction));

    const duplicateReference = (id) =>
        setReferences((current) => {
            const source = current.find((item) => item.id === id);
            return duplicateResumeItem(current, id, {
                name: `${source?.name || 'Reference'} (Copy)`,
            });
        });

    const toggleCardExpansion = (id) => {
        setExpandedCards((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const updateReference = (id, field, value) => {
        setReferences((prev) =>
            prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
        );
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            const validReferences = references.filter((item) => String(item?.name || '').trim() !== '');

            const completedSteps = [...(resumeData.completedSteps || [])];
            let updatedCompletedSteps = null;
            if (validReferences.length > 0 && !completedSteps.includes(10)) {
                updatedCompletedSteps = [...completedSteps, 10];
            } else if (validReferences.length === 0 && completedSteps.includes(10)) {
                updatedCompletedSteps = completedSteps.filter((step) => step !== 10);
            }

            updateResumeData({
                references,
                ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [references]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (references.length === 1 && expandedCards.size === 0) {
            setExpandedCards(new Set([references[0].id]));
        }
    }, [references.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const hasReferences = references.some((r) => String(r?.name || '').trim() !== '');

    return (
        <StepWorkspaceLayout
            stepNumber={10}
            stepPath="references"
            title={t('ReferencesStep.title', 'Professional References')}
            subtitle={t('ReferencesStep.subtitle', 'Add professional referees who can speak to your work and character.')}
            isComplete={hasReferences}
            statusBadge={`${references.length} Referee${references.length === 1 ? '' : 's'}`}
            resumeData={resumeData}
            onNavigate={onNavigate}
        >
            <div className="space-y-3">
                {/* Command Bar: Contextual Quick-Add Actions (Always Available) */}
                <QuickAddCommandBar
                    stepPath="references"
                    onAction={handleQuickAddAction}
                />

                {references.length === 0 ? (
                    /* Interactive Professional References & Privacy Studio (Empty State) */
                    <div className="bg-white rounded-xl border border-slate-200/90 p-5 sm:p-6 space-y-5 shadow-2xs">
                        {/* Header Banner */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 shadow-2xs">
                                    <MdPeople className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-slate-900">
                                        Professional References & Privacy Studio
                                    </h2>
                                    <p className="text-xs text-slate-500">
                                        Choose between the standard privacy-safe statement or list named professional referees.
                                    </p>
                                </div>
                            </div>
                            <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 shrink-0 self-start sm:self-center">
                                Privacy-First Format
                            </span>
                        </div>

                        {/* 2 Strategic Reference Options */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            {/* Option 1: Privacy-Safe Clause */}
                            <div className="p-4 rounded-xl border-2 border-emerald-200/90 bg-emerald-50/30 hover:bg-emerald-50/50 transition-all space-y-3 flex flex-col justify-between">
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                                            Recommended Standard
                                        </span>
                                        <span className="text-[10px] font-bold text-emerald-600">92% Recruiters Prefer</span>
                                    </div>
                                    <h3 className="text-xs font-bold text-slate-900">
                                        Available Upon Request
                                    </h3>
                                    <p className="text-[11px] text-slate-600 leading-relaxed">
                                        Protects mentor and manager contact details from public exposure and saves resume space for core professional deliverables.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const newId = Date.now();
                                        setReferences([{
                                            id: newId,
                                            name: 'Professional References',
                                            reference: 'Available upon request'
                                        }]);
                                    }}
                                    className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                                >
                                    <MdCheck className="w-3.5 h-3.5" />
                                    <span>Apply "Available Upon Request"</span>
                                </button>
                            </div>

                            {/* Option 2: Named Referee */}
                            <div className="p-4 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-white transition-all space-y-3 flex flex-col justify-between">
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-extrabold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                            Named Contacts
                                        </span>
                                        <span className="text-[10px] font-semibold text-slate-400">Direct Verification</span>
                                    </div>
                                    <h3 className="text-xs font-bold text-slate-900">
                                        Add Specific Mentor / Manager
                                    </h3>
                                    <p className="text-[11px] text-slate-500 leading-relaxed">
                                        Add specific managers, department heads, practice directors, or academic mentors who have consented to provide direct endorsements.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={addReference}
                                    className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                                >
                                    <MdAdd className="w-3.5 h-3.5" />
                                    <span>Add Named Referee</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* High-Density References Studio with Milestone Bar */
                    <div className="space-y-2.5">
                        {/* Milestone Bar */}
                        <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="font-bold text-slate-800 truncate">
                                    {references.length} Reference Entr{references.length === 1 ? 'y' : 'ies'} Configured
                                </span>
                                <span className="text-[11px] text-slate-400 hidden sm:inline">• Recruiter Verification</span>
                            </div>
                            <button
                                type="button"
                                onClick={addReference}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer shrink-0"
                            >
                                <MdAdd className="w-3.5 h-3.5" />
                                <span>Add Reference</span>
                            </button>
                        </div>

                        {references.map((reference, index) => {
                            const isExpanded = expandedCards.has(reference.id);
                            const refereeName = reference.name || '';
                            const isFilled = Boolean(refereeName);

                            return (
                                <div
                                    key={reference.id}
                                    className={`bg-white rounded-xl border transition-all duration-150 ${
                                        isExpanded 
                                            ? 'border-indigo-300 shadow-md ring-2 ring-indigo-500/10' 
                                            : 'border-slate-200/90 shadow-2xs hover:border-slate-300'
                                    }`}
                                >
                                    {/* Compact Card Header */}
                                    <div 
                                        className={`px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer ${
                                            isExpanded ? 'border-b border-slate-100 bg-slate-50/50 rounded-t-xl' : 'rounded-xl'
                                        }`}
                                        onClick={() => toggleCardExpansion(reference.id)}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                                isFilled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                                            }`}>
                                                {isFilled ? <MdCheck className="w-4 h-4" /> : index + 1}
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className={`text-xs sm:text-sm font-bold truncate ${refereeName ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                                                        {refereeName || 'Untitled Reference'}
                                                    </h3>
                                                    {reference.reference && (
                                                        <>
                                                            <span className="text-slate-300 text-xs">•</span>
                                                            <span className="text-xs text-slate-500 truncate max-w-xs">
                                                                {reference.reference}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Controls */}
                                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                onClick={() => moveReference(reference.id, -1)}
                                                disabled={index === 0}
                                                aria-label="Move reference up"
                                                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                                title="Move up"
                                            >
                                                <MdArrowUpward className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveReference(reference.id, 1)}
                                                disabled={index === references.length - 1}
                                                aria-label="Move reference down"
                                                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                                title="Move down"
                                            >
                                                <MdArrowDownward className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => duplicateReference(reference.id)}
                                                aria-label="Duplicate reference"
                                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                                                title="Duplicate"
                                            >
                                                <MdContentCopy className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeReference(reference.id)}
                                                aria-label="Remove reference"
                                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                                title="Delete"
                                            >
                                                <MdDelete className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleCardExpansion(reference.id)}
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer ml-1"
                                                title={isExpanded ? 'Collapse' : 'Expand'}
                                            >
                                                <MdKeyboardArrowDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Form Body */}
                                    {isExpanded && (
                                        <div className="p-4 sm:p-5 space-y-3">
                                            <div className="flex items-center justify-between pb-1">
                                                <InputField
                                                    label={t('ReferencesStep.fields.name.label', 'Referee Full Name')}
                                                    name={`reference-name-${reference.id}`}
                                                    placeholder="e.g. Dr. Sarah Jenkins, Department Director"
                                                    value={reference.name || ''}
                                                    onChange={(e) => updateReference(reference.id, 'name', e.target.value)}
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                                                        Title, Company & Contact Details
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateReference(reference.id, 'reference', 'Available upon request')}
                                                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                                                    >
                                                        + Set "Available upon request"
                                                    </button>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={reference.reference || ''}
                                                    onChange={(e) => updateReference(reference.id, 'reference', e.target.value)}
                                                    placeholder="e.g. Department Director • contact@example.com • Available upon request"
                                                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all shadow-2xs"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Add Button */}
                        <button
                            type="button"
                            onClick={addReference}
                            className="w-full h-11 border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-xl text-xs font-bold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                        >
                            <MdAdd className="w-4 h-4" />
                            <span>Add Another Reference</span>
                        </button>
                    </div>
                )}
            </div>
        </StepWorkspaceLayout>
    );
};

export default ReferencesStep;
