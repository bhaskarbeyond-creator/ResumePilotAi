import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaBullseye, FaLightbulb, FaPlus, FaRedo, FaRobot, FaSpinner } from 'react-icons/fa';
import { getLiveAnswerGuide } from '../../../services/liveInterviewApi';
import { getAiCacheScope } from '../../../services/aiService';

// In-memory cache to avoid duplicate AI requests for the same question within a
// session. Keys include the uid|tenant scope so one identity's guide is never
// served to another after an account or tenant switch in the same tab.
const guideCache = new Map();
const GUIDE_CACHE_LIMIT = 100;

export function guideCacheKey(scope, role, question) {
    return `${scope}::${String(role || '').trim().toLowerCase()}::${String(question || '').trim().toLowerCase()}`;
}

function guideCacheSet(key, value) {
    guideCache.delete(key);
    guideCache.set(key, value);
    if (guideCache.size > GUIDE_CACHE_LIMIT) guideCache.delete(guideCache.keys().next().value);
}

// When no AI answer is available the guide shows an explicit unavailable state.
// It never synthesizes a model answer: a canned STAR story would put invented
// experience and metrics into the candidate's mouth.
function isTemplatePlaceholder(text = '') {
    if (!text || typeof text !== 'string') return true;
    return /opening situation sentence|specific technical decision|quantified metric or outcome|\[(Feature|Option|Metric|Role|X)\]/i.test(text);
}

