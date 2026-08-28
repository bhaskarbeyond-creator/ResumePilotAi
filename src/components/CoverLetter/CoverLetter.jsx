import React, { Component } from 'react';
import './CoverLetter.scss';
import logo from '../../assets/logo/logo.png';
import { withTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { saveCoverLetter, getUserCoverLetters, deleteCoverLetter, getProfileOfUser, createTrackedJob, getSystemSettings } from '../../services/api/platform';
import { resolveAtsScoreVisibility } from '../../utils/moduleFlags';
import { generateUserAiContent } from '../../services/aiService';
import fire from '../../conf/fire';
import TemplateRenderer from '../TemplateRenderer';
import { FaWhatsapp, FaEnvelope, FaLinkedin, FaTelegramPlane, FaCopy, FaPrint, FaFileDownload, FaExpand, FaTimes, FaSearchPlus, FaSearchMinus, FaEye, FaEdit, FaTrashAlt, FaClone, FaBriefcase, FaMagic, FaBullseye, FaCheckCircle, FaExclamationCircle, FaSlidersH, FaBookmark, FaSyncAlt } from 'react-icons/fa';

const AI_TONES = [
    {
        id: 'modern',
        name: 'Modern Professional',
        icon: '💼',
        desc: 'Crisp, approachable, balanced',
    },
    {
        id: 'formal',
        name: 'Executive Formal',
        icon: '👔',
        desc: 'Authoritative, corporate, measured',
    },
    {
        id: 'impact',
        name: 'Impact & Metrics',
        icon: '🚀',
        desc: 'High-energy, ROI & metrics-driven',
    },
    {
        id: 'creative',
        name: 'Creative Storyteller',
        icon: '✨',
        desc: 'Engaging, narrative, visionary',
    },
];

const COVER_TEMPLATES = [
    {
        id: 'Cover1',
        name: 'Executive Classic',
        badge: 'Classic',
        description: 'Centered executive letterhead with blue gradient accent bar.',
        color: 'from-blue-600 to-indigo-700',
    },
    {
        id: 'Cover2',
        name: 'Modern Left-Aligned',
        badge: 'Modern',
        description: 'Crisp, left-aligned layout with dark horizontal divider.',
        color: 'from-slate-700 to-slate-900',
    },
    {
        id: 'Cover3',
        name: 'Split Sidebar',
        badge: 'Two-Column',
        description: 'Side-by-side recipient card and sender contact pane.',
        color: 'from-indigo-600 to-blue-500',
    },
    {
        id: 'Cover4',
        name: 'Accent Icons',
        badge: 'Creative',
        description: 'Modern header with contact icons and job title accent.',
        color: 'from-blue-700 to-amber-500',
    },
];

class CoverLetter extends Component {
    constructor(props) {
        super(props);
        this.state = {
            step: 1,
            currentId: null,
            // Candidate Dynamic Details (Zero hardcoded fallbacks)
            candidateFirstname: '',
            candidateLastname: '',
            candidateEmail: '',
            candidatePhone: '',
            candidateAddress: '',
            candidateCity: '',
            candidatePostalCode: '',
            // Recipient & Job Details
            jobTitle: '',
            companyName: '',
            recipientName: '',
            companyAddress: '',
            companyCity: '',
            companyPostalCode: '',
            userSkills: '',
            letterBody: '',
            // UI Controls
            templateId: 'Cover1',
            viewMode: 'visual', // 'visual' | 'text'
            isAiGenerating: false,
            savedLetters: [],
            isSaving: false,
            notificationMessage: null,
            letterToDelete: null,
            // Modal Preview State
            showPreviewModal: false,
            modalZoom: 0.65,
            // 10/10 SWOT Enhancements
            aiTone: 'modern',
            jobDescription: '',
            showAtsSection: false,
            isSyncingTracker: false,
            isAtsEnabled: null,
            isCoverLetterEnabled: true,
        };
        this.aiRequestController = null;
        this.unsubscribePublicConfig = null;
        this.handleSettingsUpdated = null;
    }

    async componentDidMount() {
        this.loadSavedLetters();
        await this.loadUserProfileData();
        document.addEventListener('keydown', this.handleKeyDown);
        this.subscribeAtsVisibility();

        // Listen for Firebase Auth initialization to dynamically hydrate master profile
        this.authUnsubscribe = fire.auth().onAuthStateChanged(async (user) => {
            if (user) {
                this.loadSavedLetters();
                await this.loadUserProfileData();
            }
        });
    }

    componentWillUnmount() {
        document.removeEventListener('keydown', this.handleKeyDown);
        if (typeof this.authUnsubscribe === 'function') {
            this.authUnsubscribe();
            this.authUnsubscribe = null;
        }
        if (typeof this.handleSettingsUpdated === 'function') {
            window.removeEventListener('systemSettingsUpdated', this.handleSettingsUpdated);
            this.handleSettingsUpdated = null;
        }
        const controller = this.aiRequestController;
        this.aiRequestController = null;
        controller?.abort();
    }

    applyAtsVisibility = (settings, { allowMissingDefault = true } = {}) => {
        const atsVisible = resolveAtsScoreVisibility(settings, { allowMissingDefault });
        const nextState = {};
        if (atsVisible !== null) nextState.isAtsEnabled = atsVisible;
        if (settings?.modules && Object.prototype.hasOwnProperty.call(settings.modules, 'enableCoverLetterModule')) {
            nextState.isCoverLetterEnabled = settings.modules.enableCoverLetterModule === true;
        }
        if (Object.keys(nextState).length) this.setState(nextState);
    };

    subscribeAtsVisibility = () => {
        // Settings are delivered by the authenticated API event bridge; there is no browser data-store listener.
        getSystemSettings().then((settings) => {
            this.applyAtsVisibility(settings, { allowMissingDefault: true });
        }).catch(() => {
            this.setState({ isAtsEnabled: false });
        });

        this.handleSettingsUpdated = (event) => {
            if (event.detail?.modules) {
                this.applyAtsVisibility({ modules: event.detail.modules }, { allowMissingDefault: false });
                return;
            }
            if (event.detail?.category === 'modules') {
                getSystemSettings().then((settings) => {
                    this.applyAtsVisibility(settings, { allowMissingDefault: true });
                }).catch(() => {});
            }
        };
        window.addEventListener('systemSettingsUpdated', this.handleSettingsUpdated);
    };

    handleKeyDown = (e) => {
        if (e.key === 'Escape' && this.state.showPreviewModal) {
            this.setState({ showPreviewModal: false });
        }
    };

    getDefaultLetterBody = () => {
        `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim() || 'Applicant';
        const role = this.state.jobTitle || 'the open position';
        const company = this.state.companyName || 'your organization';
        const skills = this.state.userSkills || 'relevant professional experience and technical leadership';

        return `I am writing to express my enthusiastic interest in the ${role} position at ${company}. With a strong foundation in ${skills}, I am confident in my ability to deliver immediate value and contribute effectively to your team's strategic goals.\n\nThroughout my career, I have dedicated myself to high-quality execution, systematic problem-solving, and cross-functional collaboration. My hands-on experience enables me to adapt rapidly, streamline complex workflows, and deliver measurable outcomes that align with organizational objectives.\n\nI admire ${company}'s work and industry impact, and I would welcome the opportunity to discuss how my qualifications can support your team. Thank you for your time and consideration.`;
    };

    loadUserProfileData = async () => {
        try {
            let firstname = this.state.candidateFirstname || '';
            let lastname = this.state.candidateLastname || '';
            let email = this.state.candidateEmail || '';
            let phone = this.state.candidatePhone || '';
            let address = this.state.candidateAddress || '';
            let city = this.state.candidateCity || '';
            let postalcode = this.state.candidatePostalCode || '';
            let occupation = this.state.jobTitle || '';
            let skills = this.state.userSkills || '';

            // 1. Authoritative MariaDB profile through the authenticated API
            const user = fire.auth().currentUser;
            if (user) {
                if (!email) email = user.email || '';
                if (!firstname && user.displayName) {
                    const parts = user.displayName.split(' ');
                    firstname = parts[0] || '';
                    lastname = parts.slice(1).join(' ') || '';
                }

                try {
                    const profile = await getProfileOfUser(user.uid);
                    if (profile) {
                        if (profile.firstname) firstname = profile.firstname;
                        else if (profile.name) {
                            const parts = profile.name.split(' ');
                            firstname = parts[0] || firstname;
                            lastname = parts.slice(1).join(' ') || lastname;
                        }
                        if (profile.lastname) lastname = profile.lastname;
                        if (profile.email) email = profile.email;
                        if (profile.phone) phone = profile.phone;
                        if (profile.address) address = profile.address;
                        if (profile.city) city = profile.city;
                        if (profile.postalCode || profile.postalcode) postalcode = profile.postalCode || profile.postalcode;
                        if (profile.occupation) occupation = profile.occupation;
                        if (Array.isArray(profile.skills)) {
                            skills = profile.skills.map(s => s.name || s).join(', ');
                        } else if (typeof profile.skills === 'string' && profile.skills) {
                            skills = profile.skills;
                        }
                    }
                } catch (profileErr) {
                    console.warn('[CoverLetter] profile API fetch error:', profileErr);
                }
            }

            // 2. Active Resume Item in localStorage (for additional skills / occupation context if empty)
            if (!skills || !occupation) {
                const localItem = localStorage.getItem('currentResumeItem');
                if (localItem && localItem !== 'null' && localItem !== 'undefined') {
                    try {
                        const parsed = JSON.parse(localItem);
                        const item = parsed.item || parsed;
                        if (item) {
                            if (!firstname && item.firstname) firstname = item.firstname;
                            if (!lastname && item.lastname) lastname = item.lastname;
                            if (!email && item.email) email = item.email;
                            if (!phone && item.phone) phone = item.phone;
                            if (!address && item.address) address = item.address;
                            if (!city && item.city) city = item.city;
                            if (!postalcode && (item.postalcode || item.postalCode)) postalcode = item.postalcode || item.postalCode;
                            if (!occupation && (item.occupation || item.jobTitle)) occupation = item.occupation || item.jobTitle;
                            if (!skills) {
                                if (Array.isArray(item.skills)) {
                                    skills = item.skills.map(s => s.name || s).join(', ');
                                } else if (typeof item.skills === 'string') {
                                    skills = item.skills;
                                }
                            }
                        }
                    } catch (_e) {}
                }
            }

            this.setState({
                candidateFirstname: firstname,
                candidateLastname: lastname,
                candidateEmail: email,
                candidatePhone: phone,
                candidateAddress: address,
                candidateCity: city,
                candidatePostalCode: postalcode,
                jobTitle: this.state.jobTitle || occupation,
                userSkills: this.state.userSkills || skills,
            });
        } catch (err) {
            console.error('Error loading user profile for cover letter:', err);
        }
    };

    loadSavedLetters = async () => {
        const letters = await getUserCoverLetters();
        this.setState({ savedLetters: letters });
    };

    handleResetForm = () => {
        this.setState({
            step: 1,
            currentId: null,
            jobTitle: '',
            companyName: '',
            recipientName: '',
            companyAddress: '',
            companyCity: '',
            companyPostalCode: '',
            letterBody: '',
            templateId: 'Cover1',
            notificationMessage: 'Cover letter builder reset. Enter recipient details to generate a new letter.',
        });
        setTimeout(() => this.setState({ notificationMessage: null }), 4000);
    };

    handleSaveCoverLetter = async () => {
        this.setState({ isSaving: true });
        const effectiveBody = this.state.letterBody || this.getDefaultLetterBody();
        const letterData = {
            id: this.state.currentId || `cl_${Date.now()}`,
            candidateFirstname: this.state.candidateFirstname,
            candidateLastname: this.state.candidateLastname,
            candidateEmail: this.state.candidateEmail,
            candidatePhone: this.state.candidatePhone,
            candidateAddress: this.state.candidateAddress,
            candidateCity: this.state.candidateCity,
            candidatePostalCode: this.state.candidatePostalCode,
            jobTitle: this.state.jobTitle,
            companyName: this.state.companyName,
            recipientName: this.state.recipientName,
            companyAddress: this.state.companyAddress,
            companyCity: this.state.companyCity,
            companyPostalCode: this.state.companyPostalCode,
            letterBody: effectiveBody,
            templateId: this.state.templateId || 'Cover1',
            updatedAt: new Date().toISOString(),
        };
        const res = await saveCoverLetter(letterData);
        this.setState({ isSaving: false, letterBody: effectiveBody });
        if (res.success) {
            this.setState({
                currentId: res.id,
                notificationMessage: 'Cover letter saved securely to your Dashboard cloud storage!',
            });
            this.loadSavedLetters();
            setTimeout(() => this.setState({ notificationMessage: null }), 5000);
        }
    };

    handleConfirmDeleteCoverLetter = async () => {
        if (!this.state.letterToDelete) return;
        const res = await deleteCoverLetter(this.state.letterToDelete.id);
        if (res.success) {
            this.setState({
                letterToDelete: null,
                notificationMessage: 'Cover letter deleted successfully from cloud storage.',
            });
            if (this.state.currentId === this.state.letterToDelete?.id) {
                this.handleResetForm();
            }
            this.loadSavedLetters();
            setTimeout(() => this.setState({ notificationMessage: null }), 4000);
        }
    };

    handleDuplicateCoverLetter = async (letter) => {
        const clonedData = {
            ...letter,
            id: `cl_${Date.now()}`,
            jobTitle: `${letter.jobTitle || 'Cover Letter'} (Copy)`,
            templateId: letter.templateId || 'Cover1',
            updatedAt: new Date().toISOString(),
        };
        const res = await saveCoverLetter(clonedData);
        if (res.success) {
            this.setState({ notificationMessage: 'Cover letter duplicated successfully!' });
            this.loadSavedLetters();
            setTimeout(() => this.setState({ notificationMessage: null }), 4000);
        }
    };

    calculateAtsMetrics = (letterBody, jobDesc) => {
        if (!jobDesc || !jobDesc.trim()) return null;

        const stopWords = new Set([
            'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'were', 'will', 'your', 'about', 'more',
            'into', 'than', 'them', 'their', 'there', 'they', 'what', 'when', 'which', 'who', 'whom', 'why',
            'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'same',
            'over', 'such', 'through', 'under', 'further', 'then', 'once', 'here', 'where', 'also', 'such',
            'able', 'work', 'working', 'role', 'team', 'company', 'candidate', 'apply', 'skills', 'experience',
            'years', 'opportunity', 'position', 'requirements', 'responsibilities', 'qualifications', 'must',
            'should', 'ideal', 'looking', 'join', 'help', 'drive', 'grow', 'plus', 'need', 'needs', 'strong'
        ]);

        const jdTokens = jobDesc
            .toLowerCase()
            .replace(/[^a-z0-9+#.\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 3 && !stopWords.has(w));

        const freqMap = {};
        jdTokens.forEach(t => { freqMap[t] = (freqMap[t] || 0) + 1; });

        const targetKeywords = Object.keys(freqMap)
            .sort((a, b) => freqMap[b] - freqMap[a])
            .slice(0, 12);

        if (targetKeywords.length === 0) return null;

        const lowerLetter = (letterBody || '').toLowerCase();
        const matched = [];
        const missing = [];

        targetKeywords.forEach(kw => {
            const escaped = String(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const bounded = new RegExp(`(?:^|[^a-z0-9+#.])${escaped}(?:$|[^a-z0-9+#.])`, 'i');
            if (bounded.test(lowerLetter)) {
                matched.push(kw);
            } else {
                missing.push(kw);
            }
        });

        const score = Math.min(100, Math.max(30, Math.round((matched.length / targetKeywords.length) * 100)));
        return { score, matched, missing };
    };

    handleSyncToJobTracker = async (letter = null) => {
        const user = fire.auth().currentUser;
        if (!user) {
            this.setState({ notificationMessage: 'Please log in to sync applications with Job Tracker.' });
            return;
        }

        const targetTitle = letter?.jobTitle || this.state.jobTitle || 'Target Position';
        const targetCompany = letter?.companyName || this.state.companyName || 'Target Company';
        const targetBody = letter?.letterBody || this.state.letterBody || this.getDefaultLetterBody();
        const targetTemplate = letter?.templateId || this.state.templateId || 'Cover1';

        this.setState({ isSyncingTracker: true });
        try {
            const newJobPayload = {
                title: targetTitle,
                company: targetCompany,
                location: letter?.companyCity || this.state.companyCity || 'Remote / Hybrid',
                url: '',
                status: 'applied',
                notes: `[Cover Letter Linked] Formatted using ${targetTemplate} template on ${new Date().toLocaleDateString()}.\n\nPreview:\n${targetBody.slice(0, 250)}...`,
                deadline: ''
            };

            await createTrackedJob(user.uid, newJobPayload);
            this.setState({
                isSyncingTracker: false,
                notificationMessage: `✓ Successfully synced "${targetTitle} at ${targetCompany}" to your Job Tracker!`
            });
            setTimeout(() => this.setState({ notificationMessage: null }), 5000);
        } catch (err) {
            console.error('Job tracker sync error:', err);
            this.setState({
                isSyncingTracker: false,
                notificationMessage: `Failed to sync to Job Tracker: ${err.message || 'Unknown error'}`
            });
            setTimeout(() => this.setState({ notificationMessage: null }), 5000);
        }
    };

    generateAiCoverLetter = async (overrideTone = null) => {
        this.aiRequestController?.abort();
        const requestController = new AbortController();
        this.aiRequestController = requestController;
        const effectiveTone = overrideTone || this.state.aiTone || 'modern';
        this.setState({ isAiGenerating: true, aiTone: effectiveTone });
        try {
            const currentLang = this.props.i18n?.language || 'en';
            const data = await generateUserAiContent('generate-ai-cover-letter', {
                jobTitle: this.state.jobTitle,
                companyName: this.state.companyName,
                recipientName: this.state.recipientName,
                userSkills: this.state.userSkills,
                candidateName: `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim(),
                yearsExperience: this.state.yearsExperience || (this.state.userSkills ? `${Math.max(2, this.state.userSkills.split(',').length * 2)}+` : '3+'),
                tone: effectiveTone,
                aiTone: effectiveTone,
                jobDescription: this.state.jobDescription,
                language: currentLang
            }, { signal: requestController.signal });

            if (data.success && data.coverLetter) {
                this.setState({ letterBody: data.coverLetter, isAiGenerating: false, step: 2 });
                await this.handleSaveCoverLetter();
            } else {
                throw new Error(data.error || 'Failed to generate AI cover letter');
            }
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('AI Cover Letter Error:', err);
            const fallback = this.getDefaultLetterBody();
            this.setState({ letterBody: fallback, isAiGenerating: false, step: 2 });
            await this.handleSaveCoverLetter();
        } finally {
            if (this.aiRequestController === requestController) {
                this.aiRequestController = null;
                this.setState({ isAiGenerating: false });
            }
        }
    };

    exportCoverLetterTxt = () => {
        try {
            const firstName = (this.state.candidateFirstname || '').trim();
            const lastName = (this.state.candidateLastname || '').trim();
            const fullName = `${firstName} ${lastName}`.trim() || 'Candidate Name';
            const effectiveBody = (this.state.letterBody || this.getDefaultLetterBody()).trim();
            const recipientName = (this.state.recipientName || 'Hiring Manager').trim();
            const companyName = (this.state.companyName || '').trim();
            const addressLine = [this.state.candidateAddress, this.state.candidateCity, this.state.candidatePostalCode].filter(Boolean).join(', ');
            const companyAddressLine = [this.state.companyAddress, this.state.companyCity, this.state.companyPostalCode].filter(Boolean).join(', ');
            const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

            const contactDetails = [
                this.state.candidatePhone ? `Phone: ${this.state.candidatePhone}` : '',
                this.state.candidateEmail ? `Email: ${this.state.candidateEmail}` : '',
            ].filter(Boolean).join(' | ');

            let textContent = `${fullName}\n`;
            if (addressLine) textContent += `${addressLine}\n`;
            if (contactDetails) textContent += `${contactDetails}\n`;
            textContent += `\nDate: ${dateStr}\n\n`;

            if (recipientName || companyName || companyAddressLine) {
                textContent += `To:\n`;
                if (recipientName) textContent += `${recipientName}\n`;
                if (companyName) textContent += `${companyName}\n`;
                if (companyAddressLine) textContent += `${companyAddressLine}\n`;
                textContent += `\n`;
            }

            textContent += `Dear ${recipientName},\n\n`;
            textContent += `${effectiveBody}\n\n`;
            textContent += `Sincerely,\n${fullName}\n`;

            const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            const safeName = fullName.replace(/[^a-zA-Z0-9_-]/g, '_');
            const safeCompany = companyName ? companyName.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Company';
            a.download = `Cover_Letter_${safeName}_${safeCompany}.txt`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                try {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                } catch (_) {}
            }, 300);

            this.setState({ notificationMessage: `Downloaded ${a.download} successfully!` });
            setTimeout(() => this.setState({ notificationMessage: null }), 6000);
        } catch (err) {
            console.error('TXT Download error:', err);
            this.setState({ notificationMessage: 'Could not trigger download. Please try again.' });
        }
    };

    handleShareWhatsApp = () => {
        const fullName = `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim() || 'Candidate';
        const role = this.state.jobTitle || 'Position';
        const company = this.state.companyName ? `at ${this.state.companyName}` : '';
        const body = (this.state.letterBody || this.getDefaultLetterBody()).trim();
        const text = `*Cover Letter for ${role} ${company}*\n\nCandidate: ${fullName}\n\nDear ${this.state.recipientName || 'Hiring Manager'},\n\n${body}\n\nSincerely,\n${fullName}`;
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    handleShareEmail = () => {
        const fullName = `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim() || 'Candidate';
        const role = this.state.jobTitle || 'Job Application';
        const company = this.state.companyName ? `at ${this.state.companyName}` : '';
        const subject = `Cover Letter: ${role} ${company} - ${fullName}`;
        const body = `Dear ${this.state.recipientName || 'Hiring Manager'},\n\n${(this.state.letterBody || this.getDefaultLetterBody()).trim()}\n\nSincerely,\n${fullName}`;
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    handleShareTelegram = () => {
        const fullName = `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim() || 'Candidate';
        const role = this.state.jobTitle || 'Application';
        const body = (this.state.letterBody || this.getDefaultLetterBody()).trim();
        const text = `*Cover Letter: ${role}*\nCandidate: ${fullName}\n\n${body}`;
        const url = `https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(text)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    handleShareLinkedIn = async () => {
        await this.handleCopyFormattedText();
        this.setState({ notificationMessage: '✓ Formatted cover letter copied to clipboard! Opening LinkedIn messaging...' });
        setTimeout(() => {
            window.open('https://www.linkedin.com/messaging/', '_blank', 'noopener,noreferrer');
        }, 600);
    };

    handleShareLetterWhatsApp = (letter) => {
        const candidateName = letter.candidateFirstname ? `${letter.candidateFirstname} ${letter.candidateLastname || ''}`.trim() : `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim();
        const role = letter.jobTitle || 'Job Application';
        const company = letter.companyName ? `at ${letter.companyName}` : '';
        const body = (letter.letterBody || this.getDefaultLetterBody()).trim();
        const text = `*Cover Letter for ${role} ${company}*\n\nCandidate: ${candidateName}\n\nDear ${letter.recipientName || 'Hiring Manager'},\n\n${body}\n\nSincerely,\n${candidateName}`;
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    handleShareLetterEmail = (letter) => {
        const candidateName = letter.candidateFirstname ? `${letter.candidateFirstname} ${letter.candidateLastname || ''}`.trim() : `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim();
        const role = letter.jobTitle || 'Job Application';
        const company = letter.companyName ? `at ${letter.companyName}` : '';
        const subject = `Cover Letter: ${role} ${company} - ${candidateName}`;
        const body = `Dear ${letter.recipientName || 'Hiring Manager'},\n\n${(letter.letterBody || this.getDefaultLetterBody()).trim()}\n\nSincerely,\n${candidateName}`;
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    handleShareLetterTelegram = (letter) => {
        const candidateName = letter.candidateFirstname ? `${letter.candidateFirstname} ${letter.candidateLastname || ''}`.trim() : `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim();
        const role = letter.jobTitle || 'Application';
        const body = (letter.letterBody || this.getDefaultLetterBody()).trim();
        const text = `*Cover Letter: ${role}*\nCandidate: ${candidateName}\n\n${body}`;
        const url = `https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(text)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    handleShareLetterLinkedIn = async (letter) => {
        await this.handleCopyLetterText(letter);
        this.setState({ notificationMessage: '✓ Formatted cover letter copied to clipboard! Opening LinkedIn messaging...' });
        setTimeout(() => {
            window.open('https://www.linkedin.com/messaging/', '_blank', 'noopener,noreferrer');
        }, 600);
    };

    handleCopyLetterText = async (letter) => {
        try {
            const candidateName = letter.candidateFirstname ? `${letter.candidateFirstname} ${letter.candidateLastname || ''}`.trim() : `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim();
            const recipientName = (letter.recipientName || 'Hiring Manager').trim();
            const body = (letter.letterBody || this.getDefaultLetterBody()).trim();
            const text = `Dear ${recipientName},\n\n${body}\n\nSincerely,\n${candidateName}`;
            await navigator.clipboard.writeText(text);
            this.setState({ notificationMessage: `✓ Copied "${letter.jobTitle || 'Cover Letter'}" to clipboard!` });
            setTimeout(() => this.setState({ notificationMessage: null }), 4000);
        } catch (err) {
            console.error('Clipboard copy error:', err);
        }
    };

    handleCopyFormattedText = async () => {
        await this.handleCopyLetterText({
            candidateFirstname: this.state.candidateFirstname,
            candidateLastname: this.state.candidateLastname,
            recipientName: this.state.recipientName,
            letterBody: this.state.letterBody || this.getDefaultLetterBody(),
            jobTitle: this.state.jobTitle,
        });
    };

    handleViewSavedLetter = (letter) => {
        this.setState({
            currentId: letter.id,
            candidateFirstname: letter.candidateFirstname || this.state.candidateFirstname,
            candidateLastname: letter.candidateLastname || this.state.candidateLastname,
            candidateEmail: letter.candidateEmail || this.state.candidateEmail,
            candidatePhone: letter.candidatePhone || this.state.candidatePhone,
            candidateAddress: letter.candidateAddress || this.state.candidateAddress,
            candidateCity: letter.candidateCity || this.state.candidateCity,
            candidatePostalCode: letter.candidatePostalCode || this.state.candidatePostalCode,
            jobTitle: letter.jobTitle,
            companyName: letter.companyName,
            recipientName: letter.recipientName,
            companyAddress: letter.companyAddress || '',
            companyCity: letter.companyCity || '',
            companyPostalCode: letter.companyPostalCode || '',
            letterBody: letter.letterBody,
            templateId: letter.templateId || 'Cover1',
            showPreviewModal: true,
        });
    };

    getTemplateInfo = (templateId) => {
        return COVER_TEMPLATES.find(t => t.id === templateId) || {
            id: templateId || 'Cover1',
            name: templateId === 'Cover4' ? 'Accent Icons' : templateId === 'Cover2' ? 'Modern Left-Aligned' : templateId === 'Cover3' ? 'Split Sidebar' : 'Executive Classic',
            badge: 'Classic',
            color: 'from-blue-600 to-indigo-700'
        };
    };

    handlePrintCoverLetter = () => {
        try {
            const coverElement = document.getElementById('resumen');
            if (!coverElement) {
                window.print();
                return;
            }

            const coverHtml = coverElement.outerHTML;
            let styleSheets = '';
            document.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
                styleSheets += node.outerHTML;
            });

            let printFrame = document.getElementById('cover-letter-print-frame');
            if (printFrame) {
                try { printFrame.remove(); } catch (_) {}
            }
            printFrame = document.createElement('iframe');
            printFrame.id = 'cover-letter-print-frame';
            printFrame.style.position = 'fixed';
            printFrame.style.right = '0';
            printFrame.style.bottom = '0';
            printFrame.style.width = '0';
            printFrame.style.height = '0';
            printFrame.style.border = '0';
            document.body.appendChild(printFrame);

            const frameDoc = printFrame.contentWindow.document;
            frameDoc.open();
            frameDoc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8" />
                    <title>${this.state.jobTitle || 'Cover Letter'} - ${this.state.candidateFirstname} ${this.state.candidateLastname}</title>
                    ${styleSheets}
                    <style>
                        @page {
                            size: A4 portrait;
                            margin: 0;
                        }
                        *, *::before, *::after {
                            box-sizing: border-box !important;
                            transform: none !important;
                        }
                        html, body {
                            background: #ffffff !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            width: 100% !important;
                            height: auto !important;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        #resumen, [class*="-board"] {
                            width: 100% !important;
                            max-width: 210mm !important;
                            min-height: 297mm !important;
                            margin: 0 auto !important;
                            padding: 20mm 20mm !important;
                            box-sizing: border-box !important;
                            box-shadow: none !important;
                            border: none !important;
                            background: #ffffff !important;
                        }
                        [class*="-content"] {
                            width: 100% !important;
                            max-width: 100% !important;
                        }
                    </style>
                </head>
                <body>
                    ${coverHtml}
                </body>
                </html>
            `);
            frameDoc.close();

            setTimeout(() => {
                try {
                    printFrame.contentWindow.focus();
                    printFrame.contentWindow.print();
                } catch (e) {
                    console.error('Print trigger error:', e);
                    window.print();
                }
                setTimeout(() => {
                    try { printFrame.remove(); } catch (_) {}
                }, 3000);
            }, 350);
        } catch (err) {
            console.error('Print error:', err);
            window.print();
        }
    };

    render() {
        if (this.state.isCoverLetterEnabled === false) {
            return (
                <div className="cover-letter min-h-screen bg-slate-50 p-8">
                    <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center">
                        <h1 className="text-lg font-bold text-slate-900">Cover letters are unavailable</h1>
                        <p className="text-sm text-slate-600 mt-2">This workspace has the cover letter module turned off.</p>
                        <Link to="/dashboard" className="inline-block mt-5 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl">Back to Dashboard</Link>
                    </div>
                </div>
            );
        }
        const candidateFullName = `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim();
        const activeTemplate = COVER_TEMPLATES.find(tpl => tpl.id === (this.state.templateId || 'Cover1')) || COVER_TEMPLATES[0];
        const effectiveBody = this.state.letterBody || this.getDefaultLetterBody();
        const atsMetrics = this.state.isAtsEnabled === true
            ? this.calculateAtsMetrics(effectiveBody, this.state.jobDescription)
            : null;

        // Format multi-paragraph components
        const paragraphList = effectiveBody
            .split(/\n\n+/)
            .filter(Boolean)
            .map(para => ({ type: 'Paragraph', content: para.trim() }));

        // Template Values Payload matching all 4 Cover templates
        const templateValues = {
            firstname: this.state.candidateFirstname,
            lastname: this.state.candidateLastname,
            address: this.state.candidateAddress,
            city: this.state.candidateCity,
            postalcode: this.state.candidatePostalCode,
            phone: this.state.candidatePhone,
            email: this.state.candidateEmail,
            occupation: this.state.jobTitle,
            employerFullName: this.state.recipientName,
            recipientName: this.state.recipientName,
            companyName: this.state.companyName,
            companyAddress: this.state.companyAddress,
            companyCity: this.state.companyCity,
            companyPostalCode: this.state.companyPostalCode,
            letterBody: effectiveBody,
            coverLetterContent: effectiveBody,
            components: paragraphList
        };

        return (
            <div className="cover-letter">
                {/* Dedicated Unscaled Full-Page Print Document (Only Rendered during @media print) */}
                <div className="cover-letter-print-document">
                    <TemplateRenderer
                        templateId={this.state.templateId || 'Cover1'}
                        values={templateValues}
                        language={this.props.i18n?.language || 'en'}
                    />
                </div>

                {/* On-Screen Interactive UI (Suppressed in Print) */}
                <div className="cover-letter-ui no-print min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8 font-sans">
                {/* Fullscreen Preview Modal (Same as Resume Preview Modal) */}
                {this.state.showPreviewModal && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
                        <div
                            role="dialog"
                            aria-modal="true"
                            className="relative w-full max-w-6xl max-h-[94vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
                            {/* Modal Header */}
                            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                                        <FaExpand className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-slate-900">Cover Letter Preview</h2>
                                        <p className="text-xs text-slate-500 font-medium">
                                            {activeTemplate.name} ({activeTemplate.id}) • A4 Print Ready
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* Zoom Controls */}
                                    <div className="hidden sm:flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl">
                                        <button
                                            type="button"
                                            onClick={() => this.setState(prev => ({ modalZoom: Math.max(0.4, prev.modalZoom - 0.1) }))}
                                            className="p-1.5 text-slate-700 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                                            title="Zoom Out">
                                            <FaSearchMinus className="w-3.5 h-3.5" />
                                        </button>
                                        <span className="text-[11px] font-mono font-bold px-2 text-slate-700 min-w-[45px] text-center">
                                            {Math.round(this.state.modalZoom * 100)}%
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => this.setState(prev => ({ modalZoom: Math.min(1.0, prev.modalZoom + 0.1) }))}
                                            className="p-1.5 text-slate-700 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                                            title="Zoom In">
                                            <FaSearchPlus className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    {/* Print / Save PDF in Modal */}
                                    <button
                                        onClick={this.handlePrintCoverLetter}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2">
                                        <FaPrint className="w-3.5 h-3.5" />
                                        <span>Print / PDF</span>
                                    </button>

                                    {/* Close Button */}
                                    <button
                                        onClick={() => this.setState({ showPreviewModal: false })}
                                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                                        aria-label="Close Preview">
                                        <FaTimes className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Canvas Body */}
                            <div className="flex-1 overflow-auto bg-slate-100/90 p-4 sm:p-8 flex justify-center items-start custom-scrollbar">
                                <div
                                    className="bg-white text-slate-900 rounded-sm shadow-2xl transition-transform duration-200 border border-slate-200"
                                    style={{
                                        transform: `scale(${this.state.modalZoom})`,
                                        transformOrigin: 'top center',
                                        width: '794px',
                                        minHeight: '1122px',
                                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.2)',
                                    }}>
                                    <TemplateRenderer
                                        templateId={this.state.templateId || 'Cover1'}
                                        values={templateValues}
                                        language={this.props.i18n?.language || 'en'}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation Modal Overlay */}
                {this.state.letterToDelete && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 animate-in fade-in duration-200">
                            <h3 className="text-base font-bold text-slate-900 mb-2">Delete Cover Letter?</h3>
                            <p className="text-xs text-slate-500 mb-6">
                                Are you sure you want to delete <strong className="text-slate-700">{this.state.letterToDelete.jobTitle || 'this cover letter'}</strong>? This action cannot be undone.
                            </p>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => this.setState({ letterToDelete: null })}
                                    className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all">
                                    Cancel
                                </button>
                                <button
                                    onClick={this.handleConfirmDeleteCoverLetter}
                                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all">
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="max-w-6xl mx-auto space-y-6">
                    {/* Header Card */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                                <img className="h-9 w-auto" src={logo} alt="Logo" />
                                <div>
                                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Cover Letter Builder & AI Generator</h1>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Candidate Profile: <strong className="text-slate-800 font-semibold">{candidateFullName || 'Not Set'}</strong> {this.state.candidateEmail ? `(${this.state.candidateEmail})` : ''}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={this.handleResetForm} className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 rounded-xl transition-all border border-indigo-200">
                                    + Create New Cover Letter
                                </button>
                                <Link to="/dashboard" className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-xl transition-all border border-slate-200">
                                    Back to Dashboard
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Inline Notification Banner */}
                    {this.state.notificationMessage && (
                        <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-semibold p-4 rounded-xl flex items-center justify-between shadow-xs animate-in fade-in duration-200">
                            <span className="flex items-center gap-2">
                                <span className="text-base">✨</span>
                                {this.state.notificationMessage}
                            </span>
                            <button onClick={() => this.setState({ notificationMessage: null })} className="text-indigo-600 hover:text-indigo-900 font-bold ml-4">✕</button>
                        </div>
                    )}

                    {/* Stepper Indicator & View Switcher */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-2 text-xs font-semibold overflow-x-auto">
                            <button onClick={() => this.setState({ step: 1 })} className={`px-4 py-2 rounded-xl transition-all ${this.state.step === 1 ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                Step 1: Candidate & Role Details
                            </button>
                            <button onClick={() => this.setState({ step: 2 })} className={`px-4 py-2 rounded-xl transition-all ${this.state.step === 2 ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                Step 2: AI Generator & Template Selection
                            </button>
                            <button onClick={() => this.setState({ step: 3 })} className={`px-4 py-2 rounded-xl transition-all ${this.state.step === 3 ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                Step 3: Export & Share Package
                            </button>
                        </div>

                        {/* View Mode Switcher */}
                        {this.state.step > 1 && (
                            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                                <button onClick={() => this.setState({ viewMode: 'visual' })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${this.state.viewMode === 'visual' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}>
                                    🎨 Visual Preview ({activeTemplate.name})
                                </button>
                                <button onClick={() => this.setState({ viewMode: 'text' })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${this.state.viewMode === 'text' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}>
                                    📝 Text Editor
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Step 1: Candidate Profile + Job Target Details */}
                    {this.state.step === 1 && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
                            {/* Candidate Profile Information */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Candidate Profile Information (Synced with System)</h3>
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold">Dynamic Profile Data</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">First Name</label>
                                        <input type="text" value={this.state.candidateFirstname} onChange={(e) => this.setState({ candidateFirstname: e.target.value })} placeholder="Enter first name" className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Last Name</label>
                                        <input type="text" value={this.state.candidateLastname} onChange={(e) => this.setState({ candidateLastname: e.target.value })} placeholder="Enter last name" className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Email Address</label>
                                        <input type="email" value={this.state.candidateEmail} onChange={(e) => this.setState({ candidateEmail: e.target.value })} placeholder="Enter email address" className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Phone Number</label>
                                        <input type="text" value={this.state.candidatePhone} onChange={(e) => this.setState({ candidatePhone: e.target.value })} placeholder="Enter phone number" className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Street Address</label>
                                        <input type="text" value={this.state.candidateAddress} onChange={(e) => this.setState({ candidateAddress: e.target.value })} placeholder="e.g. 123 Innovation Way" className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">City / Region</label>
                                        <input type="text" value={this.state.candidateCity} onChange={(e) => this.setState({ candidateCity: e.target.value })} placeholder="e.g. San Francisco, CA" className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Postal Code</label>
                                        <input type="text" value={this.state.candidatePostalCode} onChange={(e) => this.setState({ candidatePostalCode: e.target.value })} placeholder="e.g. 94105" className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                </div>
                            </div>

                            {/* Target Job Details */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Target Job Position & Recipient Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Target Job Title *</label>
                                        <input type="text" value={this.state.jobTitle} onChange={(e) => this.setState({ jobTitle: e.target.value })} placeholder="e.g. Senior Software Engineer" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Target Company Name *</label>
                                        <input type="text" value={this.state.companyName} onChange={(e) => this.setState({ companyName: e.target.value })} placeholder="e.g. TechCorp Inc." className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Hiring Manager / Recipient</label>
                                        <input type="text" value={this.state.recipientName} onChange={(e) => this.setState({ recipientName: e.target.value })} placeholder="e.g. Sarah Jenkins" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Company Street Address</label>
                                        <input type="text" value={this.state.companyAddress} onChange={(e) => this.setState({ companyAddress: e.target.value })} placeholder="e.g. 500 Market St" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Company City</label>
                                        <input type="text" value={this.state.companyCity} onChange={(e) => this.setState({ companyCity: e.target.value })} placeholder="e.g. San Francisco, CA" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Company Postal Code</label>
                                        <input type="text" value={this.state.companyPostalCode} onChange={(e) => this.setState({ companyPostalCode: e.target.value })} placeholder="e.g. 94105" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                </div>
                            </div>

                            {/* AI Tone Archetype Selector */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                        <FaSlidersH className="text-indigo-600 w-3.5 h-3.5" />
                                        <span>Select AI Tone Archetype</span>
                                    </h3>
                                    <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                                        Active: {AI_TONES.find(t => t.id === this.state.aiTone)?.name || 'Modern Professional'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {AI_TONES.map(t => {
                                        const isToneSelected = (this.state.aiTone || 'modern') === t.id;
                                        return (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => this.setState({ aiTone: t.id })}
                                                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                                                    isToneSelected
                                                        ? 'border-indigo-600 bg-white ring-2 ring-indigo-500/20 shadow-xs'
                                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                                }`}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-lg">{t.icon}</span>
                                                    {isToneSelected && <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-sm">Selected</span>}
                                                </div>
                                                <h5 className="text-xs font-bold text-slate-900">{t.name}</h5>
                                                <p className="text-[10px] text-slate-500 mt-0.5">{t.desc}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Target Job Description. ATS matcher/score only when admin module is ON. */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
                                {this.state.isAtsEnabled === true ? (
                                    <>
                                        <div className="flex items-center justify-between cursor-pointer" onClick={() => this.setState(prev => ({ showAtsSection: !prev.showAtsSection }))}>
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                                                    <FaBullseye className="w-3.5 h-3.5" />
                                                </div>
                                                <div>
                                                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                        Target Job Description & ATS Keyword Matcher (Optional)
                                                    </h3>
                                                    <p className="text-[11px] text-slate-500">
                                                        Paste the job description to optimize keywords and compute your real-time ATS match score.
                                                    </p>
                                                </div>
                                            </div>
                                            <button type="button" className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                                                {this.state.showAtsSection ? '▲ Hide ATS Drawer' : '▼ Expand ATS Drawer'}
                                            </button>
                                        </div>

                                        {this.state.showAtsSection && (
                                            <div className="space-y-3 pt-2">
                                                <textarea
                                                    value={this.state.jobDescription}
                                                    onChange={(e) => this.setState({ jobDescription: e.target.value })}
                                                    placeholder="Paste the target job description or core requirements here (e.g. 'Looking for a Senior Software Engineer experienced in React, TypeScript, Cloud Architecture, GraphQL, micro-services, and agile team delivery...')..."
                                                    className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 focus:border-indigo-600 focus:outline-hidden min-h-[90px] font-sans"
                                                />

                                                {atsMetrics && (
                                                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                                                <FaCheckCircle className={atsMetrics.score >= 80 ? 'text-emerald-500' : 'text-amber-500'} />
                                                                <span>Estimated ATS Compatibility Score:</span>
                                                            </span>
                                                            <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full ${atsMetrics.score >= 80 ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                                                                {atsMetrics.score}% Match
                                                            </span>
                                                        </div>

                                                        <div className="flex flex-wrap gap-1.5 text-[10px]">
                                                            {atsMetrics.matched.map(kw => (
                                                                <span key={kw} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-semibold">
                                                                    ✓ {kw}
                                                                </span>
                                                            ))}
                                                            {atsMetrics.missing.map(kw => (
                                                                <span key={kw} className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md font-semibold">
                                                                    + {kw}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                                                <FaBullseye className="w-3.5 h-3.5" />
                                            </div>
                                            <div>
                                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                    Target Job Description (Optional)
                                                </h3>
                                                <p className="text-[11px] text-slate-500">
                                                    Paste the job description so AI can tailor the letter. This is not an ATS score.
                                                </p>
                                            </div>
                                        </div>
                                        <textarea
                                            value={this.state.jobDescription}
                                            onChange={(e) => this.setState({ jobDescription: e.target.value })}
                                            placeholder="Paste the target job description or core requirements here..."
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 focus:border-indigo-600 focus:outline-hidden min-h-[90px] font-sans"
                                        />
                                    </>
                                )}
                            </div>

                            <button onClick={() => this.generateAiCoverLetter()} disabled={this.state.isAiGenerating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2">
                                {this.state.isAiGenerating ? '⚡ Generating AI Cover Letter...' : `⚡ Generate AI Cover Letter (${AI_TONES.find(t => t.id === this.state.aiTone)?.name || 'Modern Professional'})`}
                            </button>
                        </div>
                    )}

                    {/* Step 2: 4-Template Selection & Live Visual Preview */}
                    {this.state.step === 2 && (
                        <div className="space-y-6">
                            {/* 4 Cover Templates Selector Cards */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                        Choose From 4 Available Cover Letter Templates
                                    </h3>
                                    <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                                        Active: {activeTemplate.name} ({activeTemplate.id})
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {COVER_TEMPLATES.map(tpl => {
                                        const isSelected = (this.state.templateId || 'Cover1') === tpl.id;
                                        return (
                                            <button
                                                key={tpl.id}
                                                type="button"
                                                onClick={() => this.setState({ templateId: tpl.id })}
                                                className={`text-left p-3.5 rounded-xl border-2 transition-all flex flex-col justify-between relative ${
                                                    isSelected
                                                        ? 'border-indigo-600 bg-indigo-50/60 shadow-xs'
                                                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                                }`}>
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white bg-gradient-to-r ${tpl.color}`}>
                                                            {tpl.badge}
                                                        </span>
                                                        {isSelected && (
                                                            <span className="text-xs font-bold text-indigo-600 flex items-center gap-1">
                                                                ✓ Selected
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h4 className="text-xs font-bold text-slate-900">{tpl.name}</h4>
                                                    <p className="text-[11px] text-slate-500 leading-snug">{tpl.description}</p>
                                                </div>
                                                <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                                                    <span>{tpl.id}</span>
                                                    <span>{isSelected ? 'Active Preview' : 'Click to Apply'}</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Visual Render or Text Editor */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
                                {this.state.viewMode === 'visual' ? (
                                    <div className="bg-slate-100/80 p-4 sm:p-8 rounded-2xl border border-slate-200 overflow-x-auto shadow-inner flex flex-col items-center min-h-[650px]">
                                        <div className="w-full max-w-[794px] flex items-center justify-between mb-3 px-2">
                                            <span className="text-xs font-semibold text-slate-500">A4 Letter Canvas Preview</span>
                                            <button
                                                type="button"
                                                onClick={() => this.setState({ showPreviewModal: true })}
                                                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white hover:bg-indigo-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs transition-all flex items-center gap-1.5">
                                                <FaExpand className="w-3 h-3" />
                                                <span>Open Fullscreen Modal</span>
                                            </button>
                                        </div>
                                        {/* Authentic A4 Paper Canvas */}
                                        <div
                                            className="bg-white text-slate-900 rounded-sm shadow-xl border border-slate-200/80 overflow-hidden"
                                            style={{
                                                width: '100%',
                                                maxWidth: '794px',
                                                minHeight: '1000px',
                                                boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.15), 0 8px 32px -8px rgba(0, 0, 0, 0.1)',
                                            }}>
                                            <TemplateRenderer
                                                templateId={this.state.templateId || 'Cover1'}
                                                values={templateValues}
                                                language={this.props.i18n?.language || 'en'}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-slate-700">Cover Letter Body Content (Editable)</label>
                                        <textarea
                                            value={effectiveBody}
                                            onChange={(e) => this.setState({ letterBody: e.target.value })}
                                            className="w-full h-72 text-xs p-4 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono leading-relaxed focus:border-indigo-600 focus:outline-hidden"
                                        />
                                    </div>
                                )}

                                {/* 1-Click Tone Refinement Toolbar */}
                                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <FaMagic className="text-indigo-600 w-3.5 h-3.5" />
                                        <span>1-Click Tone Transformation:</span>
                                    </span>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {AI_TONES.map(t => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                disabled={this.state.isAiGenerating}
                                                onClick={() => this.generateAiCoverLetter(t.id)}
                                                className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition-all flex items-center gap-1 ${
                                                    this.state.aiTone === t.id
                                                        ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-2xs'
                                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                                }`}>
                                                <span>{t.icon}</span>
                                                <span>{t.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                                    <button onClick={() => this.setState({ step: 1 })} className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
                                        Back to Role Details
                                    </button>
                                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                                        <button
                                            onClick={() => this.generateAiCoverLetter()}
                                            disabled={this.state.isAiGenerating}
                                            className="px-4 py-2.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all flex items-center gap-2 shadow-2xs">
                                            {this.state.isAiGenerating ? '⚡ Regenerating...' : '⚡ 🔄 Regenerate AI Variation'}
                                        </button>
                                        <button onClick={this.handleSaveCoverLetter} disabled={this.state.isSaving} className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
                                            {this.state.isSaving ? 'Saving...' : '💾 Save to Dashboard'}
                                        </button>
                                        <button onClick={() => this.setState({ step: 3 })} className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all">
                                            Next: Export & Share Package
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Final Export, Fullscreen Modal & Omni-Channel Share Package */}
                    {this.state.step === 3 && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
                            {/* Template Switcher Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                <span className="text-xs font-bold text-slate-700">Cover Letter Style:</span>
                                <div className="flex flex-wrap items-center gap-2">
                                    {COVER_TEMPLATES.map(tpl => (
                                        <button
                                            key={tpl.id}
                                            type="button"
                                            onClick={() => this.setState({ templateId: tpl.id })}
                                            className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition-all ${
                                                (this.state.templateId || 'Cover1') === tpl.id
                                                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                            }`}>
                                            {tpl.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                                {/* Proportional Live Preview Card with Modal Trigger */}
                                <div className="lg:col-span-6 space-y-2">
                                    <div
                                        onClick={() => this.setState({ showPreviewModal: true })}
                                        className="relative h-[490px] bg-slate-100/90 rounded-2xl border border-slate-200 overflow-hidden flex items-start justify-center cursor-pointer group hover:border-indigo-300 transition-all shadow-inner p-3">
                                        {/* Hover Overlay */}
                                        <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/20 backdrop-blur-none group-hover:backdrop-blur-2xs transition-all duration-300 z-10 flex items-center justify-center pointer-events-none">
                                            <div className="opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-200 bg-white/95 text-indigo-700 px-4 py-2 rounded-xl text-xs font-bold shadow-lg flex items-center gap-2 border border-indigo-100">
                                                <FaExpand className="w-3.5 h-3.5" />
                                                <span>Click to Open Fullscreen Preview</span>
                                            </div>
                                        </div>

                                        {/* Scaled A4 Preview Board */}
                                        <div
                                            className="bg-white text-slate-900 rounded-sm shadow-md border border-slate-200 pointer-events-none"
                                            style={{
                                                width: '794px',
                                                minHeight: '1122px',
                                                transform: 'scale(0.40)',
                                                transformOrigin: 'top center',
                                                marginBottom: '-580px',
                                            }}>
                                            <TemplateRenderer
                                                templateId={this.state.templateId || 'Cover1'}
                                                values={templateValues}
                                                language={this.props.i18n?.language || 'en'}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between px-1">
                                        <span className="text-[11px] text-slate-400">Click preview card to open modal</span>
                                        <button
                                            type="button"
                                            onClick={() => this.setState({ showPreviewModal: true })}
                                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5">
                                            <FaExpand className="w-3 h-3" />
                                            <span>Expand Preview</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Download & Omni-Channel Share Actions */}
                                <div className="lg:col-span-6 space-y-6">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                Ready for Submission
                                            </span>
                                            <span className="text-[10px] font-mono text-slate-400">{activeTemplate.id}</span>
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-900">Your Styled Cover Letter is Ready!</h3>
                                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                            Formatted using the <strong className="text-slate-800 font-semibold">{activeTemplate.name}</strong> template with dynamic candidate details.
                                        </p>
                                    </div>

                                    {/* Primary Export Actions */}
                                    <div className="space-y-2.5">
                                        <button
                                            onClick={this.handlePrintCoverLetter}
                                            className="w-full py-3.5 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2">
                                            <FaPrint className="w-3.5 h-3.5" />
                                            <span>Print / Save as PDF ({activeTemplate.name})</span>
                                        </button>
                                        <button
                                            type="button"
                                            disabled={this.state.isSyncingTracker}
                                            onClick={() => this.handleSyncToJobTracker()}
                                            className="w-full py-3 px-4 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-xl transition-all flex items-center justify-center gap-2 shadow-2xs">
                                            <FaBriefcase className="w-3.5 h-3.5 text-indigo-600" />
                                            <span>{this.state.isSyncingTracker ? 'Syncing to Job Tracker...' : '📌 Sync & Attach to Job Tracker'}</span>
                                        </button>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                            <button
                                                onClick={this.exportCoverLetterTxt}
                                                className="py-2.5 px-3 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-all flex items-center justify-center gap-2">
                                                <FaFileDownload className="w-3.5 h-3.5 text-slate-500" />
                                                <span>Download Plain Text (.txt)</span>
                                            </button>
                                            <button
                                                onClick={this.handleCopyFormattedText}
                                                className="py-2.5 px-3 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all flex items-center justify-center gap-2">
                                                <FaCopy className="w-3.5 h-3.5 text-indigo-600" />
                                                <span>Copy Formatted Text</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Omni-Channel Social & Messaging Share Suite */}
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                            <span>🚀 Share Cover Letter with Recruiter</span>
                                        </h4>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                            {/* WhatsApp */}
                                            <button
                                                type="button"
                                                onClick={this.handleShareWhatsApp}
                                                className="p-2.5 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-center transition-all group flex flex-col items-center gap-1.5 shadow-2xs">
                                                <FaWhatsapp className="w-5 h-5 text-emerald-500 group-hover:scale-110 transition-transform" />
                                                <span className="text-[11px] font-bold text-slate-700 group-hover:text-emerald-700">WhatsApp</span>
                                            </button>

                                            {/* Email / Gmail */}
                                            <button
                                                type="button"
                                                onClick={this.handleShareEmail}
                                                className="p-2.5 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl text-center transition-all group flex flex-col items-center gap-1.5 shadow-2xs">
                                                <FaEnvelope className="w-5 h-5 text-blue-500 group-hover:scale-110 transition-transform" />
                                                <span className="text-[11px] font-bold text-slate-700 group-hover:text-blue-700">Email</span>
                                            </button>

                                            {/* Telegram */}
                                            <button
                                                type="button"
                                                onClick={this.handleShareTelegram}
                                                className="p-2.5 bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 rounded-xl text-center transition-all group flex flex-col items-center gap-1.5 shadow-2xs">
                                                <FaTelegramPlane className="w-5 h-5 text-sky-500 group-hover:scale-110 transition-transform" />
                                                <span className="text-[11px] font-bold text-slate-700 group-hover:text-sky-700">Telegram</span>
                                            </button>

                                            {/* LinkedIn */}
                                            <button
                                                type="button"
                                                onClick={this.handleShareLinkedIn}
                                                className="p-2.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-center transition-all group flex flex-col items-center gap-1.5 shadow-2xs">
                                                <FaLinkedin className="w-5 h-5 text-indigo-600 group-hover:scale-110 transition-transform" />
                                                <span className="text-[11px] font-bold text-slate-700 group-hover:text-indigo-700">LinkedIn</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Saved Cover Letters Gallery with Full CRUD */}
                    {this.state.savedLetters && this.state.savedLetters.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-4 shadow-sm">
                            <h3 className="text-sm font-bold text-slate-900 mb-2">Saved Cover Letters ({this.state.savedLetters.length})</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {this.state.savedLetters.map(letter => {
                                    const tplInfo = this.getTemplateInfo(letter.templateId);
                                    return (
                                        <div key={letter.id} className="bg-white border border-slate-200/90 hover:border-indigo-300 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-4 group">
                                            {/* Card Top Row: Title, Template Badge, and View Popup Icon */}
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="space-y-1 min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h4 className="text-sm font-bold text-slate-900 tracking-tight truncate">
                                                            {letter.jobTitle || 'Target Position'}
                                                        </h4>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white bg-gradient-to-r ${tplInfo.color} shadow-2xs`}>
                                                            {tplInfo.name}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-600 font-medium truncate">
                                                        {letter.companyName ? `🏢 ${letter.companyName}` : 'Company Not Specified'}
                                                    </p>
                                                    <p className="text-[11px] text-slate-400">
                                                        Candidate: <span className="font-semibold text-slate-700">{letter.candidateFirstname ? `${letter.candidateFirstname} ${letter.candidateLastname || ''}` : (candidateFullName || 'User Profile')}</span>
                                                    </p>
                                                </div>

                                                {/* View Modal Popup Button */}
                                                <button
                                                    type="button"
                                                    title="Preview Cover Letter (Fullscreen A4)"
                                                    onClick={() => this.handleViewSavedLetter(letter)}
                                                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 text-xs font-bold shrink-0">
                                                    <FaEye className="w-3.5 h-3.5" />
                                                    <span>View</span>
                                                </button>
                                            </div>

                                            {/* Card Bottom Row: Share Icons & Primary Actions */}
                                            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                                                {/* Quick Share Icons */}
                                                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/70">
                                                    <button
                                                        type="button"
                                                        title="Share via WhatsApp"
                                                        onClick={() => this.handleShareLetterWhatsApp(letter)}
                                                        className="w-7 h-7 bg-white hover:bg-emerald-500 hover:text-white text-emerald-600 border border-slate-200/80 rounded-lg flex items-center justify-center transition-all shadow-2xs">
                                                        <FaWhatsapp className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Share via Email"
                                                        onClick={() => this.handleShareLetterEmail(letter)}
                                                        className="w-7 h-7 bg-white hover:bg-blue-500 hover:text-white text-blue-600 border border-slate-200/80 rounded-lg flex items-center justify-center transition-all shadow-2xs">
                                                        <FaEnvelope className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Share via Telegram"
                                                        onClick={() => this.handleShareLetterTelegram(letter)}
                                                        className="w-7 h-7 bg-white hover:bg-sky-500 hover:text-white text-sky-500 border border-slate-200/80 rounded-lg flex items-center justify-center transition-all shadow-2xs">
                                                        <FaTelegramPlane className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Share via LinkedIn"
                                                        onClick={() => this.handleShareLetterLinkedIn(letter)}
                                                        className="w-7 h-7 bg-white hover:bg-indigo-600 hover:text-white text-indigo-600 border border-slate-200/80 rounded-lg flex items-center justify-center transition-all shadow-2xs">
                                                        <FaLinkedin className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Copy Cover Letter Text"
                                                        onClick={() => this.handleCopyLetterText(letter)}
                                                        className="w-7 h-7 bg-white hover:bg-slate-700 hover:text-white text-slate-600 border border-slate-200/80 rounded-lg flex items-center justify-center transition-all shadow-2xs">
                                                        <FaCopy className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Sync & Attach to Job Tracker"
                                                        onClick={() => this.handleSyncToJobTracker(letter)}
                                                        className="w-7 h-7 bg-white hover:bg-indigo-600 hover:text-white text-indigo-600 border border-slate-200/80 rounded-lg flex items-center justify-center transition-all shadow-2xs">
                                                        <FaBriefcase className="w-3 h-3" />
                                                    </button>
                                                </div>

                                                {/* Action Buttons: Edit, Duplicate, Delete */}
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => this.setState({
                                                            currentId: letter.id,
                                                            candidateFirstname: letter.candidateFirstname || this.state.candidateFirstname,
                                                            candidateLastname: letter.candidateLastname || this.state.candidateLastname,
                                                            candidateEmail: letter.candidateEmail || this.state.candidateEmail,
                                                            candidatePhone: letter.candidatePhone || this.state.candidatePhone,
                                                            candidateAddress: letter.candidateAddress || this.state.candidateAddress,
                                                            candidateCity: letter.candidateCity || this.state.candidateCity,
                                                            candidatePostalCode: letter.candidatePostalCode || this.state.candidatePostalCode,
                                                            jobTitle: letter.jobTitle,
                                                            companyName: letter.companyName,
                                                            recipientName: letter.recipientName,
                                                            companyAddress: letter.companyAddress || '',
                                                            companyCity: letter.companyCity || '',
                                                            companyPostalCode: letter.companyPostalCode || '',
                                                            letterBody: letter.letterBody,
                                                            templateId: letter.templateId || 'Cover1',
                                                            step: 2
                                                        })}
                                                        className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100 px-3 py-1.5 rounded-xl border border-indigo-200/80 shadow-2xs transition-all flex items-center gap-1">
                                                        <FaEdit className="w-3 h-3" />
                                                        <span>Edit</span>
                                                    </button>
                                                    <button
                                                        onClick={() => this.handleDuplicateCoverLetter(letter)}
                                                        className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs transition-all flex items-center gap-1">
                                                        <FaClone className="w-3 h-3" />
                                                        <span>Duplicate</span>
                                                    </button>
                                                    <button
                                                        onClick={() => this.setState({ letterToDelete: letter })}
                                                        className="text-xs font-semibold text-red-600 hover:text-red-800 bg-white hover:bg-red-50 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-red-200 shadow-2xs transition-all flex items-center gap-1">
                                                        <FaTrashAlt className="w-3 h-3" />
                                                        <span>Delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(CoverLetter);
export default MyComponent;