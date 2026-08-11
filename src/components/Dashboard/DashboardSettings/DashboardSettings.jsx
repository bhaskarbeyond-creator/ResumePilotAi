import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { uploadImageToFirebase, getProfileOfUser, addProfileToUser, getAccountInfo, changePassword, updateUserEmail, getSystemSettings } from '../../../firestore/dbOperations';
import { generateUserAiContent, cleanSkillName } from '../../../services/aiService';
import { FaUser, FaCog, FaCamera, FaTrash, FaUserCircle, FaKey, FaCalendarAlt, FaEnvelope, FaCreditCard, FaUpload, FaCheckCircle, FaExclamationTriangle, FaBriefcase, FaGraduationCap, FaTools, FaGlobe, FaPlus, FaCheck, FaShieldAlt, FaDesktop, FaDownload, FaCertificate, FaProjectDiagram, FaMagic, FaLinkedin, FaGithub, FaLink, FaSyncAlt, FaExternalLinkAlt, FaUnlink } from 'react-icons/fa';
import fire from '../../../conf/fire';
import MonthYearPicker from '../../Form/MonthYearPicker';
import AiRecommendationModal from '../../Form/AiRecommendationModal';
import AutocompleteInputField from '../../BuildResume/steps/components/AutocompleteInputField';
import ImageCropModal from './ImageCropModal';
import { inferCountryFromCity } from '../../../utils/locationHelper';

