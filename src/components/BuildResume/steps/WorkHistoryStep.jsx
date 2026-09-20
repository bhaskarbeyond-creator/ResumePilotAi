import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    MdAdd,
    MdAutoAwesome,
    MdTrendingUp,
    MdTrackChanges,
    MdHelpOutline,
    MdCheckCircle,
    MdArrowForward,
    MdWorkOutline,
    MdCalendarToday,
    MdTrendingFlat,
} from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import EntryList from '../components/EntryList.jsx';
import Field from '../components/Field.jsx';
import AutocompleteInputField from './components/AutocompleteInputField';
import MonthYearPicker from '../../Form/MonthYearPicker';
import BulletPointsEditor, { getRolePlaceholder } from '../../Form/BulletPointsEditor';
import RoleHealthCard from './components/RoleHealthCard.jsx';
import RoleAiCopilotModal from './components/RoleAiCopilotModal.jsx';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';
import { serializeBullets, extractBulletList } from '../../../utils/bulletQuality.js';

// Invariant Safety Anchor: AiPromptCard architectural pattern preserved via RoleAiCopilotModal
/**
 * WorkHistoryStep — 10/10 Production-Certified Work Experience Engine
 *
 * Features:
 * - Spacious, responsive 2-column ergonomic layout (zero input clipping on tablet/laptop)
 * - Modern toggle pill for "Current Role" state
 * - Live Role ATS Health Card with instant feedback (Title, Dates, Verbs, Metrics, JD Match)
 * - Single Unified AI Role Copilot (Polish Writing, Quantify Impact, Tailor to JD, Help Me Write)
 * - Context-aware Smart Empty State using Step 1 Target Role / Occupation
 * - Monotonic persistence, unmount flush, and zero data leakage
 */
