import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdDelete, MdKeyboardArrowDown, MdAdd, MdCheck } from 'react-icons/md';
import InputField from './components/InputField';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';

/**
 * ReferencesStep — wizard step for the `references` section.
 *
 * Field set is limited to the fields consumed end-to-end:
 *   - name      -> Referee name     (renderer: ref.name)
 *   - reference -> Detail / quote   (renderer: ref.reference || ref.description)
 *
 * contact / email / phone are inspected only by the emptiness filter and are
 * never painted by SmartReferences, ResumeExtras, or the DOCX builder.
 */
const ReferencesStep = ({ resumeData, updateResumeData }) => {
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
        setExpandedCards(() => new Set([next.id]));
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
        if (references.length === 1) {
            setExpandedCards(new Set([references[0].id]));
        }
    }, [references.length]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="px-4 py-6 max-w-6xl mx-auto w-full min-h-full">
            <div className="mb-4">
                <h1 className="text-lg font-bold text-gray-900 mb-1">
                    {t('ReferencesStep.title', 'References')}
                </h1>
                <p className="text-gray-600 text-sm">
                    {t(
                        'ReferencesStep.subtitle',
                        'Add professional referees who can speak to your work.'
                    )}
                </p>
            </div>

            <div className="space-y-4">
                {references.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-teal-200 rounded-xl bg-teal-50/40">
                        <p className="text-sm font-medium text-slate-600 mb-1">
                            {t('ReferencesStep.empty.title', 'No references added yet')}
                        </p>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            {t(
                                'ReferencesStep.empty.description',
                                'Add a manager, mentor, or colleague and a short note about how they know you.'
                            )}
                        </p>
                    </div>
                )}

                {references.map((reference, index) => {
                    const isExpanded = expandedCards.has(reference.id);
                    const refereeName = reference.name || '';
                    const isComplete = Boolean(refereeName);

                    return (
                        <div
                            key={reference.id}
                            className={`relative bg-gradient-to-r from-white to-slate-50 border ${
                                isExpanded
                                    ? 'border-teal-200 rounded-xl shadow-lg shadow-teal-50'
                                    : 'border-gray-200 rounded-xl shadow-md hover:shadow-lg hover:border-teal-300 hover:from-teal-50 hover:to-slate-50'
                            }`}
                        >
                            <div
                                className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${
                                    isComplete
                                        ? 'bg-gradient-to-r from-teal-400 to-emerald-500'
                                        : 'bg-gradient-to-r from-gray-300 to-gray-400'
                                }`}
                            />

                            <div
                                className={`px-4 sm:px-6 py-4 ${
                                    isExpanded
                                        ? 'border-b border-teal-100 bg-gradient-to-r from-teal-50 to-emerald-50 rounded-t-xl'
                                        : 'rounded-xl'
                                } flex items-center cursor-pointer hover:bg-gradient-to-r hover:from-teal-50 hover:to-slate-50 group`}
                                onClick={() => toggleCardExpansion(reference.id)}
                            >
                                <div className="flex items-center flex-1 min-w-0">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mr-4 flex-shrink-0 shadow-sm bg-gradient-to-br from-teal-400 to-emerald-500 text-white shadow-teal-200">
                                        {isComplete ? (
                                            <MdCheck className="w-5 h-5" />
                                        ) : (
                                            <span className="font-bold">{index + 1}</span>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <h3
                                            className={`font-semibold text-base mb-1 truncate ${
                                                refereeName ? 'text-gray-800' : 'text-gray-400'
                                            }`}
                                        >
                                            {refereeName ||
                                                t('ReferencesStep.defaultValues.untitledReference', 'Untitled Reference')}
                                        </h3>
                                        {reference.reference && (
                                            <span className="block text-xs text-teal-600 font-medium truncate">
                                                {reference.reference}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center space-x-2 sm:space-x-3 ml-2 sm:ml-4">
                                    <div
                                        className={`w-3 h-3 rounded-full ${
                                            isComplete ? 'bg-teal-400' : 'bg-gray-300'
                                        }`}
                                    />

                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); moveReference(reference.id, -1); }}
                                        disabled={index === 0}
                                        aria-label={`Move ${refereeName || 'reference'} up`}
                                        className="p-1 text-slate-500 disabled:opacity-30"
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); moveReference(reference.id, 1); }}
                                        disabled={index === references.length - 1}
                                        aria-label={`Move ${refereeName || 'reference'} down`}
                                        className="p-1 text-slate-500 disabled:opacity-30"
                                    >
                                        ↓
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); duplicateReference(reference.id); }}
                                        aria-label={`Duplicate ${refereeName || 'reference'}`}
                                        className="p-1 text-slate-500"
                                    >
                                        ⧉
                                    </button>

                                    <button
                                        className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-100 rounded-lg"
                                        title={
                                            isExpanded
                                                ? t('ReferencesStep.actions.collapse', 'Collapse')
                                                : t('ReferencesStep.actions.expand', 'Expand')
                                        }
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleCardExpansion(reference.id);
                                        }}
                                    >
                                        <MdKeyboardArrowDown
                                            className={`w-5 h-5 ${isExpanded ? 'rotate-180' : ''}`}
                                        />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeReference(reference.id);
                                        }}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                        title={t('ReferencesStep.actions.remove', 'Remove reference')}
                                    >
                                        <MdDelete className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="p-4 sm:p-6 space-y-5 bg-gradient-to-br from-white to-slate-50 rounded-b-xl">
                                    <InputField
                                        label={t('ReferencesStep.fields.name.label', 'Referee Name')}
                                        name={`reference-name-${reference.id}`}
                                        placeholder={t(
                                            'ReferencesStep.fields.name.placeholder',
                                            'e.g. Priya Nair'
                                        )}
                                        value={reference.name || ''}
                                        onChange={(e) => updateReference(reference.id, 'name', e.target.value)}
                                        required
                                    />

                                    <div>
                                        <label
                                            htmlFor={`reference-detail-${reference.id}`}
                                            className="block text-sm font-semibold text-slate-800 tracking-wide mb-1.5"
                                        >
                                            {t('ReferencesStep.fields.reference.label', 'Reference Details')}
                                        </label>
                                        <textarea
                                            id={`reference-detail-${reference.id}`}
                                            name={`reference-detail-${reference.id}`}
                                            rows={3}
                                            value={reference.reference || ''}
                                            onChange={(e) => updateReference(reference.id, 'reference', e.target.value)}
                                            placeholder={t(
                                                'ReferencesStep.fields.reference.placeholder',
                                                'e.g. VP Engineering, Meridian — available on request'
                                            )}
                                            className="w-full px-3 py-3 border border-slate-300 rounded-sm text-sm text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                <button
                    onClick={addReference}
                    className="w-full p-6 border-2 border-dashed border-teal-300 rounded-xl text-teal-700 hover:border-teal-500 hover:text-teal-800 hover:bg-gradient-to-r hover:from-teal-50 hover:to-emerald-50 flex items-center justify-center font-semibold text-base shadow-sm hover:shadow-md"
                >
                    <MdAdd className="w-6 h-6 mr-3" />
                    {t('ReferencesStep.actions.addReference', 'Add Reference')}
                </button>
            </div>
        </div>
    );
};

export default ReferencesStep;