function DashboardSettings(props) {
    const { t } = useTranslation('common');
    // State management
    const [selectedSettings, setSelectedSettings] = useState('Profile');
    const [profileSubTab, setProfileSubTab] = useState('basic'); // 'basic' | 'summary' | 'experience' | 'education' | 'skills' | 'certifications' | 'projects'
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAiGenerating, setIsAiGenerating] = useState(false);
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
        certifications: [],
        projects: [],
    });

    const [isDragging, setIsDragging] = useState(false);

    // Toast Notification helper
    const triggerNotification = (msg, type = 'success') => {
        setToastState({ msg, type });
        setTimeout(() => setToastState(null), 5000);
    };

    // Data Normalizers for legacy Firestore structures
    const normalizeSkills = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item, idx) => {
            if (typeof item === 'string') return { id: `skill_${idx}_${Date.now()}`, name: item, level: 'Expert' };
            if (item && typeof item === 'object') return { id: item.id || `skill_${idx}`, name: item.name || item.title || '', level: item.level || 'Expert' };
            return { id: `skill_${idx}`, name: String(item || ''), level: 'Expert' };
        });
    };

    const normalizeLanguages = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item, idx) => {
            if (typeof item === 'string') return { id: `lang_${idx}_${Date.now()}`, name: item, level: 'Native / Bilingual' };
            if (item && typeof item === 'object') return { id: item.id || `lang_${idx}`, name: item.name || item.language || '', level: item.level || item.proficiency || 'Native / Bilingual' };
            return { id: `lang_${idx}`, name: String(item || ''), level: 'Native / Bilingual' };
        });
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

    // Load User Profile Data
    const getProfileOfUserFront = async () => {
        const currentUser = fire.auth().currentUser;
        if (currentUser) {
            const userProfile = await getProfileOfUser(currentUser.uid);
            if (userProfile) {
                const parts = (userProfile.name || currentUser.displayName || '').split(' ');
                setProfile({
                    firstname: userProfile.firstname || parts[0] || '',
                    lastname: userProfile.lastname || parts.slice(1).join(' ') || '',
                    name: userProfile.name || currentUser.displayName || '',
                    email: userProfile.email || currentUser.email || '',
                    phone: userProfile.phone || '',
                    address: userProfile.address || '',
                    city: userProfile.city || '',
                    postalCode: userProfile.postalCode || userProfile.postalcode || '',
                    country: userProfile.country || '',
                    occupation: userProfile.occupation || '',
                    linkedinUrl: userProfile.linkedinUrl || '',
                    githubUrl: userProfile.githubUrl || '',
                    websiteUrl: userProfile.websiteUrl || '',
                    summary: userProfile.summary || '',
                    selectedImage: userProfile.selectedImage || userProfile.image || null,
                    isLinkedinConnected: !!(userProfile.isLinkedinConnected || userProfile.linkedinUrl),
                    linkedinConnectedName: userProfile.linkedinConnectedName || userProfile.name || '',
                    workExperiences: normalizeWorkExperiences(userProfile.workExperiences),
                    education: normalizeEducation(userProfile.education),
                    skills: normalizeSkills(userProfile.skills),
                    languages: normalizeLanguages(userProfile.languages),
                    certifications: normalizeCertifications(userProfile.certifications),
                    projects: normalizeProjects(userProfile.projects),
                });
            }
        }
    };

    const getAccountInfoFront = async () => {
        const currentUser = fire.auth().currentUser;
        if (currentUser) {
            const accountInfo = await getAccountInfo(currentUser.uid);
            if (accountInfo) {
                setDatabaseAccountSettings({
                    email: accountInfo.email || currentUser.email || '',
                    membership: accountInfo.membership || 'Free Active Tier',
                    membershipEnds: accountInfo.membershipEnds || null,
                });
            }
        }
    };

    useEffect(() => {
        getProfileOfUserFront();
        getAccountInfoFront();
    }, []);

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

    const handleAccountInputChange = (e) => {
        const field = e.target.name;
        const value = e.target.value;
        setAccountSettings((prev) => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        setIsSubmitting(true);
        const currentUser = fire.auth().currentUser;
        if (currentUser) {
            // Dual-save postalcode (lowercase) as alias so CV templates that read values.postalcode work correctly
            const profileToSave = { ...profile, postalcode: profile.postalCode || '', website: profile.websiteUrl || '' };
            await addProfileToUser(currentUser.uid, profileToSave);
            window.dispatchEvent(new CustomEvent('profileUpdated', { detail: profileToSave }));
            triggerNotification('Master User Profile saved securely! Ready for 1-click Resume & Cover Letter creation.');
        }
        setIsSubmitting(false);
    };

    const handleAccountSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        const currentUser = fire.auth().currentUser;
        if (currentUser && databaseAccountSettings.email) {
            await updateUserEmail(databaseAccountSettings.email);
        }
        if (accountSettings.password && accountSettings.password.length >= 6) {
            await changePassword(accountSettings.password);
            triggerNotification('Account password updated successfully!');
        } else if (accountSettings.password && accountSettings.password.length < 6) {
            triggerNotification('Password must be at least 6 characters long.', 'error');
        } else {
            triggerNotification('Account settings saved!');
        }
        setIsSubmitting(false);
    };

    // Automatic background auto-saver for Master Profile Settings
    const isFirstProfileLoadRef = React.useRef(true);
    useEffect(() => {
        if (isFirstProfileLoadRef.current) {
            isFirstProfileLoadRef.current = false;
            return;
        }

        const timer = setTimeout(async () => {
            const currentUser = fire.auth().currentUser;
            if (currentUser && profile && Object.keys(profile).length > 0) {
                try {
                    const profileToSave = { ...profile, postalcode: profile.postalCode || '', website: profile.websiteUrl || '' };
                    await addProfileToUser(currentUser.uid, profileToSave);
                    window.dispatchEvent(new CustomEvent('profileUpdated', { detail: profileToSave }));
                    console.log('✔ Master User Profile auto-saved background sync completed.');
                } catch (err) {
                    console.warn('Master profile auto-save warning:', err);
                }
            }
        }, 1500);

        return () => clearTimeout(timer);
    }, [profile]);

    // Dynamic Experience Calculator: Merges overlapping work history date intervals into exact total experience span
    const calculateYearsOfExperience = (experiences) => {
        if (!experiences || !Array.isArray(experiences) || experiences.length === 0) return '3+ years';

        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        const monthMap = {
            jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
            jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
        };

        const intervals = [];

        experiences.forEach(exp => {
            if (!exp) return;
            const startStr = String(exp.startDate || exp.begin || '').trim();
            const endStr = String(exp.endDate || exp.end || '').trim();

            const startYearMatch = startStr.match(/\b(19\d\d|20\d\d)\b/);
            const endYearMatch = endStr.match(/\b(19\d\d|20\d\d)\b/);
            if (!startYearMatch) return;

            const startYear = parseInt(startYearMatch[1], 10);
            let endYear = endYearMatch ? parseInt(endYearMatch[1], 10) : currentYear;
            if (endStr.toLowerCase().includes('present') || !endStr) {
                endYear = currentYear;
            }

            let startMonth = 1;
            let endMonth = 12;

            const startLower = startStr.toLowerCase();
            for (const [key, val] of Object.entries(monthMap)) {
                if (startLower.includes(key)) { startMonth = val; break; }
            }

            const endLower = endStr.toLowerCase();
            if (endLower.includes('present') || !endStr) {
                endMonth = currentMonth;
            } else {
                for (const [key, val] of Object.entries(monthMap)) {
                    if (endLower.includes(key)) { endMonth = val; break; }
                }
            }

            const startTotalMonths = startYear * 12 + startMonth;
            const endTotalMonths = endYear * 12 + endMonth;

            if (endTotalMonths >= startTotalMonths) {
                intervals.push([startTotalMonths, endTotalMonths]);
            }
        });

        if (intervals.length === 0) return '3+ years';

        // Sort by start month
        intervals.sort((a, b) => a[0] - b[0]);

        // Merge overlapping intervals
        const merged = [intervals[0]];
        for (let i = 1; i < intervals.length; i++) {
            const last = merged[merged.length - 1];
            const curr = intervals[i];
            if (curr[0] <= last[1]) {
                last[1] = Math.max(last[1], curr[1]);
            } else {
                merged.push(curr);
            }
        }

        // Sum non-overlapping months
        let totalMonths = 0;
        merged.forEach(([start, end]) => {
            totalMonths += Math.max(1, end - start + 1);
        });

        const years = Math.max(1, Math.round(totalMonths / 12));
        return `${years}+ years`;
    };

    // REAL AI GENERATION FUNCTIONS (Synthesizes all filled profile details into Executive Bio)
    const handleWriteAiSummary = async () => {
        if (!profile.occupation && !profile.firstname) {
            triggerNotification('Please fill in your Basic Info & Occupation before generating your Executive Bio.', 'error');
            return;
        }
        setIsAiGenerating(true);
        try {
            const yearsExp = calculateYearsOfExperience(profile.workExperiences);
            const latestWorkRole = (profile.workExperiences && profile.workExperiences.length > 0 && profile.workExperiences[0].jobTitle) ? profile.workExperiences[0].jobTitle : '';
            const primaryRole = profile.occupation || latestWorkRole || 'Professional';
            const expDetails = profile.workExperiences.map(w => `${w.jobTitle || 'Role'} at ${w.company || 'Company'} (${w.startDate || ''} - ${w.endDate || 'Present'}) ${w.description ? ': ' + w.description : ''}`).filter(Boolean).join('; ');
            const eduDetails = profile.education.map(e => `${e.degree || 'Degree'} from ${e.school || 'University'} (${e.startDate || ''} - ${e.endDate || ''})`).filter(Boolean).join('; ');
            const skillsDetails = profile.skills.map(s => (typeof s === 'string' ? s : s.name)).filter(Boolean).join(', ');
            const certsDetails = profile.certifications.map(c => typeof c === 'string' ? c : `${c.title || ''}${c.issuer ? ' (' + c.issuer + ')' : ''}`).filter(Boolean).join(', ');
            const projectsDetails = profile.projects.map(p => `${p.title || p.name || 'Project'}: ${p.description || ''}`).filter(Boolean).join('; ');

            const data = await generateUserAiContent('generate-summary', {
                name: `${profile.firstname} ${profile.lastname}`.trim(),
                jobTitle: primaryRole,
                occupation: primaryRole,
                experience: yearsExp,
                workHistory: expDetails,
                education: eduDetails,
                skills: skillsDetails,
                certifications: certsDetails,
                projects: projectsDetails,
                achievement: expDetails ? expDetails.substring(0, 150) : '',
                summaryType: 'executive',
            });
            if (data && data.summary) {
                setProfile((prev) => ({ ...prev, summary: data.summary }));
                triggerNotification('Real AI Executive Bio generated based on your complete profile details!');
            } else {
                throw new Error('Invalid AI response');
            }
        } catch (err) {
            console.error('AI Summary Error:', err);
            triggerNotification('Failed to generate AI Executive Bio. Please try again.', 'error');
        }
        setIsAiGenerating(false);
    };

    const handleEnhanceWorkDescriptionWithAi = async (index) => {
        const job = profile.workExperiences[index];
        if (!job || !job.jobTitle) {
            triggerNotification('Please enter the Job Title for this position first.', 'error');
            return;
        }
        setIsAiGenerating(true);
        try {
            const data = await generateUserAiContent('generate-work-description', {
                jobTitle: job.jobTitle,
                employer: job.company || 'Organization',
                city: job.city || '',
                existingText: job.description || '',
            });
            if (data && data.suggestions && data.suggestions.length > 0) {
                const bulletText = data.suggestions.map(s => `• ${s.replace(/^[•\-\*]\s*/, '')}`).join('\n');
                updateWorkExperience(index, 'description', bulletText);
                triggerNotification('Real AI Work Experience bullet points generated!');
            } else {
                throw new Error('Invalid AI suggestions');
            }
        } catch (err) {
            console.error('AI Work Description Error:', err);
            triggerNotification('Failed to generate AI work description.', 'error');
        }
        setIsAiGenerating(false);
    };

    // DYNAMIC AI RECOMMENDATIONS FOR SKILLS & CERTIFICATIONS BASED ON ALL ENTERED DETAILS
    const handleRecommendAiSkills = async () => {
        setIsAiGenerating(true);
        try {
            const expDetails = profile.workExperiences.map(w => `${w.jobTitle || 'Role'} at ${w.company || ''}`).filter(Boolean).join('; ');
            const eduDetails = profile.education.map(e => `${e.degree || ''} from ${e.school || ''}`).filter(Boolean).join('; ');
            const projDetails = profile.projects.map(p => p.title || p.name).filter(Boolean).join(', ');
            const existing = profile.skills.map(s => (typeof s === 'string' ? s : s.name)).filter(Boolean);

            const data = await generateUserAiContent('generate-skills', {
                jobTitle: profile.occupation || 'Professional',
                occupation: profile.occupation || 'Professional',
                workHistory: expDetails,
                education: eduDetails,
                projects: projDetails,
                existingSkills: existing,
            });

            if (data && data.skills && Array.isArray(data.skills)) {
                const unadded = data.skills.filter(s => {
                    const name = typeof s === 'string' ? s : s.name;
                    return name && !existing.some(e => e.toLowerCase() === name.toLowerCase());
                });

                if (unadded.length > 0) {
                    setAiModalState({
                        isOpen: true,
                        title: `Review AI Recommended Skills for ${profile.occupation || 'your profile'}`,
                        type: 'skills',
                        items: unadded.map(s => {
                            const raw = typeof s === 'string' ? s : s.name;
                            const cleaned = cleanSkillName(raw);
                            return typeof s === 'string' ? { name: cleaned, category: 'mandatory' } : { ...s, name: cleaned };
                        }),
                        onApply: (approvedItems) => {
                            const newSkills = approvedItems.map(item => ({ name: cleanSkillName(item.name || item.title), level: 'Expert' }));
                            setProfile(prev => ({
                                ...prev,
                                skills: [...prev.skills, ...newSkills]
                            }));
                            triggerNotification(`Added ${newSkills.length} approved ATS skills to your profile!`);
                        }
                    });
                } else {
                    triggerNotification('Your skills list already covers all top recommended skills!');
                }
            }
        } catch (err) {
            console.error('AI Skills Recommendation Error:', err);
            triggerNotification('Failed to generate AI skills recommendations.', 'error');
        }
        setIsAiGenerating(false);
    };

    const handleRecommendAiCertifications = async () => {
        setIsAiGenerating(true);
        try {
            const expDetails = profile.workExperiences.map(w => `${w.jobTitle || 'Role'} at ${w.company || ''}`).filter(Boolean).join('; ');
            const eduDetails = profile.education.map(e => `${e.degree || ''} from ${e.school || ''}`).filter(Boolean).join('; ');
            const skillsDetails = profile.skills.map(s => (typeof s === 'string' ? s : s.name)).filter(Boolean).join(', ');
            const existingCerts = profile.certifications.map(c => c.title).filter(Boolean);

            const data = await generateUserAiContent('generate-certifications', {
                jobTitle: profile.occupation || 'Professional',
                occupation: profile.occupation || 'Professional',
                workHistory: expDetails,
                education: eduDetails,
                skills: skillsDetails,
                existingCertifications: existingCerts,
            });

            if (data && data.certifications && Array.isArray(data.certifications)) {
                const unadded = data.certifications.filter(c => {
                    const title = typeof c === 'string' ? c : c.title;
                    return title && !existingCerts.some(e => e.toLowerCase() === title.toLowerCase());
                });

                if (unadded.length > 0) {
                    setAiModalState({
                        isOpen: true,
                        title: `Review Industry Certifications for ${profile.occupation || 'your profile'}`,
                        type: 'certifications',
                        items: unadded,
                        onApply: (approvedItems) => {
                            const newCerts = approvedItems.map((c, i) => ({
                                id: `cert_ai_${Date.now()}_${i}`,
                                title: c.title || c.name,
                                issuer: c.issuer || 'Professional Accrediting Body',
                                date: `${new Date().getFullYear()}`
                            }));
                            setProfile(prev => ({
                                ...prev,
                                certifications: [...prev.certifications, ...newCerts]
                            }));
                            triggerNotification(`Added ${newCerts.length} approved certifications to your profile!`);
                        }
                    });
                } else {
                    triggerNotification('Your certifications list already covers all top recommended credentials!');
                }
            }
        } catch (err) {
            console.error('AI Certifications Recommendation Error:', err);
            triggerNotification('Failed to generate AI certification recommendations.', 'error');
        }
        setIsAiGenerating(false);
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
            skills: [...prev.skills, { name: '', level: 'Expert' }]
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
            languages: [...prev.languages, { id: `lang_${Date.now()}`, name: '', level: 'Native / Bilingual' }]
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
        // Open crop modal — don't compress until after the user crops
        const reader = new FileReader();
        reader.onloadend = () => setCropModalSrc(reader.result);
        reader.readAsDataURL(imageFile);
    };
    const handleCroppedImage = async (croppedDataUrl) => {
        setCropModalSrc(null);
        const currentUser = fire.auth().currentUser;
        // Update local state immediately so avatar shows at once
        setProfile((prev) => ({ ...prev, selectedImage: croppedDataUrl }));
        if (currentUser) {
            await uploadImageToFirebase(croppedDataUrl, currentUser.uid);
        }
    };

    const getPasswordStrength = (password) => {
        if (!password) return { strength: '', width: 'w-0', color: 'bg-slate-200', text: '' };
        if (password.length < 6) return { strength: 'weak', width: 'w-1/4', color: 'bg-red-500', text: 'Weak' };
        if (password.length < 8) return { strength: 'fair', width: 'w-2/4', color: 'bg-amber-500', text: 'Fair' };
        if (password.length < 10) return { strength: 'good', width: 'w-3/4', color: 'bg-indigo-500', text: 'Good' };
        return { strength: 'strong', width: 'w-full', color: 'bg-emerald-500', text: 'Strong' };
    };

    const passwordStrength = getPasswordStrength(accountSettings.password);
    const candidateFullName = `${profile.firstname} ${profile.lastname}`.trim() || profile.name;

    return (
        <>
        <div className="min-h-screen bg-slate-50 text-slate-900 pb-12 font-sans">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

                {/* Hero Master Profile Overview Card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-5">
                            <div className="relative">
                                <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-4 border-white shadow-md ring-2 ring-indigo-500/20">
                                    {profile.selectedImage ? (
                                        <img src={profile.selectedImage} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-2xl">
                                            {candidateFullName ? candidateFullName.charAt(0).toUpperCase() : 'U'}
                                        </div>
                                    )}
                                </div>
                                <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center shadow-xs">
                                    <FaCheck className="w-3 h-3 text-white" />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{candidateFullName || 'Master User Profile'}</h1>
                                    <span className="px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full">
                                        {databaseAccountSettings.membership || 'Pro Tier'}
                                    </span>
                                </div>
                                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                                    {profile.occupation ? `${profile.occupation} • ` : ''}{profile.email || 'Master User Profile'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setSelectedSettings('Profile')}
                                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                    selectedSettings === 'Profile' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}>
                                Master Profile Sync
                            </button>
                            <button
                                onClick={() => setSelectedSettings('Account')}
                                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                    selectedSettings === 'Account' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}>
                                Account & Security
                            </button>
                        </div>
                    </div>
                </div>

                {/* Inline Toast Banner */}
                {toastState && (
                    <div className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in duration-200 ${
                        toastState.type === 'error' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    }`}>
                        <div className="flex items-center gap-2">
                            {toastState.type === 'error' ? <FaExclamationTriangle className="w-4 h-4 text-red-600" /> : <FaCheckCircle className="w-4 h-4 text-emerald-600" />}
                            <span>{toastState.msg}</span>
                        </div>
                        <button onClick={() => setToastState(null)} className="font-bold ml-4 hover:opacity-75">✕</button>
                    </div>
                )}

                {/* Main Content Area */}
                {selectedSettings === 'Profile' ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">

                        {/* Profile Sub-Section Tabs */}
                        <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto text-xs font-semibold">
                            <button onClick={() => setProfileSubTab('basic')} className={`px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'basic' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                👤 Basic & Contact
                            </button>
                            <button onClick={() => setProfileSubTab('experience')} className={`px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'experience' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                💼 Work History ({profile.workExperiences.length})
                            </button>
                            <button onClick={() => setProfileSubTab('education')} className={`px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'education' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                🎓 Education ({profile.education.length})
                            </button>
                            <button onClick={() => setProfileSubTab('skills')} className={`px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'skills' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                🛠️ Skills ({profile.skills.length})
                            </button>
                            <button onClick={() => setProfileSubTab('certifications')} className={`px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'certifications' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                📜 Certifications ({profile.certifications.length})
                            </button>
                            <button onClick={() => setProfileSubTab('projects')} className={`px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'projects' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                🚀 Projects ({profile.projects.length})
                            </button>
                            <button onClick={() => setProfileSubTab('languages')} className={`px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'languages' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                🌐 Languages ({profile.languages.length})
                            </button>
                            <button onClick={() => setProfileSubTab('summary')} className={`px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'summary' ? 'bg-indigo-600 text-white font-bold' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'}`}>
                                ✨ Executive Bio (AI)
                            </button>
                        </div>

                        {/* Sub-Tab 1: Basic Details & Social Links */}
                        {profileSubTab === 'basic' && (
                            <div className="space-y-6">
                                {/* Avatar Upload */}
                                <div
                                    className={`p-6 border-2 border-dashed rounded-2xl transition-all ${
                                        isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100/60'
                                    }`}
                                    onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-200 border-2 border-white shadow-sm flex-shrink-0">
                                                {profile.selectedImage ? (
                                                    <img src={profile.selectedImage} alt="Avatar" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-indigo-600 text-white font-bold">
                                                        {candidateFullName ? candidateFullName.charAt(0).toUpperCase() : 'U'}
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-900">Profile Photo</p>
                                                <p className="text-[11px] text-slate-500">Drag and drop or browse photo for resume headers</p>
                                            </div>
                                        </div>
                                        <label className="cursor-pointer">
                                            <input type="file" onChange={handleImageUpload} className="sr-only" accept="image/*" />
                                            <span className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all">
                                                <FaUpload className="w-3 h-3 mr-2" /> Upload Photo
                                            </span>
                                        </label>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">First Name *</label>
                                        <input type="text" name="firstname" value={profile.firstname} onChange={handleInputChange} placeholder="First Name" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Last Name *</label>
                                        <input type="text" name="lastname" value={profile.lastname} onChange={handleInputChange} placeholder="Last Name" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                                        <input type="email" name="email" value={profile.email} onChange={handleInputChange} placeholder="Email" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number *</label>
                                        <input type="text" name="phone" value={profile.phone} onChange={handleInputChange} placeholder="Phone" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900" />
                                    </div>
                                    <div>
                                        <AutocompleteInputField
                                            label="Target Professional Title / Occupation"
                                            name="occupation"
                                            value={profile.occupation}
                                            onChange={handleInputChange}
                                            placeholder="e.g. Senior Full Stack Engineer"
                                            suggestionType="jobTitle"
                                            inputClassName="w-full text-xs p-3 pr-10 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                            labelClassName="block text-xs font-bold text-slate-700 mb-1"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Street Address</label>
                                        <input type="text" name="address" value={profile.address} onChange={handleInputChange} placeholder="Street Address" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900" />
                                    </div>
                                    <div>
                                        <AutocompleteInputField
                                            label="City & State"
                                            name="city"
                                            value={profile.city}
                                            onChange={(e) => handleInputChange({ target: { name: 'city', value: e.target.value } })}
                                            placeholder="City, State"
                                            suggestionType="city"
                                            inputClassName="w-full text-xs p-3 pr-9 bg-white border border-slate-300 rounded-xl text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                            labelClassName="block text-xs font-bold text-slate-700 mb-1"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Postal Code</label>
                                        <input type="text" name="postalCode" value={profile.postalCode} onChange={handleInputChange} placeholder="Postal Code" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">LinkedIn Profile URL</label>
                                        <input type="url" name="linkedinUrl" value={profile.linkedinUrl} onChange={handleInputChange} placeholder="https://linkedin.com/in/username" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">GitHub / Portfolio URL</label>
                                        <input type="url" name="githubUrl" value={profile.githubUrl} onChange={handleInputChange} placeholder="https://github.com/username" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Country</label>
                                        <input type="text" name="country" value={profile.country} onChange={handleInputChange} placeholder="Country (e.g. India)" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900" spellCheck="false" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Website / Portfolio URL</label>
                                        <input type="url" name="websiteUrl" value={profile.websiteUrl} onChange={handleInputChange} placeholder="https://yourwebsite.com" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Sub-Tab 2: Professional Bio / Executive Summary (WITH REAL AI) */}
                        {profileSubTab === 'summary' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Executive Bio & Professional Summary</h3>
                                        <p className="text-xs text-slate-500">Auto-loaded into all new resumes and AI cover letters.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleWriteAiSummary}
                                        disabled={isAiGenerating}
                                        className="px-4 py-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2">
                                        <FaMagic className="w-3.5 h-3.5" />
                                        <span>{isAiGenerating ? 'Writing with Real AI...' : '⚡ ✨ Write Executive Bio with AI'}</span>
                                    </button>
                                </div>
                                 <textarea name="summary" value={profile.summary} onChange={handleInputChange} spellCheck="true" placeholder="Write or click 'Write Executive Bio with AI' to generate..." className="w-full h-52 text-xs p-4 bg-white border border-slate-300 rounded-xl font-sans leading-relaxed text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                            </div>
                        )}

                        {/* Sub-Tab 3: Work History Array (WITH REAL AI) */}
                        {profileSubTab === 'experience' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Work History & Past Positions</h3>
                                        <p className="text-xs text-slate-500">Add past employment details to pre-populate all future resumes automatically.</p>
                                    </div>
                                    <button type="button" onClick={addWorkExperience} className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs">
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
                                        <div key={job.id || idx} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 relative">
                                            <button type="button" onClick={() => removeWorkExperience(idx)} className="absolute top-4 right-4 text-slate-400 hover:text-red-600 transition-colors">
                                                <FaTrash className="w-3.5 h-3.5" />
                                            </button>
                                            {/* Row 1: Primary Details */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div>
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
                                                <div>
                                                    <AutocompleteInputField
                                                        label="City / Location"
                                                        name="city"
                                                        value={job.city || ''}
                                                        onChange={(e) => updateWorkExperience(idx, 'city', e.target.value)}
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
                                                <div className="flex items-center justify-between mb-1">
                                                    <label className="block text-[11px] font-bold text-slate-700">Responsibilities / Accomplishment Bullets</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEnhanceWorkDescriptionWithAi(idx)}
                                                        disabled={isAiGenerating}
                                                        className="text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1">
                                                        <FaMagic className="w-3 h-3 text-indigo-600" />
                                                        <span>{isAiGenerating ? 'Enhancing...' : '⚡ Enhance Bullets with AI'}</span>
                                                    </button>
                                                </div>
                                                <textarea value={job.description} onChange={(e) => updateWorkExperience(idx, 'description', e.target.value)} spellCheck="true" placeholder="• Led development of core features..." className="w-full h-24 text-xs p-2.5 bg-white border border-slate-300 rounded-lg" />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* Sub-Tab 4: Education Array */}
                        {profileSubTab === 'education' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Education & Academic Degrees</h3>
                                        <p className="text-xs text-slate-500">Save degrees to automatically populate education sections in resumes.</p>
                                    </div>
                                    <button type="button" onClick={addEducation} className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs">
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
                                        <div key={edu.id || idx} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 relative">
                                            <button type="button" onClick={() => removeEducation(idx)} className="absolute top-4 right-4 text-slate-400 hover:text-red-600 transition-colors">
                                                <FaTrash className="w-3.5 h-3.5" />
                                            </button>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div>
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
                                                <div>
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
                                                        placeholder="e.g. Bangalore, India"
                                                        suggestionType="city"
                                                        inputClassName="w-full text-xs p-2.5 pr-8 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                        labelClassName="block text-[11px] font-bold text-slate-700 mb-1"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Description / Achievements</label>
                                                    <textarea value={edu.description || ''} onChange={(e) => updateEducation(idx, 'description', e.target.value)} placeholder="Notable achievements, GPA, thesis..." className="w-full h-16 text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 outline-none resize-none" spellCheck="true" />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* Sub-Tab 5: Skills */}
                        {profileSubTab === 'skills' && (
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Skills & Technical Competencies</h3>
                                        <p className="text-xs text-slate-500">Save core technical skills for auto-filling skills lists.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleRecommendAiSkills}
                                            disabled={isAiGenerating}
                                            className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm">
                                            <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                            <span>✨ Auto-Recommend Top Skills (AI)</span>
                                        </button>
                                        <button type="button" onClick={addSkill} className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs">
                                            <FaPlus className="w-3 h-3" /> Add Skill
                                        </button>
                                    </div>
                                </div>

                                {profile.skills.length === 0 ? (
                                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-3">
                                        <p className="text-xs font-semibold text-slate-700">No skills saved in Master Profile</p>
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleRecommendAiSkills}
                                                disabled={isAiGenerating}
                                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5">
                                                <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                                <span>✨ Auto-Recommend Top Skills (AI)</span>
                                            </button>
                                            <button type="button" onClick={addSkill} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold">
                                                Add Manually
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        {profile.skills.map((skill, idx) => (
                                            <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <AutocompleteInputField
                                                        hideLabel
                                                        name={`skill_${idx}`}
                                                        value={skill.name}
                                                        onChange={(e) => updateSkill(idx, 'name', e.target.value)}
                                                        placeholder="Skill name"
                                                        suggestionType="skill"
                                                        inputClassName="w-full text-xs p-2 pr-7 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                    />
                                                </div>
                                                <button type="button" onClick={() => removeSkill(idx)} className="text-slate-400 hover:text-red-600 transition-colors p-1">
                                                    <FaTrash className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
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
                                        <p className="text-xs text-slate-500">Add AWS, PMP, Scrum Master, or professional licenses.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleRecommendAiCertifications}
                                            disabled={isAiGenerating}
                                            className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm">
                                            <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                            <span>✨ Recommend Industry Certifications (AI)</span>
                                        </button>
                                        <button type="button" onClick={addCertification} className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs">
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
                                                <span>✨ Recommend Industry Certifications (AI)</span>
                                            </button>
                                            <button type="button" onClick={addCertification} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold">
                                                Add Manually
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    profile.certifications.map((cert, idx) => (
                                        <div key={cert.id || idx} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-4">
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
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
                                            </div>
                                            <button type="button" onClick={() => removeCertification(idx)} className="text-slate-400 hover:text-red-600 transition-colors p-2">
                                                <FaTrash className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))
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
                                    <button type="button" onClick={addLanguage} className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs">
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
                                                onClick={() => setProfile((prev) => ({ ...prev, languages: [...prev.languages, { id: `lang_${Date.now()}`, name: lang, level: 'Native / Bilingual' }] }))}
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
                                                        value={lang.level || 'Native / Bilingual'}
                                                        onChange={(e) => updateLanguage(idx, 'level', e.target.value)}
                                                        className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                                                    >
                                                        {PROFICIENCY_LEVELS.map((lvl) => (
                                                            <option key={lvl} value={lvl}>{lvl}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <button type="button" onClick={() => removeLanguage(idx)} className="text-slate-400 hover:text-red-600 transition-colors p-2">
                                                    <FaTrash className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sub-Tab 7: Personal Projects */}
                        {profileSubTab === 'projects' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Portfolio & Personal Projects</h3>
                                        <p className="text-xs text-slate-500">Add key open-source or commercial projects.</p>
                                    </div>
                                    <button type="button" onClick={addProject} className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs">
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
                                        <div key={proj.id || idx} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 relative">
                                            <button type="button" onClick={() => removeProject(idx)} className="absolute top-4 right-4 text-slate-400 hover:text-red-600 transition-colors">
                                                <FaTrash className="w-3.5 h-3.5" />
                                            </button>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <input type="text" value={proj.title} onChange={(e) => updateProject(idx, 'title', e.target.value)} placeholder="Project Title" className="text-xs p-2.5 bg-white border border-slate-300 rounded-lg font-semibold" />
                                                <input type="url" value={proj.link} onChange={(e) => updateProject(idx, 'link', e.target.value)} placeholder="Live Demo / Repository URL" className="text-xs p-2.5 bg-white border border-slate-300 rounded-lg" />
                                            </div>
                                            <textarea value={proj.description} onChange={(e) => updateProject(idx, 'description', e.target.value)} placeholder="Short project summary or key tech stack used..." className="w-full h-16 text-xs p-2.5 bg-white border border-slate-300 rounded-lg" />
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* Save Master Profile Button */}
                        <div className="flex justify-end pt-6 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2">
                                <FaCheckCircle className="w-4 h-4" />
                                <span>{isSubmitting ? 'Saving Master Profile...' : 'Save Master Profile'}</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Account & Security Settings */
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-8">
                        <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
                            <div className="p-2.5 bg-indigo-50 rounded-xl">
                                <FaCog className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-slate-900">Account Credentials & Security</h2>
                                <p className="text-xs text-slate-500">Manage account email, security password, and subscription tier.</p>
                            </div>
                        </div>

                        <form onSubmit={handleAccountSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Account Email Address</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={databaseAccountSettings.email}
                                        onChange={(e) => setDatabaseAccountSettings({ ...databaseAccountSettings, email: e.target.value })}
                                        className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Subscription Tier</label>
                                    <input
                                        type="text"
                                        disabled
                                        value={databaseAccountSettings.membership || 'Free Active Tier'}
                                        className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 font-semibold cursor-not-allowed"
                                    />
                                </div>
                            </div>

                            {/* Password Change Section */}
                            <div className="border-t border-slate-100 pt-6 space-y-4">
                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Change Account Password</h3>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">New Security Password</label>
                                    <input
                                        type="password"
                                        name="password"
                                        value={accountSettings.password}
                                        onChange={handleAccountInputChange}
                                        placeholder="Enter new password (min 6 characters)"
                                        className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900"
                                    />

                                    {accountSettings.password && (
                                        <div className="mt-3 space-y-1.5">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                    <div className={`h-full transition-all duration-300 ${passwordStrength.width} ${passwordStrength.color}`}></div>
                                                </div>
                                                <span className="text-[11px] font-bold text-slate-600 uppercase">{passwordStrength.text}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end pt-4 border-t border-slate-100">
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2">
                                    <FaCheckCircle className="w-3.5 h-3.5" />
                                    <span>{isSubmitting ? 'Updating Account...' : 'Update Account Security'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* AI Recommendation Review Modal */}
                <AiRecommendationModal
                    isOpen={aiModalState.isOpen}
                    onClose={() => setAiModalState((prev) => ({ ...prev, isOpen: false }))}
                    title={aiModalState.title}
                    type={aiModalState.type}
                    items={aiModalState.items}
                    onApply={aiModalState.onApply || (() => {})}
                />
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
        </>
    );
}

export default DashboardSettings;
