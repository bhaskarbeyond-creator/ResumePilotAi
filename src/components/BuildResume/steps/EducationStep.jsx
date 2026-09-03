import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MdAdd, MdLightbulb } from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import EmptyState from '../components/EmptyState.jsx';
import EntryList from '../components/EntryList.jsx';
import AiPromptCard from '../components/AiPromptCard.jsx';
import Field from '../components/Field.jsx';
import AutocompleteInputField from './components/AutocompleteInputField';
import RichTextEditor from './components/RichTextEditor';
import { useAiAssist } from '../ai/useAiAssist.js';
import { canRunAssistOperation } from '../ai/aiContract.js';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';

/**
 * Education — entry list. Institutions and degrees are typed by the
 * candidate (no "popular" lists, no grade presets — those were fabricated
 * content). Inline AI rewrites only the candidate's own notes.
 */
const EducationStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [educations, setEducations] = useState(resumeData.educations || []);
    const candidateContext = getCandidateContext(resumeData, resumeData.targetJobDescription || '');

    const ai = useAiAssist();
    const [activeEducationId, setActiveEducationId] = useState(null);

    useEffect(() => {
        if (resumeData.educations && Array.isArray(resumeData.educations)) {
            setEducations(resumeData.educations);
        }
    }, [resumeData.educations]);

    const createNewEducation = () => ({
        id: Date.now(),
        school: '',
        degree: '',
        degreeType: 'degree',
        started: '',
        finished: '',
        description: '',
        current: false,
    });

    const addEducation = () => {
        const newEducation = createNewEducation();
        setEducations(prev => [...prev, newEducation]);
    };

    const removeEducation = (id) => {
        setEducations(current => current.filter(edu => edu.id !== id));
    };

    const moveEducation = (id, direction) => setEducations(current => moveResumeItem(current, id, direction));

    const duplicateEducation = (id) => setEducations(current => {
        const source = current.find(item => item.id === id);
        return duplicateResumeItem(current, id, { degree: `${source?.degree || 'Degree'} (Copy)` });
    });

    const updateEducation = (id, field, value) => {
        setEducations(prevEducations =>
            prevEducations.map(edu => (edu.id === id ? { ...edu, [field]: value } : edu))
        );
    };

    // ——— AI: evidence-gated, per entry ———
    const activeEducation = educations.find(edu => String(edu.id) === String(activeEducationId)) || null;

    const runAiFor = (education) => {
        setActiveEducationId(education.id);
        ai.run({
            operation: 'generate-education-description',
            resumeData,
            targetJd: resumeData.targetJobDescription || '',
            entry: education,
        });
    };

    const handleAiAnswers = (answers) => {
        if (!activeEducation) return;
        const lines = Object.values(answers).map(v => String(v || '').trim()).filter(Boolean);
        if (lines.length) {
            const current = String(activeEducation.description || '').trim();
            updateEducation(activeEducation.id, 'description', current ? `${current}\n${lines.join('\n')}` : lines.join('\n'));
        }
        const withNotes = { ...activeEducation, description: activeEducation.description || lines.join('\n') };
        ai.run({
            operation: 'generate-education-description',
            resumeData,
            targetJd: resumeData.targetJobDescription || '',
            entry: withNotes,
            answers,
        });
    };

    const handleAiAccept = (selected) => {
        if (!activeEducation) return;
        const bullets = selected.map(s => s.text).filter(Boolean);
        if (!bullets.length) return;
        const current = String(activeEducation.description || '').trim();
        const formatted = bullets.map(b => (b.startsWith('•') ? b : `• ${b}`)).join('\n');
        updateEducation(activeEducation.id, 'description', current ? `${current}\n${formatted}` : formatted);
        ai.reset();
    };

    const closeAiCard = () => {
        ai.reset();
        setActiveEducationId(null);
    };

    const handleSave = () => {
        const hasValidEducation = educations.some(edu => String(edu?.school || '').trim() !== '' && String(edu?.degree || '').trim() !== '');
        const completedSteps = [...(resumeData.completedSteps || [])];
        let updatedCompletedSteps = null;

        if (hasValidEducation && !completedSteps.includes(3)) {
            updatedCompletedSteps = [...completedSteps, 3];
        } else if (!hasValidEducation && completedSteps.includes(3)) {
            updatedCompletedSteps = completedSteps.filter(step => step !== 3);
        }

        updateResumeData({
            educations,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);
        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [educations]);

    // Unmount flush: synchronously commit state on step exit
    const educationsRef = useRef(educations);
    const updateResumeDataRef = useRef(updateResumeData);
    const completedStepsRef = useRef(resumeData?.completedSteps || []);
    useEffect(() => { educationsRef.current = educations; }, [educations]);
    useEffect(() => { updateResumeDataRef.current = updateResumeData; }, [updateResumeData]);
    useEffect(() => { completedStepsRef.current = resumeData?.completedSteps || []; }, [resumeData?.completedSteps]);
    useEffect(() => () => {
        const edus = educationsRef.current;
        const hasValid = edus.some(edu => String(edu?.school || '').trim() !== '' && String(edu?.degree || '').trim() !== '');
        const completedSteps = [...(completedStepsRef.current || [])];
        let updatedCompletedSteps = null;
        if (hasValid && !completedSteps.includes(3)) {
            updatedCompletedSteps = [...completedSteps, 3];
        } else if (!hasValid && completedSteps.includes(3)) {
            updatedCompletedSteps = completedSteps.filter(step => step !== 3);
        }
        updateResumeDataRef.current({
            educations: edus,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    }, []);

    const hasValidEducation = educations.some(edu => String(edu?.school || '').trim() !== '' && String(edu?.degree || '').trim() !== '');

    const renderEntryBody = (education) => {
        const readiness = canRunAssistOperation('generate-education-description', { resumeData, entry: education });
        const notesPlain = String(education.description || '').replace(/<[^>]*>/g, ' ').trim();
        const isAiActive = String(education.id) === String(activeEducationId);

        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <AutocompleteInputField
                        label={t('EducationStep.fields.school.label', 'Institution')}
                        name={`school-${education.id}`}
                        placeholder={getDynamicPlaceholder('education', 'school', candidateContext) || 'Enter the institution exactly as it appears on your certificate'}
                        value={education.school}
                        onChange={(e) => updateEducation(education.id, 'school', e.target.value)}
                        required
                        suggestionType="school"
                        context={candidateContext}
                    />
                    <AutocompleteInputField
                        label={t('EducationStep.fields.degree.label', 'Degree / qualification')}
                        name={`degree-${education.id}`}
                        placeholder={getDynamicPlaceholder('education', 'degree', candidateContext) || 'Enter the qualification exactly as it appears on your certificate'}
                        value={education.degree}
                        onChange={(e) => updateEducation(education.id, 'degree', e.target.value)}
                        required
                        suggestionType="degree"
                        context={candidateContext}
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field
                        label={t('EducationStep.fields.startDate.label', 'Start year')}
                        name={`started-${education.id}`}
                        placeholder="e.g. 2019 or Aug 2019"
                        value={education.started}
                        onChange={(e) => updateEducation(education.id, 'started', e.target.value)}
                    />
                    <div className="space-y-1.5">
                        <Field
                            label={t('EducationStep.fields.endDate.label', 'End year')}
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
                                    setEducations(prev =>
                                        prev.map(edu => (edu.id === education.id ? { ...edu, current: isChecked, finished: isChecked ? 'Present' : '' } : edu))
                                    );
                                }}
                                className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span>{t('EducationStep.fields.currentStudy.label', 'I am currently studying here')}</span>
                        </label>
                    </div>
                </div>

                <div className="space-y-2.5">
                    <div>
                        <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                            Coursework, honors & notable work
                        </label>
                        <p className="text-xs text-slate-500 mb-2">
                            Only what you completed — course names, honors, final-year project, or results you are comfortable listing.
                        </p>
                        <RichTextEditor
                            value={education.description}
                            onChange={(value) => updateEducation(education.id, 'description', value)}
                            rows={3}
                            placeholder={getDynamicPlaceholder('education', 'description', candidateContext) || t('EducationStep.fields.description.placeholder', 'e.g. final-year project, relevant coursework, honors (as printed on your documents)')}
                        />
                    </div>

                    {isAiActive ? (
                        <AiPromptCard
                            title={notesPlain ? 'Strengthen this qualification' : 'Describe this qualification with AI'}
                            buttonLabel={notesPlain ? 'Strengthen with AI' : 'Describe this qualification with AI'}
                            evidenceHint={notesPlain
                                ? 'Rewrites only your notes — no invented courses, honors, or results.'
                                : 'You have no notes for this qualification yet, so it will ask you a few questions first.'}
                            status={ai.status}
                            result={ai.result}
                            error={ai.error?.message}
                            disabled={!readiness.ok}
                            disabledReason={readiness.reason}
                            onRun={() => runAiFor(education)}
                            onAnswers={handleAiAnswers}
                            onAccept={handleAiAccept}
                            onDismiss={closeAiCard}
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={() => runAiFor(education)}
                            disabled={!readiness.ok}
                            title={readiness.ok ? undefined : readiness.reason}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <MdLightbulb className="w-3.5 h-3.5 text-indigo-500" />
                            {notesPlain ? 'Strengthen with AI' : 'Describe this qualification with AI'}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <StepShell
            stepNumber={3}
            stepPath="education"
            title={t('EducationStep.title', 'Education & qualifications')}
            subtitle={t('EducationStep.subtitle', 'List the qualifications you have completed — exactly as they appear on your documents.')}
            isComplete={hasValidEducation}
            statusBadge={educations.length > 0 ? `${educations.length} ${educations.length === 1 ? 'qualification' : 'qualifications'}` : ''}
            resumeData={resumeData}
            targetJd={resumeData.targetJobDescription || ''}
        >
            {educations.length === 0 ? (
                <EmptyState
                    title="Add your first qualification"
                    description="Your highest completed qualification first — the institution, the degree or diploma, and the years. Honors and coursework are optional."
                    primaryAction={{
                        label: 'Add a qualification',
                        icon: <MdAdd className="w-4 h-4" />,
                        onClick: addEducation,
                    }}
                />
            ) : (
                <div className="space-y-3">
                    <EntryList
                        entries={educations.map(education => ({
                            ...education,
                            onMoveUp: () => moveEducation(education.id, -1),
                            onMoveDown: () => moveEducation(education.id, 1),
                            onDuplicate: () => duplicateEducation(education.id),
                            onDelete: () => removeEducation(education.id),
                        }))}
                        renderEntryTitle={(education) => ({
                            title: education.degree || '',
                            subtitle: education.school || '',
                            meta: (education.started || education.current || education.finished)
                                ? `${education.started || '…'} – ${education.current ? 'Present' : (education.finished || '…')}`
                                : '',
                        })}
                        renderEntry={renderEntryBody}
                    />

                    <button
                        type="button"
                        onClick={addEducation}
                        className="w-full h-11 rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-sm font-semibold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-colors"
                    >
                        <MdAdd className="w-4 h-4" />
                        Add another qualification
                    </button>
                </div>
            )}
        </StepShell>
    );
};

export default EducationStep;
