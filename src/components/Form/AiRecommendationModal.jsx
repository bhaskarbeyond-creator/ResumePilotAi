import React, { useState, useEffect } from 'react';
import { FaCheck, FaTimes, FaMagic, FaFire, FaPlus } from 'react-icons/fa';

/**
 * 10/10 World-Class AI Recommendation Review Modal
 * Categorizes AI suggestions into Mandatory/Core & Recommended items.
 * Allows candidates to review, check/uncheck, and approve only the items they actually possess.
 */
export function AiRecommendationModal({ isOpen, onClose, title, type, items = [], onApply }) {
    const [selectedIds, setSelectedIds] = useState(new Set());

    useEffect(() => {
        if (isOpen && items.length > 0) {
            // Select all items by default, user can easily toggle off unneeded ones
            const initialSet = new Set(items.map((_, i) => i));
            setSelectedIds(initialSet);
        }
    }, [isOpen, items]);

    if (!isOpen) return null;

    const toggleItem = (index) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const selectAll = () => {
        setSelectedIds(new Set(items.map((_, i) => i)));
    };

    const selectNone = () => {
        setSelectedIds(new Set());
    };

    const handleConfirm = () => {
        const approved = items.filter((_, i) => selectedIds.has(i));
        onApply(approved);
        onClose();
    };

    const mandatoryItems = items.map((item, idx) => ({ ...item, originalIndex: idx })).filter(item => item.category === 'mandatory' || item.type === 'mandatory');
    const recommendedItems = items.map((item, idx) => ({ ...item, originalIndex: idx })).filter(item => item.category !== 'mandatory' && item.type !== 'mandatory');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-sans animate-fadeIn">
            <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Modal Header */}
                <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 flex-shrink-0">
                            <FaMagic className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="text-base font-extrabold text-white! text-slate-50! leading-snug tracking-tight drop-shadow-xs" style={{ color: '#ffffff' }}>
                                {title || 'Review AI Recommendations'}
                            </h3>
                            <p className="text-xs font-medium text-slate-300! opacity-90 mt-0.5" style={{ color: '#cbd5e1' }}>
                                Check ONLY the items you actually possess to add them to your resume
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors">
                        <FaTimes className="w-4 h-4 text-slate-300 hover:text-white" />
                    </button>
                </div>

                {/* Sub-Header Actions */}
                <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600">
                        {selectedIds.size} of {items.length} selected for import
                    </span>
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={selectAll} className="text-indigo-600 font-bold hover:underline">Select All</button>
                        <span className="text-slate-300">|</span>
                        <button type="button" onClick={selectNone} className="text-slate-500 font-medium hover:underline">Deselect All</button>
                    </div>
                </div>

                {/* Modal Content / Scrollable List */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    
                    {/* Mandatory / Core Section */}
                    {mandatoryItems.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                                    <FaFire className="w-3 h-3" /> Mandatory / Core Required
                                </span>
                                <span className="text-xs text-slate-500">Essential keywords standard for your target role</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {mandatoryItems.map((item) => {
                                    const isSelected = selectedIds.has(item.originalIndex);
                                    const name = item.name || item.title;
                                    return (
                                        <div
                                            key={item.originalIndex}
                                            onClick={() => toggleItem(item.originalIndex)}
                                            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                                isSelected
                                                    ? 'bg-rose-50/60 border-rose-300 ring-2 ring-rose-500/20 text-slate-900 shadow-2xs'
                                                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 opacity-70'
                                            }`}>
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-colors ${
                                                    isSelected ? 'bg-rose-600 border-rose-600 text-white' : 'border-slate-300 bg-slate-50'
                                                }`}>
                                                    {isSelected && <FaCheck className="w-3 h-3" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold truncate">{name}</p>
                                                    {item.issuer && <p className="text-[10px] text-slate-400 truncate">{item.issuer}</p>}
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-rose-100/80 text-rose-700 uppercase">Core</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Recommended / Specialized Section */}
                    {recommendedItems.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                                    <FaMagic className="w-3 h-3" /> Recommended / Advanced
                                </span>
                                <span className="text-xs text-slate-500">High-value specialized tools & frameworks</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {recommendedItems.map((item) => {
                                    const isSelected = selectedIds.has(item.originalIndex);
                                    const name = item.name || item.title;
                                    return (
                                        <div
                                            key={item.originalIndex}
                                            onClick={() => toggleItem(item.originalIndex)}
                                            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                                isSelected
                                                    ? 'bg-indigo-50/60 border-indigo-300 ring-2 ring-indigo-500/20 text-slate-900 shadow-2xs'
                                                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 opacity-70'
                                            }`}>
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-colors ${
                                                    isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-slate-50'
                                                }`}>
                                                    {isSelected && <FaCheck className="w-3 h-3" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold truncate">{name}</p>
                                                    {item.issuer && <p className="text-[10px] text-slate-400 truncate">{item.issuer}</p>}
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-100/80 text-indigo-700">Recommended</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Modal Footer Actions */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-2xl text-xs font-bold transition-all">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={selectedIds.size === 0}
                        className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50">
                        <FaPlus className="w-3 h-3" />
                        <span>Add Approved Selected ({selectedIds.size})</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AiRecommendationModal;
