import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getProfileOfUser, getAccountInfo, saveUserPreferences, changePassword, updateUserEmail, getUserTransactions, deleteUserAccountPermanently, exportUserDataJSON, beginUserTotp2FA, saveUserTotp2FA, disableUserTotp2FA, getUserTotpStatus, reauthenticateUser, recordUserLoginEvent, getUserLoginHistory, sendSmsNotification } from '../../../services/api/platform';
import { saveProfile } from '../../../services/profilePersistence';
import { generateUserAiContent, cleanSkillName } from '../../../services/aiService';
import { FaUser, FaCog, FaCamera, FaTrash, FaUserCircle, FaKey, FaCalendarAlt, FaEnvelope, FaCreditCard, FaUpload, FaCheckCircle, FaExclamationTriangle, FaBriefcase, FaGraduationCap, FaTools, FaGlobe, FaPlus, FaCheck, FaShieldAlt, FaDesktop, FaDownload, FaCertificate, FaProjectDiagram, FaMagic, FaLinkedin, FaGithub, FaLink, FaSyncAlt, FaExternalLinkAlt, FaUnlink, FaLock, FaEye, FaEyeSlash, FaCrown, FaMobileAlt, FaQrcode, FaCopy, FaPrint, FaHistory, FaCrop, FaThLarge, FaTags, FaTimes, FaSearch, FaBolt, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import fire from '../../../conf/fire';
import MonthYearPicker from '../../Form/MonthYearPicker';
import AiRecommendationModal from '../../Form/AiRecommendationModal';
import BulletPointsEditor, { getRolePlaceholder } from '../../Form/BulletPointsEditor';
import AutocompleteInputField from '../../BuildResume/steps/components/AutocompleteInputField';
import ImageCropModal from './ImageCropModal';
import SubscriptionModal from './SubscriptionModal';
import { inferCountryFromCity } from '../../../utils/locationHelper';
import { normalizeProfileData, normalizeProfileImage } from '../../../utils/profileData';
import { calculateYearsOfExperience } from '../../../utils/resumeData';
import { openPrivacyChoicesModal } from '../../PrivacyConsentBanner';

const normalizeProfileForSave = value => {
    const authEmail = fire.auth().currentUser?.email;
    return normalizeProfileData({
        ...value,
        email: (authEmail || value?.email || '').trim().toLowerCase(),
        postalcode: value?.postalCode || '',
        website: value?.websiteUrl || ''
    });
};

const SUBTAB_CONFIG = {
    basic: {
        id: 'basic',
        name: 'Basic & Contact',
        title: 'Personal Details & Contact',
        subtitle: 'Your core identity, headline, and direct contact channels used across all resume templates.',
        statusBadge: 'Core Identity',
        isComplete: (p) => Boolean((p.firstname || p.lastname) && p.occupation && p.phone && (p.city || p.country)),
        computeGaps: (p) => {
            const gaps = [];
            if (!p.firstname && !p.lastname) gaps.push('Add your full name');
            if (!p.occupation) gaps.push('Add target job title / headline');
            if (!p.phone) gaps.push('Add phone number');
            if (!p.city && !p.country) gaps.push('Add location (city or country)');
            return gaps;
        },
        atsTips: [
            'Include target role in your headline / title',
            'Use standard international phone format (+1 / +44 etc.)',
            'Ensure contact email matches your professional profile'
        ]
    },
    experience: {
        id: 'experience',
        name: 'Work History',
        title: 'Work History & Experience',
        subtitle: 'Your career trajectory, key roles, responsibilities, and quantified achievements.',
        statusBadge: (p) => `${p.workExperiences?.length || 0} Roles`,
        getCount: (p) => p.workExperiences?.length || 0,
        isComplete: (p) => Boolean(p.workExperiences?.length > 0),
        computeGaps: (p) => {
            if (!p.workExperiences?.length) return ['Add at least one relevant work position', 'Include job title and company name'];
            const gaps = [];
            if (p.workExperiences.some(w => !w.responsibilities?.length && !w.summary)) {
                gaps.push('Add bullet points or description for all roles');
            }
            return gaps;
        },
        atsTips: [
            'Lead bullet points with active verbs like Spearheaded, Engineered, Directed',
            'Quantify impact with metrics (revenue, % gains, team size)',
            'Keep roles ordered in reverse chronological order'
        ]
    },
    education: {
        id: 'education',
        name: 'Education',
        title: 'Education & Academic History',
        subtitle: 'Degrees, diplomas, educational institutions, graduation years, and honors.',
        statusBadge: (p) => `${p.education?.length || 0} Degrees`,
        getCount: (p) => p.education?.length || 0,
        isComplete: (p) => Boolean(p.education?.length > 0),
        computeGaps: (p) => {
            if (!p.education?.length) return ['Add at least one educational qualification', 'Specify school name and degree'];
            return [];
        },
        atsTips: [
            'Spell out degree names e.g. Bachelor of Science',
            'Include graduation year or expected completion date',
            'Highlight academic honors or GPA if 3.5+'
        ]
    },
    skills: {
        id: 'skills',
        name: 'Skills',
        title: 'Core Competencies & Skills',
        subtitle: 'Hard skills, frameworks, tools, and soft competencies parsed by ATS screening engines.',
        statusBadge: (p) => `${p.skills?.length || 0} Skills`,
        getCount: (p) => p.skills?.length || 0,
        isComplete: (p) => Boolean(p.skills?.length >= 3),
        computeGaps: (p) => {
            if (!p.skills?.length) return ['Add at least 3-5 technical or core skills'];
            if (p.skills.length < 3) return ['Add at least 3 skills for keyword matching'];
            return [];
        },
        atsTips: [
            'Match skill keywords directly to target job descriptions',
            'Include both industry tools and foundational methodologies',
            'Keep skills specific (e.g. React.js rather than just Web)'
        ]
    },
    certifications: {
        id: 'certifications',
        name: 'Certifications',
        title: 'Certifications & Licenses',
        subtitle: 'Industry credentials, verified licenses, and professional certifications.',
        statusBadge: (p) => `${p.certifications?.length || 0} Credentials`,
        getCount: (p) => p.certifications?.length || 0,
        isComplete: (p) => Boolean(p.certifications?.length > 0),
        computeGaps: (p) => {
            if (!p.certifications?.length) return ['Add accredited licenses or certifications (optional)'];
            return [];
        },
        atsTips: [
            'Include the issuing authority (e.g. AWS, Microsoft, PMI)',
            'Specify credential ID or verification link if available',
            'Ensure active certifications have accurate renewal years'
        ]
    },
    projects: {
        id: 'projects',
        name: 'Projects',
        title: 'Key Projects & Portfolio',
        subtitle: 'Standout initiatives, open-source work, client deliveries, and measurable outcomes.',
        statusBadge: (p) => `${p.projects?.length || 0} Projects`,
        getCount: (p) => p.projects?.length || 0,
        isComplete: (p) => Boolean(p.projects?.length > 0),
        computeGaps: (p) => {
            if (!p.projects?.length) return ['Add prominent projects showcasing hands-on experience'];
            return [];
        },
        atsTips: [
            'State the objective, your role, and key technologies used',
            'Link to live deployment or source repository',
            'Demonstrate problem-solving and measurable results'
        ]
    },
    languages: {
        id: 'languages',
        name: 'Languages',
        title: 'Languages & Proficiency',
        subtitle: 'Spoken, written, and working languages with standardized proficiency levels.',
        statusBadge: (p) => `${p.languages?.length || 0} Languages`,
        getCount: (p) => p.languages?.length || 0,
        isComplete: (p) => Boolean(p.languages?.length > 0),
        computeGaps: (p) => {
            if (!p.languages?.length) return ['Specify at least your primary working language'];
            return [];
        },
        atsTips: [
            'Specify proficiency accurately (Native, Fluent, Professional)',
            'List multilingual proficiencies beneficial for global roles'
        ]
    },
    hobbies: {
        id: 'hobbies',
        name: 'Hobbies',
        title: 'Interests & Activities',
        subtitle: 'Extracurricular pursuits, community engagement, and personal interests.',
        statusBadge: (p) => `${(p.hobbies || []).length} Hobbies`,
        getCount: (p) => (p.hobbies || []).length,
        isComplete: (p) => Boolean((p.hobbies || []).length > 0),
        computeGaps: (p) => {
            if (!(p.hobbies || []).length) return ['Add interests that reflect leadership or teamwork'];
            return [];
        },
        atsTips: [
            'Highlight community initiatives or athletic pursuits',
            'Demonstrate well-rounded character and cultural fit'
        ]
    },
    summary: {
        id: 'summary',
        name: 'Executive Bio',
        title: 'Executive Bio & Professional Summary',
        subtitle: 'Your 3-4 sentence elevator pitch positioning your expertise, value, and career level.',
        statusBadge: (p) => p.summary?.trim()?.length > 20 ? 'Active' : 'Missing',
        getCount: (p) => (p.summary?.trim()?.length > 20 ? '✓' : undefined),
        isComplete: (p) => Boolean(p.summary && p.summary.trim().length > 20),
        computeGaps: (p) => {
            if (!p.summary || p.summary.trim().length <= 20) return ['Write a 2-4 sentence summary of your career focus and unique strengths'];
            return [];
        },
        atsTips: [
            'Open with target job title and total years of experience',
            'Highlight top 2-3 core strengths and greatest career win',
            'Avoid generic filler like hardworking or fast learner'
        ]
    },
    achievements: {
        id: 'achievements',
        name: 'Honors & Awards',
        title: 'Honors, Awards & Key Achievements',
        subtitle: 'Competitive awards, hackathons, academic distinctions, and recognitions.',
        statusBadge: (p) => `${(p.achievements || []).length} Awards`,
        getCount: (p) => (p.achievements || []).length,
        isComplete: (p) => Boolean((p.achievements || []).length > 0),
        computeGaps: (p) => {
            if (!(p.achievements || []).length) return ['Add notable awards or competitive distinctions (optional)'];
            return [];
        },
        atsTips: [
            'Include conferring organization and award year',
            'Explain competition scope or percentage selection rate'
        ]
    },
    references: {
        id: 'references',
        name: 'References',
        title: 'Professional References',
        subtitle: 'Endorsements and reference contacts from former managers, mentors, or colleagues.',
        statusBadge: (p) => `${(p.references || []).length} References`,
        getCount: (p) => (p.references || []).length,
        isComplete: (p) => Boolean((p.references || []).length > 0),
        computeGaps: (p) => {
            if (!(p.references || []).length) return ['Add reference contacts or indicate "Available upon request"'];
            return [];
        },
        atsTips: [
            'Confirm referee contact permission in advance',
            'Provide professional title and company association'
        ]
    },
    customSections: {
        id: 'customSections',
        name: 'Custom Modules',
        title: 'Custom Modules & Additional Sections',
        subtitle: 'Tailored sections such as publications, patents, security clearances, or speaking.',
        statusBadge: (p) => `${(p.customSections || []).length} Custom`,
        getCount: (p) => (p.customSections || []).length,
        isComplete: (p) => Boolean((p.customSections || []).length > 0),
        computeGaps: () => [],
        atsTips: [
            'Use standard, widely understood category titles',
            'Format entries consistently with work experience'
        ]
    }
};

function DashboardSettings(_props) {
    const { i18n } = useTranslation('common');
    const location = useLocation();
    const navigate = useNavigate();

    // State management
    const [selectedSettings, setSelectedSettings] = useState('Profile');
    const [profileSubTab, setProfileSubTab] = useState('basic');
    const [showProfileGuidanceRail, setShowProfileGuidanceRail] = useState(true);
    const subTabsRef = useRef(null);

    const scrollSubTabs = (direction) => {
        if (subTabsRef.current) {
            const offset = direction === 'left' ? -220 : 220;
            subTabsRef.current.scrollBy({ left: offset, behavior: 'smooth' });
        }
    };

    useEffect(() => {
        if (subTabsRef.current) {
            const activeBtn = subTabsRef.current.querySelector('.step-nav-btn[aria-current="step"]');
            if (activeBtn) {
                activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [profileSubTab]);

    const SUB_TAB_ORDER = ['basic', 'experience', 'education', 'skills', 'certifications', 'projects', 'languages', 'hobbies', 'summary', 'achievements', 'references', 'customSections'];

    // Reactive URL query parameter listener for ?tab=Account or ?tab=Profile
    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const tabParam = searchParams.get('tab');
        if (tabParam) {
            const lower = tabParam.toLowerCase();
            if (lower.includes('account') || lower.includes('security') || lower === '2fa') {
                setSelectedSettings('Account');
            } else if (lower.includes('profile')) {
                setSelectedSettings('Profile');
            }
        }
    }, [location.search]);
    const [summaryTone, setSummaryTone] = useState('balanced');
    const [_skillFilter] = useState('all');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [profileSaveState, setProfileSaveState] = useState('loading');
    const [profileConflict, setProfileConflict] = useState(null);
    const persistProfileRef = useRef(null);
    const profileRef = useRef(null);
    const profileConflictRef = useRef(null);
    const profileSavingRef = useRef(null);
    const pendingProfileSaveRef = useRef(null);
    const skipNextAutosaveRef = useRef(false);
    const autosaveTimerRef = useRef(null);
    const loadedProfileUidRef = useRef(null);
    const mountedRef = useRef(true);
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const aiRequestControllerRef = useRef(null);
    const [toastState, setToastState] = useState(null);
    const [cropModalSrc, setCropModalSrc] = useState(null); // raw image src waiting to be cropped
    const [aiModalState, setAiModalState] = useState({
        isOpen: false,
        title: '',
        type: 'skills',
        items: [],
        onApply: null
    });

    const [accountSettings, setAccountSettings] = useState({
        email: '',
        password: '',
    });
    const [databaseAccountSettings, setDatabaseAccountSettings] = useState({
        email: '',
        membership: '',
        membershipEnds: '',
    });
    const [accountPasswordState, setAccountPasswordState] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [showPasswordMap, setShowPasswordMap] = useState({
        current: false,
        new: false,
        confirm: false,
    });
    const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);
    const [deleteInputText, setDeleteInputText] = useState('');
    const [deletePassword, setDeletePassword] = useState('');
    const [_userTransactions, setUserTransactions] = useState([]);
    const [preferences, setPreferences] = useState({ language: 'en', emailNotifications: true, securityNotifications: true, productUpdates: false, profileDiscoverable: false, revision: 0 });
    const [savingPreferences, setSavingPreferences] = useState(false);
    const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);

    // TOTP 2FA State Management
    const [totpStatus, setTotpStatus] = useState({ enabled: false, secret: null, backupCodes: [] });
    const [totpSetupModalOpen, setTotpSetupModalOpen] = useState(false);
    const [totpSetupStep, setTotpSetupStep] = useState(1);
    const [totpSetupSecret, setTotpSetupSecret] = useState('');
    const [totpEnrollmentSecret, setTotpEnrollmentSecret] = useState(null);
    const [totpQrCodeDataUrl, setTotpQrCodeDataUrl] = useState('');
    const [totpVerificationCode, setTotpVerificationCode] = useState('');
    const [totpDisableModalOpen, setTotpDisableModalOpen] = useState(false);
    const [totpDisablePassword, setTotpDisablePassword] = useState('');
    const [loginHistory, setLoginHistory] = useState([]);
    const userAuthProviders = (fire.auth().currentUser?.providerData || []).map(provider => provider?.providerId).filter(Boolean);
    const usesPasswordProvider = userAuthProviders.includes('password');
    const isOAuthOnly = userAuthProviders.length > 0 && !usesPasswordProvider;
    void isOAuthOnly;
    const primaryOAuthProvider = userAuthProviders.find(p => p !== 'password') === 'google.com' ? 'Google' : (userAuthProviders.find(p => p !== 'password') || 'OAuth');

    // Master Profile State matching ALL Resume & Cover Letter fields
    const [profile, setProfile] = useState({
        firstname: '',
        lastname: '',
        name: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        postalCode: '',
        country: '',
        occupation: '',
        linkedinUrl: '',
        githubUrl: '',
        websiteUrl: '',
        summary: '',
        selectedImage: null,
        workExperiences: [],
        education: [],
        skills: [],
        languages: [],
        hobbies: [],
        certifications: [],
        projects: [],
        achievements: [],
        references: [],
        customSections: [],
        revision: 0,
    });

    const [isDragging, setIsDragging] = useState(false);

    // Toast Notification helper
    const triggerNotification = (msg, type = 'success') => {
        setToastState({ msg, type });
        setTimeout(() => setToastState(null), 5000);
    };

    // Global Escape Key Listener for dismissible modal dialogs
    useEffect(() => {
        const handleGlobalEscape = (e) => {
            if (e.key === 'Escape') {
                if (deleteAccountModalOpen && !isSubmitting) setDeleteAccountModalOpen(false);
                if (totpSetupModalOpen && !isSubmitting) setTotpSetupModalOpen(false);
                if (totpDisableModalOpen && !isSubmitting) setTotpDisableModalOpen(false);
                if (cropModalSrc) setCropModalSrc(null);
                if (isSubscriptionModalOpen) setIsSubscriptionModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleGlobalEscape);
        return () => window.removeEventListener('keydown', handleGlobalEscape);
    }, [deleteAccountModalOpen, totpSetupModalOpen, totpDisableModalOpen, cropModalSrc, isSubscriptionModalOpen, isSubmitting]);

    // Data normalizers for historical profile shapes
    const normalizeSkills = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item, idx) => {
            if (typeof item === 'string') return { id: `skill_${idx}_${Date.now()}`, name: item, level: '' };
            if (item && typeof item === 'object') return { id: item.id || `skill_${idx}`, name: item.name || item.title || '', level: item.level || '' };
            return { id: `skill_${idx}`, name: String(item || ''), level: '' };
        });
    };

    const normalizeLanguages = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item, idx) => {
            if (typeof item === 'string') return { id: `lang_${idx}_${Date.now()}`, name: item, level: '' };
            if (item && typeof item === 'object') return { id: item.id || `lang_${idx}`, name: item.name || item.language || '', level: item.level || item.proficiency || '' };
            return { id: `lang_${idx}`, name: String(item || ''), level: '' };
        });
    };

    const normalizeHobbies = (arr) => {
        if (!Array.isArray(arr)) {
            if (typeof arr === 'string' && arr.trim()) return [arr.trim()];
            return [];
        }
        return arr.map(item => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') return item.name || item.hobby || item.title || item.interest || '';
            return String(item || '');
        }).filter(Boolean);
    };

    const normalizeCertifications = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item, idx) => {
            if (typeof item === 'string') return { id: `cert_${idx}_${Date.now()}`, title: item, issuer: '', date: '' };
            if (item && typeof item === 'object') return { id: item.id || `cert_${idx}`, title: item.title || item.name || '', issuer: item.issuer || item.authority || '', date: item.date || item.year || '' };
            return { id: `cert_${idx}`, title: String(item || ''), issuer: '', date: '' };
        });
    };

    const normalizeWorkExperiences = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item, idx) => {
            if (!item || typeof item !== 'object') return { id: `work_${idx}`, jobTitle: '', company: '', city: '', startDate: '', endDate: '', description: '' };
            return {
                id: item.id || `work_${idx}`,
                jobTitle: String(item.jobTitle || item.title || item.position || ''),
                company: String(item.company || item.employer || ''),
                city: String(item.city || item.location || ''),
                startDate: String(item.startDate || item.begin || ''),
                endDate: String(item.endDate || item.end || ''),
                description: String(item.description || item.summary || item.details || '')
            };
        });
    };

    const normalizeEducation = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item, idx) => {
            if (!item || typeof item !== 'object') return { id: `edu_${idx}`, degree: '', school: '', city: '', startDate: '', endDate: '', description: '' };
            return {
                id: item.id || `edu_${idx}`,
                degree: String(item.degree || item.qualification || ''),
                school: String(item.school || item.institution || item.university || ''),
                city: String(item.city || item.location || ''),
                startDate: String(item.startDate || item.year || ''),
                endDate: String(item.endDate || ''),
                description: String(item.description || item.summary || '')
            };
        });
    };

    const normalizeProjects = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item, idx) => {
            if (!item || typeof item !== 'object') return { id: `proj_${idx}`, title: '', description: '', link: '' };
            return {
                id: item.id || `proj_${idx}`,
                title: String(item.title || item.name || ''),
                description: String(item.description || item.summary || ''),
                link: String(item.link || item.url || '')
            };
        });
    };

    const normalizeAchievements = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item, idx) => {
            if (!item || typeof item !== 'object') return { id: `ach_${idx}`, title: '', issuer: '', date: '', description: '' };
            return {
                id: item.id || `ach_${idx}`,
                title: String(item.title || item.name || ''),
                issuer: String(item.issuer || item.awarder || item.organization || ''),
                date: String(item.date || item.year || ''),
                description: String(item.description || item.summary || '')
            };
        });
    };

    const normalizeReferences = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item, idx) => {
            if (!item || typeof item !== 'object') return { id: `ref_${idx}`, name: '', position: '', company: '', email: '', phone: '', reference: '' };
            return {
                id: item.id || `ref_${idx}`,
                name: String(item.name || item.title || ''),
                position: String(item.position || ''),
                company: String(item.company || item.organization || ''),
                email: String(item.email || ''),
                phone: String(item.phone || ''),
                reference: String(item.reference || item.description || '')
            };
        });
    };

    const normalizeCustomSections = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item, idx) => {
            if (!item || typeof item !== 'object') return { id: `custom_${idx}`, title: '', content: '', items: [] };
            const rawItems = Array.isArray(item.items) ? item.items : [];
            const items = rawItems.map((sub, sIdx) => {
                if (typeof sub === 'string') return { id: `custom_${idx}_item_${sIdx}`, title: sub, description: '' };
                if (sub && typeof sub === 'object') return { id: sub.id || `custom_${idx}_item_${sIdx}`, title: sub.title || sub.name || '', description: sub.description || sub.content || '' };
                return null;
            }).filter(Boolean);
            return {
                id: item.id || `custom_${idx}`,
                title: String(item.title || item.heading || ''),
                content: String(item.content || ''),
                items
            };
        });
    };

    // Load User Profile Data
    const getProfileOfUserFront = async () => {
        const currentUser = fire.auth().currentUser;
        if (currentUser) {
            try {
                const userProfile = await getProfileOfUser(currentUser.uid);
                const profileData = userProfile || {};
                const parts = (profileData.name || currentUser.displayName || '').split(' ');
                skipNextAutosaveRef.current = true;
                setProfile({
                    firstname: profileData.firstname || parts[0] || '',
                    lastname: profileData.lastname || parts.slice(1).join(' ') || '',
                    name: profileData.name || currentUser.displayName || '',
                    email: currentUser.email || profileData.email || '',
                    phone: profileData.phone || '',
                    address: profileData.address || '',
                    city: profileData.city || '',
                    postalCode: profileData.postalCode || profileData.postalcode || '',
                    country: profileData.country || '',
                    occupation: profileData.occupation || '',
                    linkedinUrl: profileData.linkedinUrl || '',
                    githubUrl: profileData.githubUrl || '',
                    websiteUrl: profileData.websiteUrl || '',
                    summary: profileData.summary || '',
                    selectedImage: profileData.selectedImage || profileData.image || null,
                    isLinkedinConnected: !!(profileData.isLinkedinConnected || profileData.linkedinUrl),
                    linkedinConnectedName: profileData.linkedinConnectedName || profileData.name || '',
                    workExperiences: normalizeWorkExperiences(profileData.workExperiences),
                    education: normalizeEducation(profileData.education),
                    skills: normalizeSkills(profileData.skills),
                    languages: normalizeLanguages(profileData.languages),
                    hobbies: normalizeHobbies(profileData.hobbies || profileData.interests),
                    certifications: normalizeCertifications(profileData.certifications),
                    projects: normalizeProjects(profileData.projects),
                    achievements: normalizeAchievements(profileData.achievements || profileData.awards),
                    references: normalizeReferences(profileData.references),
                    customSections: normalizeCustomSections(profileData.customSections),
                    revision: Number(profileData.revision) || 0,
                });
                setProfileSaveState('saved');
            } catch (err) {
                console.error('[ProfileLoadError]', err);
                setProfileSaveState('saved');
            }
        }
    };

    const getAccountInfoFront = async () => {
        const fetchUserAccountData = async () => {
            const currentUser = fire.auth().currentUser;
            if (currentUser) {
                try {
                    const accInfo = await getAccountInfo(currentUser.uid);
                    if (accInfo) {
                        setDatabaseAccountSettings({
                            email: accInfo.email || currentUser.email || '',
                            membership: accInfo.membership || 'Basic',
                            membershipEnds: accInfo.membershipEnds || '',
                        });
                        setPreferences(current => ({ ...current, ...(accInfo.preferences || {}), revision: Number(accInfo.preferences?.revision || 0) }));
                    }
                    const txns = await getUserTransactions(currentUser.uid);
                    setUserTransactions(txns);
                    const totpInfo = await getUserTotpStatus(currentUser.uid);
                    if (totpInfo) setTotpStatus(totpInfo);
                    if (!sessionStorage.getItem('audit_logged_' + currentUser.uid)) {
                        await recordUserLoginEvent(currentUser.uid);
                        sessionStorage.setItem('audit_logged_' + currentUser.uid, 'true');
                    }
                    const logs = await getUserLoginHistory(currentUser.uid);
                    setLoginHistory(logs);
                } catch (err) {
                    console.error('Error loading user account info:', err);
                }
            }
        };
        fetchUserAccountData();
    };


    useEffect(() => {
        const unsubscribe = fire.auth().onAuthStateChanged(async currentUser => {
            if (!currentUser) { loadedProfileUidRef.current = null; navigate('/'); return; }
            if (loadedProfileUidRef.current && loadedProfileUidRef.current !== currentUser.uid) {
                setProfile(current => ({ ...current, firstname: '', lastname: '', name: '', email: '', phone: '', address: '', city: '', postalCode: '', country: '', occupation: '', linkedinUrl: '', githubUrl: '', websiteUrl: '', summary: '', selectedImage: null, workExperiences: [], education: [], skills: [], languages: [], hobbies: [], certifications: [], projects: [], achievements: [], references: [], customSections: [], revision: 0 }));
                setUserTransactions([]); setLoginHistory([]); setPreferences({ language: 'en', emailNotifications: true, securityNotifications: true, productUpdates: false, profileDiscoverable: false, revision: 0 }); setProfileConflict(null); setProfileSaveState('loading');
            }
            loadedProfileUidRef.current = currentUser.uid;
            await Promise.all([getProfileOfUserFront(), getAccountInfoFront()]);
        });
        return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigate]);

    const handleInputChange = (e) => {
        const field = e.target.name;
        const value = e.target.value;
        setProfile((prev) => {
            const updated = { ...prev, [field]: value };
            if (field === 'firstname' || field === 'lastname') {
                updated.name = `${updated.firstname || ''} ${updated.lastname || ''}`.trim();
            }
            if (field === 'city' && value) {
                const inferredCountry = inferCountryFromCity(value);
                if (inferredCountry) {
                    updated.country = inferredCountry;
                }
            }
            return updated;
        });
    };


    useEffect(() => { profileRef.current = profile; }, [profile]);
    useEffect(() => { profileConflictRef.current = profileConflict; }, [profileConflict]);
    useEffect(() => () => { mountedRef.current = false; }, []);

    const persistProfile = ({ profile: profileSnapshot, expectedRevision, notify = false } = {}) => new Promise((resolve, reject) => {
        if (profileSavingRef.current) {
            pendingProfileSaveRef.current = {
                waiters: [...(pendingProfileSaveRef.current?.waiters || []), profileSavingRef.current, { resolve, reject }],
                notify: pendingProfileSaveRef.current?.notify || notify,
            };
            return;
        }
        profileSavingRef.current = { resolve, reject, notify };
        setProfileSaveState('saving');
        (async () => {
            let waiter;
            try {
                while (true) {
                    const currentUser = fire.auth().currentUser;
                    if (!mountedRef.current) throw Object.assign(new Error('Profile save cancelled.'), { code: 'PROFILE_SAVE_CANCELLED' });
                    if (!currentUser) throw new Error('Sign in again before saving your profile.');
                    if (profileConflictRef.current) throw new Error('Resolve the newer profile revision before saving.');

                    const snapshot = profileSnapshot || profileRef.current;
                    const baseRevision = Number.isSafeInteger(Number(expectedRevision))
                        ? Number(expectedRevision)
                        : (Number.isSafeInteger(Number(snapshot?.revision)) ? Number(snapshot.revision) : 0);
                    const profileToSave = normalizeProfileForSave(snapshot);
                    const result = await saveProfile(currentUser.uid, profileToSave, baseRevision);
                    if (!mountedRef.current) throw Object.assign(new Error('Profile save cancelled.'), { code: 'PROFILE_SAVE_CANCELLED' });
                    if (!result.success) throw Object.assign(new Error(result.error || 'Profile save failed.'), { code: result.code, remoteRevision: result.remoteRevision });

                    const stripRev = p => {
                        const n = normalizeProfileForSave(p);
                        delete n.revision;
                        return n;
                    };
                    const latestProfile = profileRef.current;
                    const needsFollowUp = latestProfile.revision === snapshot.revision
                        && JSON.stringify(stripRev(latestProfile)) !== JSON.stringify(stripRev(result.profile));

                    skipNextAutosaveRef.current = true;
                    profileRef.current = { ...profileRef.current, revision: result.revision };
                    setProfile(current => ({ ...current, revision: result.revision }));
                    setProfileSaveState('saved');
                    window.dispatchEvent(new CustomEvent('profileUpdated', { detail: result.profile }));
                    if (notify) triggerNotification('Master Profile saved successfully.');
                    waiter = profileSavingRef.current;

                    if (pendingProfileSaveRef.current || needsFollowUp) {
                        const pending = pendingProfileSaveRef.current;
                        pendingProfileSaveRef.current = needsFollowUp ? { waiters: [], notify: false } : null;
                        profileSnapshot = null;
                        expectedRevision = result.revision;
                        notify = pending?.notify || false;
                        pending?.waiters.forEach(item => item.resolve(result));
                        continue;
                    }
                    waiter.resolve(result);
                    break;
                }
            } catch (error) {
                const pending = pendingProfileSaveRef.current;
                pendingProfileSaveRef.current = null;
                if (error.code === 'PROFILE_CONFLICT') setProfileConflict({ remoteRevision: error.remoteRevision });
                if (mountedRef.current) setProfileSaveState(error.code === 'PROFILE_CONFLICT' ? 'conflict' : 'failed');
                waiter?.reject(error);
                pending?.waiters.forEach(item => item.reject(error));
            } finally {
                profileSavingRef.current = null;
            }
        })();
    });
    persistProfileRef.current = (options = {}) => persistProfile(options);
    const reloadProfileConflict = async () => { setProfileConflict(null); setProfileSaveState('loading'); await getProfileOfUserFront(); triggerNotification('Latest profile loaded.'); };
    const overwriteProfileConflict = () => { setProfile(current => ({ ...current, revision: profileConflict.remoteRevision })); setProfileConflict(null); setProfileSaveState('pending'); triggerNotification('Conflict acknowledged. Your local profile will save as the next revision.'); };

    const handleSubmit = async (e) => {
        e?.preventDefault?.();
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        setIsSubmitting(true);
        try { await persistProfile({ notify: true }); return true; }
        catch (error) { triggerNotification(error.message || 'Failed to save profile.', 'error'); return false; }
        finally { setIsSubmitting(false); }
    };

    const handleSaveAndNext = async () => {
        const saved = await handleSubmit();
        if (!saved) return;
        const currentIdx = SUB_TAB_ORDER.indexOf(profileSubTab);
        const nextTab = SUB_TAB_ORDER[currentIdx + 1];
        if (nextTab) {
            setProfileSubTab(nextTab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleAccountSubmit = async (e) => {
        if (e) e.preventDefault();
        setIsSubmitting(true);
        try {
            let updatedSomething = false;

            // Check what changed
            const isEmailChanged = databaseAccountSettings.email && databaseAccountSettings.email !== (fire.auth().currentUser?.email || '');
            const isPasswordChanged = !!accountPasswordState.newPassword;

            // Only require current password if user has a traditional password provider
            if (usesPasswordProvider && (isEmailChanged || isPasswordChanged) && !accountPasswordState.currentPassword) {
                triggerNotification('Current password is required to verify identity for credential updates.', 'error');
                setIsSubmitting(false);
                return;
            }

            // 1. Email update
            if (isEmailChanged) {
                await updateUserEmail(usesPasswordProvider ? accountPasswordState.currentPassword : '', databaseAccountSettings.email);
                updatedSomething = true;
            }

            // 2. Password update / creation
            if (isPasswordChanged) {
                if (accountPasswordState.newPassword.length < 8) {
                    triggerNotification('Security password must be at least 8 characters long.', 'error');
                    setIsSubmitting(false);
                    return;
                }
                if (accountPasswordState.newPassword !== accountPasswordState.confirmPassword) {
                    triggerNotification('New passwords do not match. Please verify.', 'error');
                    setIsSubmitting(false);
                    return;
                }
                await changePassword(usesPasswordProvider ? accountPasswordState.currentPassword : '', accountPasswordState.newPassword);
                updatedSomething = true;
                setAccountPasswordState({ currentPassword: '', newPassword: '', confirmPassword: '' });
            }

            if (updatedSomething) {
                triggerNotification(
                    usesPasswordProvider
                        ? 'Account security credentials updated successfully!'
                        : 'Account security password created successfully! You can now sign in using either email & password or OAuth.'
                );
            } else {
                triggerNotification('No changes detected in account credentials.');
            }
        } catch (err) {
            console.error('Account Security Update Error:', err);
            let msg = err.message || 'Failed to update account security credentials.';
            if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                msg = 'Incorrect Current Password. Authentication failed.';
            } else if (err.code === 'auth/requires-recent-login') {
                msg = 'For security, please sign out and sign in again before updating credentials.';
            }
            triggerNotification(msg, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePreferencesSave = async () => {
        const user = fire.auth().currentUser;
        if (!user) return;
        setSavingPreferences(true);
        const result = await saveUserPreferences(user.uid, preferences, preferences.revision);
        if (result.success) {
            setPreferences(result.preferences);
            if (result.preferences.language && result.preferences.language !== i18n.language) await i18n.changeLanguage(result.preferences.language);
            triggerNotification('Preferences saved successfully.');
        } else triggerNotification(result.error || 'Unable to save preferences.', 'error');
        setSavingPreferences(false);
    };

    const handleSendVerificationEmail = async () => {
        const user = fire.auth().currentUser;
        if (user && user.email) {
            try {
                const response = await fetch('/api/auth/send-verification-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: user.email,
                        userName: user.displayName || user.email.split('@')[0]
                    })
                });
                if (!response.ok) throw new Error('Verification email request failed.');
                triggerNotification('Verification link sent to ' + user.email + '.');
            } catch (err) {
                triggerNotification(err.message || 'Failed to send verification email.', 'error');
            }
        }
    };

    const handleExportUserData = async () => {
        try {
            setIsSubmitting(true);
            const data = await exportUserDataJSON();
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `user_data_export_${data.userId || 'account'}_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            const warningCount = data.exportWarnings?.length || 0;
            triggerNotification(warningCount
                ? `Data export downloaded with ${warningCount} unavailable section${warningCount === 1 ? '' : 's'}. Review exportWarnings in the file.`
                : 'Account data export downloaded successfully.');
        } catch (err) {
            triggerNotification(err.message || 'Failed to export data', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteAccountConfirmed = async () => {
        try {
            setIsSubmitting(true);
            const result = await deleteUserAccountPermanently(deletePassword);
            const retained = result.retainedRecordTypes?.length ? ` Legally/operationally retained records: ${result.retainedRecordTypes.join(', ')}.` : '';
            triggerNotification(`${result.message}${retained}`);
            setDeleteAccountModalOpen(false);
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } catch (err) {
            console.error('Delete Account Error:', err);
            let msg = err.message || 'Failed to delete account.';
            if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                msg = 'Incorrect Current Password. Deletion cancelled for security.';
            }
            triggerNotification(msg, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // TOTP 2FA Setup & Disable Handlers
    const handleStartTotpSetup = async () => {
        setIsSubmitting(true);
        try {
            const enrollment = await beginUserTotp2FA();
            setTotpEnrollmentSecret(enrollment.secret);
            setTotpSetupSecret(enrollment.secretKey);
            setTotpQrCodeDataUrl(enrollment.qrCodeDataUrl);
            setTotpVerificationCode('');
            setTotpSetupStep(1);
            setTotpSetupModalOpen(true);
        } catch (error) {
            triggerNotification(error.message || 'Unable to start MFA enrollment. Reauthenticate and try again.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleVerifyAndEnableTotp = async () => {
        if (!totpVerificationCode || totpVerificationCode.trim().length !== 6) {
            triggerNotification('Please enter a valid 6-digit verification code from your authenticator app.', 'error');
            return;
        }
        setIsSubmitting(true);
        try {
            const status = await saveUserTotp2FA(totpEnrollmentSecret, totpVerificationCode);
            setTotpStatus(status);
            setTotpSetupStep(3); // Advance to backup codes screen
            triggerNotification('TOTP Two-Factor Authentication enabled successfully! 🛡️');
        } catch (err) {
            triggerNotification(err.message || 'Failed to enable 2FA', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDisableTotpConfirmed = async () => {
        if (usesPasswordProvider && !totpDisablePassword) {
            triggerNotification('Current password is required to disable 2FA.', 'error');
            return;
        }
        setIsSubmitting(true);
        try {
            // Re-authenticate user first
            await reauthenticateUser(totpDisablePassword);
            const status = await disableUserTotp2FA();
            setTotpStatus(status);
            setTotpDisableModalOpen(false);
            setTotpDisablePassword('');
            triggerNotification('TOTP 2FA has been disabled for your account.');
        } catch (err) {
            console.error('Disable 2FA error:', err);
            let msg = err.message || 'Failed to disable 2FA.';
            if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                msg = 'Incorrect Current Password. 2FA remains enabled for security.';
            }
            triggerNotification(msg, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Automatic background auto-saver for Master Profile Settings
    const isFirstProfileLoadRef = React.useRef(true);
    useEffect(() => {
        if (isFirstProfileLoadRef.current) { isFirstProfileLoadRef.current = false; return undefined; }
        if (skipNextAutosaveRef.current) { skipNextAutosaveRef.current = false; return undefined; }
        if (profileConflict) return undefined;
        if (profileSavingRef.current) { setProfileSaveState('pending'); return undefined; }
        setProfileSaveState('pending');
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = setTimeout(async () => {
            try { await persistProfileRef.current?.(); }
            catch (error) { if (error.code !== 'PROFILE_CONFLICT') triggerNotification(error.message || 'Profile autosave failed. Retry with Save.', 'error'); }
        }, 1500);
        return () => {
            if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        };
    }, [profile, profileConflict]);

    useEffect(() => () => { const controller = aiRequestControllerRef.current; aiRequestControllerRef.current = null; controller?.abort(); }, []);

    const runProfileAi = async (operation, payload) => {
        aiRequestControllerRef.current?.abort();
        const controller = new AbortController();
        aiRequestControllerRef.current = controller;
        try {
            return await generateUserAiContent(operation, payload, { signal: controller.signal });
        } finally {
            if (aiRequestControllerRef.current === controller) aiRequestControllerRef.current = null;
        }
    };

    // Summary rewriting and AI Executive Bio generation
    const handleWriteAiSummary = async () => {
        const cleanText = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const latestWorkRole = cleanText(profile.workExperiences?.[0]?.jobTitle);
        const primaryRole = cleanText(profile.occupation) || latestWorkRole;
        if (!primaryRole) {
            triggerNotification('Enter your occupation or a work-history role before requesting an AI summary.', 'error');
            return;
        }
        const yearsExp = calculateYearsOfExperience(profile.workExperiences || []);
        const expDetails = (profile.workExperiences || []).map(work => {
            const role = cleanText(work?.jobTitle);
            const employer = cleanText(work?.company);
            const dates = [cleanText(work?.startDate), cleanText(work?.endDate)].filter(Boolean).join(' to ');
            return [[role, employer ? `${role ? 'at ' : ''}${employer}` : ''].filter(Boolean).join(' '), dates, cleanText(work?.description)]
                .filter(Boolean).join('; ');
        }).filter(Boolean).join(' | ');
        const eduDetails = (profile.education || []).map(education =>
            [cleanText(education?.degree), cleanText(education?.school), [cleanText(education?.startDate), cleanText(education?.endDate)].filter(Boolean).join(' to '), cleanText(education?.description)]
                .filter(Boolean).join('; ')
        ).filter(Boolean).join(' | ');
        const skillsDetails = (profile.skills || []).map(skill => cleanText(typeof skill === 'string' ? skill : skill?.name || skill?.skillName)).filter(Boolean).join(', ');
        const certsDetails = (profile.certifications || []).map(cert => cleanText(typeof cert === 'string' ? cert : [cert?.title || cert?.name, cert?.issuer].filter(Boolean).join(' — '))).filter(Boolean).join(', ');
        const projectsDetails = (profile.projects || []).map(project => [cleanText(project?.title || project?.name), cleanText(project?.description)].filter(Boolean).join(': ')).filter(Boolean).join(' | ');
        const existingText = cleanText(profile.summary);

        setIsAiGenerating(true);
        try {
            const data = await runProfileAi('generate-summary', {
                name: [cleanText(profile.firstname), cleanText(profile.lastname)].filter(Boolean).join(' '),
                jobTitle: primaryRole,
                occupation: primaryRole,
                experience: yearsExp,
                workHistory: expDetails,
                education: eduDetails,
                skills: skillsDetails,
                certifications: certsDetails,
                projects: projectsDetails,
                existingText,
                tone: summaryTone || 'executive',
            });
            const summaryText = data?.summary || data?.description || (typeof data === 'string' ? data : null);
            if (typeof summaryText !== 'string' || !summaryText.trim()) {
                throw new Error('No summary was returned by AI provider');
            }
            setProfile(prev => ({ ...prev, summary: summaryText.trim() }));
            triggerNotification('AI Executive Bio generated successfully!');
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('AI summary error:', err);
            const msg = (err?.code === 'AI_DAILY_QUOTA_EXCEEDED' || err?.status === 429)
                ? 'Daily AI limit reached. Please upgrade your plan or try again later.'
                : (err?.message || 'Unable to generate Executive Bio at this time.');
            triggerNotification(msg, 'error');
        } finally {
            setIsAiGenerating(false);
        }
    };

    // Work Experience Bullet Enhancement with AI
    const handleEnhanceWorkDescriptionWithAi = async (index) => {
        const job = (profile.workExperiences || [])[index];
        if (!job || !job.jobTitle) {
            triggerNotification('Please enter the Job Title for this position first.', 'error');
            return;
        }
        setIsAiGenerating(true);
        try {
            const data = await runProfileAi('generate-work-description', {
                jobTitle: job.jobTitle,
                employer: job.company || 'Organization',
                city: job.city || '',
                startDate: job.startDate || '',
                endDate: job.endDate || '',
                current: Boolean(job.current),
                existingText: job.description || '',
                tone: 'metrics',
            });
            let cleanSuggestions = [];
            if (Array.isArray(data?.suggestions)) {
                cleanSuggestions = data.suggestions.map(item =>
                    String(typeof item === 'object' ? item.text || item.suggestion || Object.values(item)[0] || '' : item).trim()
                ).filter(Boolean);
            }
            if (!cleanSuggestions.length) {
                triggerNotification('No bullet points generated. Please provide more role details.', 'error');
                return;
            }
            const bulletText = cleanSuggestions.map(s => `• ${s.replace(/^[•\-*]\s*/, '')}`).join('\n');
            const currentDesc = String(job.description || '').trim();
            const merged = currentDesc ? `${currentDesc}\n${bulletText}` : bulletText;
            updateWorkExperience(index, 'description', merged);
            triggerNotification('AI Work Experience bullet points added!');
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('AI Work Description Error:', err);
            const msg = (err?.code === 'AI_DAILY_QUOTA_EXCEEDED' || err?.status === 429)
                ? 'Daily AI limit reached. Please upgrade your plan or try again later.'
                : (err?.message || 'Unable to generate bullet points at this time.');
            triggerNotification(msg, 'error');
        } finally {
            setIsAiGenerating(false);
        }
    };

    // DYNAMIC AI RECOMMENDATIONS FOR SKILLS
    const handleRecommendAiSkills = async () => {
        const effectiveRole = String(profile.occupation || profile.workExperiences?.[0]?.jobTitle || '').trim();
        if (!effectiveRole) {
            triggerNotification('Please enter your Occupation or at least one Job Title in Basic Details before requesting AI recommendations.', 'error');
            return;
        }
        setIsAiGenerating(true);
        try {
            const expDetails = (profile.workExperiences || []).map(w => `${w.jobTitle || 'Role'} at ${w.company || ''}`).filter(Boolean).join('; ');
            const eduDetails = (profile.education || []).map(e => `${e.degree || ''} from ${e.school || ''}`).filter(Boolean).join('; ');
            const projDetails = (profile.projects || []).map(p => p?.title || p?.name).filter(Boolean).join(', ');
            const existing = (profile.skills || []).map(skill =>
                String(typeof skill === 'string' ? skill : skill?.name || skill?.skillName || '').trim()
            ).filter(Boolean);

            const data = await runProfileAi('generate-skills', {
                targetRole: effectiveRole,
                jobTitle: effectiveRole,
                occupation: effectiveRole,
                workHistory: expDetails,
                education: eduDetails,
                projects: projDetails,
                existingSkills: existing,
                context: {
                    target: { role: effectiveRole },
                    facts: {
                        roles: (profile.workExperiences || []).map(w => ({
                            title: w.jobTitle || '',
                            employer: w.company || '',
                            description: w.description || ''
                        })),
                        skills: existing,
                        education: (profile.education || []).map(e => ({
                            degree: e.degree || '',
                            school: e.school || '',
                            description: e.description || ''
                        })),
                        certifications: (profile.certifications || []).map(c => ({
                            title: typeof c === 'string' ? c : c?.title || c?.name || '',
                            issuer: typeof c === 'object' ? c?.issuer || '' : ''
                        })),
                        projects: (profile.projects || []).map(p => ({
                            title: p?.title || p?.name || '',
                            description: p?.description || ''
                        }))
                    }
                }
            });

            const rawSkills = Array.isArray(data?.skills)
                ? data.skills
                : (Array.isArray(data?.data?.skills)
                    ? data.data.skills
                    : (Array.isArray(data?.suggestions)
                        ? data.suggestions
                        : (Array.isArray(data) ? data : [])));

            if (!rawSkills.length) {
                const note = data?.note || 'AI skill suggestions are currently unavailable. Please verify your role and try again.';
                triggerNotification(note, 'info');
                return;
            }

            const unadded = rawSkills.filter(s => {
                const name = typeof s === 'string' ? s : s?.name || s?.skill || s?.title;
                return name && !existing.some(e => e.toLowerCase() === name.toLowerCase());
            });

            const itemsToReview = unadded.map((s, idx) => {
                const raw = typeof s === 'string' ? s : s?.name || s?.skill || s?.title;
                const cleaned = cleanSkillName(raw);
                const category = (typeof s === 'object' && s?.category && ['mandatory', 'recommended'].includes(s.category)) ? s.category : (idx < 5 ? 'mandatory' : 'recommended');
                return { name: cleaned, category };
            }).filter(s => s.name);

            if (!itemsToReview.length) {
                triggerNotification('All recommended skills for this role are already in your profile!', 'info');
                return;
            }

            setAiModalState({
                isOpen: true,
                title: `Review AI Recommended Skills for ${effectiveRole}`,
                type: 'skills',
                items: itemsToReview,
                onApply: (approvedItems) => {
                    const newSkills = approvedItems.map(item => ({
                        id: `skill_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        name: cleanSkillName(item.name || item.title),
                        level: 'Expert',
                    })).filter(item => item.name);
                    setProfile(prev => {
                        const existingNames = new Set((prev.skills || []).map(skill => String(typeof skill === 'string' ? skill : skill.name || '').toLowerCase()));
                        return { ...prev, skills: [...(prev.skills || []), ...newSkills.filter(skill => !existingNames.has(skill.name.toLowerCase()))] };
                    });
                    triggerNotification(`Added ${approvedItems.length} approved ATS skills to your profile!`);
                },
            });
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('AI skill recommendation error:', err);
            const msg = (err?.code === 'AI_DAILY_QUOTA_EXCEEDED' || err?.status === 429)
                ? 'Daily AI limit reached. Please upgrade your plan or try again later.'
                : (err?.message || 'Unable to generate skills recommendations.');
            triggerNotification(msg, 'error');
        } finally {
            setIsAiGenerating(false);
        }
    };

    // DYNAMIC AI RECOMMENDATIONS FOR CERTIFICATIONS
    const handleRecommendAiCertifications = async () => {
        const effectiveRole = String(profile.occupation || profile.workExperiences?.[0]?.jobTitle || '').trim();
        if (!effectiveRole) {
            triggerNotification('Please enter your Occupation or at least one Job Title in Basic Details before requesting AI recommendations.', 'error');
            return;
        }
        setIsAiGenerating(true);
        try {
            const expDetails = (profile.workExperiences || []).map(w => `${w.jobTitle || 'Role'} at ${w.company || ''}`).filter(Boolean).join('; ');
            const eduDetails = (profile.education || []).map(e => `${e.degree || ''} from ${e.school || ''}`).filter(Boolean).join('; ');
            const skillsDetails = (profile.skills || []).map(s => (typeof s === 'string' ? s : s?.name || s?.skillName)).filter(Boolean).join(', ');
            const existingCerts = (profile.certifications || []).map(c => typeof c === 'string' ? c : c?.title || c?.name).filter(Boolean);

            const data = await runProfileAi('generate-certifications', {
                targetRole: effectiveRole,
                jobTitle: effectiveRole,
                occupation: effectiveRole,
                workHistory: expDetails,
                education: eduDetails,
                skills: skillsDetails,
                existingCertifications: existingCerts,
                context: {
                    target: { role: effectiveRole },
                    facts: {
                        roles: (profile.workExperiences || []).map(w => ({
                            title: w.jobTitle || '',
                            employer: w.company || '',
                            description: w.description || ''
                        })),
                        skills: (profile.skills || []).map(s => typeof s === 'string' ? s : s?.name || s?.skillName || '').filter(Boolean),
                        education: (profile.education || []).map(e => ({
                            degree: e.degree || '',
                            school: e.school || '',
                            description: e.description || ''
                        })),
                        certifications: (profile.certifications || []).map(c => ({
                            title: typeof c === 'string' ? c : c?.title || c?.name || '',
                            issuer: typeof c === 'object' ? c?.issuer || '' : ''
                        }))
                    }
                }
            });

            const certsList = Array.isArray(data?.certifications)
                ? data.certifications
                : (Array.isArray(data?.data?.certifications)
                    ? data.data.certifications
                    : (Array.isArray(data?.certs)
                        ? data.certs
                        : (Array.isArray(data?.suggestions)
                            ? data.suggestions
                            : (Array.isArray(data) ? data : []))));

            if (!certsList.length) {
                const note = data?.note || 'AI credential suggestions are currently unavailable. Please verify your role and try again.';
                triggerNotification(note, 'info');
                return;
            }

            const unadded = certsList.filter(c => {
                const title = typeof c === 'string' ? c : c?.title || c?.name;
                return title && !existingCerts.some(e => e.toLowerCase() === title.toLowerCase());
            });

            const itemsToReview = unadded.map((c, idx) => {
                const title = typeof c === 'string' ? c : (c?.title || c?.name || '');
                const issuer = typeof c === 'object' ? (c?.issuer || 'Accredited Organization') : 'Accredited Organization';
                const category = (typeof c === 'object' && c?.category && ['mandatory', 'recommended'].includes(c.category)) ? c.category : (idx < 3 ? 'mandatory' : 'recommended');
                return { title, issuer, category, name: title };
            }).filter(c => c.title);

            if (!itemsToReview.length) {
                triggerNotification('All recommended credentials for this role are already in your Master Profile!', 'info');
                return;
            }

            setAiModalState({
                isOpen: true,
                title: `Review Industry Certifications for ${effectiveRole}`,
                type: 'certifications',
                items: itemsToReview,
                onApply: (approvedItems) => {
                    const newCerts = approvedItems.map((c, i) => ({
                        id: `cert_ai_${Date.now()}_${i}`,
                        title: c.title || c.name,
                        issuer: c.issuer || 'Accredited Organization',
                        date: ''
                    }));
                    setProfile(prev => ({
                        ...prev,
                        certifications: [...(prev.certifications || []), ...newCerts]
                    }));
                    triggerNotification(`Added ${approvedItems.length} credentials to your Master Profile!`);
                }
            });
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('AI Certifications Recommendation Error:', err);
            const msg = (err?.code === 'AI_DAILY_QUOTA_EXCEEDED' || err?.status === 429)
                ? 'Daily AI limit reached. Please upgrade your plan or try again later.'
                : (err?.message || 'Unable to generate certification recommendations.');
            triggerNotification(msg, 'error');
        } finally {
            setIsAiGenerating(false);
        }
    };

    // Reorder items helper
    const moveItem = (arrayField, index, direction) => {
        setProfile((prev) => {
            const list = [...(prev[arrayField] || [])];
            const targetIdx = index + direction;
            if (targetIdx < 0 || targetIdx >= list.length) return prev;
            const [moved] = list.splice(index, 1);
            list.splice(targetIdx, 0, moved);
            return { ...prev, [arrayField]: list };
        });
    };

    // Work Experience Array Handlers
    const addWorkExperience = () => {
        setProfile((prev) => ({
            ...prev,
            workExperiences: [
                ...prev.workExperiences,
                { id: `job_${Date.now()}`, jobTitle: '', company: '', city: '', startDate: '', endDate: '', description: '' }
            ]
        }));
    };

    const updateWorkExperience = (index, field, value) => {
        const rawVal = (value && typeof value === 'object' && value.target !== undefined) ? value.target.value : value;
        setProfile((prev) => {
            const updated = [...prev.workExperiences];
            updated[index] = { ...updated[index], [field]: rawVal };
            return { ...prev, workExperiences: updated };
        });
    };

    const removeWorkExperience = (index) => {
        setProfile((prev) => ({
            ...prev,
            workExperiences: prev.workExperiences.filter((_, i) => i !== index)
        }));
    };

    // Education Array Handlers
    const addEducation = () => {
        setProfile((prev) => ({
            ...prev,
            education: [
                ...prev.education,
                { id: `edu_${Date.now()}`, degree: '', school: '', city: '', startDate: '', endDate: '', description: '' }
            ]
        }));
    };

    const updateEducation = (index, field, value) => {
        const rawVal = (value && typeof value === 'object' && value.target !== undefined) ? value.target.value : value;
        setProfile((prev) => {
            const updated = [...prev.education];
            updated[index] = { ...updated[index], [field]: rawVal };
            return { ...prev, education: updated };
        });
    };

    const removeEducation = (index) => {
        setProfile((prev) => ({
            ...prev,
            education: prev.education.filter((_, i) => i !== index)
        }));
    };

    // Skills Handlers
    const addSkill = () => {
        setProfile((prev) => ({
            ...prev,
            skills: [...prev.skills, { name: '', level: '' }]
        }));
    };

    const updateSkill = (index, field, value) => {
        const rawVal = (value && typeof value === 'object' && value.target !== undefined) ? value.target.value : value;
        setProfile((prev) => {
            const updated = [...prev.skills];
            updated[index] = { ...updated[index], [field]: rawVal };
            return { ...prev, skills: updated };
        });
    };

    const removeSkill = (index) => {
        setProfile((prev) => ({
            ...prev,
            skills: prev.skills.filter((_, i) => i !== index)
        }));
    };

    // Certifications Handlers
    const addCertification = () => {
        setProfile((prev) => ({
            ...prev,
            certifications: [...prev.certifications, { id: `cert_${Date.now()}`, title: '', issuer: '', date: '' }]
        }));
    };

    const updateCertification = (index, field, value) => {
        const rawVal = (value && typeof value === 'object' && value.target !== undefined) ? value.target.value : value;
        setProfile((prev) => {
            const updated = [...prev.certifications];
            updated[index] = { ...updated[index], [field]: rawVal };
            return { ...prev, certifications: updated };
        });
    };

    const removeCertification = (index) => {
        setProfile((prev) => ({
            ...prev,
            certifications: prev.certifications.filter((_, i) => i !== index)
        }));
    };

    // Projects Handlers
    const addProject = () => {
        setProfile((prev) => ({
            ...prev,
            projects: [...prev.projects, { id: `proj_${Date.now()}`, title: '', description: '', link: '' }]
        }));
    };

    const updateProject = (index, field, value) => {
        const rawVal = (value && typeof value === 'object' && value.target !== undefined) ? value.target.value : value;
        setProfile((prev) => {
            const updated = [...prev.projects];
            updated[index] = { ...updated[index], [field]: rawVal };
            return { ...prev, projects: updated };
        });
    };

    const removeProject = (index) => {
        setProfile((prev) => ({
            ...prev,
            projects: prev.projects.filter((_, i) => i !== index)
        }));
    };

    // Languages Handlers
    const PROFICIENCY_LEVELS = ['Native / Bilingual', 'Full Professional (Fluent)', 'Professional Working (Advanced)', 'Limited Working (Intermediate)', 'Elementary (Basic)'];
    const addLanguage = () => {
        setProfile((prev) => ({
            ...prev,
            languages: [...prev.languages, { id: `lang_${Date.now()}`, name: '', level: '' }]
        }));
    };
    const updateLanguage = (index, field, value) => {
        const rawVal = (value && typeof value === 'object' && value.target !== undefined) ? value.target.value : value;
        setProfile((prev) => {
            const updated = [...prev.languages];
            updated[index] = { ...updated[index], [field]: rawVal };
            return { ...prev, languages: updated };
        });
    };
    const removeLanguage = (index) => {
        setProfile((prev) => ({
            ...prev,
            languages: prev.languages.filter((_, i) => i !== index)
        }));
    };
    const POPULAR_LANGUAGES = ['English','Hindi','Telugu','Tamil','Kannada','Malayalam','Marathi','Bengali','Gujarati','Punjabi','Spanish','French','German','Mandarin','Arabic','Portuguese','Japanese','Russian','Korean'];

    // Hobbies Handlers
    const [hobbyInput, setHobbyInput] = useState('');
    const POPULAR_HOBBIES = ['Photography', 'Chess', 'Marathon Running', 'Open Source Contributor', 'Reading', 'Hiking', 'Writing', 'Cooking', 'Traveling', 'Volunteering', 'Music Production'];
    const addHobby = (hobbyName) => {
        const trimmed = (hobbyName || hobbyInput).trim();
        if (!trimmed) return;
        const exists = (profile.hobbies || []).some(h => (typeof h === 'string' ? h : h.name || h.hobby || '').toLowerCase() === trimmed.toLowerCase());
        if (!exists) {
            setProfile(prev => ({ ...prev, hobbies: [...(prev.hobbies || []), trimmed] }));
        }
        setHobbyInput('');
    };
    const removeHobby = (index) => {
        setProfile(prev => ({ ...prev, hobbies: (prev.hobbies || []).filter((_, i) => i !== index) }));
    };

    // Work Experience Duplication
    const duplicateWorkExperience = (index) => {
        const source = (profile.workExperiences || [])[index];
        if (!source) return;
        const copy = { ...source, id: `work_${Date.now()}`, jobTitle: `${source.jobTitle || 'Position'} (Copy)` };
        setProfile(prev => ({
            ...prev,
            workExperiences: [...prev.workExperiences.slice(0, index + 1), copy, ...prev.workExperiences.slice(index + 1)]
        }));
        triggerNotification('Work Experience position duplicated!');
    };

    // Multi-Skill Bulk Paste Ingestion & View Mode
    const [bulkSkillsInput, setBulkSkillsInput] = useState('');
    const [skillsViewMode, setSkillsViewMode] = useState('grid'); // 'grid' | 'compact'
    const [showBulkSkills, setShowBulkSkills] = useState(false);
    const [skillsSearchQuery, setSkillsSearchQuery] = useState('');

    const cycleSkillLevel = (index) => {
        const levels = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
        setProfile((prev) => {
            const current = (prev.skills[index]?.level || 'Intermediate');
            const currentIndex = levels.findIndex(l => l.toLowerCase() === current.toLowerCase());
            const nextLevel = levels[(currentIndex + 1) % levels.length];
            const updated = [...prev.skills];
            updated[index] = { ...updated[index], level: nextLevel };
            return { ...prev, skills: updated };
        });
    };
    const handleBulkSkillAdd = () => {
        if (!bulkSkillsInput || !bulkSkillsInput.trim()) return;
        const tokens = bulkSkillsInput.split(/[,;\n]+/).map(t => cleanSkillName(t)).filter(Boolean);
        if (tokens.length > 0) {
            setProfile(prev => {
                const existingNames = new Set((prev.skills || []).map(s => String(typeof s === 'string' ? s : s?.name || s?.skillName || '').trim().toLowerCase()));
                const toAdd = [];
                for (const token of tokens) {
                    const norm = token.trim().toLowerCase();
                    if (norm && !existingNames.has(norm)) {
                        existingNames.add(norm);
                        toAdd.push({ id: `skill_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, name: token, level: 'Advanced' });
                    }
                }
                if (toAdd.length > 0) {
                    triggerNotification(`Added ${toAdd.length} skill(s) to Master Profile!`);
                    return { ...prev, skills: [...prev.skills, ...toAdd] };
                } else {
                    triggerNotification('All entered skills already exist in profile.', 'info');
                    return prev;
                }
            });
            setBulkSkillsInput('');
        }
    };

    // Achievements Handlers
    const addAchievement = () => {
        setProfile((prev) => ({
            ...prev,
            achievements: [...(prev.achievements || []), { id: `ach_${Date.now()}`, title: '', issuer: '', date: '', description: '' }]
        }));
    };
    const updateAchievement = (index, field, value) => {
        const rawVal = (value && typeof value === 'object' && value.target !== undefined) ? value.target.value : value;
        setProfile((prev) => {
            const updated = [...(prev.achievements || [])];
            updated[index] = { ...updated[index], [field]: rawVal };
            return { ...prev, achievements: updated };
        });
    };
    const removeAchievement = (index) => {
        setProfile((prev) => ({
            ...prev,
            achievements: (prev.achievements || []).filter((_, i) => i !== index)
        }));
    };

    // References Handlers
    const addReference = () => {
        setProfile((prev) => ({
            ...prev,
            references: [...(prev.references || []), { id: `ref_${Date.now()}`, name: '', position: '', company: '', email: '', phone: '', reference: '' }]
        }));
    };
    const updateReference = (index, field, value) => {
        const rawVal = (value && typeof value === 'object' && value.target !== undefined) ? value.target.value : value;
        setProfile((prev) => {
            const updated = [...(prev.references || [])];
            updated[index] = { ...updated[index], [field]: rawVal };
            return { ...prev, references: updated };
        });
    };
    const removeReference = (index) => {
        setProfile((prev) => ({
            ...prev,
            references: (prev.references || []).filter((_, i) => i !== index)
        }));
    };

    // Custom Sections Handlers
    const addCustomSection = () => {
        setProfile((prev) => ({
            ...prev,
            customSections: [...(prev.customSections || []), { id: `custom_${Date.now()}`, title: 'Custom Section', content: '', items: [] }]
        }));
    };
    const updateCustomSection = (index, field, value) => {
        const rawVal = (value && typeof value === 'object' && value.target !== undefined) ? value.target.value : value;
        setProfile((prev) => {
            const updated = [...(prev.customSections || [])];
            updated[index] = { ...updated[index], [field]: rawVal };
            return { ...prev, customSections: updated };
        });
    };
    const removeCustomSection = (index) => {
        setProfile((prev) => ({
            ...prev,
            customSections: (prev.customSections || []).filter((_, i) => i !== index)
        }));
    };
    const addCustomSectionItem = (sectionIndex) => {
        setProfile((prev) => {
            const updated = [...(prev.customSections || [])];
            const section = updated[sectionIndex] || { items: [] };
            const nextItems = [...(section.items || []), { id: `item_${Date.now()}`, title: '', description: '' }];
            updated[sectionIndex] = { ...section, items: nextItems };
            return { ...prev, customSections: updated };
        });
    };
    const updateCustomSectionItem = (sectionIndex, itemIndex, field, value) => {
        const rawVal = (value && typeof value === 'object' && value.target !== undefined) ? value.target.value : value;
        setProfile((prev) => {
            const updated = [...(prev.customSections || [])];
            const section = updated[sectionIndex];
            if (!section) return prev;
            const items = [...(section.items || [])];
            items[itemIndex] = { ...items[itemIndex], [field]: rawVal };
            updated[sectionIndex] = { ...section, items };
            return { ...prev, customSections: updated };
        });
    };
    const removeCustomSectionItem = (sectionIndex, itemIndex) => {
        setProfile((prev) => {
            const updated = [...(prev.customSections || [])];
            const section = updated[sectionIndex];
            if (!section) return prev;
            const items = (section.items || []).filter((_, i) => i !== itemIndex);
            updated[sectionIndex] = { ...section, items };
            return { ...prev, customSections: updated };
        });
    };

    // Drag & Drop Avatar
    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processImageFile(e.dataTransfer.files[0]);
        }
    };
    const handleImageUpload = (e) => {
        if (e.target.files && e.target.files[0]) processImageFile(e.target.files[0]);
    };
    const processImageFile = (imageFile) => {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(imageFile?.type)) { triggerNotification('Avatar must be a PNG, JPEG, or WebP image.', 'error'); return; }
        if (imageFile.size > 5 * 1024 * 1024) { triggerNotification('Avatar must be 5 MB or smaller.', 'error'); return; }
        const reader = new FileReader();
        reader.onerror = () => triggerNotification('Unable to read that image. Try another file.', 'error');
        reader.onloadend = () => setCropModalSrc(reader.result);
        reader.readAsDataURL(imageFile);
    };
    const handleCroppedImage = async (croppedDataUrl) => {
        setCropModalSrc(null);
        const currentUser = fire.auth().currentUser;
        if (!currentUser) { triggerNotification('Sign in again before uploading an avatar.', 'error'); return; }
        if (profileConflictRef.current) { triggerNotification('Resolve the newer profile revision before replacing the avatar.', 'error'); return; }
        setProfileSaveState('saving');
        const avatarOnly = { ...profileRef.current, selectedImage: croppedDataUrl };
        const result = await saveProfile(currentUser.uid, avatarOnly, Number.isSafeInteger(Number(profileRef.current?.revision)) ? Number(profileRef.current.revision) : 0);
        if (!result.success) {
            setProfileSaveState(result.code === 'PROFILE_CONFLICT' ? 'conflict' : 'failed');
            if (result.code === 'PROFILE_CONFLICT') setProfileConflict({ remoteRevision: result.remoteRevision });
            triggerNotification(result.error || 'Avatar upload failed.', 'error');
            return;
        }
        skipNextAutosaveRef.current = true;
        setProfile(prev => ({ ...prev, selectedImage: result.profile.selectedImage, revision: result.revision }));
        setProfileSaveState('saved');
        triggerNotification('Avatar updated successfully.');
    };

    const getPasswordStrength = (password) => {
        if (!password) return { strength: '', width: 'w-0', color: 'bg-slate-200', text: '' };
        if (password.length < 6) return { strength: 'weak', width: 'w-1/4', color: 'bg-red-500', text: 'Weak' };
        if (password.length < 8) return { strength: 'fair', width: 'w-2/4', color: 'bg-amber-500', text: 'Fair' };
        if (password.length < 10) return { strength: 'good', width: 'w-3/4', color: 'bg-indigo-500', text: 'Good' };
        return { strength: 'strong', width: 'w-full', color: 'bg-emerald-500', text: 'Strong' };
    };

    getPasswordStrength(accountSettings.password);
    const candidateFullName = `${profile.firstname} ${profile.lastname}`.trim() || profile.name;
    const effectiveMembership = databaseAccountSettings.membership || 'Basic';

    return (
        <>
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
            <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 pb-8 sm:pb-12">

                {/* Hero Master Profile Overview Card — Styled after StepShell Header */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs relative overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        {/* Left Avatar & Right Details Container */}
                        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                            {/* Left Column: Avatar Image + Badge Underneath */}
                            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                                <div className="relative">
                                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-gradient-to-br from-indigo-50 to-purple-50 border border-slate-200 shadow-2xs flex items-center justify-center">
                                        {normalizeProfileImage(profile.selectedImage) ? (
                                            <img src={normalizeProfileImage(profile.selectedImage)} alt="Profile avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white font-bold text-lg">
                                                {candidateFullName ? candidateFullName.charAt(0).toUpperCase() : 'U'}
                                            </div>
                                        )}
                                    </div>
                                    {fire.auth().currentUser?.emailVerified && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center shadow-2xs" title="Email verified" aria-label="Email verified">
                                        <FaCheck className="w-2 h-2 text-white" />
                                    </div>}
                                </div>

                                {/* Membership Badge — directly UNDER avatar image */}
                                <span className="px-2 py-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 rounded-md flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    {effectiveMembership}
                                </span>
                            </div>

                            {/* Right Column: Name, Occupation, Email & Profile Strength Badge */}
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 break-words">
                                        {candidateFullName || 'Master User Profile'}
                                    </h1>
                                    {(() => {
                                        let score = 0;
                                        if (profile.firstname || profile.lastname) score += 15;
                                        if (profile.email) score += 10;
                                        if (profile.phone) score += 10;
                                        if (profile.occupation) score += 15;
                                        if (profile.city || profile.country) score += 10;
                                        if (profile.summary && profile.summary.trim().length > 20) score += 15;
                                        if (profile.workExperiences && profile.workExperiences.length > 0) score += 10;
                                        if (profile.education && profile.education.length > 0) score += 5;
                                        if (profile.skills && profile.skills.length >= 3) score += 10;
                                        const compScore = Math.min(100, score);
                                        return (
                                            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold text-emerald-700">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                <span>{compScore}% Profile Strength</span>
                                            </span>
                                        );
                                    })()}
                                </div>
                                {profile.occupation && (
                                    <p className="text-xs font-semibold text-indigo-600 mt-0.5 truncate">
                                        {profile.occupation}
                                    </p>
                                )}
                                {profile.email && (
                                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                                        {profile.email}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Right Action Cluster: Segmented Switcher + Expand View Toggle */}
                        <div className="flex items-center gap-2 self-stretch md:self-center flex-shrink-0">
                            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 flex-1 md:flex-initial">
                                <button
                                    type="button"
                                    onClick={() => { setSelectedSettings('Profile'); navigate('?tab=Profile', { replace: true }); }}
                                    className={`flex-1 md:flex-initial px-3 sm:px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                                        selectedSettings === 'Profile'
                                            ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                                    }`}>
                                    <FaUser className="w-3 h-3 flex-shrink-0" />
                                    <span>Master Profile</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedSettings('Account'); navigate('?tab=Account', { replace: true }); }}
                                    className={`flex-1 md:flex-initial px-3 sm:px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                                        selectedSettings === 'Account'
                                            ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                                    }`}>
                                    <FaCog className="w-3 h-3 flex-shrink-0" />
                                    <span>Account &amp; Security</span>
                                </button>
                            </div>

                            {selectedSettings === 'Profile' && (
                                <button
                                    type="button"
                                    onClick={() => setShowProfileGuidanceRail(prev => !prev)}
                                    className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-all cursor-pointer"
                                    title={showProfileGuidanceRail ? 'Expand view (hide copilot rail)' : 'Show copilot guidance rail'}
                                >
                                    <span>{showProfileGuidanceRail ? 'Expand View' : 'Show Guidance'}</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {selectedSettings === 'Profile' && (
                    <div className={`rounded-xl border px-3.5 py-2.5 text-xs ${profileSaveState === 'failed' || profileSaveState === 'conflict' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-600 shadow-2xs'}`} aria-live="polite">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${profileSaveState === 'saved' ? 'bg-emerald-500' : profileSaveState === 'saving' || profileSaveState === 'pending' ? 'bg-indigo-500 animate-pulse' : profileSaveState === 'failed' || profileSaveState === 'conflict' ? 'bg-amber-500' : 'bg-slate-400'}`}></span>
                                <span><strong>Profile save:</strong> {profileSaveState === 'saving' ? 'Saving…' : profileSaveState === 'pending' ? 'Pending autosave' : profileSaveState === 'saved' ? 'Saved' : profileSaveState === 'conflict' ? 'Conflict—action required' : profileSaveState === 'failed' ? 'Failed—retry with Save' : 'Loading…'}</span>
                            </div>
                            {profileSaveState === 'failed' && (
                                <button
                                    type="button"
                                    onClick={() => persistProfileRef.current?.({ notify: true })}
                                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg bg-amber-800 hover:bg-amber-900 text-white shadow-xs transition"
                                >
                                    Retry Save
                                </button>
                            )}
                        </div>
                        {profileConflict && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                <button type="button" onClick={reloadProfileConflict} className="rounded border border-amber-400 bg-white px-3 py-1 text-xs font-semibold">Discard local changes and load latest</button>
                                <button type="button" onClick={overwriteProfileConflict} className="rounded bg-amber-800 px-3 py-1 text-xs font-semibold text-white">Overwrite latest with local profile</button>
                            </div>
                        )}
                    </div>
                )}

                {/* Inline Toast Banner */}
                {toastState && (
                    <div role={toastState.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in duration-200 ${
                        toastState.type === 'error' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    }`}>
                        <div className="flex items-center gap-2">
                            {toastState.type === 'error' ? <FaExclamationTriangle className="w-4 h-4 text-red-600" /> : <FaCheckCircle className="w-4 h-4 text-emerald-600" />}
                            <span>{toastState.msg}</span>
                        </div>
                    </div>
                )}

                {/* Main Content Area */}
                {selectedSettings === 'Profile' ? (
                    <div className="space-y-5">

                        {/* Horizontal Step Navigation Ribbon (Sticky with Backdrop Blur & Autosave) */}
                        <nav aria-label="Master Profile Steps Stepper" className="step-nav-ribbon step-nav sticky top-0 sm:top-2 z-30 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl pl-14 sm:pl-4 pr-3 sm:pr-4 py-2 sm:py-2.5 flex items-center justify-between gap-2 shadow-xs transition-all">
                            {/* Scroll Left Button */}
                            <button
                                type="button"
                                onClick={() => scrollSubTabs('left')}
                                className="hidden sm:flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 transition-colors shrink-0 cursor-pointer"
                                aria-label="Scroll steps left"
                                title="Scroll left"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>

                            {/* Horizontal Steps Container */}
                            <div ref={subTabsRef} className="flex items-center gap-1.5 overflow-x-auto scroll-smooth no-scrollbar py-0.5 min-w-0 flex-1">
                                {SUB_TAB_ORDER.map((tabKey, index) => {
                                    const conf = SUBTAB_CONFIG[tabKey] || SUBTAB_CONFIG.basic;
                                    const isActive = profileSubTab === tabKey;
                                    const isCompleted = conf.isComplete(profile);
                                    const count = conf.getCount ? conf.getCount(profile) : undefined;

                                    return (
                                        <button
                                            key={tabKey}
                                            type="button"
                                            onClick={() => setProfileSubTab(tabKey)}
                                            className={`step-nav-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                                                isActive
                                                    ? 'bg-indigo-600 text-white shadow-2xs ring-2 ring-indigo-500/25 font-bold'
                                                    : isCompleted
                                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 hover:bg-emerald-100 font-semibold'
                                                    : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                                            }`}
                                            aria-current={isActive ? 'step' : undefined}
                                            title={`${conf.name} (${isCompleted ? 'Completed' : 'Pending'})`}
                                        >
                                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                                isActive
                                                    ? 'bg-white text-indigo-700'
                                                    : isCompleted
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-slate-200 text-slate-600'
                                            }`}>
                                                {isCompleted ? '✓' : index + 1}
                                            </span>
                                            <span>{conf.name}</span>
                                            {count !== undefined && count !== 0 && (
                                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                                    isActive
                                                        ? 'bg-indigo-700 text-white'
                                                        : isCompleted
                                                        ? 'bg-emerald-200/80 text-emerald-900'
                                                        : 'bg-slate-200 text-slate-600'
                                                }`}>
                                                    {count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Scroll Right Button */}
                            <button
                                type="button"
                                onClick={() => scrollSubTabs('right')}
                                className="hidden sm:flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 transition-colors shrink-0 cursor-pointer"
                                aria-label="Scroll steps right"
                                title="Scroll right"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>

                            {/* Consolidated Sticky Status & Progress Pill */}
                            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 shrink-0 text-xs">
                                {/* Live Autosave Status Indicator */}
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600" title={`Profile Save: ${profileSaveState}`}>
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                                        profileSaveState === 'saved'
                                            ? 'bg-emerald-500'
                                            : profileSaveState === 'saving' || profileSaveState === 'pending'
                                            ? 'bg-indigo-500 animate-pulse'
                                            : profileSaveState === 'failed' || profileSaveState === 'conflict'
                                            ? 'bg-amber-500'
                                            : 'bg-slate-400'
                                    }`}></span>
                                    <span className="hidden sm:inline font-semibold">
                                        {profileSaveState === 'saving'
                                            ? 'Saving…'
                                            : profileSaveState === 'pending'
                                            ? 'Pending…'
                                            : profileSaveState === 'saved'
                                            ? 'Saved'
                                            : profileSaveState === 'conflict'
                                            ? 'Conflict'
                                            : profileSaveState === 'failed'
                                            ? 'Failed'
                                            : 'Loading…'}
                                    </span>
                                </span>

                                {profileSaveState === 'failed' && (
                                    <button
                                        type="button"
                                        onClick={() => persistProfileRef.current?.({ notify: true })}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-800 hover:bg-amber-900 text-white shadow-xs transition cursor-pointer shrink-0"
                                        title="Retry saving profile"
                                    >
                                        Retry
                                    </button>
                                )}

                                {/* Completion Counter */}
                                <span className="hidden md:inline text-slate-300">·</span>
                                <div className="hidden md:flex items-center gap-1.5 font-semibold text-slate-600">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                                    <span>{SUB_TAB_ORDER.filter(k => SUBTAB_CONFIG[k]?.isComplete(profile)).length} of 12</span>
                                </div>
                                <span className="hidden lg:inline text-slate-300">·</span>
                                <span className="hidden lg:inline font-bold text-indigo-600">
                                    {Math.min(100, Math.round((SUB_TAB_ORDER.filter(k => SUBTAB_CONFIG[k]?.isComplete(profile)).length / SUB_TAB_ORDER.length) * 100))}%
                                </span>
                            </div>
                        </nav>

                        {/* 2-Column Responsive Workspace Grid */}
                        <div className={`grid grid-cols-1 ${showProfileGuidanceRail ? 'lg:grid-cols-12' : ''} gap-5 items-start`}>
                            {/* Left Column: Form & StepShell */}
                            <div className={`${showProfileGuidanceRail ? 'lg:col-span-8 xl:col-span-9' : 'w-full'} min-w-0 space-y-4`}>
                                
                                {/* StepShell Header Card (Identical to Build Resume) */}
                                {(() => {
                                    const activeConf = SUBTAB_CONFIG[profileSubTab] || SUBTAB_CONFIG.basic;
                                    const stepIdx = SUB_TAB_ORDER.indexOf(profileSubTab);
                                    const isComp = activeConf.isComplete(profile);
                                    const badgeText = typeof activeConf.statusBadge === 'function' ? activeConf.statusBadge(profile) : activeConf.statusBadge;

                                    return (
                                        <header className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 sm:px-5 shadow-2xs">
                                            <div className="flex items-center justify-between gap-3 min-w-0">
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <div
                                                        className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg text-xs sm:text-sm font-bold ${
                                                            isComp ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'
                                                        }`}
                                                        aria-label={`Step ${stepIdx + 1} of 12`}
                                                    >
                                                        {isComp ? <FaCheck className="w-3.5 h-3.5" /> : stepIdx + 1}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h1 className="text-sm sm:text-base font-bold tracking-tight text-slate-900">{activeConf.title}</h1>
                                                            {badgeText ? (
                                                                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                                                    {badgeText}
                                                                </span>
                                                            ) : null}
                                                            <span
                                                                className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                                                                    isComp
                                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                        : 'border-amber-200 bg-amber-50 text-amber-700'
                                                                }`}
                                                            >
                                                                {isComp ? 'Complete' : 'In progress'}
                                                            </span>
                                                        </div>
                                                        {activeConf.subtitle ? (
                                                            <p className="mt-0.5 text-xs leading-relaxed text-slate-500 max-w-2xl">{activeConf.subtitle}</p>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowProfileGuidanceRail(prev => !prev)}
                                                        className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                                                        title={showProfileGuidanceRail ? 'Collapse Guide' : 'Expand Guide'}
                                                    >
                                                        <span>{showProfileGuidanceRail ? 'Hide Guide' : 'Show Guide'}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </header>
                                    );
                                })()}

                                {/* Subtab Form Card */}
                                <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-5">

                        {/* Sub-Tab 1: Basic Details & Social Links — Styled after HeadingStep */}
                        {profileSubTab === 'basic' && (
                            <div className="space-y-5">
                                {/* Identity: Photo Upload + Name & Title */}
                                <div className="space-y-3">
                                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-start">
                                        {/* Photo Upload Area - Compact, matching HeadingStep */}
                                        <div className="shrink-0 pt-0.5 self-center sm:self-start">
                                            <div className="space-y-1.5">
                                                <label className="block text-[13px] font-semibold text-slate-700">
                                                    Profile Photo
                                                </label>
                                                <div
                                                    className={`w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-2 overflow-hidden relative group transition-all duration-200 flex items-center justify-center ${
                                                        isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 bg-slate-50 shadow-2xs hover:border-slate-300'
                                                    }`}
                                                    onDragOver={handleDragOver}
                                                    onDragLeave={handleDragLeave}
                                                    onDrop={handleDrop}>
                                                    {profile.selectedImage ? (
                                                        <>
                                                            <img src={profile.selectedImage} alt="Avatar" className="w-full h-full object-cover" />
                                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl flex items-center justify-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCropModalSrc(profile.selectedImage)}
                                                                    className="p-1.5 bg-white rounded-full hover:bg-slate-100 transition-all text-indigo-600 shadow-xs"
                                                                    title="Crop & Adjust Photo">
                                                                    <FaCrop className="w-3 h-3" />
                                                                </button>
                                                                <label className="p-1.5 bg-white rounded-full hover:bg-slate-100 transition-all text-slate-700 shadow-xs cursor-pointer" title="Change photo">
                                                                    <input type="file" onChange={handleImageUpload} className="sr-only" accept="image/png,image/jpeg,image/webp" />
                                                                    <FaUpload className="w-3 h-3" />
                                                                </label>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <label className="w-full h-full flex flex-col items-center justify-center p-2 text-center cursor-pointer hover:bg-indigo-50/50 transition-colors">
                                                            <input type="file" onChange={handleImageUpload} className="sr-only" accept="image/png,image/jpeg,image/webp" />
                                                            <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm mb-1">
                                                                {candidateFullName ? candidateFullName.charAt(0).toUpperCase() : <FaUpload className="w-3.5 h-3.5 text-slate-400" />}
                                                            </div>
                                                            <span className="text-[10px] font-bold text-indigo-600">Upload</span>
                                                            <span className="text-[9px] text-slate-400">{isDragging ? 'Drop here' : 'PNG, JPG'}</span>
                                                        </label>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Name & Target Occupation */}
                                        <div className="flex-1 min-w-0 w-full space-y-3">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="mb-1.5 flex items-baseline gap-1.5 text-[13px] font-semibold text-slate-700">
                                                        <span>First Name</span>
                                                        <span aria-hidden="true" className="text-rose-500 font-medium">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        name="firstname"
                                                        value={profile.firstname}
                                                        onChange={handleInputChange}
                                                        placeholder="Your first name"
                                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs transition-colors placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 font-normal"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="mb-1.5 flex items-baseline gap-1.5 text-[13px] font-semibold text-slate-700">
                                                        <span>Last Name</span>
                                                        <span aria-hidden="true" className="text-rose-500 font-medium">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        name="lastname"
                                                        value={profile.lastname}
                                                        onChange={handleInputChange}
                                                        placeholder="Your last name"
                                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs transition-colors placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 font-normal"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <AutocompleteInputField
                                                    label="Target Professional Title / Occupation"
                                                    name="occupation"
                                                    value={profile.occupation}
                                                    onChange={handleInputChange}
                                                    placeholder="e.g. Senior Full Stack Engineer"
                                                    suggestionType="jobTitle"
                                                    inputClassName="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs transition-colors placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 font-normal"
                                                    labelClassName="mb-1.5 flex items-baseline gap-1.5 text-[13px] font-semibold text-slate-700"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Contact & Location */}
                                <div className="space-y-3 border-t border-slate-100 pt-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <div className="mb-1.5 flex items-baseline justify-between gap-1.5">
                                                <label className="text-[13px] font-semibold text-slate-700">
                                                    <span>Email Address (Identity)</span>
                                                    <span aria-hidden="true" className="text-rose-500 font-medium ml-1">*</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => { setSelectedSettings('Account'); navigate('?tab=Account', { replace: true }); }}
                                                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer flex items-center gap-1"
                                                    title="Switch to Account & Security to update primary email"
                                                >
                                                    <span>Managed in Account</span>
                                                    <span aria-hidden="true">→</span>
                                                </button>
                                            </div>
                                            <input
                                                type="email"
                                                name="email"
                                                value={fire.auth().currentUser?.email || profile.email || ''}
                                                readOnly
                                                disabled
                                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 shadow-2xs cursor-not-allowed select-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 flex items-baseline gap-1.5 text-[13px] font-semibold text-slate-700">
                                                <span>Phone Number</span>
                                                <span aria-hidden="true" className="text-rose-500 font-medium">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="phone"
                                                value={profile.phone}
                                                onChange={handleInputChange}
                                                placeholder="With country code, e.g. +91 98765 43210"
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs transition-colors placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 font-normal"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <AutocompleteInputField
                                                label="City & State"
                                                name="city"
                                                value={profile.city}
                                                onChange={(e) => handleInputChange({ target: { name: 'city', value: e.target.value } })}
                                                onSelect={(val) => handleInputChange({ target: { name: 'city', value: val } })}
                                                placeholder="City, State"
                                                suggestionType="city"
                                                inputClassName="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs transition-colors placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 font-normal"
                                                labelClassName="mb-1.5 flex items-baseline gap-1.5 text-[13px] font-semibold text-slate-700"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 flex items-baseline gap-1.5 text-[13px] font-semibold text-slate-700">
                                                <span>Country</span>
                                                <span className="text-[11px] font-medium text-slate-400">optional</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="country"
                                                value={profile.country}
                                                onChange={handleInputChange}
                                                placeholder="Country (e.g. India)"
                                                spellCheck="false"
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs transition-colors placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 font-normal"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Online Presence & Address */}
                                <div className="space-y-3 border-t border-slate-100 pt-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="mb-1.5 flex items-baseline gap-1.5 text-[13px] font-semibold text-slate-700">
                                                <span>Street Address</span>
                                                <span className="text-[11px] font-medium text-slate-400">optional</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="address"
                                                value={profile.address}
                                                onChange={handleInputChange}
                                                placeholder="Street address"
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs transition-colors placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 font-normal"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 flex items-baseline gap-1.5 text-[13px] font-semibold text-slate-700">
                                                <span>Postal Code</span>
                                                <span className="text-[11px] font-medium text-slate-400">optional</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="postalCode"
                                                value={profile.postalCode}
                                                onChange={handleInputChange}
                                                placeholder="PIN / postal code"
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs transition-colors placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 font-normal"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                                                <FaLinkedin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                                <span>LinkedIn Profile URL</span>
                                                <span className="text-[11px] font-medium text-slate-400">optional</span>
                                            </label>
                                            <input
                                                type="url"
                                                name="linkedinUrl"
                                                value={profile.linkedinUrl}
                                                onChange={handleInputChange}
                                                placeholder="https://linkedin.com/in/username"
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs transition-colors placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 font-normal"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                                                <FaGithub className="w-3.5 h-3.5 text-slate-800 shrink-0" />
                                                <span>GitHub / Portfolio URL</span>
                                                <span className="text-[11px] font-medium text-slate-400">optional</span>
                                            </label>
                                            <input
                                                type="url"
                                                name="githubUrl"
                                                value={profile.githubUrl}
                                                onChange={handleInputChange}
                                                placeholder="https://github.com/username"
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs transition-colors placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 font-normal"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                                            <FaGlobe className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                            <span>Personal Website / Portfolio URL</span>
                                            <span className="text-[11px] font-medium text-slate-400">optional</span>
                                        </label>
                                        <input
                                            type="url"
                                            name="websiteUrl"
                                            value={profile.websiteUrl}
                                            onChange={handleInputChange}
                                            placeholder="https://yourwebsite.com"
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs transition-colors placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 font-normal"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Sub-Tab 2: Professional Bio / source-grounded summary rewrite */}
                        {profileSubTab === 'summary' && (
                            <div className="space-y-4">
                                <div className="flex flex-col gap-3">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 tracking-tight">Executive Bio &amp; Professional Summary</h3>
                                        <p className="text-xs text-slate-500">Auto-loaded into all new resumes and AI cover letters.</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                                        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1 shrink-0">Tone:</span>
                                            {['balanced', 'concise', 'technical', 'executive'].map((toneKey) => (
                                                <button
                                                    key={toneKey}
                                                    type="button"
                                                    onClick={() => setSummaryTone(toneKey)}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition-all whitespace-nowrap shrink-0 ${
                                                        summaryTone === toneKey
                                                            ? 'bg-indigo-600 text-white shadow-2xs'
                                                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                                                    }`}>
                                                    {toneKey.replace('-', ' ')}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleWriteAiSummary}
                                            disabled={isAiGenerating}
                                            className="w-full sm:w-auto whitespace-nowrap px-4 py-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-2 shrink-0">
                                            <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                            <span>{isAiGenerating ? 'Generating Bio...' : 'Generate Executive Bio (AI)'}</span>
                                        </button>
                                    </div>
                                </div>
                                <textarea
                                    name="summary"
                                    value={profile.summary}
                                    onChange={handleInputChange}
                                    spellCheck="true"
                                    placeholder="Enter factual profile details, then optionally ask AI to rewrite them without adding claims."
                                    className="w-full h-52 text-sm p-3.5 bg-white border border-slate-200 rounded-lg font-sans leading-relaxed text-slate-900 shadow-2xs focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 focus:outline-none"
                                />
                            </div>
                        )}

                        {/* Sub-Tab 3: Work History Array */}
                        {profileSubTab === 'experience' && (
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Work History & Past Positions</h3>
                                        <p className="text-xs text-slate-500">Add past employment details to pre-populate all future resumes automatically.</p>
                                    </div>
                                    <button type="button" onClick={addWorkExperience} className="w-full sm:w-auto whitespace-nowrap flex-shrink-0 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs">
                                        <FaPlus className="w-3 h-3" /> Add Position
                                    </button>
                                </div>

                                {profile.workExperiences.length === 0 ? (
                                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                                        <p className="text-xs font-semibold text-slate-700 mb-1">No work history saved in Master Profile</p>
                                        <p className="text-[11px] text-slate-500 mb-4">Click "Add Position" above or sync LinkedIn to store your experience once for all resumes.</p>
                                    </div>
                                ) : (
                                    profile.workExperiences.map((job, idx) => (
                                        <div key={job.id || idx} className="p-5 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-4">
                                            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                                    Position #{idx + 1}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        disabled={idx === 0}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('workExperiences', idx, -1); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-500 rounded-lg hover:bg-slate-200/70 transition-all cursor-pointer text-xs font-bold"
                                                        title="Move position up">
                                                        ▲
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={idx === profile.workExperiences.length - 1}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('workExperiences', idx, 1); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-500 rounded-lg hover:bg-slate-200/70 transition-all cursor-pointer text-xs font-bold"
                                                        title="Move position down">
                                                        ▼
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); duplicateWorkExperience(idx); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 cursor-pointer ml-1"
                                                        title="Duplicate position">
                                                        <FaCopy className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeWorkExperience(idx); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 cursor-pointer ml-1"
                                                        title="Delete position">
                                                        <FaTrash className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            {/* Row 1: Primary Details */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div className="pr-8 sm:pr-0">
                                                    <AutocompleteInputField
                                                        label="Job Title"
                                                        name="jobTitle"
                                                        value={job.jobTitle}
                                                        onChange={(e) => updateWorkExperience(idx, 'jobTitle', e.target.value)}
                                                        placeholder="e.g. Senior Developer"
                                                        suggestionType="jobTitle"
                                                        inputClassName="w-full text-xs p-2.5 pr-8 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                        labelClassName="block text-[11px] font-bold text-slate-700 mb-1"
                                                    />
                                                </div>
                                                <div>
                                                    <AutocompleteInputField
                                                        label="Company Name"
                                                        name="company"
                                                        value={job.company}
                                                        onChange={(e) => updateWorkExperience(idx, 'company', e.target.value)}
                                                        placeholder="e.g. TechCorp"
                                                        suggestionType="company"
                                                        inputClassName="w-full text-xs p-2.5 pr-8 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                        labelClassName="block text-[11px] font-bold text-slate-700 mb-1"
                                                    />
                                                </div>
                                                <div className="sm:pr-8">
                                                    <AutocompleteInputField
                                                        label="City / Location"
                                                        name="city"
                                                        value={job.city || ''}
                                                        onChange={(e) => updateWorkExperience(idx, 'city', e.target.value)}
                                                        onSelect={(val) => updateWorkExperience(idx, 'city', val)}
                                                        placeholder="e.g. Visakhapatnam, India"
                                                        suggestionType="city"
                                                        inputClassName="w-full text-xs p-2.5 pr-8 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                        labelClassName="block text-[11px] font-bold text-slate-700 mb-1"
                                                    />
                                                </div>
                                            </div>

                                            {/* Row 2: Duration Dates */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                                                <div>
                                                    <MonthYearPicker
                                                        label="Start Date"
                                                        value={job.startDate}
                                                        onChange={(val) => updateWorkExperience(idx, 'startDate', val)}
                                                    />
                                                </div>
                                                <div>
                                                    <MonthYearPicker
                                                        label="End Date"
                                                        value={job.endDate || (job.startDate && job.startDate.includes('Present') ? 'Present' : '')}
                                                        onChange={(val) => updateWorkExperience(idx, 'endDate', val)}
                                                        showPresentCheck
                                                        isCurrent={job.current || job.endDate === 'Present'}
                                                        onCurrentChange={(isCur) => {
                                                            updateWorkExperience(idx, 'current', isCur);
                                                            if (isCur) updateWorkExperience(idx, 'endDate', 'Present');
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="block text-xs font-bold text-slate-800">Responsibilities &amp; Accomplishments</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEnhanceWorkDescriptionWithAi(idx)}
                                                        disabled={isAiGenerating || !job.jobTitle}
                                                        className="px-2.5 py-1 text-[11px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-all flex items-center gap-1 shadow-2xs cursor-pointer disabled:opacity-50">
                                                        <FaMagic className={`w-3 h-3 text-purple-600 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                                        <span>Enhance Bullets (AI)</span>
                                                    </button>
                                                </div>
                                                <BulletPointsEditor
                                                    value={job.description}
                                                    onChange={(val) => updateWorkExperience(idx, 'description', val)}
                                                    jobTitle={job.jobTitle}
                                                    company={job.company}
                                                    location={job.location}
                                                    placeholder={getRolePlaceholder(job.jobTitle)}
                                                />
                                            </div>
                                        </div>
                                    ))
                                )}

                                {profile.workExperiences.length > 0 && (
                                    <div className="pt-2">
                                        <button type="button" onClick={addWorkExperience} className="w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs">
                                            <FaPlus className="w-3.5 h-3.5" /> Add Position
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sub-Tab 4: Education Array */}
                        {profileSubTab === 'education' && (
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Education & Academic Degrees</h3>
                                        <p className="text-xs text-slate-500">Save degrees to automatically populate education sections in resumes.</p>
                                    </div>
                                    <button type="button" onClick={addEducation} className="w-full sm:w-auto whitespace-nowrap flex-shrink-0 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs">
                                        <FaPlus className="w-3 h-3" /> Add Degree
                                    </button>
                                </div>

                                {profile.education.length === 0 ? (
                                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                                        <p className="text-xs font-semibold text-slate-700 mb-1">No education entries saved in Master Profile</p>
                                        <p className="text-[11px] text-slate-500">Click "Add Degree" to save your educational background.</p>
                                    </div>
                                ) : (
                                    profile.education.map((edu, idx) => (
                                        <div key={edu.id || idx} className="p-5 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-4">
                                            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                                    Degree #{idx + 1}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        disabled={idx === 0}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('education', idx, -1); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-500 rounded-lg hover:bg-slate-200/70 transition-all cursor-pointer text-xs font-bold"
                                                        title="Move degree up">
                                                        ▲
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={idx === profile.education.length - 1}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('education', idx, 1); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-500 rounded-lg hover:bg-slate-200/70 transition-all cursor-pointer text-xs font-bold"
                                                        title="Move degree down">
                                                        ▼
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeEducation(idx); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 cursor-pointer ml-1"
                                                        title="Delete education degree">
                                                        <FaTrash className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div className="pr-8 sm:pr-0">
                                                    <AutocompleteInputField
                                                        label="Degree / Qualification"
                                                        name="degree"
                                                        value={edu.degree}
                                                        onChange={(e) => updateEducation(idx, 'degree', e.target.value)}
                                                        placeholder="e.g. B.S. Computer Science"
                                                        suggestionType="degree"
                                                        inputClassName="w-full text-xs p-2.5 pr-8 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                        labelClassName="block text-[11px] font-bold text-slate-700 mb-1"
                                                    />
                                                </div>
                                                <div>
                                                    <AutocompleteInputField
                                                        label="University / School"
                                                        name="school"
                                                        value={edu.school}
                                                        onChange={(e) => updateEducation(idx, 'school', e.target.value)}
                                                        placeholder="e.g. Stanford University"
                                                        suggestionType="school"
                                                        inputClassName="w-full text-xs p-2.5 pr-8 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                        labelClassName="block text-[11px] font-bold text-slate-700 mb-1"
                                                    />
                                                </div>
                                                <div className="sm:pr-8">
                                                    <MonthYearPicker
                                                        label="Graduation Date / Period"
                                                        value={edu.startDate || edu.endDate || ''}
                                                        onChange={(val) => updateEducation(idx, 'startDate', val)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <AutocompleteInputField
                                                        label="City / Location"
                                                        name={`edu_city_${idx}`}
                                                        value={edu.city || ''}
                                                        onChange={(e) => updateEducation(idx, 'city', e.target.value)}
                                                        onSelect={(val) => updateEducation(idx, 'city', val)}
                                                        placeholder="e.g. Cambridge, MA"
                                                        suggestionType="city"
                                                        inputClassName="w-full text-xs p-2.5 pr-8 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                        labelClassName="block text-[11px] font-bold text-slate-700 mb-1"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-slate-700 mb-1">GPA / Academic Honors (Optional)</label>
                                                    <input
                                                        type="text"
                                                        value={edu.grade || edu.gpa || ''}
                                                        onChange={(e) => updateEducation(idx, 'grade', e.target.value)}
                                                        placeholder="e.g. 3.9/4.0 GPA, Summa Cum Laude"
                                                        className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}

                                {profile.education.length > 0 && (
                                    <div className="pt-2">
                                        <button type="button" onClick={addEducation} className="w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs">
                                            <FaPlus className="w-3.5 h-3.5" /> Add Degree
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sub-Tab 5: Skills */}
                        {profileSubTab === 'skills' && (
                            <div className="space-y-5">
                                {/* Header & Actions Toolbar (Row 1: Title & Primary Actions | Row 2: Search & View Utilities) */}
                                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5">
                                    {/* Row 1: Title, Counter Badge & Primary Creation Actions */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                <h3 className="text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap">
                                                    Skills & Technical Competencies
                                                </h3>
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100/80 whitespace-nowrap shrink-0">
                                                    {profile.skills.length} {profile.skills.length === 1 ? 'Skill' : 'Skills'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Save core technical competencies and soft skills parsed by ATS screening engines.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                                            {/* Auto-Recommend Skills */}
                                            <button
                                                type="button"
                                                onClick={handleRecommendAiSkills}
                                                disabled={isAiGenerating}
                                                className="whitespace-nowrap px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer shrink-0">
                                                <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                                <span>Auto-Recommend (AI)</span>
                                            </button>

                                            {/* Add Single Skill */}
                                            <button
                                                type="button"
                                                onClick={addSkill}
                                                className="whitespace-nowrap px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0">
                                                <FaPlus className="w-3 h-3" /> Add Skill
                                            </button>
                                        </div>
                                    </div>

                                    {/* Row 2: Search Filter + View & Utility Controls */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                        {/* Search / Filter Input */}
                                        <div className="relative flex-1 max-w-md">
                                            <FaSearch className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                            <input
                                                type="text"
                                                value={skillsSearchQuery}
                                                onChange={(e) => setSkillsSearchQuery(e.target.value)}
                                                placeholder={profile.skills.length > 0 ? `Search across ${profile.skills.length} skills...` : "Filter skills..."}
                                                className="w-full text-xs pl-9 pr-8 py-2 bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-200/90 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                            />
                                            {skillsSearchQuery && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSkillsSearchQuery('')}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                                    title="Clear search">
                                                    <FaTimes className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>

                                        {/* View & Utility Controls */}
                                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                                            {/* Quick Bulk Paste Toggle */}
                                            <button
                                                type="button"
                                                onClick={() => setShowBulkSkills(prev => !prev)}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border cursor-pointer ${
                                                    showBulkSkills || bulkSkillsInput.trim()
                                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-2xs font-bold'
                                                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                                                }`}
                                                title="Toggle quick bulk paste ingestion">
                                                <FaBolt className={`w-3 h-3 ${showBulkSkills || bulkSkillsInput.trim() ? 'text-indigo-600' : 'text-amber-500'}`} />
                                                <span>Bulk Paste</span>
                                                {showBulkSkills ? <FaChevronUp className="w-2.5 h-2.5 opacity-60" /> : <FaChevronDown className="w-2.5 h-2.5 opacity-60" />}
                                            </button>

                                            {/* View Mode Switcher */}
                                            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80">
                                                <button
                                                    type="button"
                                                    onClick={() => setSkillsViewMode('grid')}
                                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                                        skillsViewMode === 'grid'
                                                            ? 'bg-white text-indigo-700 shadow-2xs'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                    title="Cards View (Detailed view with proficiency controls)">
                                                    <FaThLarge className="w-3 h-3" />
                                                    <span>Cards</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSkillsViewMode('compact')}
                                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                                        skillsViewMode === 'compact'
                                                            ? 'bg-white text-indigo-700 shadow-2xs'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                    title="Compact Tags View (High-density overview of all skills)">
                                                    <FaTags className="w-3 h-3" />
                                                    <span>Tags</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Collapsible Bulk Skills Ingestion Drawer */}
                                {(showBulkSkills || bulkSkillsInput.trim()) && (
                                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 transition-all">
                                        <div className="flex items-center justify-between">
                                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                                <span>⚡ Quick Bulk Paste Ingestion</span>
                                                <span className="text-[10px] text-slate-500 font-normal lowercase">(comma, semicolon, or newline separated)</span>
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setShowBulkSkills(false)}
                                                className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer">
                                                Hide
                                            </button>
                                        </div>
                                        <div className="flex gap-2">
                                            <textarea
                                                value={bulkSkillsInput}
                                                onChange={(e) => setBulkSkillsInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                                        e.preventDefault();
                                                        handleBulkSkillAdd();
                                                    }
                                                }}
                                                placeholder="Paste multiple skills at once (e.g. React.js, TypeScript, Node.js, Docker, Kubernetes, Clinical Leadership)..."
                                                className="flex-1 text-xs p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-none h-14"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleBulkSkillAdd}
                                                disabled={!bulkSkillsInput.trim()}
                                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs shrink-0 cursor-pointer h-14"
                                            >
                                                <FaPlus className="w-3.5 h-3.5" /> Add All
                                            </button>
                                        </div>
                                    </div>
                                )}


                                {/* Skills Presentation: Empty State vs Cards vs Compact Tags */}
                                {profile.skills.length === 0 ? (
                                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-3">
                                        <p className="text-xs font-semibold text-slate-700">No skills saved in Master Profile</p>
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleRecommendAiSkills}
                                                disabled={isAiGenerating}
                                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer">
                                                <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                                <span>Auto-Recommend Top Skills (AI)</span>
                                            </button>
                                            <button type="button" onClick={addSkill} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold cursor-pointer">
                                                Add Skill
                                            </button>
                                        </div>
                                    </div>
                                ) : skillsViewMode === 'compact' ? (
                                    /* High-Density Compact Tags / Quick View */
                                    <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                                Quick Skill Matrix ({profile.skills.length})
                                            </span>
                                            <span className="text-[11px] text-slate-500">
                                                Click badge to cycle level • Reorder with arrows • Click × to delete
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {profile.skills
                                                .map((skill, originalIndex) => ({ ...skill, originalIndex }))
                                                .filter(skill => {
                                                    if (!skillsSearchQuery.trim()) return true;
                                                    const q = skillsSearchQuery.toLowerCase().trim();
                                                    return (skill.name || '').toLowerCase().includes(q) || (skill.level || '').toLowerCase().includes(q);
                                                })
                                                .map((skill) => {
                                                    const idx = skill.originalIndex;
                                                    const currentLvl = skill.level || 'Intermediate';
                                                    const lvlColors = {
                                                        expert: 'bg-indigo-100 text-indigo-800 border-indigo-200',
                                                        advanced: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                                                        intermediate: 'bg-sky-100 text-sky-800 border-sky-200',
                                                        beginner: 'bg-slate-200 text-slate-700 border-slate-300'
                                                    }[currentLvl.toLowerCase()] || 'bg-indigo-100 text-indigo-800 border-indigo-200';

                                                    return (
                                                        <div
                                                            key={skill.id || idx}
                                                            className="group inline-flex items-center gap-2 pl-3 pr-2 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl shadow-2xs transition-all"
                                                        >
                                                            <span className="text-xs font-semibold text-slate-900">
                                                                {skill.name || <span className="text-slate-400 italic">Untitled Skill</span>}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => cycleSkillLevel(idx)}
                                                                className={`text-[10px] px-2 py-0.5 rounded-lg font-bold border transition-all cursor-pointer ${lvlColors}`}
                                                                title="Click to cycle: Beginner → Intermediate → Advanced → Expert"
                                                            >
                                                                {currentLvl}
                                                            </button>
                                                            <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    type="button"
                                                                    disabled={idx === 0}
                                                                    onClick={() => moveItem('skills', idx, -1)}
                                                                    className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-indigo-600 disabled:opacity-20 text-[9px] cursor-pointer"
                                                                    title="Move up"
                                                                >
                                                                    ▲
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={idx === profile.skills.length - 1}
                                                                    onClick={() => moveItem('skills', idx, 1)}
                                                                    className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-indigo-600 disabled:opacity-20 text-[9px] cursor-pointer"
                                                                    title="Move down"
                                                                >
                                                                    ▼
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeSkill(idx)}
                                                                    className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-red-600 ml-0.5 cursor-pointer"
                                                                    title="Delete skill"
                                                                >
                                                                    <FaTimes className="w-2.5 h-2.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            <button
                                                type="button"
                                                onClick={addSkill}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-dashed border-indigo-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                            >
                                                <FaPlus className="w-2.5 h-2.5" /> Add Skill
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* Spacious 2-Column Cards View with Segmented Controls */
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                        {profile.skills
                                            .map((skill, originalIndex) => ({ ...skill, originalIndex }))
                                            .filter(skill => {
                                                if (!skillsSearchQuery.trim()) return true;
                                                const q = skillsSearchQuery.toLowerCase().trim();
                                                return (skill.name || '').toLowerCase().includes(q) || (skill.level || '').toLowerCase().includes(q);
                                            })
                                            .map((skill) => {
                                                const idx = skill.originalIndex;
                                                const currentLvl = skill.level || 'Intermediate';
                                                return (
                                                    <div
                                                        key={skill.id || idx}
                                                        className="group relative p-3.5 bg-white hover:bg-slate-50/50 border border-slate-200/90 hover:border-indigo-200 rounded-2xl transition-all shadow-2xs hover:shadow-xs space-y-2.5"
                                                    >
                                                        {/* Header: Skill Name Input with Autocomplete + Compact Action Pod */}
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 min-w-0">
                                                                <AutocompleteInputField
                                                                    hideLabel
                                                                    name={`skill_${idx}`}
                                                                    value={skill.name}
                                                                    onChange={(e) => updateSkill(idx, 'name', e.target.value)}
                                                                    placeholder="Skill name (e.g. React.js, Python, Medical Leadership)"
                                                                    suggestionType="skill"
                                                                    inputClassName="w-full text-xs p-2.5 pr-8 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                                                />
                                                            </div>
                                                            <div className="flex items-center gap-0.5 shrink-0 bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/70">
                                                                <button
                                                                    type="button"
                                                                    disabled={idx === 0}
                                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('skills', idx, -1); }}
                                                                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-indigo-600 disabled:opacity-20 rounded-lg hover:bg-white text-[10px] font-bold transition-all cursor-pointer"
                                                                    title="Move skill up">
                                                                    ▲
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={idx === profile.skills.length - 1}
                                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('skills', idx, 1); }}
                                                                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-indigo-600 disabled:opacity-20 rounded-lg hover:bg-white text-[10px] font-bold transition-all cursor-pointer"
                                                                    title="Move skill down">
                                                                    ▼
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeSkill(idx); }}
                                                                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                                                    title="Delete skill">
                                                                    <FaTrash className="w-2.5 h-2.5" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Proficiency Level Segmented Control */}
                                                        <div className="space-y-1">
                                                            <div className="flex items-center justify-between text-[11px] px-1">
                                                                <span className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider">Proficiency</span>
                                                                <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                                                                    {currentLvl}
                                                                </span>
                                                            </div>
                                                            <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-100/80 rounded-xl border border-slate-200/60">
                                                                {['Beginner', 'Intermediate', 'Advanced', 'Expert'].map((lvl) => {
                                                                    const isSelected = currentLvl.toLowerCase() === lvl.toLowerCase();
                                                                    return (
                                                                        <button
                                                                            key={lvl}
                                                                            type="button"
                                                                            onClick={() => updateSkill(idx, 'level', lvl)}
                                                                            className={`py-1 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                                                                isSelected
                                                                                    ? 'bg-indigo-600 text-white shadow-2xs'
                                                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                                                                            }`}
                                                                        >
                                                                            {lvl}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}

                                {/* Bottom Quick Actions */}
                                {profile.skills.length > 0 && (
                                    <div className="pt-2 flex flex-col sm:flex-row gap-2">
                                        <button
                                            type="button"
                                            onClick={handleRecommendAiSkills}
                                            disabled={isAiGenerating}
                                            className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer">
                                            <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                            <span>Auto-Recommend Skills (AI)</span>
                                        </button>
                                        <button type="button" onClick={addSkill} className="flex-1 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer">
                                            <FaPlus className="w-3.5 h-3.5" /> Add Skill
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}


                        {/* Sub-Tab 6: Certifications & Licenses */}
                        {profileSubTab === 'certifications' && (
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Professional Certifications & Credentials</h3>
                                        <p className="text-xs text-slate-500">Add only credentials you have earned, using the issuer, issue date, and credential link from your record.</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                                        <button
                                            type="button"
                                            onClick={handleRecommendAiCertifications}
                                            disabled={isAiGenerating}
                                            className="w-full sm:w-auto whitespace-nowrap flex-shrink-0 px-3.5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm">
                                            <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                            <span>Auto-Recommend Certifications (AI)</span>
                                        </button>
                                        <button type="button" onClick={addCertification} className="w-full sm:w-auto whitespace-nowrap flex-shrink-0 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs">
                                            <FaPlus className="w-3 h-3" /> Add Certification
                                        </button>
                                    </div>
                                </div>

                                {profile.certifications.length === 0 ? (
                                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-3">
                                        <p className="text-xs font-semibold text-slate-700">No certifications saved in Master Profile</p>
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleRecommendAiCertifications}
                                                disabled={isAiGenerating}
                                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5">
                                                <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                                <span>Auto-Recommend Certifications (AI)</span>
                                            </button>
                                            <button type="button" onClick={addCertification} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold">
                                                Add Certification
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    profile.certifications.map((cert, idx) => (
                                         <div key={cert.id || idx} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                             <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 flex-1">
                                                 <AutocompleteInputField
                                                     hideLabel
                                                     name={`cert_title_${idx}`}
                                                     value={cert.title}
                                                     onChange={(e) => updateCertification(idx, 'title', e.target.value)}
                                                     placeholder="Certification Title (e.g. AWS Solutions Architect)"
                                                     suggestionType="certification"
                                                     inputClassName="w-full text-xs p-2.5 pr-8 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                 />
                                                 <AutocompleteInputField
                                                     hideLabel
                                                     name={`cert_issuer_${idx}`}
                                                     value={cert.issuer}
                                                     onChange={(e) => updateCertification(idx, 'issuer', e.target.value)}
                                                     placeholder="Issuing Organization (e.g. Amazon Web Services)"
                                                     suggestionType="certificationIssuer"
                                                     inputClassName="w-full text-xs p-2.5 pr-8 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                 />
                                                 <input type="text" value={cert.date} onChange={(e) => updateCertification(idx, 'date', e.target.value)} placeholder="Date Issued (e.g. 2024)" className="text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none" spellCheck="false" />
                                                 <input type="url" value={cert.url || cert.link || ''} onChange={(e) => updateCertification(idx, 'url', e.target.value)} placeholder="Credential Link (URL)" className="text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none" />
                                             </div>
                                             <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                                                 <button
                                                     type="button"
                                                     disabled={idx === 0}
                                                     onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('certifications', idx, -1); }}
                                                     className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-200/70 text-xs font-bold"
                                                     title="Move certification up">
                                                     ▲
                                                 </button>
                                                 <button
                                                     type="button"
                                                     disabled={idx === profile.certifications.length - 1}
                                                     onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('certifications', idx, 1); }}
                                                     className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-200/70 text-xs font-bold"
                                                     title="Move certification down">
                                                     ▼
                                                 </button>
                                                 <button
                                                     type="button"
                                                     onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeCertification(idx); }}
                                                     className="w-8 h-8 flex items-center justify-center bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-xl transition-all cursor-pointer flex-shrink-0"
                                                     title="Delete certification">
                                                     <FaTrash className="w-3.5 h-3.5" />
                                                 </button>
                                             </div>
                                         </div>
                                    ))
                                )}

                                {profile.certifications.length > 0 && (
                                    <div className="pt-2 flex flex-col sm:flex-row gap-2">
                                        <button
                                            type="button"
                                            onClick={handleRecommendAiCertifications}
                                            disabled={isAiGenerating}
                                            className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs">
                                            <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                            <span>Auto-Recommend Certifications (AI)</span>
                                        </button>
                                        <button type="button" onClick={addCertification} className="flex-1 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs">
                                            <FaPlus className="w-3.5 h-3.5" /> Add Certification
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sub-Tab 8: Languages */}
                        {profileSubTab === 'languages' && (
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Languages & Proficiency</h3>
                                        <p className="text-xs text-slate-500">Add languages you speak and your level of proficiency.</p>
                                    </div>
                                    <button type="button" onClick={addLanguage} className="w-full sm:w-auto whitespace-nowrap flex-shrink-0 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs">
                                        <FaPlus className="w-3 h-3" /> Add Language
                                    </button>
                                </div>

                                {/* Quick-add pills */}
                                {profile.languages.length < 8 && (
                                    <div className="flex flex-wrap gap-2">
                                        {POPULAR_LANGUAGES.filter(l => !profile.languages.some(ex => (ex.name || '').toLowerCase() === l.toLowerCase())).slice(0, 10).map((lang) => (
                                            <button
                                                key={lang}
                                                type="button"
                                                onClick={() => setProfile((prev) => ({ ...prev, languages: [...prev.languages, { id: `lang_${Date.now()}`, name: lang, level: '' }] }))}
                                                className="px-3 py-1.5 text-[11px] font-semibold bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 text-slate-700 rounded-lg border border-slate-200 hover:border-indigo-300 transition-all"
                                            >
                                                + {lang}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {profile.languages.length === 0 ? (
                                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                                        <p className="text-2xl mb-2">🌐</p>
                                        <p className="text-xs font-semibold text-slate-700 mb-1">No languages saved in Master Profile</p>
                                        <p className="text-[11px] text-slate-500">Click "Add Language" or tap a language pill above.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {profile.languages.map((lang, idx) => (
                                            <div key={lang.id || idx} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-4">
                                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <AutocompleteInputField
                                                        hideLabel
                                                        name={`lang_name_${idx}`}
                                                        value={lang.name || ''}
                                                        onChange={(e) => updateLanguage(idx, 'name', e.target.value)}
                                                        placeholder="Language (e.g. English)"
                                                        suggestionType="language"
                                                        inputClassName="w-full text-xs p-2.5 pr-8 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                    />
                                                    <select
                                                        value={lang.level || ''}
                                                        onChange={(e) => updateLanguage(idx, 'level', e.target.value)}
                                                        className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                    >
                                                        <option value="" disabled>Select your proficiency</option>
                                                        {PROFICIENCY_LEVELS.map((lvl) => (
                                                            <option key={lvl} value={lvl}>{lvl}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        disabled={idx === 0}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('languages', idx, -1); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-200/70 text-xs font-bold"
                                                        title="Move language up">
                                                        ▲
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={idx === profile.languages.length - 1}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('languages', idx, 1); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-200/70 text-xs font-bold"
                                                        title="Move language down">
                                                        ▼
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeLanguage(idx); }}
                                                        className="w-8 h-8 flex items-center justify-center bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-xl transition-all cursor-pointer flex-shrink-0"
                                                        title="Delete language">
                                                        <FaTrash className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {profile.languages.length > 0 && (
                                    <div className="pt-2">
                                        <button type="button" onClick={addLanguage} className="w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs">
                                            <FaPlus className="w-3.5 h-3.5" /> Add Language
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sub-Tab: Hobbies & Personal Interests */}
                        {profileSubTab === 'hobbies' && (
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Hobbies &amp; Personal Interests</h3>
                                        <p className="text-xs text-slate-500">Showcase your passions, sports, or creative activities to add personality to your resume.</p>
                                    </div>
                                </div>

                                {/* Quick-add pills */}
                                <div className="space-y-2">
                                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">Quick Add Popular Hobbies</label>
                                    <div className="flex flex-wrap gap-2">
                                        {POPULAR_HOBBIES.filter(h => !(profile.hobbies || []).some(ex => (typeof ex === 'string' ? ex : ex.name || ex.hobby || '').toLowerCase() === h.toLowerCase())).map((hobby) => (
                                            <button
                                                key={hobby}
                                                type="button"
                                                onClick={() => addHobby(hobby)}
                                                className="px-3 py-1.5 text-[11px] font-semibold bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 text-slate-700 rounded-lg border border-slate-200 hover:border-indigo-300 transition-all cursor-pointer"
                                            >
                                                + {hobby}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Custom Hobby Input with AI Dropdown Suggestion */}
                                <div className="flex gap-2 items-start">
                                    <div className="flex-1">
                                        <AutocompleteInputField
                                            hideLabel
                                            name="hobbyInput"
                                            value={hobbyInput}
                                            onChange={(e) => setHobbyInput(e.target.value)}
                                            onSelect={(val) => {
                                                addHobby(val);
                                                setHobbyInput('');
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    addHobby();
                                                }
                                            }}
                                            placeholder="Type a custom hobby (e.g. Marathon Running, Open Source, Astronomy)..."
                                            suggestionType="hobby"
                                            inputClassName="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none h-[42px]"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => addHobby()}
                                        disabled={!hobbyInput.trim()}
                                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer h-[42px] shrink-0"
                                    >
                                        <FaPlus className="w-3 h-3" /> Add Hobby
                                    </button>
                                </div>

                                {/* Active Hobbies List */}
                                {(!profile.hobbies || profile.hobbies.length === 0) ? (
                                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                                        <p className="text-2xl mb-2">⚽</p>
                                        <p className="text-xs font-semibold text-slate-700 mb-1">No hobbies saved in Master Profile</p>
                                        <p className="text-[11px] text-slate-500">Click a quick-add suggestion above or type a custom hobby.</p>
                                    </div>
                                ) : (
                                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2.5">
                                            Active Hobbies ({profile.hobbies.length})
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {profile.hobbies.map((hobby, idx) => {
                                                const name = typeof hobby === 'string' ? hobby : (hobby.name || hobby.hobby || '');
                                                return (
                                                    <span
                                                        key={idx}
                                                        className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-300 text-slate-800 rounded-lg text-xs font-semibold shadow-2xs hover:border-slate-400 transition-all"
                                                    >
                                                        <span>{name}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeHobby(idx)}
                                                            className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                                                            title="Remove hobby"
                                                        >
                                                            ✕
                                                        </button>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sub-Tab 7: Personal Projects */}
                        {profileSubTab === 'projects' && (
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Portfolio & Personal Projects</h3>
                                        <p className="text-xs text-slate-500">Add key open-source or commercial projects.</p>
                                    </div>
                                    <button type="button" onClick={addProject} className="w-full sm:w-auto whitespace-nowrap flex-shrink-0 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs">
                                        <FaPlus className="w-3 h-3" /> Add Project
                                    </button>
                                </div>

                                {profile.projects.length === 0 ? (
                                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                                        <p className="text-xs font-semibold text-slate-700 mb-1">No portfolio projects saved in Master Profile</p>
                                        <p className="text-[11px] text-slate-500">Click "Add Project" to record your technical projects.</p>
                                    </div>
                                ) : (
                                    profile.projects.map((proj, idx) => (
                                        <div key={proj.id || idx} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                                            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                                    Project #{idx + 1}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        disabled={idx === 0}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('projects', idx, -1); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-200/70 text-xs font-bold"
                                                        title="Move project up">
                                                        ▲
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={idx === profile.projects.length - 1}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('projects', idx, 1); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-200/70 text-xs font-bold"
                                                        title="Move project down">
                                                        ▼
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeProject(idx); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer ml-1"
                                                        title="Delete project">
                                                        <FaTrash className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <input type="text" value={proj.title} onChange={(e) => updateProject(idx, 'title', e.target.value)} placeholder="Project Title" className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg font-semibold" />
                                                </div>
                                                <div>
                                                    <input type="url" value={proj.link} onChange={(e) => updateProject(idx, 'link', e.target.value)} placeholder="Live Demo / Repository URL" className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg" />
                                                </div>
                                            </div>
                                            <textarea value={proj.description} onChange={(e) => updateProject(idx, 'description', e.target.value)} placeholder="Short project summary or key tech stack used..." className="w-full h-16 text-xs p-2.5 bg-white border border-slate-300 rounded-lg" />
                                        </div>
                                    ))
                                )}

                                {profile.projects.length > 0 && (
                                    <div className="pt-2">
                                        <button type="button" onClick={addProject} className="w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs">
                                            <FaPlus className="w-3.5 h-3.5" /> Add Project
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sub-Tab 10: Honors & Awards */}
                        {profileSubTab === 'achievements' && (
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Honors, Awards &amp; Key Achievements</h3>
                                        <p className="text-xs text-slate-500">Record industry accolades, hackathon wins, academic honors, or notable career milestones.</p>
                                    </div>
                                    <button type="button" onClick={addAchievement} className="w-full sm:w-auto whitespace-nowrap flex-shrink-0 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer">
                                        <FaPlus className="w-3 h-3" /> Add Award / Achievement
                                    </button>
                                </div>

                                {(!profile.achievements || profile.achievements.length === 0) ? (
                                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                                        <p className="text-2xl mb-2">🏆</p>
                                        <p className="text-xs font-semibold text-slate-700 mb-1">No achievements saved in Master Profile</p>
                                        <p className="text-[11px] text-slate-500 mb-3">Add awards, competitive honors, or leadership recognitions to stand out to recruiters.</p>
                                        <button type="button" onClick={addAchievement} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer">
                                            <FaPlus className="w-3 h-3" /> Add First Achievement
                                        </button>
                                    </div>
                                ) : (
                                    (profile.achievements || []).map((ach, idx) => (
                                        <div key={ach.id || idx} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                                            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                                    🏆 Honor #{idx + 1}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        disabled={idx === 0}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('achievements', idx, -1); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-200/70 text-xs font-bold cursor-pointer"
                                                        title="Move up">
                                                        ▲
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={idx === profile.achievements.length - 1}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('achievements', idx, 1); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-200/70 text-xs font-bold cursor-pointer"
                                                        title="Move down">
                                                        ▼
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeAchievement(idx); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer ml-1"
                                                        title="Delete achievement">
                                                        <FaTrash className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <div className="sm:col-span-2">
                                                    <input
                                                        type="text"
                                                        value={ach.title || ''}
                                                        onChange={(e) => updateAchievement(idx, 'title', e.target.value)}
                                                        placeholder="Award or Honor Title (e.g. Employee of the Year, Hackathon 1st Place)"
                                                        className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <input
                                                        type="text"
                                                        value={ach.date || ''}
                                                        onChange={(e) => updateAchievement(idx, 'date', e.target.value)}
                                                        placeholder="Date Received (e.g. Nov 2024)"
                                                        className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <input
                                                    type="text"
                                                    value={ach.issuer || ''}
                                                    onChange={(e) => updateAchievement(idx, 'issuer', e.target.value)}
                                                    placeholder="Awarding Organization or Issuer (e.g. IEEE, Google Cloud, University)"
                                                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <textarea
                                                    value={ach.description || ''}
                                                    onChange={(e) => updateAchievement(idx, 'description', e.target.value)}
                                                    placeholder="Brief description of the accomplishment and its significance..."
                                                    className="w-full h-16 text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
                                                />
                                            </div>
                                        </div>
                                    ))
                                )}

                                {(profile.achievements || []).length > 0 && (
                                    <div className="pt-2">
                                        <button type="button" onClick={addAchievement} className="w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer">
                                            <FaPlus className="w-3.5 h-3.5" /> Add Another Achievement
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sub-Tab 11: References */}
                        {profileSubTab === 'references' && (
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Professional &amp; Academic References</h3>
                                        <p className="text-xs text-slate-500">Store references securely. Choose whether to show them on resumes or provide upon request.</p>
                                    </div>
                                    <button type="button" onClick={addReference} className="w-full sm:w-auto whitespace-nowrap flex-shrink-0 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer">
                                        <FaPlus className="w-3 h-3" /> Add Reference
                                    </button>
                                </div>

                                {(!profile.references || profile.references.length === 0) ? (
                                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                                        <p className="text-2xl mb-2">👥</p>
                                        <p className="text-xs font-semibold text-slate-700 mb-1">No references saved in Master Profile</p>
                                        <p className="text-[11px] text-slate-500 mb-3">Add managers, mentors, or colleagues who can vouch for your work.</p>
                                        <button type="button" onClick={addReference} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer">
                                            <FaPlus className="w-3 h-3" /> Add First Reference
                                        </button>
                                    </div>
                                ) : (
                                    (profile.references || []).map((ref, idx) => (
                                        <div key={ref.id || idx} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                                            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                                    👥 Reference #{idx + 1}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        disabled={idx === 0}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('references', idx, -1); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-200/70 text-xs font-bold cursor-pointer"
                                                        title="Move up">
                                                        ▲
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={idx === profile.references.length - 1}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('references', idx, 1); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-200/70 text-xs font-bold cursor-pointer"
                                                        title="Move down">
                                                        ▼
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeReference(idx); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer ml-1"
                                                        title="Delete reference">
                                                        <FaTrash className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <div>
                                                    <input
                                                        type="text"
                                                        value={ref.name || ''}
                                                        onChange={(e) => updateReference(idx, 'name', e.target.value)}
                                                        placeholder="Referee Full Name (e.g. Dr. Jane Smith)"
                                                        className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <input
                                                        type="text"
                                                        value={ref.position || ''}
                                                        onChange={(e) => updateReference(idx, 'position', e.target.value)}
                                                        placeholder="Job Title / Position (e.g. VP of Engineering)"
                                                        className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <input
                                                        type="text"
                                                        value={ref.company || ''}
                                                        onChange={(e) => updateReference(idx, 'company', e.target.value)}
                                                        placeholder="Company / Institution (e.g. Acme Corp)"
                                                        className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <input
                                                        type="email"
                                                        value={ref.email || ''}
                                                        onChange={(e) => updateReference(idx, 'email', e.target.value)}
                                                        placeholder="Email Address (e.g. jane.smith@acme.com)"
                                                        className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <input
                                                        type="tel"
                                                        value={ref.phone || ''}
                                                        onChange={(e) => updateReference(idx, 'phone', e.target.value)}
                                                        placeholder="Phone Number (e.g. +1 555-0199)"
                                                        className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <textarea
                                                    value={ref.reference || ''}
                                                    onChange={(e) => updateReference(idx, 'reference', e.target.value)}
                                                    placeholder="Relationship notes or reference quote (e.g. 'Direct manager at Acme Corp for 3 years')..."
                                                    className="w-full h-14 text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
                                                />
                                            </div>
                                        </div>
                                    ))
                                )}

                                {(profile.references || []).length > 0 && (
                                    <div className="pt-2">
                                        <button type="button" onClick={addReference} className="w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer">
                                            <FaPlus className="w-3.5 h-3.5" /> Add Another Reference
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sub-Tab 12: Custom Sections */}
                        {profileSubTab === 'customSections' && (
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Custom Profile Modules &amp; Bespoke Sections</h3>
                                        <p className="text-xs text-slate-500">Create bespoke sections (e.g. Publications, Patents, Speaking Engagements, Volunteering, Military Service).</p>
                                    </div>
                                    <button type="button" onClick={addCustomSection} className="w-full sm:w-auto whitespace-nowrap flex-shrink-0 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer">
                                        <FaPlus className="w-3 h-3" /> Add Custom Module
                                    </button>
                                </div>

                                {(!profile.customSections || profile.customSections.length === 0) ? (
                                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                                        <p className="text-2xl mb-2">🧩</p>
                                        <p className="text-xs font-semibold text-slate-700 mb-1">No custom modules created in Master Profile</p>
                                        <p className="text-[11px] text-slate-500 mb-3">Add any specialized section required for your unique career or industry background.</p>
                                        <button type="button" onClick={addCustomSection} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer">
                                            <FaPlus className="w-3 h-3" /> Add First Custom Section
                                        </button>
                                    </div>
                                ) : (
                                    (profile.customSections || []).map((sec, sIdx) => (
                                        <div key={sec.id || sIdx} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                                            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                                    🧩 Custom Section #{sIdx + 1}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        disabled={sIdx === 0}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('customSections', sIdx, -1); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-200/70 text-xs font-bold cursor-pointer"
                                                        title="Move up">
                                                        ▲
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={sIdx === profile.customSections.length - 1}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem('customSections', sIdx, 1); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-30 rounded-lg hover:bg-slate-200/70 text-xs font-bold cursor-pointer"
                                                        title="Move down">
                                                        ▼
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeCustomSection(sIdx); }}
                                                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer ml-1"
                                                        title="Delete custom section">
                                                        <FaTrash className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <div>
                                                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Section Title</label>
                                                    <input
                                                        type="text"
                                                        value={sec.title || ''}
                                                        onChange={(e) => updateCustomSection(sIdx, 'title', e.target.value)}
                                                        placeholder="Section Title (e.g. Publications, Patents, Keynote Talks, Volunteer Experience)"
                                                        className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Section Overview (Optional)</label>
                                                    <textarea
                                                        value={sec.content || ''}
                                                        onChange={(e) => updateCustomSection(sIdx, 'content', e.target.value)}
                                                        placeholder="Optional summary or introductory text for this entire section..."
                                                        className="w-full h-16 text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
                                                    />
                                                </div>

                                                {/* Nested Items in Custom Section */}
                                                <div className="pt-2 space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                                            Section Entries ({((sec.items || []).length)})
                                                        </label>
                                                        <button
                                                            type="button"
                                                            onClick={() => addCustomSectionItem(sIdx)}
                                                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                                                        >
                                                            <FaPlus className="w-2.5 h-2.5" /> Add Entry
                                                        </button>
                                                    </div>

                                                    {(!sec.items || sec.items.length === 0) ? (
                                                        <p className="text-[11px] text-slate-400 italic bg-white p-3 rounded-lg border border-dashed border-slate-200">
                                                            No item entries added. Click "Add Entry" to add bullet entries, publications, or events.
                                                        </p>
                                                    ) : (
                                                        sec.items.map((item, iIdx) => (
                                                            <div key={item.id || iIdx} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={item.title || ''}
                                                                        onChange={(e) => updateCustomSectionItem(sIdx, iIdx, 'title', e.target.value)}
                                                                        placeholder="Entry Title (e.g. 'Neural Attention Mechanisms Paper', 'Patent US102938')"
                                                                        className="flex-1 text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-900 focus:border-indigo-500 outline-none"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeCustomSectionItem(sIdx, iIdx)}
                                                                        className="text-slate-400 hover:text-red-600 p-1.5 rounded transition-colors cursor-pointer"
                                                                        title="Delete entry"
                                                                    >
                                                                        <FaTrash className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                                <textarea
                                                                    value={item.description || ''}
                                                                    onChange={(e) => updateCustomSectionItem(sIdx, iIdx, 'description', e.target.value)}
                                                                    placeholder="Entry details, citations, or metrics..."
                                                                    className="w-full h-14 text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:border-indigo-500 outline-none resize-none"
                                                                />
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}

                                {(profile.customSections || []).length > 0 && (
                                    <div className="pt-2">
                                        <button type="button" onClick={addCustomSection} className="w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer">
                                            <FaPlus className="w-3.5 h-3.5" /> Add Another Custom Section
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Save Master Profile Button — Back + Save + Save & Next */}
                        <div className="pt-6 border-t border-slate-100">
                            {/* Mobile progress indicator */}
                            <div className="flex items-center justify-between mb-4 sm:hidden">
                                <span className="text-xs text-slate-500 font-medium">
                                    Step {SUB_TAB_ORDER.indexOf(profileSubTab) + 1} of {SUB_TAB_ORDER.length}
                                </span>
                                <div className="flex gap-1">
                                    {SUB_TAB_ORDER.map((tab, _i) => (
                                        <button
                                            key={tab}
                                            type="button"
                                            onClick={() => setProfileSubTab(tab)}
                                            className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                                                tab === profileSubTab ? 'bg-indigo-600 w-5' : 'bg-slate-300'
                                            }`}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                <div>
                                    {SUB_TAB_ORDER.indexOf(profileSubTab) > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setProfileSubTab(SUB_TAB_ORDER[SUB_TAB_ORDER.indexOf(profileSubTab) - 1])}
                                            className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                        >
                                            <span>← Back</span>
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                                    <button
                                        type="button"
                                        onClick={handleSubmit}
                                        disabled={isSubmitting}
                                        className={`px-5 py-2.5 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                                            SUB_TAB_ORDER.indexOf(profileSubTab) === SUB_TAB_ORDER.length - 1
                                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80'
                                        }`}>
                                        <FaCheckCircle className="w-3.5 h-3.5" />
                                        <span>{isSubmitting ? 'Saving...' : SUB_TAB_ORDER.indexOf(profileSubTab) === SUB_TAB_ORDER.length - 1 ? 'Save Master Profile ✓' : 'Save'}</span>
                                    </button>
                                    {SUB_TAB_ORDER.indexOf(profileSubTab) < SUB_TAB_ORDER.length - 1 && (
                                        <button
                                            type="button"
                                            onClick={handleSaveAndNext}
                                            disabled={isSubmitting}
                                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer">
                                            <FaCheckCircle className="w-3.5 h-3.5" />
                                            <span>{isSubmitting ? 'Saving...' : `Save & Next → ${SUBTAB_CONFIG[SUB_TAB_ORDER[SUB_TAB_ORDER.indexOf(profileSubTab) + 1]]?.name || 'Next'}`}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: StepGuide Rail (Identical to Build Resume design) */}
                {showProfileGuidanceRail && (
                    <aside aria-label="Master Profile Guide" className="hidden lg:block lg:col-span-4 xl:col-span-3 sticky top-6 space-y-4">
                        {(() => {
                            const conf = SUBTAB_CONFIG[profileSubTab] || SUBTAB_CONFIG.basic;
                            const gaps = conf.computeGaps(profile);
                            const isReady = gaps.length === 0;

                            return (
                                <>
                                    {/* StepGuide Card */}
                                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                                        <div className="flex items-center justify-between gap-2">
                                            <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-400">GUIDE</h2>
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                                    isReady
                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                                }`}
                                            >
                                                <FaCheckCircle className="w-3 h-3" />
                                                {isReady ? 'Ready' : 'Needs attention'}
                                            </span>
                                        </div>

                                        {gaps.length > 0 && (
                                            <ul className="mt-3 space-y-1.5" aria-label="What is missing in this section">
                                                {gaps.map((gap, index) => (
                                                    <li key={`${gap}-${index}`} className="flex items-start gap-2 text-[13px] leading-snug text-slate-600">
                                                        <span className="mt-1.5 w-1.5 h-1.5 rounded-xs shrink-0 bg-amber-400" />
                                                        <span>{gap}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}

                                        {conf.atsTips && conf.atsTips.length > 0 && (
                                            <div className="mt-4 border-t border-slate-100 pt-3">
                                                <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                                    What the ATS check says
                                                </h3>
                                                <ul className="mt-2 space-y-1.5">
                                                    {conf.atsTips.map((tip, index) => (
                                                        <li key={`${tip}-${index}`} className="flex items-start gap-2 text-[13px] leading-snug text-slate-600">
                                                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-slate-300" />
                                                            <span>{tip}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {isReady && (
                                            <div className="mt-3 space-y-1.5 rounded-lg border border-emerald-200/90 bg-emerald-50/70 p-3">
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                                                    <FaCheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                                    <span>Optimized for screening ✓</span>
                                                </div>
                                                <p className="text-[12px] leading-relaxed text-emerald-700/90">
                                                    All essential fields and formatting checks for this section are satisfied.
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Live AI Sync / Master Source card — Clean Light */}
                                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                                <span className="text-xs font-bold text-slate-900">Master Sync Active</span>
                                            </div>
                                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                                Single Source
                                            </span>
                                        </div>
                                        <p className="text-xs leading-relaxed text-slate-600">
                                            Data saved here automatically synchronizes across all <strong>51 AI Resume Templates</strong>, Cover Letters, and Portfolio.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => navigate('/build-resume/heading')}
                                            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                                        >
                                            <span>Build / Edit Resumes</span>
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Sovereign MariaDB Data Protection Trust Badge — Clean Light */}
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs text-slate-600 space-y-1.5 shadow-2xs">
                                        <div className="flex items-center gap-2 font-bold text-slate-800">
                                            <FaShieldAlt className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            <span>Sovereign Storage</span>
                                        </div>
                                        <p className="text-[11px] leading-relaxed text-slate-500">
                                            Protected with AES-256 GCM encryption at rest and in transit. Private, isolated by account, and GDPR compliant.
                                        </p>
                                    </div>
                                </>
                            );
                        })()}
                    </aside>
                )}
            </div>
        </div>
    ) : (
                    /* Account & Security Settings — 10/10 World Class Security Center */
                    <div className="space-y-6">
                        {/* Card 1: Subscription Tier Overview & Billing CTA */}
                        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3.5 min-w-0">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 font-extrabold text-lg shrink-0">
                                    <FaCrown className="w-6 h-6 text-amber-400" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Subscription Tier</h3>
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-indigo-300 bg-indigo-500/30 border border-indigo-400/40 uppercase">
                                            {effectiveMembership || 'Basic'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-300 font-normal">
                                        {effectiveMembership === 'Enterprise'
                                            ? 'Enterprise workspace access with dedicated organization governance & AI quotas.'
                                            : effectiveMembership === 'Premium' || effectiveMembership === 'Pro'
                                                ? 'Active PRO membership with STAR AI bullet synthesizer, clean PDF & Word DocX export.'
                                                : 'Free Basic tier. Access to all 51 ATS templates, real-time score, and basic AI.'}
                                    </p>
                                </div>
                            </div>
                            <a
                                href="/dashboard/plans"
                                className="px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer">
                                <FaCrown className="w-3.5 h-3.5 text-amber-300" />
                                <span>{effectiveMembership === 'Enterprise' ? 'Manage Enterprise & Plans' : (effectiveMembership === 'Premium' || effectiveMembership === 'Pro') ? 'Manage Subscription & Plans' : 'Upgrade to PRO Career Pass'}</span>
                            </a>
                        </div>

                        {/* Card 2: Account Credentials & Password Change Form */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
                            <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
                                <div className="p-2.5 bg-indigo-50 rounded-xl">
                                    <FaShieldAlt className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-slate-900">Account Credentials &amp; Security</h2>
                                    <p className="text-xs text-slate-500">Update your primary login email and security authentication password.</p>
                                </div>
                            </div>

                            <form onSubmit={handleAccountSubmit} className="space-y-6">
                                {/* Account Email Address Input */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                                        <FaEnvelope className="w-3.5 h-3.5 text-indigo-600" /> Account Email Address
                                    </label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={databaseAccountSettings.email}
                                        onChange={(e) => setDatabaseAccountSettings({ ...databaseAccountSettings, email: e.target.value })}
                                        placeholder="name@example.com"
                                        className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                    />
                                </div>

                                {/* Password Change / Creation Grid */}
                                <div className="border-t border-slate-100 pt-6 space-y-4">
                                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                        <FaKey className="w-3.5 h-3.5 text-indigo-600" /> {usesPasswordProvider ? 'Security Password Update & Re-authentication' : 'Create Account Security Password'}
                                    </h3>

                                    {usesPasswordProvider ? (
                                        /* Current Password Input for Identity Verification */
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1">Current Password (Required for Email or Password Change)</label>
                                            <div className="relative">
                                                <input
                                                    type={showPasswordMap.current ? 'text' : 'password'}
                                                    value={accountPasswordState.currentPassword}
                                                    onChange={(e) => setAccountPasswordState({ ...accountPasswordState, currentPassword: e.target.value })}
                                                    placeholder="Enter current password to re-authenticate"
                                                    className="w-full text-xs p-3 pr-10 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPasswordMap({ ...showPasswordMap, current: !showPasswordMap.current })}
                                                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                                                    {showPasswordMap.current ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-xl text-xs text-blue-900 space-y-1">
                                            <div className="font-bold flex items-center gap-1.5 text-blue-950">
                                                <FaShieldAlt className="w-3.5 h-3.5 text-blue-600" />
                                                <span>OAuth-Authenticated Account ({primaryOAuthProvider})</span>
                                            </div>
                                            <p className="text-blue-800 text-[11px] leading-relaxed">
                                                You are currently signed in with {primaryOAuthProvider}. Set an independent security password below to also enable direct email and password login without affecting your {primaryOAuthProvider} account.
                                            </p>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {/* New Security Password */}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1">{usesPasswordProvider ? 'New Security Password' : 'Set Security Password'}</label>
                                            <div className="relative">
                                                <input
                                                    type={showPasswordMap.new ? 'text' : 'password'}
                                                    value={accountPasswordState.newPassword}
                                                    onChange={(e) => setAccountPasswordState({ ...accountPasswordState, newPassword: e.target.value })}
                                                    placeholder="Min. 8 characters"
                                                    className="w-full text-xs p-3 pr-10 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPasswordMap({ ...showPasswordMap, new: !showPasswordMap.new })}
                                                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                                                    {showPasswordMap.new ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Confirm New Password */}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1">{usesPasswordProvider ? 'Confirm New Password' : 'Confirm Password'}</label>
                                            <div className="relative">
                                                <input
                                                    type={showPasswordMap.confirm ? 'text' : 'password'}
                                                    value={accountPasswordState.confirmPassword}
                                                    onChange={(e) => setAccountPasswordState({ ...accountPasswordState, confirmPassword: e.target.value })}
                                                    placeholder="Re-enter password"
                                                    className="w-full text-xs p-3 pr-10 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPasswordMap({ ...showPasswordMap, confirm: !showPasswordMap.confirm })}
                                                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                                                    {showPasswordMap.confirm ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Password Criteria Real-Time Checklist */}
                                    {accountPasswordState.newPassword && (
                                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                                            <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider mb-1">Security Standards Checklist</span>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-semibold">
                                                <div className={`flex items-center gap-1.5 ${accountPasswordState.newPassword.length >= 8 ? 'text-emerald-700' : 'text-slate-400'}`}>
                                                    <FaCheckCircle className={`w-3 h-3 ${accountPasswordState.newPassword.length >= 8 ? 'text-emerald-600' : 'text-slate-300'}`} />
                                                    <span>At least 8 characters</span>
                                                </div>
                                                <div className={`flex items-center gap-1.5 ${/[A-Z]/.test(accountPasswordState.newPassword) ? 'text-emerald-700' : 'text-slate-400'}`}>
                                                    <FaCheckCircle className={`w-3 h-3 ${/[A-Z]/.test(accountPasswordState.newPassword) ? 'text-emerald-600' : 'text-slate-300'}`} />
                                                    <span>Uppercase letter (A-Z)</span>
                                                </div>
                                                <div className={`flex items-center gap-1.5 ${/\d/.test(accountPasswordState.newPassword) || /[^A-Za-z0-9]/.test(accountPasswordState.newPassword) ? 'text-emerald-700' : 'text-slate-400'}`}>
                                                    <FaCheckCircle className={`w-3 h-3 ${/\d/.test(accountPasswordState.newPassword) || /[^A-Za-z0-9]/.test(accountPasswordState.newPassword) ? 'text-emerald-600' : 'text-slate-300'}`} />
                                                    <span>Number or special character</span>
                                                </div>
                                                <div className={`flex items-center gap-1.5 ${accountPasswordState.newPassword && accountPasswordState.newPassword === accountPasswordState.confirmPassword ? 'text-emerald-700' : 'text-slate-400'}`}>
                                                    <FaCheckCircle className={`w-3 h-3 ${accountPasswordState.newPassword && accountPasswordState.newPassword === accountPasswordState.confirmPassword ? 'text-emerald-600' : 'text-slate-300'}`} />
                                                    <span>Passwords match</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-end pt-4 border-t border-slate-100">
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="w-full sm:w-auto px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2">
                                            <FaCheckCircle className="w-3.5 h-3.5" />
                                            <span>{isSubmitting ? 'Updating Account...' : (usesPasswordProvider ? 'Update Account Security ✓' : 'Create Account Security Password ✓')}</span>
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>

                        {/* Card 2.5: Twilio Mobile SMS Security & Alerts Center */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
                            <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
                                <div className="p-2.5 bg-red-50 rounded-xl">
                                    <FaMobileAlt className="w-5 h-5 text-red-600" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-slate-900">Mobile SMS Security &amp; Outgoing Alerts</h2>
                                    <p className="text-xs text-slate-500">Configure your primary mobile number for instant SMS security notifications upon logins, 2FA updates, or password changes.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                                        <FaMobileAlt className="w-3.5 h-3.5 text-red-600" /> Mobile Phone Number (with Country Code)
                                    </label>
                                    <input
                                        type="tel"
                                        value={profile?.phone || ''}
                                        onChange={(e) => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                                        placeholder="+1 415 555 2671 / +91 9876543210"
                                        className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none"
                                    />
                                </div>

                                <div className="flex flex-col justify-end">
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const phoneToUse = profile?.phone;
                                            if (!phoneToUse || !phoneToUse.trim()) {
                                                setToastState({ type: 'error', msg: 'Please enter a valid mobile phone number first.' });
                                                return;
                                            }
                                            setToastState({ type: 'info', msg: 'Dispatching test SMS via Twilio Gateway...' });
                                            const res = await sendSmsNotification(phoneToUse, 'AI Resume Builder Security Alert: Test SMS notification successful!');
                                            if (res.success) {
                                                setToastState({ type: 'success', msg: `SMS Security Alert sent successfully to ${phoneToUse}! (SID: ${res.messageSid || 'OK'})` });
                                            } else {
                                                setToastState({ type: 'error', msg: `SMS Dispatch Failed: ${res.error}` });
                                            }
                                        }}
                                        className="w-full sm:w-auto px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer">
                                        <FaMobileAlt className="w-3.5 h-3.5 text-red-400" />
                                        <span>Dispatch Test SMS Alert</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Card 4: Two-Factor Authentication (TOTP 2FA) */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
                            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2.5 bg-purple-50 rounded-xl">
                                        <FaMobileAlt className="w-5 h-5 text-purple-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900">Two-Factor Authentication (TOTP 2FA)</h3>
                                        <p className="text-xs text-slate-500">Protect your account using Google Authenticator, Authy, Microsoft Authenticator, or 1Password.</p>
                                    </div>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                                    totpStatus.enabled
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}>
                                    <FaShieldAlt className={`w-3 h-3 ${totpStatus.enabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                                    <span>{totpStatus.enabled ? '2FA Active 🟢' : 'Not Enrolled ⚪'}</span>
                                </span>
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                <div className="text-xs text-slate-600 space-y-1">
                                    <p className="font-bold text-slate-900">
                                        {totpStatus.enabled ? 'Your account is secured with 2FA.' : 'Add an extra layer of security to your account.'}
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                        {totpStatus.enabled
                                            ? 'Each login will require entering a 6-digit dynamic code generated by your mobile authenticator app.'
                                            : 'Scan a QR code in Google Authenticator or Authy to generate dynamic login codes.'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {totpStatus.enabled ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setTotpDisableModalOpen(true)}
                                                className="px-3.5 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-bold rounded-xl transition-all shadow-2xs cursor-pointer">
                                                Disable 2FA
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleStartTotpSetup}
                                            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer">
                                            <FaQrcode className="w-3.5 h-3.5" />
                                            <span>Enable 2FA (Authenticator App)</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Card 5: Email Verification & Authentication Status */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
                            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2.5 bg-indigo-50 rounded-xl">
                                        <FaEnvelope className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900">Email Verification Status</h3>
                                        <p className="text-xs text-slate-500">Verify your email address for account recovery and notification delivery.</p>
                                    </div>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                                    fire.auth().currentUser?.emailVerified
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                    <FaCheckCircle className={`w-3 h-3 ${fire.auth().currentUser?.emailVerified ? 'text-emerald-600' : 'text-amber-500'}`} />
                                    <span>{fire.auth().currentUser?.emailVerified ? 'Verified Email 🟢' : 'Unverified Email 🟡'}</span>
                                </span>
                            </div>

                            {!fire.auth().currentUser?.emailVerified && (
                                <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                    <div className="text-xs text-amber-900">
                                        <p className="font-bold">Your email address has not been verified yet.</p>
                                        <p className="text-[11px] text-amber-700">Click below to send a verification confirmation link to <strong>{fire.auth().currentUser?.email}</strong>.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSendVerificationEmail}
                                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-all shadow-2xs shrink-0">
                                        Resend Verification Email
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
                            <div><h3 className="text-sm font-bold text-slate-900">Preferences &amp; Privacy</h3><p className="text-xs text-slate-500">These account-scoped choices do not change analytics consent or payment state.</p></div>
                            <label className="block text-xs font-bold text-slate-700" htmlFor="account-language">Language<select id="account-language" value={preferences.language} onChange={event => setPreferences(current => ({ ...current, language: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal"><option value="en">English</option><option value="hi">हिन्दी</option><option value="es">Español</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="pt">Português</option><option value="it">Italiano</option><option value="nl">Nederlands</option></select></label>
                            <div className="grid gap-3 sm:grid-cols-2">{[['emailNotifications','Email notifications'],['securityNotifications','Security notifications'],['productUpdates','Product updates'],['profileDiscoverable','Discoverable public profile']].map(([key,label]) => <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs font-semibold"><input type="checkbox" checked={Boolean(preferences[key])} onChange={event => setPreferences(current => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</div>
                            <div className="flex flex-wrap items-center gap-3 pt-1">
                                <button type="button" onClick={handlePreferencesSave} disabled={savingPreferences} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-all">{savingPreferences ? 'Saving…' : 'Save preferences'}</button>
                                <button type="button" onClick={openPrivacyChoicesModal} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-2xs">Manage Cookie &amp; Analytics Choices</button>
                            </div>
                        </div>

                        {/* Card 5: GDPR Data Portability & Export */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
                            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2.5 bg-blue-50 rounded-xl">
                                        <FaDownload className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900">GDPR Data Portability &amp; Backup</h3>
                                        <p className="text-xs text-slate-500">Download JSON for your profile, resumes, cover letters, Portfolios, CMS posts, employer content, applications, and accessible transactions. Provider-held identity/billing/audit records may require support export channels.</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleExportUserData}
                                    disabled={isSubmitting}
                                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-2 shrink-0">
                                    <FaDownload className="w-3.5 h-3.5" />
                                    <span>Download All My Data (JSON)</span>
                                </button>
                            </div>
                        </div>

                        {/* Card 6: Active Device Sessions & Security Logs */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
                            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2.5 bg-emerald-50 rounded-xl">
                                        <FaDesktop className="w-5 h-5 text-emerald-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900">Active Device Sessions</h3>
                                        <p className="text-xs text-slate-500">Manage device logins and authenticated browser sessions.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-xs shrink-0">
                                        💻
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-900">Current Session</span>
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-700">Active Now</span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 font-medium">
                                            {navigator.platform || 'Desktop'} • {navigator.userAgent.includes('Chrome') ? 'Chrome Web Browser' : 'Modern Browser'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => triggerNotification('Session security verified. Current device authenticated.')}
                                    className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-2xs">
                                    Verify Active Session
                                </button>
                            </div>
                        </div>

                        {/* Card 7: Historical Login Audit Trail */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
                            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2.5 bg-slate-100 rounded-xl">
                                        <FaHistory className="w-5 h-5 text-slate-700" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900">Historical Login Audit Trail</h3>
                                        <p className="text-xs text-slate-500">Security history of authenticated logins, devices, browsers, and timestamps.</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const user = fire.auth().currentUser;
                                        if (user) {
                                            const logs = await getUserLoginHistory(user.uid);
                                            setLoginHistory(logs);
                                            triggerNotification('Login audit trail updated!');
                                        }
                                    }}
                                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0 cursor-pointer">
                                    <FaSyncAlt className="w-3 h-3" /> Refresh Trail
                                </button>
                            </div>

                            {loginHistory.length === 0 ? (
                                <div className="p-6 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-1">
                                    <p className="text-xs font-semibold text-slate-700">Recent Login Session Recorded</p>
                                    <p className="text-[11px] text-slate-500">Future login sessions will automatically build your security audit trail here.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                                                <th className="pb-2">Date &amp; Time</th>
                                                <th className="pb-2">Device OS</th>
                                                <th className="pb-2">Browser</th>
                                                <th className="pb-2">Sign-In Provider</th>
                                                <th className="pb-2 text-right">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {loginHistory.map((log, idx) => (
                                                <tr key={log.id || idx} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="py-3 font-semibold text-slate-900">
                                                        {log.date ? `${log.date} ${log.time || ''}` : new Date(log.timestamp).toLocaleString()}
                                                    </td>
                                                    <td className="py-3 text-slate-700 font-medium">{log.device || 'Windows PC'}</td>
                                                    <td className="py-3 text-slate-700 font-medium">{log.browser || 'Google Chrome'}</td>
                                                    <td className="py-3 text-slate-600 font-mono text-[11px]">{log.authMethod || 'Email & Password'}</td>
                                                    <td className="py-3 text-right">
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                            <FaCheckCircle className="w-2.5 h-2.5 text-emerald-500" />
                                                            <span>{log.status || 'Success 🟢'}</span>
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Card 4: Danger Zone — Account Deletion */}
                        <div className="bg-red-50/50 border border-red-200/80 rounded-2xl p-6 sm:p-8 space-y-4 shadow-2xs">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2.5 bg-red-100 rounded-xl">
                                        <FaExclamationTriangle className="w-5 h-5 text-red-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-red-950">Danger Zone — Account Deletion</h3>
                                        <p className="text-xs text-red-700">Permanently delete your account, master profile, saved resumes, and subscription data.</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setDeleteAccountModalOpen(true)}
                                    className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 shrink-0">
                                    <FaTrash className="w-3.5 h-3.5" />
                                    <span>Delete Account</span>
                                </button>
                                </div>
                            </div>
                        </div>
                )}
            </div>
        </div>

        {/* Image Crop Modal — shown when user picks a photo */}
        {cropModalSrc && (
            <ImageCropModal
                imageSrc={cropModalSrc}
                onCrop={handleCroppedImage}
                onCancel={() => setCropModalSrc(null)}
            />
        )}

        {/* Danger Zone Account Deletion Confirmation Modal */}
        {deleteAccountModalOpen && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4" role="presentation" onKeyDown={event => { if (event.key === 'Escape' && !isSubmitting) setDeleteAccountModalOpen(false); }}>
                <div role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description" className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 border border-slate-200">
                    <div className="flex items-center gap-3 text-red-600">
                        <FaExclamationTriangle className="w-6 h-6 shrink-0" />
                        <h3 id="delete-account-title" className="text-base font-bold text-slate-900">Confirm Permanent Account Deletion</h3>
                    </div>
                    <p id="delete-account-description" className="text-xs text-slate-600 leading-relaxed">
                        This action is <strong>irreversible</strong>. Your identity and owned profile, resume, cover-letter, Portfolio, CMS, employer, job, application, notification, and messaging data will be removed. Payment, invoice, transaction, subscription, and security-audit records may be retained for legal, fraud-prevention, and accounting obligations.
                    </p>
                    <div className="space-y-3">
                        {usesPasswordProvider ? (
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Current Password (Required for Identity Verification):</label>
                                <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Enter current password" className="w-full text-xs p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-red-500 outline-none" />
                            </div>
                        ) : (
                            <p className="text-xs text-slate-600">Your identity provider or recent verified sign-in will be used for confirmation.</p>
                        )}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                                Type <span className="font-mono text-red-600 font-bold">DELETE</span> to confirm:
                            </label>
                            <input
                                type="text"
                                value={deleteInputText}
                                onChange={(e) => setDeleteInputText(e.target.value)}
                                placeholder="DELETE"
                                className="w-full text-xs p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold focus:border-red-500 outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            autoFocus
                            onClick={() => { setDeleteAccountModalOpen(false); setDeleteInputText(''); setDeletePassword(''); }}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer">
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={deleteInputText !== 'DELETE' || (usesPasswordProvider && !deletePassword) || isSubmitting}
                            onClick={handleDeleteAccountConfirmed}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer">
                            {isSubmitting ? 'Purging Account...' : 'Permanently Delete Account'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* TOTP 2FA Setup Wizard Modal */}
        {totpSetupModalOpen && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" role="presentation" onKeyDown={event => { if (event.key === 'Escape' && !isSubmitting) setTotpSetupModalOpen(false); }}>
                <div role="dialog" aria-modal="true" aria-labelledby="totp-setup-title" className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 border border-slate-200 my-8">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-purple-100 rounded-lg text-purple-700 font-bold">
                                <FaQrcode className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 id="totp-setup-title" className="text-base font-bold text-slate-900">Set Up Authenticator App (2FA)</h3>
                                <p className="text-[11px] text-slate-500">Step {totpSetupStep} of 3 • Google Authenticator / Authy</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setTotpSetupModalOpen(false)}
                            className="text-slate-400 hover:text-slate-600 text-lg font-bold">
                            ✕
                        </button>
                    </div>

                    {/* Step 1: Scan QR Code & View Base32 Secret Key */}
                    {totpSetupStep === 1 && (
                        <div className="space-y-4">
                            <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-xl text-xs text-purple-900 leading-relaxed">
                                <strong>1. Open Google Authenticator or Authy</strong> on your mobile phone and tap <strong>"+"</strong> to add a new account, then scan the QR code below.
                            </div>

                            <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                                <div className="p-2 bg-white rounded-xl shadow-xs border border-slate-200 shrink-0">
                                    <img
                                        src={totpQrCodeDataUrl}
                                        alt="2FA QR Code"
                                        className="w-36 h-36"
                                    />
                                </div>
                                <div className="space-y-2 text-xs min-w-0 flex-1">
                                    <span className="font-bold text-slate-700 block uppercase tracking-wider text-[10px]">Can't scan? Enter key manually:</span>
                                    <div className="flex items-center gap-2 p-2.5 bg-white border border-slate-300 rounded-xl font-mono text-xs font-bold text-purple-900">
                                        <span className="truncate select-all">{totpSetupSecret}</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(totpSetupSecret);
                                                triggerNotification('Secret key copied to clipboard!');
                                            }}
                                            className="p-1 text-slate-500 hover:text-purple-700 shrink-0"
                                            title="Copy key">
                                            <FaCopy className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-slate-500">Account Type: Time-based (TOTP), 6 digits, 30s period.</p>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setTotpSetupModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl">
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTotpSetupStep(2)}
                                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs">
                                    Next: Verify Code →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: 6-Digit TOTP Verification */}
                    {totpSetupStep === 2 && (
                        <div className="space-y-4">
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed">
                                Enter the <strong>6-digit security code</strong> currently generated by Google Authenticator / Authy to verify setup.
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">6-Digit Verification Code</label>
                                <input
                                    type="text"
                                    maxLength={6}
                                    value={totpVerificationCode}
                                    onChange={(e) => setTotpVerificationCode(e.target.value.replace(/\D/g, ''))}
                                    placeholder="123456"
                                    className="w-full text-center text-xl tracking-widest font-mono p-3.5 bg-slate-50 border border-purple-300 rounded-xl text-purple-950 font-extrabold focus:border-purple-600 outline-none"
                                />
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setTotpSetupStep(1)}
                                    className="px-3.5 py-2 text-slate-600 hover:text-slate-900 text-xs font-bold">
                                    ← Back to QR Code
                                </button>
                                <button
                                    type="button"
                                    disabled={totpVerificationCode.length !== 6 || isSubmitting}
                                    onClick={handleVerifyAndEnableTotp}
                                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs">
                                    {isSubmitting ? 'Verifying...' : 'Verify & Enable 2FA ✓'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Native Firebase MFA enrollment complete */}
                    {totpSetupStep === 3 && (
                        <div className="space-y-4">
                            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 leading-relaxed">
                                <strong>Two-factor authentication is active.</strong> Firebase Identity Platform will require your authenticator code during sign-in. ResumePilot does not store or display reusable recovery codes.
                            </div>
                            <div className="flex justify-end pt-2 border-t border-slate-100">
                                <button type="button" onClick={() => setTotpSetupModalOpen(false)} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs">
                                    Done &amp; Close ✓
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Disable TOTP 2FA Confirmation Modal */}
        {totpDisableModalOpen && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4" role="presentation" onKeyDown={event => { if (event.key === 'Escape' && !isSubmitting) setTotpDisableModalOpen(false); }}>
                <div role="alertdialog" aria-modal="true" aria-labelledby="totp-disable-title" className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 border border-slate-200">
                    <div className="flex items-center gap-3 text-red-600">
                        <FaExclamationTriangle className="w-6 h-6 shrink-0" />
                        <h3 id="totp-disable-title" className="text-base font-bold text-slate-900">Disable Two-Factor Authentication</h3>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                        Disabling 2FA reduces your account security. Reauthenticate with your account provider to confirm.
                    </p>
                    <div className="space-y-3">
                        {usesPasswordProvider ? (
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Current Account Password (Required):</label>
                                <input type="password" value={totpDisablePassword} onChange={(e) => setTotpDisablePassword(e.target.value)} placeholder="Enter current password" className="w-full text-xs p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-red-500 outline-none" />
                            </div>
                        ) : (
                            <p className="text-xs text-slate-600">Your identity provider will open a secure reauthentication popup.</p>
                        )}
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={() => { setTotpDisableModalOpen(false); setTotpDisablePassword(''); }}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl">
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={(usesPasswordProvider && !totpDisablePassword) || isSubmitting}
                            onClick={handleDisableTotpConfirmed}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs">
                            {isSubmitting ? 'Disabling...' : 'Confirm Disable 2FA'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Native In-Dashboard Subscription Plans & Checkout Modal Popup */}
        <SubscriptionModal
            isOpen={isSubscriptionModalOpen}
            onClose={() => setIsSubscriptionModalOpen(false)}
            user={fire.auth().currentUser}
        />

        {/* AI Recommendation Review Modal */}
        <AiRecommendationModal
            isOpen={aiModalState.isOpen}
            onClose={() => setAiModalState((prev) => ({ ...prev, isOpen: false }))}
            title={aiModalState.title}
            type={aiModalState.type}
            items={aiModalState.items}
            onApply={aiModalState.onApply || (() => {})}
        />
        </>
    );
}

export default DashboardSettings;