export default function LiveAnswerGuide({
    question = '',
    topic = '',
    intent = '',
    modelAnswer: propModelAnswer = '',
    tip: propTip = '',
    role = '',
    resumeFacts = '',
    talkingPoints,
    onInsertSnippet,
}) {
    const [loading, setLoading] = useState(false);
    const [regenerating, setRegenerating] = useState(false);
    const [aiGuide, setAiGuide] = useState(null);
    const [regeneratedMap, setRegeneratedMap] = useState({});
    const activeQuestionRef = useRef(question);

    useEffect(() => {
        activeQuestionRef.current = question;
    }, [question]);

    // Check if the backend already supplied an AI-generated model answer for this turn
    const hasPropModelAnswer = Boolean(
        propModelAnswer &&
        propModelAnswer.trim().length > 25 &&
        !isTemplatePlaceholder(propModelAnswer)
    );

    useEffect(() => {
        if (!question || question.trim().length < 5) {
            setAiGuide(null);
            return;
        }

        // 0. If user previously regenerated an answer for this question, keep that fresh answer
        if (regeneratedMap[question]) {
            setAiGuide(regeneratedMap[question]);
            return;
        }

        // 1. If backend already delivered the AI model answer with the turn, use it directly!
        if (hasPropModelAnswer) {
            setAiGuide({
                goal: intent || '',
                modelAnswer: propModelAnswer.trim(),
                tip: propTip || '',
            });
            return;
        }

        let isCurrent = true;
        const controller = new AbortController();

        (async () => {
            const scope = await getAiCacheScope();
            if (!isCurrent) return;
            // 2. Check client-side cache (scoped to uid|tenant)
            const cacheKey = guideCacheKey(scope, role, question);
            const cached = guideCache.get(cacheKey);
            if (cached && !isTemplatePlaceholder(cached.modelAnswer)) {
                setAiGuide(cached);
                return;
            }
            guideCache.delete(cacheKey);

            // 3. Talking points delivered by the AI turn, combined verbatim
            if (
                Array.isArray(talkingPoints) &&
                talkingPoints.length >= 2 &&
                talkingPoints.every(p => typeof p === 'string' && p.length > 10 && !isTemplatePlaceholder(p))
            ) {
                const combined = talkingPoints.join(' ');
                if (!isTemplatePlaceholder(combined)) {
                    const synthesized = { goal: intent || '', modelAnswer: combined, tip: propTip || '' };
                    guideCacheSet(cacheKey, synthesized);
                    setAiGuide(synthesized);
                    return;
                }
            }

            // 4. Request an AI answer for this specific question from the server
            setLoading(true);
            try {
                const res = await getLiveAnswerGuide(
                    { question, role, topic, resumeFacts },
                    { signal: controller.signal, timeoutMs: 25_000 }
                );
                if (!isCurrent) return;
                if (res && res.modelAnswer && res.modelAnswer.length > 20 && !isTemplatePlaceholder(res.modelAnswer)) {
                    const guideData = { goal: res.goal || intent || '', modelAnswer: res.modelAnswer, tip: res.tip || propTip || '' };
                    guideCacheSet(cacheKey, guideData);
                    setAiGuide(guideData);
                } else {
                    setAiGuide({ unavailable: true, goal: intent || '', modelAnswer: '', tip: propTip || '' });
                }
            } catch {
                if (!isCurrent) return;
                setAiGuide({ unavailable: true, goal: intent || '', modelAnswer: '', tip: propTip || '' });
            } finally {
                if (isCurrent) setLoading(false);
            }
        })();

        return () => {
            isCurrent = false;
            controller.abort();
        };
    }, [question, role, topic, intent, propModelAnswer, propTip, hasPropModelAnswer, resumeFacts, talkingPoints, regeneratedMap]);

    // Active guide data: AI-generated only. Empty while loading or unavailable.
    const activeGuide = useMemo(() => aiGuide || { goal: intent || '', modelAnswer: '', tip: propTip || '' }, [aiGuide, intent, propTip]);
    const guideUnavailable = !loading && !activeGuide.modelAnswer;

    // Regenerate an alternative 10/10 STAR answer on-demand for the current question
    const handleRegenerate = useCallback(async () => {
        if (!question || question.trim().length < 5 || loading || regenerating) return;
        const cacheKey = guideCacheKey(await getAiCacheScope(), role, question);
        guideCache.delete(cacheKey);
        setRegenerating(true);
        setLoading(true);

        try {
            const res = await getLiveAnswerGuide(
                { question, role, topic, resumeFacts, regenerate: true },
                { timeoutMs: 30_000 }
            );
            if (res && res.modelAnswer && res.modelAnswer.length > 20 && !isTemplatePlaceholder(res.modelAnswer)) {
                const guideData = { goal: res.goal || intent || '', modelAnswer: res.modelAnswer, tip: res.tip || propTip || '' };
                guideCacheSet(cacheKey, guideData);
                setAiGuide(guideData);
                setRegeneratedMap(prev => ({ ...prev, [question]: guideData }));
            }
        } catch (err) {
            console.warn('Failed to regenerate answer guide:', err?.message);
        } finally {
            setRegenerating(false);
            setLoading(false);
        }
    }, [question, role, topic, resumeFacts, loading, regenerating, intent, propTip]);

    if (!question) return null;

    return (
        <section
            aria-label="Interview answer guide"
            className="rounded-2xl border border-indigo-200/80 bg-white p-3 shadow-xs shrink-0 flex flex-col gap-2 animate-fadeIn"
        >
            {/* 1) Interviewer's Goal of asking that particular Question */}
            <div className="flex items-start gap-2.5 bg-gradient-to-r from-indigo-50/90 via-slate-50 to-white border border-indigo-100/90 rounded-xl px-3 py-2 text-xs">
                <span className="w-5 h-5 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 text-xs shadow-2xs mt-0.5" aria-hidden="true">
                    <FaBullseye className="w-3 h-3" />
                </span>
                <div className="min-w-0 flex-1 leading-snug">
                    <span className="text-[11px] font-black uppercase tracking-wider text-indigo-950 mr-1.5 inline-block">
                        Interviewer's Goal:
                    </span>
                    <span className="text-slate-700 font-medium text-xs">
                        {activeGuide.goal || (loading ? 'Analyzing interviewer intent for this question…' : 'Not available for this question.')}
                    </span>
                </div>
            </div>

            {/* 2) Full Candidate 10/10 relevant Answer that Interviewer is expecting */}
            <div className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-2.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${loading ? 'bg-amber-400 animate-spin' : 'bg-emerald-500 animate-pulse'}`} />
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5 truncate">
                            Candidate 10/10 Answer
                            {loading && (
                                <span className="text-[10px] text-indigo-600 font-bold inline-flex items-center gap-1 normal-case">
                                    <FaSpinner className="w-2.5 h-2.5 animate-spin" />
                                    {regenerating ? 'Regenerating 10/10 STAR answer…' : 'AI crafting answer…'}
                                </span>
                            )}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium hidden sm:inline shrink-0">
                            (10/10 STAR Response)
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {/* Option to regenerate this answer */}
                        <button
                            type="button"
                            onClick={handleRegenerate}
                            disabled={loading || regenerating || !question}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 hover:border-slate-300 px-2 py-0.5 text-[10px] font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Regenerate an alternative 10/10 STAR answer for this question"
                        >
                            <FaRedo className={`w-2 h-2 text-indigo-600 ${regenerating ? 'animate-spin' : ''}`} />
                            <span>{regenerating ? 'Regenerating…' : 'Regenerate'}</span>
                        </button>
                        {onInsertSnippet && !loading && !regenerating && activeGuide.modelAnswer && (
                            <button
                                type="button"
                                onClick={() => onInsertSnippet(activeGuide.modelAnswer)}
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 shadow-2xs transition-colors cursor-pointer"
                                title="Click to insert this model answer into your response box"
                            >
                                <FaPlus className="w-2 h-2 text-indigo-600" />
                                <span>Use as answer</span>
                            </button>
                        )}
                    </div>
                </div>

                {guideUnavailable ? (
                    <p role="status" className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900">
                        AI answer guidance is unavailable right now. Answer from your own experience, or press Regenerate to try again.
                    </p>
                ) : loading && !activeGuide.modelAnswer ? (
                    <div className="bg-white/95 border border-slate-150 rounded-lg p-3 text-xs text-slate-500 flex items-center gap-2">
                        <FaRobot className="w-4 h-4 text-indigo-600 animate-pulse" />
                        <span>AI is generating a tailored 10/10 STAR answer for: "{question}"</span>
                    </div>
                ) : (
                    <p className={`text-xs sm:text-[13px] text-slate-800 leading-relaxed font-normal bg-white/95 border border-slate-150 rounded-lg p-2.5 shadow-2xs transition-opacity duration-150 ${regenerating ? 'opacity-50' : 'opacity-100'}`}>
                        "{activeGuide.modelAnswer}"
                    </p>
                )}
            </div>

            {/* 3) Tip */}
            <div className="flex items-center gap-2 bg-amber-50/90 border border-amber-200/80 rounded-xl px-3 py-1.5 text-xs text-amber-950">
                <FaLightbulb className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <div className="min-w-0 flex-1 text-[11px] leading-snug">
                    <span className="font-extrabold text-amber-950 mr-1.5">Tip:</span>
                    <span className="text-amber-900 font-medium">
                        {activeGuide.tip || (loading ? 'Formulating tactical tip…' : 'Not available for this question.')}
                    </span>
                </div>
            </div>
        </section>
    );
}
