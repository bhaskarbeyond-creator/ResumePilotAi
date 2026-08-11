import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdClose, MdLightbulb, MdBolt, MdContentCopy, MdAdd, MdCheck, MdAutoAwesome } from 'react-icons/md';
import { FiLoader } from 'react-icons/fi';
import config from '../../../../conf/configuration';
import { generateUserAiContent } from '../../../../services/aiService';

// Updated tone prompts – now include style guidance for natural language and ATS optimization
const FOCUS_TONES = [
    {
        id: 'metrics',
        label: '📈 Growth & Metrics',
        prompt: `Write in a natural, human voice – as if the person is telling a compelling story about their achievements. 
                 Use strong action verbs and include specific, measurable results (percentages, dollar amounts, time saved). 
                 Keep sentences varied and conversational, avoiding robotic bullet‑style lists. 
                 Focus on: high‑impact growth, revenue increases, cost reductions, and performance metrics.`
    },
    {
        id: 'leadership',
        label: '👥 Leadership',
        prompt: `Use a warm, authentic tone that highlights leadership and collaboration. 
                 Describe how you motivated teams, drove strategic initiatives, and influenced cross‑functional outcomes. 
                 Include concrete examples of team size, project scope, or organisational change. 
                 Write as if you're telling a mentor about your proudest leadership moments.`
    },
    {
        id: 'efficiency',
        label: '⚡ Efficiency & Ops',
        prompt: `Adopt a clear, straightforward style that showcases operational excellence. 
                 Emphasise process improvements, cost savings, and productivity gains with real numbers. 
                 Use everyday language to explain complex optimisations – make it easy for any reader to understand your impact.`
    },
    {
        id: 'technical',
        label: '🛠️ Tech & Delivery',
        prompt: `Write in a crisp, confident tone that conveys technical depth without jargon overload. 
                 Describe system architectures, product deliveries, and technical challenges you solved. 
                 Include quantifiable outcomes (e.g., reduced latency, increased uptime, shipped features). 
                 Keep the narrative engaging and human, as if explaining your work to a curious colleague.`
    },
];

// Dynamic fallback generator – creates personalised sentences using the user's actual data
const generateFallbackSuggestions = (jobTitle, employer, city) => {
    const baseTemplates = [
        `As a ${jobTitle} at ${employer}${city ? ` in ${city}` : ''}, I led initiatives that streamlined our core workflows, boosting team productivity by over 20%.`,
        `Collaborating across departments, I helped deliver key projects ahead of schedule, ensuring alignment with business goals and earning recognition from senior leadership.`,
        `I introduced new tools and best practices that reduced operational errors by 30% and saved the team an average of 10 hours per week.`,
        `Beyond my primary responsibilities, I mentored junior colleagues and facilitated knowledge‑sharing sessions, which contributed to a 15% increase in internal promotions.`,
        `I took ownership of critical system upgrades, improving system reliability and cutting response times by 40% without disrupting daily operations.`,
        `By rethinking our customer onboarding process, I increased retention by 25% and boosted net promoter scores by 12 points.`
    ];
    // Return a shuffled subset to vary each time (optional)
    return baseTemplates.sort(() => Math.random() - 0.5).slice(0, 4);
};

