import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdAdd, MdLaunch } from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import EmptyState from '../components/EmptyState.jsx';
import EntryList from '../components/EntryList.jsx';
import Field from '../components/Field.jsx';
import BulletPointsEditor from '../../Form/BulletPointsEditor';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';

/**
 * Projects — entry list. Labels guide the structure (what / what you did /
 * what resulted); no tag inserters, no blueprint examples, no fake metrics.
 */
const ProjectsStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [projects, setProjects] = useState(resumeData.projects || []);
    const candidateContext = getCandidateContext(resumeData, resumeData.targetJobDescription || '');

    useEffect(() => {
        if (resumeData.projects && Array.isArray(resumeData.projects)) {
            setProjects(resumeData.projects);
        }
    }, [resumeData.projects]);

    const createNewProject = () => ({
        id: Date.now(),
        title: '',
        url: '',
        description: '',
        projectType: 'standard',
    });

    const addProject = () => {
        const newProject = createNewProject();
        setProjects(prev => [...prev, newProject]);
    };

    const removeProject = (id) => {
        setProjects(prev => prev.filter(p => p.id !== id));
    };

    const moveProject = (id, direction) => setProjects(current => moveResumeItem(current, id, direction));

    const duplicateProject = (id) => setProjects(current => {
        const source = current.find(p => p.id === id);
        return duplicateResumeItem(current, id, { title: `${source?.title || 'Project'} (Copy)` });
    });

    const updateProject = (id, field, value) => {
        setProjects(prev => prev.map(p => (p.id === id ? { ...p, [field]: value } : p)));
    };

    // Auto-save on change
    useEffect(() => {
        const timer = setTimeout(() => {
            const validProjects = projects.filter(p => String(p?.title || p?.name || '').trim() !== '');

            const completedSteps = [...(resumeData.completedSteps || [])];
            let updatedCompletedSteps = null;
            if (validProjects.length > 0 && !completedSteps.includes(5)) {
                updatedCompletedSteps = [...completedSteps, 5];
            } else if (validProjects.length === 0 && completedSteps.includes(5)) {
                updatedCompletedSteps = completedSteps.filter(step => step !== 5);
            }

            updateResumeData({
                projects,
                ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

    const hasProjects = projects.some(p => String(p?.title || p?.name || '').trim() !== '');

    const renderEntryBody = (project) => (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                    label={t('ProjectsStep.fields.title.label', 'Project name')}
                    name={`project-title-${project.id}`}
                    placeholder={getDynamicPlaceholder('projects', 'title', candidateContext) || 'Enter the project or initiative name'}
                    value={project.title}
                    onChange={(e) => updateProject(project.id, 'title', e.target.value)}
                    required
                />
                <Field
                    label={t('ProjectsStep.fields.url.label', 'Project / portfolio URL')}
                    name={`project-url-${project.id}`}
                    type="url"
                    placeholder="https://…"
                    value={project.url || ''}
                    onChange={(e) => updateProject(project.id, 'url', e.target.value)}
                    optional
                />
            </div>

            <div className="space-y-2">
                <label className="block text-[13px] font-semibold text-slate-700">
                    What it was, what you did, what resulted
                </label>
                <p className="text-xs text-slate-500">
                    One line per bullet works well: the purpose, your specific contribution, and the outcome when you can state it.
                </p>
                <BulletPointsEditor
                    value={project.description}
                    onChange={(value) => updateProject(project.id, 'description', value)}
                    placeholder={getDynamicPlaceholder('projects', 'description', candidateContext) || 'e.g. what the project was for, what you personally did, what you learned or delivered'}
                />
            </div>

            {project.url && /^https?:\/\//i.test(String(project.url)) && (
                <a
                    href={project.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                    Open link <MdLaunch className="w-3 h-3" />
                </a>
            )}
        </div>
    );

    return (
        <StepShell
            stepNumber={5}
            stepPath="projects"
            title={t('ProjectsStep.title', 'Projects')}
            subtitle={t('ProjectsStep.subtitle', 'Work that shows your ability — course projects, work initiatives, volunteer efforts, personal builds.')}
            isComplete={hasProjects}
            statusBadge={projects.length > 0 ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}` : ''}
            resumeData={resumeData}
            targetJd={resumeData.targetJobDescription || ''}
        >
            {projects.length === 0 ? (
                <EmptyState
                    title="Add a project or initiative"
                    description="Projects are optional, but they are strong evidence. Add the one you are most proud of — what it was, what you did, what resulted."
                    primaryAction={{
                        label: 'Add a project',
                        icon: <MdAdd className="w-4 h-4" />,
                        onClick: addProject,
                    }}
                />
            ) : (
                <div className="space-y-3">
                    <EntryList
                        entries={projects.map(project => ({
                            ...project,
                            onMoveUp: () => moveProject(project.id, -1),
                            onMoveDown: () => moveProject(project.id, 1),
                            onDuplicate: () => duplicateProject(project.id),
                            onDelete: () => removeProject(project.id),
                        }))}
                        renderEntryTitle={(project) => ({
                            title: project.title || '',
                            subtitle: project.url ? String(project.url).replace(/^https?:\/\//, '').slice(0, 40) : '',
                            meta: '',
                        })}
                        renderEntry={renderEntryBody}
                    />

                    <button
                        type="button"
                        onClick={addProject}
                        className="w-full h-11 rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-sm font-semibold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-colors"
                    >
                        <MdAdd className="w-4 h-4" />
                        Add another project
                    </button>
                </div>
            )}
        </StepShell>
    );
};

export default ProjectsStep;
