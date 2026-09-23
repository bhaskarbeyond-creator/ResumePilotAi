import React, { useState, useEffect, useRef } from 'react';
import {
    MdAutoAwesome,
    MdClose,
    MdTrendingUp,
    MdTrackChanges,
    MdHelpOutline,
    MdCheckCircle,
    MdArrowForward,
    MdRefresh,
} from 'react-icons/md';
import { generateUserAiContent } from '../../../../services/aiService.js';
import { extractBulletList, detectLegitimateMetric, getBulletAnalysis } from '../../../../utils/bulletQuality.js';
import { extractJdKeywords } from '../../../../utils/atsScore.js';
import { generateRoleInterviewQuestions } from '../../../../utils/roleInterviewGenerator.js';

/**
 * RoleAiCopilotModal
 * Consolidates all Work History AI workflows into one unified, enterprise-grade copilot:
 * 1. ✨ Polish Writing (Grammar, clarity, conciseness, active tone)
 * 2. 📈 Quantify Impact (Identifies missing metrics and prompts for candidate facts)
 * 3. 🎯 Tailor to Target Role / JD (Aligns verified work with target job requirements)
 * 4. ❓ Help Me Write (Interactive questionnaire for sparse or blank notes)
 */
export default function RoleAiCopilotModal({
    isOpen,
    onClose,
    onApplyBullets,
    employment = {},
    targetRole = '',
    targetJd = '',
    initialMode = 'polish',
}) {
    const [activeMode, setActiveMode] = useState(initialMode); // 'polish' | 'quantify' | 'tailor' | 'interview'
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Mode-specific state
    const [interviewQuestions, setInterviewQuestions] = useState([]);
    const [interviewAnswers, setInterviewAnswers] = useState({ q1: '', q2: '', q3: '' });
    const [generatedBullets, setGeneratedBullets] = useState([]);
    const [selectedBullets, setSelectedBullets] = useState({});

    // Quantify mode state
    const [metricPromptIndex, setMetricPromptIndex] = useState(0);
    const [metricInput, setMetricInput] = useState('');

    const modalRef = useRef(null);
    const returnFocusRef = useRef(null);

    const bullets = extractBulletList(employment.description);
    const roleTitle = String(employment.jobTitle || 'this role').trim();
    const company = String(employment.employer || '').trim();

    useEffect(() => {
        if (isOpen) {
            returnFocusRef.current = document.activeElement;
            document.body.style.overflow = 'hidden';
            const effectiveInitialMode = (initialMode === 'polish' && bullets.length === 0) ? 'interview' : initialMode;
            setActiveMode(effectiveInitialMode);
            setError('');
            setGeneratedBullets([]);

            // Immediately compute smart, role-specific questions with 0ms delay so user is never blocked
            const dynamicQuestions = generateRoleInterviewQuestions(roleTitle, company, targetJd);
            setInterviewQuestions(dynamicQuestions);

            // Fetch AI-enhanced questions in background with fast timeout
            if (initialMode === 'interview' || bullets.length === 0) {
                loadInterviewQuestions();
            }
        } else {
            document.body.style.overflow = 'unset';
            returnFocusRef.current?.focus?.();
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, initialMode]);

    // Keyboard handling
    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const loadInterviewQuestions = async () => {
        try {
            const res = await generateUserAiContent('generate-work-description', {
                mode: 'questions',
                jobTitle: roleTitle,
                employer: company,
                targetRole: targetRole || roleTitle,
                targetJobDescription: targetJd,
                existingText: '',
            }, { timeoutMs: 4500 });

            if (Array.isArray(res?.questions) && res.questions.length > 0) {
                // Update with AI questions if candidate hasn't already typed answers
                setInterviewQuestions(prev => {
                    const hasUserTyped = Object.values(interviewAnswers).some(a => a && a.trim());
                    return hasUserTyped ? prev : res.questions;
                });
            }
        } catch {
            // Graceful silent recovery: dynamic questions are already active
        }
    };

    const handleRunPolish = async () => {
        if (bullets.length === 0) return;
        setIsLoading(true);
        setError('');
        try {
            const res = await generateUserAiContent('generate-work-description', {
                entry: employment,
                targetRole: targetRole || roleTitle,
                targetJobDescription: targetJd,
            });

            const suggestions = Array.isArray(res?.suggestions)
                ? res.suggestions.map((s) => (typeof s === 'string' ? s : s?.text || ''))
                : [];

            if (suggestions.length > 0) {
                setGeneratedBullets(suggestions);
                const initialSelected = {};
                suggestions.forEach((_, i) => { initialSelected[i] = true; });
                setSelectedBullets(initialSelected);
            } else {
                setError('No suggestions generated. Try adding a little more detail to your notes.');
            }
        } catch (err) {
            setError(err.message || 'Failed to polish writing. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRunInterviewSubmit = async () => {
        const answersCombined = Object.values(interviewAnswers).filter(Boolean).join('\n');
        if (!answersCombined.trim()) {
            setError('Please answer at least one question so the AI can craft factual bullets.');
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            const res = await generateUserAiContent('generate-work-description', {
                entry: {
                    ...employment,
                    description: answersCombined,
                },
                candidateAnswers: interviewAnswers,
                notes: answersCombined,
                description: answersCombined,
                jobTitle: roleTitle,
                employer: company,
                targetRole: targetRole || roleTitle,
                targetJobDescription: targetJd,
            });

            const suggestions = Array.isArray(res?.suggestions)
                ? res.suggestions.map((s) => (typeof s === 'string' ? s : s?.text || ''))
                : [];

            if (suggestions.length > 0) {
                setGeneratedBullets(suggestions);
                const initialSelected = {};
                suggestions.forEach((_, i) => { initialSelected[i] = true; });
                setSelectedBullets(initialSelected);
            } else {
                setError('Could not synthesize bullets from answers. Please try again.');
            }
        } catch (err) {
            setError(err.message || 'Failed to generate bullets from answers.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleInjectMetric = async () => {
        if (!metricInput.trim()) return;
        const targetBullet = bullets[metricPromptIndex];
        if (!targetBullet) return;

        setIsLoading(true);
        setError('');
        try {
            const promptNote = `${targetBullet}. Metric/Impact: ${metricInput.trim()}`;
            const res = await generateUserAiContent('enhance-single-bullet', {
                bullet: promptNote,
            });

            if (res && res.enhancedBullet) {
                const updated = [...bullets];
                updated[metricPromptIndex] = res.enhancedBullet;
                onApplyBullets(updated);
                setMetricInput('');
                // Advance to next bullet without metric if available
                const nextNoMetricIdx = updated.findIndex((b, idx) => idx > metricPromptIndex && !detectLegitimateMetric(b));
                if (nextNoMetricIdx !== -1) {
                    setMetricPromptIndex(nextNoMetricIdx);
                } else {
                    onClose();
                }
            }
        } catch (err) {
            setError(err.message || 'Failed to enhance with metric.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleApplySelected = (mode = 'replace') => {
        const toApply = generatedBullets.filter((_, i) => selectedBullets[i]);
        if (toApply.length > 0) {
            if (mode === 'append' && bullets.length > 0) {
                onApplyBullets([...bullets, ...toApply]);
            } else {
                onApplyBullets(toApply);
            }
            onClose();
        }
    };

    const allSelected = generatedBullets.length > 0 && generatedBullets.every((_, i) => selectedBullets[i]);
    const selectedCount = Object.values(selectedBullets).filter(Boolean).length;

    const toggleSelectAll = () => {
        const next = {};
        if (!allSelected) {
            generatedBullets.forEach((_, i) => { next[i] = true; });
        }
        setSelectedBullets(next);
    };

    if (!isOpen) return null;

    // Target JD keywords analysis
    const jdKeywords = targetJd ? extractJdKeywords(targetJd).map((k) => k.term) : [];
    const notesLower = bullets.join(' ').toLowerCase();
    const matchedJd = jdKeywords.filter((k) => notesLower.includes(k.toLowerCase()));
    const missingJd = jdKeywords.filter((k) => !notesLower.includes(k.toLowerCase())).slice(0, 8);

    const bulletsLackingMetrics = bullets
        .map((b, i) => ({ text: b, index: i, hasMetric: detectLegitimateMetric(b) }))
        .filter((item) => !item.hasMetric);

    const handleAddStarterChip = (qId, chipText) => {
        setInterviewAnswers(prev => {
            const current = prev[qId] || '';
            const updated = current.trim() ? `${current.trim()}, ${chipText}` : chipText;
            return { ...prev, [qId]: updated };
        });
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in"
            onClick={(e) => { if (e.target === e.currentTarget && !isLoading) onClose(); }}
            role="presentation"
        >
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="role-copilot-title"
                className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden transition-all duration-200 animate-in zoom-in-95 flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-xs shrink-0">
                            <MdAutoAwesome className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 id="role-copilot-title" className="text-sm font-bold text-slate-900">
                                    AI Role Copilot
                                </h3>
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-full">
                                    🛡️ Zero-Hallucination
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium">
                                {roleTitle}{company ? ` · ${company}` : ''}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
                        aria-label="Close copilot"
                    >
                        <MdClose className="w-4 h-4" />
                    </button>
                </div>

                {/* Segmented Mode Navigation Bar */}
                <div className="px-6 pt-3 pb-1 bg-white shrink-0">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/70">
                        <button
                            type="button"
                            onClick={() => { setActiveMode('polish'); setError(''); }}
                            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs transition-all select-none ${
                                activeMode === 'polish'
                                    ? 'bg-white text-indigo-700 shadow-xs font-bold border border-slate-200/60'
                                    : 'text-slate-600 hover:text-slate-900 font-semibold hover:bg-white/50'
                            }`}
                        >
                            <MdAutoAwesome className={`w-3.5 h-3.5 ${activeMode === 'polish' ? 'text-indigo-600' : 'text-slate-400'}`} />
                            <span>Polish Writing</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setActiveMode('quantify'); setError(''); }}
                            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs transition-all select-none ${
                                activeMode === 'quantify'
                                    ? 'bg-white text-indigo-700 shadow-xs font-bold border border-slate-200/60'
                                    : 'text-slate-600 hover:text-slate-900 font-semibold hover:bg-white/50'
                            }`}
                        >
                            <MdTrendingUp className={`w-3.5 h-3.5 ${activeMode === 'quantify' ? 'text-indigo-600' : 'text-slate-400'}`} />
                            <span>Add Metrics</span>
                            {bulletsLackingMetrics.length > 0 && (
                                <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full font-bold">
                                    {bulletsLackingMetrics.length}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setActiveMode('tailor'); setError(''); }}
                            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs transition-all select-none ${
                                activeMode === 'tailor'
                                    ? 'bg-white text-indigo-700 shadow-xs font-bold border border-slate-200/60'
                                    : 'text-slate-600 hover:text-slate-900 font-semibold hover:bg-white/50'
                            }`}
                        >
                            <MdTrackChanges className={`w-3.5 h-3.5 ${activeMode === 'tailor' ? 'text-indigo-600' : 'text-slate-400'}`} />
                            <span>Tailor to Job</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveMode('interview');
                                setError('');
                                if (interviewQuestions.length === 0) loadInterviewQuestions();
                            }}
                            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs transition-all select-none ${
                                activeMode === 'interview'
                                    ? 'bg-white text-indigo-700 shadow-xs font-bold border border-slate-200/60'
                                    : 'text-slate-600 hover:text-slate-900 font-semibold hover:bg-white/50'
                            }`}
                        >
                            <MdHelpOutline className={`w-3.5 h-3.5 ${activeMode === 'interview' ? 'text-indigo-600' : 'text-slate-400'}`} />
                            <span>Guided Write</span>
                        </button>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mx-6 mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
                        <span>{error}</span>
                        <button type="button" onClick={() => setError('')} className="text-rose-500 font-bold ml-2">×</button>
                    </div>
                )}

                {/* Modal Body */}
                <div className="px-6 py-3 space-y-4 overflow-y-auto flex-1">
                    {/* MODE 1: POLISH WRITING */}
                    {activeMode === 'polish' && (
                        <div className="space-y-3">
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Rewrites your current bullet points for active voice, clarity, and grammatical precision. <strong>Strictly preserves your verified facts, scope, and numbers.</strong>
                            </p>

                            {generatedBullets.length === 0 && (
                                <div className="space-y-3">
                                    {bullets.length > 0 ? (
                                        <div className="space-y-2.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                                    Current Bullets to Polish ({bullets.length})
                                                </span>
                                                <span className="text-[11px] text-slate-500">
                                                    All {bullets.length} will be enhanced together
                                                </span>
                                            </div>
                                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                                {bullets.map((b, i) => (
                                                    <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 flex items-start gap-2.5">
                                                        <span className="w-5 h-5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                                            {i + 1}
                                                        </span>
                                                        <span className="flex-1 leading-relaxed">{b}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="pt-2 text-center">
                                                <button
                                                    type="button"
                                                    onClick={handleRunPolish}
                                                    disabled={isLoading || bullets.length === 0}
                                                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs hover:shadow-md transition-all disabled:opacity-50 cursor-pointer"
                                                >
                                                    {isLoading ? (
                                                        <>
                                                            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                                            <span>Polishing All {bullets.length} Bullets...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <MdAutoAwesome className="w-4 h-4" />
                                                            <span>Polish All {bullets.length} Bullets</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 text-center space-y-3">
                                            <p className="text-xs text-slate-600 font-medium">
                                                No bullet points found yet for <strong>{roleTitle}</strong>. Switch to <strong>Guided Write</strong> to build them from guided questions.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => { setActiveMode('interview'); setError(''); if (interviewQuestions.length === 0) loadInterviewQuestions(); }}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                                            >
                                                <MdHelpOutline className="w-4 h-4" />
                                                <span>Switch to Guided Write</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {generatedBullets.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                                Polished Bullets ({generatedBullets.length})
                                            </span>
                                            <button
                                                type="button"
                                                onClick={toggleSelectAll}
                                                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 cursor-pointer"
                                            >
                                                {allSelected ? 'Deselect All' : 'Select All'}
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleRunPolish}
                                            disabled={isLoading}
                                            className="text-[11px] text-indigo-600 hover:underline inline-flex items-center gap-1 font-semibold"
                                        >
                                            <MdRefresh className="w-3.5 h-3.5" /> Re-polish
                                        </button>
                                    </div>
                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {generatedBullets.map((bullet, idx) => {
                                            const analysis = getBulletAnalysis(bullet);
                                            return (
                                                <div
                                                    key={`gen-${idx}`}
                                                    className={`p-3 rounded-xl border transition-all space-y-2 ${
                                                        selectedBullets[idx]
                                                            ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-500/20'
                                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                                    }`}
                                                >
                                                    <label className="flex items-start gap-3 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!selectedBullets[idx]}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                setSelectedBullets((prev) => ({ ...prev, [idx]: checked }));
                                                            }}
                                                            className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 accent-indigo-600 shrink-0"
                                                        />
                                                        <div className="flex-1 space-y-1">
                                                            <span className="text-xs text-slate-800 leading-relaxed block font-medium">
                                                                {bullet}
                                                            </span>
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                                        analysis.status === 'green'
                                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                            : analysis.status === 'amber'
                                                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                                            : 'bg-rose-50 text-rose-700 border-rose-200'
                                                                    }`}
                                                                >
                                                                    {analysis.status === 'green' ? '🟢 100% ATS Ready' : `🟡 ${analysis.badgeText}`}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400">
                                                                    {bullet.length} chars
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </label>

                                                    {/* Quick Metric Injector if missing metric */}
                                                    {!analysis.hasMetric && (
                                                        <div className="pt-1.5 border-t border-dashed border-slate-200/80 flex items-center gap-1.5 flex-wrap pl-7">
                                                            <span className="text-[10px] font-bold text-amber-800">⚡ No metric yet:</span>
                                                            <span className="text-[10px] text-amber-900">Add a number you can verify once it is in your resume, or use Quantify to add one now.</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* MODE 2: QUANTIFY IMPACT */}
                    {activeMode === 'quantify' && (
                        <div className="space-y-3">
                            <p className="text-xs text-slate-600 leading-relaxed">
                                ATS parsers and executive screeners award up to <strong>6 extra points</strong> when bullets contain measurable numbers (%, $, time, volume, scale). Tell us your real outcome and we will weave it in cleanly.
                            </p>

                            {bulletsLackingMetrics.length === 0 ? (
                                <div className="p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-center space-y-1.5">
                                    <MdCheckCircle className="w-7 h-7 text-emerald-600 mx-auto" />
                                    <p className="text-xs font-bold text-emerald-900">All Bullets Have Measurable Impact!</p>
                                    <p className="text-[11px] text-emerald-700">Your experience already contains numbers, percentages, or scale.</p>
                                </div>
                            ) : (
                                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                            Bullet {metricPromptIndex + 1} of {bullets.length} Needs Metrics
                                        </span>
                                        <div className="flex gap-1">
                                            {bullets.map((_, i) => (
                                                <button
                                                    key={`nav-${i}`}
                                                    type="button"
                                                    onClick={() => setMetricPromptIndex(i)}
                                                    className={`w-5 h-5 rounded-full text-[10px] font-bold transition-colors ${
                                                        metricPromptIndex === i
                                                            ? 'bg-indigo-600 text-white'
                                                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                                    }`}
                                                >
                                                    {i + 1}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 italic leading-relaxed">
                                        "{bullets[metricPromptIndex]}"
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                            What was the quantifiable outcome or scale?
                                        </label>
                                        <input
                                            type="text"
                                            value={metricInput}
                                            onChange={(e) => setMetricInput(e.target.value)}
                                            placeholder="e.g. cut load time by 35%, managed team of 6, saved $15K annually"
                                            className="w-full px-3 py-2 text-xs border rounded-xl border-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                                        />
                                    </div>

                                    {/* Quick suggestion pills */}
                                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                        <span className="text-[10px] font-bold text-slate-400 mr-0.5">Quick Ideas:</span>
                                        {['reduced by 30%', 'saved 10 hrs/week', 'team of 5', 'scaled to 10k users', 'budget of $250k', 'exceeded target by 20%'].map((suggestion) => (
                                            <button
                                                key={suggestion}
                                                type="button"
                                                onClick={() => setMetricInput(suggestion)}
                                                className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors"
                                            >
                                                +{suggestion}
                                            </button>
                                        ))}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleInjectMetric}
                                        disabled={isLoading || !metricInput.trim()}
                                        className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50"
                                    >
                                        {isLoading ? 'Enhancing with Metric...' : 'Inject Metric into Bullet'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* MODE 3: TAILOR TO TARGET ROLE / JD */}
                    {activeMode === 'tailor' && (
                        <div className="space-y-3">
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Compares your work experience against your <strong>Target Role ({targetRole || 'Target'})</strong> and Job Description.
                            </p>

                            {targetJd ? (
                                <div className="space-y-3">
                                    {/* Matched Keywords */}
                                    <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                                        <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                                            <MdCheckCircle className="w-4 h-4 text-emerald-600" />
                                            Demonstrated in this Role ({matchedJd.length})
                                        </span>
                                        {matchedJd.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {matchedJd.map((term) => (
                                                    <span key={term} className="text-[10px] font-semibold bg-white border border-emerald-200 text-emerald-800 px-2.5 py-0.5 rounded-md shadow-2xs">
                                                        {term}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-emerald-700 italic">No direct keyword overlap found yet.</p>
                                        )}
                                    </div>

                                    {/* Missing Opportunities */}
                                    {missingJd.length > 0 && (
                                        <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-2">
                                            <span className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                                                <MdTrackChanges className="w-4 h-4 text-indigo-600" />
                                                Target JD Keywords to Mention (If you used them):
                                            </span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {missingJd.map((term) => (
                                                    <span key={term} className="text-[10px] font-medium bg-white border border-indigo-200 text-indigo-700 px-2.5 py-0.5 rounded-md shadow-2xs">
                                                        {term}
                                                    </span>
                                                ))}
                                            </div>
                                            <p className="text-[10px] text-slate-500 pt-1">
                                                *Notice: Only include competencies you actually performed.
                                            </p>
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleRunPolish}
                                        disabled={isLoading || bullets.length === 0}
                                        className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50"
                                    >
                                        {isLoading ? 'Aligning Terminology...' : 'Align Bullets with Target Terminology'}
                                    </button>
                                </div>
                            ) : (
                                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
                                    <p className="text-xs font-semibold text-slate-700">No Target Job Description found in Step 1.</p>
                                    <p className="text-[11px] text-slate-500 max-w-md mx-auto">Add your target job description in Step 1 (Personal Info) to unlock automated keyword matching and ATS tailoring.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* MODE 4: HELP ME WRITE (INTERVIEW) */}
                    {activeMode === 'interview' && (
                        <div className="space-y-3.5">
                            <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-start gap-2">
                                <span className="text-sm shrink-0">💡</span>
                                <p className="leading-relaxed">
                                    Answer in plain language or quick notes. Our AI turns your answers into factual, high-impact resume bullets with active verbs and measurable outcomes.
                                </p>
                            </div>

                            {interviewQuestions.length === 0 && isLoading ? (
                                <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                                    <span className="inline-block w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                    <p className="font-medium">Formulating smart questions for {roleTitle}...</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {interviewQuestions.map((q, idx) => {
                                        const qKey = q.id || `q${idx + 1}`;
                                        // Chips are one-click inserts into the candidate's own answer: drop any
                                        // chip carrying a number/metric so no invented quantity can be inserted.
                                        const starters = Array.isArray(q.starterChips)
                                            ? q.starterChips.filter(chip => typeof chip === 'string' && !/[0-9%$]/.test(chip))
                                            : [];
                                        return (
                                            <div key={qKey} className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-2 transition-all focus-within:bg-indigo-50/20 focus-within:border-indigo-200">
                                                <div className="flex items-start gap-2">
                                                    <span className="inline-flex items-center text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md shrink-0">
                                                        Q{idx + 1}
                                                    </span>
                                                    <label className="block text-xs font-bold text-slate-800 leading-snug">
                                                        {q.question}
                                                    </label>
                                                </div>

                                                <textarea
                                                    rows={2}
                                                    value={interviewAnswers[qKey] || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setInterviewAnswers((prev) => ({ ...prev, [qKey]: val }));
                                                    }}
                                                    placeholder="Type what you did, tools used, or outcomes achieved..."
                                                    className="w-full px-3.5 py-2 text-xs border rounded-xl border-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 bg-white transition-all placeholder:text-slate-400 resize-none leading-relaxed"
                                                />

                                                {/* Sleek Starter Idea Pills */}
                                                <div className="space-y-1.5 pt-0.5">
                                                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                                                        <span className="flex items-center gap-1 font-medium">
                                                            <span className="text-amber-500">💡</span> Tap keywords to insert:
                                                        </span>
                                                        <span className="text-[10px] text-slate-400">Click to add</span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        {starters.map((starter) => (
                                                            <button
                                                                key={starter}
                                                                type="button"
                                                                onClick={() => handleAddStarterChip(qKey, starter)}
                                                                className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-indigo-50/80 hover:bg-indigo-100/90 text-indigo-700 border border-indigo-200/70 hover:border-indigo-300 transition-all cursor-pointer select-none active:scale-95 shadow-2xs"
                                                                title={`Insert "${starter}" into answer`}
                                                            >
                                                                <span className="text-indigo-500 font-bold text-xs leading-none">+</span>
                                                                <span>{starter}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    <button
                                        type="button"
                                        onClick={handleRunInterviewSubmit}
                                        disabled={isLoading}
                                        className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-xs rounded-xl shadow-xs hover:shadow-md transition-all disabled:opacity-50 active:scale-[0.99]"
                                    >
                                        {isLoading ? (
                                            <>
                                                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                                <span>Synthesizing Verified Bullets...</span>
                                            </>
                                        ) : (
                                            <>
                                                <MdAutoAwesome className="w-4 h-4" />
                                                <span>Generate Bullets from My Answers</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            {generatedBullets.length > 0 && (
                                <div className="space-y-2 pt-3 border-t border-slate-100">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                                Synthesized Bullets ({generatedBullets.length})
                                            </span>
                                            <button
                                                type="button"
                                                onClick={toggleSelectAll}
                                                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 cursor-pointer"
                                            >
                                                {allSelected ? 'Deselect All' : 'Select All'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {generatedBullets.map((bullet, idx) => {
                                            const analysis = getBulletAnalysis(bullet);
                                            return (
                                                <div
                                                    key={`gen-int-${idx}`}
                                                    className={`p-3 rounded-xl border transition-all space-y-2 ${
                                                        selectedBullets[idx]
                                                            ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-500/20'
                                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                                    }`}
                                                >
                                                    <label className="flex items-start gap-3 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!selectedBullets[idx]}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                setSelectedBullets((prev) => ({ ...prev, [idx]: checked }));
                                                            }}
                                                            className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 accent-indigo-600 shrink-0"
                                                        />
                                                        <div className="flex-1 space-y-1">
                                                            <span className="text-xs text-slate-800 leading-relaxed block font-medium">
                                                                {bullet}
                                                            </span>
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                                        analysis.status === 'green'
                                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                            : analysis.status === 'amber'
                                                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                                            : 'bg-rose-50 text-rose-700 border-rose-200'
                                                                    }`}
                                                                >
                                                                    {analysis.status === 'green' ? '🟢 100% ATS Ready' : `🟡 ${analysis.badgeText}`}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400">
                                                                    {bullet.length} chars
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </label>

                                                    {/* Quick Metric Injector if missing metric */}
                                                    {!analysis.hasMetric && (
                                                        <div className="pt-1.5 border-t border-dashed border-slate-200/80 flex items-center gap-1.5 flex-wrap pl-7">
                                                            <span className="text-[10px] font-bold text-amber-800">⚡ No metric yet:</span>
                                                            <span className="text-[10px] text-amber-900">Add a number you can verify once it is in your resume, or use Quantify to add one now.</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                        <span>🛡️ Fact-Preserving AI</span>
                        <span className="text-slate-300">·</span>
                        <span>Zero Hallucination</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
                        >
                            Close
                        </button>

                        {generatedBullets.length > 0 && (
                            <>
                                {bullets.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => handleApplySelected('append')}
                                        disabled={selectedCount === 0}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                                        title="Keep your current bullets and add selected ones below"
                                    >
                                        <span>Append (+{selectedCount})</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => handleApplySelected('replace')}
                                    disabled={selectedCount === 0}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 rounded-xl shadow-xs hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                                    title={bullets.length > 0 ? "Replace current bullets with selected ones" : "Apply selected bullets"}
                                >
                                    <MdCheckCircle className="w-4 h-4" />
                                    <span>
                                        {bullets.length > 0 ? `Replace All (${selectedCount})` : `Apply Bullets (${selectedCount})`}
                                    </span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
