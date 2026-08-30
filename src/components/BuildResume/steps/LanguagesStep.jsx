import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MdDelete, MdAdd, MdTranslate, MdLanguage, MdSportsSoccer, MdClose } from 'react-icons/md';
import InputField from './components/InputField';
import AutocompleteInputField from './components/AutocompleteInputField';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';

const POPULAR_LANGUAGES = [
    'English',
    'Spanish',
    'French',
    'German',
    'Mandarin',
    'Hindi',
    'Arabic',
    'Portuguese',
    'Italian',
    'Japanese',
    'Russian',
    'Korean',
    'Dutch',
];

const POPULAR_HOBBIES = [
    'Photography',
    'Chess',
    'Marathon Running',
    'Open Source Contributor',
    'Reading',
    'Hiking',
    'Writing & Blogging',
    'Volunteering',
    'Traveling',
    'Podcasting',
    'Music Production',
    'Cooking',
];

const PROFICIENCY_LEVELS = [
    'Native / Bilingual',
    'Full Professional (Fluent)',
    'Professional Working (Advanced)',
    'Limited Working (Intermediate)',
    'Elementary (Basic)',
];

const LanguagesStep = ({ resumeData, updateResumeData }) => {
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

    const createNewLanguage = (name = '', level = '') => {
        idCounter.current += 1;
        return {
            id: `lang_${Date.now()}_${idCounter.current}`,
            name,
            level,
            date: languages.length + 1,
        };
    };

    const addLanguage = (name = '', level = '') => {
        const newLang = createNewLanguage(name, level);
        setLanguages((prev) => [...prev, newLang]);
    };

    const removeLanguage = (id) => {
        setLanguages((prev) => prev.filter((lang) => lang.id !== id && lang.date !== id));
    };

    const moveLanguage = (id, direction) => setLanguages(current => moveResumeItem(current, id, direction));

    const duplicateLanguage = id => setLanguages(current => {
        const source = current.find(item => item.id === id || item.date === id);
        return duplicateResumeItem(current, id, { name: `${source?.name || source?.language || 'Language'} (Copy)` });
    });

    const updateLanguage = (id, field, value) => {
        setLanguages((prev) =>
            prev.map((lang) => (lang.id === id || lang.date === id ? { ...lang, [field]: value } : lang))
        );
    };

    const addHobby = (hobbyName) => {
        const trimmed = (hobbyName || hobbyInput).trim();
        if (!trimmed) return;
        const exists = hobbies.some(h => {
            const val = typeof h === 'string' ? h : (h.name || h.hobby || '');
            return val.toLowerCase() === trimmed.toLowerCase();
        });
        if (!exists) {
            setHobbies(prev => [...prev, trimmed]);
        }
        setHobbyInput('');
    };

    const removeHobby = (index) => {
        setHobbies(prev => prev.filter((_, idx) => idx !== index));
    };

    const handleSave = () => {
        updateResumeData({ languages, hobbies });

        const validLangs = languages.filter((lang) => (lang.name || lang.language || '').trim() !== '');

        if (validLangs.length > 0 || hobbies.length > 0) {
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

    const existingNames = languages.map((l) => (l.name || l.language || '').toLowerCase());
    const availablePills = POPULAR_LANGUAGES.filter((p) => !existingNames.includes(p.toLowerCase()));

    const existingHobbies = hobbies.map(h => (typeof h === 'string' ? h : (h.name || h.hobby || '')).toLowerCase());
    const availableHobbyPills = POPULAR_HOBBIES.filter(p => !existingHobbies.includes(p.toLowerCase()));

    return (
        <div className="px-4 py-6 max-w-6xl mx-auto w-full min-h-full space-y-8">
            {/* 1. Languages Section */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
                <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm">
                            8
                        </div>
                        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <MdTranslate className="w-6 h-6 text-blue-600" />
                            {t('BuildResume.steps.languages', 'Languages')}
                        </h1>
                    </div>
                    <p className="text-slate-600 text-sm">
                        {t('BuildResume.languages.subtitle', 'Add the languages you speak and your proficiency level.')}
                    </p>
                </div>

                {/* Popular Language Quick-Add Pills */}
                {availablePills.length > 0 && (
                    <div className="mb-6">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            {t('BuildResume.languages.suggested', 'Quick Add Popular Languages')}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {availablePills.slice(0, 8).map((lang) => (
                                <button
                                    key={lang}
                                    type="button"
                                    onClick={() => addLanguage(lang)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 rounded-full text-xs font-medium text-slate-700 transition-all cursor-pointer"
                                >
                                    <MdAdd className="w-3.5 h-3.5" />
                                    {lang}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Languages List */}
                <div className="space-y-4 mb-6">
                    {languages.length === 0 ? (
                        <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                            <MdLanguage className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                            <p className="text-sm font-medium text-slate-600 mb-1">
                                {t('BuildResume.languages.emptyTitle', 'No languages added yet')}
                            </p>
                            <p className="text-xs text-slate-600 mb-4 max-w-sm mx-auto">
                                {t('BuildResume.languages.emptyDescription', 'Showcase your multilingual abilities to stand out in global hiring.')}
                            </p>
                            <button
                                type="button"
                                onClick={() => addLanguage()}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                            >
                                <MdAdd className="w-4 h-4" />
                                {t('BuildResume.languages.addFirst', 'Add Your First Language')}
                            </button>
                        </div>
                    ) : (
                        languages.map((lang, index) => {
                            const itemKey = lang.id || lang.date || `lang-${index}`;
                            const langName = lang.name || lang.language || '';
                            const langLevel = lang.level || '';

                            return (
                                <div
                                    key={itemKey}
                                    className="flex flex-col md:flex-row items-stretch md:items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-all"
                                >
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                                        <InputField
                                            label={t('BuildResume.languages.nameLabel', 'Language')}
                                            value={langName}
                                            onChange={(e) => updateLanguage(itemKey, 'name', e.target.value)}
                                            placeholder="e.g. English, Spanish, French"
                                        />
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                                {t('BuildResume.languages.levelLabel', 'Proficiency Level')}
                                            </label>
                                            <select
                                                value={langLevel}
                                                onChange={(e) => updateLanguage(itemKey, 'level', e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                            >
                                                <option value="">
                                                    {t('BuildResume.languages.selectLevel', 'Select a verified proficiency level')}
                                                </option>
                                                {PROFICIENCY_LEVELS.map((lvl) => (
                                                    <option key={lvl} value={lvl}>
                                                        {lvl}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 self-end md:self-center">
                                        <button type="button" onClick={() => moveLanguage(itemKey, -1)} disabled={index === 0} aria-label={`Move ${langName || 'language'} up`} className="p-2 text-slate-500 disabled:opacity-30">↑</button>
                                        <button type="button" onClick={() => moveLanguage(itemKey, 1)} disabled={index === languages.length - 1} aria-label={`Move ${langName || 'language'} down`} className="p-2 text-slate-500 disabled:opacity-30">↓</button>
                                        <button type="button" onClick={() => duplicateLanguage(itemKey)} aria-label={`Duplicate ${langName || 'language'}`} className="p-2 text-slate-500">⧉</button>
                                        <button
                                            type="button"
                                            onClick={() => removeLanguage(itemKey)}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors self-end md:self-center"
                                            title={t('BuildResume.languages.delete', 'Remove Language')}
                                        >
                                            <MdDelete className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {languages.length > 0 && (
                    <button
                        type="button"
                        onClick={() => addLanguage()}
                        className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors shadow-sm cursor-pointer"
                    >
                        <MdAdd className="w-4 h-4" />
                        {t('BuildResume.languages.addLanguage', 'Add Another Language')}
                    </button>
                )}
            </div>

            {/* 2. Hobbies & Interests Section */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
                <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-sm">
                            <MdSportsSoccer className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">
                            Hobbies & Personal Interests
                        </h2>
                    </div>
                    <p className="text-slate-600 text-sm">
                        Showcase your passions, sports, or creative activities. These appear right after Languages across all templates.
                    </p>
                </div>

                {/* Quick Add Popular Hobbies */}
                {availableHobbyPills.length > 0 && (
                    <div className="mb-6">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Quick Add Hobbies
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {availableHobbyPills.slice(0, 8).map((hobby) => (
                                <button
                                    key={hobby}
                                    type="button"
                                    onClick={() => addHobby(hobby)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-200 rounded-full text-xs font-medium text-slate-700 transition-all cursor-pointer"
                                >
                                    <MdAdd className="w-3.5 h-3.5" />
                                    {hobby}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Custom Hobby Input with AI Dropdown Suggestion */}
                <div className="flex gap-3 mb-6 items-start">
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
                            placeholder="Type a custom hobby (e.g. Marathon Running, Open Source, Drone Piloting)"
                            suggestionType="hobby"
                            inputClassName="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all h-[42px]"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => addHobby()}
                        disabled={!hobbyInput.trim()}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer h-[42px] shrink-0"
                    >
                        <MdAdd className="w-4 h-4" />
                        Add Hobby
                    </button>
                </div>

                {/* Active Hobbies Pills */}
                {hobbies.length > 0 ? (
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                            Active Hobbies & Interests ({hobbies.length})
                        </label>
                        <div className="flex flex-wrap gap-2.5 p-4 bg-slate-50 rounded-xl border border-slate-200">
                            {hobbies.map((h, idx) => {
                                const name = typeof h === 'string' ? h : (h.name || h.hobby || '');
                                return (
                                    <span
                                        key={idx}
                                        className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-300 text-slate-800 rounded-lg text-xs font-semibold shadow-2xs hover:border-slate-400 transition-all"
                                    >
                                        {name}
                                        <button
                                            type="button"
                                            onClick={() => removeHobby(idx)}
                                            className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                                            title="Remove hobby"
                                        >
                                            <MdClose className="w-3.5 h-3.5" />
                                        </button>
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/40">
                        <p className="text-xs text-slate-500">No hobbies added yet. Add a hobby above or choose from the quick-add suggestions.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LanguagesStep;
