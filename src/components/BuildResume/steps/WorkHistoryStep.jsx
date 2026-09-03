import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    MdDelete, 
    MdKeyboardArrowDown, 
    MdAdd, 
    MdCheck, 
    MdLightbulb, 
    MdWork,
    MdContentCopy,
    MdArrowUpward,
    MdArrowDownward
} from 'react-icons/md';
import WorkHistorySuggestionModal from './components/WorkHistorySuggestionModal';
import AutocompleteInputField from './components/AutocompleteInputField';
import MonthYearPicker from '../../Form/MonthYearPicker';
import BulletPointsEditor from '../../Form/BulletPointsEditor';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import StepWorkspaceLayout from '../components/StepWorkspaceLayout';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';
import QuickAddCommandBar from '../components/QuickAddCommandBar';
import TrackGuidanceBanner from '../components/TrackGuidanceBanner';

const WorkHistoryStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [employments, setEmployments] = useState(resumeData.employments || []);
    const candidateContext = getCandidateContext(resumeData);
    const blueprints = candidateContext.starterBlueprints?.workHistory || [];

    useEffect(() => {
        if (resumeData.employments && Array.isArray(resumeData.employments)) {
            setEmployments(resumeData.employments);
        }
    }, [resumeData.employments]);

    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [selectedEmploymentId, setSelectedEmploymentId] = useState(null);
    const [expandedCards, setExpandedCards] = useState(new Set());

    const createNewEmployment = (overrides = {}) => ({
        id: Date.now(),
        jobTitle: overrides.jobTitle || '',
        employer: '',
        city: '',
        begin: '',
        end: '',
        description: '',
        current: false,
        employmentType: overrides.employmentType || 'full-time',
    });

    const addEmployment = (overrides = {}) => {
        const newEmployment = createNewEmployment(overrides);
        setEmployments(prev => [...prev, newEmployment]);
        setExpandedCards(new Set([newEmployment.id]));
    };

    const handleQuickAddAction = (actionId) => {
        switch (actionId) {
            case 'add-internship':
                addEmployment({ jobTitle: 'Intern / Trainee', employmentType: 'internship' });
                break;
            case 'add-freelance':
                addEmployment({ jobTitle: 'Independent Consultant', employmentType: 'freelance' });
                break;
            case 'add-contract':
                addEmployment({ employmentType: 'contract' });
                break;
            case 'add-standard':
            default:
                addEmployment();
                break;
        }
    };

    const removeEmployment = (id) => {
        setEmployments(employments.filter((emp) => emp.id !== id));
        setExpandedCards((prev) => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
        });
    };

    const moveEmployment = (id, direction) => setEmployments(current => moveResumeItem(current, id, direction));

    const duplicateEmployment = (id) => setEmployments(current => {
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

        const hasValidEmployment = employments.some((emp) => String(emp?.jobTitle || '').trim() !== '' && String(emp?.employer || '').trim() !== '');
        const completedSteps = [...(resumeData.completedSteps || [])];
        if (hasValidEmployment && !completedSteps.includes(2)) {
            updateResumeData({ employments, completedSteps: [...completedSteps, 2] });
        } else if (!hasValidEmployment && (completedSteps.includes(2) || completedSteps.includes(3))) {
            updateResumeData({ employments, completedSteps: completedSteps.filter(step => step !== 2 && step !== 3) });
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);
        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employments]);

    useEffect(() => {
        if (employments.length === 1 && expandedCards.size === 0) {
            setExpandedCards(new Set([employments[0].id]));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employments.length]);

    const hasValidEmployment = employments.some((emp) => String(emp?.jobTitle || '').trim() !== '' && String(emp?.employer || '').trim() !== '');

    return (
        <StepWorkspaceLayout
            stepNumber={2}
            stepPath="work-history"
            title={t('WorkHistoryStep.title', 'Professional Work History')}
            subtitle={t('WorkHistoryStep.subtitle', 'Document your career positions, responsibilities, and measurable business impact.')}
            isComplete={hasValidEmployment}
            statusBadge={`${employments.length} Role${employments.length === 1 ? '' : 's'}`}
            resumeData={resumeData}
            onNavigate={onNavigate}
        >
            <div className="space-y-3">
                {/* Command Bar: Contextual Quick-Add Actions (Always Available) */}
                <QuickAddCommandBar
                    stepPath="work-history"
                    onAction={handleQuickAddAction}
                />

                {employments.length === 0 ? (
                    /* Guided Career Setup Banner (Zero-Fabrication Architecture) */
                    <TrackGuidanceBanner
                        candidateContext={candidateContext}
                        stepName="Work Experience"
                        stepPath="work-history"
                        focusAreas={candidateContext.domainData?.skills?.slice(0, 6)}
                        examples={blueprints.slice(0, 2).map((b) => ({
                            title: b.jobTitle || 'Specialist Role',
                            description: b.description || 'Led key initiatives and optimized operational workflows.'
                        }))}
                        onStartBlank={() => addEmployment()}
                    />
                ) : (
                    /* High-Density Employment Studio with Milestone Bar */
                    <div className="space-y-2.5">
                        {/* Milestone & Quick Action Bar */}
                        <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="font-bold text-slate-800 truncate">
                                    {employments.length} Career Position{employments.length === 1 ? '' : 's'} Documented
                                </span>
                                <span className="text-[11px] text-slate-400 hidden sm:inline">• Chronological Order</span>
                            </div>
                            <button
                                type="button"
                                onClick={addEmployment}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer shrink-0"
                            >
                                <MdAdd className="w-3.5 h-3.5" />
                                <span>Add Position</span>
                            </button>
                        </div>

                        {employments.map((employment, index) => {
                            const isExpanded = expandedCards.has(employment.id);
                            const isFilled = Boolean(employment.jobTitle && employment.employer);

                            return (
                                <div
                                    key={employment.id}
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
                                        onClick={() => toggleCardExpansion(employment.id)}
                                    >
                                        {/* Left: Badge + Titles + Dates */}
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                                isFilled 
                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                            }`}>
                                                {index + 1}
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className={`text-xs sm:text-sm font-bold truncate ${employment.jobTitle ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                                                        {employment.jobTitle || 'Untitled Role'}
                                                    </h3>
                                                    {employment.employer && (
                                                        <>
                                                            <span className="text-slate-300 text-xs">•</span>
                                                            <span className="text-xs font-semibold text-slate-700 truncate">
                                                                {employment.employer}
                                                            </span>
                                                        </>
                                                    )}
                                                    {employment.current && (
                                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                            Current
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                                    {(employment.begin || employment.end || employment.current) && (
                                                        <span>
                                                            {employment.begin || 'Start'} – {employment.current ? 'Present' : (employment.end || 'End')}
                                                        </span>
                                                    )}
                                                    {employment.city && (
                                                        <>
                                                            <span>•</span>
                                                            <span>{employment.city}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Quick Action Controls */}
                                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                onClick={() => moveEmployment(employment.id, -1)}
                                                disabled={index === 0}
                                                aria-label="Move position up"
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                                title="Move up"
                                            >
                                                <MdArrowUpward className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveEmployment(employment.id, 1)}
                                                disabled={index === employments.length - 1}
                                                aria-label="Move position down"
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                                title="Move down"
                                            >
                                                <MdArrowDownward className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => duplicateEmployment(employment.id)}
                                                aria-label="Duplicate position"
                                                className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                                                title="Duplicate"
                                            >
                                                <MdContentCopy className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeEmployment(employment.id)}
                                                aria-label="Remove position"
                                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                                title="Delete"
                                            >
                                                <MdDelete className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleCardExpansion(employment.id)}
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer ml-1"
                                                title={isExpanded ? 'Collapse' : 'Expand'}
                                            >
                                                <MdKeyboardArrowDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Ergonomic Form Fields */}
                                    {isExpanded && (
                                        <div className="p-4 sm:p-5 space-y-4">
                                            {/* Row 1: Role, Company, City */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <AutocompleteInputField
                                                    label={t('WorkHistoryStep.fields.jobTitle.label')}
                                                    name={`jobTitle-${employment.id}`}
                                                    placeholder={getDynamicPlaceholder('work-history', 'jobTitle', candidateContext) || t('WorkHistoryStep.fields.jobTitle.placeholder')}
                                                    value={employment.jobTitle}
                                                    onChange={(e) => updateEmployment(employment.id, 'jobTitle', e.target.value)}
                                                    required={true}
                                                    suggestionType="jobTitle"
                                                    context={candidateContext}
                                                />
                                                <AutocompleteInputField
                                                    label={t('WorkHistoryStep.fields.company.label')}
                                                    name={`employer-${employment.id}`}
                                                    placeholder={getDynamicPlaceholder('work-history', 'employer', candidateContext) || t('WorkHistoryStep.fields.company.placeholder')}
                                                    value={employment.employer}
                                                    onChange={(e) => updateEmployment(employment.id, 'employer', e.target.value)}
                                                    required={true}
                                                    suggestionType="company"
                                                    context={candidateContext}
                                                />
                                                <AutocompleteInputField
                                                    label="City / Location"
                                                    name={`city-${employment.id}`}
                                                    placeholder={getDynamicPlaceholder('work-history', 'city', candidateContext) || "e.g. London, New York, Toronto, Bengaluru"}
                                                    value={employment.city || ''}
                                                    onChange={(e) => updateEmployment(employment.id, 'city', e.target.value)}
                                                    suggestionType="city"
                                                    context={candidateContext}
                                                />
                                            </div>

                                            {/* Row 2: Dates */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <MonthYearPicker
                                                    label={t('WorkHistoryStep.fields.startDate.label')}
                                                    value={employment.begin}
                                                    onChange={(date) => updateEmployment(employment.id, 'begin', date)}
                                                    required={true}
                                                />
                                                <div className="space-y-1.5">
                                                    <MonthYearPicker
                                                        label={t('WorkHistoryStep.fields.endDate.label')}
                                                        value={employment.end}
                                                        onChange={(date) => updateEmployment(employment.id, 'end', date)}
                                                        disabled={employment.current}
                                                        placeholder={employment.current ? 'Present' : 'Select Date'}
                                                    />
                                                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!employment.current}
                                                            onChange={(e) => {
                                                                const isChecked = e.target.checked;
                                                                setEmployments((prev) =>
                                                                    prev.map((emp) =>
                                                                        emp.id === employment.id
                                                                            ? { ...emp, current: isChecked, end: isChecked ? 'Present' : '' }
                                                                            : emp
                                                                    )
                                                                );
                                                            }}
                                                            className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                        <span>{t('WorkHistoryStep.fields.currentWork.label', 'I currently work here')}</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Row 3: Responsibilities & Impact Bullets */}
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                                            Accomplishments & Key Responsibilities
                                                        </label>
                                                        <p className="text-[11px] text-slate-400">
                                                            Turn daily tasks into quantifiable achievements for maximum recruiter impact.
                                                        </p>
                                                    </div>
                                                    {(() => {
                                                        const hasJob = Boolean(employment.jobTitle || employment.job_title || employment.position);
                                                        const hasCompany = Boolean(employment.employer || employment.company || employment.employerName);
                                                        const hasSourceNotes = String(employment.description || employment.userNotes || '').replace(/<[^>]*>/g, ' ').trim().length >= 12;
                                                        const canRewrite = hasJob && hasCompany && hasSourceNotes;
                                                        return (
                                                            <button
                                                                type="button"
                                                                onClick={() => openAiModal(employment.id || employment.date)}
                                                                disabled={!canRewrite}
                                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                                                    canRewrite
                                                                        ? 'text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 cursor-pointer shadow-2xs'
                                                                        : 'text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed opacity-70'
                                                                }`}
                                                                title={!hasJob || !hasCompany
                                                                    ? 'Enter job title and employer first.'
                                                                    : !hasSourceNotes
                                                                        ? 'Add at least 12 characters of work notes first.'
                                                                        : 'Enhance bullets with action verbs and metrics.'}
                                                            >
                                                                <MdLightbulb className="w-3.5 h-3.5 text-purple-600" />
                                                                <span>✨ Turn into Achievement (AI)</span>
                                                            </button>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Quick Action Verb Quick-Insert Toolbar */}
                                                <div className="flex items-center gap-1.5 flex-wrap text-[11px] pb-0.5">
                                                    <span className="font-extrabold text-slate-500 uppercase tracking-wider text-[10px]">Power Verbs:</span>
                                                    {(candidateContext.actionVerbs?.slice(0, 6) || ['Spearheaded', 'Optimized', 'Delivered', 'Streamlined', 'Directed', 'Implemented']).map((verb) => (
                                                        <button
                                                            key={verb}
                                                            type="button"
                                                            onClick={() => {
                                                                const current = employment.description || '';
                                                                const clean = current.trim();
                                                                const newBullet = `• ${verb} `;
                                                                const updated = clean ? `${clean}\n${newBullet}` : newBullet;
                                                                updateEmployment(employment.id, 'description', updated);
                                                            }}
                                                            className="px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 font-bold cursor-pointer transition-colors shadow-2xs"
                                                        >
                                                            + {verb}
                                                        </button>
                                                    ))}
                                                </div>

                                                <BulletPointsEditor
                                                    value={employment.description}
                                                    onChange={(value) => updateEmployment(employment.id, 'description', value)}
                                                    placeholder={getDynamicPlaceholder('work-history', 'description', candidateContext) || t('WorkHistoryStep.fields.description.placeholder', 'Describe your key responsibilities and achievements in detail...')}
                                                />

                                                {/* Live Bullet Strength & ATS Signals */}
                                                {(() => {
                                                    const rawNotes = String(employment.description || '').replace(/<[^>]*>/g, ' ').trim();
                                                    if (!rawNotes) return null;
                                                    const verbMatches = rawNotes.match(/\b(spearheaded|architected|engineered|led|orchestrated|delivered|optimized|scaled|designed|built|developed|reduced|increased|accelerated|automated|implemented|drove|championed|mentored|managed|achieved|treated|diagnosed|performed|administered|rehabilitated|advised|drafted|negotiated|litigated|settled|adjudicated|ruled|presided|instructed|taught|curated|evaluated|audited|reconciled|forecasted|modeled|closed|prospected|generated|authored|analyzed|investigated|piloted|navigated|commanded|briefed|prepared|fabricated|installed|calibrated|wired|welded|apprehended|patrolled|de-escalated)\b/gi) || [];
                                                    const metricMatches = rawNotes.match(/(\d+[%kKmMbB]?|[$€£¥₹]\s*\d+|\b\d{2,}\b)/g) || [];
                                                    return (
                                                        <div className="flex items-center gap-2 flex-wrap pt-1 text-[11px] font-bold">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${
                                                                verbMatches.length > 0 
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                                            }`}>
                                                                {verbMatches.length > 0 ? `✓ ${verbMatches.length} Action Verb${verbMatches.length > 1 ? 's' : ''}` : '⚠ Add Strong Action Verb'}
                                                            </span>
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${
                                                                metricMatches.length > 0 
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                                            }`}>
                                                                {metricMatches.length > 0 ? `✓ ${metricMatches.length} Quantified Result${metricMatches.length > 1 ? 's' : ''}` : '⚠ Add Measurable Result (%, $, €, #, metrics)'}
                                                            </span>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Add Role Button */}
                        <button
                            type="button"
                            onClick={addEmployment}
                            className="w-full h-11 border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-xl text-xs font-bold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                        >
                            <MdAdd className="w-4 h-4" />
                            <span>Add Another Position</span>
                        </button>
                    </div>
                )}
            </div>

            <WorkHistorySuggestionModal 
                isOpen={aiModalOpen} 
                onClose={closeAiModal} 
                selectedEmployment={selectedEmployment} 
                onApplySuggestion={applyAiSuggestion} 
            />
        </StepWorkspaceLayout>
    );
};

export default WorkHistoryStep;
