import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MdAdd, MdCheck, MdKeyboardArrowDown, MdDelete } from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Field from '../components/Field.jsx';
import BulletPointsEditor from '../../Form/BulletPointsEditor';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { getCandidateContext } from '../../../utils/candidateContext';

/**
 * Custom sections — "Add a section" (blank, named by the candidate).
 * "Sections that fit your profile" is a deterministic scan of the
 * candidate's OWN text (publications / volunteering / speaking / open
 * source / memberships) — suggestions, clearly labeled, one click to add
 * a blank section with that name.
 */

const SECTION_SIGNALS = [
    { title: 'Publications', pattern: /\b(?:publi|journal|arxiv|research\s+paper|paper)\w*\b/iu },
    { title: 'Patents', pattern: /\bpatent\w*\b/iu },
    { title: 'Volunteering', pattern: /\b(?:volunteer\w*|volunteering|community\s+service|pro[- ]?bono)\b/iu },
    { title: 'Speaking & Presentations', pattern: /\b(?:keynote|speaker|speaking|conference|workshop|seminar|presented|talk)\w*\b/iu },
    { title: 'Open Source Contributions', pattern: /\b(?:open[- ]?source|github|gitlab|contribut\w*)\b/iu },
    { title: 'Memberships', pattern: /\b(?:membership|member\s+of|association|society|fellowship)\w*\b/iu },
];

function collectProfileText(resumeData = {}) {
    const parts = [
        resumeData.summary,
        resumeData.occupation,
        ...(resumeData.employments || []).map(e => `${e.jobTitle} ${e.employer} ${e.description}`),
        ...(resumeData.projects || []).map(p => `${p.title} ${p.description}`),
        ...(resumeData.achievements || []).map(a => `${a.title} ${a.description}`),
        ...(resumeData.educations || []).map(e => `${e.degree} ${e.description}`),
    ];
    return parts.map(p => String(p || '').replace(/<[^>]*>/g, ' ')).join(' ');
}

function suggestSectionsFromProfile(resumeData = {}) {
    const text = collectProfileText(resumeData);
    const found = [];
    for (const signal of SECTION_SIGNALS) {
        const match = text.match(signal.pattern);
        if (match) found.push({ title: signal.title, basis: match[0] });
    }
    return found.slice(0, 4);
}

const CustomSectionsStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [customSections, setCustomSections] = useState(resumeData.customSections || []);
    const [expandedSections, setExpandedSections] = useState(new Set());
    const [expandedItems, setExpandedItems] = useState(new Set());

    const candidateContext = getCandidateContext(resumeData, resumeData.targetJobDescription || '');
    const suggestions = useMemo(() => suggestSectionsFromProfile(resumeData), [resumeData]);

    useEffect(() => {
        if (resumeData.customSections && Array.isArray(resumeData.customSections)) {
            setCustomSections(resumeData.customSections);
        }
    }, [resumeData.customSections]);

    const createSection = (title = '') => ({
        id: `custom-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
        title,
        items: [],
        visible: true,
    });

    const createItem = () => ({
        id: Date.now(),
        title: '',
        description: '',
    });

    const addSection = (title = '') => {
        const next = createSection(title);
        const firstItem = createItem();
        next.items = [firstItem];
        setCustomSections(prev => [...prev, next]);
        setExpandedSections(new Set([next.id]));
        setExpandedItems(new Set([firstItem.id]));
    };

    const removeSection = (id) => {
        setCustomSections(prev => prev.filter(section => section.id !== id));
        setExpandedSections(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const moveSection = (id, direction) => setCustomSections(current => moveResumeItem(current, id, direction));

    const updateSection = (id, field, value) => {
        setCustomSections(prev => prev.map(section => (section.id === id ? { ...section, [field]: value } : section)));
    };

    const addItem = (sectionId) => {
        const nextItem = createItem();
        setCustomSections(prev => prev.map(section =>
            section.id === sectionId ? { ...section, items: [...(section.items || []), nextItem] } : section
        ));
        setExpandedItems(prev => new Set([...prev, nextItem.id]));
        setExpandedSections(prev => new Set([...prev, sectionId]));
    };

    const updateItem = (sectionId, itemId, field, value) => {
        setCustomSections(prev => prev.map(section =>
            section.id === sectionId
                ? { ...section, items: (section.items || []).map(item => (item.id === itemId ? { ...item, [field]: value } : item)) }
                : section
        ));
    };

    const removeItem = (sectionId, itemId) => {
        setCustomSections(prev => prev.map(section =>
            section.id === sectionId
                ? { ...section, items: (section.items || []).filter(item => item.id !== itemId) }
                : section
        ));
        setExpandedItems(prev => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
        });
    };

    const moveItem = (sectionId, itemId, direction) => {
        setCustomSections(prev => prev.map(section =>
            section.id === sectionId
                ? { ...section, items: moveResumeItem(section.items || [], itemId, direction) }
                : section
        ));
    };

    const duplicateItem = (sectionId, itemId) => {
        setCustomSections(prev => prev.map(section => {
            if (section.id !== sectionId) return section;
            const source = (section.items || []).find(item => item.id === itemId);
            return {
                ...section,
                items: duplicateResumeItem(section.items || [], itemId, {
                    title: `${source?.title || source?.name || 'Item'} (Copy)`,
                }),
            };
        }));
    };

    const toggleSection = (id) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleItem = (id) => {
        setExpandedItems(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            const hasMeaningful = customSections.some(section =>
                (section?.items || []).some(item =>
                    String(item?.title || item?.name || item?.description || item?.content || '').trim()
                ) || String(section?.content || '').trim()
            );

            const completedSteps = [...(resumeData.completedSteps || [])];
            let updatedCompletedSteps = null;
            if (hasMeaningful && !completedSteps.includes(11)) {
                updatedCompletedSteps = [...completedSteps, 11];
            } else if (!hasMeaningful && completedSteps.includes(11)) {
                updatedCompletedSteps = completedSteps.filter(step => step !== 11);
            }

            const sectionOrder = [...(resumeData.sectionOrder || [])];
            if (customSections.length > 0 && !sectionOrder.includes('custom')) {
                sectionOrder.push('custom');
            }

            updateResumeData({
                customSections,
                sectionOrder,
                ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [customSections]); // eslint-disable-line react-hooks/exhaustive-deps

    // Unmount flush: synchronously commit state on step exit
    const customSectionsRef = useRef(customSections);
    const updateResumeDataRef = useRef(updateResumeData);
    const completedStepsRef = useRef(resumeData?.completedSteps || []);
    const sectionOrderRef = useRef(resumeData?.sectionOrder || []);
    useEffect(() => { customSectionsRef.current = customSections; }, [customSections]);
    useEffect(() => { updateResumeDataRef.current = updateResumeData; }, [updateResumeData]);
    useEffect(() => { completedStepsRef.current = resumeData?.completedSteps || []; }, [resumeData?.completedSteps]);
    useEffect(() => { sectionOrderRef.current = resumeData?.sectionOrder || []; }, [resumeData?.sectionOrder]);
    useEffect(() => () => {
        const secs = customSectionsRef.current;
        const hasMeaningful = secs.some(s => String(s?.title || '').trim() !== '' || (Array.isArray(s?.items) && s.items.length > 0));
        const completedSteps = [...(completedStepsRef.current || [])];
        let updatedCompletedSteps = null;
        if (hasMeaningful && !completedSteps.includes(11)) {
            updatedCompletedSteps = [...completedSteps, 11];
        } else if (!hasMeaningful && completedSteps.includes(11)) {
            updatedCompletedSteps = completedSteps.filter(step => step !== 11);
        }
        const sectionOrder = [...sectionOrderRef.current];
        if (secs.length > 0 && !sectionOrder.includes('custom')) {
            sectionOrder.push('custom');
        }
        updateResumeDataRef.current({
            customSections: secs,
            sectionOrder,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    }, []);

    useEffect(() => {
        if (customSections.length === 1 && expandedSections.size === 0) {
            setExpandedSections(new Set([customSections[0].id]));
        }
    }, [customSections.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const hasCustom = customSections.some(s => String(s?.title || '').trim() !== '');

    return (
        <StepShell
            stepNumber={11}
            stepPath="custom"
            title={t('CustomSectionsStep.title', 'Custom sections')}
            subtitle={t('CustomSectionsStep.subtitle', 'Extra sections only if they carry weight — you name them, you write them.')}
            isComplete={hasCustom}
            statusBadge={customSections.length > 0 ? `${customSections.length} ${customSections.length === 1 ? 'section' : 'sections'}` : ''}
            resumeData={resumeData}
            targetJd={resumeData.targetJobDescription || ''}
        >
            {customSections.length === 0 ? (
                <div className="space-y-4">
                    <EmptyState
                        title="Add a section"
                        description="Custom sections are for content that does not fit elsewhere — and only when it strengthens the resume. Name the section; write the entries yourself."
                        primaryAction={{
                            label: 'Add a section',
                            icon: <MdAdd className="w-4 h-4" />,
                            onClick: () => addSection(),
                        }}
                    />

                    {suggestions.length > 0 && (
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-2.5">
                            <h3 className="text-sm font-bold text-slate-900">Sections your profile already hints at</h3>
                            <p className="text-xs text-slate-500">
                                Based on words in your own entries — adding one creates a blank section you fill in.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {suggestions.map(suggestion => (
                                    <button
                                        key={suggestion.title}
                                        type="button"
                                        onClick={() => addSection(suggestion.title)}
                                        title={`Matched “${suggestion.basis}” in your text`}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                                    >
                                        <MdAdd className="w-3.5 h-3.5 text-slate-400" />
                                        {suggestion.title}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {customSections.map((section, sectionIndex) => {
                        const isExpanded = expandedSections.has(section.id);
                        const items = section.items || [];
                        const isComplete = items.some(item => String(item?.title || item?.description || '').trim() !== '');

                        return (
                            <div
                                key={section.id}
                                className={`rounded-xl border bg-white transition-all ${
                                    isExpanded ? 'border-indigo-300 ring-2 ring-indigo-500/10' : 'border-slate-200'
                                }`}
                            >
                                <div
                                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 cursor-pointer"
                                    onClick={() => toggleSection(section.id)}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                            isComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                                        }`}>
                                            {isComplete ? <MdCheck className="w-4 h-4" /> : sectionIndex + 1}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className={`text-xs sm:text-sm font-bold truncate ${section.title ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                                                    {section.title || 'Untitled section'}
                                                </h3>
                                                <span className="text-slate-300 text-xs">•</span>
                                                <span className="text-xs text-slate-500 font-medium">
                                                    {items.length} {items.length === 1 ? 'entry' : 'entries'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                                        <button
                                            type="button"
                                            onClick={() => moveSection(section.id, -1)}
                                            disabled={sectionIndex === 0}
                                            aria-label="Move section up"
                                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                                            title="Move up"
                                        >↑</button>
                                        <button
                                            type="button"
                                            onClick={() => moveSection(section.id, 1)}
                                            disabled={sectionIndex === customSections.length - 1}
                                            aria-label="Move section down"
                                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                                            title="Move down"
                                        >↓</button>
                                        <button
                                            type="button"
                                            onClick={() => removeSection(section.id)}
                                            aria-label="Remove section"
                                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                            title="Delete section"
                                        >
                                            <MdDelete className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => toggleSection(section.id)}
                                            aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
                                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 ml-1"
                                        >
                                            <MdKeyboardArrowDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                        </button>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="p-4 sm:p-5 space-y-4">
                                        <Field
                                            label={t('CustomSectionsStep.fields.sectionTitle.label', 'Section title')}
                                            name={`custom-section-title-${section.id}`}
                                            placeholder="Name this section exactly as it should appear on the resume"
                                            value={section.title || ''}
                                            onChange={(e) => updateSection(section.id, 'title', e.target.value)}
                                            required
                                        />

                                        <div className="space-y-2 pt-2 border-t border-slate-100">
                                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                                Entries ({items.length})
                                            </h4>

                                            {items.map((item, itemIndex) => {
                                                const itemExpanded = expandedItems.has(item.id);
                                                const itemTitle = item.title || item.name || '';
                                                return (
                                                    <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50/40">
                                                        <div
                                                            className="flex items-center justify-between px-3 py-2 cursor-pointer"
                                                            onClick={() => toggleItem(item.id)}
                                                        >
                                                            <span className={`text-xs font-bold truncate ${itemTitle ? 'text-slate-800' : 'text-slate-400 italic'}`}>
                                                                {itemTitle || 'Untitled entry'}
                                                            </span>
                                                            <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => moveItem(section.id, item.id, -1)}
                                                                    disabled={itemIndex === 0}
                                                                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                                                    aria-label="Move entry up"
                                                                >↑</button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => moveItem(section.id, item.id, 1)}
                                                                    disabled={itemIndex === items.length - 1}
                                                                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                                                    aria-label="Move entry down"
                                                                >↓</button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => duplicateItem(section.id, item.id)}
                                                                    className="p-1 text-slate-400 hover:text-indigo-600"
                                                                    aria-label="Duplicate entry"
                                                                >⧉</button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeItem(section.id, item.id)}
                                                                    className="p-1 text-slate-400 hover:text-rose-600"
                                                                    aria-label="Remove entry"
                                                                >
                                                                    <MdDelete className="w-3 h-3" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleItem(item.id)}
                                                                    className="p-1 text-slate-400 hover:text-slate-700"
                                                                    aria-label={itemExpanded ? 'Collapse entry' : 'Expand entry'}
                                                                >
                                                                    <MdKeyboardArrowDown className={`w-3.5 h-3.5 transition-transform ${itemExpanded ? 'rotate-180' : ''}`} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {itemExpanded && (
                                                            <div className="p-3 bg-white border-t border-slate-100 rounded-b-lg space-y-3">
                                                                <Field
                                                                    label={t('CustomSectionsStep.fields.itemTitle.label', 'Entry title')}
                                                                    name={`custom-item-title-${item.id}`}
                                                                    placeholder="e.g. role, publication title, event name"
                                                                    value={itemTitle}
                                                                    onChange={(e) => updateItem(section.id, item.id, 'title', e.target.value)}
                                                                />
                                                                <div className="space-y-1">
                                                                    <label className="block text-[13px] font-semibold text-slate-700">Details</label>
                                                                    <BulletPointsEditor
                                                                        value={item.description || item.content || ''}
                                                                        onChange={(value) => updateItem(section.id, item.id, 'description', value)}
                                                                        placeholder="What it was, what you did, what resulted"
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            <button
                                                type="button"
                                                onClick={() => addItem(section.id)}
                                                className="w-full h-8 rounded-lg border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-xs font-semibold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-1.5 transition-colors"
                                            >
                                                <MdAdd className="w-3.5 h-3.5" />
                                                Add entry
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    <button
                        type="button"
                        onClick={() => addSection()}
                        className="w-full h-11 rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-sm font-semibold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-colors"
                    >
                        <MdAdd className="w-4 h-4" />
                        Add another section
                    </button>
                </div>
            )}
        </StepShell>
    );
};

export default CustomSectionsStep;
