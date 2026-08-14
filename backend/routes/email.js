const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const tls = require('tls');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { assertPublicNetworkTarget } = require('../security/network');

// In-memory Outbox Log Store (persisted to DB if available)
let emailLogsStore = [];
let customTemplatesStore = {};

// Local config file path (lives next to the backend code)
const CONFIG_FILE = path.join(__dirname, '..', 'email_config.json');

// Read SMTP/IMAP config saved via Admin Dashboard
function readLocalConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('Error reading local email config:', e.message);
    }
    return null;
}

// Write SMTP/IMAP config to local JSON file
function writeLocalConfig(data) {
    try {
        const existing = readLocalConfig() || {};
        const merged = { ...existing, ...data, updatedAt: new Date().toISOString() };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error('Error writing local email config:', e.message);
        return false;
    }
}

// Utility to fetch complete Email & SMTP/IMAP config from local file, DB, or Env
async function getEmailConfig(db) {
    let config = {
        smtp: {
            host: process.env.SMTP_HOST || 'smtp.hostinger.com',
            port: parseInt(process.env.SMTP_PORT || '465', 10),
            encryption: process.env.SMTP_ENCRYPTION || 'ssl',
            username: process.env.SMTP_USER || '',
            password: process.env.SMTP_PASS || '',
            senderName: process.env.SMTP_SENDER_NAME || 'ResumePilot AI',
            replyTo: process.env.SMTP_REPLY_TO || 'support@airesume.projectdemo.guru',
            adminEmail: process.env.ADMIN_EMAIL || 'bhaskar.beyond@gmail.com',
            authStrategy: 'PLAIN', // PLAIN, LOGIN, OAuth2, API_KEY
        },
        fallbackSmtp: {
            enabled: false,
            host: process.env.FALLBACK_SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.FALLBACK_SMTP_PORT || '587', 10),
            encryption: process.env.FALLBACK_SMTP_ENCRYPTION || 'tls',
            username: process.env.FALLBACK_SMTP_USER || '',
            password: process.env.FALLBACK_SMTP_PASS || '',
        },
        imap: {
            enabled: true,
            host: process.env.IMAP_HOST || 'imap.hostinger.com',
            port: parseInt(process.env.IMAP_PORT || '993', 10),
            encryption: process.env.IMAP_ENCRYPTION || 'ssl',
            username: process.env.IMAP_USER || '',
            password: process.env.IMAP_PASS || '',
            autoSync: true
        },
        enabledTemplates: {
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
        }
    };

    // 1. Try local JSON config file (primary — written by Admin Dashboard save endpoint)
    const localConfig = readLocalConfig();
    if (localConfig) {
        if (localConfig.smtp) config.smtp = { ...config.smtp, ...localConfig.smtp };
        if (localConfig.fallbackSmtp) config.fallbackSmtp = { ...config.fallbackSmtp, ...localConfig.fallbackSmtp };
        if (localConfig.imap) config.imap = { ...config.imap, ...localConfig.imap };
        if (localConfig.enabledTemplates) config.enabledTemplates = { ...config.enabledTemplates, ...localConfig.enabledTemplates };
    }

    // 2. Try Firestore if available (optional fallback)
    if (db) {
        try {
            const doc = await db.collection('data').doc('system_settings').get();
            if (doc.exists && doc.data()?.smtp) {
                const s = doc.data().smtp;
                config.smtp = { ...config.smtp, ...s };
            }
            if (doc.exists && doc.data()?.fallbackSmtp) {
                config.fallbackSmtp = { ...config.fallbackSmtp, ...doc.data().fallbackSmtp };
            }
            if (doc.exists && doc.data()?.imap) {
                config.imap = { ...config.imap, ...doc.data().imap };
            }
            if (doc.exists && doc.data()?.enabledTemplates) {
                config.enabledTemplates = { ...config.enabledTemplates, ...doc.data().enabledTemplates };
            }
        } catch (e) {
            console.error('Error fetching Email config from DB:', e.message);
        }
    }

    return config;
}

// Create Nodemailer Transporter instance
function createTransporter(smtpConfig) {
    const isSecure = smtpConfig.encryption === 'ssl' || smtpConfig.port === 465;
    return nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: isSecure,
        auth: (smtpConfig.username && smtpConfig.password) ? {
            user: smtpConfig.username,
            pass: smtpConfig.password,
        } : undefined,
        tls: {
            rejectUnauthorized: false
        },
        connectionTimeout: 10000, // 10s connection timeout
        greetingTimeout: 5000
    });
}

