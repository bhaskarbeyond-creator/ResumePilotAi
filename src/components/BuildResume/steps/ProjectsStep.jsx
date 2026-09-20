import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    MdAdd,
    MdLaunch,
    MdSearch,
    MdClose,
    MdAutoAwesome,
    MdCheckCircle,
} from 'react-icons/md';
import {
    FaRocket,
    FaBuilding,
    FaCode,
    FaGraduationCap,
} from 'react-icons/fa';
import StepShell from '../components/StepShell.jsx';
import EmptyState from '../components/EmptyState.jsx';
import EntryList from '../components/EntryList.jsx';
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

/**
 * Curated Archetype Project Starters by Role Domain (Profile-Aware Instant Fallbacks)
 * Strictly decoupled across 12 distinct industries to guarantee ZERO unwanted IT leakage.
 */
export const GET_CURATED_PROJECT_IDEAS = (role = '', resumeData = {}, candidateContext = {}) => {
    const target = String(role || candidateContext?.target?.role || resumeData?.targetRole || resumeData?.occupation || '').toLowerCase();
    const workTitles = (resumeData?.employments || resumeData?.workExperience || resumeData?.workExperiences || []).map(e => String(e?.jobTitle || '').toLowerCase()).join(' ');
    const skills = (resumeData?.skills || []).map(s => String(typeof s === 'object' ? (s?.skillName || s?.name) : s).toLowerCase()).join(' ');
    const combinedSignals = `${target} ${workTitles} ${skills}`;

    // 1. Healthcare, Medical, Clinical, Nursing, Dental
    if (/\b(?:doctor|physician|surgeon|cardiologist|pediatrician|resident|medical officer|general practitioner|gp|md|clinician|nurse|rn|lpn|charge nurse|dentist|prosthodontist|orthodontist|hospital|clinic|patient care)\b/.test(combinedSignals)) {
        return [
            { name: 'Clinical Quality & Patient Safety Protocol Audit', role: 'Clinical Lead', issuer: 'Tools: EHR, Clinical Audit, JCAHO/NABH Guidelines', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Emergency Triage & Inpatient Flow Optimization', role: 'Care Coordinator', issuer: 'Tools: Triage Rubrics, Epic Systems, Patient Census', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Infection Control & Post-Operative Safety Review', role: 'Quality Officer', issuer: 'Tools: CDC Guidelines, Sterile Protocols, Surveillance', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Multidisciplinary Telehealth Transition Initiative', role: 'Medical Investigator', issuer: 'Tools: Telemedicine, HIPAA/GDPR, Remote Monitoring', category: 'recommended', projectType: 'enterprise' },
            { name: 'Clinical Pathway & Length-of-Stay (LOS) Reduction', role: 'Department Contributor', issuer: 'Tools: Clinical Pathways, Outcome Metrics, Cerner', category: 'recommended', projectType: 'academic' },
        ];
    }

    // 2. Legal, Law, Attorneys, Judges, Paralegals, Compliance
    if (/\b(?:lawyer|attorney|counsel|solicitor|barrister|paralegal|litigation|judge|magistrate|compliance officer|legal)\b/.test(combinedSignals)) {
        return [
            { name: 'Contract Lifecycle Management & Risk Assessment Overhaul', role: 'Lead Counsel', issuer: 'Tools: CLM Systems, Due Diligence, Risk Matrix', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Corporate Regulatory Compliance & Data Privacy Audit', role: 'Compliance Lead', issuer: 'Tools: GDPR, CCPA, ISO 27001, Audit Trail', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Complex Commercial Litigation Evidence & Discovery Index', role: 'Trial Attorney', issuer: 'Tools: eDiscovery, Case Law Research, LexisNexis', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Cross-Border M&A Due Diligence & Transactional Review', role: 'Corporate Counsel', issuer: 'Tools: Virtual Data Rooms, Disclosure Schedules', category: 'recommended', projectType: 'enterprise' },
            { name: 'Enterprise Intellectual Property & Trademark Protection Review', role: 'IP Specialist', issuer: 'Tools: USPTO Database, Trademark Filings', category: 'recommended', projectType: 'academic' },
        ];
    }

    // 3. Accounting, Audit, Finance, Banking, Investment
    if (/\b(?:accountant|auditor|chartered accountant|cpa|finance|financial analyst|controller|bookkeeper|tax|banking|investment|equity)\b/.test(combinedSignals)) {
        return [
            { name: 'Annual Statutory Audit Readiness & Financial Close Optimization', role: 'Lead Auditor', issuer: 'Tools: GAAP, IFRS, ERP Reconciliation, NetSuite', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Multi-Year DCF Valuation & Financial Forecasting Model', role: 'Financial Analyst', issuer: 'Tools: Advanced Excel, DCF Modeling, Bloomberg Terminal', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Operational Expenditure (OpEx) Variance & Cost Reduction Audit', role: 'Financial Controller', issuer: 'Tools: Variance Analysis, SAP ERP, Power BI', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Enterprise Treasury & Working Capital Liquidity Model', role: 'Treasury Analyst', issuer: 'Tools: Cash Flow Forecasting, Liquidity Ratios', category: 'recommended', projectType: 'enterprise' },
            { name: 'Corporate Tax Compliance & Transfer Pricing Review', role: 'Tax Specialist', issuer: 'Tools: Tax Provisioning, Statutory Filings', category: 'recommended', projectType: 'enterprise' },
        ];
    }

    // 4. Human Resources, Talent Acquisition, Recruiting
    if (/\b(?:hr|human resources|recruiter|talent acquisition|people operations|headhunter|recruiting)\b/.test(combinedSignals)) {
        return [
            { name: 'Structured Behavioral Interviewing & Rubric Standardization', role: 'Talent Acquisition Director', issuer: 'Tools: Greenhouse ATS, Structured Rubrics, KPI Tracking', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Employee Onboarding & 90-Day Retention Acceleration Program', role: 'People Operations Lead', issuer: 'Tools: LMS, Culture Surveys, Workday HRIS', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Global HRIS Migration & Employee Self-Service Rollout', role: 'HR Project Manager', issuer: 'Tools: Workday, BambooHR, Data Mapping, Change Management', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Total Rewards & Compensation Band Benchmarking Review', role: 'Compensation Analyst', issuer: 'Tools: Radford Surveys, Mercer Data, Pay Equity', category: 'recommended', projectType: 'enterprise' },
            { name: 'Hybrid Workforce Engagement & Pulse Survey Framework', role: 'HR Generalist', issuer: 'Tools: Culture Amp, Qualtrics, Action Planning', category: 'recommended', projectType: 'enterprise' },
        ];
    }

    // 5. Sales, Business Development, Account Executives
    if (/\b(?:sales|account executive|business development|bdr|sdr|account manager|territory manager|quota)\b/.test(combinedSignals)) {
        return [
            { name: 'Enterprise Outbound Account Penetration & Territory Expansion', role: 'Enterprise AE', issuer: 'Tools: Salesforce, ZoomInfo, Outreach, MEDDPICC', category: 'mandatory', projectType: 'enterprise' },
            { name: 'CRM Pipeline Velocity & Lead Scoring Model Optimization', role: 'Sales Operations Lead', issuer: 'Tools: HubSpot CRM, Lead Scoring, Conversion Analytics', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Strategic Channel Partner & Reseller Distribution Program', role: 'Business Development Manager', issuer: 'Tools: Partner Agreements, Co-Selling Playbooks', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Key Account Retention & Expansion Cross-Sell Campaign', role: 'Senior Account Manager', issuer: 'Tools: Account Plans, Executive QBRs, Gainsight', category: 'recommended', projectType: 'enterprise' },
            { name: 'Sales Enablement Playbook & Objections Handling Overhaul', role: 'Sales Enablement Lead', issuer: 'Tools: Gong.io, Playbook Development, Pitch Decks', category: 'recommended', projectType: 'personal' },
        ];
    }

    // 6. Marketing, Brand, Content, Growth
    if (/\b(?:marketing|brand|growth|seo|content writer|copywriter|social media|digital marketing|campaign)\b/.test(combinedSignals)) {
        return [
            { name: 'Omnichannel Brand Repositioning & Go-To-Market Campaign', role: 'Brand Strategist', issuer: 'Tools: Brand Identity, Customer Research, Multi-Channel GTM', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Inbound Customer Acquisition & Conversion Funnel Optimization', role: 'Growth Marketer', issuer: 'Tools: Google Analytics 4, Unbounce, Optimizely, SEMrush', category: 'mandatory', projectType: 'enterprise' },
            { name: 'High-Intent SEO Content Architecture & Organic Traffic Growth', role: 'Content Marketing Lead', issuer: 'Tools: Ahrefs, Clearscope, Technical SEO, WordPress', category: 'mandatory', projectType: 'personal' },
            { name: 'Multi-Touch Attribution Model & Paid Performance Audit', role: 'Marketing Operations', issuer: 'Tools: Attribution Modeling, Looker, Meta & Google Ads', category: 'recommended', projectType: 'enterprise' },
            { name: 'Customer Lifecycle Email Nurture & Retention Automation', role: 'Lifecycle Marketer', issuer: 'Tools: Klaviyo, Segment, A/B Testing, Lifecycle Cohorts', category: 'recommended', projectType: 'enterprise' },
        ];
    }

    // 7. Product, Program, Project Management, Scrum, Agile
    if (/\b(?:product manager|product owner|project manager|program manager|scrum master|agile coach)\b/.test(combinedSignals)) {
        return [
            { name: 'Omnichannel Customer Onboarding & User Activation Redesign', role: 'Lead Product Manager', issuer: 'Tools: Figma, Mixpanel, User Interviews, Amplitude', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Cross-Functional Agile Release Cadence & Velocity Transformation', role: 'Scrum Master / Agile Coach', issuer: 'Tools: Jira, Confluence, Kanban, Miro, OKRs', category: 'mandatory', projectType: 'enterprise' },
            { name: 'B2B Self-Serve Subscription Billing & Tier Upgrade Engine', role: 'Technical PM', issuer: 'Tools: Stripe Billing, Customer Journey Mapping, SQL', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Enterprise Product Roadmap Prioritization & Feature Matrix', role: 'Principal Product Manager', issuer: 'Tools: RICE Scoring, Aha!, Stakeholder Trade-offs', category: 'recommended', projectType: 'enterprise' },
            { name: 'Voice-of-Customer Multi-Channel Feedback Portal', role: 'Product Operations Lead', issuer: 'Tools: Qualtrics, Productboard, Customer Advisory Boards', category: 'recommended', projectType: 'personal' },
        ];
    }

    // 8. Civil, Mechanical, Electrical, Structural Engineering, Architecture
    if (/\b(?:civil engineer|mechanical engineer|electrical engineer|structural engineer|architect|urban designer|hvac)\b/.test(combinedSignals)) {
        return [
            { name: 'Structural Load Rating & Seismic Resilience Assessment', role: 'Lead Structural Engineer', issuer: 'Tools: AutoCAD, SAP2000, ETABS, Building Codes', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Commercial Facility HVAC & Thermal Efficiency Modernization', role: 'Mechanical Systems Lead', issuer: 'Tools: Revit MEP, CFD Airflow Modeling, Psychrometric Charts', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Medium-Voltage Substation Protection & Relay Coordination', role: 'Electrical Engineer', issuer: 'Tools: ETAP, Short-Circuit Analysis, Single-Line Diagrams', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Urban Master Plan Schematic & Sustainable Site Development', role: 'Project Architect', issuer: 'Tools: BIM, Rhino, GIS Mapping, Zoning Compliance', category: 'recommended', projectType: 'academic' },
            { name: 'Municipal Water Distribution & Drainage Network Analysis', role: 'Civil Infrastructure Engineer', issuer: 'Tools: EPANET, Stormwater Modeling, GIS', category: 'recommended', projectType: 'enterprise' },
        ];
    }

    // 9. Education, Teaching, Academia, Professors, Researchers
    if (/\b(?:teacher|professor|educator|instructor|lecturer|pedagogy|principal|tutor)\b/.test(combinedSignals)) {
        return [
            { name: 'Differentiated Active-Learning Curriculum Redesign', role: 'Curriculum Developer', issuer: 'Tools: Standards-Based Grading, Bloom\'s Taxonomy, Canvas LMS', category: 'mandatory', projectType: 'academic' },
            { name: 'Student Competency & Formative Assessment Tracking Suite', role: 'Lead Educator', issuer: 'Tools: Google Classroom, Formative Rubrics, Performance Data', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Interactive STEM Laboratory & Experimental Learning Program', role: 'Science Instructor', issuer: 'Tools: Inquiry-Based Learning, Lab Safety, Vernier Sensors', category: 'mandatory', projectType: 'academic' },
            { name: 'Peer-Reviewed Empirical Research Study & Manuscript Publication', role: 'Principal Investigator', issuer: 'Tools: Statistical Analysis, SPSS/R, Peer Review Guidelines', category: 'recommended', projectType: 'academic' },
            { name: 'Hybrid Course Delivery & Digital Learning Integration Initiative', role: 'Instructional Designer', issuer: 'Tools: LMS Integration, EdTech Tools, Asynchronous Content', category: 'recommended', projectType: 'personal' },
        ];
    }

    // 10. Data, Data Science, Analytics, BI, Machine Learning
    if (/\b(?:data scientist|data analyst|data engineer|machine learning|ml engineer|analytics|bi developer|statistician)\b/.test(combinedSignals)) {
        return [
            { name: 'Customer Churn Prediction & ML Feature Pipeline', role: 'Lead Data Scientist', issuer: 'Stack: Python, Scikit-learn, XGBoost, Streamlit, Docker', category: 'mandatory', projectType: 'personal' },
            { name: 'Real-Time Streaming Telemetry & Anomaly Detection Pipeline', role: 'Data / ML Engineer', issuer: 'Stack: Apache Kafka, Spark Streaming, Redis, FastAPI', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Automated Cloud Data Lakehouse & ETL Orchestration', role: 'Data Engineer', issuer: 'Stack: Snowflake, dbt, Apache Airflow, AWS S3, SQL', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Executive Financial & Operational BI Intelligence Dashboard', role: 'BI Developer', issuer: 'Stack: Power BI, SQL, BigQuery, Tableau', category: 'recommended', projectType: 'enterprise' },
            { name: 'Retrieval-Augmented Semantic Search & Document Intelligence', role: 'AI Developer', issuer: 'Stack: LangChain, Vector Databases, Python, FastAPI', category: 'recommended', projectType: 'personal' },
        ];
    }

    // 11. Software, Web, Mobile, Cloud, DevOps
    if (/\b(?:software|developer|frontend|backend|full stack|web|devops|cloud|mobile|ios|android|qa|sre)\b/.test(combinedSignals)) {
        return [
            { name: 'Scalable Microservices Cloud Architecture & API Gateway', role: 'Backend Engineer', issuer: 'Stack: Go / Node.js, Docker, Kubernetes, PostgreSQL, Redis', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Accessible Design System & High-Performance Web Application', role: 'Frontend Lead', issuer: 'Stack: React, TypeScript, Tailwind CSS, Vite, Storybook', category: 'mandatory', projectType: 'opensource' },
            { name: 'Automated CI/CD Observability & Zero-Downtime Deployment Pipeline', role: 'DevOps / SRE', issuer: 'Stack: GitHub Actions, Terraform, Prometheus, Grafana, AWS', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Cross-Platform Mobile Application (iOS & Android)', role: 'Mobile Developer', issuer: 'Stack: React Native / Flutter, SQLite, WebSockets', category: 'recommended', projectType: 'personal' },
            { name: 'Zero-Trust Authentication & Distributed Session Engine', role: 'Systems Engineer', issuer: 'Stack: OAuth2, JWT, Redis, Rate Limiting, Node.js', category: 'recommended', projectType: 'personal' },
        ];
    }

    // 12. Universal Professional Operations / Business Management Fallback
    return [
        { name: 'Cross-Functional Operational Workflow & Process Optimization', role: 'Operations Lead', issuer: 'Tools: Standard Operating Procedures (SOP), Lean Workflow, Asana', category: 'mandatory', projectType: 'enterprise' },
        { name: 'Client Service Delivery & Response Turnaround Acceleration', role: 'Service Delivery Manager', issuer: 'Tools: CRM Ticketing, SLA Tracking, Quality Standards', category: 'mandatory', projectType: 'enterprise' },
        { name: 'Strategic Vendor Evaluation & Contract Renegotiation Initiative', role: 'Project Coordinator', issuer: 'Tools: Vendor Scorecards, RFP Process, Cost Optimization', category: 'mandatory', projectType: 'enterprise' },
        { name: 'Departmental Resource Planning & Capacity Utilization Review', role: 'Business Operations Specialist', issuer: 'Tools: Resource Scheduling, KPI Dashboards, MS Excel', category: 'recommended', projectType: 'enterprise' },
        { name: 'Cross-Department Communication & Team Knowledge Base System', role: 'Program Lead', issuer: 'Tools: Notion / Confluence, Documentation Standards', category: 'recommended', projectType: 'personal' },
    ];
};

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
            let curatedList = GET_CURATED_PROJECT_IDEAS(effectiveRole, resumeData, candidateContext);

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

                const candidateProjects = Array.isArray(aiResult?.projects)
                    ? aiResult.projects
                    : (Array.isArray(aiResult?.items) ? aiResult.items : (Array.isArray(aiResult) ? aiResult : null));

                if (candidateProjects && candidateProjects.length > 0) {
                    curatedList = candidateProjects.map(cp => ({
                        name: cp.name || cp.title,
                        role: cp.role || 'Project Lead',
                        issuer: cp.technologies ? (cp.technologies.startsWith('Stack: ') || cp.technologies.startsWith('Tools: ') ? cp.technologies : `Tools: ${cp.technologies}`) : (cp.issuer || ''),
                        category: cp.category === 'mandatory' ? 'mandatory' : 'recommended',
                        projectType: cp.projectType || 'enterprise',
                    })).filter(p => Boolean(p.name));
                }
            } catch {
                // Seamlessly fall back to profile-matched curated list
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

                    {/* EntryList with Custom Title & Dynamic Subtitle */}
                    <EntryList
                        entries={filteredProjects.map(project => ({
                            ...project,
                            onMoveUp: () => moveProject(project.id, -1),
                            onMoveDown: () => moveProject(project.id, 1),
                            onDuplicate: () => duplicateProject(project.id),
                            onDelete: () => removeProject(project.id),
                        }))}
                        renderEntryTitle={(project) => {
                            const typeConfig = PROJECT_TYPES.find(t => t.id === project.projectType) || PROJECT_TYPES[0];
                            const subtitleParts = [
                                project.role,
                                project.technologies,
                            ].filter(Boolean);

                            const subtitle = subtitleParts.length > 0
                                ? subtitleParts.join(' • ')
                                : (project.url ? String(project.url).replace(/^https?:\/\//, '').slice(0, 45) : 'Add role, tools & details');

                            return {
                                title: project.title || 'Untitled Project',
                                subtitle: subtitle,
                                meta: typeConfig.label,
                            };
                        }}
                        renderEntry={renderEntryBody}
                    />

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
