import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MdAdd, MdAutoAwesome, MdFormatListBulleted } from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import EmptyState from '../components/EmptyState.jsx';
import EntryList from '../components/EntryList.jsx';
import Field from '../components/Field.jsx';
import AutocompleteInputField from './components/AutocompleteInputField';
import MonthYearPicker from '../../Form/MonthYearPicker';
import EducationHealthCard from './components/EducationHealthCard.jsx';
import { getEducationHealth } from '../../../utils/bulletQuality.js';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';
import { generateUserAiContent } from '../../../services/aiService';

/**
 * EducationStep — Clean, Streamlined Education & Qualifications with ATS Integration
 *
 * Features:
 * - Clean 2-column ergonomic layout
 * - Instant keystroke autocomplete for schools and degrees
 * - Optional Field of Study / Major, City, and Honors/GPA fields
 * - MonthYearPicker for start and graduation dates with "Currently Studying" toggle
 * - Academic ATS Health card evaluating credential signals and Target JD alignment
 * - Enhance with AI for Coursework, Honors, Research & Thesis with bullet pointers (•)
 * - Auto-continuing bullet points on Enter and 1-click bulletizer toggle
 * - Quick starter idea chips and Undo capability
 * - Synchronous unmount flush and persistence
 */
const EducationStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [educations, setEducations] = useState(resumeData.educations || []);
    const [enhancingId, setEnhancingId] = useState(null);
    const [previousDescriptions, setPreviousDescriptions] = useState({});
    const [feedbackMsg, setFeedbackMsg] = useState(null);
    const candidateContext = getCandidateContext(resumeData, resumeData.targetJobDescription || '');

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
        fieldOfStudy: '',
        city: '',
        started: '',
        finished: '',
        grade: '',
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

    const handleEnhanceWithAi = async (education) => {
        if (!education.school && !education.degree) {
            setFeedbackMsg({ id: education.id, text: 'Please enter Institution or Degree first', type: 'warn' });
            setTimeout(() => setFeedbackMsg(null), 3000);
            return;
        }

        setEnhancingId(education.id);
        try {
            const existingNotes = String(education.description || '').trim();

            const payload = {
                isAiEnhance: true,
                entry: {
                    school: education.school || '',
                    degree: education.degree || '',
                    fieldOfStudy: education.fieldOfStudy || '',
                    city: education.city || '',
                    started: education.started || education.begin || '',
                    finished: education.finished || education.end || '',
                    grade: education.grade || '',
                    description: existingNotes,
                },
                targetRole: resumeData.targetRole || candidateContext?.target?.role || '',
                targetJd: resumeData.targetJobDescription || '',
            };

            const res = await generateUserAiContent('generate-education-description', payload);
            const suggestions = res?.data?.suggestions || res?.suggestions || [];
            if (Array.isArray(suggestions) && suggestions.length > 0) {
                setPreviousDescriptions(prev => ({ ...prev, [education.id]: education.description || '' }));
                // Ensure every point has bullet pointer (•) prefix
                const formatted = suggestions
                    .map(s => String(s || '').trim())
                    .filter(Boolean)
                    .map(s => {
                        const clean = s.replace(/^[•*–—\-]\s*/, '').trim();
                        return `• ${clean}`;
                    })
                    .join('\n');
                updateEducation(education.id, 'description', formatted);
                setFeedbackMsg({ id: education.id, text: 'Enhanced with AI ✓', type: 'success' });
            } else {
                setFeedbackMsg({ id: education.id, text: 'No enhancements returned', type: 'warn' });
            }
        } catch (err) {
            console.error('[Education AI Enhance Error]', err);
            setFeedbackMsg({ id: education.id, text: 'AI currently unavailable — please try again', type: 'error' });
        } finally {
            setEnhancingId(null);
            setTimeout(() => setFeedbackMsg(null), 3500);
        }
    };

    const handleUndoEnhance = (id) => {
        if (previousDescriptions[id] !== undefined) {
            updateEducation(id, 'description', previousDescriptions[id]);
            setPreviousDescriptions(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        }
    };

    const handleToggleBullets = (education) => {
        const text = String(education.description || '').trim();
        if (!text) {
            updateEducation(education.id, 'description', '• ');
            return;
        }
        const lines = text.split('\n');
        const allBulleted = lines.filter(l => l.trim()).every(l => /^[•*–—\-]\s+/.test(l.trim()));
        let updated;
        if (allBulleted) {
            updated = lines.map(l => l.replace(/^[•*–—\-]\s*/, '').trim()).join('\n');
        } else {
            updated = lines.map(l => {
                const trimmed = l.trim();
                if (!trimmed) return '';
                return /^[•*–—\-]\s+/.test(trimmed) ? trimmed : `• ${trimmed.replace(/^[•*–—\-]\s*/, '')}`;
            }).join('\n');
        }
        updateEducation(education.id, 'description', updated);
    };

    const handleTextareaKeyDown = (e, education) => {
        if (e.key === 'Enter') {
            const textarea = e.target;
            const { selectionStart, selectionEnd, value } = textarea;
            const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
            const currentLine = value.substring(lineStart, selectionStart);

            // If user pressed Enter on an empty bullet line (just "• "), exit bullet list
            if (/^[•*–—\-]\s*$/.test(currentLine)) {
                e.preventDefault();
                const before = value.substring(0, lineStart);
                const after = value.substring(selectionEnd);
                const newValue = before + after;
                updateEducation(education.id, 'description', newValue);
                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = lineStart;
                }, 0);
                return;
            }

            // If current line starts with a bullet point, automatically add bullet to next line
            if (/^[•*–—\-]\s+/.test(currentLine)) {
                e.preventDefault();
                const before = value.substring(0, selectionStart);
                const after = value.substring(selectionEnd);
                const newValue = before + '\n• ' + after;
                updateEducation(education.id, 'description', newValue);
                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = selectionStart + 3;
                }, 0);
            }
        }
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
        return (
            <div className="space-y-4 pt-1">
                {/* Row 1: School & Degree */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <AutocompleteInputField
                        label={t('EducationStep.fields.school.label', 'Institution / University')}
                        name={`school-${education.id}`}
                        placeholder={getDynamicPlaceholder('education', 'school', candidateContext) || 'e.g. Stanford University or MIT'}
                        value={education.school}
                        onChange={(e) => updateEducation(education.id, 'school', e.target.value)}
                        required
                        suggestionType="school"
                        context={candidateContext}
                    />
                    <AutocompleteInputField
                        label={t('EducationStep.fields.degree.label', 'Degree / Qualification')}
                        name={`degree-${education.id}`}
                        placeholder={getDynamicPlaceholder('education', 'degree', candidateContext) || 'e.g. Bachelor of Science in Computer Science'}
                        value={education.degree}
                        onChange={(e) => updateEducation(education.id, 'degree', e.target.value)}
                        required
                        suggestionType="degree"
                        context={candidateContext}
                    />
                </div>

                {/* Row 2: Field of Study & City / Location */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field
                        label="Field of Study / Major (Optional)"
                        name={`fieldOfStudy-${education.id}`}
                        placeholder="e.g. Computer Science, Economics, Nursing"
                        value={education.fieldOfStudy || ''}
                        onChange={(e) => updateEducation(education.id, 'fieldOfStudy', e.target.value)}
                    />
                    <Field
                        label="City / Location (Optional)"
                        name={`city-${education.id}`}
                        placeholder="e.g. Cambridge, MA or Oxford, UK"
                        value={education.city || ''}
                        onChange={(e) => updateEducation(education.id, 'city', e.target.value)}
                    />
                </div>

                {/* Row 3: MonthYearPicker Start & End / Graduation Dates + GPA / Honors */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid grid-cols-2 gap-3">
                        <MonthYearPicker
                            label={t('EducationStep.fields.startDate.label', 'Start date')}
                            value={education.started || education.begin || ''}
                            onChange={(date) => updateEducation(education.id, 'started', date)}
                        />
                        <MonthYearPicker
                            label={t('EducationStep.fields.endDate.label', 'Graduation / End date')}
                            value={education.finished || education.end || ''}
                            onChange={(date) => updateEducation(education.id, 'finished', date)}
                            disabled={education.current}
                            placeholder={education.current ? 'Present' : 'Select date'}
                            isCurrent={Boolean(education.current || String(education.finished || '').toLowerCase() === 'present')}
                            headerRight={
                                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold select-none">
                                    <input
                                        type="checkbox"
                                        checked={!!education.current}
                                        onChange={(e) => {
                                            const isChecked = e.target.checked;
                                            setEducations(prev =>
                                                prev.map(edu => (edu.id === education.id ? { ...edu, current: isChecked, finished: isChecked ? 'Present' : '' } : edu))
                                            );
                                        }}
                                        className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                                    />
                                    <span className={education.current ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-700'}>
                                        Currently Studying
                                    </span>
                                </label>
                            }
                        />
                    </div>
                    <Field
                        label="Honors / GPA / Distinction (Optional)"
                        name={`grade-${education.id}`}
                        placeholder="e.g. 3.9 GPA, Dean's List, Magna Cum Laude"
                        value={education.grade || ''}
                        onChange={(e) => updateEducation(education.id, 'grade', e.target.value)}
                    />
                </div>

                {/* Academic ATS Health Card */}
                <EducationHealthCard
                    education={education}
                    targetJd={resumeData.targetJobDescription || ''}
                />

                {/* Clean Coursework & Notes with AI Enhancement (No clumsy bullets) */}
                <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                            <label className="block text-[13px] font-bold text-slate-800">
                                Coursework, Honors, Research or Thesis (Optional)
                            </label>
                            <p className="text-xs text-slate-500">
                                Add notable coursework, awards, senior thesis, or academic highlights.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {previousDescriptions[education.id] !== undefined && previousDescriptions[education.id] !== education.description && (
                                <button
                                    type="button"
                                    onClick={() => handleUndoEnhance(education.id)}
                                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors underline cursor-pointer"
                                >
                                    Undo
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => handleToggleBullets(education)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer shadow-2xs"
                                title="Toggle bullet point (•) before each line"
                            >
                                <MdFormatListBulleted className="w-3.5 h-3.5 text-slate-600" />
                                <span>Bullets</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleEnhanceWithAi(education)}
                                disabled={enhancingId === education.id || (!education.school && !education.degree)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-900 rounded-lg border border-indigo-200 transition-all shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                title={!education.school && !education.degree ? 'Fill in Institution or Degree first' : 'Enhance coursework and academic notes with AI bullet points'}
                            >
                                {enhancingId === education.id ? (
                                    <>
                                        <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                        <span>Enhancing...</span>
                                    </>
                                ) : (
                                    <>
                                        <MdAutoAwesome className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>Enhance with AI</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {feedbackMsg && feedbackMsg.id === education.id && (
                        <div className={`text-xs px-2.5 py-1 rounded-md font-medium ${
                            feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            feedbackMsg.type === 'warn' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                            {feedbackMsg.text}
                        </div>
                    )}

                    <textarea
                        rows={3}
                        className="w-full text-xs rounded-xl border border-slate-300 p-3 text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors leading-relaxed"
                        placeholder={`• Relevant Coursework: Distributed Systems, Machine Learning, Computer Networks
• Dean's Honor List across all semesters; 3.92 GPA
• Senior Capstone: Autonomous drone navigation system using ROS and C++`}
                        value={education.description || ''}
                        onChange={(e) => updateEducation(education.id, 'description', e.target.value)}
                        onKeyDown={(e) => handleTextareaKeyDown(e, education)}
                    />

                    {/* Quick starter chips when empty */}
                    {(!education.description || education.description.trim().length === 0) && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            <span className="text-[11px] text-slate-400 font-medium">Quick ideas:</span>
                            {[
                                "Dean's Honor List",
                                "Relevant Coursework",
                                "Senior Capstone Project",
                                "Magna Cum Laude",
                                "Undergraduate Research Assistant"
                            ].map((chip) => (
                                <button
                                    key={chip}
                                    type="button"
                                    onClick={() => {
                                        const bulletItem = `• ${chip}: `;
                                        const current = (education.description || '').trim();
                                        const updated = current ? `${current}\n${bulletItem}` : bulletItem;
                                        updateEducation(education.id, 'description', updated);
                                    }}
                                    className="text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                                >
                                    + {chip}
                                </button>
                            ))}
                        </div>
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
                        renderEntryTitle={(education) => {
                            const health = getEducationHealth(education, resumeData.targetJobDescription || '');
                            return {
                                title: education.degree || 'Degree / Qualification',
                                subtitle: [education.school, education.city].filter(Boolean).join(' · ') || 'Institution',
                                meta: (education.started || education.current || education.finished)
                                    ? `${education.started || '…'} – ${education.current ? 'Present' : (education.finished || '…')}`
                                    : '',
                                badge: health.score >= 85 ? 'ATS Ready' : health.score >= 70 ? 'Strong' : undefined,
                            };
                        }}
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
