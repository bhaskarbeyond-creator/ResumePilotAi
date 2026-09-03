import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    MdDelete, 
    MdAdd, 
    MdTranslate, 
    MdLanguage, 
    MdSportsSoccer, 
    MdClose,
    MdContentCopy,
    MdArrowUpward,
    MdArrowDownward 
} from 'react-icons/md';
import InputField from './components/InputField';
import AutocompleteInputField from './components/AutocompleteInputField';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import StepWorkspaceLayout from '../components/StepWorkspaceLayout';
import { getCandidateContext } from '../../../utils/candidateContext';
import QuickAddCommandBar from '../components/QuickAddCommandBar';
import TrackGuidanceBanner from '../components/TrackGuidanceBanner';

const REGIONAL_LANGUAGES = {
    IN: ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Marathi', 'Bengali', 'Gujarati'],
    US: ['English', 'Spanish', 'French', 'Mandarin Chinese', 'German', 'Tagalog', 'Vietnamese', 'Arabic'],
    CA: ['English', 'French', 'Mandarin Chinese', 'Cantonese', 'Spanish', 'Punjabi', 'Arabic', 'German'],
    UK: ['English', 'French', 'German', 'Spanish', 'Polish', 'Italian', 'Urdu', 'Arabic'],
    EU: ['English', 'German', 'French', 'Spanish', 'Italian', 'Dutch', 'Polish', 'Portuguese'],
    ME: ['English', 'Arabic', 'French', 'Urdu', 'Hindi', 'Turkish', 'Farsi', 'German'],
    GLOBAL: ['English', 'Spanish', 'French', 'German', 'Mandarin Chinese', 'Arabic', 'Portuguese', 'Japanese']
};

const getRegionalLanguageList = (regionCode = 'GLOBAL') => {
    return REGIONAL_LANGUAGES[regionCode] || REGIONAL_LANGUAGES.GLOBAL;
};

const POPULAR_HOBBIES = [
    'Open Source Contributor',
    'Technical Blogging',
    'Chess',
    'Photography',
    'Marathon Running',
    'Mentorship',
    'Hiking',
    'Podcasting',
];

const PROFICIENCY_LEVELS = [
    'Native / Bilingual',
    'Full Professional (Fluent)',
    'Professional Working (Advanced)',
    'Limited Working (Intermediate)',
    'Elementary (Basic)',
];

const getProficiencyMetric = (level) => {
    switch (level) {
        case 'Native / Bilingual': return { pct: 100, label: 'Native', color: 'bg-emerald-500' };
        case 'Full Professional (Fluent)': return { pct: 90, label: 'Fluent', color: 'bg-indigo-500' };
        case 'Professional Working (Advanced)': return { pct: 75, label: 'Advanced', color: 'bg-indigo-400' };
        case 'Limited Working (Intermediate)': return { pct: 50, label: 'Intermediate', color: 'bg-amber-400' };
        case 'Elementary (Basic)': return { pct: 25, label: 'Basic', color: 'bg-amber-300' };
        default: return { pct: 85, label: 'Fluent', color: 'bg-indigo-500' };
    }
};

const LanguagesStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [languages, setLanguages] = useState(resumeData.languages || []);
    const [hobbies, setHobbies] = useState(Array.isArray(resumeData.hobbies) ? resumeData.hobbies : (resumeData.hobbies ? [resumeData.hobbies] : []));
    const [hobbyInput, setHobbyInput] = useState('');
    const idCounter = useRef(0);

    useEffect(() => {
        if (resumeData.languages && Array.isArray(resumeData.languages)) {
            setLanguages(resumeData.languages);
        }
        if (resumeData.hobbies) {
            setHobbies(Array.isArray(resumeData.hobbies) ? resumeData.hobbies : [resumeData.hobbies]);
        }
    }, [resumeData.languages, resumeData.hobbies]);

    const createNewLanguage = (name = '', level = 'Full Professional (Fluent)') => {
        idCounter.current += 1;
        return {
            id: `lang_${Date.now()}_${idCounter.current}`,
            name,
            level,
            date: languages.length + 1,
        };
    };

    const addLanguage = (name = '', level = 'Full Professional (Fluent)') => {
        const newLang = createNewLanguage(name, level);
        setLanguages((prev) => [...prev, newLang]);
    };

    const removeLanguage = (id) => {
        setLanguages((prev) => prev.filter((lang) => lang.id !== id && lang.date !== id));
    };

    const moveLanguage = (id, direction) => setLanguages(current => moveResumeItem(current, id, direction));

    const duplicateLanguage = (id) => setLanguages(current => {
        const source = current.find(item => item.id === id || item.date === id);
        return duplicateResumeItem(current, id, { name: `${source?.name || source?.language || 'Language'} (Copy)` });
    });

    const updateLanguage = (id, field, value) => {
        setLanguages((prev) =>
            prev.map((lang) => (lang.id === id || lang.date === id ? { ...lang, [field]: value } : lang))
        );
    };

    const addHobby = (hobbyName) => {
        const trimmed = String(hobbyName || hobbyInput || '').trim();
        if (!trimmed) return;
        const exists = hobbies.some(h => {
            const val = typeof h === 'string' ? h : (h?.name || h?.hobby || '');
            return val.toLowerCase() === trimmed.toLowerCase();
        });
        if (!exists) {
            setHobbies(prev => [...prev, trimmed]);
            setHobbyInput('');
        }
    };

    const removeHobby = (index) => {
        setHobbies(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        const hasValid = languages.some((l) => String(l?.name || l?.language || l || '').trim() !== '');
        updateResumeData({ languages, hobbies });

        if (hasValid) {
            const completedSteps = [...(resumeData.completedSteps || [])];
            if (!completedSteps.includes(7)) {
                completedSteps.push(7);
                updateResumeData({ languages, hobbies, completedSteps });
            }
        } else {
            const completedSteps = [...(resumeData.completedSteps || [])];
            const updatedSteps = completedSteps.filter((step) => step !== 7 && step !== 8);
            if (updatedSteps.length !== completedSteps.length) {
                updateResumeData({ languages, hobbies, completedSteps: updatedSteps });
            }
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);
        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [languages, hobbies]);

    const candidateContext = getCandidateContext(resumeData);
    const regionCode = candidateContext.geography?.region || 'GLOBAL';
    const regionalLanguages = getRegionalLanguageList(regionCode);

    const existingNames = languages.map((l) => (l.name || l.language || '').toLowerCase());
    const availablePills = regionalLanguages.filter((p) => !existingNames.includes(p.toLowerCase()));

    const existingHobbies = hobbies.map(h => (typeof h === 'string' ? h : (h.name || h.hobby || '')).toLowerCase());
    const availableHobbyPills = POPULAR_HOBBIES.filter(p => !existingHobbies.includes(p.toLowerCase()));

    const hasLanguages = languages.some((l) => String(l?.name || l?.language || l || '').trim() !== '');

    const handleQuickAddAction = (actionId) => {
        switch (actionId) {
            case 'add-hobby':
                document.querySelector('input[name="hobbyInput"]')?.focus();
                break;
            case 'add-lang':
            default:
                addLanguage();
                break;
        }
    };

    return (
        <StepWorkspaceLayout
            stepNumber={7}
            stepPath="languages"
            title={t('BuildResume.steps.languages', 'Languages & Activities')}
            subtitle={t('BuildResume.languages.subtitle', 'Specify the languages you speak, proficiency ratings, and extracurricular pursuits.')}
            isComplete={hasLanguages}
            statusBadge={`${languages.length} Language${languages.length === 1 ? '' : 's'}`}
            resumeData={resumeData}
            onNavigate={onNavigate}
        >
            <div className="space-y-3">
                {/* Command Bar: Contextual Quick-Add Actions (Always Available) */}
                <QuickAddCommandBar
                    stepPath="languages"
                    onAction={handleQuickAddAction}
                />

                {/* Unified High-Density Editor Panel */}
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 space-y-4">
                    {/* Block 1: Languages */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                            <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                <MdTranslate className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Languages & Fluency Levels</span>
                            </h2>
                            <span className="text-[10px] font-bold text-slate-400">
                                {regionCode === 'IN' ? 'India' : regionCode === 'US' ? 'North America' : regionCode === 'UK' || regionCode === 'EU' ? 'Europe' : 'International'} Focus
                            </span>
                        </div>

                        {/* Quick-Add Language Pills */}
                        {availablePills.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 items-center">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                                    Quick Add:
                                </span>
                                {availablePills.slice(0, 6).map((lang) => (
                                    <button
                                        key={lang}
                                        type="button"
                                        onClick={() => addLanguage(lang)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/60 text-slate-700 hover:text-indigo-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                                    >
                                        <MdAdd className="w-3 h-3 text-slate-400" />
                                        <span>{lang}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Language Entries */}
                        {languages.length === 0 ? (
                            <div className="p-4 sm:p-5 rounded-xl border border-slate-200/90 bg-slate-50/50 space-y-3.5">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                                            <MdLanguage className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-bold text-slate-900">Regional Language Recommendations</h3>
                                            <p className="text-[11px] text-slate-500">Select spoken and written languages relevant to your background</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => addLanguage()}
                                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs shrink-0"
                                    >
                                        + Blank
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {regionalLanguages.slice(0, 8).map((langName) => (
                                        <button
                                            key={langName}
                                            type="button"
                                            onClick={() => addLanguage(langName, 'Full Professional (Fluent)')}
                                            className="p-2 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-left transition-all cursor-pointer shadow-2xs group"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{langName}</span>
                                                <span className="text-[10px] font-extrabold text-indigo-600">+</span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 block truncate">Add Fluent</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {languages.map((lang, index) => {
                                    const itemKey = lang.id || lang.date || `lang-${index}`;
                                    const langName = lang.name || lang.language || '';
                                    const langLevel = lang.level || 'Full Professional (Fluent)';
                                    const prof = getProficiencyMetric(langLevel);

                                    return (
                                        <div
                                            key={itemKey}
                                            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 bg-slate-50/70 border border-slate-200/90 rounded-xl hover:border-slate-300 transition-all"
                                        >
                                            <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                                                <input
                                                    type="text"
                                                    value={langName}
                                                    onChange={(e) => updateLanguage(itemKey, 'name', e.target.value)}
                                                    placeholder="Language (e.g. English, Telugu, Hindi)"
                                                    className="flex-1 min-w-0 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-600"
                                                />
                                                <select
                                                    value={langLevel}
                                                    onChange={(e) => updateLanguage(itemKey, 'level', e.target.value)}
                                                    className="sm:w-52 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-600"
                                                >
                                                    {PROFICIENCY_LEVELS.map((lvl) => (
                                                        <option key={lvl} value={lvl}>
                                                            {lvl}
                                                        </option>
                                                    ))}
                                                </select>
                                                {/* Visual Proficiency Meter */}
                                                <div className="flex items-center gap-2 sm:w-28 shrink-0 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80">
                                                    <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                        <div className={`h-full ${prof.color} transition-all duration-300`} style={{ width: `${prof.pct}%` }} />
                                                    </div>
                                                    <span className="text-[10px] font-extrabold text-slate-600 shrink-0">{prof.pct}%</span>
                                                </div>
                                            </div>

                                            {/* Reorder and Delete */}
                                            <div className="flex items-center gap-0.5 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => moveLanguage(itemKey, -1)}
                                                    disabled={index === 0}
                                                    aria-label="Move language up"
                                                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                                >
                                                    <MdArrowUpward className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => moveLanguage(itemKey, 1)}
                                                    disabled={index === languages.length - 1}
                                                    aria-label="Move language down"
                                                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                                >
                                                    <MdArrowDownward className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => duplicateLanguage(itemKey)}
                                                    aria-label="Duplicate language"
                                                    className="p-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                                                >
                                                    <MdContentCopy className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeLanguage(itemKey)}
                                                    aria-label="Remove language"
                                                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                                >
                                                    <MdDelete className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                                <button
                                    type="button"
                                    onClick={() => addLanguage()}
                                    className="w-full h-9 border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-xl text-xs font-bold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                                >
                                    <MdAdd className="w-3.5 h-3.5" />
                                    <span>Add Another Language</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Block 2: Activities & Interests */}
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                <MdSportsSoccer className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Interests & Personal Pursuits</span>
                            </h3>
                            <span className="text-[10px] font-bold text-slate-400">Optional Culture Fit</span>
                        </div>

                        {/* Quick-Add Hobby Pills */}
                        {availableHobbyPills.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 items-center">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                                    Quick Add:
                                </span>
                                {availableHobbyPills.slice(0, 6).map((hobby) => (
                                    <button
                                        key={hobby}
                                        type="button"
                                        onClick={() => addHobby(hobby)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/60 text-slate-700 hover:text-indigo-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                                    >
                                        <MdAdd className="w-3 h-3 text-slate-400" />
                                        <span>{hobby}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Hobby Input */}
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <AutocompleteInputField
                                    hideLabel
                                    name="hobbyInput"
                                    value={hobbyInput}
                                    onChange={(e) => setHobbyInput(e.target.value)}
                                    onSelect={(val) => {
                                        addHobby(val);
                                        setHobbyInput('');
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            addHobby();
                                        }
                                    }}
                                    placeholder="Type an activity (e.g. Community Volunteering, Marathon Running, Chess)..."
                                    suggestionType="hobby"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => addHobby()}
                                disabled={!String(hobbyInput || '').trim()}
                                className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-indigo-600 disabled:opacity-40 disabled:hover:bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs shrink-0"
                            >
                                <MdAdd className="w-4 h-4" />
                                <span>Add</span>
                            </button>
                        </div>

                        {/* Active Hobbies Cloud */}
                        {hobbies.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {hobbies.map((h, idx) => {
                                    const name = typeof h === 'string' ? h : (h.name || h.hobby || '');
                                    return (
                                        <span
                                            key={idx}
                                            className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 bg-slate-50 border border-slate-200/90 text-slate-800 rounded-xl text-xs font-bold shadow-2xs hover:border-slate-300 transition-all"
                                        >
                                            <span>{name}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeHobby(idx)}
                                                className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                                title="Remove"
                                            >
                                                <MdClose className="w-3.5 h-3.5" />
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </StepWorkspaceLayout>
    );
};

export default LanguagesStep;