// Verify IMAP Connection via direct Socket
function verifyImapConnection(imapConfig) {
    return new Promise((resolve, reject) => {
        const isSsl = imapConfig.encryption === 'ssl' || imapConfig.port === 993;
        const host = imapConfig.host || 'imap.hostinger.com';
        const port = parseInt(imapConfig.port || (isSsl ? 993 : 143), 10);

        let socket;
        let timer = setTimeout(() => {
            if (socket) socket.destroy();
            reject(new Error(`IMAP Connection Timeout after 8 seconds (${host}:${port})`));
        }, 8000);

        const onConnect = () => {
            clearTimeout(timer);
            socket.write('A1 CAPABILITY\r\n');
            setTimeout(() => {
                socket.destroy();
                resolve({ success: true, message: `IMAP Socket verified on ${host}:${port}` });
            }, 500);
        };

        if (isSsl) {
            socket = tls.connect(port, host, { rejectUnauthorized: false }, onConnect);
        } else {
            socket = net.connect(port, host, onConnect);
        }

        socket.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

// Enterprise Dynamic HTML Template Generator (10/10 WordPress & SaaS Standard Suite)
function renderEmailTemplate(templateType, vars = {}, customHtmlMap = {}) {
    const brandName = vars.brand_name || process.env.SMTP_SENDER_NAME || 'ResumePilot AI';
    const siteUrl = vars.site_url || `${process.env.PROTOCOL || 'https'}://${process.env.WEBSITE_NAME || 'airesume.projectdemo.guru'}`;
    const supportEmail = vars.support_email || process.env.SMTP_REPLY_TO || `support@${process.env.WEBSITE_NAME || 'airesume.projectdemo.guru'}`;

    const candidateName = vars.candidate_name || vars.customer_name || 'Valued Candidate';
    const invoiceNo = vars.invoice_number || vars.transaction_id || 'RPAI-INV-1001';
    const amount = vars.amount || vars.formatted_total || '₹199.00';
    const planName = vars.plan_name || 'Pro Monthly Plan';
    const dateStr = vars.date || new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' });

    // Check if admin has saved a custom HTML template
    if (customHtmlMap && customHtmlMap[templateType]) {
        let html = customHtmlMap[templateType].html || '';
        let subject = customHtmlMap[templateType].subject || `Notification from ${brandName}`;

        const replaceMap = {
            '{{candidate_name}}': candidateName,
            '{{invoice_number}}': invoiceNo,
            '{{amount}}': amount,
            '{{plan_name}}': planName,
            '{{date}}': dateStr,
            '{{site_url}}': siteUrl,
            '{{support_email}}': supportEmail,
            '{{reset_link}}': vars.reset_link || `${siteUrl}/reset-password`,
            '{{retry_url}}': vars.retry_url || `${siteUrl}/pricing`,
            '{{gstin}}': vars.gstin || '',
            '{{otp_code}}': vars.otp_code || '849204',
            '{{ats_score}}': vars.ats_score || '94',
            '{{job_title}}': vars.job_title || 'Senior Software Engineer',
            '{{company_name}}': vars.company_name || 'TechCorp',
            '{{application_status}}': vars.application_status || 'Shortlisted for Interview 🎯',
            '{{login_time}}': vars.login_time || new Date().toUTCString(),
            '{{ip_address}}': vars.ip_address || '198.51.100.42',
            '{{device_info}}': vars.device_info || 'Chrome on macOS (Mumbai, IN)'
        };

        Object.keys(replaceMap).forEach(key => {
            const regex = new RegExp(key, 'g');
            html = html.replace(regex, replaceMap[key]);
            subject = subject.replace(regex, replaceMap[key]);
        });

        return { subject, html };
    }

    // Shared Header/Footer Layout Wrapper for 10/10 Aesthetic Consistency
    const buildEmailWrapper = (title, badgeText, contentHtml) => `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #090d16; font-family: 'Segoe UI', Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
        <div style="background-color: #090d16; padding: 40px 15px;">
            <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);">
                <!-- Top Gradient Brand Accent -->
                <div style="height: 6px; background: linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);"></div>
                
                <!-- Dark Brand Header -->
                <div style="background-color: #0f172a; padding: 32px 30px; text-align: center;">
                    <div style="display: inline-block; padding: 6px 14px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 9999px; margin-bottom: 12px;">
                        <span style="font-size: 11px; font-weight: 700; color: #818cf8; letter-spacing: 0.5px; text-transform: uppercase;">${badgeText || brandName}</span>
                    </div>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">${brandName}</h1>
                </div>

                <!-- Main Body Content -->
                <div style="padding: 36px 32px; background: #ffffff;">
                    ${contentHtml}
                </div>

                <!-- Footer -->
                <div style="background-color: #f8fafc; padding: 24px 32px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #64748b;">
                    <p style="margin: 0 0 8px 0; font-weight: 600; color: #475569;">© ${new Date().getFullYear()} ${brandName}. All rights reserved.</p>
                    <p style="margin: 0;">Need support? Email us at <a href="mailto:${supportEmail}" style="color: #4f46e5; text-decoration: none; font-weight: 600;">${supportEmail}</a> or visit <a href="${siteUrl}" style="color: #4f46e5; text-decoration: none; font-weight: 600;">${siteUrl}</a></p>
                </div>
            </div>
        </div>
    </body>
    </html>`;

    let bodyHtml = '';
    let subject = '';

    switch (templateType) {
        case 'payment_success':
        case 'tax_invoice':
            subject = `Tax Invoice & Receipt #${invoiceNo} — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                `Payment Receipt #${invoiceNo}`,
                'OFFICIAL TAX INVOICE & RECEIPT',
                `
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 56px; height: 56px; background: #dcfce7; color: #15803d; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; line-height: 56px;">✓</div>
                    <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 12px 0 4px 0;">Payment Successful!</h2>
                    <p style="font-size: 14px; color: #64748b; margin: 0;">Thank you, <strong>${candidateName}</strong>! Your account has been upgraded.</p>
                </div>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; margin: 24px 0;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 10px 0; color: #64748b; font-weight: 600;">Invoice Reference:</td>
                            <td style="padding: 10px 0; text-align: right; font-family: monospace; font-weight: 700; color: #0f172a;">${invoiceNo}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 10px 0; color: #64748b; font-weight: 600;">Date & Time:</td>
                            <td style="padding: 10px 0; text-align: right; color: #0f172a;">${dateStr}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 10px 0; color: #64748b; font-weight: 600;">Purchased Plan:</td>
                            <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #4f46e5;">${planName}</td>
                        </tr>
                        ${vars.gstin ? `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 10px 0; color: #64748b; font-weight: 600;">B2B GSTIN:</td>
                            <td style="padding: 10px 0; text-align: right; font-family: monospace; color: #7c3aed; font-weight: 700;">${vars.gstin}</td>
                        </tr>` : ''}
                        <tr>
                            <td style="padding: 14px 0 4px 0; font-size: 15px; font-weight: 800; color: #0f172a;">Total Paid:</td>
                            <td style="padding: 14px 0 4px 0; text-align: right; font-size: 20px; font-weight: 800; color: #16a34a; font-family: monospace;">${amount}</td>
                        </tr>
                    </table>
                </div>

                <div style="text-align: center; margin-top: 28px;">
                    <a href="${siteUrl}/dashboard" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 10px 20px -5px rgba(79,70,229,0.4);">Launch Resume Builder &rarr;</a>
                </div>`
            );
            break;

        case 'welcome':
            subject = `Welcome to ${brandName}! Build your ATS Resume Today 🚀`;
            bodyHtml = buildEmailWrapper(
                `Welcome aboard, ${candidateName}!`,
                'WELCOME ABOARD 🚀',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Welcome, ${candidateName}! 👋</h2>
                <p style="font-size: 15px; color: #475569; line-height: 1.6;">You're now ready to craft high-scoring, ATS-optimized resumes that get noticed by top tech & corporate recruiters.</p>
                
                <div style="background: #eef2ff; border-left: 4px solid #4f46e5; padding: 18px; border-radius: 8px; margin: 24px 0;">
                    <p style="margin: 0 0 10px 0; font-weight: 700; color: #312e81; font-size: 14px;">🎯 Quick Start Guide:</p>
                    <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #3730a3; line-height: 1.8;">
                        <li>Choose from 50+ ATS-tested resume templates</li>
                        <li>Use AI to generate custom summary & bullet points</li>
                        <li>Download high-resolution PDF or share live portfolio URL</li>
                    </ul>
                </div>

                <div style="text-align: center; margin-top: 30px;">
                    <a href="${siteUrl}/dashboard" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 10px 20px -5px rgba(79,70,229,0.4);">Start Building Resume &rarr;</a>
                </div>`
            );
            break;

        case 'password_reset':
            subject = `Security Alert: Reset Your Password — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Password Reset Request',
                'SECURITY ALERT 🔒',
                `
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                    <h3 style="color: #991b1b; margin: 0 0 6px 0; font-size: 16px; font-weight: 800;">Password Reset Requested</h3>
                    <p style="color: #7f1d1d; margin: 0; font-size: 13px; line-height: 1.5;">We received a request to reset your password for your <strong>${brandName}</strong> account. Click below to specify a new password.</p>
                </div>

                <div style="text-align: center; margin: 28px 0;">
                    <a href="${vars.reset_link || siteUrl + '/reset-password'}" style="background-color: #dc2626; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 10px 20px -5px rgba(220,38,38,0.3);">Reset Password Now &rarr;</a>
                </div>

                <p style="font-size: 12px; color: #94a3b8; text-align: center;">If you did not request this change, please secure your email account immediately. This link expires in 30 minutes.</p>`
            );
            break;

        case 'email_verification':
            subject = vars.verification_link
                ? `Confirm Your Email Address — ${brandName}`
                : `${vars.otp_code || '849204'} is your ${brandName} Verification Code 🔑`;
            bodyHtml = buildEmailWrapper(
                'Confirm Your Email Address',
                'ACCOUNT SECURITY 🔑',
                `
                <div style="text-align: center;">
                    <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Confirm Your Email Address</h2>
                    <p style="font-size: 14px; color: #475569; line-height: 1.6;">
                        Thank you for joining <strong>${brandName}</strong>! Please confirm your email address to secure your account and unlock all platform features.
                    </p>
                    
                    ${vars.verification_link ? `
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${vars.verification_link}" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 10px 20px -5px rgba(79,70,229,0.4);">Confirm Email Address &rarr;</a>
                    </div>
                    <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 20px;">
                        Or copy and paste this link into your browser:<br/>
                        <a href="${vars.verification_link}" style="color: #4f46e5; word-break: break-all;">${vars.verification_link}</a>
                    </p>
                    ` : `
                    <div style="background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 16px; padding: 20px; display: inline-block; margin: 20px 0;">
                        <span style="font-family: monospace; font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #4f46e5;">${vars.otp_code || '849204'}</span>
                    </div>
                    `}

                    <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">This security link is valid for 24 hours. If you did not create an account, you can safely ignore this email.</p>
                </div>`
            );
            break;

        case 'payment_failed':
            subject = `⚠️ Payment Action Required — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Payment Processing Issue',
                'ACTION REQUIRED ⚠️',
                `
                <div style="background: #fff1f2; border: 1px solid #ffe4e6; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                    <h3 style="color: #9f1239; margin: 0 0 6px 0; font-size: 16px; font-weight: 800;">Payment Unsuccessful</h3>
                    <p style="color: #881337; margin: 0; font-size: 13px; line-height: 1.5;">We were unable to process your recent transaction of <strong>${amount}</strong> for <strong>${planName}</strong>.</p>
                </div>

                <p style="font-size: 14px; color: #475569; line-height: 1.6;">Don't worry! Your resume data is safe. Please update your payment method to maintain uninterrupted AI generation & PDF download privileges.</p>

                <div style="text-align: center; margin: 28px 0;">
                    <a href="${vars.retry_url || siteUrl + '/pricing'}" style="background-color: #e11d48; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 10px 20px -5px rgba(225,29,72,0.4);">Update Payment Method &rarr;</a>
                </div>`
            );
            break;

        case 'subscription_renewal':
            subject = `Upcoming Subscription Renewal Notice — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Subscription Renewal Notice',
                'RENEWAL REMINDER 🔄',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Hi ${candidateName},</h2>
                <p style="font-size: 14px; color: #475569; line-height: 1.6;">Your <strong>${planName}</strong> subscription is scheduled for auto-renewal on <strong>${dateStr}</strong>.</p>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 8px 0; color: #64748b;">Plan Name:</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #0f172a;">${planName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Renewal Amount:</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: 800; color: #16a34a; font-family: monospace;">${amount}</td>
                        </tr>
                    </table>
                </div>

                <div style="text-align: center; margin-top: 24px;">
                    <a href="${siteUrl}/dashboard?tab=settings" style="background-color: #0f172a; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 13px; display: inline-block;">Manage Subscription &rarr;</a>
                </div>`
            );
            break;

        case 'ai_resume_ready':
            subject = `✨ Your AI Resume is Ready! (ATS Score: ${vars.ats_score || '94'}/100)`;
            bodyHtml = buildEmailWrapper(
                'AI Resume Optimization Complete',
                'AI COMPLETED ✨',
                `
                <div style="text-align: center;">
                    <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Great news, ${candidateName}! 🎉</h2>
                    <p style="font-size: 14px; color: #475569;">Our AI engine has analyzed and generated your optimized resume.</p>

                    <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 16px; padding: 24px; color: #ffffff; margin: 24px 0; box-shadow: 0 10px 25px -5px rgba(79,70,229,0.3);">
                        <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8; font-weight: 700;">ATS Compatibility Score</span>
                        <div style="font-size: 48px; font-weight: 900; margin: 8px 0; font-family: monospace;">${vars.ats_score || '94'}<span style="font-size: 24px;">/100</span></div>
                        <p style="margin: 0; font-size: 13px; opacity: 0.9;">High ATS Pass Rate Guaranteed for Top Employers!</p>
                    </div>

                    <a href="${siteUrl}/dashboard" style="background-color: #15803d; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 10px 20px -5px rgba(21,128,61,0.3);">View &amp; Download PDF &rarr;</a>
                </div>`
            );
            break;

        case 'job_application_received':
            subject = `📩 New Applicant for ${vars.job_title || 'Position'} — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'New Job Application Received',
                'RECRUITER NOTIFICATION 📩',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">New Applicant Alert!</h2>
                <p style="font-size: 14px; color: #475569;">A new candidate has submitted an application for <strong>${vars.job_title || 'Software Position'}</strong> at <strong>${vars.company_name || 'TechCorp'}</strong>.</p>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; margin: 24px 0;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 8px 0; color: #64748b;">Applicant Name:</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #0f172a;">${candidateName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Applied On:</td>
                            <td style="padding: 8px 0; text-align: right; color: #0f172a;">${dateStr}</td>
                        </tr>
                    </table>
                </div>

                <div style="text-align: center; margin-top: 24px;">
                    <a href="${siteUrl}/employer/dashboard" style="background-color: #4f46e5; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block;">Review Applicant Profile &rarr;</a>
                </div>`
            );
            break;

        case 'job_status_update':
            subject = `Application Update: ${vars.application_status || 'Status Changed'} — ${vars.company_name || 'Employer'}`;
            bodyHtml = buildEmailWrapper(
                'Application Status Update',
                'STATUS UPDATE 🎯',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Hello ${candidateName},</h2>
                <p style="font-size: 14px; color: #475569;">Your job application status for <strong>${vars.job_title || 'Software Role'}</strong> at <strong>${vars.company_name || 'Company'}</strong> has been updated:</p>

                <div style="background: #eef2ff; border-left: 4px solid #4f46e5; padding: 20px; border-radius: 10px; text-align: center; margin: 24px 0;">
                    <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #4338ca; font-weight: 700;">New Status</span>
                    <div style="font-size: 20px; font-weight: 800; color: #1e1b4b; margin-top: 4px;">${vars.application_status || 'Shortlisted for Interview 🎯'}</div>
                </div>

                <div style="text-align: center; margin-top: 28px;">
                    <a href="${siteUrl}/jobs" style="background-color: #0f172a; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block;">Open Jobs Portal &rarr;</a>
                </div>`
            );
            break;

        case 'security_alert':
            subject = `🛡️ Security Alert: New Login from ${vars.device_info || 'Device'} — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Security & Login Alert',
                'SECURITY ALERT 🛡️',
                `
                <div style="background: #fff7ed; border: 1px solid #ffedd5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                    <h3 style="color: #c2410c; margin: 0 0 6px 0; font-size: 16px; font-weight: 800;">New Sign-In Detected</h3>
                    <p style="color: #9a3412; margin: 0; font-size: 13px;">We detected a new login to your account from an unrecognized location/device.</p>
                </div>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0; font-size: 13px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 6px 0; color: #64748b;">Device / Browser:</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #0f172a;">${vars.device_info || 'Chrome on macOS'}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 6px 0; color: #64748b;">IP Address:</td>
                            <td style="padding: 6px 0; text-align: right; font-family: monospace; color: #0f172a;">${vars.ip_address || '198.51.100.42'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b;">Time:</td>
                            <td style="padding: 6px 0; text-align: right; color: #0f172a;">${vars.login_time || new Date().toUTCString()}</td>
                        </tr>
                    </table>
                </div>

                <p style="font-size: 13px; color: #64748b;">If this was you, no action is needed. If you do not recognize this activity, please reset your password immediately.</p>`
            );
            break;

        case 'account_created_admin':
            subject = `🔔 New User Registration: ${candidateName} — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'New User Account Registered',
                'ADMIN ALERT 🔔',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">New Registration Notice</h2>
                <p style="font-size: 14px; color: #475569;">A new user account was registered on <strong>${brandName}</strong>.</p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0; font-size: 13px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 6px 0; color: #64748b;">User Name:</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #0f172a;">${candidateName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b;">Registration Date:</td>
                            <td style="padding: 6px 0; text-align: right; color: #0f172a;">${dateStr}</td>
                        </tr>
                    </table>
                </div>
                <div style="text-align: center; margin-top: 24px;">
                    <a href="${siteUrl}/adm" style="background-color: #0f172a; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 13px; display: inline-block;">Open Admin Panel &rarr;</a>
                </div>`
            );
            break;

        case 'password_changed_confirm':
            subject = `🔒 Security Confirmation: Password Updated — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Password Successfully Updated',
                'SECURITY NOTICE 🔒',
                `
                <div style="text-align: center;">
                    <div style="width: 56px; height: 56px; background: #e0e7ff; color: #4338ca; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; line-height: 56px;">✓</div>
                    <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 12px 0 4px 0;">Password Changed</h2>
                    <p style="font-size: 14px; color: #64748b;">Your account password for <strong>${candidateName}</strong> was updated successfully on ${dateStr}.</p>
                    <p style="font-size: 12px; color: #94a3b8; margin-top: 16px;">If you did not perform this change, contact support immediately at <a href="mailto:${supportEmail}" style="color: #dc2626;">${supportEmail}</a>.</p>
                </div>`
            );
            break;

        case 'refund_processed':
            subject = `💸 Refund Processed: #${invoiceNo} — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Refund Confirmation',
                'BILLING REFUND 💸',
                `
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                    <h3 style="color: #166534; margin: 0 0 6px 0; font-size: 16px; font-weight: 800;">Refund Completed</h3>
                    <p style="color: #15803d; margin: 0; font-size: 13px; line-height: 1.5;">We have processed a refund of <strong>${amount}</strong> for Invoice #${invoiceNo}.</p>
                </div>
                <p style="font-size: 14px; color: #475569; line-height: 1.6;">The credited amount will reflect in your original payment source within 3–5 business days depending on your bank.</p>`
            );
            break;

        case 'subscription_cancelled':
            subject = `Subscription Cancelled — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Subscription Cancellation Notice',
                'SUBSCRIPTION UPDATE ℹ️',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Hello ${candidateName},</h2>
                <p style="font-size: 14px; color: #475569; line-height: 1.6;">Your subscription for <strong>${planName}</strong> has been cancelled as requested.</p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0; font-size: 13px;">
                    <p style="margin: 0; color: #64748b;">You will maintain full access to your existing resume drafts until the end of your billing cycle.</p>
                </div>
                <div style="text-align: center; margin-top: 24px;">
                    <a href="${siteUrl}/pricing" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 13px; display: inline-block;">Reactivate Subscription &rarr;</a>
                </div>`
            );
            break;

        case 'ai_cover_letter_ready':
            subject = `📝 Your AI Cover Letter is Ready! — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'AI Cover Letter Generated',
                'AI OUTPUT 📝',
                `
                <div style="text-align: center;">
                    <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Cover Letter Generated! 🎉</h2>
                    <p style="font-size: 14px; color: #475569;">Your customized cover letter for <strong>${vars.job_title || 'Target Job'}</strong> is now complete.</p>
                    <div style="text-align: center; margin: 28px 0;">
                        <a href="${siteUrl}/dashboard?tab=cover-letter" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block;">View Cover Letter &rarr;</a>
                    </div>
                </div>`
            );
            break;

        case 'portfolio_published':
            subject = `🌐 Your Live Website Portfolio is Online! — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Portfolio Website Published',
                'PORTFOLIO LIVE 🌐',
                `
                <div style="text-align: center;">
                    <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Congratulations, ${candidateName}! 🚀</h2>
                    <p style="font-size: 14px; color: #475569;">Your web portfolio is now live and accessible to recruiters worldwide.</p>
                    <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; margin: 20px 0; font-family: monospace; font-weight: 700; color: #4f46e5;">
                        ${siteUrl}/p/${vars.portfolio_slug || 'candidate'}
                    </div>
                    <a href="${siteUrl}/p/${vars.portfolio_slug || 'candidate'}" style="background-color: #0f172a; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block;">Visit Live Portfolio &rarr;</a>
                </div>`
            );
            break;

        case 'job_posted_employer':
            subject = `✅ Job Listing Published: ${vars.job_title || 'Position'} — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Job Listing Published',
                'EMPLOYER ALERT ✅',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Listing is Now Live!</h2>
                <p style="font-size: 14px; color: #475569;">Your job post for <strong>${vars.job_title || 'Software Position'}</strong> at <strong>${vars.company_name || 'TechCorp'}</strong> is active and receiving applicants.</p>
                <div style="text-align: center; margin-top: 24px;">
                    <a href="${siteUrl}/jobs" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 13px; display: inline-block;">View Job Listing &rarr;</a>
                </div>`
            );
            break;

        case 'admin_system_alert':
            subject = `🚨 System Alert: ${vars.alert_title || 'Operational Notice'} — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'System Operational Alert',
                'CRITICAL SYSTEM ALERT 🚨',
                `
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #991b1b; margin: 0 0 6px 0; font-size: 16px; font-weight: 800;">${vars.alert_title || 'System Notification'}</h3>
                    <p style="color: #7f1d1d; margin: 0; font-size: 13px; line-height: 1.5;">${vars.alert_message || 'An operational notification requires administrative review.'}</p>
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <a href="${siteUrl}/adm" style="background-color: #dc2626; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 13px; display: inline-block;">Open Health Console &rarr;</a>
                </div>`
            );
            break;

        case 'broadcast_announcement':
            subject = vars.subject || `📢 Special Update from ${brandName}`;
            bodyHtml = buildEmailWrapper(
                vars.title || 'Platform Update',
                'ANNOUNCEMENT 📢',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">${vars.title || 'Special Announcement'}</h2>
                <div style="font-size: 14px; color: #475569; line-height: 1.6;">${vars.body_html || vars.body || 'Thank you for being a valued member of our platform.'}</div>
                <div style="text-align: center; margin-top: 28px;">
                    <a href="${siteUrl}" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block;">Explore What's New &rarr;</a>
                </div>`
            );
            break;

        default:
            subject = vars.subject || `Notification from ${brandName}`;
            bodyHtml = buildEmailWrapper(
                subject,
                'NOTIFICATION',
                `<div style="font-size: 14px; color: #334155; line-height: 1.6;">${vars.body || 'Default notification body.'}</div>`
            );
    }

    return { subject, html: bodyHtml };
}

// Log Outbound Email to In-Memory & Database Store
async function logOutboundEmail(db, logEntry) {
    const entry = {
        id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        recipient: logEntry.to,
        subject: logEntry.subject,
        templateType: logEntry.templateType || 'custom',
        status: logEntry.status, // SENT, FAILED, SKIPPED
        html: logEntry.html || null,
        messageId: logEntry.messageId || null,
        error: logEntry.error || null,
        transport: logEntry.transport || 'primary_smtp',
        sentAt: new Date().toISOString()
    };

    emailLogsStore.unshift(entry);
    if (emailLogsStore.length > 200) emailLogsStore.pop(); // Keep last 200 logs

    if (db) {
        try {
            await db.collection('email_logs').doc(entry.id).set(entry);
        } catch (e) {
            console.error('Failed to log email in DB:', e.message);
        }
    }

    return entry;
}

// Circuit Breaker State for High-Availability Primary SMTP Failover
let primaryConsecutiveFailures = 0;
let primaryCircuitBreakerUntil = 0;

// Create Nodemailer Transporter instance with tight timeouts for instant failover
function createTransporter(smtpConfig) {
    const isSecure = smtpConfig.encryption === 'ssl' || smtpConfig.port === 465;
    return nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: isSecure,
        auth: (smtpConfig.username && smtpConfig.password) ? {
            user: smtpConfig.username,
            pass: smtpConfig.password,
        } : undefined,
        tls: {
            rejectUnauthorized: false
        },
        connectionTimeout: 5000, // 5s fast connection timeout
        greetingTimeout: 4000,   // 4s SMTP greeting timeout
        socketTimeout: 8000      // 8s socket timeout to avoid hanging connections
    });
}

// Helper: Dispatch Outbound Mail with Fallback Transport Support (10/10 High-Availability Circuit Breaker)
async function dispatchMailWithFallback(config, mailOptions) {
    let primaryErr = null;
    const now = Date.now();
    const isCircuitOpen = primaryCircuitBreakerUntil > now;
    const maxFailures = parseInt(config?.fallbackSmtp?.maxFailures || 3, 10);
    const cooldownMinutes = parseInt(config?.fallbackSmtp?.cooldownMinutes || 5, 10);

    if (isCircuitOpen) {
        const remainingSec = Math.ceil((primaryCircuitBreakerUntil - now) / 1000);
        console.warn(`[Circuit Breaker Active] Primary SMTP in ${cooldownMinutes}-min cooldown (${remainingSec}s left, Failures: ${primaryConsecutiveFailures}). Routing directly to Secondary Fallback Relay...`);
    }

    // 1. Try Primary Transporter if circuit is closed and credentials exist
    if (!isCircuitOpen && config.smtp && config.smtp.username && config.smtp.password) {
        try {
            const primaryTransporter = createTransporter(config.smtp);
            const info = await primaryTransporter.sendMail(mailOptions);
            
            // Reset Circuit Breaker on Primary success
            if (primaryConsecutiveFailures > 0) {
                console.log('✅ Primary SMTP recovered! Resetting circuit breaker counter.');
            }
            primaryConsecutiveFailures = 0;
            primaryCircuitBreakerUntil = 0;

            return { success: true, messageId: info.messageId, transport: 'primary_smtp' };
        } catch (err) {
            primaryErr = err;
            primaryConsecutiveFailures++;
            console.warn(`⚠️ Primary SMTP Dispatch Failed (Attempt ${primaryConsecutiveFailures}/${maxFailures}):`, err.message);

            if (primaryConsecutiveFailures >= maxFailures) {
                primaryCircuitBreakerUntil = now + cooldownMinutes * 60 * 1000;
                console.error(`🚨 Primary SMTP failed ${primaryConsecutiveFailures} consecutive times. Opening Circuit Breaker for ${cooldownMinutes} mins until ${new Date(primaryCircuitBreakerUntil).toLocaleTimeString()}`);
            }
        }
    }

    // 2. Try Secondary Fallback Transporter if enabled
    const fallbackEnabled = config.fallbackSmtp && (config.fallbackSmtp.enabled === true || config.fallbackSmtp.enabled === 'true' || config.fallbackSmtp.enabled === 1);
    if (fallbackEnabled && config.fallbackSmtp.username && config.fallbackSmtp.password) {
        try {
            console.warn('⚡ Primary SMTP unavailable/bypassed. Activating Secondary Fallback Relay (Failover)...');
            const fallbackTransporter = createTransporter(config.fallbackSmtp);

            // SASL Compliance: Use verified sender address (Fallback Sender Email -> Primary Username -> ReplyTo -> Dynamic System Domain)
            let fallbackUser = config.fallbackSmtp?.senderEmail;
            if (!fallbackUser || !fallbackUser.includes('@')) {
                if (config.smtp?.username && config.smtp.username.includes('@')) {
                    fallbackUser = config.smtp.username;
                } else if (config.smtp?.replyTo && config.smtp.replyTo.includes('@')) {
                    fallbackUser = config.smtp.replyTo;
                } else {
                    const domain = process.env.WEBSITE_NAME || 'projectdemo.guru';
                    fallbackUser = `no-reply@${domain}`;
                }
            }
            const senderName = config.smtp?.senderName || 'ResumePilot AI';
            const fallbackMailOptions = {
                ...mailOptions,
                from: `"${senderName}" <${fallbackUser}>`,
                replyTo: config.smtp?.replyTo || fallbackUser
            };

            const info = await fallbackTransporter.sendMail(fallbackMailOptions);
            console.log(`✅ Secondary Fallback Relay dispatched email successfully! (ID: ${info.messageId})`);
            return { success: true, messageId: info.messageId, transport: 'fallback_smtp' };
        } catch (fallbackErr) {
            console.error('❌ Secondary Fallback SMTP Dispatch Failed:', fallbackErr.message);
            throw new Error(`Primary SMTP Error: ${primaryErr ? primaryErr.message : (isCircuitOpen ? 'Circuit Breaker Open' : 'Not configured')}. Fallback Error: ${fallbackErr.message}`);
        }
    }

    if (primaryErr) throw primaryErr;
    throw new Error('No valid SMTP credentials configured.');
}

// --- API ENDPOINTS ---

// 0. Circuit Breaker Control & Status Endpoints
router.get('/admin/circuit-breaker-status', (req, res) => {
    const now = Date.now();
    const isCircuitOpen = primaryCircuitBreakerUntil > now;
    const remainingSeconds = isCircuitOpen ? Math.ceil((primaryCircuitBreakerUntil - now) / 1000) : 0;
    res.json({
        success: true,
        isCircuitOpen,
        consecutiveFailures: primaryConsecutiveFailures,
        remainingSeconds,
        breakerUntil: primaryCircuitBreakerUntil ? new Date(primaryCircuitBreakerUntil).toISOString() : null
    });
});

router.post('/admin/reset-circuit-breaker', (req, res) => {
    primaryConsecutiveFailures = 0;
    primaryCircuitBreakerUntil = 0;
    res.json({ success: true, message: 'Circuit breaker reset successfully! Primary SMTP restored to Operational state.' });
});

// 0b. Custom Template Customization Endpoints
router.post('/admin/save-template-customization', async (req, res) => {
    const db = req.app.get('db');
    const { templateType, subject, html } = req.body;
    if (!templateType || !html) {
        return res.status(400).json({ success: false, error: 'templateType and html are required.' });
    }
    customTemplatesStore[templateType] = { subject: subject || '', html, updatedAt: new Date().toISOString() };
    
    try {
        const local = readLocalConfig() || {};
        local.customTemplates = customTemplatesStore;
        writeLocalConfig(local);
        if (db) {
            await db.collection('data').doc('custom_email_templates').set(customTemplatesStore, { merge: true });
        }
        res.json({ success: true, message: `Template '${templateType}' customized successfully!` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/admin/custom-templates', (req, res) => {
    res.json({ success: true, templates: customTemplatesStore });
});

// 1. Test Outbound SMTP Socket Connection (Supports type='smtp' and type='fallback_smtp')
router.post('/admin/test-connection', async (req, res) => {
    const { type } = req.body;

    if (type === 'fallback_smtp') {
        try {
            const fallbackConfig = {
                host: req.body.host || 'smtp.gmail.com',
                port: parseInt(req.body.port || '587', 10),
                encryption: req.body.encryption || 'tls',
                username: req.body.username || '',
                password: req.body.password || '',
                senderName: req.body.senderName || 'ResumePilot AI Failover',
                adminEmail: req.body.adminEmail || req.body.username || 'bhaskar.beyond@gmail.com',
            };

            if (!fallbackConfig.username || !fallbackConfig.password) {
                return res.status(400).json({ success: false, error: 'Secondary Fallback Relay Username and Password are required.' });
            }

            await assertPublicNetworkTarget(fallbackConfig.host);
            const transporter = createTransporter(fallbackConfig);
            await transporter.verify();

            const mailOptions = {
                from: `"${fallbackConfig.senderName}" <${fallbackConfig.username}>`,
                to: fallbackConfig.adminEmail,
                subject: `🛡️ Secondary Fallback Relay Verified — ${fallbackConfig.senderName}`,
                html: `
                <div style="font-family: Arial, sans-serif; padding: 30px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; max-width: 500px; margin: 20px auto; color: #166534;">
                    <h2 style="margin-top: 0; color: #15803d;">🛡️ Secondary Fallback Relay Successful!</h2>
                    <p>Your failover SMTP relay socket is active and ready to deliver backup emails automatically if the primary server fails.</p>
                    <hr style="border: none; border-top: 1px solid #bbf7d0; margin: 15px 0;" />
                    <p style="font-size: 12px; color: #166534; font-family: monospace;">
                        Host: ${fallbackConfig.host}:${fallbackConfig.port} (${fallbackConfig.encryption.toUpperCase()})<br/>
                        Authenticated User: ${fallbackConfig.username}
                    </p>
                </div>`
            };

            const info = await transporter.sendMail(mailOptions);
            return res.json({
                success: true,
                messageId: info.messageId,
                message: `Secondary Fallback Relay verified! Test email sent to ${fallbackConfig.adminEmail}`
            });
        } catch (err) {
            console.error('[Fallback Test Error]:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    if (type !== 'smtp') {
        return res.json({ success: true, message: 'Non-SMTP test logged.' });
    }

    try {
        const smtpConfig = {
            host: req.body.host || 'smtp.hostinger.com',
            port: parseInt(req.body.port || '465', 10),
            encryption: req.body.encryption || 'ssl',
            username: req.body.username || '',
            password: req.body.password || '',
            senderName: req.body.senderName || 'ResumePilot AI',
            adminEmail: req.body.adminEmail || 'bhaskar.beyond@gmail.com',
        };

        if (!smtpConfig.username || !smtpConfig.password) {
            return res.status(400).json({ success: false, error: 'SMTP Username and Password are required.' });
        }

        const transporter = createTransporter(smtpConfig);
        await transporter.verify();

        const mailOptions = {
            from: `"${smtpConfig.senderName}" <${smtpConfig.username}>`,
            to: smtpConfig.adminEmail,
            subject: `✅ Primary SMTP Connection Verified — ${smtpConfig.senderName}`,
            html: `
            <div style="font-family: Arial, sans-serif; padding: 30px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; max-width: 500px; margin: 20px auto; color: #166534;">
                <h2 style="margin-top: 0; color: #15803d;">🎉 SMTP Connection Successful!</h2>
                <p>Your outgoing mail server socket is active and ready to deliver transactional emails.</p>
                <hr style="border: none; border-top: 1px solid #bbf7d0; margin: 15px 0;" />
                <p style="font-size: 12px; color: #166534; font-family: monospace;">
                    Host: ${smtpConfig.host}:${smtpConfig.port} (${smtpConfig.encryption.toUpperCase()})<br/>
                    Sender: ${smtpConfig.senderName} (${smtpConfig.username})
                </p>
            </div>`
        };

        const info = await transporter.sendMail(mailOptions);
        return res.json({
            success: true,
            message: `SMTP Verified! Live test mail dispatched to ${smtpConfig.adminEmail}. (Message ID: ${info.messageId})`
        });

    } catch (err) {
        console.error('SMTP Connection Test Error:', err);
        return res.status(500).json({
            success: false,
            error: err.message || 'Failed to connect to SMTP server. Check host, port, or password.'
        });
    }
});

// 1b. Save SMTP/IMAP Settings & Template Toggles (persists to local JSON file on server)
router.post('/admin/save-smtp', (req, res) => {
    try {
        const { smtp, fallbackSmtp, imap, enabledTemplates } = req.body;
        const data = {};
        if (smtp) data.smtp = smtp;
        if (fallbackSmtp) data.fallbackSmtp = fallbackSmtp;
        if (imap) data.imap = imap;
        if (enabledTemplates) data.enabledTemplates = enabledTemplates;

        const success = writeLocalConfig(data);
        if (success) {
            console.log('[Email Config] Settings & Template toggles saved to', CONFIG_FILE);
            return res.json({ success: true, message: 'Email settings saved to server.' });
        }
        return res.status(500).json({ success: false, error: 'Failed to write config file.' });
    } catch (err) {
        console.error('Save SMTP Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Test Inbound IMAP Connection Socket
router.post('/admin/test-imap', async (req, res) => {
    try {
        const imapConfig = {
            host: req.body.host || 'imap.hostinger.com',
            port: parseInt(req.body.port || '993', 10),
            encryption: req.body.encryption || 'ssl',
            username: req.body.username || '',
            password: req.body.password || ''
        };

        await assertPublicNetworkTarget(imapConfig.host);
        const result = await verifyImapConnection(imapConfig);
        return res.json({ success: true, message: `IMAP Socket Verified! Connected to ${imapConfig.host}:${imapConfig.port}` });
    } catch (err) {
        console.error('IMAP Test Error:', err);
        return res.status(500).json({ success: false, error: err.message || 'IMAP connection failed.' });
    }
});

// 3. Unified Dynamic Email Dispatcher
router.post('/send-email', async (req, res) => {
    const db = req.app.get('db');
    const { to, templateType, customSubject, customBody, vars } = req.body;

    if (!to) {
        return res.status(400).json({ success: false, error: 'Recipient email address (to) is required.' });
    }

    // Process dispatch asynchronously in background
    (async () => {
        try {
            const config = await getEmailConfig(db);
            
            // Check Template On/Off Toggle
            if (templateType && config.enabledTemplates && config.enabledTemplates[templateType] === false) {
                console.log(`[Email Skipped] Template '${templateType}' is disabled in Admin settings.`);
                await logOutboundEmail(db, {
                    to,
                    subject: customSubject || `Notification (${templateType})`,
                    templateType: templateType || 'custom',
                    status: 'SKIPPED',
                    error: 'Template disabled in System Settings'
                });
                return;
            }

            const rendered = renderEmailTemplate(templateType || 'default', { ...vars, subject: customSubject, body: customBody }, customTemplatesStore);

            const mailOptions = {
                from: `"${config.smtp.senderName}" <${config.smtp.username}>`,
                replyTo: config.smtp.replyTo || config.smtp.username,
                to,
                subject: customSubject || rendered.subject,
                html: customBody ? `<div style="font-family: Arial; padding: 20px;">${customBody}</div>` : rendered.html
            };

            const result = await dispatchMailWithFallback(config, mailOptions);
            await logOutboundEmail(db, {
                to,
                subject: mailOptions.subject,
                templateType: templateType || 'custom',
                status: 'SENT',
                messageId: result.messageId,
                transport: result.transport
            });
        } catch (err) {
            console.error('Send Email Error:', err);
            await logOutboundEmail(db, {
                to,
                subject: customSubject || 'Notification',
                templateType: templateType || 'custom',
                status: 'FAILED',
                error: err.message
            });
        }
    })();

    return res.json({ success: true, message: 'Email queued for background dispatch.' });
});

// 4. Dedicated PDF Receipt & Tax Invoice Email Dispatcher
router.post('/send-invoice-email', async (req, res) => {
    const db = req.app.get('db');
    const { customerEmail, customerName, invoiceNumber, amount, planName, gstin, pdfBase64 } = req.body;

    // Fast HTTP response (Non-blocking async execution)
    res.json({ success: true, message: 'Tax invoice email queued for instant delivery.' });

    (async () => {
        try {
            const config = await getEmailConfig(db);
            
            // Check Tax Invoice On/Off Toggle
            if (config.enabledTemplates && config.enabledTemplates.tax_invoice === false) {
                console.log('[Email Skipped] tax_invoice template is disabled in Admin settings.');
                return;
            }

            if (!config.smtp.username || !config.smtp.password) return;

            const recipient = customerEmail || config.smtp.adminEmail;
            const rendered = renderEmailTemplate('tax_invoice', {
                candidate_name: customerName,
                invoice_number: invoiceNumber,
                amount: amount,
                plan_name: planName,
                gstin: gstin,
                site_url: `${process.env.PROTOCOL || 'https'}://${process.env.WEBSITE_NAME || 'airesume.projectdemo.guru'}`,
                support_email: config.smtp.replyTo || config.smtp.username
            }, customTemplatesStore);

            const mailOptions = {
                from: `"${config.smtp.senderName}" <${config.smtp.username}>`,
                replyTo: config.smtp.replyTo || config.smtp.username,
                to: recipient,
                subject: rendered.subject,
                html: rendered.html,
                attachments: pdfBase64 ? [
                    {
                        filename: `Invoice_${invoiceNumber || 'Receipt'}.pdf`,
                        content: pdfBase64.replace(/^data:application\/pdf;base64,/, ''),
                        encoding: 'base64'
                    }
                ] : []
            };

            const result = await dispatchMailWithFallback(config, mailOptions);

            await logOutboundEmail(db, {
                to: recipient,
                subject: rendered.subject,
                templateType: 'tax_invoice',
                status: 'SENT',
                messageId: result.messageId,
                transport: result.transport
            });

            // Notify admin email if configured
            if (config.smtp.adminEmail && config.smtp.adminEmail !== recipient) {
                const adminRendered = renderEmailTemplate('admin_alert', {
                    candidate_name: customerName,
                    customer_email: recipient,
                    invoice_number: invoiceNumber,
                    amount: amount,
                }, customTemplatesStore);

                dispatchMailWithFallback(config, {
                    from: `"${config.smtp.senderName}" <${config.smtp.username}>`,
                    to: config.smtp.adminEmail,
                    subject: adminRendered.subject,
                    html: adminRendered.html
                }).catch(e => console.error('Admin alert failed:', e.message));
            }

        } catch (err) {
            console.error('Invoice Email Dispatch Error:', err);
            await logOutboundEmail(db, {
                to: customerEmail || 'Customer',
                subject: `Tax Invoice #${invoiceNumber}`,
                templateType: 'tax_invoice',
                status: 'FAILED',
                error: err.message
            });
        }
    })();
});

