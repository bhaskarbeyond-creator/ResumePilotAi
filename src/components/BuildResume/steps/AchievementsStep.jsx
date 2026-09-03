import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MdAdd, MdOutlineSearch } from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import EmptyState from '../components/EmptyState.jsx';
import EntryList from '../components/EntryList.jsx';
import Field from '../components/Field.jsx';
import BulletPointsEditor from '../../Form/BulletPointsEditor';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';

/**
 * Achievements — entry list. "Find in my experience" is a deterministic
 * local scan of the candidate's own text for recognition signals; the
 * matches are added as editable entries (the candidate's own words).
 */

const RECOGNITION_SIGNAL = /\b(?:award(?:ed|s)?|honou?r(?:s|ed)?|dean'?s\s+list|won|winner|winning|first\s+place|top\s+performer|employee\s+of\s+|certificate\s+of\s+(?:excellence|appreciation)|recognition|recognised|recognized|commendation|promoted|published|publication|patent(?:ed)?|scholarship|distinction|outstanding)\b/iu;

function findAchievementSignals(resumeData = {}) {
    const sources = [];
    (resumeData.employments || []).forEach(emp => {
        const where = `${emp.jobTitle || ''} at ${emp.employer || ''}`.trim();
        String(emp.description || '').split(/\r?\n/).forEach(line => {
            const clean = line.replace(/<[^>]*>/g, ' ').replace(/^\s*[•▪·\-]\s*/, '').trim();
            if (clean.length >= 15 && RECOGNITION_SIGNAL.test(clean)) {
                sources.push({ text: clean.slice(0, 300), source: where || 'Work experience' });
            }
        });
    });
    (resumeData.projects || []).forEach(project => {
        const where = String(project.title || 'Project');
        String(project.description || '').split(/\r?\n/).forEach(line => {
            const clean = line.replace(/<[^>]*>/g, ' ').replace(/^\s*[•▪·\-]\s*/, '').trim();
            if (clean.length >= 15 && RECOGNITION_SIGNAL.test(clean)) {
                sources.push({ text: clean.slice(0, 300), source: where });
            }
        });
    });
    (resumeData.educations || []).forEach(edu => {
        const where = `${edu.degree || ''} ${edu.school || ''}`.trim();
        String(edu.description || '').split(/\r?\n/).forEach(line => {
            const clean = line.replace(/<[^>]*>/g, ' ').replace(/^\s*[•▪·\-]\s*/, '').trim();
            if (clean.length >= 15 && RECOGNITION_SIGNAL.test(clean)) {
                sources.push({ text: clean.slice(0, 300), source: where || 'Education' });
            }
        });
    });
    // dedupe, cap
    const seen = new Set();
    return sources
        .filter(item => {
            const key = item.text.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 6);
}

const AchievementsStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [achievements, setAchievements] = useState(resumeData.achievements || []);
    const candidateContext = getCandidateContext(resumeData, resumeData.targetJobDescription || '');
    const [scanOpen, setScanOpen] = useState(false);

    const signals = useMemo(() => findAchievementSignals(resumeData), [resumeData]);

    useEffect(() => {
        if (resumeData.achievements && Array.isArray(resumeData.achievements)) {
            setAchievements(resumeData.achievements);
        }
    }, [resumeData.achievements]);

    const createNewAchievement = () => ({
        id: Date.now(),
        title: '',
        description: '',
        achievementType: 'standard',
    });

    const addAchievement = (prefill = null) => {
        const next = createNewAchievement();
        if (prefill) {
            next.description = prefill.text;
            next.title = prefill.source ? `From ${prefill.source}` : '';
        }
        setAchievements(prev => [...prev, next]);
    };

    const removeAchievement = (id) => setAchievements(prev => prev.filter(item => item.id !== id));

    const moveAchievement = (id, direction) => setAchievements(current => moveResumeItem(current, id, direction));

    const duplicateAchievement = (id) => setAchievements(current => {
        const source = current.find(item => item.id === id);
        return duplicateResumeItem(current, id, {
            title: `${source?.title || source?.name || 'Achievement'} (Copy)`,
        });
    });

    const updateAchievement = (id, field, value) => {
        setAchievements(prev => prev.map(item => (item.id === id ? { ...item, [field]: value } : item)));
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            const validAchievements = achievements.filter(item => String(item?.title || item?.name || '').trim() !== '');

            const completedSteps = [...(resumeData.completedSteps || [])];
            let updatedCompletedSteps = null;
            if (validAchievements.length > 0 && !completedSteps.includes(9)) {
                updatedCompletedSteps = [...completedSteps, 9];
            } else if (validAchievements.length === 0 && completedSteps.includes(9)) {
                updatedCompletedSteps = completedSteps.filter(step => step !== 9);
            }

            updateResumeData({
                achievements,
                ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [achievements]); // eslint-disable-line react-hooks/exhaustive-deps

    const hasAchievements = achievements.some(a => String(a?.title || a?.name || '').trim() !== '');

    const renderEntryBody = (achievement) => (
        <div className="space-y-4">
            <Field
                label={t('AchievementsStep.fields.title.label', 'Achievement / award')}
                name={`achievement-title-${achievement.id}`}
                placeholder={getDynamicPlaceholder('achievements', 'title', candidateContext) || 'Enter the award, honor, or milestone name'}
                value={achievement.title || achievement.name || ''}
                onChange={(e) => updateAchievement(achievement.id, 'title', e.target.value)}
                required
            />
            <div className="space-y-2">
                <label className="block text-[13px] font-semibold text-slate-700">
                    What it recognizes & scale
                </label>
                <p className="text-xs text-slate-500">
                    Who gave it, what it recognized, and the scope or numbers when you can state them.
                </p>
                <BulletPointsEditor
                    value={achievement.description}
                    onChange={(value) => updateAchievement(achievement.id, 'description', value)}
                    placeholder={getDynamicPlaceholder('achievements', 'description', candidateContext) || 'e.g. what it was for, who recognized it, any measurable scope'}
                />
            </div>
        </div>
    );

    return (
        <StepShell
            stepNumber={9}
            stepPath="achievements"
            title={t('AchievementsStep.title', 'Achievements & honors')}
            subtitle={t('AchievementsStep.subtitle', 'Awards, honors, and milestones you actually received.')}
            isComplete={hasAchievements}
            statusBadge={achievements.length > 0 ? `${achievements.length} ${achievements.length === 1 ? 'achievement' : 'achievements'}` : ''}
            resumeData={resumeData}
            targetJd={resumeData.targetJobDescription || ''}
        >
            <div className="space-y-3">
                {achievements.length === 0 ? (
                    <EmptyState
                        title="Add an achievement"
                        description="Awards, honors, recognitions, publications — things you received or completed. If you are not sure what belongs here, scan your own text for recognition signals."
                        primaryAction={{
                            label: 'Add an achievement',
                            icon: <MdAdd className="w-4 h-4" />,
                            onClick: () => addAchievement(),
                        }}
                        secondaryAction={{
                            label: 'Find in my experience',
                            icon: <MdOutlineSearch className="w-4 h-4" />,
                            onClick: () => setScanOpen(true),
                            disabled: signals.length === 0,
                            reason: 'No recognition signals found in your current text yet.',
                        }}
                    />
                ) : (
                    <>
                        <EntryList
                            entries={achievements.map(achievement => ({
                                ...achievement,
                                onMoveUp: () => moveAchievement(achievement.id, -1),
                                onMoveDown: () => moveAchievement(achievement.id, 1),
                                onDuplicate: () => duplicateAchievement(achievement.id),
                                onDelete: () => removeAchievement(achievement.id),
                            }))}
                            renderEntryTitle={(achievement) => ({
                                title: achievement.title || achievement.name || '',
                                subtitle: String(achievement.description || '').replace(/<[^>]*>/g, ' ').slice(0, 80),
                                meta: '',
                            })}
                            renderEntry={renderEntryBody}
                        />

                        <button
                            type="button"
                            onClick={() => addAchievement()}
                            className="w-full h-11 rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-sm font-semibold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-colors"
                        >
                            <MdAdd className="w-4 h-4" />
                            Add another achievement
                        </button>
                    </>
                )}

                {scanOpen && (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-bold text-slate-900">Recognition signals in your own text</h3>
                            <button type="button" onClick={() => setScanOpen(false)} className="text-xs font-semibold text-slate-400 hover:text-slate-600">
                                Close
                            </button>
                        </div>
                        <p className="text-xs text-slate-500">
                            These lines come from what you already wrote. Add the ones worth featuring — then edit the
                            title and details so the entry stands on its own.
                        </p>
                        {signals.length === 0 ? (
                            <p className="text-sm text-slate-400">Nothing found in your current work, project, or education text.</p>
                        ) : (
                            <ul className="divide-y divide-indigo-100/60 rounded-lg border border-indigo-100 bg-white">
                                {signals.map((signal, index) => (
                                    <li key={index} className="flex items-start justify-between gap-3 px-3 py-2.5">
                                        <div className="min-w-0">
                                            <p className="text-[13px] leading-snug text-slate-700">{signal.text}</p>
                                            <p className="mt-0.5 text-[11px] text-slate-400">from {signal.source}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => addAchievement(signal)}
                                            className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                        >
                                            Add as entry
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </StepShell>
    );
};

export default AchievementsStep;
