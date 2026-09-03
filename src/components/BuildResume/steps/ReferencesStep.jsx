import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdAdd, MdCheck } from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import Field from '../components/Field.jsx';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';

/**
 * References — privacy-first. The default is the "available upon request"
 * statement; named references are optional and include a consent note.
 * No AI, no invented statistics.
 */
const ReferencesStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [references, setReferences] = useState(resumeData.references || []);

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
        setReferences(prev => [...prev, next]);
    };

    const applyAvailableOnRequest = () => {
        setReferences([{
            id: Date.now(),
            name: 'Professional References',
            reference: 'Available upon request',
        }]);
    };

    const removeReference = (id) => setReferences(prev => prev.filter(item => item.id !== id));

    const moveReference = (id, direction) => setReferences(current => moveResumeItem(current, id, direction));

    const duplicateReference = (id) => setReferences(current => {
        const source = current.find(item => item.id === id);
        return duplicateResumeItem(current, id, { name: `${source?.name || 'Reference'} (Copy)` });
    });

    const updateReference = (id, field, value) => {
        setReferences(prev => prev.map(item => (item.id === id ? { ...item, [field]: value } : item)));
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            const validReferences = references.filter(item => String(item?.name || '').trim() !== '');

            const completedSteps = [...(resumeData.completedSteps || [])];
            let updatedCompletedSteps = null;
            if (validReferences.length > 0 && !completedSteps.includes(10)) {
                updatedCompletedSteps = [...completedSteps, 10];
            } else if (validReferences.length === 0 && completedSteps.includes(10)) {
                updatedCompletedSteps = completedSteps.filter(step => step !== 10);
            }

            updateResumeData({
                references,
                ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [references]); // eslint-disable-line react-hooks/exhaustive-deps

    const hasReferences = references.some(r => String(r?.name || '').trim() !== '');

    return (
        <StepShell
            stepNumber={10}
            stepPath="references"
            title={t('ReferencesStep.title', 'References')}
            subtitle={t('ReferencesStep.subtitle', 'How (and whether) recruiters can reach references for you.')}
            isComplete={hasReferences}
            statusBadge={references.length > 0 ? `${references.length} ${references.length === 1 ? 'entry' : 'entries'}` : ''}
            resumeData={resumeData}
            targetJd={resumeData.targetJobDescription || ''}
        >
            <div className="space-y-3">
                {references.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center space-y-4">
                        <h3 className="text-base font-bold tracking-tight text-slate-900">Start with the privacy-safe default</h3>
                        <p className="mx-auto max-w-md text-sm leading-relaxed text-slate-500">
                            Most candidates keep reference contact details private and provide them when asked.
                            Use the statement below, or add named references if the role asks for them.
                        </p>
                        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={applyAvailableOnRequest}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                            >
                                <MdCheck className="w-4 h-4" />
                                “Available upon request”
                            </button>
                            <button
                                type="button"
                                onClick={addReference}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                            >
                                <MdAdd className="w-4 h-4" />
                                Add a named reference
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs divide-y divide-slate-100">
                            {references.map((reference, index) => (
                                <div key={reference.id} className="p-4 space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <Field
                                            label={index === 0 ? 'Name' : undefined}
                                            name={`reference-name-${reference.id}`}
                                            placeholder="e.g. your manager's full name"
                                            value={reference.name || ''}
                                            onChange={(e) => updateReference(reference.id, 'name', e.target.value)}
                                        />
                                        <Field
                                            label={index === 0 ? 'Title, organization & contact' : undefined}
                                            name={`reference-contact-${reference.id}`}
                                            placeholder="e.g. Department Director, contact@example.com"
                                            value={reference.reference || ''}
                                            onChange={(e) => updateReference(reference.id, 'reference', e.target.value)}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 justify-end">
                                        <button
                                            type="button"
                                            onClick={() => moveReference(reference.id, -1)}
                                            disabled={index === 0}
                                            className="text-xs font-semibold text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                        >
                                            Move up
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveReference(reference.id, 1)}
                                            disabled={index === references.length - 1}
                                            className="text-xs font-semibold text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                        >
                                            Move down
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeReference(reference.id)}
                                            className="text-xs font-semibold text-rose-500 hover:text-rose-700"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <p className="text-xs text-slate-500 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            Consent note: add a person only if they have agreed to be contacted as a reference.
                        </p>

                        <button
                            type="button"
                            onClick={addReference}
                            className="w-full h-11 rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-sm font-semibold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-colors"
                        >
                            <MdAdd className="w-4 h-4" />
                            Add another reference
                        </button>
                    </div>
                )}
            </div>
        </StepShell>
    );
};

export default ReferencesStep;
