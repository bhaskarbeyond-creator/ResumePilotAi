import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MdAdd, MdClose } from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import Field from '../components/Field.jsx';
import AutocompleteInputField from './components/AutocompleteInputField';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { getCandidateContext } from '../../../utils/candidateContext';

const PROFICIENCY_LEVELS = [
    'Native / Bilingual',
    'Full Professional (Fluent)',
    'Professional Working (Advanced)',
    'Limited Working (Intermediate)',
    'Elementary (Basic)',
];

/**
 * Languages — minimal list + level select. Interests are a plain chip list.
 * No AI, no regional "recommended" language lists, no hobby suggestions —
 * the candidate's own words only.
 */
const LanguagesStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [languages, setLanguages] = useState(resumeData.languages || []);
    const [hobbies, setHobbies] = useState(Array.isArray(resumeData.hobbies) ? resumeData.hobbies : (resumeData.hobbies ? [resumeData.hobbies] : []));
    const [hobbyInput, setHobbyInput] = useState('');
    const idCounter = useRef(0);
    const candidateContext = getCandidateContext(resumeData, resumeData.targetJobDescription || '');

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
        setLanguages(prev => [...prev, newLang]);
    };

    const removeLanguage = (id) => {
        setLanguages(prev => prev.filter(lang => lang.id !== id && lang.date !== id));
    };

    const moveLanguage = (id, direction) => setLanguages(current => moveResumeItem(current, id, direction));

    const duplicateLanguage = (id) => setLanguages(current => {
        const source = current.find(item => item.id === id || item.date === id);
        return duplicateResumeItem(current, id, { name: `${source?.name || source?.language || 'Language'} (Copy)` });
    });

    const updateLanguage = (id, field, value) => {
        setLanguages(prev =>
            prev.map(lang => (lang.id === id || lang.date === id ? { ...lang, [field]: value } : lang))
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
        const hasValid = languages.some(l => String(l?.name || l?.language || l || '').trim() !== '');
        updateResumeData({ languages, hobbies });

        if (hasValid) {
            const completedSteps = [...(resumeData.completedSteps || [])];
            if (!completedSteps.includes(7)) {
                completedSteps.push(7);
                updateResumeData({ languages, hobbies, completedSteps });
            }
        } else {
            const completedSteps = [...(resumeData.completedSteps || [])];
            const updatedSteps = completedSteps.filter(step => step !== 7);
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

    const hasLanguages = languages.some(l => String(l?.name || l?.language || l || '').trim() !== '');

    return (
        <StepShell
            stepNumber={7}
            stepPath="languages"
            title={t('BuildResume.steps.languages', 'Languages')}
            subtitle={t('BuildResume.languages.subtitle', 'The languages you speak, at the level you are comfortable stating.')}
            isComplete={hasLanguages}
            statusBadge={languages.length > 0 ? `${languages.length} ${languages.length === 1 ? 'language' : 'languages'}` : ''}
            resumeData={resumeData}
            targetJd={resumeData.targetJobDescription || ''}
        >
            <div className="space-y-4">
                {/* Languages */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
                    <h2 className="text-sm font-bold text-slate-900">Languages you speak</h2>

                    {languages.length === 0 && (
                        <p className="text-sm text-slate-400">No languages yet — add the first one below.</p>
                    )}

                    {languages.map((lang, index) => {
                        const itemKey = lang.id || lang.date || `lang-${index}`;
                        const langName = lang.name || lang.language || '';
                        const langLevel = lang.level || 'Full Professional (Fluent)';
                        return (
                            <div key={itemKey} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                                <Field
                                    label={index === 0 ? 'Language' : undefined}
                                    placeholder="e.g. English, Hindi, German"
                                    value={langName}
                                    onChange={(e) => updateLanguage(itemKey, 'name', e.target.value)}
                                    name={`lang-name-${itemKey}`}
                                />
                                <div>
                                    <label htmlFor={`lang-level-${itemKey}`} className={index === 0 ? 'mb-1.5 block text-[13px] font-semibold text-slate-700' : 'sr-only'}>
                                        Level
                                    </label>
                                    <select
                                        id={`lang-level-${itemKey}`}
                                        value={langLevel}
                                        onChange={(e) => updateLanguage(itemKey, 'level', e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                                    >
                                        {PROFICIENCY_LEVELS.map(level => (
                                            <option key={level} value={level}>{level}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center gap-1 justify-self-end">
                                    <button
                                        type="button"
                                        onClick={() => moveLanguage(itemKey, -1)}
                                        disabled={index === 0}
                                        aria-label="Move language up"
                                        className="p-1.5 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                        title="Move up"
                                    >↑</button>
                                    <button
                                        type="button"
                                        onClick={() => moveLanguage(itemKey, 1)}
                                        disabled={index === languages.length - 1}
                                        aria-label="Move language down"
                                        className="p-1.5 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                        title="Move down"
                                    >↓</button>
                                    <button
                                        type="button"
                                        onClick={() => removeLanguage(itemKey)}
                                        aria-label="Remove language"
                                        className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                        title="Remove"
                                    >
                                        <MdClose className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    <button
                        type="button"
                        onClick={() => addLanguage()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 hover:border-indigo-400 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-700 transition-colors"
                    >
                        <MdAdd className="w-3.5 h-3.5" />
                        Add a language
                    </button>
                </div>

                {/* Interests */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
                    <h2 className="text-sm font-bold text-slate-900">Interests & activities</h2>
                    <p className="text-xs text-slate-500">Optional. Only ones you would happily discuss in an interview.</p>

                    <div className="flex gap-2">
                        <div className="flex-1">
                            <AutocompleteInputField
                                hideLabel
                                name="hobbyInput"
                                placeholder="Type an activity and press Enter"
                                value={hobbyInput}
                                onChange={(e) => setHobbyInput(e.target.value)}
                                onSelect={(val) => { addHobby(val); setHobbyInput(''); }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addHobby();
                                    }
                                }}
                                suggestionType="hobby"
                                context={candidateContext}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => addHobby()}
                            disabled={!String(hobbyInput || '').trim()}
                            className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
                        >
                            <MdAdd className="w-4 h-4" />
                            Add
                        </button>
                    </div>

                    {hobbies.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {hobbies.map((h, idx) => {
                                const name = typeof h === 'string' ? h : (h.name || h.hobby || '');
                                return (
                                    <span
                                        key={`${name}-${idx}`}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 pl-3 pr-2 py-1 text-xs font-semibold text-slate-800"
                                    >
                                        <span>{name}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeHobby(idx)}
                                            className="text-slate-400 hover:text-rose-600 transition-colors"
                                            title="Remove"
                                            aria-label={`Remove ${name}`}
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
        </StepShell>
    );
};

export default LanguagesStep;
