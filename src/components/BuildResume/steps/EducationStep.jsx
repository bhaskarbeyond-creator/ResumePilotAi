import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdDelete, MdKeyboardArrowDown, MdAdd, MdCheck, MdLightbulb } from 'react-icons/md';
import EducationSuggestionModal from './components/EducationSuggestionModal';
import InputField from './components/InputField';
import AutocompleteInputField from './components/AutocompleteInputField';
import RichTextEditor from './components/RichTextEditor';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';

const EducationStep = ({ resumeData, updateResumeData }) => {
    const { t } = useTranslation('common');
    const [educations, setEducations] = useState(resumeData.educations || []);

    useEffect(() => {
        if (resumeData.educations && Array.isArray(resumeData.educations)) {
            setEducations(resumeData.educations);
        }
    }, [resumeData.educations]);
    const [expandedCards, setExpandedCards] = useState(new Set());
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [selectedEducationId, setSelectedEducationId] = useState(null);

    const createNewEducation = () => ({
        id: Date.now(),
        school: '',
        degree: '',
        started: '',
        finished: '',
        description: '',
        current: false,
    });

    const addEducation = () => {
        const newEducation = createNewEducation();
        setEducations([...educations, newEducation]);
        // Auto-expand only the newly added card
        setExpandedCards(new Set([newEducation.id]));
    };

    const removeEducation = (id) => {
        setEducations(educations.filter((edu) => edu.id !== id));
        // Remove from expanded cards
        setExpandedCards((prev) => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
        });
    };

    const moveEducation = (id, direction) => setEducations(current => moveResumeItem(current, id, direction));

    const duplicateEducation = id => setEducations(current => {
        const source = current.find(item => item.id === id);
        return duplicateResumeItem(current, id, { degree: `${source?.degree || 'Degree'} (Copy)` });
    });

    const toggleCardExpansion = (id) => {
        setExpandedCards((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const updateEducation = (id, field, value) => {
        setEducations((prevEducations) =>
            prevEducations.map((edu) => (edu.id === id ? { ...edu, [field]: value } : edu))
        );
    };

    const openAiModal = (educationId) => {
        setSelectedEducationId(educationId);
        setAiModalOpen(true);
    };

    const closeAiModal = () => {
        setAiModalOpen(false);
        setSelectedEducationId(null);
    };

    const applyAiSuggestion = (suggestion) => {
        if (selectedEducationId) {
            updateEducation(selectedEducationId, 'description', suggestion);
        }
    };

    const selectedEducation = selectedEducationId 
        ? educations.find((edu) => edu.id === selectedEducationId || String(edu.id) === String(selectedEducationId) || edu.date === selectedEducationId) 
        : null;

    const handleSave = () => {
        updateResumeData({ educations });

        // Mark step as completed if at least one education is filled
        const hasValidEducation = educations.some((edu) => edu.school.trim() !== '' && edu.degree.trim() !== '');

        const completedSteps = [...(resumeData.completedSteps || [])];
        if (hasValidEducation && !completedSteps.includes(3)) {
            updateResumeData({ educations, completedSteps: [...completedSteps, 3] });
        } else if (!hasValidEducation && (completedSteps.includes(3) || completedSteps.includes(4))) {
            updateResumeData({ educations, completedSteps: completedSteps.filter(step => step !== 3 && step !== 4) });
        }
    };

    // Auto-save on change
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);

        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [educations]);

    // Auto-expand only the first card when there's only one education
    useEffect(() => {
        if (educations.length === 1) {
            setExpandedCards(new Set([educations[0].id]));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [educations.length]);

    return (
        <div className="px-4 py-6 max-w-6xl mx-auto w-full min-h-full">
            <div className="mb-4">
                <h1 className="text-lg font-bold text-gray-900 mb-1">{t('EducationStep.title')}</h1>
                <p className="text-gray-600 text-sm">{t('EducationStep.subtitle')}</p>
                <p className="text-sm text-blue-600 mt-1 font-medium">{t('EducationStep.requiredNote')}</p>
            </div>

            <div className="space-y-4">
                {educations.map((education, index) => (
                    <div
                        key={education.id}
                        className={`relative bg-gradient-to-r from-white to-slate-50 border ${
                            expandedCards.has(education.id)
                                ? 'border-blue-200 rounded-xl shadow-lg shadow-blue-50'
                                : 'border-gray-200 rounded-xl shadow-md hover:shadow-lg hover:border-blue-300 hover:from-blue-50 hover:to-slate-50'
                        }`}>
                        {/* Accent Line */}
                        <div
                            className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${
                                education.degree && education.school ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-gray-300 to-gray-400'
                            }`}></div>

                        {/* Header */}
                        <div
                            className={`px-4 sm:px-6 py-4 ${
                                expandedCards.has(education.id) ? 'border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl' : 'rounded-xl'
                            } flex items-center cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-50 group`}
                            onClick={() => toggleCardExpansion(education.id)}>
                            {/* Left Section - Badge and Content */}
                            <div className="flex items-center flex-1 min-w-0">
                                {/* Position Number Badge */}
                                <div
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mr-4 flex-shrink-0 shadow-sm ${
                                        education.degree && education.school
                                            ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-green-200'
                                            : 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-blue-200'
                                    }`}>
                                    {education.degree && education.school ? <MdCheck className="w-5 h-5" /> : <span className="font-bold">{index + 1}</span>}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <h3 className={`font-semibold text-base mb-1 truncate ${education.degree ? 'text-gray-800' : 'text-gray-400'}`}>
                                        {education.degree || t('EducationStep.defaultValues.untitledDegree')}
                                    </h3>

                                    <div className="flex items-center text-sm space-x-2">
                                        <span className={`font-medium ${education.school ? 'text-gray-600' : 'text-gray-400'}`}>{education.school || t('EducationStep.defaultValues.noSchool')}</span>

                                        {(education.begin || education.end || education.current) && (
                                            <>
                                                <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                                                <span className="text-gray-500 font-medium">
                                                    {education.begin}
                                                    {education.begin && (education.end || education.current) && ' - '}
                                                    {education.current ? t('EducationStep.defaultValues.present') : education.end}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Right Section - Actions */}
                            <div className="flex items-center space-x-2 sm:space-x-3 ml-2 sm:ml-4">
                                {/* Status Indicator */}
                                <div className={`w-3 h-3 rounded-full ${education.degree && education.school ? 'bg-green-400' : 'bg-gray-300'}`}></div>

                                <button type="button" onClick={(e) => { e.stopPropagation(); moveEducation(education.id, -1); }} disabled={index === 0} aria-label={`Move ${education.degree || 'education'} up`} className="p-1 text-slate-500 disabled:opacity-30">↑</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveEducation(education.id, 1); }} disabled={index === educations.length - 1} aria-label={`Move ${education.degree || 'education'} down`} className="p-1 text-slate-500 disabled:opacity-30">↓</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); duplicateEducation(education.id); }} aria-label={`Duplicate ${education.degree || 'education'}`} className="p-1 text-slate-500">⧉</button>

                                {/* Expand/Collapse Button */}
                                <button
                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg"
                                    title={expandedCards.has(education.id) ? t('EducationStep.actions.collapse') : t('EducationStep.actions.expand')}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleCardExpansion(education.id);
                                    }}>
                                    <MdKeyboardArrowDown className={`w-5 h-5 ${expandedCards.has(education.id) ? 'rotate-180' : ''}`} />
                                </button>

                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeEducation(education.id);
                                    }}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg sm:opacity-100"
                                    title={t('EducationStep.actions.remove')}>
                                    <MdDelete className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        {expandedCards.has(education.id) && (
                            <div className="p-4 sm:p-6 space-y-5 bg-gradient-to-br from-white to-slate-50 rounded-b-xl">
                                {/* School & Degree */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <AutocompleteInputField
                                        label={t('EducationStep.fields.school.label')}
                                        name={`school-${education.id}`}
                                        placeholder={t('EducationStep.fields.school.placeholder')}
                                        value={education.school}
                                        onChange={(e) => updateEducation(education.id, 'school', e.target.value)}
                                        required={true}
                                        suggestionType="school"
                                    />
                                    <AutocompleteInputField
                                        label={t('EducationStep.fields.degree.label')}
                                        name={`degree-${education.id}`}
                                        placeholder={t('EducationStep.fields.degree.placeholder')}
                                        value={education.degree}
                                        onChange={(e) => updateEducation(education.id, 'degree', e.target.value)}
                                        required={true}
                                        suggestionType="degree"
                                    />
                                </div>

                                {/* Dates */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <InputField
                                        label={t('EducationStep.fields.startDate.label')}
                                        name={`started-${education.id}`}
                                        placeholder={t('EducationStep.fields.startDate.placeholder')}
                                        value={education.started}
                                        onChange={(e) => updateEducation(education.id, 'started', e.target.value)}
                                    />
                                    <div>
                                        <InputField
                                            label={t('EducationStep.fields.endDate.label')}
                                            name={`finished-${education.id}`}
                                            placeholder={t('EducationStep.fields.endDate.placeholder')}
                                            value={education.finished}
                                            onChange={(e) => updateEducation(education.id, 'finished', e.target.value)}
                                            disabled={education.current}
                                        />
                                        <label className="flex items-center mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100 hover:bg-blue-100 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={!!education.current}
                                                onChange={(e) => {
                                                    const isChecked = e.target.checked;
                                                    setEducations((prev) =>
                                                        prev.map((edu) =>
                                                            edu.id === education.id
                                                                ? { ...edu, current: isChecked, finished: isChecked ? '' : edu.finished }
                                                                : edu
                                                        )
                                                    );
                                                }}
                                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-blue-300 rounded"
                                            />
                                            <span className="ml-3 text-sm text-blue-700 font-medium">{t('EducationStep.fields.currentStudy.label')}</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="relative">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                                        <label className="block text-sm font-semibold text-slate-800 tracking-wide">{t('EducationStep.fields.description.label')}</label>
                                        {(() => {
                                            const hasSchool = Boolean(education.school || education.institution);
                                            const hasDegree = Boolean(education.degree || education.qualification);
                                            const hasSourceNotes = String(education.description || education.userNotes || education.coursework || '').replace(/<[^>]*>/g, ' ').trim().length >= 12;
                                            const canRewrite = hasSchool && hasDegree && hasSourceNotes;
                                            return (
                                                <button
                                                    onClick={() => openAiModal(education.id || education.date)}
                                                    disabled={!canRewrite}
                                                    className={`flex items-center justify-center text-sm font-semibold px-3 py-2 rounded-lg shadow-sm ${
                                                        canRewrite
                                                            ? 'text-purple-700 bg-gradient-to-r from-purple-100 to-pink-100 hover:from-purple-200 hover:to-pink-200 cursor-pointer shadow-purple-100 hover:shadow-purple-200'
                                                            : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                                                    }`}
                                                    title={!hasSchool || !hasDegree
                                                        ? 'Enter the school and degree first.'
                                                        : !hasSourceNotes
                                                            ? 'Add at least 12 characters of verified education notes first.'
                                                            : 'Rewrite only the facts in your notes.'}>
                                                    <MdLightbulb className="w-4 h-4 mr-2" />
                                                    <span className="truncate">Rewrite My Notes</span>
                                                </button>
                                            );
                                        })()}
                                    </div>
                                    <div className="relative">
                                        <RichTextEditor
                                            value={education.description}
                                            onChange={(value) => updateEducation(education.id, 'description', value)}
                                            rows={4}
                                            placeholder={t('EducationStep.fields.description.placeholder')}
                                            className={education.description && education.description.trim() !== '' ? 'border-green-300 bg-green-50' : ''}
                                        />
                                        <p className="mt-2 text-xs text-slate-500">Enter verified coursework, projects, activities, or honors first. AI can rephrase these notes but cannot invent academic achievements.</p>
                                        {education.description && education.description.trim() !== '' && (
                                            <div className="absolute top-3 right-3 flex items-center pointer-events-none">
                                                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {/* Add New Education Button */}
                <button
                    onClick={addEducation}
                    className="w-full p-6 border-2 border-dashed border-blue-300 rounded-xl text-blue-600 hover:border-blue-500 hover:text-blue-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 flex items-center justify-center font-semibold text-base shadow-sm hover:shadow-md">
                    <MdAdd className="w-6 h-6 mr-3" />
                    {t('EducationStep.actions.addEducation')}
                </button>
            </div>

            <EducationSuggestionModal isOpen={aiModalOpen} onClose={closeAiModal} selectedEducation={selectedEducation} onApplySuggestion={applyAiSuggestion} />
        </div>
    );
};

export default EducationStep;
