import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    MdAdd,
    MdSearch,
    MdClose,
    MdAutoAwesome,
    MdCheckCircle,
    MdContentCopy,
    MdDeleteOutline,
    MdLaunch,
} from 'react-icons/md';
import {
    FaCertificate,
    FaShieldAlt,
    FaClipboardCheck,
    FaGraduationCap,
    FaBookOpen,
} from 'react-icons/fa';
import StepShell from '../components/StepShell.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Field from '../components/Field.jsx';
import AutocompleteInputField from './components/AutocompleteInputField';
import AiPromptCard from '../components/AiPromptCard.jsx';
import AiRecommendationModal from '../../Form/AiRecommendationModal.jsx';
import { useAiAssist } from '../ai/useAiAssist.js';
import { canRunAssistOperation } from '../ai/aiContract.js';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';
import { generateUserAiContent } from '../../../services/aiService';

export const CERT_TYPES = [
    { id: 'Certification', label: 'Certification', icon: FaCertificate, badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { id: 'License', label: 'License', icon: FaShieldAlt, badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { id: 'Registration', label: 'Registration', icon: FaClipboardCheck, badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
    { id: 'Training', label: 'Training', icon: FaGraduationCap, badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
    { id: 'Course', label: 'Course', icon: FaBookOpen, badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
];

/**
 * Curated Archetype Certification Starters by Role Domain
 * Guarantees instantaneous, domain-relevant recommendations even offline.
 */
export const GET_CURATED_CERTIFICATION_IDEAS = (role = '', resumeData = {}, candidateContext = {}) => {
    const target = String(role || candidateContext?.target?.role || resumeData?.targetRole || resumeData?.occupation || '').toLowerCase();
    const workTitles = (resumeData?.employments || resumeData?.workExperience || resumeData?.workExperiences || []).map(e => String(e?.jobTitle || '').toLowerCase()).join(' ');
    const skills = (resumeData?.skills || []).map(s => String(typeof s === 'object' ? (s?.skillName || s?.name) : s).toLowerCase()).join(' ');
    const combinedSignals = `${target} ${workTitles} ${skills}`;

    // 1. Healthcare, Medical, Clinical, Nursing, Dental
    if (/\b(?:doctor|physician|surgeon|cardiologist|pediatrician|resident|medical officer|general practitioner|gp|md|clinician|nurse|rn|lpn|charge nurse|dentist|prosthodontist|orthodontist|hospital|clinic|patient care)\b/.test(combinedSignals)) {
        return [
            { name: 'Basic Life Support (BLS)', issuer: 'American Heart Association (AHA)', category: 'mandatory', certType: 'Certification' },
            { name: 'Advanced Cardiovascular Life Support (ACLS)', issuer: 'American Heart Association (AHA)', category: 'mandatory', certType: 'Certification' },
            { name: 'Registered Nurse (RN) License / Medical License', issuer: 'State Board of Nursing / Medical Board', category: 'mandatory', certType: 'License', isLicense: true },
            { name: 'Pediatric Advanced Life Support (PALS)', issuer: 'American Heart Association (AHA)', category: 'recommended', certType: 'Certification' },
            { name: 'Certified Critical Care Registered Nurse (CCRN)', issuer: 'American Association of Critical-Care Nurses', category: 'recommended', certType: 'Certification' },
        ];
    }

    // 2. Legal, Law, Attorneys, Judges, Paralegals, Compliance
    if (/\b(?:lawyer|attorney|counsel|solicitor|barrister|paralegal|litigation|judge|magistrate|compliance officer|legal)\b/.test(combinedSignals)) {
        return [
            { name: 'State Bar Admission & License to Practice Law', issuer: 'State Supreme Court / State Bar Association', category: 'mandatory', certType: 'License', isLicense: true },
            { name: 'Certified Information Privacy Professional (CIPP/US)', issuer: 'International Association of Privacy Professionals (IAPP)', category: 'mandatory', certType: 'Certification' },
            { name: 'Certified Compliance & Ethics Professional (CCEP)', issuer: 'Society of Corporate Compliance and Ethics (SCCE)', category: 'mandatory', certType: 'Certification' },
            { name: 'Certified Paralegal (CP)', issuer: 'National Association of Legal Assistants (NALA)', category: 'recommended', certType: 'Certification' },
            { name: 'Certified Anti-Money Laundering Specialist (CAMS)', issuer: 'ACAMS', category: 'recommended', certType: 'Certification' },
        ];
    }

    // 3. Accounting, Audit, Finance, Banking, Investment
    if (/\b(?:accountant|auditor|chartered accountant|cpa|finance|financial analyst|controller|bookkeeper|tax|banking|investment|equity)\b/.test(combinedSignals)) {
        return [
            { name: 'Certified Public Accountant (CPA)', issuer: 'AICPA / State Board of Accountancy', category: 'mandatory', certType: 'License', isLicense: true },
            { name: 'Chartered Financial Analyst (CFA)', issuer: 'CFA Institute', category: 'mandatory', certType: 'Certification' },
            { name: 'Certified Internal Auditor (CIA)', issuer: 'The Institute of Internal Auditors (IIA)', category: 'mandatory', certType: 'Certification' },
            { name: 'Financial Risk Manager (FRM)', issuer: 'Global Association of Risk Professionals (GARP)', category: 'recommended', certType: 'Certification' },
            { name: 'Certified Management Accountant (CMA)', issuer: 'Institute of Management Accountants (IMA)', category: 'recommended', certType: 'Certification' },
        ];
    }

    // 4. Human Resources, Talent Acquisition, People Operations
    if (/\b(?:hr|human resources|recruiter|talent acquisition|people operations|headhunter|recruiting)\b/.test(combinedSignals)) {
        return [
            { name: 'SHRM Certified Professional (SHRM-CP)', issuer: 'Society for Human Resource Management (SHRM)', category: 'mandatory', certType: 'Certification' },
            { name: 'Professional in Human Resources (PHR)', issuer: 'HR Certification Institute (HRCI)', category: 'mandatory', certType: 'Certification' },
            { name: 'Talent Acquisition Strategist (TAS)', issuer: 'Human Capital Institute (HCI)', category: 'recommended', certType: 'Certification' },
            { name: 'Senior Professional in Human Resources (SPHR)', issuer: 'HR Certification Institute (HRCI)', category: 'recommended', certType: 'Certification' },
            { name: 'Certified Diversity Recruiter (CDR)', issuer: 'AIRS', category: 'recommended', certType: 'Certification' },
        ];
    }

    // 5. Sales, Business Development, Account Management
    if (/\b(?:sales|account executive|business development|bdr|sdr|account manager|territory manager|quota)\b/.test(combinedSignals)) {
        return [
            { name: 'Salesforce Certified Administrator', issuer: 'Salesforce', category: 'mandatory', certType: 'Certification' },
            { name: 'HubSpot Inbound Sales & Frictionless Sales Certification', issuer: 'HubSpot Academy', category: 'mandatory', certType: 'Certification' },
            { name: 'Certified Professional Sales Person (CPSP)', issuer: 'National Association of Sales Professionals (NASP)', category: 'mandatory', certType: 'Certification' },
            { name: 'MEDDPICC Enterprise Sales Certified', issuer: 'MEDDIC Academy', category: 'recommended', certType: 'Certification' },
            { name: 'Gong Certified Professional', issuer: 'Gong.io', category: 'recommended', certType: 'Certification' },
        ];
    }

    // 6. Marketing, Brand, Content, Growth, Digital Marketing
    if (/\b(?:marketing|brand|growth|seo|content writer|copywriter|social media|digital marketing|campaign)\b/.test(combinedSignals)) {
        return [
            { name: 'Google Analytics 4 (GA4) Certification', issuer: 'Google Skillshop', category: 'mandatory', certType: 'Certification' },
            { name: 'Google Ads Search & Measurement Certified', issuer: 'Google Skillshop', category: 'mandatory', certType: 'Certification' },
            { name: 'HubSpot Content & Inbound Marketing Specialist', issuer: 'HubSpot Academy', category: 'mandatory', certType: 'Certification' },
            { name: 'Meta Certified Digital Marketing Associate', issuer: 'Meta Blueprint', category: 'recommended', certType: 'Certification' },
            { name: 'Semrush Technical SEO & Keyword Research Certification', issuer: 'Semrush Academy', category: 'recommended', certType: 'Certification' },
        ];
    }

    // 7. Product, Program, Project Management, Scrum, Agile
    if (/\b(?:product manager|product owner|project manager|program manager|scrum master|agile coach)\b/.test(combinedSignals)) {
        return [
            { name: 'Project Management Professional (PMP)®', issuer: 'Project Management Institute (PMI)', category: 'mandatory', certType: 'Certification' },
            { name: 'Certified ScrumMaster (CSM)® / PSM I', issuer: 'Scrum Alliance / Scrum.org', category: 'mandatory', certType: 'Certification' },
            { name: 'PMI Agile Certified Practitioner (PMI-ACP)®', issuer: 'Project Management Institute (PMI)', category: 'mandatory', certType: 'Certification' },
            { name: 'Certified Product Manager (CPM)', issuer: 'AIPMM', category: 'recommended', certType: 'Certification' },
            { name: 'Lean Six Sigma Green Belt (LSSGB)', issuer: 'IASSC / ASQ', category: 'recommended', certType: 'Certification' },
        ];
    }

    // 8. Civil, Mechanical, Electrical Engineering, Architecture, Construction
    if (/\b(?:civil engineer|mechanical engineer|electrical engineer|structural engineer|architect|urban designer|hvac|construction)\b/.test(combinedSignals)) {
        return [
            { name: 'Professional Engineer (PE) License', issuer: 'State Licensing Board / NCEES', category: 'mandatory', certType: 'License', isLicense: true },
            { name: 'Engineer in Training (EIT) / Fundamentals of Engineering (FE)', issuer: 'NCEES', category: 'mandatory', certType: 'Certification' },
            { name: 'LEED Green Associate / LEED AP BD+C', issuer: 'U.S. Green Building Council (USGBC)', category: 'mandatory', certType: 'Certification' },
            { name: 'OSHA 30-Hour Construction Safety & Health', issuer: 'Occupational Safety and Health Administration (OSHA)', category: 'recommended', certType: 'Training' },
            { name: 'Autodesk Certified Professional: Revit / AutoCAD', issuer: 'Autodesk', category: 'recommended', certType: 'Certification' },
        ];
    }

    // 9. Education, Teaching, Academia
    if (/\b(?:teacher|professor|educator|instructor|lecturer|pedagogy|principal|tutor)\b/.test(combinedSignals)) {
        return [
            { name: 'State Professional Educator / Teaching License', issuer: 'State Department of Education', category: 'mandatory', certType: 'License', isLicense: true },
            { name: 'Google Certified Educator Level 1 & 2', issuer: 'Google for Education', category: 'mandatory', certType: 'Certification' },
            { name: 'National Board Certification (NBCT)', issuer: 'National Board for Professional Teaching Standards', category: 'recommended', certType: 'Certification' },
            { name: 'TESOL / TEFL Certification (120+ Hours)', issuer: 'Accredited International TESOL Institute', category: 'recommended', certType: 'Certification' },
            { name: 'Certified Online Instructor (COI)', issuer: 'Online Learning Consortium (OLC)', category: 'recommended', certType: 'Training' },
        ];
    }

    // 10. Software Engineering, Cloud, DevOps, Cybersecurity, Data Science (Default Tech)
    return [
        { name: 'AWS Certified Solutions Architect – Associate', issuer: 'Amazon Web Services (AWS)', category: 'mandatory', certType: 'Certification' },
        { name: 'Certified Kubernetes Administrator (CKA)', issuer: 'Cloud Native Computing Foundation (CNCF)', category: 'mandatory', certType: 'Certification' },
        { name: 'Certified Information Systems Security Professional (CISSP)', issuer: 'ISC2', category: 'mandatory', certType: 'Certification' },
        { name: 'HashiCorp Certified: Terraform Associate', issuer: 'HashiCorp', category: 'recommended', certType: 'Certification' },
        { name: 'Microsoft Certified: Azure Solutions Architect Expert', issuer: 'Microsoft', category: 'recommended', certType: 'Certification' },
    ];
};

/**
 * CertificationsStep — Modern Dedicated Elevated Cards Architecture
 * Replaces legacy EntryList accordion with rich card-based credential management,
 * live search, classification filtering, and the exact AI Recommendation Review Popup
 * from DashboardSettings (subtab=certifications).
 */
const CertificationsStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [certifications, setCertifications] = useState(resumeData.certifications || []);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');
    const [toastState, setToastState] = useState(null);
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const [aiModalState, setAiModalState] = useState({
        isOpen: false,
        title: '',
        type: 'certifications',
        items: [],
        onApply: () => {},
    });

    const candidateContext = getCandidateContext(resumeData, resumeData.targetJobDescription || '');
    const ai = useAiAssist();

    const triggerToast = (msg, type = 'success') => {
        setToastState({ msg, type });
        setTimeout(() => setToastState(null), 3500);
    };

    useEffect(() => {
        if (resumeData.certifications && Array.isArray(resumeData.certifications)) {
            setCertifications(resumeData.certifications);
        }
    }, [resumeData.certifications]);

    const createNewCertification = (initialData = {}) => ({
        id: Date.now() + Math.floor(Math.random() * 1000),
        title: initialData.title || initialData.name || '',
        issuer: initialData.issuer || '',
        date: initialData.date || '', // BLANK by default — never fabricate a year
        endDate: initialData.endDate || '',
        credentialId: initialData.credentialId || '',
        url: initialData.url || '',
        certType: initialData.certType || (initialData.isLicense ? 'License' : 'Certification'),
        isLicense: Boolean(initialData.isLicense),
    });

    const addCertification = () => {
        const newCertification = createNewCertification();
        setCertifications(prev => [...prev, newCertification]);
        triggerToast('New credential card added');
    };

    const removeCertification = (id) => {
        setCertifications(prev => prev.filter(cert => cert.id !== id));
        triggerToast('Credential removed', 'info');
    };

    const moveCertification = (id, direction) => {
        setCertifications(current => moveResumeItem(current, id, direction));
    };

    const duplicateCertification = (id) => {
        setCertifications(current => {
            const source = current.find(cert => cert.id === id);
            return duplicateResumeItem(current, id, {
                title: `${source?.title || source?.name || 'Certification'} (Copy)`,
            });
        });
        triggerToast('Credential duplicated');
    };

    const updateCertification = (id, field, value) => {
        setCertifications(prev => prev.map(cert => (cert.id === id ? { ...cert, [field]: value } : cert)));
    };

    // Auto-save on change (500ms debounce)
    useEffect(() => {
        const timer = setTimeout(() => {
            const validCertifications = certifications.filter(cert => (cert.title || cert.name || '').trim() !== '');

            const completedSteps = [...(resumeData.completedSteps || [])];
            let updatedCompletedSteps = null;
            if (validCertifications.length > 0 && !completedSteps.includes(6)) {
                updatedCompletedSteps = [...completedSteps, 6];
            } else if (validCertifications.length === 0 && completedSteps.includes(6)) {
                updatedCompletedSteps = completedSteps.filter(step => step !== 6);
            }

            updateResumeData({
                certifications,
                ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [certifications]); // eslint-disable-line react-hooks/exhaustive-deps

    // Unmount flush: synchronously commit state on step exit
    const certsRef = useRef(certifications);
    const updateResumeDataRef = useRef(updateResumeData);
    const completedStepsRef = useRef(resumeData?.completedSteps || []);
    useEffect(() => { certsRef.current = certifications; }, [certifications]);
    useEffect(() => { updateResumeDataRef.current = updateResumeData; }, [updateResumeData]);
    useEffect(() => { completedStepsRef.current = resumeData?.completedSteps || []; }, [resumeData?.completedSteps]);
    useEffect(() => () => {
        const certs = certsRef.current;
        const valid = certs.filter(cert => (cert.title || cert.name || '').trim() !== '');
        const completedSteps = [...(completedStepsRef.current || [])];
        let updatedCompletedSteps = null;
        if (valid.length > 0 && !completedSteps.includes(6)) {
            updatedCompletedSteps = [...completedSteps, 6];
        } else if (valid.length === 0 && completedSteps.includes(6)) {
            updatedCompletedSteps = completedSteps.filter(step => step !== 6);
        }
        updateResumeDataRef.current({
            certifications: certs,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    }, []);

    // ——— AI: exploration suggestions, explicitly not claims ———
    const aiReadiness = canRunAssistOperation('generate-certifications', { resumeData });

    const runCertIdeas = () => {
        ai.run({
            operation: 'generate-certifications',
            resumeData,
            targetJd: resumeData.targetJobDescription || '',
        });
    };

    const isCertAlreadyAdded = (title) => {
        if (!title) return false;
        const normalized = String(title).trim().toLowerCase();
        return certifications.some(c => String(c.title || c.name || '').trim().toLowerCase() === normalized);
    };

    const handleCertAccept = (selected) => {
        const additions = selected
            .map(s => ({ title: s.meta?.title || s.text.split(' — ')[0], issuer: s.meta?.issuer || '' }))
            .filter(c => c.title && !isCertAlreadyAdded(c.title));
        if (additions.length) {
            setCertifications(prev => [
                ...prev,
                ...additions.map(c => createNewCertification({
                    title: c.title,
                    issuer: c.issuer,
                    date: '', // the candidate must enter the real year
                })),
            ]);
            triggerToast(`Added ${additions.length} credential(s) to explore!`);
        }
        ai.reset();
    };

    /**
     * AI Recommendations Popup Handler (Identical to DashboardSettings subtab=certifications)
     * Queries the AI generator or uses curated domain archetypes, opens AiRecommendationModal
     * with categorized items and check/uncheck selection before applying.
     */
    const handleRecommendAiCertifications = async () => {
        const effectiveRole = String(
            candidateContext?.target?.role ||
            resumeData.targetRole ||
            resumeData.occupation ||
            resumeData.workExperience?.[0]?.jobTitle ||
            resumeData.employments?.[0]?.jobTitle ||
            ''
        ).trim();

        setIsAiGenerating(true);
        try {
            const existingTitles = new Set(certifications.map(c => String(c.title || c.name || '').trim().toLowerCase()));
            let curatedList = GET_CURATED_CERTIFICATION_IDEAS(effectiveRole, resumeData, candidateContext);

            try {
                const expDetails = (resumeData.workExperience || resumeData.employments || [])
                    .map(w => `${w.jobTitle || 'Role'} at ${w.company || w.employer || ''}`)
                    .filter(Boolean)
                    .join('; ');
                const eduDetails = (resumeData.education || resumeData.educations || [])
                    .map(e => `${e.degree || ''} from ${e.school || e.institution || ''}`)
                    .filter(Boolean)
                    .join('; ');
                const skillsDetails = (resumeData.skills || [])
                    .map(s => (typeof s === 'string' ? s : s?.name || s?.skillName))
                    .filter(Boolean)
                    .join(', ');

                const data = await generateUserAiContent('generate-certifications', {
                    targetRole: effectiveRole,
                    jobTitle: effectiveRole,
                    occupation: effectiveRole,
                    workHistory: expDetails,
                    education: eduDetails,
                    skills: skillsDetails,
                    existingCertifications: Array.from(existingTitles),
                    language: resumeData.language || 'en',
                    targetJobDescription: resumeData.targetJobDescription || '',
                });

                const candidateCerts = Array.isArray(data?.certifications)
                    ? data.certifications
                    : (Array.isArray(data?.data?.certifications)
                        ? data.data.certifications
                        : (Array.isArray(data?.certs)
                            ? data.certs
                            : (Array.isArray(data?.suggestions)
                                ? data.suggestions
                                : (Array.isArray(data) ? data : null))));

                if (candidateCerts && candidateCerts.length > 0) {
                    curatedList = candidateCerts.map((c, idx) => ({
                        name: typeof c === 'string' ? c : c?.title || c?.name,
                        issuer: typeof c === 'object' ? (c?.issuer || 'Accredited Organization') : 'Accredited Organization',
                        category: (typeof c === 'object' && c?.category && ['mandatory', 'recommended'].includes(c.category)) ? c.category : (idx < 3 ? 'mandatory' : 'recommended'),
                        certType: typeof c === 'object' ? (c?.certType || (c?.isLicense ? 'License' : 'Certification')) : 'Certification',
                        isLicense: typeof c === 'object' ? Boolean(c?.isLicense) : false,
                    })).filter(c => Boolean(c.name));
                }
            } catch {
                // Seamlessly fall back to profile-matched curated list
            }

            const unadded = curatedList.filter(item => !existingTitles.has(String(item.name || item.title || '').trim().toLowerCase()));

            if (!unadded.length) {
                triggerToast('All recommended credentials for this role are already in your resume!', 'info');
                return;
            }

            const itemsToReview = unadded.map((c, idx) => ({
                title: c.name || c.title,
                name: c.name || c.title,
                issuer: c.issuer || 'Accredited Organization',
                category: c.category || (idx < 3 ? 'mandatory' : 'recommended'),
                certType: c.certType || (c.isLicense ? 'License' : 'Certification'),
                isLicense: Boolean(c.isLicense),
            }));

            setAiModalState({
                isOpen: true,
                title: `Review Industry Certifications for ${effectiveRole || 'Your Target Role'}`,
                type: 'certifications',
                items: itemsToReview,
                onApply: (approvedItems) => {
                    const toAdd = approvedItems.map(item => createNewCertification({
                        title: item.title || item.name,
                        issuer: item.issuer || 'Accredited Organization',
                        date: '', // blank by default — never fabricate year
                        certType: item.certType || (item.isLicense ? 'License' : 'Certification'),
                        isLicense: Boolean(item.isLicense),
                    }));

                    setCertifications(prev => [...prev, ...toAdd]);
                    triggerToast(`Added ${toAdd.length} credential(s) to your resume! Check them out below.`);
                }
            });
        } catch {
            triggerToast('Unable to generate certification recommendations. Please try again.', 'error');
        } finally {
            setIsAiGenerating(false);
        }
    };

    const hasCertifications = certifications.some(c => String(c?.title || c?.name || '').trim() !== '');

    // Filtered Credentials by search query and classification type
    const filteredCertifications = useMemo(() => {
        let list = certifications;
        if (selectedTypeFilter !== 'all') {
            list = list.filter(c => (c.certType || (c.isLicense ? 'License' : 'Certification')) === selectedTypeFilter);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(c => {
                const title = String(c.title || c.name || '').toLowerCase();
                const issuer = String(c.issuer || '').toLowerCase();
                const date = String(c.date || '').toLowerCase();
                const id = String(c.credentialId || '').toLowerCase();
                const type = String(c.certType || '').toLowerCase();
                return title.includes(q) || issuer.includes(q) || date.includes(q) || id.includes(q) || type.includes(q);
            });
        }
        return list;
    }, [certifications, selectedTypeFilter, searchQuery]);

    const renderGuideContent = () => (
        <div className="space-y-4">
            <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 space-y-2.5">
                <h3 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <MdAutoAwesome className="w-4 h-4 text-indigo-600" />
                    <span>Certifications &amp; Licenses Best Practices</span>
                </h3>
                <ul className="space-y-2 text-[11px] text-slate-600">
                    <li className="flex items-start gap-1.5">
                        <span className="text-indigo-600 font-bold">•</span>
                        <span><strong>Accurate Official Titles:</strong> Use the exact credential designation issued by the accredited institution (e.g. <em>PMP®</em>, <em>AWS Certified Solutions Architect</em>, <em>Registered Nurse (RN)</em>).</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                        <span className="text-indigo-600 font-bold">•</span>
                        <span><strong>Accredited Issuing Bodies:</strong> Specify recognized authorities (e.g. <em>Project Management Institute</em>, <em>Cisco</em>, <em>State Board of Nursing</em>).</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                        <span className="text-indigo-600 font-bold">•</span>
                        <span><strong>Licensing vs Certification:</strong> Tag state or national legal operating permits as <em>License</em>, and competency assessments as <em>Certification</em>.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                        <span className="text-indigo-600 font-bold">•</span>
                        <span><strong>License Numbers &amp; Verification:</strong> Include Credential IDs or public verification URLs for instant employer ATS verification.</span>
                    </li>
                </ul>
            </div>
        </div>
    );

    return (
        <StepShell
            stepNumber={6}
            stepPath="certifications"
            title={t('CertificationsStep.title', 'Certifications & credentials')}
            subtitle={t('CertificationsStep.subtitle', 'Credentials you hold — listed exactly as shown on the certificate, license, or registration.')}
            isComplete={hasCertifications}
            statusBadge={certifications.length > 0 ? `${certifications.length} ${certifications.length === 1 ? 'credential' : 'credentials'}` : ''}
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

            {/* AI Recommendations Review Popup Modal (Identical to Dashboard Settings subtab=certifications) */}
            <AiRecommendationModal
                isOpen={aiModalState.isOpen}
                onClose={() => setAiModalState(prev => ({ ...prev, isOpen: false }))}
                title={aiModalState.title}
                type={aiModalState.type}
                items={aiModalState.items}
                onApply={aiModalState.onApply}
            />

            {certifications.length === 0 ? (
                <div className="space-y-4">
                    <EmptyState
                        title="Add a credential you hold"
                        description="Certifications, licenses, registrations, or completed training — enter them exactly as the issuing organization printed them."
                        primaryAction={{
                            label: 'Add a credential',
                            icon: <MdAdd className="w-4 h-4" />,
                            onClick: addCertification,
                        }}
                        secondaryAction={{
                            label: isAiGenerating ? 'Generating Suggestions...' : '🪄 Auto-Recommend Certifications (AI)',
                            icon: <MdAutoAwesome className="w-4 h-4 text-indigo-500" />,
                            onClick: handleRecommendAiCertifications,
                            disabled: isAiGenerating,
                        }}
                    />

                    <div id="ai-credentials-prompt-card">
                        <AiPromptCard
                            title="Credentials worth knowing for this role"
                            buttonLabel="Suggest credentials to explore"
                            evidenceHint="Career-exploration ideas based on your profile. Only add a credential to your resume if you actually hold it."
                            status={ai.status}
                            result={ai.result}
                            error={ai.error?.message}
                            disabled={!aiReadiness.ok}
                            disabledReason={aiReadiness.reason}
                            onRun={runCertIdeas}
                            onAccept={handleCertAccept}
                            onDismiss={() => ai.reset()}
                        />
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Modern Command Toolbar */}
                    <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-2.5">
                            <span className="text-sm font-extrabold text-slate-800 tracking-tight">
                                Professional Credentials
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold">
                                {certifications.length} {certifications.length === 1 ? 'Credential' : 'Credentials'}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={handleRecommendAiCertifications}
                                disabled={isAiGenerating}
                                className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all hover:shadow-md disabled:opacity-50 cursor-pointer"
                                title="Open AI Recommendations Popup for your target role"
                            >
                                <MdAutoAwesome className="w-4 h-4" />
                                <span>{isAiGenerating ? 'Analyzing...' : '🪄 Auto-Recommend (AI)'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={addCertification}
                                className="h-9 px-3.5 rounded-xl bg-white hover:bg-indigo-50/50 border border-slate-300 hover:border-indigo-300 text-slate-800 hover:text-indigo-700 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                            >
                                <MdAdd className="w-4 h-4 text-indigo-600" />
                                <span>Add Credential</span>
                            </button>
                        </div>
                    </div>

                    {/* Toolbar Row 2: Search and Type Filter Tabs (when > 1 credential) */}
                    {certifications.length > 1 && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                            {/* Live Search */}
                            <div className="relative flex-1 max-w-sm">
                                <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search credentials, issuers, or IDs..."
                                    className="w-full h-9 pl-9 pr-8 text-xs bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
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
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                        selectedTypeFilter === 'all'
                                            ? 'bg-slate-800 text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    All ({certifications.length})
                                </button>
                                {CERT_TYPES.map(t => {
                                    const count = certifications.filter(c => (c.certType || (c.isLicense ? 'License' : 'Certification')) === t.id).length;
                                    if (count === 0 && selectedTypeFilter !== t.id) return null;
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setSelectedTypeFilter(t.id)}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
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

                    {/* Elevated Credential Cards View */}
                    <div className="space-y-4">
                        {filteredCertifications.map((certification) => {
                            const originalIndex = certifications.findIndex(c => c.id === certification.id);
                            const activeType = certification.certType || (certification.isLicense ? 'License' : 'Certification');
                            const typeConfig = CERT_TYPES.find(t => t.id === activeType) || CERT_TYPES[0];
                            const TypeIcon = typeConfig.icon;
                            const certTitle = certification.title || certification.name || '';

                            const subtitleParts = [
                                certification.issuer,
                                certification.date ? `Earned ${certification.date}` : '',
                                certification.credentialId ? `ID: ${certification.credentialId}` : '',
                            ].filter(Boolean);

                            const subtitle = subtitleParts.length > 0
                                ? subtitleParts.join(' • ')
                                : 'Add issuer, dates, and credential details';

                            return (
                                <div
                                    key={certification.id}
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
                                                    {certTitle || 'Untitled Credential'}
                                                </h4>
                                                <p className="text-[11px] text-slate-500 truncate">
                                                    {subtitle}
                                                </p>
                                            </div>
                                            <span className={`ml-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 flex items-center gap-1 ${typeConfig.badgeClass}`}>
                                                <TypeIcon className="w-3 h-3" />
                                                <span>{typeConfig.label}</span>
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                disabled={originalIndex === 0}
                                                onClick={() => moveCertification(certification.id, -1)}
                                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
                                                title="Move credential up"
                                            >
                                                ▲
                                            </button>
                                            <button
                                                type="button"
                                                disabled={originalIndex === certifications.length - 1}
                                                onClick={() => moveCertification(certification.id, 1)}
                                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
                                                title="Move credential down"
                                            >
                                                ▼
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => duplicateCertification(certification.id)}
                                                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                                title="Duplicate credential"
                                            >
                                                <MdContentCopy className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeCertification(certification.id)}
                                                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer ml-0.5"
                                                title="Delete credential"
                                            >
                                                <MdDeleteOutline className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Card Body */}
                                    <div className="space-y-4 pt-1">
                                        {/* Row 1: Credential Type Selector Pills */}
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                                                Credential Classification
                                            </label>
                                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                                {CERT_TYPES.map(type => {
                                                    const Icon = type.icon;
                                                    const isSelected = activeType === type.id;
                                                    return (
                                                        <button
                                                            key={type.id}
                                                            type="button"
                                                            onClick={() => {
                                                                updateCertification(certification.id, 'certType', type.id);
                                                                updateCertification(certification.id, 'isLicense', type.id === 'License');
                                                            }}
                                                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
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

                                        {/* Row 2: Credential Name & Issuing Organization */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                            <AutocompleteInputField
                                                label={t('CertificationsStep.fields.title.label', 'Credential name')}
                                                name={`certification-title-${certification.id}`}
                                                placeholder={getDynamicPlaceholder('certifications', 'title', candidateContext) || 'e.g. AWS Solutions Architect, PMP, RN License'}
                                                value={certTitle}
                                                onChange={(e) => updateCertification(certification.id, 'title', e.target.value)}
                                                required
                                                suggestionType="certification"
                                                context={candidateContext}
                                            />
                                            <AutocompleteInputField
                                                label={t('CertificationsStep.fields.issuer.label', 'Issuing organization')}
                                                name={`certification-issuer-${certification.id}`}
                                                placeholder={getDynamicPlaceholder('certifications', 'issuer', candidateContext) || 'e.g. Amazon Web Services, PMI, State Board'}
                                                value={certification.issuer || ''}
                                                onChange={(e) => updateCertification(certification.id, 'issuer', e.target.value)}
                                                suggestionType="issuer"
                                                context={candidateContext}
                                            />
                                        </div>

                                        {/* Row 3: Date Earned & Expiration Date */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                            <Field
                                                label={t('CertificationsStep.fields.date.label', 'Date earned')}
                                                name={`certification-date-${certification.id}`}
                                                placeholder="e.g. 2024 or Nov 2023"
                                                value={certification.date || ''}
                                                onChange={(e) => updateCertification(certification.id, 'date', e.target.value)}
                                            />
                                            <Field
                                                label="Expiration / Renewal Date"
                                                name={`certification-end-date-${certification.id}`}
                                                placeholder="e.g. 2027 or Ongoing / No Expiry"
                                                value={certification.endDate || ''}
                                                onChange={(e) => updateCertification(certification.id, 'endDate', e.target.value)}
                                                optional
                                            />
                                        </div>

                                        {/* Row 4: Credential ID & Verification URL */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                            <Field
                                                label="Credential ID / License #"
                                                name={`certification-id-${certification.id}`}
                                                placeholder="e.g. AWS-12345, RN-987654"
                                                value={certification.credentialId || ''}
                                                onChange={(e) => updateCertification(certification.id, 'credentialId', e.target.value)}
                                                optional
                                            />
                                            <div>
                                                <Field
                                                    label="Verification URL"
                                                    name={`certification-url-${certification.id}`}
                                                    type="url"
                                                    placeholder="https://www.credly.com/badges/..."
                                                    value={certification.url || ''}
                                                    onChange={(e) => updateCertification(certification.id, 'url', e.target.value)}
                                                    optional
                                                />
                                                {certification.url && /^https?:\/\//i.test(String(certification.url)) && (
                                                    <div className="mt-1.5 flex items-center justify-end">
                                                        <a
                                                            href={certification.url}
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
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Add Another Credential Secondary Button */}
                    <button
                        type="button"
                        onClick={addCertification}
                        className="w-full h-11 rounded-2xl border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-sm font-bold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-all shadow-2xs cursor-pointer"
                    >
                        <MdAdd className="w-4 h-4 text-indigo-600" />
                        <span>Add Another Credential</span>
                    </button>

                    {/* AI Exploration Card */}
                    <div id="ai-credentials-prompt-card">
                        <AiPromptCard
                            title="Credentials worth knowing for this role"
                            buttonLabel="Suggest credentials to explore"
                            evidenceHint="Career-exploration ideas based on your profile. Only add a credential to your resume if you actually hold it."
                            status={ai.status}
                            result={ai.result}
                            error={ai.error?.message}
                            disabled={!aiReadiness.ok}
                            disabledReason={aiReadiness.reason}
                            onRun={runCertIdeas}
                            onAccept={handleCertAccept}
                            onDismiss={() => ai.reset()}
                        />
                    </div>
                </div>
            )}
        </StepShell>
    );
};

export default CertificationsStep;