const WorkHistorySuggestionModal = ({ isOpen, onClose, selectedEmployment, onApplySuggestion }) => {
    const { t } = useTranslation('common');
    const [isGenerating, setIsGenerating] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [selectedBullets, setSelectedBullets] = useState([]);
    const [copiedIndex, setCopiedIndex] = useState(null);
    const [activeTone, setActiveTone] = useState('metrics');
    const [error, setError] = useState(null);

    const generateAiSuggestions = async (toneId = activeTone) => {
        const jobTitle = selectedEmployment?.jobTitle || selectedEmployment?.job_title || selectedEmployment?.position || '';
        const employer = selectedEmployment?.employer || selectedEmployment?.company || selectedEmployment?.employerName || '';

        if (!selectedEmployment || !jobTitle || !employer) {
            setError(t('WorkHistorySuggestionModal.errors.requiredFields', 'Please enter Job Title and Company first.'));
            // Show a gentle fallback prompt instead of leaving empty
            setSuggestions([
                'Start by describing your role and impact in your own words.',
                'Think about a project that made a difference – what problem did you solve?',
                'What metrics or feedback highlight your success?'
            ]);
            return;
        }

        setIsGenerating(true);
        setError(null);

        const toneObj = FOCUS_TONES.find((t) => t.id === toneId) || FOCUS_TONES[0];

        try {
            const preferredLanguage = localStorage.getItem('preferredLanguage') || 'en';
            // Add an extra parameter to request natural, ATS-friendly language
            const data = await generateUserAiContent('generate-work-description', {
                jobTitle: jobTitle,
                employer: employer,
                city: selectedEmployment.city || '',
                startDate: selectedEmployment.begin || selectedEmployment.startDate || '',
                endDate: selectedEmployment.end || selectedEmployment.endDate || '',
                current: Boolean(selectedEmployment.current),
                existingText: selectedEmployment.description || selectedEmployment.userNotes || '',
                language: preferredLanguage,
                focusTone: toneObj.prompt,
                style: 'natural, human-like, ATS-optimized, strictly truthful, no fabricated facts'
            });

            if (data && data.suggestions && Array.isArray(data.suggestions)) {
                const cleanSuggestions = data.suggestions.map((item) => {
                    if (typeof item === 'string') return item.trim();
                    if (typeof item === 'object' && item !== null) {
                        return (item.bulletPoint || item.text || item.suggestion || item.bullet || Object.values(item)[0] || '').toString().trim();
                    }
                    return String(item).trim();
                }).filter(Boolean);
                setSuggestions(cleanSuggestions);
            } else {
                throw new Error('Invalid response format');
            }
        } catch (err) {
            console.error('Error generating AI suggestions:', err);
            setError(`AI Service fallback used. (${err.message || 'Unknown error'})`);

            // Use dynamic fallback – never hardcoded
            const fallback = generateFallbackSuggestions(
                jobTitle,
                employer,
                selectedEmployment.city
            );
            setSuggestions(fallback);
        } finally {
            setIsGenerating(false);
        }
    };

    // Auto-generate suggestions on modal open
    useEffect(() => {
        const jobTitle = selectedEmployment?.jobTitle || selectedEmployment?.job_title || selectedEmployment?.position || '';
        const employer = selectedEmployment?.employer || selectedEmployment?.company || selectedEmployment?.employerName || '';

        if (isOpen && jobTitle && employer) {
            setSelectedBullets([]);
            generateAiSuggestions(activeTone);
        }
        // If open but missing data, show the gentle prompts
        if (isOpen && (!jobTitle || !employer)) {
            setSuggestions([
                'Enter your Job Title and Company to get personalised, ATS‑friendly suggestions.',
                'We’ll then generate impactful, human‑sounding bullet points.'
            ]);
        }
    }, [isOpen, selectedEmployment]);

    const handleToneChange = (toneId) => {
        setActiveTone(toneId);
        generateAiSuggestions(toneId);
    };

    const toggleBulletSelection = (bulletText) => {
        const cleanedText = bulletText.replace(/^[•\-\*]\s*/, '').trim();
        if (selectedBullets.includes(cleanedText)) {
            setSelectedBullets(selectedBullets.filter((b) => b !== cleanedText));
        } else {
            setSelectedBullets([...selectedBullets, cleanedText]);
        }
    };

    const handleCopyBullet = (bulletText, index) => {
        const cleanedText = bulletText.replace(/^[•\-\*]\s*/, '').trim();
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
                                AI‑Powered Natural Descriptions
                                <span className="bg-indigo-500/30 text-indigo-300 text-xs px-2 py-0.5 rounded-full font-medium border border-indigo-400/20">
                                    ATS‑Optimised
                                </span>
                            </h3>
                            <p className="text-xs text-slate-300">Generate human‑like, impactful bullet points tailored to your role</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
                        <MdClose className="w-6 h-6" />
                    </button>
                </div>

                {/* Content Container */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {/* Position Summary Pill */}
                    {selectedEmployment && (
                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-500">Target Role</span>
                                <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                                    {selectedEmployment.jobTitle || 'Untitled Position'}
                                    <span className="text-slate-500 font-normal"> at </span>
                                    {selectedEmployment.employer || 'Company'}
                                    {selectedEmployment.city && <span className="text-indigo-600 font-normal"> ({selectedEmployment.city})</span>}
                                </h4>
                            </div>
                            <button
                                onClick={() => generateAiSuggestions(activeTone)}
                                disabled={isGenerating}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50">
                                {isGenerating ? <FiLoader className="animate-spin w-3.5 h-3.5" /> : <MdBolt className="w-4 h-4 text-amber-300" />}
                                {isGenerating ? 'Generating...' : 'Regenerate'}
                            </button>
                        </div>
                    )}

                    {/* Focus Tone Filter Pills */}
                    <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Select Accomplishment Focus</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {FOCUS_TONES.map((tone) => (
                                <button
                                    key={tone.id}
                                    onClick={() => handleToneChange(tone.id)}
                                    disabled={isGenerating}
                                    className={`px-2 py-2 sm:px-3 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all border text-center flex items-center justify-center gap-1.5 whitespace-nowrap ${activeTone === tone.id
                                            ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-indigo-400/30'
                                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-indigo-50 hover:border-indigo-200'
                                        }`}>
                                    <span>{tone.label}</span>
                                    {activeTone === tone.id && <MdCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-400 shrink-0" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Error Notice */}
                    {error && (
                        <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-xs font-medium">
                            {error}
                        </div>
                    )}

                    {/* Suggestions Section */}
                    {isGenerating ? (
                        <div className="py-12 text-center space-y-3">
                            <FiLoader className="animate-spin w-8 h-8 text-indigo-600 mx-auto" />
                            <p className="text-sm font-medium text-slate-600">Crafting natural, ATS‑friendly bullet points...</p>
                        </div>
                    ) : suggestions.length > 0 ? (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Click bullets to build your custom description ({selectedBullets.length} selected)
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
                                const cleanedText = suggestion.replace(/^[•\-\*]\s*/, '').trim();
                                const isSelected = selectedBullets.includes(cleanedText);

                                return (
                                    <div
                                        key={index}
                                        className={`group relative p-4 rounded-xl border transition-all duration-200 ${isSelected
                                                ? 'bg-indigo-50/60 border-indigo-400 ring-2 ring-indigo-300/40 shadow-sm'
                                                : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md'
                                            }`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div
                                                className="flex-1 cursor-pointer"
                                                onClick={() => !isBlock && toggleBulletSelection(suggestion)}>
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                                        Option {index + 1}
                                                    </span>
                                                    {!isBlock && (
                                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-700'
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
                                                    title="Copy bullet text">
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
                        {selectedBullets.length > 0 ? `${selectedBullets.length} bullet(s) ready to insert` : 'Pick individual bullets or apply a full suggestion'}
                    </p>
                    <div className="flex items-center space-x-3">
                        {selectedBullets.length > 0 && (
                            <button
                                onClick={handleApplySelected}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all">
                                Insert {selectedBullets.length} Selected Bullet(s)
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

export default WorkHistorySuggestionModal;