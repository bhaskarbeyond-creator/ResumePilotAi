import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdDelete, MdKeyboardArrowDown, MdAdd, MdCheck, MdWorkspacePremium } from 'react-icons/md';
import InputField from './components/InputField';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';

/**
 * CertificationsStep — wizard step for the `certifications` section with
 * explicit user-entered credential details and auto-sync.
 */
const CertificationsStep = ({ resumeData, updateResumeData }) => {
    const { t } = useTranslation('common');
    const [certifications, setCertifications] = useState(resumeData.certifications || []);
    const [expandedCards, setExpandedCards] = useState(new Set());

    useEffect(() => {
        if (resumeData.certifications && Array.isArray(resumeData.certifications)) {
            setCertifications(resumeData.certifications);
        }
    }, [resumeData.certifications]);

    const createNewCertification = (initialData = {}) => ({
        id: Date.now() + Math.floor(Math.random() * 1000),
        title: initialData.title || '',
        issuer: initialData.issuer || '',
        date: initialData.date || '',
    });

    const addCertification = () => {
        const newCertification = createNewCertification();
        setCertifications((prev) => [...prev, newCertification]);
        setExpandedCards(() => new Set([newCertification.id]));
    };

    const removeCertification = (id) => {
        setCertifications((prev) => prev.filter((cert) => cert.id !== id));
        setExpandedCards((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const moveCertification = (id, direction) =>
        setCertifications((current) => moveResumeItem(current, id, direction));

    const duplicateCertification = (id) =>
        setCertifications((current) => {
            const source = current.find((cert) => cert.id === id);
            return duplicateResumeItem(current, id, {
                title: `${source?.title || source?.name || 'Certification'} (Copy)`,
            });
        });

    const toggleCardExpansion = (id) => {
        setExpandedCards((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const updateCertification = (id, field, value) => {
        setCertifications((prev) =>
            prev.map((cert) => (cert.id === id ? { ...cert, [field]: value } : cert))
        );
    };

    // Auto-save on change (500ms debounce)
    useEffect(() => {
        const timer = setTimeout(() => {
            const validCertifications = certifications.filter(
                (cert) => (cert.title || cert.name || '').trim() !== ''
            );

            const completedSteps = [...(resumeData.completedSteps || [])];
            let updatedCompletedSteps = null;
            if (validCertifications.length > 0 && !completedSteps.includes(6)) {
                updatedCompletedSteps = [...completedSteps, 6];
            } else if (validCertifications.length === 0 && (completedSteps.includes(6) || completedSteps.includes(7))) {
                updatedCompletedSteps = completedSteps.filter((step) => step !== 6 && step !== 7);
            }

            updateResumeData({
                certifications,
                ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [certifications]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-expand the only card when there is exactly one certification
    useEffect(() => {
        if (certifications.length === 1) {
            setExpandedCards(new Set([certifications[0].id]));
        }
    }, [certifications.length]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="px-4 py-6 max-w-6xl mx-auto w-full min-h-full">
            {/* Section Header */}
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                        <MdWorkspacePremium className="w-5 h-5 text-indigo-600" />
                        {t('CertificationsStep.title', 'Certifications')}
                    </h1>
                    <p className="text-gray-600 text-sm">
                        {t(
                            'CertificationsStep.subtitle',
                            'Add only credentials you have earned, using the issuer and date shown on your record.'
                        )}
                    </p>
                </div>

            </div>

            {/* Certification Cards List */}
            <div className="space-y-4">
                {certifications.map((certification, index) => {
                    const isExpanded = expandedCards.has(certification.id);
                    const isComplete = Boolean(certification.title || certification.name);
                    const certTitle = certification.title || certification.name || '';

                    return (
                        <div
                            key={certification.id}
                            className={`relative bg-gradient-to-r from-white to-slate-50 border ${
                                isExpanded
                                    ? 'border-indigo-200 rounded-xl shadow-lg shadow-indigo-50'
                                    : 'border-gray-200 rounded-xl shadow-md hover:shadow-lg hover:border-indigo-300 hover:from-indigo-50 hover:to-slate-50'
                            }`}
                        >
                            {/* Accent line */}
                            <div
                                className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${
                                    isComplete
                                        ? 'bg-gradient-to-r from-indigo-400 to-purple-500'
                                        : 'bg-gradient-to-r from-gray-300 to-gray-400'
                                }`}
                            />

                            {/* Card header — click to expand/collapse */}
                            <div
                                className={`px-4 sm:px-6 py-4 ${
                                    isExpanded
                                        ? 'border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-t-xl'
                                        : 'rounded-xl'
                                } flex items-center cursor-pointer hover:bg-gradient-to-r hover:from-indigo-50 hover:to-slate-50 group`}
                                onClick={() => toggleCardExpansion(certification.id)}
                            >
                                {/* Left: badge + title */}
                                <div className="flex items-center flex-1 min-w-0">
                                    <div
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mr-4 flex-shrink-0 shadow-sm ${
                                            isComplete
                                                ? 'bg-gradient-to-br from-indigo-400 to-purple-500 text-white shadow-indigo-200'
                                                : 'bg-gradient-to-br from-indigo-400 to-purple-500 text-white shadow-indigo-200'
                                        }`}
                                    >
                                        {isComplete ? (
                                            <MdCheck className="w-5 h-5" />
                                        ) : (
                                            <span className="font-bold">{index + 1}</span>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <h3
                                            className={`font-semibold text-base mb-1 truncate ${
                                                certTitle ? 'text-gray-800' : 'text-gray-400'
                                            }`}
                                        >
                                            {certTitle ||
                                                t(
                                                    'CertificationsStep.defaultValues.untitledCertification',
                                                    'Untitled Certification'
                                                )}
                                        </h3>
                                        {certification.issuer && (
                                            <span className="block text-xs text-indigo-500 font-medium truncate">
                                                {certification.issuer}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Right: reorder, duplicate, expand, delete */}
                                <div className="flex items-center space-x-1 sm:space-x-2">
                                    <div className="w-2 h-2 rounded-full bg-indigo-500 opacity-60 mr-1" />

                                    {/* Move Up */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            moveCertification(certification.id, 'up');
                                        }}
                                        disabled={index === 0}
                                        aria-label="Move certification up"
                                        className={`p-1 ${
                                            index === 0
                                                ? 'text-slate-300 cursor-not-allowed'
                                                : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        ↑
                                    </button>

                                    {/* Move Down */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            moveCertification(certification.id, 'down');
                                        }}
                                        disabled={index === certifications.length - 1}
                                        aria-label="Move certification down"
                                        className={`p-1 ${
                                            index === certifications.length - 1
                                                ? 'text-slate-300 cursor-not-allowed'
                                                : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        ↓
                                    </button>

                                    {/* Duplicate */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            duplicateCertification(certification.id);
                                        }}
                                        aria-label={`Duplicate ${certTitle || 'certification'}`}
                                        className="p-1 text-slate-500 hover:text-indigo-600"
                                        title={t('CertificationsStep.actions.duplicate', 'Duplicate')}
                                    >
                                        ⧉
                                    </button>

                                    {/* Expand/Collapse */}
                                    <button
                                        type="button"
                                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-100 rounded-lg"
                                        title={
                                            isExpanded
                                                ? t('CertificationsStep.actions.collapse', 'Collapse')
                                                : t('CertificationsStep.actions.expand', 'Expand')
                                        }
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleCardExpansion(certification.id);
                                        }}
                                    >
                                        <MdKeyboardArrowDown
                                            className={`w-5 h-5 transition-transform duration-200 ${
                                                isExpanded ? 'rotate-180' : ''
                                            }`}
                                        />
                                    </button>

                                    {/* Delete */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeCertification(certification.id);
                                        }}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                        title={t('CertificationsStep.actions.remove', 'Remove certification')}
                                    >
                                        <MdDelete className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded form body */}
                            {isExpanded && (
                                <div className="p-4 sm:p-6 space-y-5 bg-gradient-to-br from-white to-slate-50 rounded-b-xl">
                                    {/* Certification name + issuing organization */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <InputField
                                            label={t('CertificationsStep.fields.title.label', 'Certification Name')}
                                            name={`certification-title-${certification.id}`}
                                            placeholder={t(
                                                'CertificationsStep.fields.title.placeholder',
                                                'e.g. AWS Solutions Architect'
                                            )}
                                            value={certification.title || certification.name || ''}
                                            onChange={(e) => updateCertification(certification.id, 'title', e.target.value)}
                                            required
                                        />
                                        <InputField
                                            label={t('CertificationsStep.fields.issuer.label', 'Issuing Organization')}
                                            name={`certification-issuer-${certification.id}`}
                                            placeholder={t(
                                                'CertificationsStep.fields.issuer.placeholder',
                                                'e.g. Amazon Web Services'
                                            )}
                                            value={certification.issuer || ''}
                                            onChange={(e) => updateCertification(certification.id, 'issuer', e.target.value)}
                                        />
                                    </div>

                                    {/* Date issued */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <InputField
                                            label={t('CertificationsStep.fields.date.label', 'Date Earned')}
                                            name={`certification-date-${certification.id}`}
                                            placeholder={t(
                                                'CertificationsStep.fields.date.placeholder',
                                                'e.g. 2024'
                                            )}
                                            value={certification.date || ''}
                                            onChange={(e) => updateCertification(certification.id, 'date', e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Add Certification button */}
                <button
                    type="button"
                    onClick={addCertification}
                    className="w-full p-6 border-2 border-dashed border-indigo-300 rounded-xl text-indigo-600 hover:border-indigo-500 hover:text-indigo-700 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 flex items-center justify-center font-semibold text-base shadow-sm hover:shadow-md transition-all"
                >
                    <MdAdd className="w-6 h-6 mr-3" />
                    {t('CertificationsStep.actions.addCertification', 'Add Certification')}
                </button>

            </div>
        </div>
    );
};

export default CertificationsStep;
