import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    MdAdd,
    MdSearch,
    MdClose,
    MdAutoAwesome,
    MdCheckCircle,
    MdContentCopy,
    MdDeleteOutline,
    MdOutlineSearch
} from 'react-icons/md';
import {
    FaTrophy,
    FaMedal,
    FaRocket,
    FaGraduationCap,
    FaStar,
    FaSearch
} from 'react-icons/fa';
import StepShell from '../components/StepShell.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Field from '../components/Field.jsx';
import { AiRecommendationModal } from '../../Form/AiRecommendationModal.jsx';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';
import { generateUserAiContent } from '../../../services/aiService';

export const ACHIEVEMENT_TYPES = [
    { id: 'Award', label: 'Award', icon: FaTrophy, badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
    { id: 'Honor', label: 'Honor', icon: FaMedal, badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { id: 'Competition', label: 'Hackathon / Contest', icon: FaRocket, badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
    { id: 'Academic', label: 'Academic Distinction', icon: FaGraduationCap, badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { id: 'Milestone', label: 'Key Milestone', icon: FaStar, badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
];

export const SUGGESTION_CHIPS = [
    { label: '🏆 1st Place / Winner', text: 'Awarded 1st place out of 100+ competitors for engineering innovation and technical execution.' },
    { label: '🌟 Top 5% Performer', text: 'Recognized in top 5% of global team for outstanding quarterly performance and customer satisfaction.' },
    { label: '💡 Innovation & Patent', text: 'Honored with company-wide Innovation Award for conceiving and deploying automated workflow.' },
    { label: '🎓 Dean\'s Honor Roll', text: 'Maintained top academic standing on Dean’s Honor List across consecutive semesters.' }
];

/**
 * Curated Archetype Achievement Recommendations by Role Domain
 * Guarantees instantaneous, domain-relevant recommendations even offline.
 */
export const GET_CURATED_ACHIEVEMENT_IDEAS = (role = '', resumeData = {}, candidateContext = {}) => {
    const target = String(role || candidateContext?.target?.role || resumeData?.targetRole || resumeData?.occupation || '').toLowerCase();
    const workTitles = (resumeData?.employments || resumeData?.workExperience || resumeData?.workExperiences || []).map(e => String(e?.jobTitle || '').toLowerCase()).join(' ');
    const skills = (resumeData?.skills || []).map(s => String(typeof s === 'object' ? (s?.skillName || s?.name) : s).toLowerCase()).join(' ');
    const combinedSignals = `${target} ${workTitles} ${skills}`;

    // 1. Healthcare, Medical, Clinical, Nursing
    if (/\b(?:doctor|physician|surgeon|cardiologist|pediatrician|resident|medical officer|clinician|nurse|rn|lpn|charge nurse|dentist|hospital|clinic|patient care)\b/.test(combinedSignals)) {
        return [
            { name: 'The DAISY Award for Extraordinary Nurses / Clinicians', awarder: 'The DAISY Foundation / Healthcare System', category: 'mandatory', achievementType: 'Award', description: 'Honored for exceptional clinical skill, compassionate patient care, and leadership under pressure.' },
            { name: 'Chief Resident Distinction & Leadership Honor', awarder: 'Department of Medicine / Hospital Board', category: 'mandatory', achievementType: 'Honor', description: 'Selected by department chairs to lead clinical rotations and oversee junior resident mentoring.' },
            { name: 'Clinical Excellence & Patient Safety Commendation', awarder: 'Hospital Quality & Safety Committee', category: 'recommended', achievementType: 'Award', description: 'Recognized for achieving zero protocol violations and highest patient satisfaction ratings.' },
            { name: 'Outstanding Medical Research Presentation', awarder: 'Medical Association Annual Conference', category: 'recommended', achievementType: 'Academic', description: 'Presented peer-reviewed clinical research findings selected as top presentation in specialty.' },
            { name: 'Hospital Healthcare Hero / Service Milestone', awarder: 'Regional Health Network', category: 'recommended', achievementType: 'Milestone', description: 'Awarded for extraordinary dedication during critical unit capacity and emergency response.' }
        ];
    }

    // 2. Legal, Compliance, Regulatory
    if (/\b(?:lawyer|attorney|counsel|solicitor|barrister|paralegal|litigation|judge|compliance officer|legal)\b/.test(combinedSignals)) {
        return [
            { name: 'Outstanding Pro Bono Service Award', awarder: 'State Bar Association', category: 'mandatory', achievementType: 'Award', description: 'Honored for contributing 100+ hours of dedicated pro bono legal representation to underserved communities.' },
            { name: 'Excellence in Legal Briefing & Trial Preparation', awarder: 'Corporate Legal Department / Law Firm', category: 'mandatory', achievementType: 'Honor', description: 'Recognized for crafting persuasive appellate briefs leading to successful summary judgment.' },
            { name: 'National Moot Court Competition Finalist', awarder: 'National Law School Association', category: 'recommended', achievementType: 'Competition', description: 'Selected as top finalist among 64 competing teams for oral advocacy and legal argumentation.' },
            { name: 'Compliance & Governance Leadership Commendation', awarder: 'Ethics & Compliance Board', category: 'recommended', achievementType: 'Milestone', description: 'Led successful enterprise compliance audit with 100% adherence to regulatory standards.' }
        ];
    }

    // 3. Finance, Banking, Accounting, Audit
    if (/\b(?:accountant|auditor|chartered accountant|cpa|finance|financial analyst|controller|bookkeeper|tax|banking|investment|equity)\b/.test(combinedSignals)) {
        return [
            { name: 'Financial Excellence & Cost Optimization Honor', awarder: 'Chief Financial Officer / Executive Committee', category: 'mandatory', achievementType: 'Award', description: 'Identified $1.8M in operational cost savings through automated financial variance modeling.' },
            { name: 'Audit Leadership & Quality Commendation', awarder: 'Internal Audit Oversight Committee', category: 'mandatory', achievementType: 'Honor', description: 'Delivered comprehensive SOX compliance audit with zero audit findings across 4 regional branches.' },
            { name: 'Corporate Deal of the Year Recognition', awarder: 'Investment Banking Group', category: 'recommended', achievementType: 'Milestone', description: 'Played pivotal quantitative modeling role in executing $45M cross-border M&A transaction.' },
            { name: 'CFA Institute University Research Challenge Winner', awarder: 'CFA Institute Regional Society', category: 'recommended', achievementType: 'Academic', description: 'Awarded 1st place for equity research valuation and investment recommendation thesis.' }
        ];
    }

    // 4. Sales, Business Development, Account Management
    if (/\b(?:sales|account executive|business development|bdr|sdr|account manager|territory manager|quota)\b/.test(combinedSignals)) {
        return [
            { name: "President's Club / Circle of Excellence", awarder: 'Executive Leadership / Corporate Sales', category: 'mandatory', achievementType: 'Award', description: 'Attained 142% of annual sales quota; ranked in top 3% of global sales representatives.' },
            { name: 'Top Sales Revenue Producer of the Year', awarder: 'Commercial Sales Division', category: 'mandatory', achievementType: 'Award', description: 'Generated $3.2M in Net New ARR; closed largest enterprise software contract in company history.' },
            { name: 'Quarterly Sales MVP & Pipeline Accelerator', awarder: 'Sales Leadership Council', category: 'recommended', achievementType: 'Honor', description: 'Achieved fastest deal velocity from qualification to closed-won status across Q3.' },
            { name: 'Enterprise Client Retention Milestone', awarder: 'Customer Success & Account Team', category: 'recommended', achievementType: 'Milestone', description: 'Maintained 98% gross revenue retention across 25 strategic enterprise accounts.' }
        ];
    }

    // 5. Marketing, Brand, Growth, Creative
    if (/\b(?:marketing|brand|growth|seo|content writer|copywriter|social media|digital marketing|campaign)\b/.test(combinedSignals)) {
        return [
            { name: 'Campaign of the Year / Brand Excellence Award', awarder: 'Industry Marketing Association', category: 'mandatory', achievementType: 'Award', description: 'Conceived omnichannel product launch generating 250K impressions and 34% increase in inbound leads.' },
            { name: 'Growth Acceleration Milestone (10x Traffic)', awarder: 'Growth Marketing Leadership', category: 'mandatory', achievementType: 'Milestone', description: 'Scaled monthly organic search traffic from 50K to 500K unique visitors in 12 months.' },
            { name: 'Best B2B Content Marketing Initiative', awarder: 'Digital Marketing Summit', category: 'recommended', achievementType: 'Honor', description: 'Author of flagship industry benchmark report downloaded by 15,000+ enterprise decision makers.' },
            { name: 'Creative Design & Visual Showcase Winner', awarder: 'Regional Design Council', category: 'recommended', achievementType: 'Competition', description: 'Awarded gold distinction for comprehensive brand redesign and interactive digital experience.' }
        ];
    }

    // 6. Technology, Software, Web, Mobile, Cloud, DevOps, AI
    if (/\b(?:software|developer|frontend|backend|full stack|web|devops|cloud|mobile|ios|android|qa|sre|ai|machine learning|data)\b/.test(combinedSignals)) {
        return [
            { name: '1st Place Winner — Global AI Hackathon', awarder: 'Tech Community / Google Cloud / AWS', category: 'mandatory', achievementType: 'Competition', description: 'Built an autonomous multi-agent pipeline in 48 hours, winning 1st place out of 120 global teams.' },
            { name: 'Spot Award / Engineering Excellence Distinction', awarder: 'VP of Engineering / Corporate Leadership', category: 'mandatory', achievementType: 'Award', description: 'Honored for leading zero-downtime database migration of 40M records with 99.99% availability.' },
            { name: 'Patent Granted / Invention Disclosure Recognition', awarder: 'US Patent & Trademark Office / Enterprise IP Team', category: 'recommended', achievementType: 'Honor', description: 'Co-inventor on distributed real-time data synchronization system patent.' },
            { name: 'Open Source Community Contributor Distinction', awarder: 'Open Source Foundation / GitHub Organization', category: 'recommended', achievementType: 'Milestone', description: 'Authored core performance optimization PR merged into leading open-source framework with 20K+ stars.' },
            { name: 'Employee of the Quarter / System Resilience Honor', awarder: 'Engineering Leadership Council', category: 'recommended', achievementType: 'Award', description: 'Architected disaster recovery failover reducing mean-time-to-recovery (MTTR) from 45m to 2m.' }
        ];
    }

    // 7. Universal Professional Fallback
    return [
        { name: 'Employee of the Year / Annual Performance Award', awarder: 'Corporate Leadership / Board of Directors', category: 'mandatory', achievementType: 'Award', description: 'Awarded highest organizational accolade for outstanding dedication, cross-functional impact, and team leadership.' },
        { name: 'Dean’s Honor List / Academic Summa Cum Laude', awarder: 'University Academic Senate', category: 'mandatory', achievementType: 'Academic', description: 'Maintained top 2% academic standing across all semesters with cumulative 3.9+ GPA.' },
        { name: 'Process Efficiency & Operational Excellence Milestone', awarder: 'Operations Leadership Committee', category: 'recommended', achievementType: 'Milestone', description: 'Redesigned core business workflow, reducing delivery turnaround time by 35% across department.' },
        { name: 'Leadership & Mentorship Commendation', awarder: 'People & Culture Committee', category: 'recommended', achievementType: 'Honor', description: 'Recognized for successfully onboarding and mentoring 12 junior team members with 100% retention.' }
    ];
};

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

    // Search and Category Filter States
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');

    // AI Modal and Feedback States
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const [isPolishingId, setIsPolishingId] = useState(null);
    const [toastState, setToastState] = useState(null);
    const [aiModalState, setAiModalState] = useState({
        isOpen: false,
        title: '',
        type: 'achievements',
        items: [],
        onApply: () => {},
    });

    const signals = useMemo(() => findAchievementSignals(resumeData), [resumeData]);

    useEffect(() => {
        if (resumeData.achievements && Array.isArray(resumeData.achievements)) {
            setAchievements(resumeData.achievements);
        }
    }, [resumeData.achievements]);

    const triggerToast = (message, type = 'success') => {
        setToastState({ message, type });
        setTimeout(() => setToastState(null), 3500);
    };

    const createNewAchievement = (prefill = null) => {
        const item = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            title: '',
            description: '',
            awarder: '',
            issuer: '',
            date: '',
            achievementType: 'Award',
        };
        if (prefill) {
            item.title = prefill.title || prefill.name || '';
            item.description = prefill.description || prefill.text || '';
            item.awarder = prefill.awarder || prefill.issuer || prefill.source || '';
            item.issuer = prefill.issuer || prefill.awarder || prefill.source || '';
            item.date = prefill.date || '';
            item.achievementType = prefill.achievementType || 'Award';
        }
        return item;
    };

    const addAchievement = (prefill = null) => {
        const next = createNewAchievement(prefill);
        setAchievements(prev => [...prev, next]);
        triggerToast('New honor/award entry added!');
    };

    const removeAchievement = (id) => {
        setAchievements(prev => prev.filter(item => item.id !== id));
        triggerToast('Achievement removed', 'info');
    };

    const moveAchievement = (id, direction) => {
        setAchievements(current => moveResumeItem(current, id, direction));
    };

    const duplicateAchievement = (id) => {
        setAchievements(current => {
            const source = current.find(item => item.id === id);
            return duplicateResumeItem(current, id, {
                title: `${source?.title || source?.name || 'Achievement'} (Copy)`,
            });
        });
        triggerToast('Achievement duplicated!');
    };

    const updateAchievement = (id, field, value) => {
        setAchievements(prev => prev.map(item => {
            if (item.id !== id) return item;
            const updated = { ...item, [field]: value };
            if (field === 'awarder') {
                updated.issuer = value;
            }
            return updated;
        }));
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

    // Unmount flush: synchronously commit state on step exit
    const achievementsRef = useRef(achievements);
    const updateResumeDataRef = useRef(updateResumeData);
    const completedStepsRef = useRef(resumeData?.completedSteps || []);
    useEffect(() => { achievementsRef.current = achievements; }, [achievements]);
    useEffect(() => { updateResumeDataRef.current = updateResumeData; }, [updateResumeData]);
    useEffect(() => { completedStepsRef.current = resumeData?.completedSteps || []; }, [resumeData?.completedSteps]);
    useEffect(() => () => {
        const achs = achievementsRef.current;
        const valid = achs.filter(item => String(item?.title || item?.name || '').trim() !== '');
        const completedSteps = [...(completedStepsRef.current || [])];
        let updatedCompletedSteps = null;
        if (valid.length > 0 && !completedSteps.includes(9)) {
            updatedCompletedSteps = [...completedSteps, 9];
        } else if (valid.length === 0 && completedSteps.includes(9)) {
            updatedCompletedSteps = completedSteps.filter(step => step !== 9);
        }
        updateResumeDataRef.current({
            achievements: achs,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    }, []);

    const polishAchievementDescription = async (achievement) => {
        if (!achievement) return;
        setIsPolishingId(achievement.id);
        const title = achievement.title || achievement.name || 'Achievement';
        const currentDesc = achievement.description || '';
        const awarder = achievement.awarder || achievement.issuer || '';

        try {
            const prompt = `Enhance this resume achievement into 1-2 impactful, quantified bullet points. Achievement: "${title}". Awarding Organization: "${awarder}". Draft: "${currentDesc}". Use strong action verbs, describe scope or competition size, and format cleanly for ATS screening.`;
            const res = await generateUserAiContent('generate-summary', {
                prompt,
                targetRole: candidateContext?.target?.role || resumeData?.targetRole || 'Professional',
                context: `${title} conferred by ${awarder}`,
                language: resumeData.language || 'en',
            });
            const text = res?.content || res?.summary || res?.data?.content;
            if (text && typeof text === 'string') {
                const cleaned = text.replace(/^["']|["']$/g, '').trim();
                updateAchievement(achievement.id, 'description', cleaned);
                triggerToast('Achievement description polished with AI!');
                return;
            }
        } catch {
            // Heuristic enhancement fallback
        } finally {
            setIsPolishingId(null);
        }

        if (currentDesc) {
            const polished = currentDesc.replace(/^[-•*]\s*/, '').trim();
            const enhanced = polished.endsWith('.') ? polished : `${polished}.`;
            updateAchievement(achievement.id, 'description', enhanced);
            triggerToast('Polished description!');
        } else {
            const fallback = `Recognized for outstanding technical excellence, cross-functional execution, and quantifiable impact in ${title}.`;
            updateAchievement(achievement.id, 'description', fallback);
            triggerToast('Generated starter description!');
        }
    };

    /**
     * AI Recommendations Popup Handler
     * Opens AiRecommendationModal with curated, role-tailored awards & honors.
     */
    const handleRecommendAiAchievements = async () => {
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
            const existingTitles = new Set(achievements.map(a => String(a.title || a.name || '').trim().toLowerCase()));
            let curatedList = GET_CURATED_ACHIEVEMENT_IDEAS(effectiveRole, resumeData, candidateContext);

            try {
                const expDetails = (resumeData.workExperience || resumeData.employments || [])
                    .map(w => `${w.jobTitle || 'Role'} at ${w.company || w.employer || ''}`)
                    .filter(Boolean)
                    .join('; ');
                const data = await generateUserAiContent('generate-achievements', {
                    targetRole: effectiveRole,
                    workHistory: expDetails,
                    language: resumeData.language || 'en',
                    targetJobDescription: resumeData.targetJobDescription || ''
                });

                const candidates = Array.isArray(data?.achievements)
                    ? data.achievements
                    : (Array.isArray(data?.data?.achievements)
                        ? data.data.achievements
                        : (Array.isArray(data?.awards)
                            ? data.awards
                            : (Array.isArray(data?.suggestions) ? data.suggestions : null)));

                if (candidates && candidates.length > 0) {
                    curatedList = candidates.map((c, idx) => ({
                        name: typeof c === 'string' ? c : c?.title || c?.name,
                        awarder: typeof c === 'object' ? (c?.awarder || c?.issuer || 'Recognized Organization') : 'Recognized Organization',
                        category: (typeof c === 'object' && c?.category) ? c.category : (idx < 2 ? 'mandatory' : 'recommended'),
                        achievementType: typeof c === 'object' ? (c?.achievementType || 'Award') : 'Award',
                        description: typeof c === 'object' ? (c?.description || '') : ''
                    })).filter(c => Boolean(c.name));
                }
            } catch {
                // Curated fallback
            }

            const unadded = curatedList.filter(item => !existingTitles.has(String(item.name || item.title || '').trim().toLowerCase()));

            if (!unadded.length) {
                triggerToast('All recommended honors for this role are already in your resume!', 'info');
                return;
            }

            const itemsToReview = unadded.map((a, idx) => ({
                title: a.name || a.title,
                name: a.name || a.title,
                issuer: a.awarder || a.issuer || 'Awarding Organization',
                awarder: a.awarder || a.issuer || 'Awarding Organization',
                category: a.category || (idx < 2 ? 'mandatory' : 'recommended'),
                achievementType: a.achievementType || 'Award',
                description: a.description || ''
            }));

            setAiModalState({
                isOpen: true,
                title: `Recommended Honors & Awards for ${effectiveRole || 'Your Role'}`,
                type: 'achievements',
                items: itemsToReview,
                onApply: (selectedItems) => {
                    if (selectedItems && selectedItems.length > 0) {
                        const newEntries = selectedItems.map(item => createNewAchievement({
                            title: item.title || item.name,
                            awarder: item.awarder || item.issuer,
                            issuer: item.awarder || item.issuer,
                            achievementType: item.achievementType || 'Award',
                            description: item.description || ''
                        }));
                        setAchievements(prev => [...prev, ...newEntries]);
                        triggerToast(`Added ${selectedItems.length} achievement(s)!`);
                    }
                }
            });
        } catch {
            triggerToast('Could not load suggestions right now.', 'error');
        } finally {
            setIsAiGenerating(false);
        }
    };

    const hasAchievements = achievements.some(a => String(a?.title || a?.name || '').trim() !== '');

    // Filter achievements by live search query and category
    const filteredAchievements = achievements.filter(achievement => {
        const matchesQuery = !searchQuery.trim() ||
            (achievement.title || achievement.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (achievement.awarder || achievement.issuer || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (achievement.description || '').toLowerCase().includes(searchQuery.toLowerCase());

        const activeType = achievement.achievementType || 'Award';
        const matchesType = selectedTypeFilter === 'all' || activeType === selectedTypeFilter;

        return matchesQuery && matchesType;
    });

    return (
        <StepShell
            stepNumber={9}
            stepPath="achievements"
            title={t('AchievementsStep.title', 'Honors, Awards & Key Achievements')}
            subtitle="Record competitive accolades, hackathons, academic distinctions, or notable career milestones."
            isComplete={hasAchievements}
            statusBadge={achievements.length > 0 ? `${achievements.length} ${achievements.length === 1 ? 'Award' : 'Awards'}` : ''}
            resumeData={resumeData}
            targetJd={resumeData.targetJobDescription || ''}
            onNavigate={onNavigate}
        >
            {/* Toast Feedback */}
            {toastState && (
                <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between shadow-2xs animate-fadeIn ${
                    toastState.type === 'error'
                        ? 'bg-rose-50 text-rose-800 border border-rose-200'
                        : toastState.type === 'info'
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}>
                    <div className="flex items-center gap-2">
                        <MdCheckCircle className="w-4 h-4 text-emerald-600" />
                        <span>{toastState.message}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setToastState(null)}
                        className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                        <MdClose className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* AI Recommendations Review Popup Modal */}
            <AiRecommendationModal
                isOpen={aiModalState.isOpen}
                onClose={() => setAiModalState(prev => ({ ...prev, isOpen: false }))}
                title={aiModalState.title}
                type={aiModalState.type}
                items={aiModalState.items}
                onApply={aiModalState.onApply}
            />

            {achievements.length === 0 ? (
                <div className="space-y-4">
                    <EmptyState
                        title={t('AchievementsStep.empty.title', 'Add an achievement, honor, or award')}
                        description="Record competitive accolades, hackathons, academic distinctions, patents, or leadership recognitions that make your resume stand out."
                        primaryAction={{
                            label: 'Add Award / Achievement',
                            icon: <MdAdd className="w-4 h-4" />,
                            onClick: () => addAchievement(),
                        }}
                        secondaryAction={{
                            label: isAiGenerating ? 'Generating Suggestions...' : '🪄 Auto-Recommend Achievements (AI)',
                            icon: <MdAutoAwesome className="w-4 h-4 text-indigo-500" />,
                            onClick: handleRecommendAiAchievements,
                            disabled: isAiGenerating,
                        }}
                    />

                    {signals.length > 0 && (
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <FaSearch className="w-3.5 h-3.5 text-indigo-600" />
                                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Recognition Signals in Your Experience</h3>
                                </div>
                                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                                    {signals.length} found
                                </span>
                            </div>
                            <p className="text-xs text-slate-500">
                                Detected recognition lines from what you already entered in work history or education. Click to feature as standalone awards:
                            </p>
                            <ul className="divide-y divide-indigo-100/60 rounded-xl border border-indigo-100 bg-white shadow-2xs overflow-hidden">
                                {signals.map((signal, index) => (
                                    <li key={index} className="flex items-start justify-between gap-3 px-3.5 py-3 hover:bg-indigo-50/20 transition-colors">
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium leading-relaxed text-slate-800">{signal.text}</p>
                                            <p className="mt-1 text-[11px] text-slate-400 font-medium">from {signal.source}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => addAchievement(signal)}
                                            className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer shadow-2xs"
                                        >
                                            + Add as Award
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Modern Command Toolbar */}
                    <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-2.5">
                            <span className="text-sm font-extrabold text-slate-800 tracking-tight">
                                Honors &amp; Key Achievements
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-200/60">
                                {achievements.length} {achievements.length === 1 ? 'Award' : 'Awards'}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            {signals.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setScanOpen(prev => !prev)}
                                    className={`h-9 px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer ${
                                        scanOpen
                                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                            : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                                    }`}
                                    title="Scan existing work and project descriptions for award signals"
                                >
                                    <FaSearch className="w-3 h-3 text-indigo-600" />
                                    <span>{scanOpen ? 'Hide Scan' : `Scan Experience (${signals.length})`}</span>
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={handleRecommendAiAchievements}
                                disabled={isAiGenerating}
                                className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-indigo-600 to-purple-600 hover:from-amber-600 hover:via-indigo-700 hover:to-purple-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all hover:shadow-md disabled:opacity-50 cursor-pointer"
                                title="Auto-recommend awards & honors for your target role"
                            >
                                <MdAutoAwesome className="w-4 h-4" />
                                <span>{isAiGenerating ? 'Analyzing...' : '🪄 Auto-Recommend (AI)'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => addAchievement()}
                                className="h-9 px-3.5 rounded-xl bg-white hover:bg-indigo-50/50 border border-slate-300 hover:border-indigo-300 text-slate-800 hover:text-indigo-700 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                            >
                                <MdAdd className="w-4 h-4 text-indigo-600" />
                                <span>Add Award / Achievement</span>
                            </button>
                        </div>
                    </div>

                    {/* Toolbar Row 2: Search and Type Filter Tabs (when > 1 achievement) */}
                    {achievements.length > 1 && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                            {/* Live Search */}
                            <div className="relative flex-1 max-w-sm">
                                <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search honors, awards, or organizations..."
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
                                    All ({achievements.length})
                                </button>
                                {ACHIEVEMENT_TYPES.map(t => {
                                    const count = achievements.filter(a => (a.achievementType || 'Award') === t.id).length;
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

                    {/* Scan Results Drawer */}
                    {scanOpen && signals.length > 0 && (
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3 animate-fadeIn">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <FaSearch className="w-3.5 h-3.5 text-indigo-600" />
                                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Recognition Signals in Your Experience</h3>
                                </div>
                                <button type="button" onClick={() => setScanOpen(false)} className="text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer">
                                    ✕ Close
                                </button>
                            </div>
                            <p className="text-xs text-slate-500">
                                Lines detected in your work history or education text that match recognition signals. Click to add:
                            </p>
                            <ul className="divide-y divide-indigo-100/60 rounded-xl border border-indigo-100 bg-white shadow-2xs overflow-hidden">
                                {signals.map((signal, index) => (
                                    <li key={index} className="flex items-start justify-between gap-3 px-3.5 py-3 hover:bg-indigo-50/20 transition-colors">
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium leading-relaxed text-slate-800">{signal.text}</p>
                                            <p className="mt-1 text-[11px] text-slate-400 font-medium">from {signal.source}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => addAchievement(signal)}
                                            className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer shadow-2xs"
                                        >
                                            + Add as Award
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Elevated Honor & Award Cards View */}
                    <div className="space-y-4">
                        {filteredAchievements.map((achievement) => {
                            const originalIndex = achievements.findIndex(a => a.id === achievement.id);
                            const activeType = achievement.achievementType || 'Award';
                            const typeConfig = ACHIEVEMENT_TYPES.find(t => t.id === activeType) || ACHIEVEMENT_TYPES[0];
                            const TypeIcon = typeConfig.icon;
                            const achTitle = achievement.title || achievement.name || '';

                            const subtitleParts = [
                                achievement.awarder || achievement.issuer,
                                achievement.date ? `Received ${achievement.date}` : '',
                            ].filter(Boolean);

                            const subtitle = subtitleParts.length > 0
                                ? subtitleParts.join(' • ')
                                : 'Add awarding organization, dates, and significance';

                            return (
                                <div
                                    key={achievement.id}
                                    className="p-5 bg-white border border-slate-200/90 rounded-2xl space-y-4 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all"
                                >
                                    {/* Card Header */}
                                    <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
                                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                            <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 font-extrabold flex items-center justify-center text-xs shrink-0 border border-amber-200/80">
                                                #{originalIndex + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <h4 className="text-xs font-bold text-slate-900 truncate">
                                                    {achTitle || 'Untitled Honor / Award'}
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
                                                onClick={(e) => { e.stopPropagation(); moveAchievement(achievement.id, -1); }}
                                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
                                                title="Move award up"
                                            >
                                                ▲
                                            </button>
                                            <button
                                                type="button"
                                                disabled={originalIndex === achievements.length - 1}
                                                onClick={(e) => { e.stopPropagation(); moveAchievement(achievement.id, 1); }}
                                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
                                                title="Move award down"
                                            >
                                                ▼
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); duplicateAchievement(achievement.id); }}
                                                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                                title="Duplicate award"
                                            >
                                                <MdContentCopy className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); removeAchievement(achievement.id); }}
                                                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer ml-0.5"
                                                title="Delete award"
                                            >
                                                <MdDeleteOutline className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Card Body */}
                                    <div className="space-y-3.5 pt-1">
                                        {/* Row 1: Achievement Classification Pills */}
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                                                Category / Recognition Type
                                            </label>
                                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                                {ACHIEVEMENT_TYPES.map(type => {
                                                    const Icon = type.icon;
                                                    const isSelected = activeType === type.id;
                                                    return (
                                                        <button
                                                            key={type.id}
                                                            type="button"
                                                            onClick={() => updateAchievement(achievement.id, 'achievementType', type.id)}
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

                                        {/* Row 2: Award Title & Date Received */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="sm:col-span-2">
                                                <Field
                                                    label={t('AchievementsStep.fields.title.label', 'Award or Honor Title')}
                                                    name={`achievement-title-${achievement.id}`}
                                                    placeholder="Award or Honor Title (e.g. Employee of the Year, Hackathon 1st Place)"
                                                    value={achTitle}
                                                    onChange={(e) => updateAchievement(achievement.id, 'title', e.target.value)}
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <Field
                                                    label="Date Received"
                                                    name={`achievement-date-${achievement.id}`}
                                                    placeholder="e.g. Nov 2024"
                                                    value={achievement.date || ''}
                                                    onChange={(e) => updateAchievement(achievement.id, 'date', e.target.value)}
                                                    optional
                                                />
                                            </div>
                                        </div>

                                        {/* Row 3: Awarding Organization / Issuer */}
                                        <div>
                                            <Field
                                                label="Awarding Organization or Issuer"
                                                name={`achievement-awarder-${achievement.id}`}
                                                placeholder="Awarding Organization or Issuer (e.g. IEEE, Google Cloud, University)"
                                                value={achievement.awarder || achievement.issuer || ''}
                                                onChange={(e) => updateAchievement(achievement.id, 'awarder', e.target.value)}
                                                optional
                                            />
                                        </div>

                                        {/* Row 4: Description of Accomplishment & Significance with AI Polish */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <div>
                                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                                                        Brief Description of Accomplishment &amp; Significance
                                                    </label>
                                                    <p className="text-[11px] text-slate-500">
                                                        Explain competition scope (e.g. 1st of 120 teams), measurable outcome, or why this honor was awarded.
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={isPolishingId === achievement.id}
                                                    onClick={() => polishAchievementDescription(achievement)}
                                                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer shrink-0"
                                                    title="Auto-enhance phrasing with impact metrics and action verbs"
                                                >
                                                    <MdAutoAwesome className="w-3.5 h-3.5 text-indigo-600" />
                                                    <span>{isPolishingId === achievement.id ? 'Polishing...' : '🪄 Enhance with AI'}</span>
                                                </button>
                                            </div>

                                            <textarea
                                                value={achievement.description || ''}
                                                onChange={(e) => updateAchievement(achievement.id, 'description', e.target.value)}
                                                placeholder={getDynamicPlaceholder('achievements', 'description', candidateContext) || 'Brief description of the accomplishment and its significance...'}
                                                className="w-full min-h-[74px] text-xs p-3 bg-white border border-slate-300 rounded-xl font-medium text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-y transition-all"
                                            />

                                            {/* Quick Starter Chips */}
                                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick starters:</span>
                                                {SUGGESTION_CHIPS.map((chip, cIdx) => (
                                                    <button
                                                        key={cIdx}
                                                        type="button"
                                                        onClick={() => {
                                                            const current = (achievement.description || '').trim();
                                                            const separator = current ? (current.endsWith('.') ? ' ' : '. ') : '';
                                                            updateAchievement(achievement.id, 'description', `${current}${separator}${chip.text}`);
                                                        }}
                                                        className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200/80 transition-colors cursor-pointer"
                                                    >
                                                        {chip.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Bottom Add Action Button */}
                    <button
                        type="button"
                        onClick={() => addAchievement()}
                        className="w-full h-11 rounded-2xl border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-sm font-bold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-all shadow-2xs cursor-pointer"
                    >
                        <MdAdd className="w-4 h-4 text-indigo-600" />
                        <span>{t('AchievementsStep.actions.addAchievement', 'Add Another Achievement')}</span>
                    </button>
                </div>
            )}
        </StepShell>
    );
};

export default AchievementsStep;
