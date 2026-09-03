import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MdAdd, MdLightbulb } from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import EmptyState from '../components/EmptyState.jsx';
import EntryList from '../components/EntryList.jsx';
import AiPromptCard from '../components/AiPromptCard.jsx';
import Field from '../components/Field.jsx';
import AutocompleteInputField from './components/AutocompleteInputField';
import MonthYearPicker from '../../Form/MonthYearPicker';
import BulletPointsEditor from '../../Form/BulletPointsEditor';
import { useAiAssist } from '../ai/useAiAssist.js';
import { canRunAssistOperation } from '../ai/aiContract.js';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';

/**
 * Work history — entry list with a single primary action ("Add your
 * experience"), per-entry inline AI (evidence-gated: notes → grounded
 * suggestions, no notes → questions). No command bar, no verb toolbar,
 * no sample content.
 */
const WorkHistoryStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [employments, setEmployments] = useState(resumeData.employments || []);
    const candidateContext = getCandidateContext(resumeData, resumeData.targetJobDescription || '');

    const ai = useAiAssist();
    const [activeEmploymentId, setActiveEmploymentId] = useState(null);

    useEffect(() => {
        if (resumeData.employments && Array.isArray(resumeData.employments)) {
            setEmployments(resumeData.employments);
        }
    }, [resumeData.employments]);

    const createNewEmployment = () => ({
        id: Date.now(),
        jobTitle: '',
        employer: '',
        city: '',
        begin: '',
        end: '',
        description: '',
        current: false,
        employmentType: 'full-time',
    });

    const addEmployment = () => {
        const newEmployment = createNewEmployment();
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

    // ——— AI: evidence-gated, per entry ———
    const activeEmployment = employments.find(emp => String(emp.id) === String(activeEmploymentId)) || null;

    const runAiFor = (employment) => {
        setActiveEmploymentId(employment.id);
        ai.run({
            operation: 'generate-work-description',
            resumeData,
            targetJd: resumeData.targetJobDescription || '',
            entry: employment,
        });
    };

    const handleAiAnswers = (answers) => {
        if (!activeEmployment) return;
        // The candidate's own answers become part of the entry's notes —
        // visible, editable, and the only thing the next pass may use.
        const lines = Object.values(answers).map(v => String(v || '').trim()).filter(Boolean);
        if (lines.length) {
            const current = String(activeEmployment.description || '').trim();
            updateEmployment(activeEmployment.id, 'description', current ? `${current}\n${lines.join('\n')}` : lines.join('\n'));
        }
        const withNotes = { ...activeEmployment, description: activeEmployment.description || lines.join('\n') };
        ai.run({
            operation: 'generate-work-description',
            resumeData,
            targetJd: resumeData.targetJobDescription || '',
            entry: withNotes,
            answers,
        });
    };

    const handleAiAccept = (selected) => {
        if (!activeEmployment) return;
        const bullets = selected.map(s => s.text).filter(Boolean);
        if (!bullets.length) return;
        const current = String(activeEmployment.description || '').trim();
        const formatted = bullets.map(b => (b.startsWith('•') ? b : `• ${b}`)).join('\n');
        updateEmployment(activeEmployment.id, 'description', current ? `${current}\n${formatted}` : formatted);
        ai.reset();
    };

    const closeAiCard = () => {
        ai.reset();
        setActiveEmploymentId(null);
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

    const renderEntryBody = (employment) => {
        const readiness = canRunAssistOperation('generate-work-description', { resumeData, entry: employment });
        const notesPlain = String(employment.description || '').replace(/<[^>]*>/g, ' ').trim();
        const isAiActive = String(employment.id) === String(activeEmploymentId);

        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <AutocompleteInputField
                        label={t('WorkHistoryStep.fields.jobTitle.label', 'Job Title')}
                        name={`jobTitle-${employment.id}`}
                        placeholder={getDynamicPlaceholder('work-history', 'jobTitle', candidateContext) || t('WorkHistoryStep.fields.jobTitle.placeholder', 'Enter the exact title of the role')}
                        value={employment.jobTitle}
                        onChange={(e) => updateEmployment(employment.id, 'jobTitle', e.target.value)}
                        required
                        suggestionType="jobTitle"
                        context={candidateContext}
                    />
                    <AutocompleteInputField
                        label={t('WorkHistoryStep.fields.company.label', 'Organization')}
                        name={`employer-${employment.id}`}
                        placeholder={getDynamicPlaceholder('work-history', 'employer', candidateContext) || t('WorkHistoryStep.fields.company.placeholder', 'Enter the organization where you worked')}
                        value={employment.employer}
                        onChange={(e) => updateEmployment(employment.id, 'employer', e.target.value)}
                        required
                        suggestionType="company"
                        context={candidateContext}
                    />
                    <Field
                        label="City / location"
                        name={`city-${employment.id}`}
                        placeholder={getDynamicPlaceholder('work-history', 'city', candidateContext) || 'Enter the city where the role was based'}
                        value={employment.city || ''}
                        onChange={(e) => updateEmployment(employment.id, 'city', e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <MonthYearPicker
                        label={t('WorkHistoryStep.fields.startDate.label', 'Start date')}
                        value={employment.begin}
                        onChange={(date) => updateEmployment(employment.id, 'begin', date)}
                        required
                    />
                    <div className="space-y-1.5">
                        <MonthYearPicker
                            label={t('WorkHistoryStep.fields.endDate.label', 'End date')}
                            value={employment.end}
                            onChange={(date) => updateEmployment(employment.id, 'end', date)}
                            disabled={employment.current}
                            placeholder={employment.current ? 'Present' : 'Select date'}
                        />
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700">
                            <input
                                type="checkbox"
                                checked={!!employment.current}
                                onChange={(e) => {
                                    const isChecked = e.target.checked;
                                    setEmployments(prev =>
                                        prev.map(emp => (emp.id === employment.id ? { ...emp, current: isChecked, end: isChecked ? 'Present' : '' } : emp))
                                    );
                                }}
                                className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span>{t('WorkHistoryStep.fields.currentWork.label', 'I currently work here')}</span>
                        </label>
                    </div>
                </div>

                <div className="space-y-2.5">
                    <div>
                        <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                            What you did in this role
                        </label>
                        <p className="text-xs text-slate-500 mb-2">
                            Write it in your own words — the plainer the better. AI can help turn it into resume bullets,
                            but it can only use what you write here.
                        </p>
                        <BulletPointsEditor
                            value={employment.description}
                            onChange={(value) => updateEmployment(employment.id, 'description', value)}
                            placeholder={getDynamicPlaceholder('work-history', 'description', candidateContext) || t('WorkHistoryStep.fields.description.placeholder', 'e.g. what you were responsible for, what you improved, who you worked with')}
                        />
                    </div>

                    {isAiActive && (
                        <AiPromptCard
                            title={notesPlain ? 'Strengthen this experience' : 'Describe this role with AI'}
                            buttonLabel={notesPlain ? 'Strengthen with AI' : 'Describe this role with AI'}
                            evidenceHint={notesPlain
                                ? 'Rewrites only your notes below — no invented numbers or employers.'
                                : 'You have no notes for this role yet, so it will ask you a few questions first.'}
                            status={ai.status}
                            result={ai.result}
                            error={ai.error?.message}
                            disabled={!readiness.ok}
                            disabledReason={readiness.reason}
                            onRun={() => runAiFor(employment)}
                            onAnswers={handleAiAnswers}
                            onAccept={handleAiAccept}
                            onDismiss={closeAiCard}
                        />
                    )}

                    {!isAiActive && (
                        <button
                            type="button"
                            onClick={() => runAiFor(employment)}
                            disabled={!readiness.ok}
                            title={readiness.ok ? undefined : readiness.reason}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <MdLightbulb className="w-3.5 h-3.5 text-indigo-500" />
                            {notesPlain ? 'Strengthen with AI' : 'Describe this role with AI'}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <StepShell
            stepNumber={2}
            stepPath="work-history"
            title={t('WorkHistoryStep.title', 'Work history')}
            subtitle={t('WorkHistoryStep.subtitle', 'Document each position you have held — what you did, where, and when.')}
            isComplete={hasValidEmployment}
            statusBadge={employments.length > 0 ? `${employments.length} ${employments.length === 1 ? 'role' : 'roles'}` : ''}
            resumeData={resumeData}
            targetJd={resumeData.targetJobDescription || ''}
        >
            {employments.length === 0 ? (
                <EmptyState
                    title="Add your first role"
                    description="Start with your most recent position — the organization, the title, and a few lines about what you did. You can add earlier roles any time."
                    primaryAction={{
                        label: 'Add your experience',
                        icon: <MdAdd className="w-4 h-4" />,
                        onClick: addEmployment,
                    }}
                />
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
                            title: employment.jobTitle || (employment.employer ? '' : ''),
                            subtitle: [employment.employer, employment.city].filter(Boolean).join(' · '),
                            meta: (employment.begin || employment.current || employment.end)
                                ? `${employment.begin || '…'} – ${employment.current ? 'Present' : (employment.end || '…')}`
                                : '',
                        })}
                        renderEntry={renderEntryBody}
                    />

                    <button
                        type="button"
                        onClick={addEmployment}
                        className="w-full h-11 rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-sm font-semibold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-colors"
                    >
                        <MdAdd className="w-4 h-4" />
                        Add another role
                    </button>
                </div>
            )}
        </StepShell>
    );
};

export default WorkHistoryStep;
