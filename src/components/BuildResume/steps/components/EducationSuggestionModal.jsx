import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MdClose, MdLightbulb, MdBolt, MdContentCopy, MdAdd, MdCheck, MdAutoAwesome } from 'react-icons/md';
import { FiLoader } from 'react-icons/fi';
import { generateUserAiContent } from '../../../../services/aiService';

const EducationSuggestionModal = ({ isOpen, onClose, selectedEducation, onApplySuggestion }) => {
    const { t } = useTranslation('common');
    const [isGenerating, setIsGenerating] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [selectedBullets, setSelectedBullets] = useState([]);
    const [copiedIndex, setCopiedIndex] = useState(null);
    const [error, setError] = useState(null);
    const requestControllerRef = useRef(null);

    const generateAiSuggestions = async () => {
        const school = selectedEducation?.school || selectedEducation?.institution || '';
        const degree = selectedEducation?.degree || selectedEducation?.qualification || '';

        if (!selectedEducation || !school || !degree) {
            setError(t('EducationSuggestionModal.errors.requiredFields', 'Please enter School and Degree first.'));
            return;
        }

        requestControllerRef.current?.abort();
        const requestController = new AbortController();
        requestControllerRef.current = requestController;
        setIsGenerating(true);
        setError(null);

        try {
            const preferredLanguage = localStorage.getItem('preferredLanguage') || 'en';
            const data = await generateUserAiContent('generate-education-description', {
                school: school,
                degree: degree,
                startDate: selectedEducation.started || selectedEducation.startDate || '',
                endDate: selectedEducation.finished || selectedEducation.endDate || '',
                current: Boolean(selectedEducation.current),
                language: preferredLanguage,
            }, { signal: requestController.signal });

            if (data && data.suggestions && Array.isArray(data.suggestions)) {
                const cleanSuggestions = data.suggestions.map((item) => {
                    if (typeof item === 'string') return item.trim();
                    if (typeof item === 'object' && item !== null) {
                        return (item.highlight || item.bulletPoint || item.text || item.suggestion || item.bullet || Object.values(item)[0] || '').toString().trim();
                    }
                    return String(item).trim();
                }).filter(Boolean);
                setSuggestions(cleanSuggestions);
            } else {
                throw new Error('Invalid response format');
            }
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('Error generating AI suggestions:', err);
            setError(`AI Error: ${err.message || 'Failed to generate AI suggestions'}. Please verify your AI API Key, selected Model, or API settings in Admin Panel settings.`);

            setSuggestions([
                `Completed advanced coursework in ${degree} with focus on core domain fundamentals and practical application.`,
                `Maintained high academic standing while completing capstone projects and research publications.`,
                `Collaborated on team research projects, analyzing complex data sets and presenting findings to faculty committees.`,
                `Demonstrated leadership in student-led technical associations and organized academic peer-mentorship workshops.`
            ]);
        } finally {
            if (requestControllerRef.current === requestController) {
                requestControllerRef.current = null;
                setIsGenerating(false);
            }
        }
    };

    // Auto-generate on open
    useEffect(() => {
        const school = selectedEducation?.school || selectedEducation?.institution || '';
        const degree = selectedEducation?.degree || selectedEducation?.qualification || '';

        if (isOpen && school && degree) {
            setSelectedBullets([]);
            generateAiSuggestions();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, selectedEducation]);

    useEffect(() => () => { const controller = requestControllerRef.current; requestControllerRef.current = null; controller?.abort(); }, []);
    useEffect(() => {
        if (!isOpen) requestControllerRef.current?.abort();
    }, [isOpen]);

    const toggleBulletSelection = (bulletText) => {
        const cleanedText = bulletText.replace(/^[•\-*]\s*/, '').trim();
        if (selectedBullets.includes(cleanedText)) {
            setSelectedBullets(selectedBullets.filter((b) => b !== cleanedText));
        } else {
            setSelectedBullets([...selectedBullets, cleanedText]);
        }
    };

    const handleCopyBullet = (bulletText, index) => {
        const cleanedText = bulletText.replace(/^[•\-*]\s*/, '').trim();
        navigator.clipboard.writeText(`• ${cleanedText}`);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleApplySelected = () => {
        if (selectedBullets.length > 0) {
            const formatted = selectedBullets.map((b) => `• ${b}`).join('\n');
            onApplySuggestion(formatted);
            handleClose();
        }
    };

    const handleApplyAllBlock = (suggestionBlock) => {
        onApplySuggestion(suggestionBlock);
        handleClose();
    };

    const handleClose = () => {
        setSuggestions([]);
        setSelectedBullets([]);
        setError(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-indigo-950 text-white">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-400/30">
                            <MdAutoAwesome className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                Academic Achievements Generator
                                <span className="bg-indigo-500/30 text-indigo-300 text-xs px-2 py-0.5 rounded-full font-medium border border-indigo-400/20">
                                    ATS Optimized
                                </span>
                            </h3>
                            <p className="text-xs text-slate-300">Generate, customize & select academic honors & project highlights</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
                        <MdClose className="w-6 h-6" />
                    </button>
                </div>

                {/* Content Container */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {/* Education Summary Pill */}
                    {selectedEducation && (
                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-500">Degree & School</span>
                                <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                                    {selectedEducation.degree || 'Degree'}
                                    <span className="text-slate-500 font-normal"> at </span>
                                    {selectedEducation.school || 'University'}
                                </h4>
                            </div>
                            <button
                                onClick={generateAiSuggestions}
                                disabled={isGenerating}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50">
                                {isGenerating ? <FiLoader className="animate-spin w-3.5 h-3.5" /> : <MdBolt className="w-4 h-4 text-amber-300" />}
                                {isGenerating ? 'Generating...' : 'Regenerate'}
                            </button>
                        </div>
                    )}

                    {/* Error Notice */}
                    {error && (
                        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
                            {error}
                        </div>
                    )}

                    {/* Suggestions Section */}
                    {isGenerating ? (
                        <div className="py-12 text-center space-y-3">
                            <FiLoader className="animate-spin w-8 h-8 text-indigo-600 mx-auto" />
                            <p className="text-sm font-medium text-slate-600">Generating academic highlights & coursework achievements...</p>
                        </div>
                    ) : suggestions.length > 0 ? (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Click highlights to build description ({selectedBullets.length} selected)
                                </h4>
                                {selectedBullets.length > 0 && (
                                    <button
                                        onClick={handleApplySelected}
                                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors">
                                        Apply Selected ({selectedBullets.length})
                                    </button>
                                )}
                            </div>

                            {suggestions.map((suggestion, index) => {
                                const isBlock = suggestion.includes('\n');
                                const cleanedText = suggestion.replace(/^[•\-*]\s*/, '').trim();
                                const isSelected = selectedBullets.includes(cleanedText);

                                return (
                                    <div
                                        key={index}
                                        className={`group relative p-4 rounded-xl border transition-all duration-200 ${
                                            isSelected
                                                ? 'bg-indigo-50/60 border-indigo-400 ring-2 ring-indigo-300/40 shadow-sm'
                                                : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md'
                                        }`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div
                                                className="flex-1 cursor-pointer"
                                                onClick={() => !isBlock && toggleBulletSelection(suggestion)}>
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                                        Highlight {index + 1}
                                                    </span>
                                                    {!isBlock && (
                                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                                                            isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-700'
                                                        }`}>
                                                            {isSelected ? '✓ Selected' : '+ Click to Select'}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-slate-800 leading-relaxed font-sans font-normal">
                                                    {suggestion}
                                                </p>
                                            </div>

                                            {/* Action Icon Buttons */}
                                            <div className="flex items-center space-x-1 flex-shrink-0 pt-1">
                                                <button
                                                    onClick={() => handleCopyBullet(suggestion, index)}
                                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="Copy text">
                                                    {copiedIndex === index ? <MdCheck className="w-4 h-4 text-emerald-600" /> : <MdContentCopy className="w-4 h-4" />}
                                                </button>

                                                <button
                                                    onClick={() => handleApplyAllBlock(suggestion)}
                                                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors">
                                                    Apply
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                </div>

                {/* Footer */}
                <div className="p-4 px-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                        {selectedBullets.length > 0 ? `${selectedBullets.length} highlight(s) selected` : 'Click highlights to select or Apply any option'}
                    </p>
                    <div className="flex items-center space-x-3">
                        {selectedBullets.length > 0 && (
                            <button
                                onClick={handleApplySelected}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all">
                                Insert {selectedBullets.length} Selected Highlight(s)
                            </button>
                        )}
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition-colors">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EducationSuggestionModal;
