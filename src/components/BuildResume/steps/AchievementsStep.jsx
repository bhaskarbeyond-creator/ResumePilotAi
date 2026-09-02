import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdDelete, MdKeyboardArrowDown, MdAdd, MdCheck } from 'react-icons/md';
import InputField from './components/InputField';
import BulletPointsEditor from '../../Form/BulletPointsEditor';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';

/**
 * AchievementsStep — wizard step for the `achievements` section.
 *
 * Field set is limited to the fields the resume pipeline consumes end-to-end
 * (browser + PDF via SmartAchievements / ResumeExtras, DOCX via
 * buildAchievementsBlock):
 *   - title       -> Achievement name   (renderer: ach.title || ach.name)
 *   - description -> Details / impact   (renderer: ach.description)
 *
 * The emptiness filter also inspects an unused issuer alias; that alias is
 * never painted by the renderer or DOCX builder, so it is not exposed here.
 */
const AchievementsStep = ({ resumeData, updateResumeData }) => {
    const { t } = useTranslation('common');
    const [achievements, setAchievements] = useState(resumeData.achievements || []);
    const [expandedCards, setExpandedCards] = useState(new Set());

    useEffect(() => {
        if (resumeData.achievements && Array.isArray(resumeData.achievements)) {
            setAchievements(resumeData.achievements);
        }
    }, [resumeData.achievements]);

    const createNewAchievement = () => ({
        id: Date.now(),
        title: '',
        description: '',
    });

    const addAchievement = () => {
        const next = createNewAchievement();
        setAchievements((prev) => [...prev, next]);
        setExpandedCards(() => new Set([next.id]));
    };

    const removeAchievement = (id) => {
        setAchievements((prev) => prev.filter((item) => item.id !== id));
        setExpandedCards((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const moveAchievement = (id, direction) =>
        setAchievements((current) => moveResumeItem(current, id, direction));

    const duplicateAchievement = (id) =>
        setAchievements((current) => {
            const source = current.find((item) => item.id === id);
            return duplicateResumeItem(current, id, {
                title: `${source?.title || source?.name || 'Achievement'} (Copy)`,
            });
        });

    const toggleCardExpansion = (id) => {
        setExpandedCards((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const updateAchievement = (id, field, value) => {
        setAchievements((prev) =>
            prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
        );
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            const validAchievements = achievements.filter(
                (item) => String(item?.title || item?.name || '').trim() !== ''
            );

            const completedSteps = [...(resumeData.completedSteps || [])];
            let updatedCompletedSteps = null;
            if (validAchievements.length > 0 && !completedSteps.includes(9)) {
                updatedCompletedSteps = [...completedSteps, 9];
            } else if (validAchievements.length === 0 && completedSteps.includes(9)) {
                updatedCompletedSteps = completedSteps.filter((step) => step !== 9);
            }

            updateResumeData({
                achievements,
                ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [achievements]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (achievements.length === 1) {
            setExpandedCards(new Set([achievements[0].id]));
        }
    }, [achievements.length]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="px-4 py-6 max-w-6xl mx-auto w-full min-h-full">
            <div className="mb-4">
                <h1 className="text-lg font-bold text-gray-900 mb-1">
                    {t('AchievementsStep.title', 'Achievements')}
                </h1>
                <p className="text-gray-600 text-sm">
                    {t(
                        'AchievementsStep.subtitle',
                        'Add awards, honours, and measurable accomplishments that strengthen your resume.'
                    )}
                </p>
            </div>

            <div className="space-y-4">
                {achievements.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-amber-200 rounded-xl bg-amber-50/40">
                        <p className="text-sm font-medium text-slate-600 mb-1">
                            {t('AchievementsStep.empty.title', 'No achievements added yet')}
                        </p>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            {t(
                                'AchievementsStep.empty.description',
                                'Highlight awards, publications, promotions, or results you are proud of.'
                            )}
                        </p>
                    </div>
                )}

                {achievements.map((achievement, index) => {
                    const isExpanded = expandedCards.has(achievement.id);
                    const achievementTitle = achievement.title || achievement.name || '';
                    const isComplete = Boolean(achievementTitle);

                    return (
                        <div
                            key={achievement.id}
                            className={`relative bg-gradient-to-r from-white to-slate-50 border ${
                                isExpanded
                                    ? 'border-amber-200 rounded-xl shadow-lg shadow-amber-50'
                                    : 'border-gray-200 rounded-xl shadow-md hover:shadow-lg hover:border-amber-300 hover:from-amber-50 hover:to-slate-50'
                            }`}
                        >
                            <div
                                className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${
                                    isComplete
                                        ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                                        : 'bg-gradient-to-r from-gray-300 to-gray-400'
                                }`}
                            />

                            <div
                                className={`px-4 sm:px-6 py-4 ${
                                    isExpanded
                                        ? 'border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 rounded-t-xl'
                                        : 'rounded-xl'
                                } flex items-center cursor-pointer hover:bg-gradient-to-r hover:from-amber-50 hover:to-slate-50 group`}
                                onClick={() => toggleCardExpansion(achievement.id)}
                            >
                                <div className="flex items-center flex-1 min-w-0">
                                    <div
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mr-4 flex-shrink-0 shadow-sm ${
                                            isComplete
                                                ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-amber-200'
                                                : 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-amber-200'
                                        }`}
                                    >
                                        {isComplete ? (
                                            <MdCheck className="w-5 h-5" />
                                        ) : (
                                            <span className="font-bold">{index + 1}</span>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <h3
                                            className={`font-semibold text-base mb-1 truncate ${
                                                achievementTitle ? 'text-gray-800' : 'text-gray-400'
                                            }`}
                                        >
                                            {achievementTitle ||
                                                t('AchievementsStep.defaultValues.untitledAchievement', 'Untitled Achievement')}
                                        </h3>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-2 sm:space-x-3 ml-2 sm:ml-4">
                                    <div
                                        className={`w-3 h-3 rounded-full ${
                                            isComplete ? 'bg-amber-400' : 'bg-gray-300'
                                        }`}
                                    />

                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); moveAchievement(achievement.id, -1); }}
                                        disabled={index === 0}
                                        aria-label={`Move ${achievementTitle || 'achievement'} up`}
                                        className="p-1 text-slate-500 disabled:opacity-30"
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); moveAchievement(achievement.id, 1); }}
                                        disabled={index === achievements.length - 1}
                                        aria-label={`Move ${achievementTitle || 'achievement'} down`}
                                        className="p-1 text-slate-500 disabled:opacity-30"
                                    >
                                        ↓
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); duplicateAchievement(achievement.id); }}
                                        aria-label={`Duplicate ${achievementTitle || 'achievement'}`}
                                        className="p-1 text-slate-500"
                                    >
                                        ⧉
                                    </button>

                                    <button
                                        className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-100 rounded-lg"
                                        title={
                                            isExpanded
                                                ? t('AchievementsStep.actions.collapse', 'Collapse')
                                                : t('AchievementsStep.actions.expand', 'Expand')
                                        }
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleCardExpansion(achievement.id);
                                        }}
                                    >
                                        <MdKeyboardArrowDown
                                            className={`w-5 h-5 ${isExpanded ? 'rotate-180' : ''}`}
                                        />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeAchievement(achievement.id);
                                        }}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                        title={t('AchievementsStep.actions.remove', 'Remove achievement')}
                                    >
                                        <MdDelete className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="p-4 sm:p-6 space-y-5 bg-gradient-to-br from-white to-slate-50 rounded-b-xl">
                                    <InputField
                                        label={t('AchievementsStep.fields.title.label', 'Achievement Title')}
                                        name={`achievement-title-${achievement.id}`}
                                        placeholder={t(
                                            'AchievementsStep.fields.title.placeholder',
                                            'e.g. Engineering Excellence Award'
                                        )}
                                        value={achievement.title || achievement.name || ''}
                                        onChange={(e) => updateAchievement(achievement.id, 'title', e.target.value)}
                                        required
                                    />

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-800 tracking-wide mb-3">
                                            {t('AchievementsStep.fields.description.label', 'Description')}
                                        </label>
                                        <BulletPointsEditor
                                            value={achievement.description}
                                            onChange={(value) =>
                                                updateAchievement(achievement.id, 'description', value)
                                            }
                                            placeholder={t(
                                                'AchievementsStep.fields.description.placeholder',
                                                'Describe the result, recognition, or impact…'
                                            )}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                <button
                    onClick={addAchievement}
                    className="w-full p-6 border-2 border-dashed border-amber-300 rounded-xl text-amber-700 hover:border-amber-500 hover:text-amber-800 hover:bg-gradient-to-r hover:from-amber-50 hover:to-orange-50 flex items-center justify-center font-semibold text-base shadow-sm hover:shadow-md"
                >
                    <MdAdd className="w-6 h-6 mr-3" />
                    {t('AchievementsStep.actions.addAchievement', 'Add Achievement')}
                </button>
            </div>
        </div>
    );
};

export default AchievementsStep;
