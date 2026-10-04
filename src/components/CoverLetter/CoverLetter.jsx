import React, { Component } from 'react';
import './CoverLetter.scss';
import logo from '../../assets/logo/logo.png';
import { withTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
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
    },
    {
        id: 'Cover2',
        name: 'Modern Left-Aligned',
        badge: 'Modern',
        description: 'Crisp, left-aligned layout with dark horizontal divider.',
    },
    {
        id: 'Cover3',
        name: 'Split Sidebar',
        badge: 'Two-Column',
        description: 'Side-by-side recipient card and sender contact pane.',
    },
    {
        id: 'Cover4',
        name: 'Accent Icons',
        badge: 'Creative',
        description: 'Modern header with contact icons and job title accent.',
    },
];

/* Zoom ladder for the in-modal A4 preview. The scale is applied through a
   CSS transform on .cl-paper rather than by re-rendering the template, so
   zooming never costs a TemplateRenderer pass (INV-5 render budget). */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5];

/* Single source of truth for ATS tiering so the meter fill, the numeric
   readout and the chip colours can never disagree (AC-5):
     >= 80 strong, 60-79 warning, < 60 critical.
   Returns the token suffix appended to .cl-ats__* modifier classes. */
const atsTier = (score) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'danger';
};

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
            // DIR-020 AC-11 (5): seeded from the job tracker's role context so
            // "View linked cover letter" opens with the real role already filled
            // in. Empty strings are the honest default when no context is passed.
            jobTitle: props.jobTitle || '',
            companyName: props.companyName || '',
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

    // The letter body only ever contains the candidate's own text or an AI draft
    // they asked for. There is no canned template letter: an empty body stays empty.
    getDefaultLetterBody = () => '';

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
                // Only a value the candidate supplied — never inferred from skill count.
                yearsExperience: this.state.yearsExperience || '',
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
            // No canned letter: keep whatever the candidate already wrote, save nothing
            // new, and tell them AI is unavailable so they can retry or write it.
            this.setState({
                isAiGenerating: false,
                step: 2,
                notificationMessage: this.state.letterBody
                    ? 'AI cover letter generation is unavailable right now. Your existing letter was left unchanged.'
                    : 'AI cover letter generation is unavailable right now. Please try again, or write your letter in the editor.',
            });
            setTimeout(() => this.setState({ notificationMessage: null }), 6000);
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
        return COVER_TEMPLATES.find(t => t.id === templateId) || COVER_TEMPLATES[0];
    };

    /* Zoom steps walk the ZOOM_STEPS ladder rather than nudging an arbitrary
       float, so the control always lands on a legible scale. */
    zoomBy = (direction) => {
        this.setState(prev => {
            const current = ZOOM_STEPS.findIndex(step => Math.abs(step - prev.modalZoom) < 0.001);
            const base = current === -1 ? ZOOM_STEPS.indexOf(1) : current;
            const nextIndex = Math.min(ZOOM_STEPS.length - 1, Math.max(0, base + direction));
            return { modalZoom: ZOOM_STEPS[nextIndex] };
        });
    };

    canZoomIn = () => this.state.modalZoom < ZOOM_STEPS[ZOOM_STEPS.length - 1];

    canZoomOut = () => this.state.modalZoom > ZOOM_STEPS[0];

    /* AC-5: a missed keyword chip copies that keyword to the clipboard so it
       can be pasted into the letter. It never mutates the stored letter body
       on the candidate's behalf - the text stays exactly what they typed. */
    handleCopyKeyword = async (keyword) => {
        try {
            await navigator.clipboard.writeText(keyword);
            this.setState({ notificationMessage: `Copied "${keyword}" - paste it into your letter to close the ATS gap.` });
            setTimeout(() => this.setState({ notificationMessage: null }), 4000);
        } catch (err) {
            console.error('Keyword copy error:', err);
            this.setState({ notificationMessage: `Could not copy "${keyword}" to the clipboard.` });
            setTimeout(() => this.setState({ notificationMessage: null }), 4000);
        }
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
        /* AC-2: header de-duplication. When the builder is mounted inside the
           candidate shell (/dashboard/cover-letters) the shell already renders
           the product logo, the workspace title and a dashboard link, so this
           component suppresses its own duplicate chrome and only contributes
           the workspace header. Standalone (/coverletter) keeps the full card
           including the logo and the "Back to Dashboard" affordance. */
        const isEmbeddedInShell = typeof this.props.pathname === 'string'
            && this.props.pathname.startsWith('/dashboard');

        if (this.state.isCoverLetterEnabled === false) {
            return (
                <div className={`cover-letter cl-canvas${isEmbeddedInShell ? '' : ' cl-canvas--standalone'}`}>
                    <div className="cl-stack">
                        <div className="cl-card cl-card--tight">
                            <h1 className="cl-section-title">Cover letters are unavailable</h1>
                            <p className="cl-body-copy">This workspace has the cover letter module turned off.</p>
                            <Link to="/dashboard" className="cl-btn cl-btn--primary cl-btn--sm" style={{ marginTop: '1.25rem' }}>
                                Back to Dashboard
                            </Link>
                        </div>
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
                <div className={`cover-letter-ui no-print cl-canvas${isEmbeddedInShell ? '' : ' cl-canvas--standalone'}`}>
                {/* Fullscreen Preview Modal (Same as Resume Preview Modal) */}
                {this.state.showPreviewModal && (
                    <div
                        className="cl-modal__scrim"
                        role="presentation"
                        onMouseDown={(e) => {
                            // Click on the scrim itself (not the dialog) dismisses.
                            if (e.target === e.currentTarget) this.setState({ showPreviewModal: false });
                        }}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-label={`Cover letter preview, ${activeTemplate.name}`}
                            className="cl-modal"
                        >
                            {/* Modal Header */}
                            <div className="cl-modal__head">
                                <div className="cl-modal__brand">
                                    <div className="cl-ats__icon">
                                        <FaExpand />
                                    </div>
                                    <div>
                                        <h2 className="cl-modal__title">Cover Letter Preview</h2>
                                        <p className="cl-modal__sub">
                                            {activeTemplate.name} ({activeTemplate.id}) &bull; A4 Print Ready
                                        </p>
                                    </div>
                                </div>

                                <div className="cl-modal__tools">
                                    {/* Zoom Controls */}
                                    <div className="cl-zoom">
                                        <button
                                            type="button"
                                            onClick={() => this.zoomBy(-1)}
                                            disabled={!this.canZoomOut()}
                                            className="cl-zoom__btn cuba-focus-ring"
                                            title="Zoom Out"
                                            aria-label="Zoom out">
                                            <FaSearchMinus />
                                        </button>
                                        <span className="cl-zoom__value" aria-live="polite">
                                            {Math.round(this.state.modalZoom * 100)}%
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => this.zoomBy(1)}
                                            disabled={!this.canZoomIn()}
                                            className="cl-zoom__btn cuba-focus-ring"
                                            title="Zoom In"
                                            aria-label="Zoom in">
                                            <FaSearchPlus />
                                        </button>
                                    </div>

                                    {/* Print / Save PDF in Modal */}
                                    <button
                                        onClick={this.handlePrintCoverLetter}
                                        className="cl-btn cl-btn--primary cl-btn--sm">
                                        <FaPrint className="cl-btn__glyph" />
                                        <span>Print / PDF</span>
                                    </button>

                                    {/* Close Button */}
                                    <button
                                        onClick={() => this.setState({ showPreviewModal: false })}
                                        className="cl-icon-btn cuba-focus-ring"
                                        aria-label="Close Preview">
                                        <FaTimes className="cl-icon-btn__glyph" />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Canvas Body */}
                            <div className="cl-modal__body custom-scrollbar">
                                <div
                                    className="cl-paper"
                                    style={{
                                        transform: `scale(${this.state.modalZoom})`,
                                        width: '794px',
                                        minHeight: '1122px',
                                        flex: 'none',
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
                    <div className="cl-modal__scrim cl-modal__scrim--soft">
                        <div className="cl-modal cl-modal--sm" role="dialog" aria-modal="true" aria-label="Confirm delete cover letter">
                            <div className="cl-card cl-card--tight">
                                <h3 className="cl-section-title">Delete Cover Letter?</h3>
                                <p className="cl-body-copy">
                                    Are you sure you want to delete <strong>{this.state.letterToDelete.jobTitle || 'this cover letter'}</strong>? This action cannot be undone.
                                </p>
                            </div>
                            <div className="cl-modal__foot">
                                <button
                                    onClick={() => this.setState({ letterToDelete: null })}
                                    className="cl-btn cl-btn--neutral cl-btn--sm">
                                    Cancel
                                </button>
                                <button
                                    onClick={this.handleConfirmDeleteCoverLetter}
                                    className="cl-btn cl-btn--danger cl-btn--sm">
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="cl-stack">
                    {/* Workspace Header.
                        Standalone mount keeps the logo + "Back to Dashboard".
                        Embedded in CubaCandidateShell both are suppressed: the
                        shell already renders that chrome, so repeating it here
                        produced the duplicate-branding defect (AC-2). */}
                    <header className="cl-header">
                        <div className="cl-header__row">
                            <div className="cl-header__brand">
                                {!isEmbeddedInShell && (
                                    <img className="cl-header__logo" src={logo} alt="IME365.com" />
                                )}
                                <div>
                                    <h1 className="cl-header__title">Cover Letter Builder &amp; AI Generator</h1>
                                    <p className="cl-header__sub">
                                        Candidate Profile: <strong>{candidateFullName || 'Not Set'}</strong> {this.state.candidateEmail ? `(${this.state.candidateEmail})` : ''}
                                    </p>
                                </div>
                            </div>
                            <div className="cl-header__actions">
                                <button onClick={this.handleResetForm} className="cl-btn cl-btn--soft cl-btn--sm cuba-focus-ring">
                                    + Create New Cover Letter
                                </button>
                                {!isEmbeddedInShell && (
                                    <Link to="/dashboard" className="cl-btn cl-btn--neutral cl-btn--sm">
                                        Back to Dashboard
                                    </Link>
                                )}
                            </div>
                        </div>
                    </header>

                    {/* Inline Notification Banner */}
                    {this.state.notificationMessage && (
                        <div className="cl-toast" role="status" aria-live="polite">
                            <span className="cl-toast__text">
                                <span aria-hidden="true">&#10024;</span>
                                {this.state.notificationMessage}
                            </span>
                            <button onClick={() => this.setState({ notificationMessage: null })} className="cl-toast__close" aria-label="Dismiss notification">
                                &#10005;
                            </button>
                        </div>
                    )}

                    {/* Stepper Indicator & View Switcher */}
                    <nav className="cl-card cl-card--flush" aria-label="Cover letter builder steps">
                        <div className="cl-stepper">
                            {[
                                { step: 1, label: 'Candidate & Role Details' },
                                { step: 2, label: 'AI Generator & Template Selection' },
                                { step: 3, label: 'Export & Share Package' },
                            ].map(({ step, label }) => (
                                <button
                                    key={step}
                                    type="button"
                                    onClick={() => this.setState({ step })}
                                    aria-current={this.state.step === step ? 'step' : undefined}
                                    className="cl-step cuba-focus-ring">
                                    <span className="cl-step__index" aria-hidden="true">{step}</span>
                                    <span>Step {step}: {label}</span>
                                </button>
                            ))}
                        </div>

                        {/* View Mode Switcher */}
                        {this.state.step > 1 && (
                            <div className="cl-segmented" style={{ marginTop: '0.75rem' }} role="group" aria-label="Preview mode">
                                <button
                                    type="button"
                                    onClick={() => this.setState({ viewMode: 'visual' })}
                                    aria-pressed={this.state.viewMode === 'visual'}
                                    className="cl-segmented__btn cuba-focus-ring">
                                    <span aria-hidden="true">&#127912;</span> Visual Preview ({activeTemplate.name})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => this.setState({ viewMode: 'text' })}
                                    aria-pressed={this.state.viewMode === 'text'}
                                    className="cl-segmented__btn cuba-focus-ring">
                                    <span aria-hidden="true">&#128221;</span> Text Editor
                                </button>
                            </div>
                        )}
                    </nav>

                    {/* Step 1: Candidate Profile + Job Target Details */}
                    {this.state.step === 1 && (
                        <div className="cl-card">
                            {/* Candidate Profile Information */}
                            <div className="cl-subcard">
                                <div className="cl-subcard__head">
                                    <h2 className="cl-eyebrow">Candidate Profile Information (Synced with System)</h2>
                                    <span className="cl-pill cl-pill--success">Dynamic Profile Data</span>
                                </div>
                                <div className="cl-grid-4">
                                    <div className="cl-field">
                                        <label className="cl-field__label" htmlFor="cl-firstname">First Name</label>
                                        <input id="cl-firstname" type="text" value={this.state.candidateFirstname} onChange={(e) => this.setState({ candidateFirstname: e.target.value })} placeholder="Enter first name" className="cl-input cl-input--sm cuba-field" />
                                    </div>
                                    <div className="cl-field">
                                        <label className="cl-field__label" htmlFor="cl-lastname">Last Name</label>
                                        <input id="cl-lastname" type="text" value={this.state.candidateLastname} onChange={(e) => this.setState({ candidateLastname: e.target.value })} placeholder="Enter last name" className="cl-input cl-input--sm cl-input--mono cuba-field" />
                                    </div>
                                    <div className="cl-field">
                                        <label className="cl-field__label" htmlFor="cl-email">Email Address</label>
                                        <input id="cl-email" type="email" value={this.state.candidateEmail} onChange={(e) => this.setState({ candidateEmail: e.target.value })} placeholder="Enter email address" className="cl-input cl-input--sm cuba-field" />
                                    </div>
                                    <div className="cl-field">
                                        <label className="cl-field__label" htmlFor="cl-phone">Phone Number</label>
                                        <input id="cl-phone" type="text" value={this.state.candidatePhone} onChange={(e) => this.setState({ candidatePhone: e.target.value })} placeholder="Enter phone number" className="cl-input cl-input--sm cuba-field" />
                                    </div>
                                </div>
                                <div className="cl-grid-3" style={{ marginTop: '1rem' }}>
                                    <div className="cl-field">
                                        <label className="cl-field__label" htmlFor="cl-address">Street Address</label>
                                        <input id="cl-address" type="text" value={this.state.candidateAddress} onChange={(e) => this.setState({ candidateAddress: e.target.value })} placeholder="e.g. 123 Innovation Way" className="cl-input cl-input--sm cuba-field" />
                                    </div>
                                    <div className="cl-field">
                                        <label className="cl-field__label" htmlFor="cl-city">City / Region</label>
                                        <input id="cl-city" type="text" value={this.state.candidateCity} onChange={(e) => this.setState({ candidateCity: e.target.value })} placeholder="e.g. San Francisco, CA" className="cl-input cl-input--sm cuba-field" />
                                    </div>
                                    <div className="cl-field">
                                        <label className="cl-field__label" htmlFor="cl-postal">Postal Code</label>
                                        <input id="cl-postal" type="text" value={this.state.candidatePostalCode} onChange={(e) => this.setState({ candidatePostalCode: e.target.value })} placeholder="e.g. 94105" className="cl-input cl-input--sm cuba-field" />
                                    </div>
                                </div>
                            </div>

                            {/* Target Job Details */}
                            <div style={{ marginTop: '1.5rem' }}>
                                <h2 className="cl-eyebrow">Target Job Position &amp; Recipient Information</h2>
                                <div className="cl-grid-3" style={{ marginTop: '1rem' }}>
                                    <div className="cl-field">
                                        <label className="cl-field__label" htmlFor="cl-jobtitle">Target Job Title *</label>
                                        <input id="cl-jobtitle" type="text" value={this.state.jobTitle} onChange={(e) => this.setState({ jobTitle: e.target.value })} placeholder="e.g. Senior Software Engineer" className="cl-input cuba-field" />
                                    </div>
                                    <div className="cl-field">
                                        <label className="cl-field__label" htmlFor="cl-company">Target Company Name *</label>
                                        <input id="cl-company" type="text" value={this.state.companyName} onChange={(e) => this.setState({ companyName: e.target.value })} placeholder="e.g. TechCorp Inc." className="cl-input cuba-field" />
                                    </div>
                                    <div className="cl-field">
                                        <label className="cl-field__label" htmlFor="cl-recipient">Hiring Manager / Recipient</label>
                                        <input id="cl-recipient" type="text" value={this.state.recipientName} onChange={(e) => this.setState({ recipientName: e.target.value })} placeholder="e.g. Sarah Jenkins" className="cl-input cuba-field" />
                                    </div>
                                </div>
                                <div className="cl-grid-3" style={{ marginTop: '1rem' }}>
                                    <div className="cl-field">
                                        <label className="cl-field__label" htmlFor="cl-caddr">Company Street Address</label>
                                        <input id="cl-caddr" type="text" value={this.state.companyAddress} onChange={(e) => this.setState({ companyAddress: e.target.value })} placeholder="e.g. 500 Market St" className="cl-input cuba-field" />
                                    </div>
                                    <div className="cl-field">
                                        <label className="cl-field__label" htmlFor="cl-ccity">Company City</label>
                                        <input id="cl-ccity" type="text" value={this.state.companyCity} onChange={(e) => this.setState({ companyCity: e.target.value })} placeholder="e.g. San Francisco, CA" className="cl-input cuba-field" />
                                    </div>
                                    <div className="cl-field">
                                        <label className="cl-field__label" htmlFor="cl-cpostal">Company Postal Code</label>
                                        <input id="cl-cpostal" type="text" value={this.state.companyPostalCode} onChange={(e) => this.setState({ companyPostalCode: e.target.value })} placeholder="e.g. 94105" className="cl-input cuba-field" />
                                    </div>
                                </div>
                            </div>

                            {/* AI Tone Archetype Selector */}
                            <div className="cl-subcard" style={{ marginTop: '1.5rem' }}>
                                <div className="cl-subcard__head">
                                    <h2 className="cl-eyebrow">
                                        <FaSlidersH className="cl-eyebrow__icon" />
                                        <span>Select AI Tone Archetype</span>
                                    </h2>
                                    <span className="cl-pill cl-pill--brand">
                                        Active: {AI_TONES.find(t => t.id === this.state.aiTone)?.name || 'Modern Professional'}
                                    </span>
                                </div>
                                <div className="cl-tpl-grid">
                                    {AI_TONES.map(t => {
                                        const isToneSelected = (this.state.aiTone || 'modern') === t.id;
                                        return (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => this.setState({ aiTone: t.id })}
                                                aria-pressed={isToneSelected}
                                                className="cl-tone cuba-focus-ring">
                                                <div className="cl-tone__head">
                                                    <span className="cl-tone__emoji" aria-hidden="true">{t.icon}</span>
                                                    {isToneSelected && <span className="cl-pill cl-pill--brand cl-pill--sm">Selected</span>}
                                                </div>
                                                <h3 className="cl-tone__name">{t.name}</h3>
                                                <p className="cl-tone__desc">{t.desc}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Target Job Description. ATS matcher/score only when admin module is ON. */}
                            <div className="cl-subcard" style={{ marginTop: '1.5rem' }}>
                                {this.state.isAtsEnabled === true ? (
                                    <>
                                        <button
                                            type="button"
                                            className="cl-ats__toggle cuba-focus-ring"
                                            aria-expanded={this.state.showAtsSection}
                                            aria-controls="cl-ats-panel"
                                            onClick={() => this.setState(prev => ({ showAtsSection: !prev.showAtsSection }))}
                                        >
                                            <span className="cl-ats__body">
                                                <span className="cl-ats__icon" aria-hidden="true">
                                                    <FaBullseye />
                                                </span>
                                                <span>
                                                    <span className="cl-eyebrow">Target Job Description &amp; ATS Keyword Matcher (Optional)</span>
                                                    <span className="cl-hint" style={{ display: 'block' }}>
                                                        Paste the job description to optimize keywords and compute your real-time ATS match score.
                                                    </span>
                                                </span>
                                            </span>
                                            <span className="cl-text-action">
                                                {this.state.showAtsSection ? 'Hide ATS Drawer' : 'Expand ATS Drawer'}
                                            </span>
                                        </button>

                                        {this.state.showAtsSection && (
                                            <div id="cl-ats-panel" className="cl-card cl-card--tight" style={{ marginTop: '0.75rem' }}>
                                                <label className="cl-field__label" htmlFor="cl-jobdesc">Job description</label>
                                                <textarea
                                                    id="cl-jobdesc"
                                                    value={this.state.jobDescription}
                                                    onChange={(e) => this.setState({ jobDescription: e.target.value })}
                                                    placeholder="Paste the target job description or core requirements here (e.g. 'Looking for a Senior Software Engineer experienced in React, TypeScript, Cloud Architecture, GraphQL, micro-services, and agile team delivery...')..."
                                                    className="cl-textarea cuba-field"
                                                    style={{ minHeight: '90px' }}
                                                />

                                                {atsMetrics && (
                                                    <div style={{ marginTop: '0.875rem' }}>
                                                        <div className="cl-ats__row">
                                                            <span className="cl-ats__label">
                                                                {atsMetrics.score >= 80
                                                                    ? <FaCheckCircle style={{ color: 'var(--cuba-success)' }} />
                                                                    : <FaExclamationCircle style={{ color: atsTier(atsMetrics.score) === 'warning' ? 'var(--cuba-warning)' : 'var(--cuba-danger)' }} />}
                                                                <span>Estimated ATS Compatibility Score:</span>
                                                            </span>
                                                            <span className={`cl-ats__score cl-ats__score--${atsTier(atsMetrics.score)}`}>
                                                                {atsMetrics.score}% Match
                                                            </span>
                                                        </div>

                                                        {/* The meter fill width is driven by the same value the
                                                            readout renders, so bar and number cannot diverge. */}
                                                        <div
                                                            className="cl-ats__track"
                                                            style={{ marginTop: '0.5rem' }}
                                                            role="meter"
                                                            aria-valuenow={atsMetrics.score}
                                                            aria-valuemin={0}
                                                            aria-valuemax={100}
                                                            aria-label="ATS compatibility score"
                                                        >
                                                            <div
                                                                className={`cl-ats__fill${atsTier(atsMetrics.score) === 'success' ? '' : ` cl-ats__fill--${atsTier(atsMetrics.score)}`}`}
                                                                style={{ '--cl-ats-score': atsMetrics.score }}
                                                            />
                                                        </div>

                                                        <div className="cl-ats__chips" style={{ marginTop: '0.625rem' }}>
                                                            {atsMetrics.matched.map(kw => (
                                                                <span key={`matched-${kw}`} className="cl-chip cl-chip--matched">
                                                                    <span aria-hidden="true">&#10003;</span> {kw}
                                                                </span>
                                                            ))}
                                                            {atsMetrics.missing.map(kw => (
                                                                <button
                                                                    key={`missing-${kw}`}
                                                                    type="button"
                                                                    className="cl-chip cl-chip--missing cuba-focus-ring"
                                                                    onClick={() => this.handleCopyKeyword(kw)}
                                                                    title={`Copy "${kw}" to the clipboard to paste into your letter`}
                                                                    aria-label={`Copy missing keyword ${kw} to clipboard`}
                                                                >
                                                                    <span aria-hidden="true">+</span> {kw}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <div className="cl-ats__body">
                                            <span className="cl-ats__icon" aria-hidden="true">
                                                <FaBullseye />
                                            </span>
                                            <span>
                                                <span className="cl-eyebrow">Target Job Description (Optional)</span>
                                                <span className="cl-hint" style={{ display: 'block' }}>
                                                    Paste the job description so AI can tailor the letter. This is not an ATS score.
                                                </span>
                                            </span>
                                        </div>
                                        <label className="cl-field__label" htmlFor="cl-jobdesc-plain" style={{ marginTop: '0.75rem' }}>Job description</label>
                                        <textarea
                                            id="cl-jobdesc-plain"
                                            value={this.state.jobDescription}
                                            onChange={(e) => this.setState({ jobDescription: e.target.value })}
                                            placeholder="Paste the target job description or core requirements here..."
                                            className="cl-textarea cuba-field"
                                            style={{ minHeight: '90px', marginTop: '0.25rem' }}
                                        />
                                    </>
                                )}
                            </div>

                            <button
                                onClick={() => this.generateAiCoverLetter()}
                                disabled={this.state.isAiGenerating}
                                className="cl-btn cl-btn--primary cl-btn--block cl-btn--lg"
                                style={{ marginTop: '1.5rem' }}
                            >
                                <FaMagic className="cl-btn__glyph" />
                                <span>{this.state.isAiGenerating ? '⚡ Generating AI Cover Letter...' : `⚡ Generate AI Cover Letter (${AI_TONES.find(t => t.id === this.state.aiTone)?.name || 'Modern Professional'})`}</span>
                            </button>
                        </div>
                    )}

                    {/* Step 2: 4-Template Selection & Live Visual Preview */}
                    {this.state.step === 2 && (
                        <div className="cl-card">
                            {/* 4 Cover Templates Selector Cards */}
                            <div className="cl-subcard">
                                <div className="cl-subcard__head">
                                    <h2 className="cl-eyebrow">Choose From 4 Available Cover Letter Templates</h2>
                                    <span className="cl-pill cl-pill--brand">
                                        Active: {activeTemplate.name} ({activeTemplate.id})
                                    </span>
                                </div>

                                <div className="cl-tpl-grid">
                                    {COVER_TEMPLATES.map(tpl => {
                                        const isSelected = (this.state.templateId || 'Cover1') === tpl.id;
                                        return (
                                            <button
                                                key={tpl.id}
                                                type="button"
                                                onClick={() => this.setState({ templateId: tpl.id })}
                                                aria-pressed={isSelected}
                                                className="cl-tpl cuba-focus-ring"
                                            >
                                                <span className="cl-tpl__swatch" aria-hidden="true" />
                                                <span className="cl-pill cl-pill--neutral cl-pill--sm">{tpl.badge}</span>
                                                {isSelected && (
                                                    <span className="cl-tpl__check">
                                                        <span aria-hidden="true">&#10003;</span> Selected
                                                    </span>
                                                )}
                                                <h3 className="cl-tpl__name">{tpl.name}</h3>
                                                <p className="cl-tpl__desc">{tpl.description}</p>
                                                <span className="cl-tpl__foot">
                                                    <span>{tpl.id}</span>
                                                    <span>{isSelected ? 'Active Preview' : 'Click to Apply'}</span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Visual Render or Text Editor */}
                            {this.state.viewMode === 'visual' ? (
                                <div className="cl-canvas-wrap" style={{ marginTop: '1.5rem' }}>
                                    <div className="cl-canvas-wrap__head">
                                        <span className="cl-canvas-wrap__label">A4 Letter Canvas Preview</span>
                                        <button
                                            type="button"
                                            onClick={() => this.setState({ showPreviewModal: true })}
                                            className="cl-btn cl-btn--soft cl-btn--sm cuba-focus-ring">
                                            <FaExpand className="cl-btn__glyph" />
                                            <span>Open Fullscreen Modal</span>
                                        </button>
                                    </div>
                                    {/* Authentic A4 Paper Canvas */}
                                    <div className="cl-paper" style={{ width: '100%', maxWidth: '794px', minHeight: '1000px' }}>
                                        <TemplateRenderer
                                            templateId={this.state.templateId || 'Cover1'}
                                            values={templateValues}
                                            language={this.props.i18n?.language || 'en'}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="cl-field" style={{ marginTop: '1.5rem' }}>
                                    <label className="cl-field__label" htmlFor="cl-letterbody">Cover Letter Body Content (Editable)</label>
                                    <textarea
                                        id="cl-letterbody"
                                        value={effectiveBody}
                                        onChange={(e) => this.setState({ letterBody: e.target.value })}
                                        className="cl-textarea cl-textarea--mono cuba-field"
                                        style={{ height: '18rem' }}
                                    />
                                </div>
                            )}

                                {/* 1-Click Tone Refinement Toolbar */}
                            <div className="cl-subcard" style={{ marginTop: '1.5rem' }}>
                                <div className="cl-subcard__head">
                                    <h2 className="cl-eyebrow">
                                        <FaMagic className="cl-eyebrow__icon" />
                                        <span>1-Click Tone Transformation:</span>
                                    </h2>
                                </div>
                                <div className="cl-share-tray" style={{ flexWrap: 'wrap' }}>
                                    {AI_TONES.map(t => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            disabled={this.state.isAiGenerating}
                                            onClick={() => this.generateAiCoverLetter(t.id)}
                                            aria-pressed={this.state.aiTone === t.id}
                                            className="cl-tone-pill cuba-focus-ring"
                                        >
                                            <span aria-hidden="true">{t.icon}</span>
                                            <span>{t.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="cl-card__head" style={{ marginTop: '1.5rem' }}>
                                <button
                                    type="button"
                                    onClick={() => this.setState({ step: 1 })}
                                    className="cl-btn cl-btn--neutral cl-btn--sm cuba-focus-ring">
                                    Back to Role Details
                                </button>
                                <div className="cl-modal__tools">
                                    <button
                                        type="button"
                                        onClick={() => this.generateAiCoverLetter()}
                                        disabled={this.state.isAiGenerating}
                                        className="cl-btn cl-btn--soft cl-btn--sm cuba-focus-ring">
                                        <FaSyncAlt className="cl-btn__glyph" />
                                        <span>{this.state.isAiGenerating ? '⚡ Regenerating...' : '⚡ 🔄 Regenerate AI Variation'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={this.handleSaveCoverLetter}
                                        disabled={this.state.isSaving}
                                        className="cl-btn cl-btn--neutral cl-btn--sm cuba-focus-ring">
                                        <FaBookmark className="cl-btn__glyph" />
                                        <span>{this.state.isSaving ? 'Saving...' : 'Save to Dashboard'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => this.setState({ step: 3 })}
                                        className="cl-btn cl-btn--primary cl-btn--sm cuba-focus-ring">
                                        Next: Export &amp; Share Package
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Final Export, Fullscreen Modal & Omni-Channel Share Package */}
                    {this.state.step === 3 && (
                        <div className="cl-card">
                            {/* Template Switcher Bar */}
                            <div className="cl-subcard">
                                <h2 className="cl-section-title" style={{ marginBottom: '0.75rem' }}>Cover Letter Style:</h2>
                                <div className="cl-share-tray" style={{ flexWrap: 'wrap' }}>
                                    {COVER_TEMPLATES.map(tpl => (
                                        <button
                                            key={tpl.id}
                                            type="button"
                                            onClick={() => this.setState({ templateId: tpl.id })}
                                            aria-pressed={(this.state.templateId || 'Cover1') === tpl.id}
                                            className="cl-chip-toggle cuba-focus-ring"
                                        >
                                            {tpl.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="cl-grid-2" style={{ marginTop: '1.5rem', gridTemplateColumns: '1fr' }}>
                                {/* Proportional Live Preview Card with Modal Trigger */}
                                <div>
                                    <div
                                        onClick={() => this.setState({ showPreviewModal: true })}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                this.setState({ showPreviewModal: true });
                                            }
                                        }}
                                        role="button"
                                        tabIndex={0}
                                        aria-label="Open fullscreen cover letter preview"
                                        className="cl-preview-stage"
                                        style={{ height: '490px' }}
                                    >
                                        {/* Hover Overlay */}
                                        <div className="cl-preview-stage__overlay">
                                            <span className="cl-preview-stage__cta">
                                                <FaExpand />
                                                <span>Click to Open Fullscreen Preview</span>
                                            </span>
                                        </div>

                                        {/* Scaled A4 Preview Board */}
                                        <div
                                            className="cl-paper"
                                            style={{
                                                width: '794px',
                                                minHeight: '1122px',
                                                transform: 'scale(0.40)',
                                                marginBottom: '-580px',
                                                flex: 'none',
                                            }}>
                                            <TemplateRenderer
                                                templateId={this.state.templateId || 'Cover1'}
                                                values={templateValues}
                                                language={this.props.i18n?.language || 'en'}
                                            />
                                        </div>
                                    </div>
                                    <div className="cl-card__head" style={{ marginTop: '0.5rem', paddingInline: '0.25rem' }}>
                                        <span className="cl-hint">Click preview card to open modal</span>
                                        <button
                                            type="button"
                                            onClick={() => this.setState({ showPreviewModal: true })}
                                            className="cl-text-action cuba-focus-ring">
                                            <FaExpand className="cl-text-action__glyph" />
                                            <span>Expand Preview</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Download & Omni-Channel Share Actions */}
                                <div>
                                    <div className="cl-card__head">
                                        <span className="cl-pill cl-pill--success">Ready for Submission</span>
                                        <span className="cl-subtle" style={{ fontSize: '0.625rem', fontFamily: 'ui-monospace, monospace' }}>{activeTemplate.id}</span>
                                    </div>
                                    <h2 className="cl-section-title" style={{ marginTop: '0.5rem', fontSize: '1.25rem' }}>Your Styled Cover Letter is Ready!</h2>
                                    <p className="cl-body-copy">
                                        Formatted using the <strong>{activeTemplate.name}</strong> template with dynamic candidate details.
                                    </p>

                                    {/* Primary Export Actions */}
                                    <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                        <button
                                            type="button"
                                            onClick={this.handlePrintCoverLetter}
                                            className="cl-btn cl-btn--primary cl-btn--block cuba-focus-ring">
                                            <FaPrint className="cl-btn__glyph" />
                                            <span>Print / Save as PDF ({activeTemplate.name})</span>
                                        </button>
                                        <button
                                            type="button"
                                            disabled={this.state.isSyncingTracker}
                                            onClick={() => this.handleSyncToJobTracker()}
                                            className="cl-btn cl-btn--soft cl-btn--block cuba-focus-ring">
                                            <FaBriefcase className="cl-btn__glyph" />
                                            <span>{this.state.isSyncingTracker ? 'Syncing to Job Tracker...' : '📌 Sync & Attach to Job Tracker'}</span>
                                        </button>
                                        <div className="cl-grid-2">
                                            <button
                                                type="button"
                                                onClick={this.exportCoverLetterTxt}
                                                className="cl-btn cl-btn--neutral cuba-focus-ring">
                                                <FaFileDownload className="cl-btn__glyph" />
                                                <span>Download Plain Text (.txt)</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={this.handleCopyFormattedText}
                                                className="cl-btn cl-btn--soft cuba-focus-ring">
                                                <FaCopy className="cl-btn__glyph" />
                                                <span>Copy Formatted Text</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Omni-Channel Social & Messaging Share Suite */}
                                    <div className="cl-subcard" style={{ marginTop: '1.5rem' }}>
                                        <h3 className="cl-eyebrow">
                                            <span aria-hidden="true">&#128640;</span>
                                            <span>Share Cover Letter with Recruiter</span>
                                        </h3>
                                        <div className="cl-share-grid" style={{ marginTop: '0.75rem' }}>
                                            <button type="button" onClick={this.handleShareWhatsApp} className="cl-share cl-share--success cuba-focus-ring" aria-label="Share cover letter on WhatsApp">
                                                <FaWhatsapp />
                                                <span className="cl-share__label">WhatsApp</span>
                                            </button>
                                            <button type="button" onClick={this.handleShareEmail} className="cl-share cl-share--info cuba-focus-ring" aria-label="Share cover letter by email">
                                                <FaEnvelope />
                                                <span className="cl-share__label">Email</span>
                                            </button>
                                            <button type="button" onClick={this.handleShareTelegram} className="cl-share cl-share--info cuba-focus-ring" aria-label="Share cover letter on Telegram">
                                                <FaTelegramPlane />
                                                <span className="cl-share__label">Telegram</span>
                                            </button>
                                            <button type="button" onClick={this.handleShareLinkedIn} className="cl-share cl-share--brand cuba-focus-ring" aria-label="Share cover letter on LinkedIn">
                                                <FaLinkedin />
                                                <span className="cl-share__label">LinkedIn</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Saved Cover Letters Gallery with Full CRUD */}
                    {this.state.savedLetters && this.state.savedLetters.length > 0 && (
                        <div className="cl-card">
                            <h2 className="cl-section-title" style={{ marginBottom: '0.5rem' }}>
                                Saved Cover Letters ({this.state.savedLetters.length})
                            </h2>
                            <div className="cl-grid-2">
                                {this.state.savedLetters.map(letter => {
                                    const tplInfo = this.getTemplateInfo(letter.templateId);
                                    return (
                                        <div key={letter.id} className="cl-subcard">
                                            {/* Card Top Row: Title, Template Badge, and View Popup Icon */}
                                            <div className="cl-card__head" style={{ alignItems: 'flex-start' }}>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div className="cl-card__head" style={{ justifyContent: 'flex-start' }}>
                                                        <h3 className="cl-section-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {letter.jobTitle || 'Target Position'}
                                                        </h3>
                                                        <span className="cl-pill cl-pill--neutral cl-pill--sm">
                                                            {tplInfo.name}
                                                        </span>
                                                    </div>
                                                    <p className="cl-hint">
                                                        {letter.companyName ? `🏢 ${letter.companyName}` : 'Company Not Specified'}
                                                    </p>
                                                    <p className="cl-hint">
                                                        Candidate: <strong className="cl-strong">{letter.candidateFirstname ? `${letter.candidateFirstname} ${letter.candidateLastname || ''}` : (candidateFullName || 'User Profile')}</strong>
                                                    </p>
                                                </div>

                                                {/* View Modal Popup Button */}
                                                <button
                                                    type="button"
                                                    title="Preview Cover Letter (Fullscreen A4)"
                                                    onClick={() => this.handleViewSavedLetter(letter)}
                                                    className="cl-btn cl-btn--soft cl-btn--sm cuba-focus-ring"
                                                    style={{ flex: 'none' }}
                                                >
                                                    <FaEye className="cl-btn__glyph" />
                                                    <span>View</span>
                                                </button>
                                            </div>

                                            {/* Card Bottom Row: Share Icons & Primary Actions */}
                                            <hr className="cl-divider" style={{ margin: '0.75rem 0' }} />
                                            <div className="cl-card__head">
                                                {/* Quick Share Icons */}
                                                <div className="cl-share-tray">
                                                    <button
                                                        type="button"
                                                        title="Share via WhatsApp"
                                                        aria-label={`Share ${letter.jobTitle || 'cover letter'} via WhatsApp`}
                                                        onClick={() => this.handleShareLetterWhatsApp(letter)}
                                                        className="cl-icon-btn cuba-focus-ring">
                                                        <FaWhatsapp className="cl-icon-btn__glyph" style={{ color: 'var(--cuba-success)' }} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Share via Email"
                                                        aria-label={`Share ${letter.jobTitle || 'cover letter'} via email`}
                                                        onClick={() => this.handleShareLetterEmail(letter)}
                                                        className="cl-icon-btn cuba-focus-ring">
                                                        <FaEnvelope className="cl-icon-btn__glyph" style={{ color: 'var(--cuba-info)' }} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Share via Telegram"
                                                        aria-label={`Share ${letter.jobTitle || 'cover letter'} via Telegram`}
                                                        onClick={() => this.handleShareLetterTelegram(letter)}
                                                        className="cl-icon-btn cuba-focus-ring">
                                                        <FaTelegramPlane className="cl-icon-btn__glyph" style={{ color: 'var(--cuba-info)' }} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Share via LinkedIn"
                                                        aria-label={`Share ${letter.jobTitle || 'cover letter'} via LinkedIn`}
                                                        onClick={() => this.handleShareLetterLinkedIn(letter)}
                                                        className="cl-icon-btn cuba-focus-ring">
                                                        <FaLinkedin className="cl-icon-btn__glyph" style={{ color: 'var(--cuba-primary)' }} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Copy Cover Letter Text"
                                                        aria-label={`Copy ${letter.jobTitle || 'cover letter'} text`}
                                                        onClick={() => this.handleCopyLetterText(letter)}
                                                        className="cl-icon-btn cuba-focus-ring">
                                                        <FaCopy className="cl-icon-btn__glyph" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Sync & Attach to Job Tracker"
                                                        aria-label={`Sync ${letter.jobTitle || 'cover letter'} to the job tracker`}
                                                        onClick={() => this.handleSyncToJobTracker(letter)}
                                                        className="cl-icon-btn cuba-focus-ring">
                                                        <FaBriefcase className="cl-icon-btn__glyph" />
                                                    </button>
                                                </div>

                                                {/* Action Buttons: Edit, Duplicate, Delete */}
                                                <div className="cl-share-tray" style={{ gap: '0.375rem' }}>
                                                    <button
                                                        type="button"
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
                                                        className="cl-btn cl-btn--soft cl-btn--sm cuba-focus-ring">
                                                        <FaEdit className="cl-btn__glyph" />
                                                        <span>Edit</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => this.handleDuplicateCoverLetter(letter)}
                                                        className="cl-btn cl-btn--neutral cl-btn--sm cuba-focus-ring">
                                                        <FaClone className="cl-btn__glyph" />
                                                        <span>Duplicate</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => this.setState({ letterToDelete: letter })}
                                                        className="cl-btn cl-btn--danger cl-btn--sm cuba-focus-ring">
                                                        <FaTrashAlt className="cl-btn__glyph" />
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

/* react-router-dom v7 removed `withRouter`, so the route location is injected
   by a thin function wrapper instead of a HOC. This is what makes the AC-2
   shell gate possible: `pathname` tells the builder whether it is mounted
   inside CubaCandidateShell (/dashboard/cover-letters, where the shell already
   renders the logo and a dashboard link) or standalone (/coverletter, where
   it must supply that chrome itself). */
function CoverLetterRoute(props) {
    const location = useLocation();
    const [searchParams] = useSearchParams();
    // DIR-020 AC-11 (5): the job tracker's "View linked cover letter" action
    // navigates here with the tracked role/company as query params. They are
    // forwarded as real props so the builder opens with genuine job context
    // instead of a blank form. Absent params simply stay undefined.
    const roleContext = {
        jobTitle: searchParams.get('role') || '',
        companyName: searchParams.get('company') || '',
    };
    return <MyComponent {...props} {...roleContext} pathname={location.pathname} />;
}

export default CoverLetterRoute;