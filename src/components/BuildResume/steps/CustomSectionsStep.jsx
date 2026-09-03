import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    MdDelete, 
    MdKeyboardArrowDown, 
    MdAdd, 
    MdCheck, 
    MdLayers,
    MdContentCopy,
    MdArrowUpward,
    MdArrowDownward 
} from 'react-icons/md';
import InputField from './components/InputField';
import BulletPointsEditor from '../../Form/BulletPointsEditor';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import StepWorkspaceLayout from '../components/StepWorkspaceLayout';
import { getCandidateContext } from '../../../utils/candidateContext';
import QuickAddCommandBar from '../components/QuickAddCommandBar';
import TrackGuidanceBanner from '../components/TrackGuidanceBanner';

const CustomSectionsStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [customSections, setCustomSections] = useState(resumeData.customSections || []);
    const [expandedSections, setExpandedSections] = useState(new Set());
    const [expandedItems, setExpandedItems] = useState(new Set());

    const candidateContext = getCandidateContext(resumeData);
    const customBlueprints = candidateContext.starterBlueprints?.customSections || [];

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

    const addSection = () => {
        const next = createSection('');
        const firstItem = createItem();
        next.items = [firstItem];
        setCustomSections((prev) => [...prev, next]);
        setExpandedSections(new Set([next.id]));
        setExpandedItems(new Set([firstItem.id]));
    };

    const addSectionWithTitle = (title = '') => {
        const next = createSection(title);
        const firstItem = createItem();
        next.items = [firstItem];
        setCustomSections((prev) => [...prev, next]);
        setExpandedSections(new Set([next.id]));
        setExpandedItems(new Set([firstItem.id]));
    };

    const handleQuickAddAction = (actionId) => {
        switch (actionId) {
            case 'add-publications':
                addSectionWithTitle('Publications & Research');
                break;
            case 'add-volunteer':
                addSectionWithTitle('Volunteering & Community Service');
                break;
            case 'add-patents':
                addSectionWithTitle('Patents & Intellectual Property');
                break;
            case 'add-speaking':
                addSectionWithTitle('Keynote & Conference Speaking');
                break;
            case 'add-custom-blank':
            default:
                addSection();
                break;
        }
    };

    const removeSection = (id) => {
        setCustomSections((prev) => prev.filter((section) => section.id !== id));
        setExpandedSections((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const moveSection = (id, direction) =>
        setCustomSections((current) => moveResumeItem(current, id, direction));

    const updateSection = (id, field, value) => {
        setCustomSections((prev) =>
            prev.map((section) => (section.id === id ? { ...section, [field]: value } : section))
        );
    };

    const addItem = (sectionId) => {
        const nextItem = createItem();
        setCustomSections((prev) =>
            prev.map((section) =>
                section.id === sectionId
                    ? { ...section, items: [...(section.items || []), nextItem] }
                    : section
            )
        );
        setExpandedItems((prev) => new Set([...prev, nextItem.id]));
        setExpandedSections((prev) => new Set([...prev, sectionId]));
    };

    const updateItem = (sectionId, itemId, field, value) => {
        setCustomSections((prev) =>
            prev.map((section) =>
                section.id === sectionId
                    ? {
                        ...section,
                        items: (section.items || []).map((item) =>
                            item.id === itemId ? { ...item, [field]: value } : item
                        ),
                    }
                    : section
            )
        );
    };

    const removeItem = (sectionId, itemId) => {
        setCustomSections((prev) =>
            prev.map((section) =>
                section.id === sectionId
                    ? { ...section, items: (section.items || []).filter((item) => item.id !== itemId) }
                    : section
            )
        );
        setExpandedItems((prev) => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
        });
    };

    const moveItem = (sectionId, itemId, direction) => {
        setCustomSections((prev) =>
            prev.map((section) =>
                section.id === sectionId
                    ? { ...section, items: moveResumeItem(section.items || [], itemId, direction) }
                    : section
            )
        );
    };

    const duplicateItem = (sectionId, itemId) => {
        setCustomSections((prev) =>
            prev.map((section) => {
                if (section.id !== sectionId) return section;
                const source = (section.items || []).find((item) => item.id === itemId);
                return {
                    ...section,
                    items: duplicateResumeItem(section.items || [], itemId, {
                        title: `${source?.title || source?.name || 'Item'} (Copy)`,
                    }),
                };
            })
        );
    };

    const toggleSection = (id) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleItem = (id) => {
        setExpandedItems((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            const hasMeaningful = customSections.some((section) =>
                (section?.items || []).some((item) =>
                    String(item?.title || item?.name || item?.description || item?.content || '').trim()
                ) || String(section?.content || '').trim()
            );

            const completedSteps = [...(resumeData.completedSteps || [])];
            let updatedCompletedSteps = null;
            if (hasMeaningful && !completedSteps.includes(11)) {
                updatedCompletedSteps = [...completedSteps, 11];
            } else if (!hasMeaningful && completedSteps.includes(11)) {
                updatedCompletedSteps = completedSteps.filter((step) => step !== 11);
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

    useEffect(() => {
        if (customSections.length === 1 && expandedSections.size === 0) {
            setExpandedSections(new Set([customSections[0].id]));
        }
    }, [customSections.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const hasCustom = customSections.some((s) => String(s?.title || '').trim() !== '');

    return (
        <StepWorkspaceLayout
            stepNumber={11}
            stepPath="custom"
            title={t('CustomSectionsStep.title', 'Custom Sections & Extras')}
            subtitle={t('CustomSectionsStep.subtitle', 'Add specialized sections such as volunteering, publications, speaking, or patents.')}
            isComplete={hasCustom}
            statusBadge={`${customSections.length} Section${customSections.length === 1 ? '' : 's'}`}
            resumeData={resumeData}
            onNavigate={onNavigate}
        >
            <div className="space-y-3">
                {/* Command Bar: Contextual Quick-Add Actions (Always Available) */}
                <QuickAddCommandBar
                    stepPath="custom"
                    onAction={handleQuickAddAction}
                />

                {customSections.length === 0 ? (
                    /* Guided Custom Sections Setup Banner (Zero-Fabrication Architecture) */
                    <TrackGuidanceBanner
                        candidateContext={candidateContext}
                        stepName="Custom Section"
                        stepPath="custom"
                        focusAreas={['Publications & Research Contributions', 'Patents, Trademarks & IP', 'Community Volunteering & Pro-Bono Service', 'Keynote & Conference Speaking', 'Professional Memberships & Advisory Boards']}
                        examples={customBlueprints.slice(0, 3).map((b) => ({
                            title: b.title || 'Specialized Section',
                            description: b.description || 'Document industry impact, publications, or specialized technical activities.'
                        }))}
                        onStartBlank={() => addSection()}
                    />
                ) : (
                    /* High-Density Custom Sections Studio with Milestone Bar */
                    <div className="space-y-2.5">
                        {/* Milestone Bar */}
                        <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="font-bold text-slate-800 truncate">
                                    {customSections.length} Custom Section{customSections.length === 1 ? '' : 's'} Configured
                                </span>
                                <span className="text-[11px] text-slate-400 hidden sm:inline">• Specialized Portfolio</span>
                            </div>
                            <button
                                type="button"
                                onClick={addSection}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer shrink-0"
                            >
                                <MdAdd className="w-3.5 h-3.5" />
                                <span>Add Section</span>
                            </button>
                        </div>

                        {/* Category Presets Quick Bar */}
                        <div className="flex items-center gap-1.5 flex-wrap p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Add Category:</span>
                            {['Volunteering', 'Patents', 'Publications', 'Speaking', 'Open Source'].map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => {
                                        const newSec = {
                                            id: `custom_${Date.now()}`,
                                            title: preset,
                                            items: [{ id: `item_${Date.now()}_1`, title: '', description: '' }]
                                        };
                                        setCustomSections((prev) => [...prev, newSec]);
                                        setExpandedSections((prev) => new Set([...prev, newSec.id]));
                                    }}
                                    className="px-2 py-0.5 text-[10px] font-bold bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-md border border-slate-200 transition-colors cursor-pointer shadow-2xs"
                                >
                                    + {preset}
                                </button>
                            ))}
                        </div>
                        {customSections.map((section, sectionIndex) => {
                            const isExpanded = expandedSections.has(section.id);
                            const items = section.items || [];
                            const isComplete = items.some((item) => String(item?.title || item?.description || '').trim() !== '');

                            return (
                                <div
                                    key={section.id}
                                    className={`bg-white rounded-xl border transition-all duration-150 ${
                                        isExpanded 
                                            ? 'border-indigo-300 shadow-md ring-2 ring-indigo-500/10' 
                                            : 'border-slate-200/90 shadow-2xs hover:border-slate-300'
                                    }`}
                                >
                                    {/* Section Summary Header */}
                                    <div
                                        className={`px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer ${
                                            isExpanded ? 'border-b border-slate-100 bg-slate-50/50 rounded-t-xl' : 'rounded-xl'
                                        }`}
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
                                                        {section.title || 'Untitled Section'}
                                                    </h3>
                                                    <span className="text-slate-300 text-xs">•</span>
                                                    <span className="text-xs text-slate-500 font-medium">
                                                        {items.length} {items.length === 1 ? 'entry' : 'entries'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Controls */}
                                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                onClick={() => moveSection(section.id, -1)}
                                                disabled={sectionIndex === 0}
                                                aria-label="Move section up"
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                                title="Move up"
                                            >
                                                <MdArrowUpward className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveSection(section.id, 1)}
                                                disabled={sectionIndex === customSections.length - 1}
                                                aria-label="Move section down"
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                                title="Move down"
                                            >
                                                <MdArrowDownward className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeSection(section.id)}
                                                aria-label="Remove section"
                                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                                title="Delete section"
                                            >
                                                <MdDelete className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleSection(section.id)}
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer ml-1"
                                                title={isExpanded ? 'Collapse' : 'Expand'}
                                            >
                                                <MdKeyboardArrowDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Section Body */}
                                    {isExpanded && (
                                        <div className="p-4 sm:p-5 space-y-4">
                                            <InputField
                                                label={t('CustomSectionsStep.fields.sectionTitle.label', 'Section Title')}
                                                name={`custom-section-title-${section.id}`}
                                                placeholder="e.g. Volunteer Experience, Publications, Patents, Speaking"
                                                value={section.title || ''}
                                                onChange={(e) => updateSection(section.id, 'title', e.target.value)}
                                                required
                                            />

                                            {/* Nested Items */}
                                            <div className="space-y-2 pt-2 border-t border-slate-100">
                                                <div className="flex items-center justify-between pb-1">
                                                    <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                                                        Entries in this Section ({items.length})
                                                    </h4>
                                                </div>

                                                {items.map((item, itemIndex) => {
                                                    const itemExpanded = expandedItems.has(item.id);
                                                    const itemTitle = item.title || item.name || '';

                                                    return (
                                                        <div key={item.id} className="border border-slate-200/90 rounded-xl bg-slate-50/40">
                                                            <div
                                                                className="px-3 py-2 flex items-center justify-between cursor-pointer"
                                                                onClick={() => toggleItem(item.id)}
                                                            >
                                                                <span className={`text-xs font-bold truncate ${itemTitle ? 'text-slate-800' : 'text-slate-400 italic'}`}>
                                                                    {itemTitle || 'Untitled Entry'}
                                                                </span>

                                                                <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => moveItem(section.id, item.id, -1)}
                                                                        disabled={itemIndex === 0}
                                                                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                                                    >
                                                                        <MdArrowUpward className="w-3 h-3" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => moveItem(section.id, item.id, 1)}
                                                                        disabled={itemIndex === items.length - 1}
                                                                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                                                    >
                                                                        <MdArrowDownward className="w-3 h-3" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => duplicateItem(section.id, item.id)}
                                                                        className="p-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                                                                    >
                                                                        <MdContentCopy className="w-3 h-3" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeItem(section.id, item.id)}
                                                                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                                                    >
                                                                        <MdDelete className="w-3 h-3" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleItem(item.id)}
                                                                        className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                                                                    >
                                                                        <MdKeyboardArrowDown className={`w-3.5 h-3.5 transition-transform duration-200 ${itemExpanded ? 'rotate-180' : ''}`} />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {itemExpanded && (
                                                                <div className="p-3 bg-white border-t border-slate-100 rounded-b-xl space-y-3">
                                                                    <InputField
                                                                        label={t('CustomSectionsStep.fields.itemTitle.label', 'Entry Title / Role')}
                                                                        name={`custom-item-title-${item.id}`}
                                                                        placeholder={customBlueprints[0]?.items?.[0]?.title ? `e.g. ${customBlueprints[0].items[0].title}` : 'e.g. Program Coordinator, Committee Member, Lead Contributor'}
                                                                        value={itemTitle}
                                                                        onChange={(e) => updateItem(section.id, item.id, 'title', e.target.value)}
                                                                    />
                                                                    <div className="space-y-1">
                                                                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                                                                            Details & Outcomes
                                                                        </label>
                                                                        <BulletPointsEditor
                                                                            value={item.description || item.content || ''}
                                                                            onChange={(value) => updateItem(section.id, item.id, 'description', value)}
                                                                            placeholder="Key accomplishments or details for this custom entry..."
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
                                                    className="w-full h-8 border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-lg text-xs font-bold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                                                >
                                                    <MdAdd className="w-3.5 h-3.5" />
                                                    <span>Add Entry to {section.title || 'Section'}</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Add Section Button */}
                        <button
                            type="button"
                            onClick={addSection}
                            className="w-full h-11 border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-xl text-xs font-bold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                        >
                            <MdAdd className="w-4 h-4" />
                            <span>Add Another Custom Section</span>
                        </button>
                    </div>
                )}
            </div>
        </StepWorkspaceLayout>
    );
};

export default CustomSectionsStep;
