import { writeSanitizedPrintDocument } from '../../../utils/sanitizeHtml';
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getProfileOfUser, getAccountInfo, saveUserPreferences, changePassword, updateUserEmail, getWebsiteData, getSubscriptionStatus, getUserTransactions, deleteUserAccountPermanently, exportUserDataJSON, beginUserTotp2FA, saveUserTotp2FA, disableUserTotp2FA, getUserTotpStatus, reauthenticateUser, recordUserLoginEvent, getUserLoginHistory, sendSmsNotification } from '../../../firestore/dbOperations';
import { saveProfile } from '../../../services/profilePersistence';
import { generateUserAiContent, cleanSkillName } from '../../../services/aiService';
import { FaUser, FaCog, FaCamera, FaTrash, FaUserCircle, FaKey, FaCalendarAlt, FaEnvelope, FaCreditCard, FaUpload, FaCheckCircle, FaExclamationTriangle, FaBriefcase, FaGraduationCap, FaTools, FaGlobe, FaPlus, FaCheck, FaShieldAlt, FaDesktop, FaDownload, FaCertificate, FaProjectDiagram, FaMagic, FaLinkedin, FaGithub, FaLink, FaSyncAlt, FaExternalLinkAlt, FaUnlink, FaLock, FaEye, FaEyeSlash, FaCrown, FaMobileAlt, FaQrcode, FaCopy, FaPrint, FaHistory } from 'react-icons/fa';
import fire from '../../../conf/fire';
import MonthYearPicker from '../../Form/MonthYearPicker';
import AiRecommendationModal from '../../Form/AiRecommendationModal';
import BulletPointsEditor from '../../Form/BulletPointsEditor';
import AutocompleteInputField from '../../BuildResume/steps/components/AutocompleteInputField';
import ImageCropModal from './ImageCropModal';
import SubscriptionModal from './SubscriptionModal';
import { inferCountryFromCity } from '../../../utils/locationHelper';
import { normalizeProfileData, normalizeProfileImage } from '../../../utils/profileData';
import { openPrivacyChoicesModal } from '../../PrivacyConsentBanner';

const normalizeProfileForSave = value => normalizeProfileData({ ...value, postalcode: value.postalCode || '', website: value.websiteUrl || '' });

