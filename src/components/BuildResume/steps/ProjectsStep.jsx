import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    MdDelete, 
    MdKeyboardArrowDown, 
    MdAdd, 
    MdCheck, 
    MdCode,
    MdContentCopy,
    MdArrowUpward,
    MdArrowDownward,
    MdLaunch
} from 'react-icons/md';
import InputField from './components/InputField';
import BulletPointsEditor from '../../Form/BulletPointsEditor';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import StepWorkspaceLayout from '../components/StepWorkspaceLayout';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';
import QuickAddCommandBar from '../components/QuickAddCommandBar';
import TrackGuidanceBanner from '../components/TrackGuidanceBanner';

const ProjectsStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [projects, setProjects] = useState(resumeData.projects || []);
    const candidateContext = getCandidateContext(resumeData);
    const projectBlueprints = candidateContext.starterBlueprints?.projects || [];

    useEffect(() => {
        if (resumeData.projects && Array.isArray(resumeData.projects)) {
            setProjects(resumeData.projects);
        }
    }, [resumeData.projects]);

    const [expandedCards, setExpandedCards] = useState(new Set());

    const createNewProject = (overrides = {}) => ({
        id: Date.now(),
        title: overrides.title || '',
        url: overrides.url || '',
        description: '',
        projectType: overrides.projectType || 'standard',
    });

    const addProject = (overrides = {}) => {
        const newProject = createNewProject(overrides);
        setProjects((prev) => [...prev, newProject]);
        setExpandedCards(new Set([newProject.id]));
    };

    const handleQuickAddAction = (actionId) => {
        switch (actionId) {
            case 'add-portfolio-piece':
                addProject({ projectType: 'case-study' });
                break;
            case 'add-project':
            default:
                addProject();
                break;
        }
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

    // Auto-save on change
    useEffect(() => {
        const timer = setTimeout(() => {
            const validProjects = projects.filter((p) => String(p?.title || p?.name || '').trim() !== '');

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

    useEffect(() => {
        if (projects.length === 1 && expandedCards.size === 0) {
            setExpandedCards(new Set([projects[0].id]));
        }
    }, [projects.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const hasProjects = projects.some((p) => String(p?.title || p?.name || '').trim() !== '');

    return (
        <StepWorkspaceLayout
            stepNumber={5}
            stepPath="projects"
            title={t('ProjectsStep.title', 'Key Projects & Portfolios')}
            subtitle={t('ProjectsStep.subtitle', 'Showcase real-world initiatives, clinical cases, legal portfolios, or key projects.')}
            isComplete={hasProjects}
            statusBadge={`${projects.length} Project${projects.length === 1 ? '' : 's'}`}
            resumeData={resumeData}
            onNavigate={onNavigate}
        >
            <div className="space-y-3">
                {/* Command Bar: Contextual Quick-Add Actions (Always Available) */}
                <QuickAddCommandBar
                    stepPath="projects"
                    onAction={handleQuickAddAction}
                />

                {projects.length === 0 ? (
                    /* Guided Projects Setup Banner (Zero-Fabrication Architecture) */
                    <TrackGuidanceBanner
                        candidateContext={candidateContext}
                        stepName="Project or Initiative"
                        stepPath="projects"
                        focusAreas={['Project Objectives & Strategic Scope', 'Core Methodologies & Applied Tools', 'Execution Milestones & Deliverables', 'Quantifiable ROI & Impact Metrics', 'Cross-Functional Leadership']}
                        examples={projectBlueprints.slice(0, 2).map((b) => ({
                            title: b.title || 'Initiative Showcase',
                            description: b.description || 'Led cross-functional execution and delivered measurable business results.'
                        }))}
                        onStartBlank={() => addProject()}
                    />
                ) : (
                    /* High-Density Project Studio with Milestone Bar */
                    <div className="space-y-2.5">
                        {/* Milestone Bar */}
                        <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="font-bold text-slate-800 truncate">
                                    {projects.length} Project{projects.length === 1 ? '' : 's'} Documented
                                </span>
                                <span className="text-[11px] text-slate-400 hidden sm:inline">• High-Impact Showcase</span>
                            </div>
                            <button
                                type="button"
                                onClick={addProject}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer shrink-0"
                            >
                                <MdAdd className="w-3.5 h-3.5" />
                                <span>Add Project</span>
                            </button>
                        </div>

                        {projects.map((project, index) => {
                            const isExpanded = expandedCards.has(project.id);
                            const isFilled = Boolean(project.title && String(project.title).trim() !== '');

                            return (
                                <div
                                    key={project.id}
                                    className={`bg-white rounded-xl border transition-all duration-150 ${
                                        isExpanded 
                                            ? 'border-indigo-300 shadow-md ring-2 ring-indigo-500/10' 
                                            : 'border-slate-200/90 shadow-2xs hover:border-slate-300'
                                    }`}
                                >
                                    {/* Compact Card Header / Summary Row */}
                                    <div 
                                        className={`px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer ${
                                            isExpanded ? 'border-b border-slate-100 bg-slate-50/50 rounded-t-xl' : 'rounded-xl'
                                        }`}
                                        onClick={() => toggleCardExpansion(project.id)}
                                    >
                                        {/* Left: Badge + Title + URL */}
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                                isFilled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                                            }`}>
                                                {isFilled ? <MdCheck className="w-4 h-4" /> : index + 1}
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className={`text-xs sm:text-sm font-bold truncate ${project.title ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                                                        {project.title || 'Untitled Project'}
                                                    </h3>
                                                    {project.url && (
                                                        <a 
                                                            href={project.url} 
                                                            target="_blank" 
                                                            rel="noreferrer"
                                                            onClick={e => e.stopPropagation()}
                                                            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 truncate"
                                                        >
                                                            <span>Link</span>
                                                            <MdLaunch className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Quick Action Controls */}
                                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                onClick={() => moveProject(project.id, -1)}
                                                disabled={index === 0}
                                                aria-label="Move project up"
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                                title="Move up"
                                            >
                                                <MdArrowUpward className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveProject(project.id, 1)}
                                                disabled={index === projects.length - 1}
                                                aria-label="Move project down"
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                                title="Move down"
                                            >
                                                <MdArrowDownward className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => duplicateProject(project.id)}
                                                aria-label="Duplicate project"
                                                className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                                                title="Duplicate"
                                            >
                                                <MdContentCopy className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeProject(project.id)}
                                                aria-label="Remove project"
                                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                                title="Delete"
                                            >
                                                <MdDelete className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleCardExpansion(project.id)}
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer ml-1"
                                                title={isExpanded ? 'Collapse' : 'Expand'}
                                            >
                                                <MdKeyboardArrowDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Form Fields */}
                                    {isExpanded && (
                                        <div className="p-4 sm:p-5 space-y-4">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <InputField
                                                    label={t('ProjectsStep.fields.title.label', 'Project Name')}
                                                    name={`project-title-${project.id}`}
                                                    placeholder={projectBlueprints[0]?.title ? `e.g. ${projectBlueprints[0].title}` : 'e.g. Strategic Initiative, Clinical Audit, Case Analysis'}
                                                    value={project.title}
                                                    onChange={(e) => updateProject(project.id, 'title', e.target.value)}
                                                    required
                                                />
                                                <InputField
                                                    label={t('ProjectsStep.fields.url.label', 'Project / Portfolio URL (Optional)')}
                                                    name={`project-url-${project.id}`}
                                                    placeholder="e.g. https://example.com/project-link"
                                                    value={project.url || ''}
                                                    onChange={(e) => updateProject(project.id, 'url', e.target.value)}
                                                    type="url"
                                                />
                                            </div>

                                            {/* Quick Domain Tags */}
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Methodology & Skill Tags:</span>
                                                    <span className="text-[10px] text-slate-400">Click to append to project description</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {(candidateContext.skillCategories?.[0]?.skills?.slice(0, 8) 
                                                        || candidateContext.actionVerbs?.slice(0, 8) 
                                                        || ['Strategic Planning', 'Process Optimization', 'Quality Assurance', 'Performance Metrics']
                                                    ).map((tag) => (
                                                        <button
                                                            key={tag}
                                                            type="button"
                                                            onClick={() => {
                                                                const cur = project.description || '';
                                                                const sep = cur.trim().length > 0 ? '\n' : '';
                                                                updateProject(project.id, 'description', `${cur}${sep}• Applied ${tag}: led execution, managed deliverables, and achieved measurable outcomes.`);
                                                            }}
                                                            className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-md border border-slate-200 transition-colors cursor-pointer"
                                                        >
                                                            + {tag}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                                                    Scope, Methodologies & Outcomes
                                                </label>
                                                <BulletPointsEditor
                                                    value={project.description}
                                                    onChange={(value) => updateProject(project.id, 'description', value)}
                                                    placeholder="Describe project objectives, key methodologies applied, and quantifiable achievements (e.g. improved efficiency by 25%, delivered on budget)..."
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Add Project Button */}
                        <button
                            type="button"
                            onClick={addProject}
                            className="w-full h-11 border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-xl text-xs font-bold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                        >
                            <MdAdd className="w-4 h-4" />
                            <span>Add Another Project</span>
                        </button>
                    </div>
                )}
            </div>
        </StepWorkspaceLayout>
    );
};

export default ProjectsStep;
