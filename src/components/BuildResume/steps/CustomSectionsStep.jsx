import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdDelete, MdKeyboardArrowDown, MdAdd, MdCheck } from 'react-icons/md';
import InputField from './components/InputField';
import BulletPointsEditor from '../../Form/BulletPointsEditor';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';

/**
 * CustomSectionsStep — completes the existing custom-section data model.
 *
 * Consumed fields (browser via SmartCustomSection, DOCX via buildCustomSections):
 *   - section.title
 *   - section.items[].title | name
 *   - section.items[].description | content
 *   - section.content (legacy body, migrated into items by normalizeResumeData)
 *
 * Dates, links and subtitles are not consumed downstream and are not exposed.
 */
const CustomSectionsStep = ({ resumeData, updateResumeData }) => {
    const { t } = useTranslation('common');
    const [customSections, setCustomSections] = useState(resumeData.customSections || []);
    const [expandedSections, setExpandedSections] = useState(new Set());
    const [expandedItems, setExpandedItems] = useState(new Set());

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
        setExpandedSections(() => new Set([next.id]));
        setExpandedItems(() => new Set([firstItem.id]));
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
        if (customSections.length === 1) {
            setExpandedSections(new Set([customSections[0].id]));
        }
    }, [customSections.length]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="px-4 py-6 max-w-6xl mx-auto w-full min-h-full">
            <div className="mb-4">
                <h1 className="text-lg font-bold text-gray-900 mb-1">
                    {t('CustomSectionsStep.title', 'Custom Sections')}
                </h1>
                <p className="text-gray-600 text-sm">
                    {t(
                        'CustomSectionsStep.subtitle',
                        'Add extra sections such as volunteer work, publications, or patents — including the individual entries inside each section.'
                    )}
                </p>
            </div>

            <div className="space-y-5">
                {customSections.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-violet-200 rounded-xl bg-violet-50/40">
                        <p className="text-sm font-medium text-slate-600 mb-1">
                            {t('CustomSectionsStep.empty.title', 'No custom sections yet')}
                        </p>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            {t(
                                'CustomSectionsStep.empty.description',
                                'Create a section, then add the items that should appear on your resume.'
                            )}
                        </p>
                    </div>
                )}

                {customSections.map((section, sectionIndex) => {
                    const isExpanded = expandedSections.has(section.id);
                    const items = section.items || [];
                    const isComplete = items.some((item) => String(item?.title || item?.description || '').trim() !== '');

                    return (
                        <div
                            key={section.id}
                            className={`relative bg-gradient-to-r from-white to-slate-50 border ${
                                isExpanded
                                    ? 'border-violet-200 rounded-xl shadow-lg shadow-violet-50'
                                    : 'border-gray-200 rounded-xl shadow-md hover:shadow-lg hover:border-violet-300'
                            }`}
                        >
                            <div
                                className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${
                                    isComplete
                                        ? 'bg-gradient-to-r from-violet-400 to-purple-500'
                                        : 'bg-gradient-to-r from-gray-300 to-gray-400'
                                }`}
                            />

                            <div
                                className={`px-4 sm:px-6 py-4 ${
                                    isExpanded
                                        ? 'border-b border-violet-100 bg-gradient-to-r from-violet-50 to-purple-50 rounded-t-xl'
                                        : 'rounded-xl'
                                } flex items-center cursor-pointer`}
                                onClick={() => toggleSection(section.id)}
                            >
                                <div className="flex items-center flex-1 min-w-0">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mr-4 flex-shrink-0 shadow-sm bg-gradient-to-br from-violet-400 to-purple-500 text-white">
                                        {isComplete ? <MdCheck className="w-5 h-5" /> : <span>{sectionIndex + 1}</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className={`font-semibold text-base truncate ${section.title ? 'text-gray-800' : 'text-gray-400'}`}>
                                            {section.title || t('CustomSectionsStep.defaultValues.untitledSection', 'Untitled Section')}
                                        </h3>
                                        <span className="block text-xs text-violet-600 font-medium">
                                            {t('CustomSectionsStep.itemCount', '{{count}} items', { count: items.length })}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-2 sm:space-x-3 ml-2 sm:ml-4">
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); moveSection(section.id, -1); }}
                                        disabled={sectionIndex === 0}
                                        aria-label={`Move ${section.title || 'section'} up`}
                                        className="p-1 text-slate-500 disabled:opacity-30"
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); moveSection(section.id, 1); }}
                                        disabled={sectionIndex === customSections.length - 1}
                                        aria-label={`Move ${section.title || 'section'} down`}
                                        className="p-1 text-slate-500 disabled:opacity-30"
                                    >
                                        ↓
                                    </button>
                                    <button
                                        className="p-2 text-gray-400 hover:text-violet-600 hover:bg-violet-100 rounded-lg"
                                        title={isExpanded ? t('CustomSectionsStep.actions.collapse', 'Collapse') : t('CustomSectionsStep.actions.expand', 'Expand')}
                                        onClick={(e) => { e.stopPropagation(); toggleSection(section.id); }}
                                    >
                                        <MdKeyboardArrowDown className={`w-5 h-5 ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); removeSection(section.id); }}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                        title={t('CustomSectionsStep.actions.removeSection', 'Remove section')}
                                    >
                                        <MdDelete className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="p-4 sm:p-6 space-y-5 bg-gradient-to-br from-white to-slate-50 rounded-b-xl">
                                    <InputField
                                        label={t('CustomSectionsStep.fields.sectionTitle.label', 'Section Title')}
                                        name={`custom-section-title-${section.id}`}
                                        placeholder={t(
                                            'CustomSectionsStep.fields.sectionTitle.placeholder',
                                            'e.g. Volunteer Work, Publications, Patents'
                                        )}
                                        value={section.title || ''}
                                        onChange={(e) => updateSection(section.id, 'title', e.target.value)}
                                        required
                                    />

                                    <div className="space-y-3">
                                        {items.map((item, itemIndex) => {
                                            const itemExpanded = expandedItems.has(item.id);
                                            const itemTitle = item.title || item.name || '';
                                            return (
                                                <div key={item.id} className="border border-slate-200 rounded-xl bg-white">
                                                    <div
                                                        className="px-4 py-3 flex items-center cursor-pointer"
                                                        onClick={() => toggleItem(item.id)}
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className={`text-sm font-semibold truncate ${itemTitle ? 'text-slate-800' : 'text-slate-400'}`}>
                                                                {itemTitle || t('CustomSectionsStep.defaultValues.untitledItem', 'Untitled Item')}
                                                            </h4>
                                                        </div>
                                                        <div className="flex items-center space-x-2 ml-3">
                                                            <button type="button" onClick={(e) => { e.stopPropagation(); moveItem(section.id, item.id, -1); }} disabled={itemIndex === 0} aria-label={`Move ${itemTitle || 'item'} up`} className="p-1 text-slate-500 disabled:opacity-30">↑</button>
                                                            <button type="button" onClick={(e) => { e.stopPropagation(); moveItem(section.id, item.id, 1); }} disabled={itemIndex === items.length - 1} aria-label={`Move ${itemTitle || 'item'} down`} className="p-1 text-slate-500 disabled:opacity-30">↓</button>
                                                            <button type="button" onClick={(e) => { e.stopPropagation(); duplicateItem(section.id, item.id); }} aria-label={`Duplicate ${itemTitle || 'item'}`} className="p-1 text-slate-500">⧉</button>
                                                            <button type="button" onClick={(e) => { e.stopPropagation(); toggleItem(item.id); }} className="p-1 text-slate-400" title={itemExpanded ? t('CustomSectionsStep.actions.collapse', 'Collapse') : t('CustomSectionsStep.actions.expand', 'Expand')}>
                                                                <MdKeyboardArrowDown className={`w-5 h-5 ${itemExpanded ? 'rotate-180' : ''}`} />
                                                            </button>
                                                            <button type="button" onClick={(e) => { e.stopPropagation(); removeItem(section.id, item.id); }} className="p-1 text-slate-400 hover:text-red-500" title={t('CustomSectionsStep.actions.removeItem', 'Remove item')}>
                                                                <MdDelete className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {itemExpanded && (
                                                        <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">
                                                            <InputField
                                                                label={t('CustomSectionsStep.fields.itemTitle.label', 'Item Title')}
                                                                name={`custom-item-title-${item.id}`}
                                                                placeholder={t(
                                                                    'CustomSectionsStep.fields.itemTitle.placeholder',
                                                                    'e.g. Community Mentor'
                                                                )}
                                                                value={itemTitle}
                                                                onChange={(e) => updateItem(section.id, item.id, 'title', e.target.value)}
                                                            />
                                                            <div>
                                                                <label className="block text-sm font-semibold text-slate-800 tracking-wide mb-3">
                                                                    {t('CustomSectionsStep.fields.itemDescription.label', 'Item Description')}
                                                                </label>
                                                                <BulletPointsEditor
                                                                    value={item.description || item.content || ''}
                                                                    onChange={(value) => updateItem(section.id, item.id, 'description', value)}
                                                                    placeholder={t(
                                                                        'CustomSectionsStep.fields.itemDescription.placeholder',
                                                                        'Describe the work, publication, or contribution…'
                                                                    )}
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
                                            className="w-full p-3 border-2 border-dashed border-violet-200 rounded-xl text-violet-700 hover:border-violet-400 hover:bg-violet-50 flex items-center justify-center font-semibold text-sm"
                                        >
                                            <MdAdd className="w-5 h-5 mr-2" />
                                            {t('CustomSectionsStep.actions.addItem', 'Add Item')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                <button
                    onClick={addSection}
                    className="w-full p-6 border-2 border-dashed border-violet-300 rounded-xl text-violet-700 hover:border-violet-500 hover:text-violet-800 hover:bg-gradient-to-r hover:from-violet-50 hover:to-purple-50 flex items-center justify-center font-semibold text-base shadow-sm hover:shadow-md"
                >
                    <MdAdd className="w-6 h-6 mr-3" />
                    {t('CustomSectionsStep.actions.addSection', 'Add Custom Section')}
                </button>
            </div>
        </div>
    );
};

export default CustomSectionsStep;
