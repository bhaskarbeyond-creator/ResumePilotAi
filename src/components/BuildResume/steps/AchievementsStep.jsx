import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    MdDelete, 
    MdKeyboardArrowDown, 
    MdAdd, 
    MdCheck, 
    MdEmojiEvents,
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

const AchievementsStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [achievements, setAchievements] = useState(resumeData.achievements || []);
    const [expandedCards, setExpandedCards] = useState(new Set());

    const candidateContext = getCandidateContext(resumeData);
    const achievementBlueprints = candidateContext.starterBlueprints?.achievements || [];

    useEffect(() => {
        if (resumeData.achievements && Array.isArray(resumeData.achievements)) {
            setAchievements(resumeData.achievements);
        }
    }, [resumeData.achievements]);

    const createNewAchievement = (overrides = {}) => ({
        id: Date.now(),
        title: overrides.title || '',
        description: '',
        achievementType: overrides.achievementType || 'standard',
    });

    const addAchievement = (overrides = {}) => {
        const next = createNewAchievement(overrides);
        setAchievements((prev) => [...prev, next]);
        setExpandedCards(new Set([next.id]));
    };

    const handleQuickAddAction = (actionId) => {
        switch (actionId) {
            case 'add-award':
                addAchievement({ achievementType: 'award' });
                break;
            case 'add-achievement':
            default:
                addAchievement();
                break;
        }
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
        if (achievements.length === 1 && expandedCards.size === 0) {
            setExpandedCards(new Set([achievements[0].id]));
        }
    }, [achievements.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const hasAchievements = achievements.some((a) => String(a?.title || a?.name || '').trim() !== '');

    return (
        <StepWorkspaceLayout
            stepNumber={9}
            stepPath="achievements"
            title={t('AchievementsStep.title', 'Key Achievements & Honors')}
            subtitle={t('AchievementsStep.subtitle', 'Add awards, honours, and measurable accomplishments that strengthen your resume.')}
            isComplete={hasAchievements}
            statusBadge={`${achievements.length} Achievement${achievements.length === 1 ? '' : 's'}`}
            resumeData={resumeData}
            onNavigate={onNavigate}
        >
            <div className="space-y-3">
                {/* Command Bar: Contextual Quick-Add Actions (Always Available) */}
                <QuickAddCommandBar
                    stepPath="achievements"
                    onAction={handleQuickAddAction}
                />

                {achievements.length === 0 ? (
                    /* Guided Achievements Setup Banner (Zero-Fabrication Architecture) */
                    <TrackGuidanceBanner
                        candidateContext={candidateContext}
                        stepName="Achievement or Honor"
                        stepPath="achievements"
                        focusAreas={['Organizational & Departmental Awards', 'Key Business & Technical Milestones', 'Cost Reduction & Efficiency Breakthroughs', 'Publications, Patents & Inventions', 'Leadership & Peer Commendations']}
                        examples={achievementBlueprints.slice(0, 3).map((b) => ({
                            title: b.title || 'Professional Distinction',
                            description: b.description || 'Recognized for high-impact contributions and operational excellence.'
                        }))}
                        onStartBlank={() => addAchievement()}
                    />
                ) : (
                    /* High-Density Achievements Studio with Milestone Bar */
                    <div className="space-y-2.5">
                        {/* Milestone Bar */}
                        <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="font-bold text-slate-800 truncate">
                                    {achievements.length} Distinction{achievements.length === 1 ? '' : 's'} Documented
                                </span>
                                <span className="text-[11px] text-slate-400 hidden sm:inline">• Competitive Honors</span>
                            </div>
                            <button
                                type="button"
                                onClick={addAchievement}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer shrink-0"
                            >
                                <MdAdd className="w-3.5 h-3.5" />
                                <span>Add Distinction</span>
                            </button>
                        </div>

                        {achievements.map((achievement, index) => {
                            const isExpanded = expandedCards.has(achievement.id);
                            const achievementTitle = achievement.title || achievement.name || '';
                            const isFilled = Boolean(achievementTitle);

                            return (
                                <div
                                    key={achievement.id}
                                    className={`bg-white rounded-xl border transition-all duration-150 ${
                                        isExpanded 
                                            ? 'border-indigo-300 shadow-md ring-2 ring-indigo-500/10' 
                                            : 'border-slate-200/90 shadow-2xs hover:border-slate-300'
                                    }`}
                                >
                                    {/* Compact Card Header */}
                                    <div 
                                        className={`px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer ${
                                            isExpanded ? 'border-b border-slate-100 bg-slate-50/50 rounded-t-xl' : 'rounded-xl'
                                        }`}
                                        onClick={() => toggleCardExpansion(achievement.id)}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                                isFilled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                                            }`}>
                                                {isFilled ? <MdCheck className="w-4 h-4" /> : index + 1}
                                            </div>

                                            <div className="min-w-0">
                                                <h3 className={`text-xs sm:text-sm font-bold truncate ${achievementTitle ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                                                    {achievementTitle || 'Untitled Achievement'}
                                                </h3>
                                            </div>
                                        </div>

                                        {/* Action Controls */}
                                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                onClick={() => moveAchievement(achievement.id, -1)}
                                                disabled={index === 0}
                                                aria-label="Move achievement up"
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                                title="Move up"
                                            >
                                                <MdArrowUpward className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveAchievement(achievement.id, 1)}
                                                disabled={index === achievements.length - 1}
                                                aria-label="Move achievement down"
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                                title="Move down"
                                            >
                                                <MdArrowDownward className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => duplicateAchievement(achievement.id)}
                                                aria-label="Duplicate achievement"
                                                className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                                                title="Duplicate"
                                            >
                                                <MdContentCopy className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeAchievement(achievement.id)}
                                                aria-label="Remove achievement"
                                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                                title="Delete"
                                            >
                                                <MdDelete className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleCardExpansion(achievement.id)}
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer ml-1"
                                                title={isExpanded ? 'Collapse' : 'Expand'}
                                            >
                                                <MdKeyboardArrowDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Form Body */}
                                    {isExpanded && (
                                        <div className="p-4 sm:p-5 space-y-4">
                                            <InputField
                                                label={t('AchievementsStep.fields.title.label', 'Achievement / Award Title')}
                                                name={`achievement-title-${achievement.id}`}
                                                placeholder={achievementBlueprints[0]?.title ? `e.g. ${achievementBlueprints[0].title}` : 'e.g. Professional Excellence Award, Industry Recognition, Key Distinction'}
                                                value={achievement.title || achievement.name || ''}
                                                onChange={(e) => updateAchievement(achievement.id, 'title', e.target.value)}
                                                required
                                            />

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                                                        Quantified Impact & Scope
                                                    </label>
                                                    <span className="text-[10px] text-slate-400">Include numbers, percentages, or scale</span>
                                                </div>
                                                <BulletPointsEditor
                                                    value={achievement.description}
                                                    onChange={(value) => updateAchievement(achievement.id, 'description', value)}
                                                    placeholder={achievementBlueprints[0]?.description ? `e.g. ${achievementBlueprints[0].description}` : 'e.g. Quantified accomplishment, leadership recognition, or measurable milestone...'}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Add Button */}
                        <button
                            type="button"
                            onClick={addAchievement}
                            className="w-full h-11 border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-xl text-xs font-bold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                        >
                            <MdAdd className="w-4 h-4" />
                            <span>Add Another Achievement</span>
                        </button>
                    </div>
                )}
            </div>
        </StepWorkspaceLayout>
    );
};

export default AchievementsStep;
