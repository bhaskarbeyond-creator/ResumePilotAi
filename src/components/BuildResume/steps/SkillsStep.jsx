import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MdDelete, MdKeyboardArrowDown, MdAdd, MdCheck, MdLightbulb } from 'react-icons/md';
import InputField from './components/InputField';
import AutocompleteInputField from './components/AutocompleteInputField';
import { generateUserAiContent } from '../../../services/aiService';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';

const SkillsStep = ({ resumeData, updateResumeData }) => {
    const { t } = useTranslation('common');
    const [skills, setSkills] = useState(resumeData.skills || []);

    useEffect(() => {
        if (resumeData.skills && Array.isArray(resumeData.skills)) {
            setSkills(resumeData.skills);
        }
    }, [resumeData.skills]);
    const [expandedCards, setExpandedCards] = useState(new Set());
    const [isGeneratingSkills, setIsGeneratingSkills] = useState(false);
    const [popularSkills, setPopularSkills] = useState([]);
    const idCounter = useRef(0);
    const aiRequestControllerRef = useRef(null);
    useEffect(() => () => { const controller = aiRequestControllerRef.current; aiRequestControllerRef.current = null; controller?.abort(); }, []);

    const createNewSkill = () => {
        idCounter.current += 1;
        return {
            id: `skill_${Date.now()}_${idCounter.current}`,
            skillName: '',
            rating: 50,
        };
    };

    const addSkill = () => {
        const newSkill = createNewSkill();
        setSkills([...skills, newSkill]);
        // Auto-expand only the newly added card
        setExpandedCards((prev) => {
            const newSet = new Set(prev);
            newSet.add(newSkill.id);
            return newSet;
        });
    };

    const removeSkill = (id) => {
        setSkills((prevSkills) => prevSkills.filter((skill) => skill.id !== id));
        // Remove from expanded cards
        setExpandedCards((prev) => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
        });
    };

    const moveSkill = (id, direction) => setSkills(current => moveResumeItem(current, id, direction));

    const duplicateSkill = id => setSkills(current => {
        const source = current.find(item => item.id === id);
        return duplicateResumeItem(current, id, { skillName: `${source?.skillName || 'Skill'} (Copy)` });
    });

    const toggleCardExpansion = (id) => {
        setExpandedCards((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const updateSkill = (id, field, value) => {
        setSkills((prevSkills) => prevSkills.map((skill) => (skill.id === id ? { ...skill, [field]: value } : skill)));
    };

    const generateAISkills = async () => {
        const targetOccupation = (resumeData.occupation && resumeData.occupation.trim())
            || (resumeData.employments?.[0]?.jobTitle)
            || 'Professional';

        aiRequestControllerRef.current?.abort();
        const requestController = new AbortController();
        aiRequestControllerRef.current = requestController;
        setIsGeneratingSkills(true);
        try {
            const currentLanguage = localStorage.getItem('i18nextLng') || 'en';
            const experienceLevel = resumeData.experienceLevel || 'mid-level';
            const existingSkillsList = skills
                .map((s) => (s.skillName || s.name || '').trim())
                .filter(Boolean);

            const data = await generateUserAiContent('generate-skills', {
                occupation: targetOccupation,
                jobTitle: targetOccupation,
                experienceLevel: experienceLevel,
                existingSkills: existingSkillsList,
                language: currentLanguage,
            }, { signal: requestController.signal });

            if (data && data.skills && Array.isArray(data.skills)) {
                const skillNames = data.skills
                    .map((skill) => typeof skill === 'string' ? skill : skill?.name || skill?.skill || skill?.title || '')
                    .map((skill) => String(skill).trim())
                    .filter(Boolean);
                setPopularSkills(skillNames);
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('Error generating AI skills:', error);
            // Fallback to default skills if API call fails
            setPopularSkills([
                'Communication',
                'Problem Solving',
                'Team Collaboration',
                'Project Management',
                'Time Management',
                'Adaptability',
                'Critical Thinking',
                'Leadership',
                'Organization',
                'Technical Writing',
                'Data Analysis',
                'Customer Service',
            ]);
        } finally {
            if (aiRequestControllerRef.current === requestController) {
                aiRequestControllerRef.current = null;
                setIsGeneratingSkills(false);
            }
        }
    };

    const handleSave = () => {
        updateResumeData({ skills });

        // Mark step as completed if at least 3 skills are added
        const validSkills = skills.filter((skill) => skill.skillName.trim() !== '');

        if (validSkills.length >= 3) {
            const completedSteps = [...(resumeData.completedSteps || [])];
            if (!completedSteps.includes(5)) {
                completedSteps.push(5);
                updateResumeData({ skills, completedSteps });
            }
        } else {
            // Remove step from completed if it no longer meets requirements
            const completedSteps = [...(resumeData.completedSteps || [])];
            const updatedSteps = completedSteps.filter((step) => step !== 5);
            if (updatedSteps.length !== completedSteps.length) {
                updateResumeData({ skills, completedSteps: updatedSteps });
            }
        }
    };

    // Auto-save on change
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [skills]);

    // Auto-expand only the first card when there's only one skill
    useEffect(() => {
        if (skills.length === 1) {
            setExpandedCards(new Set([skills[0].id]));
        }
    }, [skills.length]);

    const getSkillLevelText = (rating) => {
        if (rating < 25) return t('SkillsStep.skillLevels.beginner');
        if (rating < 50) return t('SkillsStep.skillLevels.intermediate');
        if (rating < 75) return t('SkillsStep.skillLevels.advanced');
        return t('SkillsStep.skillLevels.expert');
    };

    const getSkillColor = (rating) => {
        if (rating < 25) return 'from-red-400 to-red-500';
        if (rating < 50) return 'from-orange-400 to-orange-500';
        if (rating < 75) return 'from-blue-400 to-blue-500';
        return 'from-green-400 to-green-500';
    };

    // Compute unadded skill pills so already-added skills are never recommended again
    const existingSkillNames = new Set(
        skills.map((s) => (s.skillName || s.name || '').trim().toLowerCase()).filter(Boolean)
    );
    const availableSkills = popularSkills.filter(
        (suggestedSkill) => !existingSkillNames.has(suggestedSkill.trim().toLowerCase())
    );

    return (
        <div className="px-4 py-6 max-w-6xl mx-auto w-full min-h-full">
            <div className="mb-4">
                <h1 className="text-lg font-bold text-gray-900 mb-1">{t('SkillsStep.title')}</h1>
                <p className="text-gray-600 text-sm">{t('SkillsStep.subtitle')}</p>
                <p className="text-sm text-blue-600 mt-1 font-medium">{t('SkillsStep.requiredNote')}</p>
            </div>

            <div className="space-y-4">
                {skills.map((skill, index) => (
                    <div
                        key={skill.id}
                        className={`relative bg-gradient-to-r from-white to-slate-50 border ${
                            expandedCards.has(skill.id)
                                ? 'border-blue-200 rounded-xl shadow-lg shadow-blue-50'
                                : 'border-gray-200 rounded-xl shadow-md hover:shadow-lg hover:border-blue-300 hover:from-blue-50 hover:to-slate-50'
                        }`}>
                        {/* Accent Line */}
                        <div
                            className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${
                                skill.skillName && skill.skillName.trim() !== '' ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-gray-300 to-gray-400'
                            }`}></div>

                        {/* Header */}
                        <div
                            className={`px-4 sm:px-6 py-4 ${
                                expandedCards.has(skill.id) ? 'border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl' : 'rounded-xl'
                            } flex items-center cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-50 group`}
                            onClick={() => toggleCardExpansion(skill.id)}>
                            {/* Left Section - Badge and Content */}
                            <div className="flex items-center flex-1 min-w-0">
                                {/* Position Number Badge */}
                                <div
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mr-4 flex-shrink-0 shadow-sm ${
                                        skill.skillName && skill.skillName.trim() !== ''
                                            ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-green-200'
                                            : 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-blue-200'
                                    }`}>
                                    {skill.skillName && skill.skillName.trim() !== '' ? <MdCheck className="w-5 h-5" /> : <span className="font-bold">{index + 1}</span>}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <h3 className={`font-semibold text-base mb-1 truncate ${skill.skillName ? 'text-gray-800' : 'text-gray-400'}`}>
                                        {skill.skillName || t('SkillsStep.defaultValues.skillName')}
                                    </h3>

                                    <div className="flex items-center text-sm space-x-2">
                                        <span className={`font-medium ${skill.skillName ? 'text-gray-600' : 'text-gray-400'}`}>
                                            {skill.skillName ? `${getSkillLevelText(skill.rating)} (${skill.rating}%)` : t('SkillsStep.defaultValues.clickToAdd')}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Right Section - Actions */}
                            <div className="flex items-center space-x-2 sm:space-x-3 ml-2 sm:ml-4">
                                {/* Status Indicator */}
                                <div className={`w-3 h-3 rounded-full ${skill.skillName && skill.skillName.trim() !== '' ? 'bg-green-400' : 'bg-gray-300'}`}></div>

                                <button type="button" onClick={(e) => { e.stopPropagation(); moveSkill(skill.id, -1); }} disabled={index === 0} aria-label={`Move ${skill.skillName || 'skill'} up`} className="p-1 text-slate-500 disabled:opacity-30">↑</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveSkill(skill.id, 1); }} disabled={index === skills.length - 1} aria-label={`Move ${skill.skillName || 'skill'} down`} className="p-1 text-slate-500 disabled:opacity-30">↓</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); duplicateSkill(skill.id); }} aria-label={`Duplicate ${skill.skillName || 'skill'}`} className="p-1 text-slate-500">⧉</button>

                                {/* Expand/Collapse Button */}
                                <button
                                    type="button"
                                    className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                                    <MdKeyboardArrowDown
                                        className={`w-5 h-5 transition-transform duration-200 ${
                                            expandedCards.has(skill.id) ? 'transform rotate-180 text-blue-600' : ''
                                        }`}
                                    />
                                </button>

                                {/* Delete Button */}
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeSkill(skill.id);
                                    }}
                                    className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                                    title={t('SkillsStep.actions.deleteSkill')}>
                                    <MdDelete className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        {expandedCards.has(skill.id) && (
                            <div className="p-4 sm:p-6 bg-white rounded-b-xl border-t border-blue-50">
                                <div className="grid grid-cols-1 gap-6">
                                    {/* Skill Name Field */}
                                    <AutocompleteInputField
                                        label={t('SkillsStep.fields.skillName.label')}
                                        name={`skillName_${skill.id}`}
                                        value={skill.skillName}
                                        onChange={(e) => updateSkill(skill.id, 'skillName', e.target.value)}
                                        placeholder={t('SkillsStep.fields.skillName.placeholder')}
                                        required
                                        suggestionType="skill"
                                        onSelect={(value) => updateSkill(skill.id, 'skillName', value)}
                                    />

                                    {/* Skill Level Slider */}
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="block text-sm font-semibold text-gray-700">
                                                {t('SkillsStep.fields.skillLevel.label')}
                                            </label>
                                            <span className="text-sm font-medium text-blue-600">
                                                {getSkillLevelText(skill.rating)} ({skill.rating}%)
                                            </span>
                                        </div>

                                        <div className="relative mb-2">
                                            <div className="w-full bg-gray-200 rounded-full h-3">
                                                <div
                                                    className={`h-3 rounded-full bg-gradient-to-r ${getSkillColor(skill.rating)} transition-all duration-200`}
                                                    style={{ width: `${skill.rating}%` }}></div>
                                            </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={skill.rating}
                                                onChange={(e) => updateSkill(skill.id, 'rating', parseInt(e.target.value))}
                                                className="absolute inset-0 w-full h-3 opacity-0 cursor-pointer"
                                            />
                                        </div>

                                        <div className="flex justify-between text-sm font-medium text-gray-500">
                                            <span>{t('SkillsStep.skillLevels.beginner')}</span>
                                            <span className="text-gray-600">{skill.rating}%</span>
                                            <span>{t('SkillsStep.skillLevels.expert')}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {/* Add New Skill Button */}
                <button
                    onClick={addSkill}
                    className="w-full p-6 border-2 border-dashed border-blue-300 rounded-xl text-blue-600 hover:border-blue-500 hover:text-blue-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 flex items-center justify-center font-semibold text-base shadow-sm hover:shadow-md cursor-pointer">
                    <MdAdd className="w-6 h-6 mr-3" />
                    {t('SkillsStep.actions.addSkill')}
                </button>

                {/* Enhanced Popular Skills */}
                <div className="mt-6 p-4 sm:p-6 bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-blue-100 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                        <div>
                            <h3 className="text-base font-bold text-gray-800 mb-1">{t('SkillsStep.quickAdd.title')}</h3>
                            <p className="text-sm text-gray-600">{t('SkillsStep.quickAdd.subtitle')}</p>
                        </div>
                        <button
                            onClick={generateAISkills}
                            disabled={isGeneratingSkills}
                            className={`flex items-center justify-center text-sm font-semibold px-3 py-2 rounded-lg shadow-sm ${
                                isGeneratingSkills
                                    ? 'text-gray-400 bg-gray-100 cursor-not-allowed'
                                    : 'text-purple-700 bg-gradient-to-r from-purple-100 to-pink-100 hover:from-purple-200 hover:to-pink-200 cursor-pointer shadow-purple-100 hover:shadow-purple-200'
                            }`}>
                            {isGeneratingSkills ? (
                                <>
                                    <div className="w-4 h-4 mr-2 border-2 border-gray-300 border-t-purple-600 rounded-full animate-spin"></div>
                                    <span className="truncate">{t('SkillsStep.ai.generating')}</span>
                                </>
                            ) : (
                                <>
                                    <MdLightbulb className="w-4 h-4 mr-2" />
                                    <span className="truncate">{t('SkillsStep.ai.suggestions')}</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Skills Display or Empty State */}
                    {popularSkills.length === 0 && !isGeneratingSkills ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <MdLightbulb className="w-8 h-8 text-blue-600" />
                            </div>
                            <h4 className="text-lg font-semibold text-gray-800 mb-2">AI-Powered Skill Suggestions</h4>
                            <p className="text-gray-600 mb-4 max-w-md mx-auto">
                                {!resumeData.occupation
                                    ? 'Add your job title first to get personalized skill suggestions.'
                                    : `Get personalized skill suggestions for ${resumeData.occupation} based on industry standards and your experience level.`}
                            </p>
                            {resumeData.occupation && (
                                <button
                                    onClick={generateAISkills}
                                    disabled={isGeneratingSkills}
                                    className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-all cursor-pointer">
                                    <MdLightbulb className="w-5 h-5 mr-2" />
                                    Generate Skills Now
                                </button>
                            )}
                        </div>
                    ) : availableSkills.length === 0 && !isGeneratingSkills ? (
                        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <MdCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                                All suggested skills from this batch have been added!
                            </span>
                            <button
                                type="button"
                                onClick={generateAISkills}
                                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer ml-2 shrink-0">
                                Get More Skills
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {availableSkills.slice(0, 15).map((suggestedSkill) => (
                                <button
                                    key={suggestedSkill}
                                    onClick={() => {
                                        if (!existingSkillNames.has(suggestedSkill.trim().toLowerCase())) {
                                            const newSkill = { ...createNewSkill(), skillName: suggestedSkill };
                                            setSkills((prevSkills) => [...prevSkills, newSkill]);
                                            setExpandedCards((prev) => {
                                                const newSet = new Set(prev);
                                                newSet.add(newSkill.id);
                                                return newSet;
                                            });
                                        }
                                    }}
                                    className="px-3 py-2 text-sm font-medium bg-white text-gray-700 rounded-lg border border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 shadow-xs hover:shadow-sm transition-all cursor-pointer">
                                    + {suggestedSkill}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SkillsStep;