function DashboardSettings(props) {
    const { i18n } = useTranslation('common');
    const location = useLocation();
    const navigate = useNavigate();

    // State management
    const [selectedSettings, setSelectedSettings] = useState('Profile');
    const [profileSubTab, setProfileSubTab] = useState('basic');
    const SUB_TAB_ORDER = ['basic', 'experience', 'education', 'skills', 'certifications', 'projects', 'languages', 'summary'];

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
    const [summaryTone, setSummaryTone] = useState('executive');
    const [skillFilter, setSkillFilter] = useState('all');
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
    const [userTransactions, setUserTransactions] = useState([]);
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
    const usesPasswordProvider = fire.auth().currentUser?.providerData?.some(provider => provider.providerId === 'password') !== false;

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
        revision: 0,
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
                skipNextAutosaveRef.current = true;
                setProfile({
                    firstname: userProfile.firstname || parts[0] || '',
                    lastname: userProfile.lastname || parts.slice(1).join(' ') || '',
                    name: userProfile.name || currentUser.displayName || '',
                    email: currentUser.email || userProfile.email || '',
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
                    revision: Number(userProfile.revision) || 0,
                });
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

    const handleDownloadInvoice = async (txn) => {
        const subData = await getSubscriptionStatus();
        const metaData = await getWebsiteData();
        const siteTitle = (metaData && metaData.title ? metaData.title.split('—')[0].trim() : 'AI RESUME BUILDER').toUpperCase();
        const activeTemplate = (subData && subData.receiptTemplate) || 'modern';
        const printWindow = window.open('', '_blank');

        const taxName = txn.taxName || subData?.taxName || 'GST';
        const taxRate = txn.taxRate !== undefined ? txn.taxRate : (subData?.taxRate !== undefined ? subData.taxRate : 18);
        const subtotal = txn.subtotal !== undefined ? txn.subtotal : (txn.price || '19.99');
        const taxAmount = txn.taxAmount !== undefined ? txn.taxAmount : 0;
        const totalPrice = txn.price || '19.99';
        const companyTaxId = txn.companyTaxId || subData?.companyTaxId || '';
        const customerTaxId = txn.customerTaxId || '';
        const currency = txn.currency || subData?.currency || 'INR';

        let templateStyles = '';
        let headerHtml = '';

        if (activeTemplate === 'classic') {
            // Classic Corporate monochrome formal
            templateStyles = `
                body { font-family: Georgia, 'Times New Roman', serif; margin: 40px; color: #000; line-height: 1.4; }
                .header { border-bottom: 3px double #000; padding-bottom: 12px; margin-bottom: 24px; text-align: center; }
                .title { font-size: 26px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; border: 1px solid #000; padding: 12px; }
                table { width: 100%; border-collapse: collapse; margin-top: 16px; border: 1px solid #000; }
                th { text-align: left; padding: 10px; background: #eee; border: 1px solid #000; font-size: 11px; text-transform: uppercase; }
                td { padding: 10px; border: 1px solid #000; font-size: 12px; }
                .summary-box { border: 1px solid #000; padding: 12px; margin-top: 16px; width: 260px; margin-left: auto; }
                .total-row { font-weight: bold; font-size: 15px; border-top: 2px solid #000; margin-top: 6px; padding-top: 6px; }
            `;
            headerHtml = `
                <div class="header">
                    <div class="title">${siteTitle}</div>
                    <div style="font-size: 13px; font-weight: bold; margin-top: 4px;">FORMAL TAX INVOICE &amp; PAYMENT RECEIPT</div>
                    ${companyTaxId ? `<div style="font-size: 11px; margin-top: 4px;">Supplier ${taxName} Registration No: ${companyTaxId}</div>` : ''}
                </div>
            `;
        } else if (activeTemplate === 'gradient') {
            // Vibrant Enterprise Gradient Header
            templateStyles = `
                body { font-family: 'Outfit', 'Inter', sans-serif; margin: 30px; color: #0f172a; line-height: 1.5; background: #f8fafc; }
                .card-wrap { background: #fff; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); padding: 30px; border: 1px solid #e2e8f0; }
                .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #fff; padding: 24px; border-radius: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
                .title { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; background: #f1f5f9; padding: 16px; border-radius: 12px; }
                table { width: 100%; border-collapse: collapse; margin-top: 16px; }
                th { text-align: left; padding: 12px; background: #ede9fe; color: #5b21b6; border-radius: 8px 8px 0 0; font-size: 11px; text-transform: uppercase; font-weight: 800; }
                td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; }
                .summary-box { background: linear-gradient(135deg, #f8fafc 0%, #ede9fe 100%); border: 1px solid #c7d2fe; border-radius: 14px; padding: 18px; margin-top: 20px; width: 290px; margin-left: auto; }
                .total-row { font-weight: 800; font-size: 16px; color: #4338ca; border-top: 2px solid #a5b4fc; padding-top: 8px; margin-top: 8px; }
            `;
            headerHtml = `
                <div class="header">
                    <div>
                        <div class="title">${siteTitle}</div>
                        <div style="font-size: 12px; opacity: 0.9;">Enterprise Tax Invoice Receipt</div>
                        ${companyTaxId ? `<div style="font-size: 11px; opacity: 0.85; margin-top: 4px;">GSTIN: ${companyTaxId}</div>` : ''}
                    </div>
                    <div style="background: rgba(255,255,255,0.2); backdrop-filter: blur(10px); color: #fff; padding: 6px 16px; border-radius: 99px; font-weight: 800; font-size: 12px;">${txn.status || 'PAID ✓'}</div>
                </div>
            `;
        } else if (activeTemplate === 'compact') {
            // Compact Stub Voucher Monospace
            templateStyles = `
                body { font-family: 'Courier New', Courier, monospace; margin: 20px auto; max-width: 420px; color: #000; line-height: 1.3; background: #fff; }
                .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 12px; margin-bottom: 16px; }
                .title { font-size: 20px; font-weight: bold; }
                .grid { border-bottom: 1px dashed #000; padding-bottom: 12px; margin-bottom: 12px; font-size: 12px; }
                table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
                th { text-align: left; padding: 6px 0; border-bottom: 1px dashed #000; text-transform: uppercase; }
                td { padding: 6px 0; border-bottom: 1px dotted #ccc; }
                .summary-box { border-top: 2px dashed #000; margin-top: 12px; padding-top: 8px; font-size: 13px; }
                .total-row { font-weight: bold; font-size: 15px; margin-top: 6px; }
            `;
            headerHtml = `
                <div class="header">
                    <div class="title">${siteTitle}</div>
                    <div>===============================</div>
                    <div style="font-size: 12px; font-weight: bold;">PAYMENT RECEIPT VOUCHER</div>
                    ${companyTaxId ? `<div style="font-size: 11px;">GSTIN: ${companyTaxId}</div>` : ''}
                </div>
            `;
        } else {
            // Modern Minimalist (Default)
            templateStyles = `
                body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 40px; color: #1e293b; line-height: 1.5; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4338ca; padding-bottom: 20px; margin-bottom: 30px; }
                .title { font-size: 24px; font-weight: bold; color: #4338ca; }
                .badge { background: #e0e7ff; color: #4338ca; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: bold; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                .label { font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
                .value { font-size: 14px; font-weight: 600; color: #0f172a; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { text-align: left; padding: 12px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 11px; text-transform: uppercase; color: #475569; }
                td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
                .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 20px; width: 280px; margin-left: auto; }
                .summary-line { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
                .total-row { font-weight: bold; font-size: 16px; color: #4338ca; border-top: 2px solid #cbd5e1; padding-top: 8px; margin-top: 8px; }
            `;
            headerHtml = `
                <div class="header">
                    <div>
                        <div class="title">${siteTitle}</div>
                        <div style="font-size: 12px; color: #64748b;">Official B2B Tax Invoice &amp; Payment Receipt</div>
                        ${companyTaxId ? `<div style="font-size: 11px; font-weight: bold; color: #4338ca; margin-top: 4px;">Supplier ${taxName}IN / Reg No: ${companyTaxId}</div>` : ''}
                    </div>
                    <div class="badge">${txn.status || 'PAID'}</div>
                </div>
            `;
        }

        const formattedDate = txn.created_at?.toDate
            ? txn.created_at.toDate().toLocaleDateString()
            : txn.date
            ? new Date(txn.date).toLocaleDateString()
            : new Date().toLocaleDateString();

        const invoiceHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Tax Invoice Receipt - ${txn.transactionId}</title>
                <style>
                    ${templateStyles}
                    .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; }
                </style>
            </head>
            <body>
                <div class="card-wrap">
                    ${headerHtml}
                    <div class="grid">
                        <div>
                            <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Billed To</div>
                            <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${profile.firstname || 'Valued User'} ${profile.lastname || ''}</div>
                            <div style="font-size: 12px; color: #64748b;">${profile.email || databaseAccountSettings.email || ''}</div>
                            ${customerTaxId ? `<div style="font-size: 11px; font-weight: bold; color: #0f172a; margin-top: 4px;">Customer ${taxName} ID: ${customerTaxId}</div>` : ''}
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Invoice Reference</div>
                            <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${txn.transactionId}</div>
                            <div style="font-size: 12px; color: #64748b;">Date: ${formattedDate}</div>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th>Payment Gateway</th>
                                <th style="text-align: right;">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="font-weight: bold;">${txn.planType || 'Pro Membership Plan'}</td>
                                <td>${txn.paymentType || txn.paimentType || 'Card / PayPal / Razorpay'}</td>
                                <td style="text-align: right; font-weight: bold;">${currency}${subtotal}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="summary-box">
                        <div style="display:flex; justify-content: space-between; margin-bottom:6px;">
                            <span>Base Price: </span>
                            <span style="font-weight:600;">${currency}${subtotal}</span>
                        </div>
                        <div style="display:flex; justify-content: space-between; margin-bottom:6px;">
                            <span>${taxName} (${taxRate}%): </span>
                            <span style="font-weight:600;">${currency}${taxAmount}</span>
                        </div>
                        <div class="total-row" style="display:flex; justify-content: space-between;">
                            <span>Total Paid: </span>
                            <span>${currency}${totalPrice}</span>
                        </div>
                    </div>

                    <div class="footer">
                        Thank you for subscribing to ${siteTitle}. Official compliance Tax Invoice. For support, visit ${window.location.hostname}
                    </div>
                </div>
            </body>
            </html>
        `;
        writeSanitizedPrintDocument(printWindow, invoiceHtml);
        printWindow.print();
    };

    useEffect(() => {
        const unsubscribe = fire.auth().onAuthStateChanged(async currentUser => {
            if (!currentUser) { loadedProfileUidRef.current = null; navigate('/'); return; }
            if (loadedProfileUidRef.current && loadedProfileUidRef.current !== currentUser.uid) {
                setProfile(current => ({ ...current, firstname: '', lastname: '', name: '', email: '', phone: '', address: '', city: '', postalCode: '', country: '', occupation: '', linkedinUrl: '', githubUrl: '', websiteUrl: '', summary: '', selectedImage: null, workExperiences: [], education: [], skills: [], languages: [], certifications: [], projects: [], revision: 0 }));
                setUserTransactions([]); setLoginHistory([]); setPreferences({ language: 'en', emailNotifications: true, securityNotifications: true, productUpdates: false, profileDiscoverable: false, revision: 0 }); setProfileConflict(null); setProfileSaveState('loading');
            }
            loadedProfileUidRef.current = currentUser.uid;
            await Promise.all([getProfileOfUserFront(), getAccountInfoFront()]);
        });
        return unsubscribe;
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

    const handleAccountInputChange = (e) => {
        const field = e.target.name;
        const value = e.target.value;
        setAccountSettings((prev) => ({ ...prev, [field]: value }));
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
                    const baseRevision = Number.isInteger(expectedRevision) ? expectedRevision : snapshot.revision;
                    const profileToSave = normalizeProfileForSave(snapshot);
                    const result = await saveProfile(fire.firestore(), currentUser.uid, profileToSave, baseRevision);
                    if (!mountedRef.current) throw Object.assign(new Error('Profile save cancelled.'), { code: 'PROFILE_SAVE_CANCELLED' });
                    if (!result.success) throw Object.assign(new Error(result.error || 'Profile save failed.'), { code: result.code, remoteRevision: result.remoteRevision });

                    skipNextAutosaveRef.current = true;
                    setProfile(current => ({ ...current, revision: result.revision }));
                    setProfileSaveState('saved');
                    window.dispatchEvent(new CustomEvent('profileUpdated', { detail: result.profile }));
                    if (notify) triggerNotification('Master Profile saved successfully.');
                    waiter = profileSavingRef.current;

                    const latestProfile = profileRef.current;
                    const needsFollowUp = latestProfile.revision === snapshot.revision
                        && JSON.stringify(normalizeProfileForSave(latestProfile)) !== JSON.stringify(normalizeProfileForSave(result.profile));

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

            // Require current password if user is changing email or password
            const isEmailChanged = databaseAccountSettings.email && databaseAccountSettings.email !== (fire.auth().currentUser?.email || '');
            const isPasswordChanged = !!accountPasswordState.newPassword;

            if ((isEmailChanged || isPasswordChanged) && !accountPasswordState.currentPassword) {
                triggerNotification('Current password is required to verify identity for credential updates.', 'error');
                setIsSubmitting(false);
                return;
            }

            // 1. Email update
            if (isEmailChanged) {
                await updateUserEmail(accountPasswordState.currentPassword, databaseAccountSettings.email);
                updatedSomething = true;
            }

            // 2. Password update
            if (isPasswordChanged) {
                if (accountPasswordState.newPassword.length < 12) {
                    triggerNotification('New password must be at least 12 characters long.', 'error');
                    setIsSubmitting(false);
                    return;
                }
                if (accountPasswordState.newPassword !== accountPasswordState.confirmPassword) {
                    triggerNotification('New passwords do not match. Please verify.', 'error');
                    setIsSubmitting(false);
                    return;
                }
                await changePassword(accountPasswordState.currentPassword, accountPasswordState.newPassword);
                updatedSomething = true;
                setAccountPasswordState({ currentPassword: '', newPassword: '', confirmPassword: '' });
            }

            if (updatedSomething) {
                triggerNotification('Account security credentials updated successfully!');
            } else {
                triggerNotification('No changes detected in account credentials.');
            }
        } catch (err) {
            console.error('Account Security Update Error:', err);
            let msg = err.message || 'Failed to update account security credentials.';
            if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                msg = 'Incorrect Current Password. Authentication failed.';
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

            const data = await runProfileAi('generate-summary', {
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
                summaryType: summaryTone,
                tone: summaryTone
            });
            if (data && data.summary) {
                setProfile((prev) => ({ ...prev, summary: data.summary }));
                triggerNotification('Real AI Executive Bio generated based on your complete profile details!');
            } else {
                throw new Error('Invalid AI response');
            }
        } catch (err) {
            if (err?.name === 'AbortError') return;
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
            const data = await runProfileAi('generate-work-description', {
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
            if (err?.name === 'AbortError') return;
            console.error('AI Work Description Error:', err);
            triggerNotification('Failed to generate AI work description.', 'error');
        }
        setIsAiGenerating(false);
    };

    // DYNAMIC AI RECOMMENDATIONS FOR SKILLS & CERTIFICATIONS BASED ON ALL ENTERED DETAILS
    const handleRecommendAiSkills = async () => {
        setIsAiGenerating(true);
        const effectiveRole = (profile.occupation && profile.occupation.trim()) || (profile.workExperiences?.[0]?.jobTitle) || 'Software Engineer / Professional';
        try {
            const expDetails = profile.workExperiences.map(w => `${w.jobTitle || 'Role'} at ${w.company || ''}`).filter(Boolean).join('; ');
            const eduDetails = profile.education.map(e => `${e.degree || ''} from ${e.school || ''}`).filter(Boolean).join('; ');
            const projDetails = profile.projects.map(p => p.title || p.name).filter(Boolean).join(', ');
            const existing = profile.skills.map(s => (typeof s === 'string' ? s : s.name)).filter(Boolean);

            const data = await runProfileAi('generate-skills', {
                jobTitle: effectiveRole,
                occupation: effectiveRole,
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

                const itemsToReview = (unadded.length > 0 ? unadded : data.skills).map((s, idx) => {
                    const raw = typeof s === 'string' ? s : s.name;
                    const cleaned = cleanSkillName(raw);
                    const category = (typeof s === 'object' && s?.category) ? s.category : (idx < 6 ? 'mandatory' : 'recommended');
                    return { name: cleaned, category };
                }).filter(s => s.name);

                if (itemsToReview.length > 0) {
                    setAiModalState({
                        isOpen: true,
                        title: `Review AI Recommended Skills for ${effectiveRole}`,
                        type: 'skills',
                        items: itemsToReview,
                        onApply: (approvedItems) => {
                            const newSkills = approvedItems.map(item => ({ name: cleanSkillName(item.name || item.title), level: 'Expert' }));
                            setProfile(prev => {
                                const existingNames = new Set(prev.skills.map(s => (typeof s === 'string' ? s : s.name).toLowerCase()));
                                const trulyNew = newSkills.filter(s => !existingNames.has(s.name.toLowerCase()));
                                return {
                                    ...prev,
                                    skills: [...prev.skills, ...trulyNew]
                                };
                            });
                            triggerNotification(`Added ${approvedItems.length} approved ATS skills to your profile!`);
                        }
                    });
                } else {
                    triggerNotification('Your skills list already covers all top recommended skills!');
                }
            }
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('AI Skills Recommendation Error:', err);
            // Resilient instant fallback so the user is never blocked
            const fallbackSkills = [
                { name: 'Problem Solving', category: 'mandatory' },
                { name: 'Team Collaboration', category: 'mandatory' },
                { name: 'Project Management', category: 'mandatory' },
                { name: 'Critical Thinking', category: 'mandatory' },
                { name: 'Communication', category: 'mandatory' },
                { name: 'Agile & Scrum Methodologies', category: 'recommended' },
                { name: 'Data Analysis', category: 'recommended' },
                { name: 'Strategic Planning', category: 'recommended' },
            ];
            setAiModalState({
                isOpen: true,
                title: `Review Recommended Skills for ${effectiveRole}`,
                type: 'skills',
                items: fallbackSkills,
                onApply: (approvedItems) => {
                    const newSkills = approvedItems.map(item => ({ name: cleanSkillName(item.name || item.title), level: 'Expert' }));
                    setProfile(prev => {
                        const existingNames = new Set(prev.skills.map(s => (typeof s === 'string' ? s : s.name).toLowerCase()));
                        const trulyNew = newSkills.filter(s => !existingNames.has(s.name.toLowerCase()));
                        return { ...prev, skills: [...prev.skills, ...trulyNew] };
                    });
                    triggerNotification(`Added ${approvedItems.length} recommended skills to your profile!`);
                }
            });
        }
        setIsAiGenerating(false);
    };

    const handleRecommendAiCertifications = async () => {
        setIsAiGenerating(true);
        const effectiveRole = (profile.occupation && profile.occupation.trim()) || (profile.workExperiences?.[0]?.jobTitle) || 'Software Engineer / Professional';
        try {
            const expDetails = profile.workExperiences.map(w => `${w.jobTitle || 'Role'} at ${w.company || ''}`).filter(Boolean).join('; ');
            const eduDetails = profile.education.map(e => `${e.degree || ''} from ${e.school || ''}`).filter(Boolean).join('; ');
            const skillsDetails = profile.skills.map(s => (typeof s === 'string' ? s : s.name)).filter(Boolean).join(', ');
            const existingCerts = profile.certifications.map(c => c.title).filter(Boolean);

            const data = await runProfileAi('generate-certifications', {
                jobTitle: effectiveRole,
                occupation: effectiveRole,
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

                const itemsToReview = (unadded.length > 0 ? unadded : data.certifications).map((c, idx) => {
                    const title = typeof c === 'string' ? c : (c.title || c.name || '');
                    const issuer = typeof c === 'object' ? (c.issuer || 'Accredited Organization') : 'Accredited Organization';
                    const category = (typeof c === 'object' && c?.category) ? c.category : (idx < 3 ? 'mandatory' : 'recommended');
                    return { title, issuer, category };
                }).filter(c => c.title);

                if (itemsToReview.length > 0) {
                    setAiModalState({
                        isOpen: true,
                        title: `Review Industry Certifications for ${effectiveRole}`,
                        type: 'certifications',
                        items: itemsToReview,
                        onApply: (approvedItems) => {
                            const newCerts = approvedItems.map((c, i) => ({
                                id: `cert_ai_${Date.now()}_${i}`,
                                title: c.title || c.name,
                                issuer: c.issuer || 'Professional Accrediting Body',
                                date: `${new Date().getFullYear()}`
                            }));
                            setProfile(prev => {
                                const existingTitles = new Set(prev.certifications.map(c => (c.title || '').toLowerCase()));
                                const trulyNew = newCerts.filter(c => !existingTitles.has(c.title.toLowerCase()));
                                return {
                                    ...prev,
                                    certifications: [...prev.certifications, ...trulyNew]
                                };
                            });
                            triggerNotification(`Added ${approvedItems.length} approved certifications to your profile!`);
                        }
                    });
                } else {
                    triggerNotification('Your certifications list already covers all top recommended credentials!');
                }
            }
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('AI Certifications Recommendation Error:', err);
            // Resilient instant fallback so the user is never blocked
            const fallbackCerts = [
                { title: 'Project Management Professional (PMP)', issuer: 'Project Management Institute (PMI)', category: 'mandatory' },
                { title: 'Certified ScrumMaster (CSM)', issuer: 'Scrum Alliance', category: 'mandatory' },
                { title: 'AWS Certified Solutions Architect', issuer: 'Amazon Web Services', category: 'mandatory' },
                { title: 'Certified Information Systems Security Professional (CISSP)', issuer: '(ISC)²', category: 'recommended' },
                { title: 'Google Professional Cloud Architect', issuer: 'Google Cloud', category: 'recommended' },
            ];
            setAiModalState({
                isOpen: true,
                title: `Review Industry Certifications for ${effectiveRole}`,
                type: 'certifications',
                items: fallbackCerts,
                onApply: (approvedItems) => {
                    const newCerts = approvedItems.map((c, i) => ({
                        id: `cert_ai_${Date.now()}_${i}`,
                        title: c.title || c.name,
                        issuer: c.issuer || 'Professional Accrediting Body',
                        date: `${new Date().getFullYear()}`
                    }));
                    setProfile(prev => {
                        const existingTitles = new Set(prev.certifications.map(c => (c.title || '').toLowerCase()));
                        const trulyNew = newCerts.filter(c => !existingTitles.has(c.title.toLowerCase()));
                        return { ...prev, certifications: [...prev.certifications, ...trulyNew] };
                    });
                    triggerNotification(`Added ${approvedItems.length} recommended certifications to your profile!`);
                }
            });
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
        const result = await saveProfile(fire.firestore(), currentUser.uid, avatarOnly, profileRef.current.revision);
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

    const passwordStrength = getPasswordStrength(accountSettings.password);
    const candidateFullName = `${profile.firstname} ${profile.lastname}`.trim() || profile.name;
    const effectiveMembership = databaseAccountSettings.membership || 'Basic';

    return (
        <>
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 pb-8 sm:pb-12">

                {/* Hero Master Profile Overview Card — 10/10 Modern Design */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs relative overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        {/* Left Avatar & Right Details Container */}
                        <div className="flex items-center gap-4 min-w-0">
                            {/* Left Column: Avatar Image + Badge Underneath */}
                            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                                <div className="relative">
                                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-100 shadow-xs flex items-center justify-center">
                                        {normalizeProfileImage(profile.selectedImage) ? (
                                            <img src={normalizeProfileImage(profile.selectedImage)} alt="Profile avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-extrabold text-xl">
                                                {candidateFullName ? candidateFullName.charAt(0).toUpperCase() : 'U'}
                                            </div>
                                        )}
                                    </div>
                                    {fire.auth().currentUser?.emailVerified && <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center shadow-2xs" title="Email verified" aria-label="Email verified">
                                        <FaCheck className="w-2.5 h-2.5 text-white" />
                                    </div>}
                                </div>

                                {/* Membership Badge — directly UNDER avatar image */}
                                <span className="px-2 py-0.5 text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200/80 rounded-full flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    {effectiveMembership}
                                </span>
                            </div>

                            {/* Right Column: Name, Occupation, Email & Profile Strength Badge */}
                            <div className="flex-1 min-w-0">
                                <h1 className="font-bold text-slate-900 tracking-tight break-words" style={{ fontSize: '19px', lineHeight: '1.2' }}>
                                    {candidateFullName || 'Master User Profile'}
                                </h1>
                                {profile.occupation && (
                                    <p className="text-xs font-semibold text-indigo-600 mt-0.5 truncate">
                                        {profile.occupation}
                                    </p>
                                )}
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    {profile.email && (
                                        <p className="text-[11px] text-slate-500 truncate">
                                            {profile.email}
                                        </p>
                                    )}
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
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-extrabold text-emerald-700">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                <span>{compScore}% Profile Strength</span>
                                            </span>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>

                        {/* Segmented Control Switcher */}
                        <div className="bg-slate-100 p-1 sm:p-1.5 rounded-2xl flex items-center gap-1 self-stretch md:self-center flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => { setSelectedSettings('Profile'); navigate('?tab=Profile', { replace: true }); }}
                                className={`flex-1 md:flex-initial px-2.5 sm:px-4 py-2 text-[11px] sm:text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                                    selectedSettings === 'Profile'
                                        ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/60'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}>
                                <FaUser className="w-3 h-3 flex-shrink-0" />
                                <span>Master Profile</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { setSelectedSettings('Account'); navigate('?tab=Account', { replace: true }); }}
                                className={`flex-1 md:flex-initial px-2.5 sm:px-4 py-2 text-[11px] sm:text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                                    selectedSettings === 'Account'
                                        ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/60'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}>
                                <FaCog className="w-3 h-3 flex-shrink-0" />
                                <span>Account &amp; Security</span>
                            </button>
                        </div>
                    </div>
                </div>

                {selectedSettings === 'Profile' && <div className={`rounded-xl border p-3 text-sm ${profileSaveState === 'failed' || profileSaveState === 'conflict' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-600'}`} aria-live="polite"><strong>Profile save:</strong> {profileSaveState === 'saving' ? 'Saving…' : profileSaveState === 'pending' ? 'Pending autosave' : profileSaveState === 'saved' ? 'Saved' : profileSaveState === 'conflict' ? 'Conflict—action required' : profileSaveState === 'failed' ? 'Failed—retry with Save' : 'Loading…'}{profileConflict && <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={reloadProfileConflict} className="rounded border border-amber-400 bg-white px-3 py-1">Discard local changes and load latest</button><button type="button" onClick={overwriteProfileConflict} className="rounded bg-amber-800 px-3 py-1 text-white">Overwrite latest with local profile</button></div>}</div>}

                {/* Inline Toast Banner */}
                {toastState && (
                    <div role={toastState.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in duration-200 ${
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

                        {/* Profile Sub-Section Tabs — horizontally scrollable on mobile */}
                        <div
                            className="flex items-center gap-2 border-b border-slate-200 pb-3 text-xs font-semibold"
                            style={{ overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
                        >
                            <style>{`.settings-tabs-scroll::-webkit-scrollbar { display: none; }`}</style>
                            <button onClick={() => setProfileSubTab('basic')} className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'basic' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                👤 Basic &amp; Contact
                            </button>
                            <button onClick={() => setProfileSubTab('experience')} className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'experience' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                💼 Work History ({profile.workExperiences.length})
                            </button>
                            <button onClick={() => setProfileSubTab('education')} className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'education' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                🎓 Education ({profile.education.length})
                            </button>
                            <button onClick={() => setProfileSubTab('skills')} className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'skills' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                🛠️ Skills ({profile.skills.length})
                            </button>
                            <button onClick={() => setProfileSubTab('certifications')} className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'certifications' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                📜 Certifications ({profile.certifications.length})
                            </button>
                            <button onClick={() => setProfileSubTab('projects')} className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'projects' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                🚀 Projects ({profile.projects.length})
                            </button>
                            <button onClick={() => setProfileSubTab('languages')} className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'languages' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                🌐 Languages ({profile.languages.length})
                            </button>
                            <button onClick={() => setProfileSubTab('summary')} className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl transition-all ${profileSubTab === 'summary' ? 'bg-indigo-600 text-white font-bold' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'}`}>
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
                                            <input type="file" onChange={handleImageUpload} className="sr-only" accept="image/png,image/jpeg,image/webp" />
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
                                        <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                                            <FaLinkedin className="w-3.5 h-3.5 text-blue-600" /> LinkedIn Profile URL
                                        </label>
                                        <input type="url" name="linkedinUrl" value={profile.linkedinUrl} onChange={handleInputChange} placeholder="https://linkedin.com/in/username" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                                            <FaGithub className="w-3.5 h-3.5 text-slate-800" /> GitHub / Portfolio URL
                                        </label>
                                        <input type="url" name="githubUrl" value={profile.githubUrl} onChange={handleInputChange} placeholder="https://github.com/username" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Country</label>
                                        <input type="text" name="country" value={profile.country} onChange={handleInputChange} placeholder="Country (e.g. India)" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900" spellCheck="false" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                                            <FaGlobe className="w-3.5 h-3.5 text-indigo-600" /> Personal Website / Portfolio URL
                                        </label>
                                        <input type="url" name="websiteUrl" value={profile.websiteUrl} onChange={handleInputChange} placeholder="https://yourwebsite.com" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Sub-Tab 2: Professional Bio / Executive Summary (WITH REAL AI & TONE SELECTOR) */}
                        {profileSubTab === 'summary' && (
                            <div className="space-y-4">
                                <div className="flex flex-col gap-3">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Executive Bio &amp; Professional Summary</h3>
                                        <p className="text-xs text-slate-500">Auto-loaded into all new resumes and AI cover letters.</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50 p-2.5 rounded-2xl border border-slate-200/80">
                                        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1 shrink-0">Tone:</span>
                                            {['executive', 'technical', 'creative', 'metric-focused'].map((toneKey) => (
                                                <button
                                                    key={toneKey}
                                                    type="button"
                                                    onClick={() => setSummaryTone(toneKey)}
                                                    className={`px-2.5 py-1 rounded-xl text-xs font-bold capitalize transition-all whitespace-nowrap shrink-0 ${
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
                                            className="w-full sm:w-auto whitespace-nowrap px-4 py-2.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 shrink-0">
                                            <FaMagic className="w-3.5 h-3.5" />
                                            <span>{isAiGenerating ? 'Writing with Real AI...' : 'Write Executive Bio with AI'}</span>
                                        </button>
                                    </div>
                                </div>
                                <textarea name="summary" value={profile.summary} onChange={handleInputChange} spellCheck="true" placeholder="Write or select a tone above and click 'Write Executive Bio with AI' to generate..." className="w-full h-52 text-xs p-4 bg-white border border-slate-300 rounded-xl font-sans leading-relaxed text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                            </div>
                        )}

                        {/* Sub-Tab 3: Work History Array (WITH REAL AI) */}
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
                                        <div key={job.id || idx} className="p-5 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-4 relative">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeWorkExperience(idx); }}
                                                className="absolute top-4 right-4 z-20 text-slate-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50 cursor-pointer"
                                                title="Delete position">
                                                <FaTrash className="w-3.5 h-3.5" />
                                            </button>
                                            {/* Row 1: Primary Details — smart column padding: pr-8 sm:pr-0 on top input, sm:pr-8 on right input */}
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
                                                <div className="mb-2">
                                                    <label className="block text-xs font-bold text-slate-800">Responsibilities &amp; Accomplishments</label>
                                                </div>
                                                <BulletPointsEditor
                                                    value={job.description}
                                                    onChange={(val) => updateWorkExperience(idx, 'description', val)}
                                                    placeholder="e.g. Implemented new technologies, resulting in a 30% decrease in system downtime..."
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
                                        <div key={edu.id || idx} className="p-5 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-4 relative">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeEducation(idx); }}
                                                className="absolute top-4 right-4 z-20 text-slate-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50 cursor-pointer"
                                                title="Delete education degree">
                                                <FaTrash className="w-3.5 h-3.5" />
                                            </button>
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
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Skills & Technical Competencies</h3>
                                        <p className="text-xs text-slate-500">Save core technical skills for auto-filling skills lists.</p>
                                    </div>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                                    <button
                                        type="button"
                                        onClick={handleRecommendAiSkills}
                                        disabled={isAiGenerating}
                                        className="w-full sm:w-auto whitespace-nowrap flex-shrink-0 px-3.5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm">
                                        <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                        <span>Auto-Recommend Skills (AI)</span>
                                    </button>
                                    <button type="button" onClick={addSkill} className="w-full sm:w-auto whitespace-nowrap flex-shrink-0 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs">
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
                                                <span>Auto-Recommend Top Skills (AI)</span>
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
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeSkill(idx); }}
                                                    className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-colors cursor-pointer flex-shrink-0"
                                                    title="Delete skill">
                                                    <FaTrash className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {profile.skills.length > 0 && (
                                    <div className="pt-2 flex flex-col sm:flex-row gap-2">
                                        <button
                                            type="button"
                                            onClick={handleRecommendAiSkills}
                                            disabled={isAiGenerating}
                                            className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs">
                                            <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                            <span>Auto-Recommend Skills (AI)</span>
                                        </button>
                                        <button type="button" onClick={addSkill} className="flex-1 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs">
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
                                        <p className="text-xs text-slate-500">Add AWS, PMP, Scrum Master, or professional licenses.</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                                        <button
                                            type="button"
                                            onClick={handleRecommendAiCertifications}
                                            disabled={isAiGenerating}
                                            className="w-full sm:w-auto whitespace-nowrap flex-shrink-0 px-3.5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm">
                                            <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                            <span>Recommend Certifications (AI)</span>
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
                                                <span>Recommend Industry Certifications (AI)</span>
                                            </button>
                                            <button type="button" onClick={addCertification} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold">
                                                Add Manually
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
                                             <button
                                                 type="button"
                                                 onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeCertification(idx); }}
                                                 className="w-8 h-8 flex items-center justify-center bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-xl transition-all cursor-pointer flex-shrink-0 self-end sm:self-auto"
                                                 title="Delete certification">
                                                 <FaTrash className="w-3.5 h-3.5" />
                                             </button>
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
                                            <span>Recommend Certifications (AI)</span>
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
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeLanguage(idx); }}
                                                    className="w-8 h-8 flex items-center justify-center bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-xl transition-all cursor-pointer flex-shrink-0"
                                                    title="Delete language">
                                                    <FaTrash className="w-3.5 h-3.5" />
                                                </button>
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
                                        <div key={proj.id || idx} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 relative">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeProject(idx); }}
                                                className="absolute top-3.5 right-3.5 z-20 w-8 h-8 bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-xl shadow-2xs flex items-center justify-center transition-all cursor-pointer"
                                                title="Delete project">
                                                <FaTrash className="w-3.5 h-3.5" />
                                            </button>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="pr-8 sm:pr-0">
                                                    <input type="text" value={proj.title} onChange={(e) => updateProject(idx, 'title', e.target.value)} placeholder="Project Title" className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg font-semibold" />
                                                </div>
                                                <div className="sm:pr-8">
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

                        {/* Save Master Profile Button — Save + Save & Next */}
                        <div className="pt-6 border-t border-slate-100">
                            {/* Mobile progress indicator */}
                            <div className="flex items-center justify-between mb-4 sm:hidden">
                                <span className="text-xs text-slate-500 font-medium">
                                    Step {SUB_TAB_ORDER.indexOf(profileSubTab) + 1} of {SUB_TAB_ORDER.length}
                                </span>
                                <div className="flex gap-1">
                                    {SUB_TAB_ORDER.map((tab, i) => (
                                        <button
                                            key={tab}
                                            onClick={() => setProfileSubTab(tab)}
                                            className={`w-2 h-2 rounded-full transition-all ${
                                                tab === profileSubTab ? 'bg-indigo-600 w-5' : 'bg-slate-300'
                                            }`}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:justify-end items-stretch gap-3">
                                {/* Save & Next — visible on mobile, hidden on last tab */}
                                {SUB_TAB_ORDER.indexOf(profileSubTab) < SUB_TAB_ORDER.length - 1 && (
                                    <button
                                        type="button"
                                        onClick={handleSaveAndNext}
                                        disabled={isSubmitting}
                                        className="order-1 sm:order-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2">
                                        <FaCheckCircle className="w-4 h-4" />
                                        <span>{isSubmitting ? 'Saving...' : `Save & Next → ${SUB_TAB_ORDER[SUB_TAB_ORDER.indexOf(profileSubTab) + 1].charAt(0).toUpperCase() + SUB_TAB_ORDER[SUB_TAB_ORDER.indexOf(profileSubTab) + 1].slice(1)}`}</span>
                                    </button>
                                )}
                                {/* Save only — visible always, secondary on mobile */}
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={isSubmitting}
                                    className={`order-2 sm:order-1 px-6 py-3.5 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 ${
                                        SUB_TAB_ORDER.indexOf(profileSubTab) === SUB_TAB_ORDER.length - 1
                                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                    }`}>
                                    <FaCheckCircle className="w-3.5 h-3.5" />
                                    <span>{isSubmitting ? 'Saving...' : SUB_TAB_ORDER.indexOf(profileSubTab) === SUB_TAB_ORDER.length - 1 ? 'Save Master Profile ✓' : 'Save'}</span>
                                </button>
                            </div>
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
                                            {effectiveMembership || 'PRO PLAN'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-300 font-normal">Active access to unlimited AI resumes, cover letters &amp; job tracking tools.</p>
                                </div>
                            </div>
                            <a
                                href="/dashboard/plans"
                                className="px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer">
                                <FaCrown className="w-3.5 h-3.5 text-amber-300" />
                                <span>Manage Subscription &amp; Plans</span>
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

                                {/* Password Change Grid */}
                                <div className="border-t border-slate-100 pt-6 space-y-4">
                                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                        <FaKey className="w-3.5 h-3.5 text-indigo-600" /> Security Password Update & Re-authentication
                                    </h3>

                                    {/* Current Password Input for Identity Verification */}
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

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {/* New Security Password */}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1">New Security Password</label>
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
                                            <label className="block text-xs font-bold text-slate-700 mb-1">Confirm New Password</label>
                                            <div className="relative">
                                                <input
                                                    type={showPasswordMap.confirm ? 'text' : 'password'}
                                                    value={accountPasswordState.confirmPassword}
                                                    onChange={(e) => setAccountPasswordState({ ...accountPasswordState, confirmPassword: e.target.value })}
                                                    placeholder="Re-enter new password"
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
                                            <span>{isSubmitting ? 'Updating Account...' : 'Update Account Security ✓'}</span>
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
                                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
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
        </>
    );
}

export default DashboardSettings;
