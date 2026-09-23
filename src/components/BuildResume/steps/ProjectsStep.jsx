import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    MdAdd,
    MdLaunch,
    MdSearch,
    MdClose,
    MdAutoAwesome,
    MdCheckCircle,
    MdContentCopy,
    MdDeleteOutline,
} from 'react-icons/md';
import {
    FaRocket,
    FaBuilding,
    FaCode,
    FaGraduationCap,
} from 'react-icons/fa';
import StepShell from '../components/StepShell.jsx';
import EmptyState from '../components/EmptyState.jsx';
// Architecture: Dedicated elevated Cards view (replaces legacy EntryList accordion)
import Field from '../components/Field.jsx';
import AiRecommendationModal from '../../Form/AiRecommendationModal.jsx';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';
import { generateUserAiContent } from '../../../services/aiService';

export const PROJECT_TYPES = [
    { id: 'personal', label: 'Personal Build', icon: FaRocket, badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { id: 'enterprise', label: 'Work / Enterprise', icon: FaBuilding, badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { id: 'opensource', label: 'Open Source', icon: FaCode, badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
    { id: 'academic', label: 'Academic / Research', icon: FaGraduationCap, badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
];

// Role-template project ideas were removed in Phase 3:
// recommendations come only from AI for this candidate; on outage the UI says so.

/**
 * 10/10 Projects Step — World-Class Resume Builder Experience:
 * - 2-Tier Header Toolbar: Title, Count Badge, AI Auto-Recommend Projects Modal & Add Project primary action.
 * - Live Search Filter across project titles, roles, technologies, and URLs.
 * - Project Type Segmented Selector (🚀 Personal | 🏢 Enterprise | 💻 Open Source | 🎓 Academic).
 * - Full Profile Consideration: AI recommendations read candidate target role, employments, skills, and JD.
 * - Streamlined 5-Field Project Architecture: Project Name, Role, Technologies, Portfolio URL, and Category.
 * - Interactive AI Recommendation Review Modal with Core vs Recommended separation & multi-select.
 * - Zero-Data Loss Autosaving & Synchronous Step Flush on Unmount.
 * - Zero-Fabrication Safety: Initialized with empty description, strictly preserving invariants.
 */
const ProjectsStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [projects, setProjects] = useState(resumeData.projects || []);
    const candidateContext = getCandidateContext(resumeData, resumeData.targetJobDescription || '');
    const targetJd = resumeData.targetJobDescription || '';

    // Search and Filter States
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');

    // AI Modal and Feedback States
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const [toastState, setToastState] = useState(null);
    const [aiModalState, setAiModalState] = useState({
        isOpen: false,
        title: '',
        items: [],
        onApply: null,
    });

    useEffect(() => {
        if (resumeData.projects && Array.isArray(resumeData.projects)) {
            setProjects(resumeData.projects);
        }
    }, [resumeData.projects]);

    const triggerToast = (msg, type = 'success') => {
        setToastState({ msg, type });
        setTimeout(() => setToastState(null), 3500);
    };

    const createNewProject = (title = '', role = '', technologies = '', projectType = 'personal') => ({
        id: Date.now() + Math.floor(Math.random() * 1000),
        title: title || '',
        role: role || '',
        technologies: technologies || '',
        url: '',
        description: '',
        projectType: projectType || 'personal',
    });

    const addProject = () => {
        const newProject = createNewProject();
        setProjects(prev => [...prev, newProject]);
        triggerToast('Added new project entry. Fill in the details below!');
    };

    const removeProject = (id) => {
        setProjects(prev => prev.filter(p => p.id !== id));
        triggerToast('Project removed.', 'info');
    };

    const moveProject = (id, direction) => setProjects(current => moveResumeItem(current, id, direction));

    const duplicateProject = (id) => setProjects(current => {
        const source = current.find(p => p.id === id);
        triggerToast(`Duplicated "${source?.title || 'Project'}"`);
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

    // Unmount flush: synchronously commit state on step exit
    const projectsRef = useRef(projects);
    const updateResumeDataRef = useRef(updateResumeData);
    const completedStepsRef = useRef(resumeData?.completedSteps || []);
    useEffect(() => { projectsRef.current = projects; }, [projects]);
    useEffect(() => { updateResumeDataRef.current = updateResumeData; }, [updateResumeData]);
    useEffect(() => { completedStepsRef.current = resumeData?.completedSteps || []; }, [resumeData?.completedSteps]);
    useEffect(() => () => {
        const projs = projectsRef.current;
        const validProjects = projs.filter(p => String(p?.title || p?.name || '').trim() !== '');
        const completedSteps = [...(completedStepsRef.current || [])];
        let updatedCompletedSteps = null;
        if (validProjects.length > 0 && !completedSteps.includes(5)) {
            updatedCompletedSteps = [...completedSteps, 5];
        } else if (validProjects.length === 0 && completedSteps.includes(5)) {
            updatedCompletedSteps = completedSteps.filter(step => step !== 5);
        }
        updateResumeDataRef.current({
            projects: projs,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    }, []);

    // Filter projects according to search query and selected type tab
    const filteredProjects = useMemo(() => {
        return projects.filter(p => {
            const query = searchQuery.trim().toLowerCase();
            const matchesSearch = !query || [
                p.title,
                p.role,
                p.technologies,
                p.url,
            ].some(val => String(val || '').toLowerCase().includes(query));

            const matchesType = selectedTypeFilter === 'all' || (p.projectType || 'personal') === selectedTypeFilter;
            return matchesSearch && matchesType;
        });
    }, [projects, searchQuery, selectedTypeFilter]);

    // Handle AI Project Recommendations with Full Candidate Profile Consideration
    const handleRecommendAiProjects = async () => {
        const effectiveRole = String(
            candidateContext?.target?.role ||
            resumeData.targetRole ||
            resumeData.occupation ||
            resumeData.title ||
            resumeData.targetJobTitle ||
            (resumeData.employments?.[0]?.jobTitle || resumeData.workExperience?.[0]?.jobTitle || resumeData.workExperiences?.[0]?.jobTitle) ||
            (resumeData.educations?.[0]?.degree || resumeData.education?.[0]?.degree) ||
            ''
        ).trim();

        const candidateSkills = (resumeData.skills || []).map(s => typeof s === 'object' ? (s.skillName || s.name) : s).filter(Boolean);
        const candidateEmployments = (resumeData.employments || resumeData.workExperience || resumeData.workExperiences || []).map(e => ({
            title: e.jobTitle || e.title,
            employer: e.employer || e.company,
            description: e.description,
        }));

        setIsAiGenerating(true);
        try {
            const existingTitles = new Set(projects.map(p => String(p.title || '').trim().toLowerCase()).filter(Boolean));
            // Only AI results for this request are offered; no role-template ideas.
            let curatedList = [];
            let aiUnavailable = false;

            // Attempt AI enhancement using the registered 'generate-projects' operation
            try {
                const aiResult = await generateUserAiContent('generate-projects', {
                    targetRole: effectiveRole || 'Professional',
                    occupation: effectiveRole || 'Professional',
                    candidateFacts: {
                        roles: candidateEmployments,
                        skills: candidateSkills,
                        education: resumeData.educations || resumeData.education || [],
                        summary: resumeData.summary || '',
                    },
                    context: candidateContext,
                    existingTitles: Array.from(existingTitles),
                    language: resumeData.language || 'en',
                    targetJobDescription: resumeData.targetJobDescription || '',
                });

                if (aiResult?.aiUnavailable) aiUnavailable = true;
                const candidateProjects = Array.isArray(aiResult?.projects)
                    ? aiResult.projects
                    : (Array.isArray(aiResult?.items) ? aiResult.items : (Array.isArray(aiResult) ? aiResult : null));

                if (candidateProjects && candidateProjects.length > 0) {
                    curatedList = candidateProjects.map(cp => ({
                        name: cp.name || cp.title,
                        role: cp.role || '',
                        issuer: cp.technologies ? (cp.technologies.startsWith('Stack: ') || cp.technologies.startsWith('Tools: ') ? cp.technologies : `Tools: ${cp.technologies}`) : (cp.issuer || ''),
                        category: cp.category === 'mandatory' ? 'mandatory' : 'recommended',
                        projectType: cp.projectType || 'enterprise',
                    })).filter(p => Boolean(p.name));
                }
            } catch {
                aiUnavailable = true;
            }

            if (!curatedList.length) {
                triggerToast(aiUnavailable
                    ? 'AI project recommendations are unavailable right now. Please try again in a moment.'
                    : 'AI could not suggest projects from your current details. Add more about your work or skills, then try again.', 'info');
                return;
            }

            // Exclude already added projects
            const unadded = curatedList.filter(item => !existingTitles.has(String(item.name || item.title || '').trim().toLowerCase()));

            if (!unadded.length) {
                triggerToast('All recommended project ideas for this role are already in your resume!', 'info');
                return;
            }

            setAiModalState({
                isOpen: true,
                title: `Review AI Recommended Projects for ${effectiveRole || 'Your Target Role'}`,
                items: unadded,
                onApply: (approvedItems) => {
                    const toAdd = approvedItems.map(item => {
                        const rawIssuer = String(item.issuer || item.technologies || '');
                        const stack = rawIssuer.startsWith('Stack: ') || rawIssuer.startsWith('Tools: ')
                            ? rawIssuer.replace(/^(?:Stack|Tools):\s*/, '')
                            : rawIssuer;

                        return createNewProject(
                            item.name || item.title,
                            item.role || '',
                            stack,
                            item.projectType || 'enterprise'
                        );
                    });

                    setProjects(prev => [...prev, ...toAdd]);
                    triggerToast(`Added ${toAdd.length} project(s) to your resume! Check them out below.`);
                }
            });
        } catch (err) {
            triggerToast('Unable to fetch project ideas. Please try again.', 'error');
        } finally {
            setIsAiGenerating(false);
        }
    };

    const hasProjects = projects.some(p => String(p?.title || p?.name || '').trim() !== '');

    const renderEntryBody = (project) => {
        return (
            <div className="space-y-4 pt-1">
                {/* Row 1: Title & Role */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <Field
                        label={t('ProjectsStep.fields.title.label', 'Project Name')}
                        name={`project-title-${project.id}`}
                        placeholder={getDynamicPlaceholder('projects', 'title', candidateContext) || 'e.g. Distributed E-Commerce Backend, Real-Time Chat App'}
                        value={project.title}
                        onChange={(e) => updateProject(project.id, 'title', e.target.value)}
                        required
                    />
                    <Field
                        label="Your Role in Project"
                        name={`project-role-${project.id}`}
                        placeholder="e.g. Lead Architect, Full Stack Developer, Creator"
                        value={project.role || ''}
                        onChange={(e) => updateProject(project.id, 'role', e.target.value)}
                        optional
                    />
                </div>

                {/* Row 2: Technologies & URL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <Field
                        label="Technologies / Tools Used"
                        name={`project-technologies-${project.id}`}
                        placeholder="e.g. React, Node.js, PostgreSQL, Docker, AWS, TailwindCSS"
                        value={project.technologies || ''}
                        onChange={(e) => updateProject(project.id, 'technologies', e.target.value)}
                        optional
                    />
                    <div>
                        <Field
                            label={t('ProjectsStep.fields.url.label', 'Project / Portfolio URL')}
                            name={`project-url-${project.id}`}
                            type="url"
                            placeholder="https://github.com/... or https://..."
                            value={project.url || ''}
                            onChange={(e) => updateProject(project.id, 'url', e.target.value)}
                            optional
                        />
                        {project.url && /^https?:\/\//i.test(String(project.url)) && (
                            <div className="mt-1.5 flex items-center justify-end">
                                <a
                                    href={project.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                                >
                                    <span>Test live URL</span>
                                    <MdLaunch className="w-3.5 h-3.5" />
                                </a>
                            </div>
                        )}
                    </div>
                </div>

                {/* Row 3: Project Type Selector */}
                <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                        Project Type / Category
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {PROJECT_TYPES.map(type => {
                            const Icon = type.icon;
                            const isSelected = (project.projectType || 'personal') === type.id;
                            return (
                                <button
                                    key={type.id}
                                    type="button"
                                    onClick={() => updateProject(project.id, 'projectType', type.id)}
                                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                                        isSelected
                                            ? `${type.badgeClass} ring-2 ring-indigo-500/20 shadow-xs`
                                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    <span>{type.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const renderGuideContent = () => {
        return (
            <div className="space-y-4">
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 space-y-2.5">
                    <h3 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                        <MdAutoAwesome className="w-4 h-4 text-indigo-600" />
                        <span>Project Tips & Best Practices</span>
                    </h3>
                    <ul className="space-y-2 text-[11px] text-slate-600">
                        <li className="flex items-start gap-1.5">
                            <span className="text-indigo-600 font-bold">•</span>
                            <span><strong>Select 2–4 Top Projects:</strong> Focus on projects that showcase your core capabilities and directly align with your target role.</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <span className="text-indigo-600 font-bold">•</span>
                            <span><strong>Specify Tools & Technologies:</strong> List concrete tools, frameworks, and methodologies so recruiters immediately spot your proficiencies.</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <span className="text-indigo-600 font-bold">•</span>
                            <span><strong>Include Live URLs:</strong> Provide a direct link to a live site, GitHub repo, publication, or case study.</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <span className="text-indigo-600 font-bold">•</span>
                            <span><strong>Categorize Accurately:</strong> Tag each entry as Personal Build, Work / Enterprise, Open Source, or Academic research.</span>
                        </li>
                    </ul>
                </div>
            </div>
        );
    };

    return (
        <StepShell
            stepNumber={5}
            stepPath="projects"
            title={t('ProjectsStep.title', 'Projects & Key Initiatives')}
            subtitle={t('ProjectsStep.subtitle', 'Work that showcases your skills — personal builds, enterprise deployments, open-source work, and academic research.')}
            isComplete={hasProjects}
            statusBadge={projects.length > 0 ? `${projects.length} ${projects.length === 1 ? 'Project' : 'Projects'}` : ''}
            resumeData={resumeData}
            targetJd={resumeData.targetJobDescription || ''}
            guideContent={renderGuideContent()}
        >
            {/* Lightweight Toast Feedback */}
            {toastState && (
                <div className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-bold animate-slideUp flex items-center gap-2 ${
                    toastState.type === 'error'
                        ? 'bg-rose-900 text-white border-rose-700'
                        : toastState.type === 'info'
                            ? 'bg-slate-900 text-white border-slate-700'
                            : 'bg-emerald-900 text-white border-emerald-700'
                }`}>
                    <MdCheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>{toastState.msg}</span>
                </div>
            )}

            {/* AI Recommendations Review Modal */}
            <AiRecommendationModal
                isOpen={aiModalState.isOpen}
                onClose={() => setAiModalState(prev => ({ ...prev, isOpen: false }))}
                title={aiModalState.title}
                items={aiModalState.items}
                onApply={aiModalState.onApply}
            />

            {projects.length === 0 ? (
                <EmptyState
                    title="Showcase your strongest projects"
                    description="Projects are concrete proof of what you can build. Add personal creations, enterprise milestones, open-source contributions, or university research."
                    primaryAction={{
                        label: 'Add First Project',
                        icon: <MdAdd className="w-4 h-4" />,
                        onClick: addProject,
                    }}
                    secondaryAction={{
                        label: isAiGenerating ? 'Generating Ideas...' : '🪄 Auto-Recommend Project Ideas (AI)',
                        icon: <MdAutoAwesome className="w-4 h-4 text-indigo-500" />,
                        onClick: handleRecommendAiProjects,
                        disabled: isAiGenerating,
                    }}
                />
            ) : (
                <div className="space-y-4">
                    {/* 10/10 Command Toolbar: Row 1 Header & Primary Actions */}
                    <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-2.5">
                            <span className="text-sm font-extrabold text-slate-800 tracking-tight">
                                Project Portfolio
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold">
                                {projects.length} {projects.length === 1 ? 'Project' : 'Projects'}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={handleRecommendAiProjects}
                                disabled={isAiGenerating}
                                className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all hover:shadow-md disabled:opacity-50"
                            >
                                <MdAutoAwesome className="w-4 h-4" />
                                <span>{isAiGenerating ? 'Analyzing...' : '🪄 Auto-Recommend (AI)'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={addProject}
                                className="h-9 px-3.5 rounded-xl bg-white hover:bg-indigo-50/50 border border-slate-300 hover:border-indigo-300 text-slate-800 hover:text-indigo-700 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all"
                            >
                                <MdAdd className="w-4 h-4 text-indigo-600" />
                                <span>Add Project</span>
                            </button>
                        </div>
                    </div>

                    {/* Toolbar Row 2: Search and Type Filter Tabs (when > 1 project) */}
                    {projects.length > 1 && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                            {/* Live Search */}
                            <div className="relative flex-1 max-w-sm">
                                <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search projects, roles, or tools..."
                                    className="w-full h-9 pl-9 pr-8 text-xs bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        <MdClose className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Category Filter Pills */}
                            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                                <button
                                    type="button"
                                    onClick={() => setSelectedTypeFilter('all')}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                                        selectedTypeFilter === 'all'
                                            ? 'bg-slate-800 text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    All ({projects.length})
                                </button>
                                {PROJECT_TYPES.map(t => {
                                    const count = projects.filter(p => (p.projectType || 'personal') === t.id).length;
                                    if (count === 0 && selectedTypeFilter !== t.id) return null;
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setSelectedTypeFilter(t.id)}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                                                selectedTypeFilter === t.id
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                        >
                                            {t.label} ({count})
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Projects Elevated Cards */}
                    <div className="space-y-4">
                        {filteredProjects.map((project) => {
                            const originalIndex = projects.findIndex(p => p.id === project.id);
                            const typeConfig = PROJECT_TYPES.find(t => t.id === project.projectType) || PROJECT_TYPES[0];
                            const subtitleParts = [
                                project.role,
                                project.technologies,
                            ].filter(Boolean);

                            const subtitle = subtitleParts.length > 0
                                ? subtitleParts.join(' • ')
                                : (project.url ? String(project.url).replace(/^https?:\/\//, '').slice(0, 45) : 'Add role, tools & details');

                            return (
                                <div
                                    key={project.id}
                                    className="p-5 bg-white border border-slate-200/90 rounded-2xl space-y-4 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all"
                                >
                                    {/* Card Header */}
                                    <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
                                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                            <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 font-extrabold flex items-center justify-center text-xs shrink-0 border border-indigo-100/80">
                                                #{originalIndex + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <h4 className="text-xs font-bold text-slate-900 truncate">
                                                    {project.title || 'Untitled Project'}
                                                </h4>
                                                <p className="text-[11px] text-slate-500 truncate">
                                                    {subtitle}
                                                </p>
                                            </div>
                                            <span className={`ml-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${typeConfig.badgeClass}`}>
                                                {typeConfig.label}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                disabled={originalIndex === 0}
                                                onClick={() => moveProject(project.id, -1)}
                                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-100 text-xs font-bold transition-colors"
                                                title="Move project up"
                                            >
                                                ▲
                                            </button>
                                            <button
                                                type="button"
                                                disabled={originalIndex === projects.length - 1}
                                                onClick={() => moveProject(project.id, 1)}
                                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-100 text-xs font-bold transition-colors"
                                                title="Move project down"
                                            >
                                                ▼
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => duplicateProject(project.id)}
                                                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                                title="Duplicate project"
                                            >
                                                <MdContentCopy className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeProject(project.id)}
                                                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer ml-0.5"
                                                title="Delete project"
                                            >
                                                <MdDeleteOutline className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Card Body */}
                                    {renderEntryBody(project)}
                                </div>
                            );
                        })}
                    </div>

                    {/* Add Another Project Secondary Button */}
                    <button
                        type="button"
                        onClick={addProject}
                        className="w-full h-11 rounded-2xl border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-sm font-bold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-all shadow-2xs"
                    >
                        <MdAdd className="w-4 h-4 text-indigo-600" />
                        <span>Add Another Project</span>
                    </button>
                </div>
            )}
        </StepShell>
    );
};

export default ProjectsStep;
