import React, { useState, useEffect, useCallback } from 'react';
import { normalizeAdminApiError } from '../../../services/adminAiSettings';
import { fetchAdminWithReauth } from '../../../services/adminReauth';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import config from '../../../conf/configuration';
import { 
    FaEnvelope, FaCheck, FaTimes, FaSpinner, FaPaperPlane, 
    FaEye, FaEyeSlash, FaServer, FaCode, FaSlidersH, FaFileInvoice, FaUserPlus, 
    FaKey, FaExclamationTriangle, FaInbox, FaHistory, FaShieldAlt, FaRedo, FaSearch, FaCheckCircle, FaExclamationCircle, FaBriefcase, FaDesktop, FaMobileAlt, FaFilter
} from 'react-icons/fa';

/**
 * Colour vocabulary for DNS results, matching the Platform Health palette:
 * green only for a genuinely good record, amber for published-but-weak, red
 * for missing, grey for unknown. Nothing defaults to green.
 */
const DNS_STATE_STYLES = {
    OPERATIONAL: 'bg-emerald-100 text-emerald-800',
    DEGRADED: 'bg-amber-100 text-amber-900',
    NOT_CONFIGURED: 'bg-rose-100 text-rose-800',
    UNKNOWN: 'bg-slate-200 text-slate-700',
};

const DNS_CARD_STYLES = {
    OPERATIONAL: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    DEGRADED: 'bg-amber-50 border-amber-200 text-amber-900',
    NOT_CONFIGURED: 'bg-rose-50 border-rose-200 text-rose-900',
    UNKNOWN: 'bg-slate-50 border-slate-200 text-slate-700',
};

