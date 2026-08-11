import React, { useState, useMemo } from 'react';
import { FaPlus, FaTrash, FaArrowUp, FaCheckCircle, FaExclamationCircle, FaMagic, FaUndo, FaChevronUp, FaChevronDown } from 'react-icons/fa';
import { generateUserAiContent } from '../../services/aiService';

/**
 * 10/10 World-Class BulletPointsEditor
 * Renders bullet points as clean, full-width card boxes matching 10/10 UX specs:
 * - Generous vertical scrollable/editable area for text on mobile
 * - Single-line horizontal bottom toolbar for all icons & actions (Quality Badge, Undo, AI Enhance, Counter, Move Up/Down, Delete)
 * - Batch "AI Enhance All Bullets" button for instant 1-click optimization of all bullet points
 * - Touch-friendly Move Up / Move Down buttons for quick position swapping
 */
const BulletPointsEditor = ({
    value = '',
    onChange,
    placeholder = 'e.g. Implemented automated CI/CD pipeline, reducing deployment time by 40%...',
    maxLength = 220,
    disabled = false
}) => {
    const [enhancingIndex, setEnhancingIndex] = useState(null);
    const [isEnhancingAll, setIsEnhancingAll] = useState(false);
    const [historyMap, setHistoryMap] = useState({}); // Stores previous text for undo

    // Parse value string into array of bullet strings
    const bullets = useMemo(() => {
        if (!value || typeof value !== 'string') return [''];
        const lines = value
            .split(/\r?\n/)
            .map((line) => line.replace(/^[\s•\-\*\d\.\)\s]+/, '').trim())
            .filter((line) => line.length > 0);
        return lines.length > 0 ? lines : [''];
    }, [value]);

    // Emit updated string to parent
    const emitChanges = (newBullets) => {
        const cleaned = newBullets
            .map((b) => b.trim())
            .filter(Boolean)
            .map((b) => `• ${b}`);
        const resultString = cleaned.join('\n');
        if (onChange) {
            onChange(resultString);
        }
    };

    const handleBulletChange = (index, newText, recordHistory = false) => {
        if (recordHistory && bullets[index] !== newText) {
            setHistoryMap((prev) => ({ ...prev, [index]: bullets[index] }));
        }
        const updated = [...bullets];
        updated[index] = newText;
        emitChanges(updated);
    };

    const handleAddBullet = () => {
        const updated = [...bullets, ''];
        emitChanges(updated);
    };

    const handleDeleteBullet = (index) => {
        if (bullets.length <= 1) {
            emitChanges(['']);
            return;
        }
        const updated = bullets.filter((_, i) => i !== index);
        // Clean up history
        setHistoryMap((prev) => {
            const next = { ...prev };
            delete next[index];
            return next;
        });
        emitChanges(updated);
    };

    const handleMoveUp = (index) => {
        if (index <= 0) return;
        const updated = [...bullets];
        const temp = updated[index];
        updated[index] = updated[index - 1];
        updated[index - 1] = temp;
        emitChanges(updated);
    };

    const handleMoveDown = (index) => {
        if (index >= bullets.length - 1) return;
        const updated = [...bullets];
        const temp = updated[index];
        updated[index] = updated[index + 1];
        updated[index + 1] = temp;
        emitChanges(updated);
    };

    const handleEnhanceSingleBullet = async (index) => {
        const currentText = bullets[index];
        if (!currentText || !currentText.trim() || enhancingIndex !== null || isEnhancingAll) return;

        // Record history before enhancement
        setHistoryMap((prev) => ({ ...prev, [index]: currentText }));
        setEnhancingIndex(index);

        try {
            const res = await generateUserAiContent('enhance-single-bullet', { bullet: currentText });
            if (res && res.enhancedBullet) {
                handleBulletChange(index, res.enhancedBullet, false);
            }
        } catch (err) {
            console.error('Failed to enhance single bullet point:', err);
        } finally {
            setEnhancingIndex(null);
        }
    };

    const handleEnhanceAll = async () => {
        if (isEnhancingAll || enhancingIndex !== null) return;
        const validIndices = bullets
            .map((b, i) => (b && b.trim() ? i : null))
            .filter((i) => i !== null);
        if (validIndices.length === 0) return;

        setIsEnhancingAll(true);
        // Snapshot current history
        const newHistory = { ...historyMap };
        bullets.forEach((b, i) => {
            if (b && b.trim()) newHistory[i] = b;
        });
        setHistoryMap(newHistory);

        const currentBullets = [...bullets];
        for (const idx of validIndices) {
            setEnhancingIndex(idx);
            try {
                const res = await generateUserAiContent('enhance-single-bullet', { bullet: currentBullets[idx] });
                if (res && res.enhancedBullet) {
                    currentBullets[idx] = res.enhancedBullet;
                }
            } catch (err) {
                console.error(`Failed to enhance bullet ${idx}:`, err);
            }
        }
        emitChanges(currentBullets);
        setEnhancingIndex(null);
        setIsEnhancingAll(false);
    };

    const handleUndo = (index) => {
        const previousText = historyMap[index];
        if (previousText !== undefined) {
            const currentText = bullets[index];
            handleBulletChange(index, previousText, false);
            // Swap or clear undo history
            setHistoryMap((prev) => ({ ...prev, [index]: currentText }));
        }
    };

    // Calculate quality rating for each bullet point based on metrics & action verbs
    const getBulletQuality = (text) => {
        if (!text || text.trim().length < 15) {
            return {
                label: 'Draft',
                color: 'text-slate-400 bg-slate-50 border-slate-200',
                icon: <FaExclamationCircle className="w-2.5 h-2.5 text-slate-400" />
            };
        }

        const hasMetric = /\d+|%|\$|\b(k|m|b)\b/i.test(text);
        const actionVerbRegex = /^(implemented|managed|developed|increased|reduced|achieved|led|engineered|designed|spearheaded|optimized|streamlined|created|built|launched|transformed|delivered|generated|boosted|cut|drove|scaled|revamped|automated|orchestrated|designed|championed)/i;
        const hasActionVerb = actionVerbRegex.test(text.trim());

        if (hasMetric && hasActionVerb) {
            return {
                label: 'Excellent',
                color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                icon: <FaArrowUp className="w-2.5 h-2.5 text-emerald-600" />
            };
        } else if (hasActionVerb || hasMetric) {
            return {
                label: 'Good',
                color: 'text-emerald-600 bg-emerald-50/60 border-emerald-200/80',
                icon: <FaArrowUp className="w-2.5 h-2.5 text-emerald-500" />
            };
        }

        return {
            label: 'Basic',
            color: 'text-amber-700 bg-amber-50 border-amber-200',
            icon: <FaCheckCircle className="w-2.5 h-2.5 text-amber-500" />
        };
    };

    const hasMultipleValidBullets = bullets.filter(b => b && b.trim()).length >= 2;

    return (
        <div className="space-y-3">
            {/* Top Toolbar: Batch AI Enhance All Bullets */}
            {hasMultipleValidBullets && (
                <div className="flex items-center justify-end mb-1">
                    <button
                        type="button"
                        onClick={handleEnhanceAll}
                        disabled={disabled || isEnhancingAll || enhancingIndex !== null}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all border shadow-2xs ${
                            isEnhancingAll
                                ? 'bg-indigo-600 text-white border-indigo-600 animate-pulse'
                                : 'bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 text-indigo-700 border-indigo-200/90'
                        }`}
                        title="Enhance all bullet points with AI in 1-click">
                        <FaMagic className={`w-3 h-3 ${isEnhancingAll ? 'animate-spin text-white' : 'text-indigo-600'}`} />
                        <span>{isEnhancingAll ? 'Enhancing All Bullets...' : '✨ Enhance All Bullets'}</span>
                    </button>
                </div>
            )}

            {bullets.map((bulletText, index) => {
                const quality = getBulletQuality(bulletText);
                const charCount = bulletText.length;
                const isOverLimit = charCount > maxLength;
                const isEnhancing = enhancingIndex === index;
                const canUndo = historyMap[index] !== undefined && historyMap[index] !== bulletText;

                return (
                    <div key={index} className="w-full">
                        {/* Bullet Card Box */}
                        <div className="w-full bg-white border border-slate-200/90 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 rounded-xl p-3 shadow-2xs transition-all relative">
                            {/* Top Bar: Reorder Buttons, Counter & Delete Button */}
                            <div className="flex items-center justify-between mb-1">
                                {/* Position Shift / Reorder Buttons */}
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => handleMoveUp(index)}
                                        disabled={disabled || index === 0 || isEnhancing || isEnhancingAll}
                                        className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:text-slate-300 rounded transition-colors"
                                        title="Move bullet up">
                                        <FaChevronUp className="w-2.5 h-2.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleMoveDown(index)}
                                        disabled={disabled || index === bullets.length - 1 || isEnhancing || isEnhancingAll}
                                        className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:text-slate-300 rounded transition-colors"
                                        title="Move bullet down">
                                        <FaChevronDown className="w-2.5 h-2.5" />
                                    </button>
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
                                value={bulletText}
                                onChange={(e) => handleBulletChange(index, e.target.value)}
                                disabled={disabled || isEnhancing || isEnhancingAll}
                                rows={3}
                                placeholder={placeholder}
                                className="w-full text-xs text-slate-800 bg-transparent border-0 outline-none p-0 min-h-[65px] font-normal leading-relaxed resize-y"
                            />

                            {/* Card Footer Bar — Quality Badge (Left) + Undo & AI Enhance (Right) */}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 mt-1.5">
                                {/* Left: Quality Badge */}
                                <div className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border flex-shrink-0 ${quality.color}`}>
                                    {quality.icon}
                                    <span>{quality.label}</span>
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
                                                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200/80 hover:border-indigo-300'
                                        }`}
                                        title="Enhance this single bullet point with AI">
                                        <FaMagic className={`w-2.5 h-2.5 ${isEnhancing ? 'animate-spin text-indigo-600' : 'text-indigo-600'}`} />
                                        <span>{isEnhancing ? 'Enhancing...' : 'AI Enhance'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Add Bullet Button */}
            <button
                type="button"
                onClick={handleAddBullet}
                disabled={disabled || isEnhancingAll}
                className="w-full py-2.5 bg-indigo-50/60 hover:bg-indigo-100/80 text-indigo-700 border border-dashed border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs mt-2">
                <FaPlus className="w-3 h-3" /> Add Bullet Point
            </button>
        </div>
    );
};

export default BulletPointsEditor;
