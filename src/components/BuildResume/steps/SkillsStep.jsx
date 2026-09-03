import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MdAdd, MdCheckCircle } from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import Field from '../components/Field.jsx';
import AutocompleteInputField from './components/AutocompleteInputField';
import AiPromptCard from '../components/AiPromptCard.jsx';
import { useAiAssist } from '../ai/useAiAssist.js';
import { canRunAssistOperation } from '../ai/aiContract.js';
import { calculateAtsScore } from '../../../utils/atsScore';
import { cleanSkillName } from '../../../services/aiService';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';

const PROFICIENCY_LEVELS = [
    { label: 'Beginner', value: 25 },
    { label: 'Intermediate', value: 50 },
    { label: 'Advanced', value: 75 },
    { label: 'Expert', value: 100 },
];

/**
 * Skills — chip list + proficiency, deterministic duplicate detection,
 * AI "suggest from your profile" (per-item accept, labeled suggestions),
 * and a JD-alignment panel with real MATCHED / PARTIAL / MISSING buckets.
 * No hardcoded skill categories, no "popular" lists.
 */
const SkillsStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [skills, setSkills] = useState(resumeData.skills || []);
    const candidateContext = getCandidateContext(resumeData, resumeData.targetJobDescription || '');
    const targetJd = resumeData.targetJobDescription || '';

    const ai = useAiAssist();
    const [newSkillName, setNewSkillName] = useState('');
    const [newSkillLevel, setNewSkillLevel] = useState(75);
    const idCounter = useRef(0);

    useEffect(() => {
        if (resumeData.skills && Array.isArray(resumeData.skills)) {
            setSkills(resumeData.skills);
        }
    }, [resumeData.skills]);

    const createNewSkill = (name = '', rating = 75) => {
        idCounter.current += 1;
        return {
            id: `skill_${Date.now()}_${idCounter.current}`,
            skillName: cleanSkillName(name) || name,
            rating: Number.isFinite(rating) ? rating : 75,
        };
    };

    const normalizeSkillName = value => String(value || '').trim().toLowerCase();

    const handleAddSkill = (nameToAdd, ratingToAdd) => {
        const raw = nameToAdd || newSkillName;
        if (!raw || !raw.trim()) return;

        // Multi-skill ingestion support: handles comma, semicolon, or newline delimited paste
        if (raw.includes(',') || raw.includes(';') || raw.includes('\n')) {
            const tokens = raw.split(/[,;\n]+/).map(t => cleanSkillName(t)).filter(Boolean);
            if (tokens.length > 1) {
                setSkills(prev => {
                    const existingNames = new Set(prev.map(s => normalizeSkillName(s?.skillName || s?.name)));
                    const toAdd = [];
                    for (const token of tokens) {
                        const norm = normalizeSkillName(token);
                        if (norm && !existingNames.has(norm)) {
                            existingNames.add(norm);
                            toAdd.push(createNewSkill(token, ratingToAdd !== undefined ? ratingToAdd : newSkillLevel));
                        }
                    }
                    return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
                });
                setNewSkillName('');
                return;
            }
        }

        const cleaned = cleanSkillName(raw);
        if (!cleaned || cleaned.trim() === '') return;
        if (skills.some(s => normalizeSkillName(s?.skillName || s?.name) === normalizeSkillName(cleaned))) {
            setNewSkillName('');
            return;
        }
        const rating = ratingToAdd !== undefined ? ratingToAdd : newSkillLevel;
        const newSkill = createNewSkill(cleaned, rating);
        setSkills(prev => [...prev, newSkill]);
        setNewSkillName('');
    };

    const removeSkill = (id) => setSkills(prev => prev.filter(skill => skill.id !== id));

    const updateSkillRating = (id, newRating) =>
        setSkills(prev => prev.map(skill => (skill.id === id ? { ...skill, rating: newRating } : skill)));

    // ——— AI: suggestions from the candidate's own profile ———
    const aiReadiness = canRunAssistOperation('generate-skills', { resumeData });

    const runSkillIdeas = () => {
        ai.run({
            operation: 'generate-skills',
            resumeData,
            targetJd,
        });
    };

    const handleSkillAccept = (selected) => {
        const additions = selected
            .map(s => s.meta?.name || s.text)
            .filter(name => name && !skills.some(existing => normalizeSkillName(existing?.skillName || existing?.name) === normalizeSkillName(name)));
        if (additions.length) {
            setSkills(prev => [...prev, ...additions.map(name => createNewSkill(name, 75))]);
        }
        ai.reset();
    };

    const handleSave = () => {
        const hasValidSkill = skills.some(s => String(s?.skillName || s?.name || '').trim() !== '');
        const completedSteps = [...(resumeData.completedSteps || [])];
        let updatedCompletedSteps = null;

        if (hasValidSkill && !completedSteps.includes(4)) {
            updatedCompletedSteps = [...completedSteps, 4];
        } else if (!hasValidSkill && completedSteps.includes(4)) {
            updatedCompletedSteps = completedSteps.filter(step => step !== 4);
        }

        updateResumeData({
            skills,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);
        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [skills]);

    // Unmount flush: synchronously commit state on step exit
    const skillsRef = useRef(skills);
    const updateResumeDataRef = useRef(updateResumeData);
    const completedStepsRef = useRef(resumeData?.completedSteps || []);
    useEffect(() => { skillsRef.current = skills; }, [skills]);
    useEffect(() => { updateResumeDataRef.current = updateResumeData; }, [updateResumeData]);
    useEffect(() => { completedStepsRef.current = resumeData?.completedSteps || []; }, [resumeData?.completedSteps]);
    useEffect(() => () => {
        const sks = skillsRef.current;
        const hasValidSkill = sks.some(s => String(s?.skillName || s?.name || '').trim() !== '');
        const completedSteps = [...(completedStepsRef.current || [])];
        let updatedCompletedSteps = null;
        if (hasValidSkill && !completedSteps.includes(4)) {
            updatedCompletedSteps = [...completedSteps, 4];
        } else if (!hasValidSkill && completedSteps.includes(4)) {
            updatedCompletedSteps = completedSteps.filter(step => step !== 4);
        }
        updateResumeDataRef.current({
            skills: sks,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    }, []);

    // Deterministic duplicate detection
    const nameCounts = new Map();
    skills.forEach(s => {
        const key = normalizeSkillName(s?.skillName || s?.name);
        if (key) nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
    });
    const duplicates = skills
        .map((s, index) => ({ skill: s, index, key: normalizeSkillName(s?.skillName || s?.name) }))
        .filter(item => item.key && (nameCounts.get(item.key) || 0) > 1);

    const hasSkills = skills.some(s => String(s?.skillName || s?.name || '').trim() !== '');

    // JD alignment — real engine output (MATCHED / PARTIAL / MISSING)
    const atsResult = calculateAtsScore(resumeData, { jobDescription: targetJd });
    const jdMatch = atsResult?.jdMatch;

    const getLevelText = (rating) => {
        if (rating >= 100) return 'Expert';
        if (rating >= 75) return 'Advanced';
        if (rating >= 50) return 'Intermediate';
        return 'Beginner';
    };

    return (
        <StepShell
            stepNumber={4}
            stepPath="skills"
            title={t('SkillsStep.title', 'Skills')}
            subtitle={t('SkillsStep.subtitle', 'The skills you actually used in your work — list them as they appear on your CVs, certificates, or project documentation.')}
            isComplete={hasSkills}
            statusBadge={skills.length > 0 ? `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}` : ''}
            resumeData={resumeData}
            targetJd={targetJd}
        >
            <div className="space-y-4">
                {/* Add skill */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleAddSkill(); }}
                        className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center"
                    >
                        <div className="flex-1 min-w-0">
                            <AutocompleteInputField
                                name="newSkillInput"
                                hideLabel
                                placeholder={getDynamicPlaceholder('skills', 'skill', candidateContext) || 'Type a skill you have used — press Enter to add'}
                                value={newSkillName}
                                onChange={(e) => setNewSkillName(e.target.value)}
                                suggestionType="skill"
                                context={candidateContext}
                                onSelect={(val) => handleAddSkill(val)}
                            />
                        </div>
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg shrink-0" role="group" aria-label="Proficiency level">
                            {PROFICIENCY_LEVELS.map(lvl => (
                                <button
                                    key={lvl.value}
                                    type="button"
                                    onClick={() => setNewSkillLevel(lvl.value)}
                                    aria-pressed={newSkillLevel === lvl.value}
                                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                                        newSkillLevel === lvl.value ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    {lvl.label}
                                </button>
                            ))}
                        </div>
                        <button
                            type="submit"
                            disabled={!newSkillName.trim()}
                            className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
                        >
                            <MdAdd className="w-4 h-4" />
                            Add
                        </button>
                    </form>

                    {ai.status !== 'loading' && (
                        <div className="border-t border-slate-100 pt-3">
                            <AiPromptCard
                                title="Suggest skills from your profile"
                                buttonLabel="Suggest from my experience"
                                evidenceHint="Looks at your work history, projects, and existing skills — suggestions stay suggestions until you add them."
                                status={ai.status}
                                result={ai.result}
                                error={ai.error?.message}
                                disabled={!aiReadiness.ok}
                                disabledReason={aiReadiness.reason}
                                onRun={runSkillIdeas}
                                onAccept={handleSkillAccept}
                                onDismiss={() => ai.reset()}
                            />
                        </div>
                    )}
                    {ai.status === 'loading' && (
                        <div className="border-t border-slate-100 pt-3">
                            <AiPromptCard title="Suggest skills from your profile" status="loading" />
                        </div>
                    )}
                </div>

                {/* JD alignment — real engine output */}
                {jdMatch && jdMatch.score !== null && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-sm font-bold text-slate-900">
                                Alignment with your target role
                                {candidateContext.target.role ? ` — ${candidateContext.target.role}` : ''}
                            </h2>
                            <span className="text-xs font-semibold text-slate-500">
                                {jdMatch.matched.length} matched · {jdMatch.partial?.length || 0} partial · {jdMatch.missing.length} missing
                            </span>
                        </div>
                        <p className="text-xs text-slate-500">
                            Matched means the term appears in your resume. Partial means part of a multi-word term appears —
                            consider whether the resume should use the full term, if it is true for you.
                        </p>
                        {jdMatch.matched.length > 0 && (
                            <div>
                                <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">Matched</h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {jdMatch.matched.slice(0, 12).map(term => (
                                        <span key={`m-${term}`} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                                            <MdCheckCircle className="w-3 h-3" />{term}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {(jdMatch.partial?.length || 0) > 0 && (
                            <div>
                                <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-1.5">Partial match</h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {jdMatch.partial.slice(0, 12).map(term => (
                                        <span key={`p-${term}`} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                                            {term}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {jdMatch.missing.length > 0 && (
                            <div>
                                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Not found in your resume</h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {jdMatch.missing.slice(0, 12).map(term => (
                                        <span key={`x-${term}`} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500">
                                            {term}
                                        </span>
                                    ))}
                                </div>
                                <p className="mt-1.5 text-[11px] text-slate-400">
                                    Add terms only if they are true for you — never pad the list.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Active skills */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-slate-900">Your skills ({skills.length})</h2>
                        {skills.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setSkills([])}
                                className="text-xs font-semibold text-slate-400 hover:text-rose-600 transition-colors"
                            >
                                Remove all
                            </button>
                        )}
                    </div>

                    {duplicates.length > 1 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1.5">
                            <p className="font-semibold">
                                Duplicate skills detected ({[...new Set(duplicates.map(d => d.skill.skillName))].join(', ')}).
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {duplicates.slice(1).map(({ skill }) => (
                                    <button
                                        key={`dup-${skill.id}`}
                                        type="button"
                                        onClick={() => removeSkill(skill.id)}
                                        className="rounded-md border border-amber-300 bg-white px-2 py-0.5 font-medium hover:bg-amber-100"
                                    >
                                        Remove “{skill.skillName}”
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {skills.length === 0 ? (
                        <p className="py-4 text-center text-sm text-slate-400">
                            No skills yet — add the first one above.
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {skills.map((skill) => {
                                const rating = Number.isFinite(Number(skill.rating)) ? Number(skill.rating) : 75;
                                return (
                                    <div
                                        key={skill.id}
                                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 pl-3 pr-1.5 py-1 shadow-2xs"
                                    >
                                        <span className="text-xs font-semibold text-slate-800">{skill.skillName || 'Unnamed skill'}</span>
                                        <select
                                            value={rating}
                                            onChange={(e) => updateSkillRating(skill.id, Number(e.target.value))}
                                            aria-label={`Proficiency for ${skill.skillName}`}
                                            title={`Proficiency: ${getLevelText(rating)}`}
                                            className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-semibold text-slate-600"
                                        >
                                            <option value={25}>Beg</option>
                                            <option value={50}>Int</option>
                                            <option value={75}>Adv</option>
                                            <option value={100}>Exp</option>
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => removeSkill(skill.id)}
                                            className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                            title="Remove skill"
                                            aria-label={`Remove ${skill.skillName}`}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </StepShell>
    );
};

export default SkillsStep;