const EmailSmtpSettings = () => {
    const [activeTab, setActiveTab] = useState('smtp'); // 'smtp', 'imap', 'templates', 'logs', 'deliverability'
    
    // Outbound SMTP & Fallback State
    const [smtpConfig, setSmtpConfig] = useState({
        host: 'smtp.hostinger.com',
        port: 465,
        encryption: 'ssl',
        username: '',
        password: '',
        senderName: 'ResumePilot AI',
        replyTo: 'support@airesume.projectdemo.guru',
        adminEmail: 'bhaskar.beyond@gmail.com',
    });

    const [fallbackSmtp, setFallbackSmtp] = useState({
        enabled: false,
        host: 'smtp.gmail.com',
        port: 587,
        encryption: 'tls',
        username: '',
        password: ''
    });

    // Inbound IMAP State
    const [credentialStatus, setCredentialStatus] = useState({ smtp: false, fallbackSmtp: false, imap: false });
    // Live DNS deliverability, resolved by the backend. Never hardcoded.
    const [deliverability, setDeliverability] = useState(null);
    const [deliverabilityLoading, setDeliverabilityLoading] = useState(false);
    const [deliverabilityError, setDeliverabilityError] = useState(null);
    const [imapConfig, setImapConfig] = useState({
        enabled: true,
        host: 'imap.hostinger.com',
        port: 993,
        encryption: 'ssl',
        username: '',
        password: '',
        autoSync: true
    });

    // Enabled Email Templates On/Off Toggle Map (20 Scenarios)
    const [enabledTemplates, setEnabledTemplates] = useState({
        tax_invoice: true,
        welcome: true,
        password_reset: true,
        email_verification: true,
        payment_failed: true,
        subscription_renewal: true,
        ai_resume_ready: true,
        ai_cover_letter_ready: true,
        portfolio_published: true,
        job_application_received: true,
        job_status_update: true,
        job_posted_employer: true,
        security_alert: true,
        account_created_admin: true,
        password_changed_confirm: true,
        refund_processed: true,
        subscription_cancelled: true,
        admin_system_alert: true,
        broadcast_announcement: true,
        default: true
    });

    // Outbox Logs & Templates State
    const [emailLogs, setEmailLogs] = useState([]);
    const [logSearchQuery, setLogSearchQuery] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState('tax_invoice');
    const [testRecipientEmail, setTestRecipientEmail] = useState('');
    const [customSubject, setCustomSubject] = useState('');
    const [customTemplateHtml, setCustomTemplateHtml] = useState('');

    // UX Enhancement State: Preview Modal & Grid Filtering
    const [previewModalKey, setPreviewModalKey] = useState(null); // template key or null
    const [previewDeviceMode, setPreviewDeviceMode] = useState('desktop'); // 'desktop' or 'mobile'
    const [templateCategoryFilter, setTemplateCategoryFilter] = useState('all'); // 'all', 'auth', 'billing', 'ai', 'jobs', 'system'
    const [templateSearchQuery, setTemplateSearchQuery] = useState('');
    
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(true);
    const [runtimeSettingsLoaded, setRuntimeSettingsLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testingSmtp, setTestingSmtp] = useState(false);
    const [testingFallbackSmtp, setTestingFallbackSmtp] = useState(false);
    const [testingImap, setTestingImap] = useState(false);
    const [sendingTestTemplate, setSendingTestTemplate] = useState(false);
    const [resendingLogId, setResendingLogId] = useState(null);
    const [statusMessage, setStatusMessage] = useState(null);
    const [clearSecrets, setClearSecrets] = useState({ smtp: false, fallbackSmtp: false, imap: false });

    const API_BASE = '';

    const PRESETS = [
        { name: 'Hostinger Webmail (Recommended)', host: 'smtp.hostinger.com', port: 465, encryption: 'ssl', imapHost: 'imap.hostinger.com', imapPort: 993 },
        { name: 'Gmail App Password', host: 'smtp.gmail.com', port: 587, encryption: 'tls', imapHost: 'imap.gmail.com', imapPort: 993 },
        { name: 'SendGrid SMTP', host: 'smtp.sendgrid.net', port: 587, encryption: 'tls', imapHost: '', imapPort: 993 },
        { name: 'Mailgun SMTP', host: 'smtp.mailgun.org', port: 587, encryption: 'tls', imapHost: '', imapPort: 993 },
        { name: 'Amazon SES', host: 'email-smtp.us-east-1.amazonaws.com', port: 465, encryption: 'ssl', imapHost: '', imapPort: 993 },
        { name: 'Resend API/SMTP', host: 'smtp.resend.com', port: 465, encryption: 'ssl', imapHost: '', imapPort: 993 },
        { name: 'Postmark', host: 'smtp.postmarkapp.com', port: 587, encryption: 'tls', imapHost: '', imapPort: 993 }
    ];

    const TEMPLATE_SPECS = {
        tax_invoice: {
            name: 'Tax Invoice & Payment Receipt',
            category: 'billing',
            icon: FaFileInvoice,
            badge: 'Automated Billing',
            subjectDefault: 'Tax Invoice & Receipt #RPAI-INV-1001 — ResumePilot AI',
            vars: ['{{candidate_name}}', '{{invoice_number}}', '{{amount}}', '{{plan_name}}', '{{date}}', '{{gstin}}'],
            sampleVars: {
                candidate_name: 'Rajesh Sharma',
                invoice_number: 'RPAI/26-27/0084',
                amount: '₹234.82',
                plan_name: 'Pro Resume Plan',
                date: new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' }),
                gstin: '27AAAAA0000A1Z5'
            }
        },
        welcome: {
            name: 'Welcome & Getting Started',
            category: 'auth',
            icon: FaUserPlus,
            badge: 'User Onboarding',
            subjectDefault: 'Welcome to ResumePilot AI! Build your ATS Resume Today 🚀',
            vars: ['{{candidate_name}}', '{{site_url}}'],
            sampleVars: {
                candidate_name: 'Ananya Verma',
                site_url: 'https://airesume.projectdemo.guru'
            }
        },
        password_reset: {
            name: 'Password Reset & Security Alert',
            category: 'auth',
            icon: FaKey,
            badge: 'Security',
            subjectDefault: 'Security Alert: Reset Your Password — ResumePilot AI',
            vars: ['{{candidate_name}}', '{{reset_link}}'],
            sampleVars: {
                candidate_name: 'Suresh Kumar',
                reset_link: 'https://airesume.projectdemo.guru/reset-password?token=sample123'
            }
        },
        email_verification: {
            name: 'Email OTP / Account Verification',
            category: 'auth',
            icon: FaShieldAlt,
            badge: 'Security OTP',
            subjectDefault: '849204 is your ResumePilot AI Verification Code 🔑',
            vars: ['{{candidate_name}}', '{{otp_code}}'],
            sampleVars: {
                candidate_name: 'Vikram Mehta',
                otp_code: '849204'
            }
        },
        payment_failed: {
            name: 'Payment Failed / Renewal Alert',
            category: 'billing',
            icon: FaExclamationTriangle,
            badge: 'Billing Alert',
            subjectDefault: 'Action Required: Payment Attempt Failed — ResumePilot AI',
            vars: ['{{candidate_name}}', '{{amount}}', '{{retry_url}}'],
            sampleVars: {
                candidate_name: 'Priya Singh',
                amount: '₹199.00',
                retry_url: 'https://airesume.projectdemo.guru/pricing'
            }
        },
        subscription_renewal: {
            name: 'Subscription Auto-Renewal Notice',
            category: 'billing',
            icon: FaRedo,
            badge: 'Billing Cycle',
            subjectDefault: 'Upcoming Subscription Renewal Notice — ResumePilot AI',
            vars: ['{{candidate_name}}', '{{plan_name}}', '{{amount}}', '{{date}}'],
            sampleVars: {
                candidate_name: 'Rohan Gupta',
                plan_name: 'Pro Yearly Plan',
                amount: '₹1,999.00',
                date: new Date(Date.now() + 86400000 * 7).toLocaleDateString('en-IN', { dateStyle: 'medium' })
            }
        },
        ai_resume_ready: {
            name: 'AI Resume Completed Alert',
            category: 'ai',
            icon: FaCheckCircle,
            badge: 'AI Output',
            subjectDefault: '✨ Your AI Resume is Ready! (ATS Score: 94/100)',
            vars: ['{{candidate_name}}', '{{ats_score}}', '{{site_url}}'],
            sampleVars: {
                candidate_name: 'Neha Kapoor',
                ats_score: '94',
                site_url: 'https://airesume.projectdemo.guru'
            }
        },
        job_application_received: {
            name: 'Job Application Received (Recruiter Alert)',
            category: 'jobs',
            icon: FaInbox,
            badge: 'Recruiter Alert',
            subjectDefault: '📩 New Applicant for Senior Software Engineer — ResumePilot AI',
            vars: ['{{candidate_name}}', '{{job_title}}', '{{company_name}}', '{{date}}'],
            sampleVars: {
                candidate_name: 'Amit Patel',
                job_title: 'Senior Full Stack Engineer',
                company_name: 'Nexus Cloud Technologies',
                date: new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })
            }
        },
        job_status_update: {
            name: 'Application Status Update (Candidate Alert)',
            category: 'jobs',
            icon: FaSlidersH,
            badge: 'Job Status',
            subjectDefault: 'Application Update: Shortlisted for Interview 🎯 — TechCorp',
            vars: ['{{candidate_name}}', '{{job_title}}', '{{company_name}}', '{{application_status}}'],
            sampleVars: {
                candidate_name: 'Deepak Malhotra',
                job_title: 'Product Manager',
                company_name: 'TechCorp Solutions',
                application_status: 'Shortlisted for Technical Interview 🎯'
            }
        },
        security_alert: {
            name: 'Unrecognized Device / Security Sign-In',
            category: 'auth',
            icon: FaExclamationCircle,
            badge: 'Account Security',
            subjectDefault: '🛡️ Security Alert: New Login from Chrome on macOS — ResumePilot AI',
            vars: ['{{device_info}}', '{{ip_address}}', '{{login_time}}'],
            sampleVars: {
                device_info: 'Chrome 122 on macOS Sonoma (Mumbai, IN)',
                ip_address: '103.211.54.12',
                login_time: new Date().toUTCString()
            }
        },
        account_created_admin: {
            name: 'New User Registered (Admin Alert)',
            category: 'auth',
            icon: FaUserPlus,
            badge: 'Admin Alert',
            subjectDefault: '🔔 New User Registration: Alexander Wright — ResumePilot AI',
            vars: ['{{candidate_name}}', '{{date}}'],
            sampleVars: {
                candidate_name: 'Alexander Wright',
                date: new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })
            }
        },
        password_changed_confirm: {
            name: 'Password Changed Confirmation',
            category: 'auth',
            icon: FaKey,
            badge: 'Security',
            subjectDefault: '🔒 Security Confirmation: Password Updated — ResumePilot AI',
            vars: ['{{candidate_name}}', '{{date}}'],
            sampleVars: {
                candidate_name: 'Vikram Mehta',
                date: new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })
            }
        },
        refund_processed: {
            name: 'Refund Processed Confirmation',
            category: 'billing',
            icon: FaFileInvoice,
            badge: 'Billing Refund',
            subjectDefault: '💸 Refund Processed: #RPAI-INV-1001 — ResumePilot AI',
            vars: ['{{invoice_number}}', '{{amount}}'],
            sampleVars: {
                invoice_number: 'RPAI-INV-1001',
                amount: '₹199.00'
            }
        },
        subscription_cancelled: {
            name: 'Subscription Cancellation Confirmation',
            category: 'billing',
            icon: FaTimes,
            badge: 'Subscription',
            subjectDefault: 'Subscription Cancelled — ResumePilot AI',
            vars: ['{{candidate_name}}', '{{plan_name}}'],
            sampleVars: {
                candidate_name: 'Priya Singh',
                plan_name: 'Pro Monthly Plan'
            }
        },
        ai_cover_letter_ready: {
            name: 'AI Cover Letter Completed Alert',
            category: 'ai',
            icon: FaCheckCircle,
            badge: 'AI Output',
            subjectDefault: '📝 Your AI Cover Letter is Ready! — ResumePilot AI',
            vars: ['{{candidate_name}}', '{{job_title}}'],
            sampleVars: {
                candidate_name: 'Neha Kapoor',
                job_title: 'Senior Software Engineer'
            }
        },
        portfolio_published: {
            name: 'Web Portfolio Published Alert',
            category: 'ai',
            icon: FaServer,
            badge: 'Portfolio Live',
            subjectDefault: '🌐 Your Live Website Portfolio is Online! — ResumePilot AI',
            vars: ['{{candidate_name}}', '{{portfolio_slug}}'],
            sampleVars: {
                candidate_name: 'Ananya Verma',
                portfolio_slug: 'ananya-verma-dev'
            }
        },
        job_posted_employer: {
            name: 'Job Listing Published (Employer Alert)',
            category: 'jobs',
            icon: FaBriefcase,
            badge: 'Employer Alert',
            subjectDefault: '✅ Job Listing Published: Senior Full Stack Engineer — ResumePilot AI',
            vars: ['{{job_title}}', '{{company_name}}'],
            sampleVars: {
                job_title: 'Senior Full Stack Engineer',
                company_name: 'Nexus Cloud Technologies'
            }
        },
        admin_system_alert: {
            name: 'Admin Operational System Alert',
            category: 'system',
            icon: FaExclamationTriangle,
            badge: 'System Alert',
            subjectDefault: '🚨 System Alert: Payment Gateway Timeout — ResumePilot AI',
            vars: ['{{alert_title}}', '{{alert_message}}'],
            sampleVars: {
                alert_title: 'Payment Gateway Timeout Warning',
                alert_message: 'Stripe webhook received a 504 Gateway Timeout notice.'
            }
        },
        broadcast_announcement: {
            name: 'Platform Broadcast & Announcement',
            category: 'system',
            icon: FaPaperPlane,
            badge: 'Broadcast',
            subjectDefault: '📢 New Feature Release: AI Mock Interview Simulator — ResumePilot AI',
            vars: ['{{title}}', '{{body}}'],
            sampleVars: {
                title: 'Introducing AI Mock Interview Simulator 🚀',
                body: 'Practice technical interviews with our new real-time AI interviewer.'
            }
        }
    };


    /** Resolves the real DNS posture from the backend; never assumes success. */
    const loadDeliverability = useCallback(async () => {
        setDeliverabilityLoading(true);
        setDeliverabilityError(null);
        try {
            const { response, data } = await fetchAdminWithReauth(`${API_BASE}/api/email/admin/deliverability`);
            if (!response.ok || !data?.success) {
                throw new Error(data?.error || `Deliverability check failed (HTTP ${response.status}).`);
            }
            setDeliverability(data);
        } catch (error) {
            setDeliverability(null);
            setDeliverabilityError(error?.message || 'DNS records could not be checked.');
        } finally {
            setDeliverabilityLoading(false);
        }
    }, []);

    // Only check when the operator opens the tab, so we do not add DNS lookups
    // to every page load.
    useEffect(() => {
        if (activeTab === 'deliverability' && !deliverability && !deliverabilityLoading && !deliverabilityError) {
            loadDeliverability();
        }
    }, [activeTab, deliverability, deliverabilityLoading, deliverabilityError, loadDeliverability]);

    useEffect(() => {
        loadSettingsAndLogs();
    }, []);

    const loadSettingsAndLogs = async () => {
        setLoading(true);
        setRuntimeSettingsLoaded(false);
        try {
            const [settings, runtime] = await Promise.all([
                getSystemSettings(),
                fetchAdminWithReauth(`${API_BASE}/api/email/admin/settings`),
            ]);
            if (!runtime.response.ok || !runtime.data.success) throw normalizeAdminApiError(runtime.response, runtime.data, 'Email runtime settings could not be loaded.');
            const sm = runtime.data.settings?.smtp || {};
            const fb = runtime.data.settings?.fallbackSmtp || {};
            const im = runtime.data.settings?.imap || {};
            setCredentialStatus({ smtp: sm.passwordConfigured === true, fallbackSmtp: fb.passwordConfigured === true, imap: im.passwordConfigured === true });

            const loadedSmtp = {
                host: sm.host || 'smtp.hostinger.com',
                port: sm.port || 465,
                encryption: sm.encryption || 'ssl',
                username: sm.username || '',
                password: sm.password || '',
                senderName: sm.senderName || config?.brand?.name || 'ResumePilot AI',
                replyTo: sm.replyTo || 'support@airesume.projectdemo.guru',
                adminEmail: sm.adminEmail || config?.adminEmail || 'bhaskar.beyond@gmail.com',
            };

            setSmtpConfig(loadedSmtp);
            setFallbackSmtp({
                enabled: fb.enabled === true || fb.enabled === 'true' || fb.enabled === 1,
                host: fb.host || 'smtp.gmail.com',
                port: parseInt(fb.port, 10) || 587,
                encryption: fb.encryption || 'tls',
                username: fb.username || '',
                password: fb.password || '',
                senderEmail: fb.senderEmail || ''
            });

            setImapConfig({
                enabled: im.enabled !== undefined ? im.enabled : true,
                host: im.host || 'imap.hostinger.com',
                port: im.port || 993,
                encryption: im.encryption || 'ssl',
                username: im.username || loadedSmtp.username,
                password: im.password || loadedSmtp.password,
                autoSync: im.autoSync !== undefined ? im.autoSync : true
            });

            setEnabledTemplates((prev) => ({ ...prev, ...(settings?.enabledTemplates || {}), ...(runtime.data.settings?.enabledTemplates || {}) }));

            setTestRecipientEmail(loadedSmtp.adminEmail);
            setRuntimeSettingsLoaded(true);

            // Logs are operational history, not configuration. A log failure must not
            // turn a successfully loaded configuration into an unsafe default state.
            try {
                const logsRes = await fetch(`${API_BASE}/api/email/logs`);
                const logsData = await logsRes.json().catch(() => ({}));
                if (!logsRes.ok || !logsData.success) throw normalizeAdminApiError(logsRes, logsData, 'Email logs could not be loaded.');
                setEmailLogs(logsData.logs || []);
            } catch (logError) {
                setStatusMessage({ type: 'error', text: logError.message || 'Email settings loaded, but outbox logs are unavailable.' });
            }
        } catch (e) {
            console.error('Error loading email runtime settings:', e);
            setStatusMessage({ type: 'error', text: `Email settings were not loaded; saving is disabled to prevent overwriting runtime configuration. ${e.message}` });
        } finally {
            setLoading(false);
        }
    };

    const toggleTemplate = async (templateKey) => {
        if (!runtimeSettingsLoaded) {
            setStatusMessage({ type: 'error', text: 'Email runtime settings are unavailable. Reload before changing templates.' });
            return;
        }
        const updated = {
            ...enabledTemplates,
            [templateKey]: enabledTemplates[templateKey] === false ? true : false
        };
        try {
            await saveSystemSettings('enabledTemplates', updated);
            const { response, data } = await fetchAdminWithReauth('/api/email/admin/save-smtp', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ smtp: smtpConfig, fallbackSmtp, imap: imapConfig, enabledTemplates: updated })
            });
            if (!response.ok || !data.success) throw normalizeAdminApiError(response, data, 'Template setting was not saved to the mail runtime.');
            setEnabledTemplates(updated);
            setStatusMessage({ type: 'success', text: 'Template setting saved.' });
        } catch (error) {
            setStatusMessage({ type: 'error', text: error.message || 'Template setting could not be saved.' });
        }
    };

    const applyPreset = (preset) => {
        setSmtpConfig((prev) => ({
            ...prev,
            host: preset.host,
            port: preset.port,
            encryption: preset.encryption
        }));

        if (preset.imapHost) {
            setImapConfig((prev) => ({
                ...prev,
                host: preset.imapHost,
                port: preset.imapPort
            }));
        }

        setStatusMessage({ type: 'success', text: `Applied ${preset.name} preset configuration!` });
        setTimeout(() => setStatusMessage(null), 3000);
    };

    const handleSmtpChange = (e) => {
        const { name, value } = e.target;
        setSmtpConfig((prev) => ({ ...prev, [name]: value }));
        if (name === 'password') setClearSecrets(prev => ({ ...prev, smtp: false }));
    };

    const handleImapChange = (e) => {
        const { name, value, type, checked } = e.target;
        setImapConfig((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        if (name === 'password') setClearSecrets(prev => ({ ...prev, imap: false }));
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!runtimeSettingsLoaded) {
            setStatusMessage({ type: 'error', text: 'Email runtime settings are unavailable. Reload before saving.' });
            return;
        }
        setSaving(true);
        try {
            // Persist revisioned Admin metadata through trusted backend routes.
            await saveSystemSettings('smtp', smtpConfig, { clearSecrets: { password: clearSecrets.smtp === true } });
            await saveSystemSettings('fallbackSmtp', fallbackSmtp, { clearSecrets: { password: clearSecrets.fallbackSmtp === true } });
            await saveSystemSettings('imap', imapConfig, { clearSecrets: { password: clearSecrets.imap === true } });
            await saveSystemSettings('enabledTemplates', enabledTemplates);

            // Persist the runtime mail configuration on the trusted backend and inspect its result.
            const { response, data: result } = await fetchAdminWithReauth('/api/email/admin/save-smtp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ smtp: smtpConfig, fallbackSmtp, imap: imapConfig, enabledTemplates, clearSecrets })
            });
            if (!response.ok || !result.success) throw normalizeAdminApiError(response, result, 'Runtime email configuration was not saved.');
            setCredentialStatus(current => ({ smtp: current.smtp || Boolean(smtpConfig.password), fallbackSmtp: current.fallbackSmtp || Boolean(fallbackSmtp.password), imap: current.imap || Boolean(imapConfig.password) }));
            setSmtpConfig(current => ({ ...current, password: '' }));
            setFallbackSmtp(current => ({ ...current, password: '' }));
            setImapConfig(current => ({ ...current, password: '' }));

            setStatusMessage({ type: 'success', text: 'SMTP, fallback relay, IMAP, and template settings were saved to the trusted runtime.' });
        } catch (error) {
            setStatusMessage({ type: 'error', text: `Failed to save settings: ${error.message}` });
        } finally {
            setSaving(false);
            setTimeout(() => setStatusMessage(null), 4000);
        }
    };

    const handleTestSmtp = async () => {
        setTestingSmtp(true);
        setStatusMessage(null);
        try {
            const { response, data } = await fetchAdminWithReauth(`${API_BASE}/api/email/admin/test-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'smtp', ...smtpConfig })
            });
            if (!response.ok) throw normalizeAdminApiError(response, data, 'Email operation failed.');
            if (data.success) {
                setStatusMessage({ type: 'success', text: data.message });
            } else {
                setStatusMessage({ type: 'error', text: `SMTP Test Failed: ${data.error}` });
            }
        } catch (err) {
            setStatusMessage({ type: 'error', text: `Backend connection error: ${err.message}` });
        } finally {
            setTestingSmtp(false);
        }
    };

    const handleTestFallbackSmtp = async () => {
        setTestingFallbackSmtp(true);
        setStatusMessage(null);
        try {
            const { response, data } = await fetchAdminWithReauth(`${API_BASE}/api/email/admin/test-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'fallback_smtp', ...fallbackSmtp })
            });
            if (!response.ok) throw normalizeAdminApiError(response, data, 'Email operation failed.');
            if (data.success) {
                setStatusMessage({ type: 'success', text: `🛡️ ${data.message}` });
            } else {
                setStatusMessage({ type: 'error', text: `Secondary Fallback Relay Test Failed: ${data.error}` });
            }
        } catch (err) {
            setStatusMessage({ type: 'error', text: `Backend connection error: ${err.message}` });
        } finally {
            setTestingFallbackSmtp(false);
        }
    };

    const handleTestImap = async () => {
        setTestingImap(true);
        setStatusMessage(null);
        try {
            const { response, data } = await fetchAdminWithReauth(`${API_BASE}/api/email/admin/test-imap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(imapConfig)
            });
            if (!response.ok) throw normalizeAdminApiError(response, data, 'Email operation failed.');
            if (data.success) {
                setStatusMessage({ type: 'success', text: data.message });
            } else {
                setStatusMessage({ type: 'error', text: `IMAP Test Failed: ${data.error}` });
            }
        } catch (err) {
            setStatusMessage({ type: 'error', text: `IMAP Connection Error: ${err.message}` });
        } finally {
            setTestingImap(false);
        }
    };

    const handleSendTestTemplate = async () => {
        setSendingTestTemplate(true);
        setStatusMessage(null);
        try {
            const spec = TEMPLATE_SPECS[selectedTemplate];
            const response = await fetch(`${API_BASE}/api/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: testRecipientEmail || smtpConfig.adminEmail,
                    templateType: selectedTemplate,
                    customSubject: customSubject || spec.subjectDefault,
                    vars: spec.sampleVars
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw normalizeAdminApiError(response, data, 'Email operation failed.');
            if (data.success) {
                setStatusMessage({ type: 'success', text: `Test "${spec.name}" template queued for dispatch to ${testRecipientEmail || smtpConfig.adminEmail}!` });
                loadSettingsAndLogs();
            } else {
                setStatusMessage({ type: 'error', text: `Template Dispatch Error: ${data.error}` });
            }
        } catch (err) {
            setStatusMessage({ type: 'error', text: `Connection error: ${err.message}` });
        } finally {
            setSendingTestTemplate(false);
        }
    };

    const handleResendEmail = async (logId) => {
        setResendingLogId(logId);
        try {
            const res = await fetch(`${API_BASE}/api/email/resend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logId })
            });
            const data = await res.json();
            if (data.success) {
                setStatusMessage({ type: 'success', text: data.message });
                loadSettingsAndLogs();
            } else {
                setStatusMessage({ type: 'error', text: `Resend Error: ${data.error}` });
            }
        } catch (e) {
            setStatusMessage({ type: 'error', text: `Resend Connection Error: ${e.message}` });
        } finally {
            setResendingLogId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <FaSpinner className="animate-spin text-indigo-600 w-7 h-7 mr-3" />
                <span className="text-slate-600 font-semibold text-sm">Loading Enterprise Mail System...</span>
            </div>
        );
    }

    const currentSpec = TEMPLATE_SPECS[selectedTemplate];
    const filteredLogs = emailLogs.filter(l => 
        (l.recipient && l.recipient.toLowerCase().includes(logSearchQuery.toLowerCase())) ||
        (l.subject && l.subject.toLowerCase().includes(logSearchQuery.toLowerCase())) ||
        (l.templateType && l.templateType.toLowerCase().includes(logSearchQuery.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            {/* Header Title Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 rounded-2xl text-white shadow-lg border border-slate-800">
                <div>
                    <div className="flex items-center gap-2">
                        <FaEnvelope className="text-indigo-400 w-5 h-5" />
                        <h2 className="text-lg font-black tracking-tight text-white">Enterprise Email &amp; SMTP Subsystem</h2>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">Outbound SMTP, Inbound IMAP, Fallback Relay, Dynamic HTML Templates &amp; Audit Outbox.</p>
                </div>
            </div>

            {/* Modern Tab Navigation Pills */}
            <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                <button
                    type="button"
                    onClick={() => setActiveTab('smtp')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === 'smtp' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-200'
                    }`}
                >
                    <FaServer className="w-3.5 h-3.5" />
                    <span>Outbound SMTP</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('imap')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === 'imap' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-200'
                    }`}
                >
                    <FaInbox className="w-3.5 h-3.5" />
                    <span>Inbound IMAP</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('templates')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === 'templates' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-200'
                    }`}
                >
                    <FaCode className="w-3.5 h-3.5" />
                    <span>Dynamic Templates</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('logs')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === 'logs' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-200'
                    }`}
                >
                    <FaHistory className="w-3.5 h-3.5" />
                    <span>Email Outbox ({emailLogs.length})</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('deliverability')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === 'deliverability' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-200'
                    }`}
                >
                    <FaShieldAlt className="w-3.5 h-3.5" />
                    <span>Deliverability &amp; DNS</span>
                </button>
            </div>

            {/* Status Message Notification Toast */}
            {statusMessage && (
                <div role={statusMessage.type === 'success' ? 'status' : 'alert'} className={`p-4 rounded-xl flex items-center justify-between text-xs font-bold shadow-xs ${
                    statusMessage.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-rose-50 border border-rose-200 text-rose-900'
                }`}>
                    <div className="flex items-center space-x-2">
                        {statusMessage.type === 'success' ? <FaCheck className="text-emerald-600 w-4 h-4" /> : <FaTimes className="text-rose-600 w-4 h-4" />}
                        <span>{statusMessage.text}</span>
                    </div>
                </div>
            )}

            {/* TAB 1: OUTBOUND SMTP & FALLBACK RELAY */}
            {activeTab === 'smtp' && (
                <form onSubmit={handleSave} className="space-y-6">
                    <fieldset className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><legend className="px-1 font-bold">Write-only credential controls</legend><p>Blank password fields preserve the active credential. Select a clear action only when you intentionally want to remove a server-stored credential, then save. Deployment environment credentials cannot be cleared here.</p><div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3"><label className="flex items-center gap-2"><input type="checkbox" checked={clearSecrets.smtp === true} onChange={event => setClearSecrets(prev => ({ ...prev, smtp: event.target.checked }))} /> Clear primary SMTP password</label><label className="flex items-center gap-2"><input type="checkbox" checked={clearSecrets.fallbackSmtp === true} onChange={event => setClearSecrets(prev => ({ ...prev, fallbackSmtp: event.target.checked }))} /> Clear fallback password</label><label className="flex items-center gap-2"><input type="checkbox" checked={clearSecrets.imap === true} onChange={event => setClearSecrets(prev => ({ ...prev, imap: event.target.checked }))} /> Clear IMAP password</label></div></fieldset>
                    {/* 1-Click Popular Mailer Presets */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                            <FaSlidersH className="text-indigo-600" />
                            <span>1-Click Mailer Presets</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {PRESETS.map((preset) => (
                                <button
                                    key={preset.name}
                                    type="button"
                                    onClick={() => applyPreset(preset)}
                                    className="px-3 py-1.5 bg-white hover:bg-indigo-50 hover:border-indigo-300 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-all shadow-2xs cursor-pointer"
                                >
                                    {preset.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Primary Outbound SMTP Configuration */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-5 shadow-xs">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3 flex items-center gap-2">
                            <FaServer className="text-indigo-600" /> Primary Outbound SMTP Server
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    SMTP Host Server
                                </label>
                                <input
                                    type="text"
                                    name="host"
                                    value={smtpConfig.host}
                                    onChange={handleSmtpChange}
                                    placeholder="smtp.hostinger.com / smtp.gmail.com"
                                    className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Port
                                </label>
                                <input
                                    type="number"
                                    name="port"
                                    value={smtpConfig.port}
                                    onChange={handleSmtpChange}
                                    placeholder="465 / 587"
                                    className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Encryption Protocol
                                </label>
                                <select
                                    name="encryption"
                                    value={smtpConfig.encryption}
                                    onChange={handleSmtpChange}
                                    className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-white"
                                >
                                    <option value="ssl">SSL (Port 465 - Recommended)</option>
                                    <option value="tls">TLS (STARTTLS - Port 587)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    SMTP Username / Email
                                </label>
                                <input
                                    type="text"
                                    name="username"
                                    value={smtpConfig.username}
                                    onChange={handleSmtpChange}
                                    placeholder="admin@projectdemo.guru"
                                    className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    SMTP Password / App Key
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        name="password"
                                        value={smtpConfig.password}
                                        onChange={handleSmtpChange}
                                        placeholder={credentialStatus.smtp ? 'Configured securely — enter only to replace' : 'Account Password / API Key'}
                                        className="w-full pl-3.5 pr-10 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                                    >
                                        {showPassword ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Sender Display Name
                                </label>
                                <input
                                    type="text"
                                    name="senderName"
                                    value={smtpConfig.senderName}
                                    onChange={handleSmtpChange}
                                    placeholder="ResumePilot AI Team"
                                    className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Reply-To Address
                                </label>
                                <input
                                    type="email"
                                    name="replyTo"
                                    value={smtpConfig.replyTo}
                                    onChange={handleSmtpChange}
                                    placeholder="support@airesume.projectdemo.guru"
                                    className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Admin Alert Email
                                </label>
                                <input
                                    type="email"
                                    name="adminEmail"
                                    value={smtpConfig.adminEmail}
                                    onChange={handleSmtpChange}
                                    placeholder="admin@domain.com"
                                    className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Secondary Fallback SMTP Relay */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 shadow-xs">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                <FaShieldAlt className="text-indigo-600" /> Secondary Fallback Relay (Failover)
                            </h3>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={fallbackSmtp.enabled}
                                    onChange={(e) => setFallbackSmtp(prev => ({ ...prev, enabled: e.target.checked }))}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <span className="text-xs font-bold text-slate-700">Enable Fallback Failover</span>
                            </label>
                        </div>

                        {fallbackSmtp.enabled && (
                            <div className="space-y-4 pt-2">
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                    <div className="md:col-span-2">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fallback Host</label>
                                        <input
                                            type="text"
                                            value={fallbackSmtp.host}
                                            onChange={(e) => setFallbackSmtp(prev => ({ ...prev, host: e.target.value }))}
                                            placeholder="smtp.gmail.com / smtp.sendgrid.net"
                                            className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-xl font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fallback Port</label>
                                        <input
                                            type="number"
                                            value={fallbackSmtp.port || 587}
                                            onChange={(e) => setFallbackSmtp(prev => ({ ...prev, port: parseInt(e.target.value, 10) || 587 }))}
                                            placeholder="587 / 465"
                                            className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-xl font-mono"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fallback Encryption</label>
                                        <select
                                            value={fallbackSmtp.encryption || 'tls'}
                                            onChange={(e) => setFallbackSmtp(prev => ({ ...prev, encryption: e.target.value }))}
                                            className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-xl bg-white"
                                        >
                                            <option value="tls">TLS (Port 587 - Recommended)</option>
                                            <option value="ssl">SSL (Port 465)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fallback User / SASL Account</label>
                                        <input
                                            type="text"
                                            value={fallbackSmtp.username}
                                            onChange={(e) => setFallbackSmtp(prev => ({ ...prev, username: e.target.value }))}
                                            placeholder="apikey / user@gmail.com"
                                            className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-xl font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fallback Password / API Key</label>
                                        <input
                                            type="password"
                                            value={fallbackSmtp.password}
                                            onChange={(e) => setFallbackSmtp(prev => ({ ...prev, password: e.target.value }))}
                                            placeholder={credentialStatus.fallbackSmtp ? 'Configured securely — enter only to replace' : 'API Key / App Password'}
                                            className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-xl font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fallback Sender Email (Verified)</label>
                                        <input
                                            type="email"
                                            value={fallbackSmtp.senderEmail || ''}
                                            onChange={(e) => setFallbackSmtp(prev => ({ ...prev, senderEmail: e.target.value }))}
                                            placeholder="support@airesume.projectdemo.guru"
                                            className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-xl font-mono"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Circuit Breaker Max Failures</label>
                                        <input
                                            type="number"
                                            value={fallbackSmtp.maxFailures || 3}
                                            onChange={(e) => setFallbackSmtp(prev => ({ ...prev, maxFailures: parseInt(e.target.value, 10) || 3 }))}
                                            placeholder="3"
                                            className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-xl font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Circuit Breaker Cooldown (Mins)</label>
                                        <input
                                            type="number"
                                            value={fallbackSmtp.cooldownMinutes || 5}
                                            onChange={(e) => setFallbackSmtp(prev => ({ ...prev, cooldownMinutes: parseInt(e.target.value, 10) || 5 }))}
                                            placeholder="5"
                                            className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-xl font-mono"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={handleTestSmtp}
                                disabled={testingSmtp}
                                className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                            >
                                {testingSmtp ? <FaSpinner className="animate-spin text-indigo-600 w-4 h-4" /> : <FaPaperPlane className="text-indigo-600 w-4 h-4" />}
                                <span>Test Primary Outbound Socket</span>
                            </button>

                            <button
                                type="button"
                                onClick={handleTestFallbackSmtp}
                                disabled={testingFallbackSmtp || !fallbackSmtp.enabled || !fallbackSmtp.username}
                                className="px-4 py-2.5 text-xs font-bold text-indigo-700 bg-indigo-50/80 border border-indigo-200 hover:bg-indigo-100 rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-40"
                            >
                                {testingFallbackSmtp ? <FaSpinner className="animate-spin text-indigo-600 w-4 h-4" /> : <FaShieldAlt className="text-indigo-600 w-4 h-4" />}
                                <span>Test Secondary Failover Relay</span>
                            </button>

                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        const res = await fetch('/api/email/admin/reset-circuit-breaker', { method: 'POST' });
                                        const d = await res.json();
                                        setStatusMessage({ type: 'success', text: d.message || 'Circuit breaker reset successfully!' });
                                    } catch (e) {
                                        setStatusMessage({ type: 'error', text: e.message });
                                    }
                                }}
                                className="px-4 py-2.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                            >
                                <FaCheckCircle className="text-emerald-600 w-4 h-4" />
                                <span>Reset Circuit Breaker</span>
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={saving || !runtimeSettingsLoaded}
                            className="px-6 py-2.5 text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 rounded-xl flex items-center gap-2 transition-all shadow-md cursor-pointer"
                        >
                            {saving && <FaSpinner className="animate-spin text-white w-4 h-4" />}
                            <span>Save All Email Settings</span>
                        </button>
                    </div>
                </form>
            )}

            {/* TAB 2: INBOUND IMAP CONFIGURATION */}
            {activeTab === 'imap' && (
                <form onSubmit={handleSave} className="space-y-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-5 shadow-xs">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                <FaInbox className="text-indigo-600" /> Inbound IMAP Mailbox Sync Configuration
                            </h3>
                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-full uppercase">
                                Inbound Active
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    IMAP Server Host
                                </label>
                                <input
                                    type="text"
                                    name="host"
                                    value={imapConfig.host}
                                    onChange={handleImapChange}
                                    placeholder="imap.hostinger.com / imap.gmail.com"
                                    className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Port
                                </label>
                                <input
                                    type="number"
                                    name="port"
                                    value={imapConfig.port}
                                    onChange={handleImapChange}
                                    placeholder="993 / 143"
                                    className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Encryption Protocol
                                </label>
                                <select
                                    name="encryption"
                                    value={imapConfig.encryption}
                                    onChange={handleImapChange}
                                    className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-white"
                                >
                                    <option value="ssl">SSL/TLS (Port 993 - Recommended)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    IMAP Account Username
                                </label>
                                <input
                                    type="text"
                                    name="username"
                                    value={imapConfig.username}
                                    onChange={handleImapChange}
                                    placeholder="admin@projectdemo.guru"
                                    className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    IMAP Password
                                </label>
                                <input
                                    type="password"
                                    name="password"
                                    value={imapConfig.password}
                                    onChange={handleImapChange}
                                    placeholder={credentialStatus.imap ? 'Configured securely — enter only to replace' : 'Account Password'}
                                    className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <button
                            type="button"
                            onClick={handleTestImap}
                            disabled={testingImap}
                            className="px-5 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                        >
                            {testingImap ? <FaSpinner className="animate-spin text-indigo-600 w-4 h-4" /> : <FaInbox className="text-indigo-600 w-4 h-4" />}
                            <span>Test Inbound IMAP Socket</span>
                        </button>

                        <button
                            type="submit"
                            disabled={saving || !runtimeSettingsLoaded}
                            className="px-6 py-2.5 text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 rounded-xl flex items-center gap-2 transition-all shadow-md cursor-pointer"
                        >
                            {saving && <FaSpinner className="animate-spin text-white w-4 h-4" />}
                            <span>Save IMAP Settings</span>
                        </button>
                    </div>
                </form>
            )}

            {/* TAB 3: DYNAMIC TEMPLATE MANAGER */}
            {activeTab === 'templates' && (
                <div className="space-y-6">
                    {/* Active Scenarios Header Banner */}
                    <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-extrabold text-lg">
                                20
                            </div>
                            <div>
                                <h4 className="font-extrabold text-base text-white flex items-center gap-2">
                                    System Email Notifications Suite
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-400/20">
                                        WordPress &amp; SaaS Match
                                    </span>
                                </h4>
                                <p className="text-xs text-slate-400">Click <strong>"View"</strong> on any card to preview full rendered HTML email with live device toggle.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-3.5 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                {Object.values(enabledTemplates).filter(Boolean).length} / {Object.keys(TEMPLATE_SPECS).length} Active Scenarios
                            </span>
                        </div>
                    </div>

                    {/* Category Filter Pills & Search Filter */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {[
                                { id: 'all', label: 'All Templates', count: 20, icon: FaSlidersH },
                                { id: 'auth', label: 'Auth & Security', count: 6, icon: FaKey },
                                { id: 'billing', label: 'Billing & Sales', count: 5, icon: FaFileInvoice },
                                { id: 'ai', label: 'AI & Output', count: 3, icon: FaCheckCircle },
                                { id: 'jobs', label: 'Jobs & Portal', count: 3, icon: FaBriefcase },
                                { id: 'system', label: 'System Alerts', count: 3, icon: FaExclamationTriangle }
                            ].map((cat) => {
                                const CatIcon = cat.icon;
                                const isActive = templateCategoryFilter === cat.id;
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setTemplateCategoryFilter(cat.id)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                            isActive
                                                ? 'bg-indigo-600 text-white shadow-xs'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        <CatIcon className="w-3 h-3" />
                                        <span>{cat.label}</span>
                                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                                            {cat.count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Search Filter */}
                        <div className="relative min-w-[200px]">
                            <FaSearch className="absolute left-3 top-2.5 text-slate-400 w-3 h-3" />
                            <input
                                type="text"
                                value={templateSearchQuery}
                                onChange={(e) => setTemplateSearchQuery(e.target.value)}
                                placeholder="Search templates..."
                                className="w-full pl-8 pr-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white"
                            />
                        </div>
                    </div>

                    {/* 20 Template Cards Grid with Explicit View & Edit Actions */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                        {Object.entries(TEMPLATE_SPECS)
                            .filter(([key, spec]) => {
                                const matchesCategory = templateCategoryFilter === 'all' || spec.category === templateCategoryFilter;
                                const matchesSearch = !templateSearchQuery || 
                                    spec.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) || 
                                    spec.badge.toLowerCase().includes(templateSearchQuery.toLowerCase());
                                return matchesCategory && matchesSearch;
                            })
                            .map(([key, spec]) => {
                                const IconComp = spec.icon;
                                const isSelected = selectedTemplate === key;
                                const isEnabled = enabledTemplates[key] !== false;

                                return (
                                    <div
                                        key={key}
                                        className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                                            isSelected 
                                                ? 'bg-gradient-to-br from-indigo-50/90 to-purple-50/40 border-indigo-500 shadow-md ring-2 ring-indigo-500/20' 
                                                : isEnabled 
                                                    ? 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm' 
                                                    : 'bg-slate-50 border-slate-200 opacity-65'
                                        }`}
                                    >
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <div className={`p-2 rounded-xl ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                                    <IconComp className="w-4 h-4" />
                                                </div>

                                                <button
                                                    type="button"
                                                    title={isEnabled ? 'Click to Disable Notification' : 'Click to Enable Notification'}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTemplate(key);
                                                    }}
                                                    className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                                                        isEnabled 
                                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200' 
                                                            : 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200'
                                                    }`}
                                                >
                                                    {isEnabled ? '● ON' : '○ OFF'}
                                                </button>
                                            </div>

                                            <div className="font-extrabold text-xs text-slate-900 leading-snug mb-1">{spec.name}</div>
                                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-3">{spec.badge}</div>
                                        </div>

                                        {/* Card Action Buttons (View & Edit) */}
                                        <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPreviewModalKey(key);
                                                }}
                                                className="flex-1 py-1.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer"
                                            >
                                                <FaEye className="w-3 h-3" />
                                                <span>View</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedTemplate(key);
                                                    setCustomSubject(spec.subjectDefault);
                                                }}
                                                className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                                                    isSelected
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                                                }`}
                                            >
                                                <FaCode className="w-3 h-3" />
                                                <span>{isSelected ? 'Editing' : 'Edit'}</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-5 shadow-xs">
                        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-3">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                <FaCode className="text-indigo-600" /> {currentSpec.name} Customization
                            </h3>

                            {/* Template On/Off Toggle Control */}
                            <div className="flex items-center gap-3 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200">
                                <span className="text-xs font-bold text-slate-700">Notification Dispatch:</span>
                                <button
                                    type="button"
                                    onClick={() => toggleTemplate(selectedTemplate)}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                        enabledTemplates[selectedTemplate] !== false ? 'bg-emerald-600' : 'bg-slate-300'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                            enabledTemplates[selectedTemplate] !== false ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                                <span className={`text-xs font-extrabold ${enabledTemplates[selectedTemplate] !== false ? 'text-emerald-700' : 'text-rose-600'}`}>
                                    {enabledTemplates[selectedTemplate] !== false ? 'ENABLED' : 'DISABLED'}
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                Subject Line
                            </label>
                            <input
                                type="text"
                                value={customSubject || currentSpec.subjectDefault}
                                onChange={(e) => setCustomSubject(e.target.value)}
                                className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                Available Interpolation Variables
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                                {currentSpec.vars.map((v) => (
                                    <span key={v} className="px-2 py-1 bg-slate-100 text-slate-700 font-mono text-[10px] font-bold rounded-lg border border-slate-200">
                                        {v}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">
                                Live Email Card Preview
                            </label>
                            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 max-h-[360px] overflow-y-auto">
                                <div className="max-w-[520px] mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden text-slate-900 text-xs">
                                    <div className="bg-slate-900 text-white p-4 text-center font-bold">
                                        ResumePilot AI
                                    </div>
                                    <div className="p-5 space-y-3">
                                        <p className="font-bold text-sm">Hello {currentSpec.sampleVars.candidate_name || 'Candidate'},</p>
                                        <p className="text-slate-600">Your recent transaction has been confirmed. Below are your tax receipt details:</p>

                                        {selectedTemplate === 'tax_invoice' && (
                                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1 font-mono text-[11px]">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500">Invoice:</span>
                                                    <span className="font-bold">{currentSpec.sampleVars.invoice_number}</span>
                                                </div>
                                                <div className="flex justify-between text-emerald-700 font-bold border-t border-slate-200 pt-1">
                                                    <span>Total Paid:</span>
                                                    <span>{currentSpec.sampleVars.amount}</span>
                                                </div>
                                            </div>
                                        )}

                                        <div className="text-center pt-2">
                                            <span className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg text-xs inline-block">
                                                Access Dashboard &rarr;
                                            </span>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-2.5 text-center text-[10px] text-slate-400 border-t border-slate-100">
                                        © {new Date().getFullYear()} ResumePilot AI. Tax Invoice &amp; GST Compliance.
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <div className="w-full sm:w-auto flex-1 max-w-md">
                                <input
                                    type="email"
                                    value={testRecipientEmail}
                                    onChange={(e) => setTestRecipientEmail(e.target.value)}
                                    placeholder="Test recipient email address"
                                    className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-xl font-mono"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={handleSendTestTemplate}
                                disabled={sendingTestTemplate}
                                className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
                            >
                                {sendingTestTemplate ? <FaSpinner className="animate-spin w-4 h-4" /> : <FaPaperPlane className="w-4 h-4" />}
                                <span>Dispatch Live Template Email</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 4: EMAIL OUTBOX & AUDIT LOGS */}
            {activeTab === 'logs' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                        <div className="relative w-full sm:w-80">
                            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                            <input
                                type="text"
                                value={logSearchQuery}
                                onChange={(e) => setLogSearchQuery(e.target.value)}
                                placeholder="Search by recipient or subject..."
                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={loadSettingsAndLogs}
                            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all"
                        >
                            <FaRedo className="w-3 h-3" /> Refresh Logs
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px]">
                                <tr>
                                    <th className="p-3.5">Status</th>
                                    <th className="p-3.5">Recipient</th>
                                    <th className="p-3.5">Subject &amp; Template</th>
                                    <th className="p-3.5">Sent Timestamp</th>
                                    <th className="p-3.5 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="p-8 text-center text-slate-500 font-semibold">
                                            No outbound emails recorded in outbox yet.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLogs.map((log) => (
                                        <tr key={log.id} className="hover:bg-slate-50/80 transition-all">
                                            <td className="p-3.5">
                                                {log.status === 'SENT' ? (
                                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-extrabold text-[10px] rounded-full inline-flex items-center gap-1">
                                                        <FaCheckCircle className="w-3 h-3 text-emerald-600" /> SENT
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-extrabold text-[10px] rounded-full inline-flex items-center gap-1">
                                                        <FaExclamationCircle className="w-3 h-3 text-rose-600" /> FAILED
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3.5 font-mono text-slate-900 font-bold">{log.recipient}</td>
                                            <td className="p-3.5">
                                                <div className="font-bold text-slate-900">{log.subject}</div>
                                                <div className="text-[10px] text-slate-500 font-mono">{log.templateType} • ID: {log.messageId || 'N/A'}</div>
                                            </td>
                                            <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                                                {new Date(log.sentAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium' })}
                                            </td>
                                            <td className="p-3.5 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => handleResendEmail(log.id)}
                                                    disabled={resendingLogId === log.id}
                                                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] rounded-lg transition-all flex items-center gap-1 ml-auto"
                                                >
                                                    {resendingLogId === log.id ? <FaSpinner className="animate-spin w-3 h-3" /> : <FaRedo className="w-2.5 h-2.5" />}
                                                    <span>Resend</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 5: DELIVERABILITY & DNS MONITOR */}
            {activeTab === 'deliverability' && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-6 shadow-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 gap-3 flex-wrap">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                            <FaShieldAlt className="text-indigo-600" /> Deliverability &amp; DNS Health Status
                        </h3>
                        <div className="flex items-center gap-2">
                            {/* The verdict is the worst individual record, resolved live. */}
                            <span
                                data-testid="deliverability-overall"
                                className={`px-3 py-1 text-xs font-black rounded-full ${DNS_STATE_STYLES[deliverability?.overall] || DNS_STATE_STYLES.UNKNOWN}`}
                            >
                                {deliverabilityLoading ? 'CHECKING…' : (deliverability?.overall || 'NOT CHECKED').replace('_', ' ')}
                            </span>
                            <button
                                type="button"
                                onClick={loadDeliverability}
                                disabled={deliverabilityLoading}
                                className="px-3 py-1 text-xs font-bold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            >
                                {deliverabilityLoading ? 'Checking…' : 'Re-check'}
                            </button>
                        </div>
                    </div>

                    {deliverability?.domain && (
                        <p className="text-xs text-slate-500">
                            Checked <span className="font-mono font-bold text-slate-700">{deliverability.domain}</span>
                            {deliverability.checkedAt ? ` at ${new Date(deliverability.checkedAt).toLocaleString()}` : ''}
                            {deliverability.summary ? ` — ${deliverability.summary}` : ''}
                        </p>
                    )}

                    {deliverabilityError && (
                        <div role="alert" data-testid="deliverability-error" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                            <p className="font-bold">DNS records could not be checked.</p>
                            <p className="mt-1 text-xs">{deliverabilityError}</p>
                            <p className="mt-1 text-xs">This is reported as unknown rather than healthy — the previous state of these records is not assumed.</p>
                        </div>
                    )}

                    {deliverabilityLoading && !deliverability && (
                        <div role="status" className="p-8 text-center text-sm text-slate-500">
                            <FaSpinner className="mx-auto animate-spin mb-2" />Resolving DNS records…
                        </div>
                    )}

                    {deliverability && deliverability.records?.length === 0 && (
                        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                            {deliverability.summary || 'No sender domain is configured, so deliverability cannot be assessed.'}
                        </p>
                    )}

                    {deliverability?.records?.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                            {deliverability.records.map(record => (
                                <div
                                    key={record.label}
                                    data-testid="deliverability-record"
                                    className={`p-4 rounded-xl border space-y-1 ${DNS_CARD_STYLES[record.state] || DNS_CARD_STYLES.UNKNOWN}`}
                                >
                                    <div className="text-[10px] font-extrabold uppercase opacity-80">{record.label}</div>
                                    <div className="font-black text-sm">{(record.state || 'UNKNOWN').replace('_', ' ')}</div>
                                    {record.value && <div className="text-[10px] font-mono break-all opacity-90">{record.value}</div>}
                                    {record.detail && <div className="text-[10px] opacity-80">{record.detail}</div>}
                                    {record.remediation && (
                                        <div className="text-[10px] font-semibold pt-1 border-t border-current/20 opacity-90">
                                            Fix: {record.remediation}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* FULL SCREEN INTERACTIVE EMAIL TEMPLATE PREVIEW MODAL */}
            {previewModalKey && TEMPLATE_SPECS[previewModalKey] && (() => {
                const targetSpec = TEMPLATE_SPECS[previewModalKey];
                const ModalIcon = targetSpec.icon;
                const isEnabled = enabledTemplates[previewModalKey] !== false;

                return (
                    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
                        <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
                            {/* Modal Header Bar */}
                            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-indigo-600/30 border border-indigo-500/30 rounded-xl text-indigo-400">
                                        <ModalIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                                            {targetSpec.name}
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase border ${
                                                isEnabled ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                            }`}>
                                                {isEnabled ? '● Active' : '○ Disabled'}
                                            </span>
                                        </h3>
                                        <p className="text-xs text-slate-400">HTML Cross-Client Template Preview & Live Test Dispatcher</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    {/* Desktop vs Mobile Device Toggle */}
                                    <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
                                        <button
                                            type="button"
                                            onClick={() => setPreviewDeviceMode('desktop')}
                                            className={`px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                                                previewDeviceMode === 'desktop' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            <FaDesktop className="w-3.5 h-3.5" /> Desktop
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setPreviewDeviceMode('mobile')}
                                            className={`px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                                                previewDeviceMode === 'mobile' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            <FaMobileAlt className="w-3.5 h-3.5" /> Mobile
                                        </button>
                                    </div>

                                    {/* Close Button */}
                                    <button
                                        type="button"
                                        onClick={() => setPreviewModalKey(null)}
                                        className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                                    >
                                        <FaTimes className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Content Body */}
                            <div className="p-6 overflow-y-auto flex-1 bg-slate-100/70 flex justify-center">
                                <div className={`transition-all duration-300 w-full ${previewDeviceMode === 'mobile' ? 'max-w-[380px]' : 'max-w-[620px]'}`}>
                                    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                                        {/* Top Gradient Accent */}
                                        <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                                        
                                        {/* Header */}
                                        <div className="bg-slate-900 p-6 text-center text-white">
                                            <span className="text-[10px] font-black tracking-widest text-indigo-400 uppercase bg-indigo-950/60 px-2.5 py-1 rounded-full border border-indigo-800/50 inline-block mb-2">
                                                {targetSpec.badge}
                                            </span>
                                            <h2 className="text-xl font-extrabold text-white">ResumePilot AI</h2>
                                        </div>

                                        {/* Card Body */}
                                        <div className="p-6 space-y-4 text-slate-800 text-xs leading-relaxed">
                                            <div className="text-sm font-bold text-slate-900">
                                                Subject: <span className="font-semibold text-slate-700">{targetSpec.subjectDefault}</span>
                                            </div>

                                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                                                <p className="font-bold text-slate-900">Hello {targetSpec.sampleVars.candidate_name || 'Valued User'},</p>
                                                <p className="text-slate-600">
                                                    This is a live rendered preview of the <strong>{targetSpec.name}</strong> notification sent to users.
                                                </p>

                                                {previewModalKey === 'email_verification' && (
                                                    <div className="text-center py-3">
                                                        <span className="text-2xl font-black font-mono tracking-widest text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-200 inline-block">
                                                            {targetSpec.sampleVars.otp_code}
                                                        </span>
                                                    </div>
                                                )}

                                                {previewModalKey === 'ai_resume_ready' && (
                                                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-xl text-center space-y-1 my-2">
                                                        <div className="text-[10px] uppercase font-bold text-indigo-200">ATS Optimization Score</div>
                                                        <div className="text-3xl font-black font-mono">{targetSpec.sampleVars.ats_score || 'Not measured'}</div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* This is a rendering of the call-to-action inside the
                                                email itself, not an admin control. It is presented as
                                                inert so it cannot read as a dead button: it is not
                                                focusable and is hidden from assistive technology. */}
                                            <div className="pt-2 text-center">
                                                <span
                                                    aria-hidden="true"
                                                    data-testid="email-preview-cta"
                                                    className="inline-block px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs shadow-md select-none"
                                                >
                                                    Take Action &rarr;
                                                </span>
                                                <p className="mt-1 text-[10px] text-slate-400">Preview only — this button appears in the email the recipient receives.</p>
                                            </div>
                                        </div>

                                        {/* Footer */}
                                        <div className="bg-slate-50 p-4 text-center border-t border-slate-100 text-[11px] text-slate-500">
                                            © {new Date().getFullYear()} ResumePilot AI. Need help? support@airesume.projectdemo.guru
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2 flex-1 max-w-md">
                                    <input
                                        type="email"
                                        value={testRecipientEmail}
                                        onChange={(e) => setTestRecipientEmail(e.target.value)}
                                        placeholder="Enter email to test send this template..."
                                        className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (!testRecipientEmail) return;
                                            setSelectedTemplate(previewModalKey);
                                            await handleSendTestTemplate();
                                        }}
                                        disabled={sendingTestTemplate}
                                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-2 shadow-md cursor-pointer transition-all"
                                    >
                                        {sendingTestTemplate ? <FaSpinner className="animate-spin w-3.5 h-3.5" /> : <FaPaperPlane className="w-3.5 h-3.5" />}
                                        <span>Send Test Email Now</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setPreviewModalKey(null)}
                                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default EmailSmtpSettings;