// 5. Outbox Audit Logs Endpoint
router.get('/logs', async (req, res) => {
    const db = req.app.get('db');
    if (db) {
        try {
            const snapshot = await db.collection('email_logs').orderBy('sentAt', 'desc').limit(100).get();
            const dbLogs = [];
            snapshot.forEach(doc => dbLogs.push(doc.data()));
            if (dbLogs.length > 0) {
                return res.json({ success: true, logs: dbLogs });
            }
        } catch (e) {
            console.error('Error fetching logs from DB:', e.message);
        }
    }
    return res.json({ success: true, logs: emailLogsStore });
});

// 6. Resend Dispatched Email
router.post('/resend', async (req, res) => {
    const db = req.app.get('db');
    const { logId, id } = req.body;
    const searchId = logId || id;

    if (!searchId) {
        return res.status(400).json({ success: false, error: 'logId is required.' });
    }

    // Tier 1: Search in-memory store
    let targetLog = emailLogsStore.find(l => l.id === searchId || l.messageId === searchId);

    // Tier 2: Fallback query to Firestore email_logs if not found in memory
    if (!targetLog && db) {
        try {
            // Direct document lookup by ID
            const docSnap = await db.collection('email_logs').doc(searchId).get();
            if (docSnap.exists) {
                targetLog = docSnap.data();
            } else {
                // Query by 'id' field
                const querySnap = await db.collection('email_logs').where('id', '==', searchId).limit(1).get();
                if (!querySnap.empty) {
                    targetLog = querySnap.docs[0].data();
                } else {
                    // Query by 'messageId' field
                    const msgSnap = await db.collection('email_logs').where('messageId', '==', searchId).limit(1).get();
                    if (!msgSnap.empty) {
                        targetLog = msgSnap.docs[0].data();
                    }
                }
            }

            // Cache retrieved log into memory store for fast subsequent access
            if (targetLog) {
                emailLogsStore.unshift(targetLog);
            }
        } catch (e) {
            console.warn('[Resend Email] Firestore log lookup notice:', e.message);
        }
    }

    if (!targetLog) {
        return res.status(404).json({ success: false, error: `Email log entry '${searchId}' not found.` });
    }

    try {
        const config = await getEmailConfig(db);
        const rendered = targetLog.html
            ? { subject: targetLog.subject, html: targetLog.html }
            : renderEmailTemplate(targetLog.templateType, { candidate_name: targetLog.recipient }, customTemplatesStore);

        const mailOptions = {
            from: `"${config.smtp.senderName}" <${config.smtp.username}>`,
            to: targetLog.recipient,
            subject: targetLog.subject || rendered.subject,
            html: rendered.html
        };

        const result = await dispatchMailWithFallback(config, mailOptions);
        await logOutboundEmail(db, {
            to: targetLog.recipient,
            subject: `[RESENT] ${targetLog.subject}`,
            templateType: targetLog.templateType,
            status: 'SENT',
            html: rendered.html,
            messageId: result.messageId,
            transport: result.transport
        });

        return res.json({ success: true, message: `Email resent to ${targetLog.recipient}!` });

    } catch (err) {
        console.error('Resend Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 7. Dynamic Templates API (Get & Save Custom Templates)
router.get('/templates', (req, res) => {
    return res.json({ success: true, templates: customTemplatesStore });
});

router.post('/templates', async (req, res) => {
    const db = req.app.get('db');
    const { templateType, subject, html } = req.body;

    if (!templateType || !html) {
        return res.status(400).json({ success: false, error: 'templateType and html content are required.' });
    }

    customTemplatesStore[templateType] = { subject, html, updatedAt: new Date().toISOString() };

    if (db) {
        try {
            await db.collection('settings').doc('email_templates').set(customTemplatesStore, { merge: true });
        } catch (e) {
            console.error('Failed to save templates in DB:', e.message);
        }
    }

    return res.json({ success: true, message: `Template "${templateType}" updated successfully!` });
});

async function dispatchNotification(db, { to, templateType, vars = {}, customSubject, customBody }) {
    if (!to) return { success: false, error: 'Recipient address required' };
    try {
        const config = await getEmailConfig(db);
        
        // Check On/Off toggle
        if (templateType && config.enabledTemplates && config.enabledTemplates[templateType] === false) {
            console.log(`[Email Skipped] Template '${templateType}' is disabled in Admin settings.`);
            await logOutboundEmail(db, {
                to,
                subject: customSubject || `Notification (${templateType})`,
                templateType: templateType || 'custom',
                status: 'SKIPPED',
                error: 'Template disabled in System Settings'
            });
            return { success: true, skipped: true };
        }

        const rendered = renderEmailTemplate(templateType || 'default', { ...vars, subject: customSubject, body: customBody }, customTemplatesStore);

        const mailOptions = {
            from: `"${config.smtp.senderName}" <${config.smtp.username}>`,
            replyTo: config.smtp.replyTo || config.smtp.username,
            to,
            subject: customSubject || rendered.subject,
            html: customBody ? `<div style="font-family: Arial; padding: 20px;">${customBody}</div>` : rendered.html
        };

        const result = await dispatchMailWithFallback(config, mailOptions);
        await logOutboundEmail(db, {
            to,
            subject: mailOptions.subject,
            templateType: templateType || 'custom',
            status: 'SENT',
            messageId: result.messageId,
            transport: result.transport
        });
        return { success: true, result };
    } catch (err) {
        console.error(`[Notification Error] Template '${templateType}' to '${to}' failed:`, err.message);
        await logOutboundEmail(db, {
            to,
            subject: customSubject || `Notification (${templateType})`,
            templateType: templateType || 'custom',
            status: 'FAILED',
            error: err.message
        });
        return { success: false, error: err.message };
    }
}

router.dispatchNotification = dispatchNotification;

module.exports = router;
module.exports.dispatchNotification = dispatchNotification;
