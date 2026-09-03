import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    MdDelete, 
    MdAdd, 
    MdCheck, 
    MdLightbulb, 
    MdStars,
    MdAutoAwesome
} from 'react-icons/md';
import AutocompleteInputField from './components/AutocompleteInputField';
import { generateUserAiContent, cleanSkillName } from '../../../services/aiService';
import StepWorkspaceLayout from '../components/StepWorkspaceLayout';
import { getCandidateContext } from '../../../utils/candidateContext';
import QuickAddCommandBar from '../components/QuickAddCommandBar';

const PROFICIENCY_LEVELS = [
    { label: 'Beginner', value: 25 },
    { label: 'Intermediate', value: 50 },
    { label: 'Advanced', value: 75 },
    { label: 'Expert', value: 100 },
];

const SkillsStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [skills, setSkills] = useState(resumeData.skills || []);

    const candidateContext = getCandidateContext(resumeData);
    const skillCategories = candidateContext.skillCategories || [];

    useEffect(() => {
        if (resumeData.skills && Array.isArray(resumeData.skills)) {
            setSkills(resumeData.skills);
        }
    }, [resumeData.skills]);

    const [newSkillName, setNewSkillName] = useState('');
    const [newSkillLevel, setNewSkillLevel] = useState(75); // default Advanced
    const [isGeneratingSkills, setIsGeneratingSkills] = useState(false);
    const [popularSkills, setPopularSkills] = useState([]);
    const [skillsError, setSkillsError] = useState('');
    const idCounter = useRef(0);
    const aiRequestControllerRef = useRef(null);

    useEffect(() => () => { 
        const controller = aiRequestControllerRef.current; 
        aiRequestControllerRef.current = null; 
        controller?.abort(); 
    }, []);

    const createNewSkill = (name = '', rating = 75) => {
        idCounter.current += 1;
        return {
            id: `skill_${Date.now()}_${idCounter.current}`,
            skillName: cleanSkillName(name) || name,
            rating: Number.isFinite(rating) ? rating : 75,
        };
    };

    const isSkillAlreadyAdded = (name) => {
        const normalized = String(name || '').trim().toLowerCase();
        return skills.some(s => String(s?.skillName || s?.name || '').trim().toLowerCase() === normalized);
    };

    const handleAddSkill = (nameToAdd, ratingToAdd) => {
        const raw = nameToAdd || newSkillName;
        const cleaned = cleanSkillName(raw);
        if (!cleaned || cleaned.trim() === '') return;

        // Prevent exact duplicates
        const normalized = cleaned.trim().toLowerCase();
        if (skills.some(s => String(s?.skillName || s?.name || '').trim().toLowerCase() === normalized)) {
            setNewSkillName('');
            return;
        }

        const rating = ratingToAdd !== undefined ? ratingToAdd : newSkillLevel;
        const newSkill = createNewSkill(cleaned, rating);
        setSkills(prev => [...prev, newSkill]);
        setNewSkillName('');
    };

    const removeSkill = (id) => {
        setSkills(prev => prev.filter(skill => skill.id !== id));
    };

    const updateSkillRating = (id, newRating) => {
        setSkills(prev => prev.map(skill => skill.id === id ? { ...skill, rating: newRating } : skill));
    };

    const generateAISkills = async () => {
        const targetOccupation = String(resumeData.occupation || resumeData.employments?.[0]?.jobTitle || '').trim();
        if (!targetOccupation) {
            setPopularSkills([]);
            setSkillsError('Enter your target occupation in Step 1 before requesting skill recommendations.');
            return;
        }

        aiRequestControllerRef.current?.abort();
        const requestController = new AbortController();
        aiRequestControllerRef.current = requestController;
        setIsGeneratingSkills(true);
        setSkillsError('');
        try {
            const currentLanguage = localStorage.getItem('i18nextLng') || 'en';
            const existingSkillsList = skills.map(skill => String(skill.skillName || skill.name || '').trim()).filter(Boolean);
            const data = await generateUserAiContent('generate-skills', {
                occupation: targetOccupation,
                jobTitle: targetOccupation,
                existingSkills: existingSkillsList,
                language: currentLanguage,
                context: candidateContext,
            }, { signal: requestController.signal });

            const suggested = Array.isArray(data?.skills)
                ? data.skills.map(s => typeof s === 'string' ? cleanSkillName(s) : cleanSkillName(s.skillName || s.name)).filter(Boolean)
                : [];
            setPopularSkills(suggested);
        } catch (err) {
            if (err?.name === 'AbortError') return;
            setSkillsError(err?.message || 'Failed to fetch recommendations. Please try again.');
        } finally {
            setIsGeneratingSkills(false);
        }
    };

    const handleSave = () => {
        updateResumeData({ skills });

        const hasValidSkill = skills.some(s => String(s?.skillName || s?.name || '').trim() !== '');
        const completedSteps = [...(resumeData.completedSteps || [])];
        if (hasValidSkill && !completedSteps.includes(4)) {
            updateResumeData({ skills, completedSteps: [...completedSteps, 4] });
        } else if (!hasValidSkill && (completedSteps.includes(4) || completedSteps.includes(5))) {
            updateResumeData({ skills, completedSteps: completedSteps.filter(step => step !== 4 && step !== 5) });
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);
        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [skills]);

    // Compute unadded skill pills so already-added skills are never recommended again (Antigravity Rule)
    const existingSkillNames = new Set(
        skills.map(s => String(s?.skillName || s?.name || '').trim().toLowerCase()).filter(Boolean)
    );
    const availableSkills = popularSkills.filter(
        suggestedSkill => !existingSkillNames.has(String(suggestedSkill || '').trim().toLowerCase())
    );

    const hasSkills = skills.some(s => String(s?.skillName || s?.name || s || '').trim() !== '');

    const getLevelBadgeClass = (rating) => {
        if (rating >= 100) return 'bg-purple-100 text-purple-700 border-purple-200';
        if (rating >= 75) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        if (rating >= 50) return 'bg-blue-100 text-blue-700 border-blue-200';
        return 'bg-amber-100 text-amber-700 border-amber-200';
    };

    const getLevelText = (rating) => {
        if (rating >= 100) return 'Expert';
        if (rating >= 75) return 'Advanced';
        if (rating >= 50) return 'Intermediate';
        return 'Beginner';
    };

    const handleQuickAddAction = (actionId) => {
        switch (actionId) {
            case 'ai-suggest-skills':
            case 'ai-match-jd':
                generateAISkills();
                break;
            case 'add-category':
            case 'focus-input':
            default:
                document.querySelector('input[name="newSkillInput"]')?.focus();
                break;
        }
    };

    return (
        <StepWorkspaceLayout
            stepNumber={4}
            stepPath="skills"
            title={t('SkillsStep.title', 'Core Skills & Competencies')}
            subtitle={t('SkillsStep.subtitle', 'List technical tools, industry frameworks, and core professional competencies.')}
            isComplete={hasSkills}
            statusBadge={`${skills.length} Skill${skills.length === 1 ? '' : 's'}`}
            resumeData={resumeData}
            onNavigate={onNavigate}
        >
            <div className="space-y-3">
                {/* Command Bar: Contextual Quick-Add Actions (Always Available) */}
                <QuickAddCommandBar
                    stepPath="skills"
                    onAction={handleQuickAddAction}
                    isAiLoading={isGeneratingSkills}
                />

                {/* Unified High-Density Skill Studio Panel */}
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 space-y-4">
                    {/* Block 1: Fast Quick-Add Toolbar */}
                    <div>
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 mb-2.5">
                            <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                                Add Technical & Domain Skills
                            </h2>
                            <span className="text-[10px] font-bold text-slate-400">Target: 8–15 Skills</span>
                        </div>

                        <form 
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleAddSkill();
                            }}
                            className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center"
                        >
                            <div className="flex-1 min-w-0">
                                <AutocompleteInputField
                                    name="newSkillInput"
                                    placeholder={`Type a skill (e.g. ${skillCategories[0]?.skills?.slice(0, 3).join(', ') || 'Project Management, Data Analysis, Leadership'})...`}
                                    value={newSkillName}
                                    onChange={(e) => setNewSkillName(e.target.value)}
                                    suggestionType="skill"
                                    context={candidateContext}
                                    onSelect={(val) => {
                                        setNewSkillName(val);
                                        handleAddSkill(val);
                                    }}
                                />
                            </div>

                            {/* Proficiency Selector */}
                            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
                                {PROFICIENCY_LEVELS.map(lvl => (
                                    <button
                                        key={lvl.value}
                                        type="button"
                                        onClick={() => setNewSkillLevel(lvl.value)}
                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                            newSkillLevel === lvl.value 
                                                ? 'bg-white text-slate-900 shadow-2xs' 
                                                : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        {lvl.label}
                                    </button>
                                ))}
                            </div>

                            {/* Add Button */}
                            <button
                                type="submit"
                                disabled={!newSkillName.trim()}
                                className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-indigo-600 disabled:opacity-40 disabled:hover:bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs shrink-0"
                            >
                                <MdAdd className="w-4 h-4" />
                                <span>Add</span>
                            </button>
                        </form>
                    </div>

                    {/* Block 2: Domain-Aware Intelligence & Fast Suggestion Bar */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                                {candidateContext.domainLabel} Quick Add (1-Click)
                            </h3>
                            <span className="text-[10px] text-slate-400 font-medium">Auto-deduplicated</span>
                        </div>

                        {/* Domain Pills Grid */}
                        <div className="space-y-2">
                            <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2">
                                {(skillCategories.length > 0 ? skillCategories : [
                                    { name: 'Core Professional', skills: ['Strategic Planning', 'Project Management', 'Process Improvement', 'Cross-Functional Leadership'] },
                                    { name: 'Operational & Analytical', skills: ['Data Analysis', 'Performance Metrics', 'Quality Assurance', 'Resource Allocation'] },
                                    { name: 'Communication & Leadership', skills: ['Stakeholder Management', 'Team Leadership', 'Negotiation', 'Change Management'] },
                                ]).map((category, idx) => {
                                    const badgeStyles = [
                                        'text-indigo-700 bg-indigo-50 border-indigo-100',
                                        'text-purple-700 bg-purple-50 border-purple-100',
                                        'text-emerald-700 bg-emerald-50 border-emerald-100',
                                    ];
                                    const badgeStyle = badgeStyles[idx % badgeStyles.length];
                                    const unaddedSkills = category.skills.filter(s => !isSkillAlreadyAdded(s));
                                    if (unaddedSkills.length === 0) return null;

                                    return (
                                        <div key={category.name || `cat_${idx}`} className="flex items-center gap-1.5 flex-wrap">
                                            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${badgeStyle}`}>
                                                {category.name}:
                                            </span>
                                            {unaddedSkills.map((s, sIdx) => (
                                                <button
                                                    key={`${category.name || idx}_${s}_${sIdx}`}
                                                    type="button"
                                                    onClick={() => handleAddSkill(s, 75)}
                                                    className="px-2 py-0.5 text-[10px] font-bold bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 rounded-md border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                                                >
                                                    + {s}
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Block 3: Optimal ATS Keyword Density Bar */}
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-slate-700">ATS Keyword Density:</span>
                            <span className={skills.length >= 8 && skills.length <= 18 ? 'text-emerald-700' : 'text-amber-700'}>
                                {skills.length} / 16 Optimal Skills {skills.length >= 8 && skills.length <= 18 ? '(✓ Optimal)' : '(Aim for 8–16)'}
                            </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all duration-300 ${
                                    skills.length >= 8 && skills.length <= 18 ? 'bg-emerald-500' : 'bg-amber-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.round((skills.length / 16) * 100))}%` }}
                            />
                        </div>
                    </div>

                    {/* Block 3: Active Skills Cloud */}
                    <div>
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 mb-2.5">
                            <div className="flex items-center gap-2">
                                <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                                    Active Skills ({skills.length})
                                </h3>
                                {skills.length >= 8 && (
                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                        ✓ ATS Keyword Ready
                                    </span>
                                )}
                            </div>
                            {skills.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setSkills([])}
                                    className="text-[10px] font-bold text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                >
                                    Clear All
                                </button>
                            )}
                        </div>

                        {skills.length === 0 ? (
                            <div className="py-6 text-center space-y-2 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                <MdStars className="w-8 h-8 text-slate-400 mx-auto" />
                                <p className="text-xs font-bold text-slate-700">No skills added yet</p>
                                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                                    Type skills above or select 1-click recommendations below to match recruiter ATS keyword searches.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {skills.map((skill) => {
                                    const rating = skill.rating || 75;
                                    return (
                                        <div
                                            key={skill.id}
                                            className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1 rounded-xl bg-slate-50 border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all group"
                                        >
                                            <span className="text-xs font-bold text-slate-800">
                                                {skill.skillName || 'Unnamed Skill'}
                                            </span>

                                            {/* Interactive Proficiency Toggle */}
                                            <select
                                                value={rating}
                                                onChange={(e) => updateSkillRating(skill.id, Number(e.target.value))}
                                                className={`text-[10px] font-extrabold border px-1.5 py-0.5 rounded cursor-pointer ${getLevelBadgeClass(rating)}`}
                                                title="Change proficiency level"
                                            >
                                                <option value={25}>Beg</option>
                                                <option value={50}>Int</option>
                                                <option value={75}>Adv</option>
                                                <option value={100}>Exp</option>
                                            </select>

                                            {/* Remove Button */}
                                            <button
                                                type="button"
                                                onClick={() => removeSkill(skill.id)}
                                                className="w-5 h-5 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                                title="Remove skill"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Block 3: AI Skill Recommendations (Strict Freeze Guaranteed) */}
                    <div className="pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                            <div>
                                <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                    <MdAutoAwesome className="w-3.5 h-3.5 text-purple-600" />
                                    <span>Role-Based Skill Suggestions</span>
                                </h3>
                                <p className="text-[10px] text-slate-500">
                                    {resumeData.occupation 
                                        ? `Tailored keywords for: ${resumeData.occupation}` 
                                        : 'Set your target job title in Step 1 to unlock personalized suggestions'}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={generateAISkills}
                                disabled={isGeneratingSkills || !resumeData.occupation}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                                    isGeneratingSkills
                                        ? 'bg-slate-100 text-slate-400 cursor-wait'
                                        : !resumeData.occupation
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/80 cursor-pointer shadow-2xs'
                                }`}
                            >
                                <MdLightbulb className="w-3.5 h-3.5 text-purple-600" />
                                <span>{isGeneratingSkills ? 'Discovering...' : 'Get Skill Ideas'}</span>
                            </button>
                        </div>

                        {skillsError && (
                            <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200 mb-2">
                                {skillsError}
                            </p>
                        )}

                        {/* Suggested Pills Grid */}
                        {popularSkills.length > 0 && availableSkills.length === 0 && !isGeneratingSkills && (
                            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-xs">
                                    <MdCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                                    All suggested skills from this batch have been added!
                                </span>
                                <button
                                    type="button"
                                    onClick={generateAISkills}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                                >
                                    Get More
                                </button>
                            </div>
                        )}

                        {availableSkills.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {availableSkills.slice(0, 18).map((suggested, sIdx) => (
                                    <button
                                        key={`${suggested}_${sIdx}`}
                                        type="button"
                                        onClick={() => handleAddSkill(suggested, 75)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/60 text-slate-700 hover:text-indigo-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                                    >
                                        <MdAdd className="w-3 h-3 text-slate-400 group-hover:text-indigo-600" />
                                        <span>{suggested}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </StepWorkspaceLayout>
    );
};

export default SkillsStep;