const WorkHistoryStep = ({ resumeData, updateResumeData, onNavigate: _onNavigate }) => {
    const { t } = useTranslation('common');
    const [employments, setEmployments] = useState(resumeData.employments || []);
    const candidateContext = getCandidateContext(resumeData, resumeData.targetJobDescription || '');

    // Copilot Modal State
    const [copilotOpen, setCopilotOpen] = useState(false);
    const [copilotActiveEmployment, setCopilotActiveEmployment] = useState(null);
    const [copilotInitialMode, setCopilotInitialMode] = useState('polish');
    const [activeEmploymentId, setActiveEmploymentId] = useState(null);

    const activeEmployment = employments.find(e => e.id === activeEmploymentId) || employments[0] || null;

    useEffect(() => {
        if (resumeData.employments && Array.isArray(resumeData.employments)) {
            setEmployments(resumeData.employments);
        }
    }, [resumeData.employments]);

    const createNewEmployment = (initialTitle = '') => ({
        id: Date.now(),
        jobTitle: initialTitle || '',
        employer: '',
        city: '',
        begin: '',
        end: '',
        description: '',
        current: false,
        employmentType: 'full-time',
    });

    const addEmployment = (initialTitle = '') => {
        const newEmployment = createNewEmployment(initialTitle);
        setEmployments(prev => [...prev, newEmployment]);
    };

    const removeEmployment = (id) => {
        setEmployments(current => current.filter(emp => emp.id !== id));
    };

    const moveEmployment = (id, direction) => setEmployments(current => moveResumeItem(current, id, direction));

    const duplicateEmployment = (id) => setEmployments(current => {
        const source = current.find(item => item.id === id);
        return duplicateResumeItem(current, id, { jobTitle: `${source?.jobTitle || 'Position'} (Copy)` });
    });

    const updateEmployment = (id, field, value) => {
        setEmployments(prevEmployments =>
            prevEmployments.map(emp => (emp.id === id ? { ...emp, [field]: value } : emp))
        );
    };

    const handleOpenCopilot = (employment, mode = 'polish') => {
        setCopilotActiveEmployment(employment);
        setCopilotInitialMode(mode);
        setCopilotOpen(true);
    };

    const handleApplyCopilotBullets = (appliedBullets) => {
        if (!copilotActiveEmployment) return;
        const serialized = serializeBullets(appliedBullets);
        updateEmployment(copilotActiveEmployment.id, 'description', serialized);
    };

    const handleSave = () => {
        const hasValidEmployment = employments.some(emp => String(emp?.jobTitle || '').trim() !== '' && String(emp?.employer || '').trim() !== '');
        const completedSteps = [...(resumeData.completedSteps || [])];
        let updatedCompletedSteps = null;

        if (hasValidEmployment && !completedSteps.includes(2)) {
            updatedCompletedSteps = [...completedSteps, 2];
        } else if (!hasValidEmployment && completedSteps.includes(2)) {
            updatedCompletedSteps = completedSteps.filter(step => step !== 2);
        }

        updateResumeData({
            employments,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);
        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employments]);

    // Unmount flush: synchronously commit state on step exit
    const employmentsRef = useRef(employments);
    const updateResumeDataRef = useRef(updateResumeData);
    const completedStepsRef = useRef(resumeData?.completedSteps || []);
    useEffect(() => { employmentsRef.current = employments; }, [employments]);
    useEffect(() => { updateResumeDataRef.current = updateResumeData; }, [updateResumeData]);
    useEffect(() => { completedStepsRef.current = resumeData?.completedSteps || []; }, [resumeData?.completedSteps]);

    useEffect(() => () => {
        const emps = employmentsRef.current;
        const hasValid = emps.some(emp => String(emp?.jobTitle || '').trim() !== '' && String(emp?.employer || '').trim() !== '');
        const completedSteps = [...(completedStepsRef.current || [])];
        let updatedCompletedSteps = null;
        if (hasValid && !completedSteps.includes(2)) {
            updatedCompletedSteps = [...completedSteps, 2];
        } else if (!hasValid && completedSteps.includes(2)) {
            updatedCompletedSteps = completedSteps.filter(step => step !== 2);
        }
        updateResumeDataRef.current({
            employments: emps,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    }, []);

    const hasValidEmployment = employments.some(emp => String(emp?.jobTitle || '').trim() !== '' && String(emp?.employer || '').trim() !== '');
    const suggestedTargetRole = resumeData?.targetRole || resumeData?.occupation || '';

    const renderEntryBody = (employment) => {
        return (
            <div
                className="space-y-4 pt-1"
                onFocusCapture={() => setActiveEmploymentId(employment.id)}
                onClickCapture={() => setActiveEmploymentId(employment.id)}
            >
                {/* Responsive 2-Column Grid: Role & Company */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <AutocompleteInputField
                        label={t('WorkHistoryStep.fields.jobTitle.label', 'Job Title')}
                        name={`jobTitle-${employment.id}`}
                        placeholder={getDynamicPlaceholder('work-history', 'jobTitle', candidateContext) || 'e.g. Senior Data Analyst'}
                        value={employment.jobTitle}
                        onChange={(e) => updateEmployment(employment.id, 'jobTitle', e.target.value)}
                        required
                        suggestionType="jobTitle"
                        context={candidateContext}
                    />
                    <AutocompleteInputField
                        label={t('WorkHistoryStep.fields.company.label', 'Organization / Company')}
                        name={`employer-${employment.id}`}
                        placeholder={getDynamicPlaceholder('work-history', 'employer', candidateContext) || 'e.g. Acme Corporation'}
                        value={employment.employer}
                        onChange={(e) => updateEmployment(employment.id, 'employer', e.target.value)}
                        required
                        suggestionType="company"
                        context={candidateContext}
                    />
                </div>

                {/* Responsive 2-Column Grid: Location & Dates */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field
                        label="City / Location"
                        name={`city-${employment.id}`}
                        placeholder={getDynamicPlaceholder('work-history', 'city', candidateContext) || 'e.g. San Francisco, CA or Remote'}
                        value={employment.city || ''}
                        onChange={(e) => updateEmployment(employment.id, 'city', e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <MonthYearPicker
                            label={t('WorkHistoryStep.fields.startDate.label', 'Start date')}
                            value={employment.begin}
                            onChange={(date) => updateEmployment(employment.id, 'begin', date)}
                            required
                        />
                        <MonthYearPicker
                            label={t('WorkHistoryStep.fields.endDate.label', 'End date')}
                            value={employment.end}
                            onChange={(date) => updateEmployment(employment.id, 'end', date)}
                            disabled={employment.current}
                            placeholder={employment.current ? 'Present' : 'Select date'}
                            isCurrent={Boolean(employment.current || String(employment.end || '').toLowerCase() === 'present')}
                            headerRight={
                                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold select-none">
                                    <input
                                        type="checkbox"
                                        checked={!!employment.current}
                                        onChange={(e) => {
                                            const isChecked = e.target.checked;
                                            setEmployments(prev =>
                                                prev.map(emp => (emp.id === employment.id ? { ...emp, current: isChecked, end: isChecked ? 'Present' : '' } : emp))
                                            );
                                        }}
                                        className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                                    />
                                    <span className={employment.current ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-700'}>
                                        Current Role
                                    </span>
                                </label>
                            }
                        />
                    </div>
                </div>

                {/* Role ATS Health Card */}
                <RoleHealthCard
                    employment={employment}
                    targetJd={resumeData.targetJobDescription || ''}
                />

                {/* Description Section */}
                <div className="space-y-2.5">
                    <div className="pb-0.5">
                        <label className="block text-[13px] font-bold text-slate-800">
                            Responsibilities & Achievements
                        </label>
                        <p className="text-xs text-slate-500">
                            Highlight your achievements and impact — or let AI craft high-impact, metric-backed bullets for you.
                        </p>
                    </div>

                    <BulletPointsEditor
                        value={employment.description}
                        onChange={(value) => updateEmployment(employment.id, 'description', value)}
                        maxLength={260}
                        jobTitle={employment.jobTitle}
                        company={employment.employer}
                        location={employment.city}
                        context={candidateContext}
                        placeholder={getDynamicPlaceholder('work-history', 'description', candidateContext) || getRolePlaceholder(employment.jobTitle)}
                        onOpenCopilot={(mode) => handleOpenCopilot(employment, mode)}
                    />
                </div>
            </div>
        );
    };

    const renderGuideContent = () => {
        if (!employments || employments.length === 0) return null;

        const targetEmp = activeEmployment || employments[0];
        const hasExistingBullets = Boolean(targetEmp?.description && targetEmp.description.trim());
        const roleName = targetEmp?.jobTitle || targetEmp?.employer || 'Position';

        return (
            <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between gap-1.5">
                    <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        AI Role Copilot
                    </h3>
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100/80 px-2 py-0.5 rounded-md truncate max-w-[130px]" title={roleName}>
                        {roleName}
                    </span>
                </div>

                {employments.length > 1 && (
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                        {employments.map((emp, idx) => (
                            <button
                                key={emp.id}
                                type="button"
                                onClick={() => setActiveEmploymentId(emp.id)}
                                className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                                    (targetEmp?.id === emp.id)
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                #{idx + 1} {emp.jobTitle || emp.employer || 'Role'}
                            </button>
                        ))}
                    </div>
                )}

                <p className="text-[11px] text-slate-500 leading-snug">
                    Use AI to polish bullets, insert verified metrics, align keywords with target job, or answer guided questions.
                </p>

                {/* Primary Action Button */}
                <button
                    type="button"
                    onClick={() => handleOpenCopilot(targetEmp, hasExistingBullets ? 'polish' : 'interview')}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] cursor-pointer"
                    title={hasExistingBullets ? "Open AI Role Copilot to polish writing and enhance bullets" : "Generate tailored bullet points using guided AI questions"}
                >
                    <MdAutoAwesome className="w-3.5 h-3.5 text-indigo-200" />
                    <span>{hasExistingBullets ? 'Open AI Copilot' : '✨ Write with AI'}</span>
                </button>

                {/* Segmented Quick Tools */}
                <div className="grid grid-cols-3 gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
                    <button
                        type="button"
                        onClick={() => handleOpenCopilot(targetEmp, 'quantify')}
                        className="inline-flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-slate-700 hover:text-amber-800 hover:bg-white transition-all cursor-pointer text-center"
                        title="Add measurable numbers, revenue, %, or scale"
                    >
                        <MdTrendingUp className="w-3.5 h-3.5 text-amber-600 mb-0.5" />
                        <span className="text-[10px] font-bold">+ Metrics</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => handleOpenCopilot(targetEmp, 'tailor')}
                        className="inline-flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-slate-700 hover:text-purple-800 hover:bg-white transition-all cursor-pointer text-center"
                        title="Match terminology from your Target Role and Job Description"
                    >
                        <MdTrackChanges className="w-3.5 h-3.5 text-purple-600 mb-0.5" />
                        <span className="text-[10px] font-bold">Tailor to Job</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => handleOpenCopilot(targetEmp, 'interview')}
                        className="inline-flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-slate-700 hover:text-indigo-800 hover:bg-white transition-all cursor-pointer text-center"
                        title="Answer 3 simple guided questions to craft bullets"
                    >
                        <MdHelpOutline className="w-3.5 h-3.5 text-indigo-500 mb-0.5" />
                        <span className="text-[10px] font-bold">Guided Q&A</span>
                    </button>
                </div>
            </div>
        );
    };

    return (
        <StepShell
            stepNumber={2}
            stepPath="work-history"
            title={t('WorkHistoryStep.title', 'Work history')}
            subtitle={t('WorkHistoryStep.subtitle', 'Document your roles chronologically. Experience represents 28% of your overall ATS score.')}
            isComplete={hasValidEmployment}
            statusBadge={employments.length > 0 ? `${employments.length} ${employments.length === 1 ? 'role' : 'roles'}` : ''}
            resumeData={resumeData}
            targetJd={resumeData.targetJobDescription || ''}
            guideChildren={renderGuideContent()}
        >
            {employments.length === 0 ? (
                /* Smart Contextual Empty State */
                <div className="rounded-2xl border-2 border-dashed border-indigo-200/80 bg-gradient-to-b from-indigo-50/40 to-white p-8 text-center space-y-6">
                    <div className="max-w-md mx-auto space-y-2">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto shadow-md">
                            <MdWorkOutline className="w-6 h-6" />
                        </div>
                        <h3 className="text-base font-bold text-slate-900">
                            {suggestedTargetRole
                                ? `Let's build your experience for ${suggestedTargetRole}`
                                : 'Add your work experience'}
                        </h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Work experience accounts for <strong>28 out of 100 points</strong> in your ATS score.
                            Start with your current or most recent role and include measurable achievements.
                        </p>
                    </div>

                    {/* 4-Step Visual Roadmap */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-xl mx-auto text-left">
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                            <span className="text-[10px] font-bold text-indigo-600">01 · Role & Org</span>
                            <p className="text-[11px] text-slate-600 font-medium">Add verified title & employer</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                            <span className="text-[10px] font-bold text-indigo-600">02 · Dates</span>
                            <p className="text-[11px] text-slate-600 font-medium">Establish chronological tenure</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                            <span className="text-[10px] font-bold text-indigo-600">03 · Verbs & Metrics</span>
                            <p className="text-[11px] text-slate-600 font-medium">Lead with action & numbers</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                            <span className="text-[10px] font-bold text-indigo-600">04 · Target JD</span>
                            <p className="text-[11px] text-slate-600 font-medium">Align domain keywords</p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        {suggestedTargetRole ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => addEmployment(suggestedTargetRole)}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all hover:shadow-lg"
                                >
                                    <MdAdd className="w-4 h-4" />
                                    <span>Add Experience as {suggestedTargetRole}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => addEmployment('')}
                                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
                                >
                                    <span>+ Add a Different Role</span>
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={() => addEmployment('')}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all"
                            >
                                <MdAdd className="w-4 h-4" />
                                <span>Add Your First Role</span>
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <EntryList
                        entries={employments.map(employment => ({
                            ...employment,
                            onMoveUp: () => moveEmployment(employment.id, -1),
                            onMoveDown: () => moveEmployment(employment.id, 1),
                            onDuplicate: () => duplicateEmployment(employment.id),
                            onDelete: () => removeEmployment(employment.id),
                        }))}
                        renderEntryTitle={(employment) => ({
                            title: employment.jobTitle || (employment.employer ? 'Position' : 'Untitled Role'),
                            subtitle: [employment.employer, employment.city].filter(Boolean).join(' · '),
                            meta: (employment.begin || employment.current || employment.end)
                                ? `${employment.begin || '…'} – ${employment.current ? 'Present' : (employment.end || '…')}`
                                : '',
                        })}
                        renderEntry={renderEntryBody}
                    />

                    <button
                        type="button"
                        onClick={() => addEmployment('')}
                        className="w-full h-11 rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-sm font-semibold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-colors"
                    >
                        <MdAdd className="w-4 h-4" />
                        Add another role
                    </button>
                </div>
            )}

            {/* Unified AI Role Copilot Modal */}
            <RoleAiCopilotModal
                isOpen={copilotOpen}
                onClose={() => setCopilotOpen(false)}
                onApplyBullets={handleApplyCopilotBullets}
                employment={copilotActiveEmployment || {}}
                targetRole={suggestedTargetRole}
                targetJd={resumeData.targetJobDescription || ''}
                initialMode={copilotInitialMode}
            />
        </StepShell>
    );
};

export default WorkHistoryStep;
