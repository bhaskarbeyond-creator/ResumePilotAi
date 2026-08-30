import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdDelete, MdKeyboardArrowDown, MdAdd, MdCheck } from 'react-icons/md';
import InputField from './components/InputField';
import BulletPointsEditor from '../../Form/BulletPointsEditor';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';

const ProjectsStep = ({ resumeData, updateResumeData }) => {
    const { t } = useTranslation('common');
    const [projects, setProjects] = useState(resumeData.projects || []);

    useEffect(() => {
        if (resumeData.projects && Array.isArray(resumeData.projects)) {
            setProjects(resumeData.projects);
        }
    }, [resumeData.projects]);

    const [expandedCards, setExpandedCards] = useState(new Set());

    const createNewProject = () => ({
        id: Date.now(),
        title: '',
        url: '',
        description: '',
    });

    const addProject = () => {
        const newProject = createNewProject();
        setProjects((prev) => [...prev, newProject]);
        setExpandedCards(() => new Set([newProject.id]));
    };

    const removeProject = (id) => {
        setProjects((prev) => prev.filter((p) => p.id !== id));
        setExpandedCards((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const moveProject = (id, direction) =>
        setProjects((current) => moveResumeItem(current, id, direction));

    const duplicateProject = (id) =>
        setProjects((current) => {
            const source = current.find((p) => p.id === id);
            return duplicateResumeItem(current, id, {
                title: `${source?.title || 'Project'} (Copy)`,
            });
        });

    const toggleCardExpansion = (id) => {
        setExpandedCards((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const updateProject = (id, field, value) => {
        setProjects((prev) =>
            prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
        );
    };

    // Auto-save on change — same 500 ms debounce pattern as other steps
    useEffect(() => {
        const timer = setTimeout(() => {
            const validProjects = projects.filter((p) => (p.title || '').trim() !== '');

            // Mark the step complete once at least one titled project exists,
            // and unmark it when the list no longer has any — the same contract
            // the Work History / Education / Skills steps follow.
            const completedSteps = [...(resumeData.completedSteps || [])];
            let updatedCompletedSteps = null;
            if (validProjects.length > 0 && !completedSteps.includes(5)) {
                updatedCompletedSteps = [...completedSteps, 5];
            } else if (validProjects.length === 0 && (completedSteps.includes(5) || completedSteps.includes(6))) {
                updatedCompletedSteps = completedSteps.filter((step) => step !== 5 && step !== 6);
            }

            updateResumeData({
                projects,
                ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-expand the only card when there is exactly one project
    useEffect(() => {
        if (projects.length === 1) {
            setExpandedCards(new Set([projects[0].id]));
        }
    }, [projects.length]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="px-4 py-6 max-w-6xl mx-auto w-full min-h-full">
            {/* Section header */}
            <div className="mb-4">
                <h1 className="text-lg font-bold text-gray-900 mb-1">
                    {t('ProjectsStep.title', 'Projects')}
                </h1>
                <p className="text-gray-600 text-sm">
                    {t(
                        'ProjectsStep.subtitle',
                        'Add personal, academic, or professional projects that showcase your skills.'
                    )}
                </p>
            </div>

            <div className="space-y-4">
                {projects.map((project, index) => {
                    const isExpanded = expandedCards.has(project.id);
                    const isComplete = Boolean(project.title);

                    return (
                        <div
                            key={project.id}
                            className={`relative bg-gradient-to-r from-white to-slate-50 border ${
                                isExpanded
                                    ? 'border-blue-200 rounded-xl shadow-lg shadow-blue-50'
                                    : 'border-gray-200 rounded-xl shadow-md hover:shadow-lg hover:border-blue-300 hover:from-blue-50 hover:to-slate-50'
                            }`}
                        >
                            {/* Accent line */}
                            <div
                                className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${
                                    isComplete
                                        ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                                        : 'bg-gradient-to-r from-gray-300 to-gray-400'
                                }`}
                            />

                            {/* Card header — click to expand/collapse */}
                            <div
                                className={`px-4 sm:px-6 py-4 ${
                                    isExpanded
                                        ? 'border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl'
                                        : 'rounded-xl'
                                } flex items-center cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-50 group`}
                                onClick={() => toggleCardExpansion(project.id)}
                            >
                                {/* Left: badge + title */}
                                <div className="flex items-center flex-1 min-w-0">
                                    <div
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mr-4 flex-shrink-0 shadow-sm ${
                                            isComplete
                                                ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-green-200'
                                                : 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-blue-200'
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
                                                project.title ? 'text-gray-800' : 'text-gray-400'
                                            }`}
                                        >
                                            {project.title ||
                                                t('ProjectsStep.defaultValues.untitledProject', 'Untitled Project')}
                                        </h3>
                                        {project.url && (
                                            <span className="block text-xs text-blue-500 font-medium truncate">
                                                {project.url}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Right: actions */}
                                <div className="flex items-center space-x-2 sm:space-x-3 ml-2 sm:ml-4">
                                    <div
                                        className={`w-3 h-3 rounded-full ${
                                            isComplete ? 'bg-green-400' : 'bg-gray-300'
                                        }`}
                                    />

                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); moveProject(project.id, -1); }}
                                        disabled={index === 0}
                                        aria-label={`Move ${project.title || 'project'} up`}
                                        className="p-1 text-slate-500 disabled:opacity-30"
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); moveProject(project.id, 1); }}
                                        disabled={index === projects.length - 1}
                                        aria-label={`Move ${project.title || 'project'} down`}
                                        className="p-1 text-slate-500 disabled:opacity-30"
                                    >
                                        ↓
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); duplicateProject(project.id); }}
                                        aria-label={`Duplicate ${project.title || 'project'}`}
                                        className="p-1 text-slate-500"
                                    >
                                        ⧉
                                    </button>

                                    {/* Expand/Collapse */}
                                    <button
                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg"
                                        title={
                                            isExpanded
                                                ? t('ProjectsStep.actions.collapse', 'Collapse')
                                                : t('ProjectsStep.actions.expand', 'Expand')
                                        }
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleCardExpansion(project.id);
                                        }}
                                    >
                                        <MdKeyboardArrowDown
                                            className={`w-5 h-5 ${isExpanded ? 'rotate-180' : ''}`}
                                        />
                                    </button>

                                    {/* Delete */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeProject(project.id);
                                        }}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                        title={t('ProjectsStep.actions.remove', 'Remove project')}
                                    >
                                        <MdDelete className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded form body */}
                            {isExpanded && (
                                <div className="p-4 sm:p-6 space-y-5 bg-gradient-to-br from-white to-slate-50 rounded-b-xl">
                                    {/* Project name + URL */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <InputField
                                            label={t('ProjectsStep.fields.title.label', 'Project Name')}
                                            name={`project-title-${project.id}`}
                                            placeholder={t(
                                                'ProjectsStep.fields.title.placeholder',
                                                'e.g. E-commerce Platform'
                                            )}
                                            value={project.title}
                                            onChange={(e) => updateProject(project.id, 'title', e.target.value)}
                                            required
                                        />
                                        <InputField
                                            label={t('ProjectsStep.fields.url.label', 'Project URL')}
                                            name={`project-url-${project.id}`}
                                            placeholder={t(
                                                'ProjectsStep.fields.url.placeholder',
                                                'https://github.com/...'
                                            )}
                                            value={project.url || ''}
                                            onChange={(e) => updateProject(project.id, 'url', e.target.value)}
                                            type="url"
                                        />
                                    </div>

                                    {/* Description */}
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-800 tracking-wide mb-3">
                                            {t('ProjectsStep.fields.description.label', 'Description')}
                                        </label>
                                        <BulletPointsEditor
                                            value={project.description}
                                            onChange={(value) =>
                                                updateProject(project.id, 'description', value)
                                            }
                                            placeholder={t(
                                                'ProjectsStep.fields.description.placeholder',
                                                'Describe what the project does, technologies used, your contributions and impact…'
                                            )}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Add Project button — same dashed pattern as other steps */}
                <button
                    onClick={addProject}
                    className="w-full p-6 border-2 border-dashed border-blue-300 rounded-xl text-blue-600 hover:border-blue-500 hover:text-blue-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 flex items-center justify-center font-semibold text-base shadow-sm hover:shadow-md"
                >
                    <MdAdd className="w-6 h-6 mr-3" />
                    {t('ProjectsStep.actions.addProject', 'Add Project')}
                </button>
            </div>
        </div>
    );
};

export default ProjectsStep;
