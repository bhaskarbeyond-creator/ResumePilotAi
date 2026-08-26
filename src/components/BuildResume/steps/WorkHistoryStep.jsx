import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdDelete, MdKeyboardArrowDown, MdAdd, MdCheck, MdLightbulb } from 'react-icons/md';
import WorkHistorySuggestionModal from './components/WorkHistorySuggestionModal';
import InputField from './components/InputField';
import AutocompleteInputField from './components/AutocompleteInputField';
import RichTextEditor from './components/RichTextEditor';
import MonthYearPicker from '../../Form/MonthYearPicker';
import BulletPointsEditor from '../../Form/BulletPointsEditor';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';

const WorkHistoryStep = ({ resumeData, updateResumeData }) => {
    const { t } = useTranslation('common');
    const [employments, setEmployments] = useState(resumeData.employments || []);

    useEffect(() => {
        if (resumeData.employments && Array.isArray(resumeData.employments)) {
            setEmployments(resumeData.employments);
        }
    }, [resumeData.employments]);
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [selectedEmploymentId, setSelectedEmploymentId] = useState(null);
    const [expandedCards, setExpandedCards] = useState(new Set());

    const createNewEmployment = () => ({
        id: Date.now(),
        jobTitle: '',
        employer: '',
        city: '',
        begin: '',
        end: '',
        description: '',
        current: false,
    });

    const addEmployment = () => {
        const newEmployment = createNewEmployment();
        setEmployments([...employments, newEmployment]);
        // Auto-expand only the newly added card
        setExpandedCards(new Set([newEmployment.id]));
    };

    const removeEmployment = (id) => {
        setEmployments(employments.filter((emp) => emp.id !== id));
        // Remove from expanded cards
        setExpandedCards((prev) => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
        });
    };

    const moveEmployment = (id, direction) => setEmployments(current => moveResumeItem(current, id, direction));

    const duplicateEmployment = id => setEmployments(current => {
        const source = current.find(item => item.id === id);
        return duplicateResumeItem(current, id, { jobTitle: `${source?.jobTitle || 'Position'} (Copy)` });
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

    const updateEmployment = (id, field, value) => {
        setEmployments((prevEmployments) =>
            prevEmployments.map((emp) => (emp.id === id ? { ...emp, [field]: value } : emp))
        );
    };

    const openAiModal = (employmentId) => {
        setSelectedEmploymentId(employmentId);
        setAiModalOpen(true);
    };

    const closeAiModal = () => {
        setAiModalOpen(false);
        setSelectedEmploymentId(null);
    };

    const applyAiSuggestion = (suggestion) => {
        if (selectedEmploymentId) {
            updateEmployment(selectedEmploymentId, 'description', suggestion);
        }
    };

    const selectedEmployment = selectedEmploymentId 
        ? employments.find((emp) => emp.id === selectedEmploymentId || String(emp.id) === String(selectedEmploymentId) || emp.date === selectedEmploymentId) 
        : null;

    const handleSave = () => {
        updateResumeData({ employments });

        // Mark step as completed if at least one employment is filled
        const hasValidEmployment = employments.some((emp) => emp.jobTitle.trim() !== '' && emp.employer.trim() !== '');

        const completedSteps = [...(resumeData.completedSteps || [])];
        if (hasValidEmployment && !completedSteps.includes(3)) {
            updateResumeData({ employments, completedSteps: [...completedSteps, 3] });
        } else if (!hasValidEmployment && completedSteps.includes(3)) {
            updateResumeData({ employments, completedSteps: completedSteps.filter(step => step !== 3) });
        }
    };

    // Auto-save on change
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);

        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employments]);

    // Auto-expand only the first card when there's only one employment
    useEffect(() => {
        if (employments.length === 1) {
            setExpandedCards(new Set([employments[0].id]));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employments.length]);

    return (
        <div className="px-4 py-6 max-w-6xl mx-auto w-full min-h-full">
            <div className="mb-4">
                <h1 className="text-lg font-bold text-gray-900 mb-1">{t('WorkHistoryStep.title')}</h1>
                <p className="text-gray-600 text-sm">{t('WorkHistoryStep.subtitle')}</p>
                <p className="text-sm text-blue-600 mt-1 font-medium">{t('WorkHistoryStep.requiredNote')}</p>
            </div>

            <div className="space-y-4">
                {employments.map((employment, index) => (
                    <div
                        key={employment.id}
                        className={`relative bg-gradient-to-r from-white to-slate-50 border ${
                            expandedCards.has(employment.id)
                                ? 'border-blue-200 rounded-xl shadow-lg shadow-blue-50'
                                : 'border-gray-200 rounded-xl shadow-md hover:shadow-lg hover:border-blue-300 hover:from-blue-50 hover:to-slate-50'
                        }`}>
                        {/* Accent Line */}
                        <div
                            className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${
                                employment.jobTitle && employment.employer ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-gray-300 to-gray-400'
                            }`}></div>

                        {/* Header */}
                        <div
                            className={`px-4 sm:px-6 py-4 ${
                                expandedCards.has(employment.id) ? 'border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl' : 'rounded-xl'
                            } flex items-center cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-50 group`}
                            onClick={() => toggleCardExpansion(employment.id)}>
                            {/* Left Section - Badge and Content */}
                            <div className="flex items-center flex-1 min-w-0">
                                {/* Position Number Badge */}
                                <div
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mr-4 flex-shrink-0 shadow-sm ${
                                        employment.jobTitle && employment.employer
                                            ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-green-200'
                                            : 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-blue-200'
                                    }`}>
                                    {employment.jobTitle && employment.employer ? <MdCheck className="w-5 h-5" /> : <span className="font-bold">{index + 1}</span>}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <h3 className={`font-semibold text-base mb-1 truncate ${employment.jobTitle ? 'text-gray-800' : 'text-gray-400'}`}>
                                        {employment.jobTitle || t('WorkHistoryStep.defaultValues.untitledPosition')}
                                    </h3>

                                    <div className="flex items-center text-sm space-x-2">
                                        <span className={`font-medium ${employment.employer ? 'text-gray-600' : 'text-gray-400'}`}>
                                            {employment.employer || t('WorkHistoryStep.defaultValues.noCompany')}
                                            {employment.city && <span className="text-slate-500 font-normal"> ({employment.city})</span>}
                                        </span>

                                        {(employment.begin || employment.end || employment.current) && (
                                            <>
                                                <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                                                <span className="text-gray-500 font-medium">
                                                    {employment.begin}
                                                    {employment.begin && (employment.end || employment.current) && ' - '}
                                                    {employment.current ? t('WorkHistoryStep.defaultValues.present') : employment.end}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Right Section - Actions */}
                            <div className="flex items-center space-x-2 sm:space-x-3 ml-2 sm:ml-4">
                                {/* Status Indicator */}
                                <div className={`w-3 h-3 rounded-full ${employment.jobTitle && employment.employer ? 'bg-green-400' : 'bg-gray-300'}`}></div>

                                <button type="button" onClick={(e) => { e.stopPropagation(); moveEmployment(employment.id, -1); }} disabled={index === 0} aria-label={`Move ${employment.jobTitle || 'employment'} up`} className="p-1 text-slate-500 disabled:opacity-30">↑</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveEmployment(employment.id, 1); }} disabled={index === employments.length - 1} aria-label={`Move ${employment.jobTitle || 'employment'} down`} className="p-1 text-slate-500 disabled:opacity-30">↓</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); duplicateEmployment(employment.id); }} aria-label={`Duplicate ${employment.jobTitle || 'employment'}`} className="p-1 text-slate-500">⧉</button>

                                {/* Expand/Collapse Button */}
                                <button
                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg"
                                    title={expandedCards.has(employment.id) ? t('WorkHistoryStep.actions.collapse') : t('WorkHistoryStep.actions.expand')}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleCardExpansion(employment.id);
                                    }}>
                                    <MdKeyboardArrowDown className={`w-5 h-5 ${expandedCards.has(employment.id) ? 'rotate-180' : ''}`} />
                                </button>

                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeEmployment(employment.id);
                                    }}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg sm:opacity-100"
                                    title={t('WorkHistoryStep.actions.remove')}>
                                    <MdDelete className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        {expandedCards.has(employment.id) && (
                            <div className="p-4 sm:p-6 space-y-5 bg-gradient-to-br from-white to-slate-50 rounded-b-xl">
                                {/* Job Title, Company & City/Location */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <AutocompleteInputField
                                        label={t('WorkHistoryStep.fields.jobTitle.label')}
                                        name={`jobTitle-${employment.id}`}
                                        placeholder={t('WorkHistoryStep.fields.jobTitle.placeholder')}
                                        value={employment.jobTitle}
                                        onChange={(e) => updateEmployment(employment.id, 'jobTitle', e.target.value)}
                                        required={true}
                                        suggestionType="jobTitle"
                                    />
                                    <AutocompleteInputField
                                        label={t('WorkHistoryStep.fields.company.label')}
                                        name={`employer-${employment.id}`}
                                        placeholder={t('WorkHistoryStep.fields.company.placeholder')}
                                        value={employment.employer}
                                        onChange={(e) => updateEmployment(employment.id, 'employer', e.target.value)}
                                        required={true}
                                        suggestionType="company"
                                    />
                                    <AutocompleteInputField
                                        label="City / Location"
                                        name={`city-${employment.id}`}
                                        placeholder="e.g. San Francisco, CA"
                                        value={employment.city || ''}
                                        onChange={(e) => updateEmployment(employment.id, 'city', e.target.value)}
                                        suggestionType="city"
                                    />
                                </div>

                                {/* Dates */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <MonthYearPicker
                                        label={t('WorkHistoryStep.fields.startDate.label')}
                                        value={employment.begin}
                                        onChange={(val) => updateEmployment(employment.id, 'begin', val)}
                                    />
                                    <MonthYearPicker
                                        label={t('WorkHistoryStep.fields.endDate.label')}
                                        value={employment.end}
                                        onChange={(val) => updateEmployment(employment.id, 'end', val)}
                                        disabled={employment.current}
                                        showPresentCheck
                                        isCurrent={employment.current}
                                        onCurrentChange={(isChecked) => {
                                            setEmployments((prev) =>
                                                prev.map((emp) =>
                                                    emp.id === employment.id
                                                        ? { ...emp, current: isChecked, end: isChecked ? 'Present' : '' }
                                                        : emp
                                                )
                                            );
                                        }}
                                    />
                                </div>

                                {/* Description */}
                                <div className="relative">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                                        <label className="block text-sm font-semibold text-slate-800 tracking-wide">{t('WorkHistoryStep.fields.description.label')}</label>
                                        {(() => {
                                            const hasJob = Boolean(employment.jobTitle || employment.job_title || employment.position);
                                            const hasCompany = Boolean(employment.employer || employment.company || employment.employerName);
                                            return (
                                                <button
                                                    onClick={() => openAiModal(employment.id || employment.date)}
                                                    disabled={!hasJob || !hasCompany}
                                                    className={`flex items-center justify-center text-sm font-semibold px-3 py-2 rounded-lg shadow-sm ${
                                                        hasJob && hasCompany
                                                            ? 'text-purple-700 bg-gradient-to-r from-purple-100 to-pink-100 hover:from-purple-200 hover:to-pink-200 cursor-pointer shadow-purple-100 hover:shadow-purple-200'
                                                            : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                                                    }`}
                                                    title={!hasJob || !hasCompany ? t('WorkHistoryStep.ai.tooltipDisabled') : t('WorkHistoryStep.ai.tooltip')}>
                                                    <MdLightbulb className="w-4 h-4 mr-2" />
                                                    <span className="truncate">{t('WorkHistoryStep.ai.suggestions')}</span>
                                                </button>
                                            );
                                        })()}
                                    </div>
                                    <div className="relative">
                                        <BulletPointsEditor
                                            value={employment.description}
                                            onChange={(value) => updateEmployment(employment.id, 'description', value)}
                                            placeholder={t('WorkHistoryStep.fields.description.placeholder')}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {/* Add New Employment Button */}
                <button
                    onClick={addEmployment}
                    className="w-full p-6 border-2 border-dashed border-blue-300 rounded-xl text-blue-600 hover:border-blue-500 hover:text-blue-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 flex items-center justify-center font-semibold text-base shadow-sm hover:shadow-md">
                    <MdAdd className="w-6 h-6 mr-3" />
                    {t('WorkHistoryStep.actions.addPosition')}
                </button>
            </div>

            <WorkHistorySuggestionModal isOpen={aiModalOpen} onClose={closeAiModal} selectedEmployment={selectedEmployment} onApplySuggestion={applyAiSuggestion} />
        </div>
    );
};

export default WorkHistoryStep;
