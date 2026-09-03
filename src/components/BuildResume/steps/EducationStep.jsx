import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    MdDelete, 
    MdKeyboardArrowDown, 
    MdAdd, 
    MdCheck, 
    MdLightbulb, 
    MdSchool,
    MdContentCopy,
    MdArrowUpward,
    MdArrowDownward 
} from 'react-icons/md';
import EducationSuggestionModal from './components/EducationSuggestionModal';
import InputField from './components/InputField';
import AutocompleteInputField from './components/AutocompleteInputField';
import RichTextEditor from './components/RichTextEditor';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import StepWorkspaceLayout from '../components/StepWorkspaceLayout';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';
import QuickAddCommandBar from '../components/QuickAddCommandBar';
import TrackGuidanceBanner from '../components/TrackGuidanceBanner';

const EducationStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [educations, setEducations] = useState(resumeData.educations || []);
    const candidateContext = getCandidateContext(resumeData);
    const blueprints = candidateContext.starterBlueprints?.education || [];

    useEffect(() => {
        if (resumeData.educations && Array.isArray(resumeData.educations)) {
            setEducations(resumeData.educations);
        }
    }, [resumeData.educations]);

    const [expandedCards, setExpandedCards] = useState(new Set());
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [selectedEducationId, setSelectedEducationId] = useState(null);

    const createNewEducation = (overrides = {}) => ({
        id: Date.now(),
        school: '',
        degree: overrides.degree || '',
        degreeType: overrides.degreeType || 'degree',
        started: '',
        finished: '',
        description: '',
        current: false,
    });

    const addEducation = (overrides = {}) => {
        const newEducation = createNewEducation(overrides);
        setEducations(prev => [...prev, newEducation]);
        setExpandedCards(new Set([newEducation.id]));
    };

    const handleQuickAddAction = (actionId) => {
        switch (actionId) {
            case 'add-diploma':
                addEducation({ degreeType: 'diploma' });
                break;
            case 'add-training':
                addEducation({ degreeType: 'training' });
                break;
            case 'add-continuing-ed':
                addEducation({ degreeType: 'continuing-ed' });
                break;
            case 'add-degree':
            default:
                addEducation();
                break;
        }
    };

    const removeEducation = (id) => {
        setEducations(educations.filter((edu) => edu.id !== id));
        setExpandedCards((prev) => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
        });
    };

    const moveEducation = (id, direction) => setEducations(current => moveResumeItem(current, id, direction));

    const duplicateEducation = (id) => setEducations(current => {
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

        const hasValidEducation = educations.some((edu) => String(edu?.school || '').trim() !== '' && String(edu?.degree || '').trim() !== '');
        const completedSteps = [...(resumeData.completedSteps || [])];
        if (hasValidEducation && !completedSteps.includes(3)) {
            updateResumeData({ educations, completedSteps: [...completedSteps, 3] });
        } else if (!hasValidEducation && (completedSteps.includes(3) || completedSteps.includes(4))) {
            updateResumeData({ educations, completedSteps: completedSteps.filter(step => step !== 3 && step !== 4) });
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);
        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [educations]);

    useEffect(() => {
        if (educations.length === 1 && expandedCards.size === 0) {
            setExpandedCards(new Set([educations[0].id]));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [educations.length]);

    const hasValidEducation = educations.some((edu) => String(edu?.school || '').trim() !== '' && String(edu?.degree || '').trim() !== '');

    return (
        <StepWorkspaceLayout
            stepNumber={3}
            stepPath="education"
            title={t('EducationStep.title', 'Education & Qualifications')}
            subtitle={t('EducationStep.subtitle', 'List your academic background, honors, coursework, and degree details.')}
            isComplete={hasValidEducation}
            statusBadge={`${educations.length} Degree${educations.length === 1 ? '' : 's'}`}
            resumeData={resumeData}
            onNavigate={onNavigate}
        >
            <div className="space-y-3">
                {/* Command Bar: Contextual Quick-Add Actions (Always Available) */}
                <QuickAddCommandBar
                    stepPath="education"
                    onAction={handleQuickAddAction}
                />

                {educations.length === 0 ? (
                    /* Guided Academic Setup Banner (Zero-Fabrication Architecture) */
                    <TrackGuidanceBanner
                        candidateContext={candidateContext}
                        stepName="Academic Credentials"
                        stepPath="education"
                        focusAreas={['Accredited Degrees & Diplomas', 'Major / Specialization', 'Honors & Academic Distinctions', 'Continuing Professional Education', 'Relevant Research & Coursework']}
                        examples={blueprints.slice(0, 2).map((b) => ({
                            title: b.degree || 'Degree / Diploma',
                            description: b.description || 'Comprehensive coursework and academic honors in this field.'
                        }))}
                        onStartBlank={() => addEducation()}
                    />
                ) : (
                    /* High-Density Education Studio with Milestone Bar */
                    <div className="space-y-2.5">
                        {/* Milestone Bar */}
                        <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="font-bold text-slate-800 truncate">
                                    {educations.length} Academic Qualification{educations.length === 1 ? '' : 's'} Documented
                                </span>
                                <span className="text-[11px] text-slate-400 hidden sm:inline">• Highest Degree First</span>
                            </div>
                            <button
                                type="button"
                                onClick={addEducation}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer shrink-0"
                            >
                                <MdAdd className="w-3.5 h-3.5" />
                                <span>Add Degree</span>
                            </button>
                        </div>

                        {educations.map((education, index) => {
                            const isExpanded = expandedCards.has(education.id);
                            const isFilled = Boolean(education.degree && education.school);

                            return (
                                <div
                                    key={education.id}
                                    className={`bg-white rounded-xl border transition-all duration-150 ${
                                        isExpanded 
                                            ? 'border-indigo-300 shadow-md ring-2 ring-indigo-500/10' 
                                            : 'border-slate-200/90 shadow-2xs hover:border-slate-300'
                                    }`}
                                >
                                    {/* Compact Card Header / Summary Row */}
                                    <div 
                                        className={`px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer ${
                                            isExpanded ? 'border-b border-slate-100 bg-slate-50/50 rounded-t-xl' : 'rounded-xl'
                                        }`}
                                        onClick={() => toggleCardExpansion(education.id)}
                                    >
                                        {/* Left: Badge + Titles + Dates */}
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                                isFilled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                                            }`}>
                                                {isFilled ? <MdCheck className="w-4 h-4" /> : index + 1}
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className={`text-xs sm:text-sm font-bold truncate ${education.degree ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                                                        {education.degree || 'Untitled Degree'}
                                                    </h3>
                                                    {education.school && (
                                                        <>
                                                            <span className="text-slate-300 text-xs">•</span>
                                                            <span className="text-xs font-medium text-slate-600 truncate">
                                                                {education.school}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                                    {(education.started || education.finished || education.current) && (
                                                        <span>
                                                            {education.started || 'Start'} – {education.current ? 'Present' : (education.finished || 'End')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Quick Action Controls */}
                                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                onClick={() => moveEducation(education.id, -1)}
                                                disabled={index === 0}
                                                aria-label="Move education up"
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                                title="Move up"
                                            >
                                                <MdArrowUpward className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveEducation(education.id, 1)}
                                                disabled={index === educations.length - 1}
                                                aria-label="Move education down"
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                                title="Move down"
                                            >
                                                <MdArrowDownward className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => duplicateEducation(education.id)}
                                                aria-label="Duplicate education"
                                                className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                                                title="Duplicate"
                                            >
                                                <MdContentCopy className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeEducation(education.id)}
                                                aria-label="Remove education"
                                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                                title="Delete"
                                            >
                                                <MdDelete className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleCardExpansion(education.id)}
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer ml-1"
                                                title={isExpanded ? 'Collapse' : 'Expand'}
                                            >
                                                <MdKeyboardArrowDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Form Fields */}
                                    {isExpanded && (
                                        <div className="p-4 sm:p-5 space-y-4">
                                            {/* Row 1: School & Degree */}
                                            <div className="space-y-2.5">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div className="space-y-1.5">
                                                        <AutocompleteInputField
                                                            label={t('EducationStep.fields.school.label', 'Institution / University')}
                                                            name={`school-${education.id}`}
                                                            placeholder={candidateContext.domainData?.schools?.[0] ? `e.g. ${candidateContext.domainData.schools[0]}` : 'e.g. State University, City College'}
                                                            value={education.school}
                                                            onChange={(e) => updateEducation(education.id, 'school', e.target.value)}
                                                            required={true}
                                                            suggestionType="school"
                                                            context={candidateContext}
                                                        />
                                                        {/* Quick Institution Pills */}
                                                        <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                                            <span className="text-[10px] font-bold text-slate-400">Popular:</span>
                                                            {(candidateContext.domainData?.schools?.length > 0 
                                                                ? candidateContext.domainData.schools.slice(0, 5) 
                                                                : ['State University', 'City College', 'National University', 'Technical Institute']
                                                            ).map((s) => (
                                                                <button
                                                                    key={s}
                                                                    type="button"
                                                                    onClick={() => updateEducation(education.id, 'school', s)}
                                                                    className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 rounded border border-slate-200/80 transition-colors cursor-pointer"
                                                                >
                                                                    {s}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <AutocompleteInputField
                                                            label={t('EducationStep.fields.degree.label', 'Degree / Major')}
                                                            name={`degree-${education.id}`}
                                                            placeholder={candidateContext.domainData?.degrees?.[0] ? `e.g. ${candidateContext.domainData.degrees[0]}` : 'e.g. Bachelor of Science, Master of Arts'}
                                                            value={education.degree}
                                                            onChange={(e) => updateEducation(education.id, 'degree', e.target.value)}
                                                            required={true}
                                                            suggestionType="degree"
                                                            context={candidateContext}
                                                        />
                                                        {/* Quick Degree Pills */}
                                                        <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                                            <span className="text-[10px] font-bold text-slate-400">Degrees:</span>
                                                            {(candidateContext.domainData?.degrees?.length > 0 
                                                                ? candidateContext.domainData.degrees.slice(0, 6) 
                                                                : ['B.A.', 'B.S.', 'M.A.', 'M.S.', 'MBA', 'Diploma']
                                                            ).map((d) => (
                                                                <button
                                                                    key={d}
                                                                    type="button"
                                                                    onClick={() => updateEducation(education.id, 'degree', d)}
                                                                    className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 rounded border border-slate-200/80 transition-colors cursor-pointer"
                                                                >
                                                                    {d}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Row 2: Dates */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <InputField
                                                    label={t('EducationStep.fields.startDate.label', 'Start Year')}
                                                    name={`started-${education.id}`}
                                                    placeholder="e.g. 2019 or Aug 2019"
                                                    value={education.started}
                                                    onChange={(e) => updateEducation(education.id, 'started', e.target.value)}
                                                />
                                                <div className="space-y-1.5">
                                                    <InputField
                                                        label={t('EducationStep.fields.endDate.label', 'Graduation Year')}
                                                        name={`finished-${education.id}`}
                                                        placeholder={education.current ? 'Present' : 'e.g. 2023 or May 2023'}
                                                        value={education.finished}
                                                        onChange={(e) => updateEducation(education.id, 'finished', e.target.value)}
                                                        disabled={education.current}
                                                    />
                                                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!education.current}
                                                            onChange={(e) => {
                                                                const isChecked = e.target.checked;
                                                                setEducations((prev) =>
                                                                    prev.map((edu) =>
                                                                        edu.id === education.id
                                                                            ? { ...edu, current: isChecked, finished: isChecked ? 'Present' : '' }
                                                                            : edu
                                                                    )
                                                                );
                                                            }}
                                                            className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                        <span>{t('EducationStep.fields.currentStudy.label', 'Currently studying here')}</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Row 3: Honors / Coursework */}
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                                        Coursework, CGPA & Honors
                                                    </label>
                                                    {(() => {
                                                        const hasSchool = Boolean(education.school || education.institution);
                                                        const hasDegree = Boolean(education.degree || education.qualification);
                                                        const hasSourceNotes = String(education.description || education.userNotes || education.coursework || '').replace(/<[^>]*>/g, ' ').trim().length >= 12;
                                                        const canRewrite = hasSchool && hasDegree && hasSourceNotes;
                                                        return (
                                                            <button
                                                                type="button"
                                                                onClick={() => openAiModal(education.id || education.date)}
                                                                disabled={!canRewrite}
                                                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                                                    canRewrite
                                                                        ? 'text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 cursor-pointer shadow-2xs'
                                                                        : 'text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed opacity-70'
                                                                }`}
                                                                title={!hasSchool || !hasDegree
                                                                    ? 'Enter school and degree first.'
                                                                    : !hasSourceNotes
                                                                        ? 'Add at least 12 characters of notes first.'
                                                                        : 'Enhance academic summary.'}
                                                            >
                                                                <MdLightbulb className="w-3.5 h-3.5 text-purple-600" />
                                                                <span>AI Note Polish</span>
                                                            </button>
                                                        );
                                                    })()}
                                                </div>

                                                <RichTextEditor
                                                    value={education.description}
                                                    onChange={(value) => updateEducation(education.id, 'description', value)}
                                                    rows={3}
                                                    placeholder={t('EducationStep.fields.description.placeholder', 'Relevant coursework, CGPA (e.g. 8.8/10), academic achievements, or leadership roles...')}
                                                />

                                                {/* Quick Grade & CGPA Presets */}
                                                <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
                                                    <span className="text-slate-400 font-medium">Quick Grade Presets:</span>
                                                    {['CGPA: 8.5 / 10', 'CGPA: 9.0 / 10', 'First Class with Distinction (82%)', 'First Class (76%)'].map((grade) => (
                                                        <button
                                                            key={grade}
                                                            type="button"
                                                            onClick={() => {
                                                                const current = education.description ? `${education.description} • ${grade}` : grade;
                                                                updateEducation(education.id, 'description', current);
                                                            }}
                                                            className="px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 font-semibold border border-slate-200 transition-colors cursor-pointer text-[10px]"
                                                        >
                                                            + {grade}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Add Education Button */}
                        <button
                            type="button"
                            onClick={addEducation}
                            className="w-full h-11 border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-xl text-xs font-bold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                        >
                            <MdAdd className="w-4 h-4" />
                            <span>Add Another Qualification</span>
                        </button>
                    </div>
                )}
            </div>

            <EducationSuggestionModal 
                isOpen={aiModalOpen} 
                onClose={closeAiModal} 
                selectedEducation={selectedEducation} 
                onApplySuggestion={applyAiSuggestion} 
            />
        </StepWorkspaceLayout>
    );
};

export default EducationStep;
