import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MdDelete, MdAdd, MdCheck, MdTranslate, MdLanguage } from 'react-icons/md';
import InputField from './components/InputField';
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
    const idCounter = useRef(0);

    useEffect(() => {
        if (resumeData.languages && Array.isArray(resumeData.languages)) {
            setLanguages(resumeData.languages);
        }
    }, [resumeData.languages]);

    const createNewLanguage = (name = '', level = 'Native / Bilingual') => {
        idCounter.current += 1;
        return {
            id: `lang_${Date.now()}_${idCounter.current}`,
            name: name,
            level: level,
            date: languages.length + 1,
        };
    };

    const addLanguage = (name = '', level = 'Native / Bilingual') => {
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

    const handleSave = () => {
        updateResumeData({ languages });

        const validLangs = languages.filter((lang) => (lang.name || lang.language || '').trim() !== '');

        if (validLangs.length > 0) {
            const completedSteps = [...(resumeData.completedSteps || [])];
            if (!completedSteps.includes(5)) {
                completedSteps.push(5);
                updateResumeData({ languages, completedSteps });
            }
        } else {
            const completedSteps = [...(resumeData.completedSteps || [])];
            const updatedSteps = completedSteps.filter((step) => step !== 5);
            if (updatedSteps.length !== completedSteps.length) {
                updateResumeData({ languages, completedSteps: updatedSteps });
            }
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [languages]);

    const existingNames = languages.map((l) => (l.name || l.language || '').toLowerCase());
    const availablePills = POPULAR_LANGUAGES.filter((p) => !existingNames.includes(p.toLowerCase()));

    return (
        <div className="px-4 py-6 max-w-6xl mx-auto w-full min-h-full">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm">
                        <MdTranslate className="w-5 h-5" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">
                        {t('BuildResume.steps.languages', 'Languages')}
                    </h2>
                </div>
                <p className="text-slate-500 text-sm">
                    {t('BuildResume.languages.subtitle', 'Add languages you speak and your level of proficiency.')}
                </p>
            </div>

            {/* Quick Add Pills */}
            {availablePills.length > 0 && (
                <div className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <MdLanguage className="w-4 h-4 text-blue-600" />
                        {t('BuildResume.languages.quickAdd', 'Quick Add Popular Languages')}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {availablePills.map((langName) => (
                            <button
                                key={langName}
                                type="button"
                                onClick={() => addLanguage(langName)}
                                className="px-3 py-1.5 bg-white hover:bg-blue-50 hover:border-blue-300 border border-slate-200 rounded-lg text-sm text-slate-700 hover:text-blue-700 font-medium transition-colors flex items-center gap-1 shadow-sm"
                            >
                                <MdAdd className="w-4 h-4 text-blue-500" />
                                {langName}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Language Cards */}
            <div className="space-y-4 mb-6">
                {languages.length === 0 ? (
                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                        <MdTranslate className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <h3 className="text-slate-700 font-medium mb-1">
                            {t('BuildResume.languages.emptyTitle', 'No languages added yet')}
                        </h3>
                        <p className="text-slate-400 text-sm mb-4">
                            {t('BuildResume.languages.emptyDesc', 'Click a language pill above or the button below to add your languages.')}
                        </p>
                        <button
                            type="button"
                            onClick={() => addLanguage()}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            <MdAdd className="w-4 h-4" />
                            {t('BuildResume.languages.addLanguage', 'Add Language')}
                        </button>
                    </div>
                ) : (
                    languages.map((lang, index) => {
                        const langName = lang.name || lang.language || '';
                        const langLevel = lang.level || lang.proficiency || 'Native / Bilingual';
                        const itemKey = lang.id || lang.date || `lang_${index}`;

                        return (
                            <div
                                key={itemKey}
                                className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center gap-4"
                            >
                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            {/* Add Language Button */}
            {languages.length > 0 && (
                <button
                    type="button"
                    onClick={() => addLanguage()}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                    <MdAdd className="w-4 h-4" />
                    {t('BuildResume.languages.addLanguage', 'Add Another Language')}
                </button>
            )}
        </div>
    );
};

export default LanguagesStep;
