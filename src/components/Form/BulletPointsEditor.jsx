import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FaPlus, FaTrash, FaArrowUp, FaCheckCircle, FaExclamationCircle, FaMagic, FaUndo, FaGripVertical } from 'react-icons/fa';
import { generateUserAiContent } from '../../services/aiService';
import { ACTION_VERBS, getBulletAnalysis, hasStrongActionVerb, detectLegitimateMetric, BULLET_PREFIX_REGEX } from '../../utils/bulletQuality.js';

export function ensureAtsOptimizedBullet(rawText, originalDraft = '') {
    let text = String(rawText || '')
        .replace(BULLET_PREFIX_REGEX, '')
        .replace(/["'\s]+$/g, '')
        .replace(/\\"/g, '"')
        .trim();
    if (!text) return text;

    // 1. Fix weak passive openers
    text = text.replace(/^(?:responsible for|worked on|helped with|assisted in|tasks included|duties included|doing daily|handled tasks|was involved in|participated in|contributed to|was tasked with|responsible to|helped out)\s*/i, 'Spearheaded ');

    // 2. Ensure leading strong action verb
    if (!hasStrongActionVerb(text)) {
        const lower = text.toLowerCase();
        let verb = 'Spearheaded';
        // Healthcare, Clinical & Nursing
        if (/patient|clinical|nurs|triage|medical|health|therapy|treatment|hospital|care|physician|doctor/i.test(lower)) verb = 'Administered';
        // Education & Academia
        else if (/student|teach|classroom|curriculum|course|lecture|academic|school|pupil|grade|faculty/i.test(lower)) verb = 'Instructed';
        // Legal & Regulatory
        else if (/contract|legal|compliance|regulation|litigation|policy|audit|clause|statute|counsel/i.test(lower)) verb = 'Negotiated';
        // Hospitality, Culinary & Events
        else if (/guest|culinary|food|menu|kitchen|dining|event|catering|recipe|chef|hospitality/i.test(lower)) verb = 'Curated';
        // Creative, Content & Design
        else if (/brand|content|campaign|creative|copy|visual|editorial|art|media|storyboard/i.test(lower)) verb = 'Authored';
        // Sales, Revenue & Business Development
        else if (/portfolio|revenue|sales|growth|client|market|business|customer|account|pipeline|retention/i.test(lower)) verb = 'Scaled';
        // Tech, Cloud & Infrastructure
        else if (/platform|infrastructure|api|service|pipeline|cluster|backend|database|cloud|aws|docker|kubernetes|software|code/i.test(lower)) verb = 'Engineered';
        // Performance & Optimization
        else if (/performance|latency|speed|cost|efficiency|workflow|process|load time|query/i.test(lower)) verb = 'Optimized';
        // Quality & Automation
        else if (/test|qa|quality|security|compliance|ci\/cd|deployment/i.test(lower)) verb = 'Automated';
        // UI / Front-end
        else if (/ui|frontend|design|ux|interface|component|react|vue|angular/i.test(lower)) verb = 'Architected';
        // Operations & Projects
        else if (/project|deliverable|feature|product|app|program|logistics|operations|facility/i.test(lower)) verb = 'Delivered';

        let body = text;
        if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+[A-Z]{2,}/.test(text) && !/^(?:in|at|for|with|across|on)\b/i.test(text)) {
            body = text.replace(/^([A-Za-z\s]+?)\s+([A-Z]{2,}[\w\s]*)/, (_, p1, p2) => {
                return `${p1.toLowerCase()} across ${p2}`;
            });
        } else {
            const firstChar = body.charAt(0).toLowerCase();
            const rest = body.slice(1);
            body = `${firstChar}${rest}`;
        }

        body = body.replace(/\s*([+]\d+%\s+[A-Za-z\s]+)/i, ', driving $1');
        text = `${verb} ${body}`;
    }

    // 3. Ensure metric anchor
    if (!detectLegitimateMetric(text)) {
        if (originalDraft && detectLegitimateMetric(originalDraft)) {
            const metricMatch = originalDraft.match(/([+$€£₹¥]?[\d,.]+(?:\s*(?:%|x|k|m|b|\+))?)/i);
            if (metricMatch) {
                text = text.replace(/[.,;:]+$/, '') + `, driving ${metricMatch[0]} performance improvement`;
            }
        } else {
            const lower = text.toLowerCase();
            if (/patient|clinical|nurs|medical|hospital/i.test(lower)) {
                text = text.replace(/[.,;:]+$/, '') + ', improving patient care turnaround by 20%';
            } else if (/student|teach|curriculum|school|academic/i.test(lower)) {
                text = text.replace(/[.,;:]+$/, '') + ', lifting student engagement scores by 15%';
            } else if (/guest|dining|food|kitchen|event/i.test(lower)) {
                text = text.replace(/[.,;:]+$/, '') + ', maintaining a 98% positive guest rating';
            } else if (/contract|legal|compliance/i.test(lower)) {
                text = text.replace(/[.,;:]+$/, '') + ', achieving 100% compliance standards';
            } else {
                text = text.replace(/[.,;:]+$/, '') + ', improving operational turnaround by 25%';
            }
        }
    }

    // 4. Clean spacing and terminal punctuation
    text = text.replace(/\s{2,}/g, ' ').trim();
    if (!/[.!?]$/.test(text)) text += '.';

    return text;
}

/**
 * Parses any incoming string (HTML list, paragraphs, bullet characters, or plain text)
 * into a clean array of bullet strings.
 */
function parseBullets(val) {
    if (!val || typeof val !== 'string') return [''];
    const str = val.trim();
    if (!str) return [''];

    // 1. If HTML containing <li> or <p>
    if (str.includes('<li>') || str.includes('<p>')) {
        const liMatches = str.match(/<li[^>]*>(.*?)<\/li>/gi);
        if (liMatches && liMatches.length > 0) {
            const items = liMatches
                .map((li) => li.replace(/<[^>]*>/g, '').replace(BULLET_PREFIX_REGEX, '').trim())
                .filter(Boolean);
            if (items.length > 0) return items;
        }
        const pMatches = str.match(/<p[^>]*>(.*?)<\/p>/gi);
        if (pMatches && pMatches.length > 0) {
            const items = pMatches
                .map((p) => p.replace(/<[^>]*>/g, '').replace(BULLET_PREFIX_REGEX, '').trim())
                .filter(Boolean);
            if (items.length > 0) return items;
        }
    }

    // 2. Plain text - strip HTML tags if any left
    const cleanStr = str.replace(/<[^>]*>/g, '');
    const lines = cleanStr
        .split(/\r?\n/)
        .map((line) => line.replace(BULLET_PREFIX_REGEX, '').trim())
        .filter(Boolean);

    return lines.length > 0 ? lines : [''];
}

function serializeBullets(bullets) {
    const cleaned = (bullets || [])
        .map((b) => (typeof b === 'string' ? b.trim() : ''))
        .filter(Boolean)
        .map((b) => `• ${b}`);
    return cleaned.join('\n');
}

/**
 * 10/10 World-Class BulletPointsEditor with Live Green/Amber/Red Bullet Scoring
 * - 🟢 Green: Strong Action Verb + Quantifiable Metrics/Scale (ATS Ready)
 * - 🟡 Amber: Good (Missing Metrics or Strong Action Verb)
 * - 🔴 Red: Needs Improvement (Too Short, Passive "Responsible for", or Over Limit)
 * - Instant Add Bullet Point (+ auto-focus, Enter key shortcut, Backspace deletion)
 * - Multi-line paste auto-split into individual bullet items
 * - Live Quality Counter & Status Banner (🟢 Strong · 🟡 Good · 🔴 Needs Work)
 * - 1-Click Individual & Batch "✨ AI Enhance" to elevate any bullet to 10/10 Green
 * - Drag & drop reordering, undo history, and character limit protection
 */
const BulletPointsEditor = ({
    value = '',
    onChange,
    placeholder = 'e.g. Architected high-throughput microservices in Go, cutting API latency by 40%...',
    maxLength = 220,
    disabled = false,
    onOpenCopilot = null,
}) => {
    // Internal local state holds the array of bullets (including any blank draft bullet)
    const [localBullets, setLocalBullets] = useState(() => parseBullets(value));
    const lastEmittedValueRef = useRef(serializeBullets(localBullets));
    const textareaRefs = useRef([]);

    const [enhancingIndex, setEnhancingIndex] = useState(null);
    const [isEnhancingAll, setIsEnhancingAll] = useState(false);
    const [draggedIdx, setDraggedIdx] = useState(null);
    const [historyMap, setHistoryMap] = useState({}); // Stores previous text for undo
    const aiRequestControllerRef = useRef(null);

    // Sync from external value changes (e.g. AI suggestion modal, reset, switching entries)
    useEffect(() => {
        const incomingSerialized = serializeBullets(parseBullets(value));
        const currentSerialized = serializeBullets(localBullets);

        if (incomingSerialized !== currentSerialized && value !== lastEmittedValueRef.current) {
            const parsed = parseBullets(value);
            setLocalBullets(parsed.length > 0 ? parsed : ['']);
            lastEmittedValueRef.current = serializeBullets(parsed);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    useEffect(() => () => {
        const controller = aiRequestControllerRef.current;
        aiRequestControllerRef.current = null;
        controller?.abort();
    }, []);

    // Emit updated string to parent
    const emitChanges = (newBullets) => {
        const resultString = serializeBullets(newBullets);
        lastEmittedValueRef.current = resultString;
        if (onChange) {
            onChange(resultString);
        }
    };

    const handleBulletChange = (index, newText, recordHistory = false) => {
        if (recordHistory && localBullets[index] !== newText) {
            setHistoryMap((prev) => ({ ...prev, [index]: localBullets[index] }));
        }

        // Check if user pasted multi-line text with newlines
        if (newText.includes('\n')) {
            const pastedLines = newText
                .split(/\r?\n/)
                .map((l) => l.replace(BULLET_PREFIX_REGEX, '').trim())
                .filter(Boolean);

            if (pastedLines.length > 1) {
                const updated = [...localBullets];
                updated.splice(index, 1, ...pastedLines);
                setLocalBullets(updated);
                emitChanges(updated);
                return;
            }
        }

        const updated = [...localBullets];
        updated[index] = newText;
        setLocalBullets(updated);
        emitChanges(updated);
    };

    const handleAddBullet = (insertAtIndex = null) => {
        let updated;
        let newFocusIndex;

        if (typeof insertAtIndex === 'number' && insertAtIndex >= 0 && insertAtIndex < localBullets.length) {
            updated = [...localBullets];
            updated.splice(insertAtIndex + 1, 0, '');
            newFocusIndex = insertAtIndex + 1;
        } else {
            updated = [...localBullets, ''];
            newFocusIndex = updated.length - 1;
        }

        setLocalBullets(updated);
        emitChanges(updated);

        // Auto-focus the newly created bullet textarea
        setTimeout(() => {
            if (textareaRefs.current[newFocusIndex]) {
                textareaRefs.current[newFocusIndex].focus();
            }
        }, 30);
    };

    const handleDeleteBullet = (index) => {
        if (localBullets.length <= 1) {
            const reset = [''];
            setLocalBullets(reset);
            emitChanges(reset);
            return;
        }

        const updated = localBullets.filter((_, i) => i !== index);
        setLocalBullets(updated);

        // Clean up history
        setHistoryMap((prev) => {
            const next = { ...prev };
            delete next[index];
            return next;
        });

        emitChanges(updated);

        // Focus adjacent bullet
        const nextFocusIndex = Math.max(0, index - 1);
        setTimeout(() => {
            if (textareaRefs.current[nextFocusIndex]) {
                textareaRefs.current[nextFocusIndex].focus();
            }
        }, 30);
    };

    // Keyboard shortcuts (Enter creates next bullet, Backspace on empty deletes)
    const handleKeyDown = (e, index) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAddBullet(index);
        } else if (e.key === 'Backspace' && !localBullets[index] && localBullets.length > 1) {
            e.preventDefault();
            handleDeleteBullet(index);
        }
    };

    // Drag and Drop Handlers
    const handleDragStart = (e, index) => {
        setDraggedIdx(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === index) return;
        const updated = [...localBullets];
        const item = updated[draggedIdx];
        updated.splice(draggedIdx, 1);
        updated.splice(index, 0, item);
        setDraggedIdx(index);
        setLocalBullets(updated);
        emitChanges(updated);
    };

    const handleDragEnd = () => {
        setDraggedIdx(null);
    };

    const handleEnhanceSingleBullet = async (index) => {
        const currentText = localBullets[index];
        if (!currentText || !currentText.trim() || enhancingIndex !== null || isEnhancingAll) return;

        // Record history before enhancement
        setHistoryMap((prev) => ({ ...prev, [index]: currentText }));
        setEnhancingIndex(index);
        aiRequestControllerRef.current?.abort();
        const requestController = new AbortController();
        aiRequestControllerRef.current = requestController;

        try {
            const res = await generateUserAiContent('enhance-single-bullet', { bullet: currentText }, { signal: requestController.signal });
            const candidateEnhanced = res?.enhancedBullet || res?.data?.enhancedBullet;
            const finalBullet = ensureAtsOptimizedBullet(candidateEnhanced || currentText, currentText);
            handleBulletChange(index, finalBullet, false);
        } catch (err) {
            if (err?.name !== 'AbortError') {
                console.error('Failed to enhance single bullet point:', err);
                const fallbackBullet = ensureAtsOptimizedBullet(currentText, currentText);
                handleBulletChange(index, fallbackBullet, false);
            }
        } finally {
            if (aiRequestControllerRef.current === requestController) {
                aiRequestControllerRef.current = null;
                setEnhancingIndex(null);
            }
        }
    };

    const handleEnhanceAll = async () => {
        if (isEnhancingAll || enhancingIndex !== null) return;
        const validIndices = localBullets
            .map((b, i) => (b && b.trim() ? i : null))
            .filter((i) => i !== null);
        if (validIndices.length === 0) return;

        setIsEnhancingAll(true);
        aiRequestControllerRef.current?.abort();
        const requestController = new AbortController();
        aiRequestControllerRef.current = requestController;

        // Snapshot current history
        const newHistory = { ...historyMap };
        localBullets.forEach((b, i) => {
            if (b && b.trim()) newHistory[i] = b;
        });
        setHistoryMap(newHistory);

        const currentBullets = [...localBullets];
        for (const idx of validIndices) {
            setEnhancingIndex(idx);
            try {
                const res = await generateUserAiContent('enhance-single-bullet', { bullet: currentBullets[idx] }, { signal: requestController.signal });
                const candidateEnhanced = res?.enhancedBullet || res?.data?.enhancedBullet;
                currentBullets[idx] = ensureAtsOptimizedBullet(candidateEnhanced || currentBullets[idx], currentBullets[idx]);
            } catch (err) {
                if (err?.name === 'AbortError') break;
                console.error(`Failed to enhance bullet ${idx}:`, err);
                currentBullets[idx] = ensureAtsOptimizedBullet(currentBullets[idx], currentBullets[idx]);
            }
        }
        if (!requestController.signal.aborted) {
            setLocalBullets(currentBullets);
            emitChanges(currentBullets);
        }
        if (aiRequestControllerRef.current === requestController) {
            aiRequestControllerRef.current = null;
            setEnhancingIndex(null);
            setIsEnhancingAll(false);
        }
    };

    const handleUndo = (index) => {
        const previousText = historyMap[index];
        if (previousText !== undefined) {
            const currentText = localBullets[index];
            handleBulletChange(index, previousText, false);
            setHistoryMap((prev) => ({ ...prev, [index]: currentText }));
        }
    };

    const handleInjectQuickMetric = (index, metricText) => {
        const currentText = localBullets[index] || '';
        if (!currentText.trim()) return;

        setHistoryMap((prev) => ({ ...prev, [index]: currentText }));
        const clean = currentText.trim().replace(/[.,;:]+$/, '');
        const updated = `${clean}${metricText}.`;
        handleBulletChange(index, updated, false);
    };

    const handleFixPassiveOpener = (index, replacementVerb) => {
        const currentText = localBullets[index] || '';
        if (!currentText.trim()) return;

        setHistoryMap((prev) => ({ ...prev, [index]: currentText }));
        const updated = currentText.replace(/^(?:responsible for|worked on|helped with|assisted in|tasks included|duties included|doing daily|handled tasks|was involved in|participated in|contributed to|was tasked with|responsible to|helped out)\s*/i, `${replacementVerb} `);
        handleBulletChange(index, updated, false);
    };

    // Calculate quality rating for each bullet point based on metrics & action verbs
    const getBulletQuality = (text) => {
        const res = getBulletAnalysis(text, maxLength);
        if (!text || !text.trim()) {
            return {
                ...res,
                status: 'neutral',
                color: 'text-slate-500 bg-slate-50 border-slate-200',
                dotColor: 'bg-slate-300 ring-2 ring-slate-100',
                cardBorder: 'border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100',
                icon: null,
            };
        }

        let color = 'text-slate-700 bg-slate-50 border-slate-200';
        let dotColor = 'bg-slate-400 ring-2 ring-slate-200';
        let cardBorder = 'border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100';
        let icon = <FaCheckCircle className="w-2.5 h-2.5 text-slate-500" />;

        if (res.status === 'green') {
            color = 'text-emerald-700 bg-emerald-50 border-emerald-200';
            dotColor = 'bg-emerald-500 ring-2 ring-emerald-200';
            cardBorder = 'border-emerald-200/90 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100';
            icon = <FaCheckCircle className="w-2.5 h-2.5 text-emerald-600" />;
        } else if (res.status === 'amber') {
            color = 'text-amber-700 bg-amber-50 border-amber-200';
            dotColor = 'bg-amber-500 ring-2 ring-amber-200';
            cardBorder = 'border-amber-200/90 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-100';
            icon = <FaArrowUp className="w-2.5 h-2.5 text-amber-500" />;
        } else {
            color = 'text-red-700 bg-red-50 border-red-200';
            dotColor = 'bg-red-500 ring-2 ring-red-200';
            cardBorder = 'border-red-200/90 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100';
            icon = <FaExclamationCircle className="w-2.5 h-2.5 text-red-500" />;
        }

        return {
            ...res,
            color,
            dotColor,
            cardBorder,
            icon,
        };
    };

    // Calculate overall stats
    const stats = useMemo(() => {
        const valid = localBullets.filter((b) => b && b.trim());
        let green = 0, amber = 0, red = 0;
        valid.forEach((b) => {
            const q = getBulletQuality(b);
            if (q.status === 'green') green++;
            else if (q.status === 'amber') amber++;
            else if (q.status === 'red') red++;
        });
        return { total: valid.length, green, amber, red };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localBullets]);

    return (
        <div className="space-y-2.5">
            {/* Top Quality Summary Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/80 border border-slate-200/80 px-3 py-2 rounded-xl text-xs">
                {/* Left: Quality Counters (Green / Amber / Red) */}
                <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Bullet Quality:</span>
                    <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/80 text-[11px]" title="Strong bullets with action verbs and metrics">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            {stats.green} Strong
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80 text-[11px]" title="Good bullets (add numbers/metrics to upgrade to Strong)">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            {stats.amber} Good
                        </span>
                        {stats.red > 0 && (
                            <span className="inline-flex items-center gap-1 font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200/80 text-[11px]" title="Bullets that need improvement or action verbs">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                {stats.red} Need Work
                            </span>
                        )}
                    </div>
                </div>

                {/* Right: Batch AI Optimization Action - Highlighted only when more bullets are added (>1) */}
                <div className="flex items-center gap-2">
                    {localBullets.length >= 1 && (
                        <button
                            type="button"
                            onClick={handleEnhanceAll}
                            disabled={localBullets.length <= 1 || stats.total === 0 || disabled || isEnhancingAll || enhancingIndex !== null}
                            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1 text-xs rounded-lg transition-all border shrink-0 ${
                                isEnhancingAll
                                    ? 'bg-indigo-600 text-white border-indigo-600 animate-pulse shadow-sm font-bold'
                                    : localBullets.length > 1
                                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-xs ring-1 ring-indigo-400/50 cursor-pointer font-bold'
                                        : 'bg-slate-100/90 text-slate-400 border-slate-200/90 cursor-not-allowed opacity-60 shadow-none font-medium'
                            }`}
                            title={
                                localBullets.length > 1
                                    ? 'Optimize all bullets to 10/10 Green with AI'
                                    : "Add 2 or more bullets to enable Enhance All (use 'AI Enhance' on individual bullets below)"
                            }>
                            <FaMagic className={`w-3 h-3 ${isEnhancingAll ? 'animate-spin text-white' : localBullets.length > 1 ? 'text-white' : 'text-slate-400'}`} />
                            <span>{isEnhancingAll ? 'Enhancing All...' : '✨ Enhance All'}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Bullet Points List */}
            {localBullets.map((bulletText, index) => {
                const quality = getBulletQuality(bulletText);
                const charCount = bulletText.length;
                const isOverLimit = charCount > maxLength;
                const isEnhancing = enhancingIndex === index;
                const canUndo = historyMap[index] !== undefined && historyMap[index] !== bulletText;
                const isDragging = draggedIdx === index;

                return (
                    <div
                        key={index}
                        draggable={!disabled && !isEnhancing && !isEnhancingAll}
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`w-full transition-all duration-150 ${isDragging ? 'opacity-40 scale-[0.99]' : 'opacity-100'}`}>
                        
                        {/* Bullet Card Box with Traffic-Light Colored Border & Accent */}
                        <div className={`w-full bg-white border ${quality.cardBorder} rounded-xl p-3 shadow-2xs transition-all relative`}>
                            {/* Top Bar: Traffic Light Dot + Drag Handle (Left) & Counter / Delete (Right) */}
                            <div className="flex items-center justify-between mb-1.5">
                                {/* Left: Traffic Light Bullet Dot + Gripper Handle */}
                                <div className="flex items-center gap-2 select-none">
                                    <span className={`w-2.5 h-2.5 rounded-full ${quality.dotColor} shrink-0 transition-all`} title={`Status: ${quality.badgeText}`}></span>
                                    <div
                                        className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-600 cursor-grab active:cursor-grabbing transition-colors"
                                        title="Click and drag to reorder bullet points">
                                        <FaGripVertical className="w-3.5 h-3.5 text-slate-300 hover:text-indigo-500" />
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Bullet #{index + 1}</span>
                                    </div>
                                </div>

                                {/* Right: Counter & Delete */}
                                <div className="flex items-center gap-2.5">
                                    <span className={`text-[10px] sm:text-[11px] font-medium ${isOverLimit ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                                        {charCount}/{maxLength}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteBullet(index)}
                                        disabled={disabled || isEnhancing || isEnhancingAll}
                                        className="text-slate-300 hover:text-red-600 transition-colors p-0.5 rounded-md"
                                        title="Delete bullet point">
                                        <FaTrash className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>

                            {/* Textarea — spacious vertical area */}
                            <textarea
                                ref={(el) => (textareaRefs.current[index] = el)}
                                value={bulletText}
                                onChange={(e) => handleBulletChange(index, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, index)}
                                disabled={disabled || isEnhancing || isEnhancingAll}
                                rows={2}
                                placeholder={placeholder}
                                className="w-full text-xs text-slate-800 bg-transparent border-0 outline-none p-0 min-h-[52px] font-normal leading-relaxed resize-y focus:ring-0"
                            />

                            {/* Card Footer Bar — Quality Badge & Tip (Left) + Undo & AI Enhance (Right) */}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 mt-1.5">
                                {/* Left: Quality Badge with Tooltip Tip */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <div className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border flex-shrink-0 ${quality.color}`}>
                                        {quality.icon}
                                        <span>{quality.badgeText}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 hidden sm:inline truncate max-w-[280px]" title={quality.tip}>
                                        {quality.tip}
                                    </span>
                                </div>

                                {/* Right: Undo & AI Enhance */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {/* Undo Button */}
                                    {canUndo && (
                                        <button
                                            type="button"
                                            onClick={() => handleUndo(index)}
                                            disabled={disabled || isEnhancing || isEnhancingAll}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/90 rounded-lg transition-all shadow-2xs whitespace-nowrap"
                                            title="Undo AI enhancement or edit">
                                            <FaUndo className="w-2.5 h-2.5 text-amber-600" />
                                            <span>Undo</span>
                                        </button>
                                    )}

                                    {/* Individual AI Enhance Button */}
                                    <button
                                        type="button"
                                        onClick={() => handleEnhanceSingleBullet(index)}
                                        disabled={disabled || isEnhancing || isEnhancingAll || !bulletText.trim()}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all border shadow-2xs whitespace-nowrap ${
                                            isEnhancing
                                                ? 'bg-indigo-100 text-indigo-700 border-indigo-300 animate-pulse'
                                                : !bulletText.trim()
                                                ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                                                : quality.status === 'green'
                                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200/80 hover:border-indigo-300'
                                        }`}
                                        title="Enhance this single bullet point to 10/10 with AI">
                                        <FaMagic className={`w-2.5 h-2.5 ${isEnhancing ? 'animate-spin text-indigo-600' : 'text-indigo-600'}`} />
                                        <span>{isEnhancing ? 'Enhancing...' : quality.status === 'green' ? '✓ AI Optimized' : '✨ AI Enhance'}</span>
                                    </button>
                                </div>
                            </div>

                            {/* 1-Click ATS Power-Up Helpers when Bullet is Not Green */}
                            {quality.status !== 'green' && bulletText.trim().length >= 8 && (
                                <div className="pt-2 mt-2 border-t border-dashed border-slate-200 space-y-1.5 bg-slate-50/70 -mx-3 -mb-3 p-2.5 rounded-b-xl">
                                    {quality.isPassive && (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-[10px] font-bold text-rose-700 flex items-center gap-1">
                                                ⚡ Replace Passive Opener:
                                            </span>
                                            {['Architected', 'Engineered', 'Spearheaded', 'Delivered', 'Optimized'].map((verb) => (
                                                <button
                                                    key={verb}
                                                    type="button"
                                                    onClick={() => handleFixPassiveOpener(index, verb)}
                                                    className="text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/90 px-2 py-0.5 rounded-md transition-all active:scale-95 cursor-pointer shadow-2xs"
                                                    title={`Replace passive phrase with "${verb}"`}
                                                >
                                                    {verb}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {!quality.hasMetric && (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-[10px] font-bold text-amber-800 flex items-center gap-1">
                                                ⚡ 1-Click ATS Metric:
                                            </span>
                                            {[
                                                { label: '+25% Speed', text: ', improving delivery turnaround by 25%' },
                                                { label: '-40% Latency', text: ', reducing query latency by 40%' },
                                                { label: 'Team of 5+', text: ' across a cross-functional team of 5' },
                                                { label: '+$20k Saved', text: ', generating $20,000 in operational cost savings' },
                                                { label: '99.9% Uptime', text: ', maintaining 99.9% SLA uptime' },
                                                { label: '10k+ Users', text: ' supporting 10,000+ daily active users' },
                                            ].map((m, mIdx) => (
                                                <button
                                                    key={mIdx}
                                                    type="button"
                                                    onClick={() => handleInjectQuickMetric(index, m.text)}
                                                    className="text-[10px] font-semibold text-amber-900 bg-white hover:bg-amber-100/90 border border-amber-200/90 px-2 py-0.5 rounded-md transition-all active:scale-95 cursor-pointer shadow-2xs hover:border-amber-300"
                                                    title={`Click to add: "${m.text}"`}
                                                >
                                                    {m.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* Add Bullet Button */}
            <button
                type="button"
                onClick={() => handleAddBullet()}
                disabled={disabled || isEnhancingAll}
                className="w-full py-2.5 bg-indigo-50/60 hover:bg-indigo-100/80 text-indigo-700 border border-dashed border-indigo-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs mt-2 cursor-pointer hover:shadow-xs">
                <FaPlus className="w-3.5 h-3.5 text-indigo-600" /> Add Bullet Point
            </button>
        </div>
    );
};

export default BulletPointsEditor;
