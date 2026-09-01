const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const tls = require('tls');
const dnsPromises = require('dns').promises;
const net = require('net');
const crypto = require('crypto');
const { assertPublicNetworkTarget } = require('../security/network');
const { enterpriseConsoleUrl, resolvePublicAppOrigin, sanitizeAbsoluteHttpUrl, assertNoForbiddenEmailHost } = require('../services/publicAppUrl');
const { requirePermission, requireRecentAdminAuthentication } = require('../security/auth');
const { recordAdminAuditLog } = require('../security/adminAudit');
const { getPool } = require('../database/mysql');
const { createEncryptionProvider, isEncryptedEnvelope } = require('../enterprise/encryptionProvider');

const EMAIL_SETTING_CATEGORY = 'email_runtime';

function parseStoredJson(value, fallback = {}) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { throw Object.assign(new Error('Stored email configuration is corrupt.'), { code: 'EMAIL_CONFIGURATION_CORRUPT', status: 503 }); }
}

function defaultEmailConfig() {
    return {
        smtp: {
            host: 'smtp.hostinger.com', port: 465, encryption: 'ssl', username: '', password: '',
            senderName: 'ResumePilot AI', replyTo: '', adminEmail: '', authStrategy: 'PLAIN',
        },
        fallbackSmtp: {
            enabled: false, host: 'smtp.gmail.com', port: 587, encryption: 'tls', username: '', password: '',
        },
        imap: {
            enabled: false, host: 'imap.hostinger.com', port: 993, encryption: 'ssl', username: '', password: '', autoSync: false,
        },
        enabledTemplates: {
            tax_invoice: true, welcome: true, password_reset: true, email_verification: true,
            payment_failed: true, subscription_renewal: true, ai_resume_ready: true,
            ai_cover_letter_ready: true, portfolio_published: true, job_application_received: true,
            job_status_update: true, job_posted_employer: true, security_alert: true,
            account_created_admin: true, password_changed_confirm: true, refund_processed: true,
            subscription_cancelled: true, admin_system_alert: true, broadcast_announcement: true, default: true,
        },
        customTemplates: {},
        revision: 0,
    };
}

function settingsEncryptionProvider({ required = false } = {}) {
    const provider = createEncryptionProvider(process.env);
    if (!provider && required) {
        throw Object.assign(
            new Error('Server-side encryption is required before mail credentials can be persisted.'),
            { code: 'EMAIL_ENCRYPTION_UNAVAILABLE', status: 503 }
        );
    }
    return provider;
}

function decryptStoredCredential(value, provider) {
    if (value === null || value === undefined || value === '') return '';
    if (!isEncryptedEnvelope(value)) {
        throw Object.assign(new Error('A persisted mail credential is not encrypted.'), { code: 'EMAIL_CREDENTIAL_MIGRATION_REQUIRED', status: 503 });
    }
    if (!provider) {
        throw Object.assign(new Error('The mail credential encryption key is unavailable.'), { code: 'EMAIL_ENCRYPTION_UNAVAILABLE', status: 503 });
    }
    const decrypted = provider.decryptValue(value);
    if (typeof decrypted !== 'string') {
        throw Object.assign(new Error('A persisted mail credential has an invalid type.'), { code: 'EMAIL_CONFIGURATION_CORRUPT', status: 503 });
    }
    return decrypted;
}

function environmentCredentialPair(userKey, passwordKey, label) {
    const username = String(process.env[userKey] || '').trim();
    const password = String(process.env[passwordKey] || '');
    if (Boolean(username) !== Boolean(password.trim())) {
        throw Object.assign(new Error(`${label} deployment credentials are incomplete.`), { code: 'EMAIL_ENV_CREDENTIAL_INCOMPLETE', status: 503 });
    }
    return { username, password, configured: Boolean(username && password.trim()) };
}

// MariaDB is the sole runtime configuration owner. Deployment credentials may
// override a complete stored credential pair; incomplete pairs fail closed and
// are never combined across sources or instances.
async function getEmailConfig() {
    const [rows] = await getPool().query(
        'SELECT data, revision FROM system_settings WHERE category = ? LIMIT 1',
        [EMAIL_SETTING_CATEGORY]
    );
    const defaults = defaultEmailConfig();
    const stored = rows[0] ? parseStoredJson(rows[0].data, {}) : {};
    const provider = settingsEncryptionProvider();
    const section = name => {
        const value = stored[name] && typeof stored[name] === 'object' && !Array.isArray(stored[name]) ? stored[name] : {};
        return { ...defaults[name], ...value, password: decryptStoredCredential(value.password, provider) };
    };
    const config = {
        smtp: section('smtp'),
        fallbackSmtp: section('fallbackSmtp'),
        imap: section('imap'),
        enabledTemplates: { ...defaults.enabledTemplates, ...(stored.enabledTemplates || {}) },
        customTemplates: stored.customTemplates && typeof stored.customTemplates === 'object' ? stored.customTemplates : {},
        revision: Number(rows[0]?.revision || 0),
    };

    const smtpEnvironment = environmentCredentialPair('SMTP_USER', 'SMTP_PASS', 'Primary SMTP');
    if (smtpEnvironment.configured) {
        config.smtp = {
            ...config.smtp,
            host: process.env.SMTP_HOST || config.smtp.host,
            port: Number(process.env.SMTP_PORT || config.smtp.port),
            encryption: process.env.SMTP_ENCRYPTION || config.smtp.encryption,
            username: smtpEnvironment.username,
            password: smtpEnvironment.password,
            senderName: process.env.SMTP_SENDER_NAME || config.smtp.senderName,
            replyTo: process.env.SMTP_REPLY_TO || config.smtp.replyTo,
            adminEmail: process.env.ADMIN_EMAIL || config.smtp.adminEmail,
        };
    }
    const fallbackEnvironment = environmentCredentialPair('FALLBACK_SMTP_USER', 'FALLBACK_SMTP_PASS', 'Fallback SMTP');
    if (fallbackEnvironment.configured) {
        config.fallbackSmtp = {
            ...config.fallbackSmtp,
            enabled: String(process.env.FALLBACK_SMTP_ENABLED || 'true').toLowerCase() === 'true',
            host: process.env.FALLBACK_SMTP_HOST || config.fallbackSmtp.host,
            port: Number(process.env.FALLBACK_SMTP_PORT || config.fallbackSmtp.port),
            encryption: process.env.FALLBACK_SMTP_ENCRYPTION || config.fallbackSmtp.encryption,
            username: fallbackEnvironment.username,
            password: fallbackEnvironment.password,
        };
    }
    const imapEnvironment = environmentCredentialPair('IMAP_USER', 'IMAP_PASS', 'IMAP');
    if (imapEnvironment.configured) {
        config.imap = {
            ...config.imap,
            enabled: true,
            host: process.env.IMAP_HOST || config.imap.host,
            port: Number(process.env.IMAP_PORT || config.imap.port),
            encryption: process.env.IMAP_ENCRYPTION || config.imap.encryption,
            username: imapEnvironment.username,
            password: imapEnvironment.password,
        };
    }
    return config;
}

const MAIL_SECTION_FIELDS = Object.freeze({
    smtp: ['host', 'port', 'encryption', 'username', 'password', 'senderName', 'replyTo', 'adminEmail', 'authStrategy'],
    fallbackSmtp: ['enabled', 'host', 'port', 'encryption', 'username', 'password', 'senderEmail', 'senderName', 'adminEmail', 'maxFailures', 'cooldownMinutes'],
    imap: ['enabled', 'host', 'port', 'encryption', 'username', 'password', 'autoSync'],
});

function normalizedMailSection(section, input, localCurrent = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`Invalid ${section} settings.`);
    const output = {};
    const combined = { ...localCurrent, ...input };
    for (const field of MAIL_SECTION_FIELDS[section]) {
        if (field === 'password') continue;
        if (combined[field] !== undefined) output[field] = combined[field];
    }
    const host = String(output.host || '').trim();
    if (!host || host.length > 253 || (!net.isIP(host) && !/^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(host))) {
        throw new Error(`Invalid ${section} host.`);
    }
    output.host = host;
    const port = Number(output.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid ${section} port.`);
    output.port = port;
    const encryption = String(output.encryption || '').toLowerCase();
    const allowedEncryption = section === 'imap' ? new Set(['ssl']) : new Set(['ssl', 'tls', 'starttls']);
    if (!allowedEncryption.has(encryption)) throw new Error(`Encrypted ${section} transport is required.`);
    output.encryption = encryption;
    for (const field of ['username', 'senderEmail', 'replyTo', 'adminEmail']) {
        if (output[field] !== undefined) {
            output[field] = String(output[field]).replace(/\p{Cc}/gu, '').trim().slice(0, 320);
        }
    }
    if (output.senderName !== undefined) output.senderName = String(output.senderName).replace(/\p{Cc}/gu, ' ').trim().slice(0, 200);
    for (const field of ['enabled', 'autoSync']) {
        if (output[field] !== undefined) output[field] = output[field] === true;
    }
    if (output.authStrategy !== undefined) {
        const strategy = String(output.authStrategy).toUpperCase();
        if (!['PLAIN', 'LOGIN', 'OAUTH2', 'API_KEY'].includes(strategy)) throw new Error('Invalid SMTP authentication strategy.');
        output.authStrategy = strategy;
    }
    for (const [field, maximum] of [['maxFailures', 20], ['cooldownMinutes', 1440]]) {
        if (output[field] !== undefined) {
            const number = Number(output[field]);
            if (!Number.isInteger(number) || number < 1 || number > maximum) throw new Error(`Invalid ${field}.`);
            output[field] = number;
        }
    }
    const replacementPassword = String(input.password || '');
    const localPassword = String(localCurrent.password || '');
    if (replacementPassword.trim()) {
        output.password = replacementPassword.slice(0, 4096);
        output.passwordCleared = false;
    } else if (localPassword.trim()) output.password = localPassword;
    return output;
}

function normalizeTemplateToggles(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 100) throw new Error('Invalid email template settings.');
    const toggles = {};
    for (const [key, value] of Object.entries(input)) {
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(key) || typeof value !== 'boolean') throw new Error('Invalid email template setting.');
        toggles[key] = value;
    }
    return toggles;
}

function projectMailSection(section, value = {}) {
    const safe = {};
    for (const field of MAIL_SECTION_FIELDS[section]) {
        if (field !== 'password' && value[field] !== undefined) safe[field] = value[field];
    }
    return { ...safe, passwordConfigured: Boolean(String(value.password || '').trim()) };
}

function validateExpectedEmailRevision(value) {
    const revision = Number(value);
    if (!Number.isInteger(revision) || revision < 0) {
        throw Object.assign(new Error('Expected email configuration revision is required.'), { code: 'EMAIL_SETTINGS_REVISION_REQUIRED', status: 428 });
    }
    return revision;
}

function emailAdminAuditValues(req, action, metadata = {}) {
    return [
        crypto.randomUUID(),
        req.user?.uid || 'unknown',
        req.user?.email || null,
        String(req.user?.claims?.role || 'ADMIN').toUpperCase(),
        action,
        JSON.stringify(metadata),
        resRequestId(req),
    ];
}

function resRequestId(req) {
    return req.res?.locals?.requestId || null;
}

async function insertEmailAdminAudit(connection, req, action, metadata = {}) {
    await connection.query(
        `INSERT INTO admin_audit_logs
           (id, actor_uid, actor_email, actor_role, action, category, severity, outcome,
            method, pathname, status_code, resource_type, resource_id, metadata, request_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'communications.email', 'HIGH', 'SUCCESS',
                 'POST', ?, 200, 'EMAIL_CONFIGURATION', ?, ?, ?, NOW())`,
        [
            ...emailAdminAuditValues(req, action, metadata).slice(0, 5),
            req.originalUrl || req.path,
            EMAIL_SETTING_CATEGORY,
            JSON.stringify(metadata),
            resRequestId(req),
        ]
    );
}

function assertSafeCustomTemplate({ templateType, subject, html }) {
    const type = String(templateType || '').trim();
    const cleanSubject = String(subject || '').replace(/[\r\n\p{Cc}]/gu, ' ').trim().slice(0, 255);
    const body = String(html || '');
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(type) || !body || Buffer.byteLength(body, 'utf8') > 250_000) {
        throw Object.assign(new Error('Template type and HTML are invalid.'), { code: 'INVALID_EMAIL_TEMPLATE', status: 400 });
    }
    if (/<\s*(script|iframe|object|embed|form|base|meta)\b|\son[a-z]+\s*=|javascript\s*:|data\s*:\s*text\/html/i.test(body)) {
        throw Object.assign(new Error('Template HTML contains an unsafe active-content construct.'), { code: 'UNSAFE_EMAIL_TEMPLATE', status: 400 });
    }
    return { templateType: type, subject: cleanSubject, html: body };
}

function storedMailSection(section, input, currentRaw, currentRuntime, clearRequested, provider) {
    const normalized = normalizedMailSection(section, input, currentRuntime);
    const replacement = String(input?.password || '');
    delete normalized.password;
    delete normalized.passwordCleared;
    if (clearRequested) {
        // Deliberately omit the persisted credential.
    } else if (replacement.trim()) {
        normalized.password = provider.encryptValue(replacement.slice(0, 4096));
    } else if (currentRaw?.password) {
        normalized.password = currentRaw.password;
    }
    return normalized;
}

// Verify IMAP Connection via direct Socket
function verifyImapConnection(imapConfig, resolvedAddress = null) {
    return new Promise((resolve, reject) => {
        const isSsl = imapConfig.encryption === 'ssl' || imapConfig.port === 993;
        const host = imapConfig.host || 'imap.hostinger.com';
        const connectHost = resolvedAddress || host;
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
            socket = tls.connect(port, connectHost, { rejectUnauthorized: true, servername: host }, onConnect);
        } else {
            socket = net.connect(port, connectHost, onConnect);
        }

        socket.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

function escapeEmailHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}
function safeEmailUrl(value, fallback = '#') {
    const url = sanitizeAbsoluteHttpUrl(value);
    return url ? escapeEmailHtml(url) : fallback;
}

function hrefAttr(value, fallback = '#') {
    return safeEmailUrl(value, fallback);
}

function publicSiteOrigin() {
    try {
        return resolvePublicAppOrigin();
    } catch (error) {
        console.error('[Email] Public application origin is not configured:', error.message);
        throw error;
    }
}

function humanizeName(raw, fallback = 'Team Member') {
    if (!raw || typeof raw !== 'string') return fallback;
    let name = raw.trim();
    if (name.includes('@')) {
        name = name.split('@')[0];
    }
    name = name.replace(/\d+$/, '');
    name = name.replace(/[._\-+]/g, ' ').trim();
    if (!name || name.toLowerCase() === 'user' || name.toLowerCase() === 'candidate') return fallback;
    return name.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function humanizeRole(role, fallback = 'Enterprise Team Member') {
    if (!role || typeof role !== 'string') return fallback;
    const r = role.trim().toUpperCase();
    const map = {
        'TENANT_OWNER': 'Workspace Owner & Administrator',
        'OWNER': 'Workspace Owner & Administrator',
        'TENANT_ADMIN': 'Enterprise Administrator',
        'ADMIN': 'Enterprise Administrator',
        'TENANT_MEMBER': 'Enterprise Team Member',
        'MEMBER': 'Enterprise Team Member',
        'TENANT_BILLING': 'Billing & Financial Manager',
        'BILLING': 'Billing & Financial Manager',
        'TENANT_SECURITY': 'Security & Compliance Officer',
        'SECURITY': 'Security & Compliance Officer',
        'TENANT_AUDITOR': 'Compliance Auditor (Read-Only)',
        'AUDITOR': 'Compliance Auditor (Read-Only)'
    };
    if (map[r]) return map[r];
    if (r.startsWith('CUSTOM_')) {
        return humanizeName(r.replace(/^CUSTOM_/, '')) + ' (Custom Role)';
    }
    return humanizeName(r, fallback);
}

function humanizeOrgName(name, fallback = 'your enterprise workspace') {
    if (!name || typeof name !== 'string' || name === 'an enterprise organization') return fallback;
    return name.trim();
}

function formatInlineMarkdown(text) {
    if (!text) return '';
    let escaped = escapeEmailHtml(text);
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
    return escaped;
}

/**
 * Universal Variable Replacement Engine
 * Replaces {{key}} and {key} tokens while cleanly eliminating unparsed tags.
 */
function replaceEmailVariables(templateText, vars = {}) {
    if (!templateText || typeof templateText !== 'string') return '';
    let result = templateText;
    const entries = Object.entries(vars || {});
    for (const [key, val] of entries) {
        if (val !== undefined && val !== null) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}|\\{${key}\\}`, 'gi');
            result = result.replace(regex, String(val));
        }
    }
    // Clean up any remaining unresolved shortcodes gracefully
    return result.replace(/\{\{[a-z0-9_]+\}\}/gi, '').replace(/\{[a-z0-9_]+\}/gi, '');
}

function htmlToPlainText(html, actionUrl = '') {
    if (!html) return '';
    let text = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
        .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n=== $1 ===\n\n')
        .replace(/<li[^>]*>(.*?)<\/li>/gi, '\n• $1')
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n\n$1\n')
        .replace(/<br\s*[/]?>/gi, '\n')
        .replace(/<hr\s*[/]?>/gi, '\n----------------------------------------\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();

    if (actionUrl && !text.includes(actionUrl)) {
        text += `\n\nDirect Link: ${actionUrl}`;
    }
    return text;
}

// Shared Header/Footer Layout Wrapper for 10/10 Aesthetic Consistency & Anti-Spam
function buildEmailWrapper(title, badgeText, contentHtml, brandName = 'ResumePilot AI', siteUrl = '', supportEmail = '') {
    const preheader = (contentHtml || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 150);

    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${escapeEmailHtml(title || brandName)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
    <!-- Hidden Preheader Preview for Inboxes -->
    <div style="display: none; max-height: 0px; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #090d16; opacity: 0;">
        ${escapeEmailHtml(preheader)}
    </div>

    <div style="background-color: #090d16; padding: 40px 15px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);">
            <!-- Top Gradient Brand Accent -->
            <div style="height: 6px; background: linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);"></div>
            
            <!-- Dark Brand Header -->
            <div style="background-color: #0f172a; padding: 32px 30px; text-align: center;">
                <div style="display: inline-block; padding: 6px 14px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 9999px; margin-bottom: 12px;">
                    <span style="font-size: 11px; font-weight: 700; color: #818cf8; letter-spacing: 0.5px; text-transform: uppercase;">${badgeText || brandName}</span>
                </div>
                <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">${escapeEmailHtml(brandName)}</h1>
            </div>

            <!-- Main Body Content -->
            <div style="padding: 36px 32px; background: #ffffff;">
                ${contentHtml}
            </div>

            <!-- Footer -->
            <div style="background-color: #f8fafc; padding: 24px 32px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #64748b;">
                <p style="margin: 0 0 8px 0; font-weight: 600; color: #475569;">© ${new Date().getFullYear()} ${escapeEmailHtml(brandName)}. All rights reserved.</p>
                <p style="margin: 0;">Need assistance? Contact our team at <a href="mailto:${escapeEmailHtml(supportEmail)}" style="color: #4f46e5; text-decoration: none; font-weight: 600;">${escapeEmailHtml(supportEmail)}</a> or visit <a href="${hrefAttr(siteUrl)}" style="color: #4f46e5; text-decoration: none; font-weight: 600;">${escapeEmailHtml(siteUrl)}</a></p>
                <p style="margin: 8px 0 0 0; font-size: 11px; color: #94a3b8;">This is an authentic operational communication sent securely from ResumePilot AI.</p>
            </div>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Converts custom text / shortcode bodies into high-fidelity HTML email blocks.
 */
function formatCustomEmailBody(customBody, vars = {}, brandName = 'ResumePilot AI', siteUrl = '', supportEmail = '') {
    const rawReplaced = replaceEmailVariables(customBody, vars);
    
    // Split into paragraphs / lines
    const paragraphs = rawReplaced
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(Boolean);

    let contentHtml = '';
    for (const p of paragraphs) {
        // If line is an action URL, contains http URL, or matches action_url
        const urlMatch = p.match(/https?:\/\/[^\s<>"')]+/i);
        const hasUrl = urlMatch || (vars.action_url && p.includes(vars.action_url)) || p.startsWith('http');
        
        if (hasUrl) {
            const rawTarget = sanitizeAbsoluteHttpUrl(urlMatch ? urlMatch[0] : (vars.action_url || `${siteUrl}/enterprise`));
            const targetUrl = hrefAttr(rawTarget);
            let btnLabel = 'Open Enterprise Console &rarr;';
            const lower = ((customBody || '') + ' ' + (p || '')).toLowerCase();
            if (lower.includes('invit') || lower.includes('join') || lower.includes('onboard') || lower.includes('welcome')) {
                btnLabel = 'Accept Your Invitation &rarr;';
            } else if (lower.includes('workspace') || lower.includes('team') || lower.includes('squad')) {
                btnLabel = 'Open Team Workspace &rarr;';
            } else if (lower.includes('audit') || lower.includes('security') || lower.includes('break-glass') || lower.includes('diagnostic')) {
                btnLabel = 'Review Security Audit Log &rarr;';
            } else if (lower.includes('quota') || lower.includes('token') || lower.includes('usage') || lower.includes('capacity')) {
                btnLabel = 'Inspect Token Usage &rarr;';
            } else if (lower.includes('role') || lower.includes('permission') || lower.includes('access')) {
                btnLabel = 'Review Updated Permissions &rarr;';
            }

            contentHtml += `
                <div style="text-align: center; margin: 32px 0;">
                    <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 15px 36px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 10px 20px -5px rgba(79, 70, 229, 0.4); letter-spacing: 0.3px;">
                        ${btnLabel}
                    </a>
                </div>
                <p style="font-size: 12px; color: #94a3b8; text-align: center; word-break: break-all; margin: 0 0 16px;">If the button does not work, copy this link:<br/><a href="${targetUrl}" style="color: #4f46e5;">${escapeEmailHtml(rawTarget)}</a></p>
            `;
        } else if (p.toLowerCase().includes('assigned access level:') || p.toLowerCase().includes('assigned role:') || p.toLowerCase().includes('new access role:') || p.toLowerCase().includes('your assigned role:') || p.toLowerCase().includes('your updated role:')) {
            contentHtml += `
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; border-radius: 8px; padding: 16px 20px; margin: 20px 0; font-size: 14px; color: #1e293b; font-weight: 600;">
                    ${formatInlineMarkdown(p)}
                </div>
            `;
        } else if (p.startsWith('Hello ') || p.startsWith('Hi ') || p.startsWith('Dear ') || p.startsWith('ATTENTION:')) {
            contentHtml += `<h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0; margin-bottom: 16px;">${formatInlineMarkdown(p)}</h2>`;
        } else if (p.startsWith('•') || p.startsWith('-') || p.startsWith('* ')) {
            const items = p.split('\n').map(item => item.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
            contentHtml += `
                <ul style="margin: 16px 0; padding-left: 24px; font-size: 14px; color: #475569; line-height: 1.75;">
                    ${items.map(item => `<li>${formatInlineMarkdown(item)}</li>`).join('')}
                </ul>
            `;
        } else if (p.toLowerCase().startsWith('note:') || p.toLowerCase().startsWith('*note:')) {
            contentHtml += `
                <div style="background: #f1f5f9; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                    ${formatInlineMarkdown(p)}
                </div>
            `;
        } else {
            contentHtml += `<p style="font-size: 14px; color: #475569; line-height: 1.65; margin: 14px 0;">${formatInlineMarkdown(p).replace(/\n/g, '<br/>')}</p>`;
        }
    }

    return buildEmailWrapper('Enterprise Notification', 'ENTERPRISE SYSTEM', contentHtml, brandName, siteUrl, supportEmail);
}

// Enterprise Dynamic HTML Template Generator
function renderEmailTemplate(templateType, vars = {}, customHtmlMap = {}) {
    const rawVars = vars || {};
    const origin = sanitizeAbsoluteHttpUrl(rawVars.site_url) || publicSiteOrigin();
    const rawActionUrl = sanitizeAbsoluteHttpUrl(rawVars.action_url) || `${origin}/enterprise`;
    const rawResetLink = sanitizeAbsoluteHttpUrl(rawVars.reset_link) || `${origin}/login`;
    const rawRetryUrl = sanitizeAbsoluteHttpUrl(rawVars.retry_url) || `${origin}/pricing`;
    const rawVerificationLink = sanitizeAbsoluteHttpUrl(rawVars.verification_link);
    vars = Object.fromEntries(Object.entries(rawVars).map(([key, value]) => [
        key,
        ['site_url', 'reset_link', 'retry_url', 'action_url', 'verification_link'].includes(key)
            ? hrefAttr(value)
            : escapeEmailHtml(value)
    ]));
    const brandName = vars.brand_name || escapeEmailHtml(process.env.SMTP_SENDER_NAME || 'ResumePilot AI');
    const siteUrl = origin;
    const supportEmail = rawVars.support_email || process.env.SMTP_REPLY_TO || `support@${new URL(origin).hostname}`;
    vars.action_url = hrefAttr(rawActionUrl);
    vars.reset_link = hrefAttr(rawResetLink);
    vars.retry_url = hrefAttr(rawRetryUrl);
    if (rawVerificationLink) vars.verification_link = hrefAttr(rawVerificationLink);

    const candidateName = vars.candidate_name || vars.customer_name || 'Valued Candidate';
    const invoiceNo = vars.invoice_number || vars.transaction_id || 'Unavailable';
    const creditNoteNo = vars.credit_note_number || '';
    const amount = vars.amount || vars.formatted_total || 'Unavailable';
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
            '{{ats_score}}': vars.ats_score || 'Not measured',
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
            subject = `Welcome to ${brandName} — Get Started with Your Resume`;
            bodyHtml = buildEmailWrapper(
                `Welcome aboard, ${candidateName}!`,
                'WELCOME ABOARD',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Welcome, ${candidateName}!</h2>
                <p style="font-size: 15px; color: #475569; line-height: 1.6;">You're now ready to craft high-scoring, ATS-optimized resumes that get noticed by top tech & corporate recruiters.</p>
                
                <div style="background: #eef2ff; border-left: 4px solid #4f46e5; padding: 18px; border-radius: 8px; margin: 24px 0;">
                    <p style="margin: 0 0 10px 0; font-weight: 700; color: #312e81; font-size: 14px;">Quick Start Guide:</p>
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
            subject = `Reset Your ${brandName} Password`;
            bodyHtml = buildEmailWrapper(
                'Password Reset Request',
                'SECURITY NOTIFICATION',
                `
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                    <h3 style="color: #991b1b; margin: 0 0 6px 0; font-size: 16px; font-weight: 800;">Password Reset Requested</h3>
                    <p style="color: #7f1d1d; margin: 0; font-size: 13px; line-height: 1.5;">We received a request to reset your password for your <strong>${brandName}</strong> account. Click below to specify a new password.</p>
                </div>

                <div style="text-align: center; margin: 28px 0;">
                    <a href="${vars.reset_link}" target="_blank" rel="noopener noreferrer" style="background-color: #dc2626; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 10px 20px -5px rgba(220,38,38,0.3);">Reset Password Now &rarr;</a>
                </div>
                <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 16px; text-align: center; word-break: break-all;">Or copy and paste this link into your browser:<br/><a href="${vars.reset_link}" style="color: #dc2626;">${escapeEmailHtml(rawResetLink)}</a></p>
                <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 16px;">If you did not request this change, please secure your email account immediately. This link expires in 30 minutes.</p>`
            );
            break;

        case 'email_verification':
            subject = vars.verification_link
                ? `Confirm Your Email Address — ${brandName}`
                : `${vars.otp_code || '849204'} is your ${brandName} Verification Code`;
            bodyHtml = buildEmailWrapper(
                'Confirm Your Email Address',
                'ACCOUNT SECURITY',
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
            subject = `Payment Action Required — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Payment Processing Issue',
                'ACTION REQUIRED',
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
                'RENEWAL REMINDER',
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
            subject = vars.ats_score && vars.ats_score !== 'Not measured'
                ? `Your AI Resume is Ready (ATS Score: ${vars.ats_score}/100) — ${brandName}`
                : `Your AI Resume is Ready — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'AI Resume Optimization Complete',
                'AI COMPLETED',
                `
                <div style="text-align: center;">
                    <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Great news, ${candidateName}!</h2>
                    <p style="font-size: 14px; color: #475569;">Our AI engine has analyzed and generated your optimized resume.</p>

                    <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 16px; padding: 24px; color: #ffffff; margin: 24px 0; box-shadow: 0 10px 25px -5px rgba(79,70,229,0.3);">
                        <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8; font-weight: 700;">ATS Compatibility Score</span>
                        <div style="font-size: 48px; font-weight: 900; margin: 8px 0; font-family: monospace;">${vars.ats_score && vars.ats_score !== 'Not measured' ? `${vars.ats_score}<span style="font-size: 24px;">/100</span>` : 'Not measured'}</div>
                        <p style="margin: 0; font-size: 13px; opacity: 0.9;">Open your dashboard to review the generated resume.</p>
                    </div>

                    <a href="${siteUrl}/dashboard" style="background-color: #15803d; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 10px 20px -5px rgba(21,128,61,0.3);">View &amp; Download PDF &rarr;</a>
                </div>`
            );
            break;

        case 'job_application_received':
            subject = `New Applicant for ${vars.job_title || 'Position'} — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'New Job Application Received',
                'RECRUITER NOTIFICATION',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">New Applicant Alert</h2>
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
            subject = `Application Status Update: ${vars.application_status || 'Status Changed'} — ${vars.company_name || 'Employer'}`;
            bodyHtml = buildEmailWrapper(
                'Application Status Update',
                'STATUS UPDATE',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Hello ${candidateName},</h2>
                <p style="font-size: 14px; color: #475569;">Your job application status for <strong>${vars.job_title || 'Software Role'}</strong> at <strong>${vars.company_name || 'Company'}</strong> has been updated:</p>

                <div style="background: #eef2ff; border-left: 4px solid #4f46e5; padding: 20px; border-radius: 10px; text-align: center; margin: 24px 0;">
                    <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #4338ca; font-weight: 700;">New Status</span>
                    <div style="font-size: 20px; font-weight: 800; color: #1e1b4b; margin-top: 4px;">${vars.application_status || 'Shortlisted for Interview'}</div>
                </div>

                <div style="text-align: center; margin-top: 28px;">
                    <a href="${siteUrl}/jobs" style="background-color: #0f172a; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block;">Open Jobs Portal &rarr;</a>
                </div>`
            );
            break;

        case 'security_alert':
            subject = `Security Alert: New Login from ${vars.device_info || 'Device'} — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Security & Login Alert',
                'SECURITY ALERT',
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
            subject = `New User Registration: ${candidateName} — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'New User Account Registered',
                'ADMIN ALERT',
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
            subject = `Security Confirmation: Password Updated — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Password Successfully Updated',
                'SECURITY NOTICE',
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
            subject = `Refund Processed: #${invoiceNo} — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Refund Confirmation',
                'BILLING REFUND',
                `
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                    <h3 style="color: #166534; margin: 0 0 6px 0; font-size: 16px; font-weight: 800;">Refund Completed</h3>
                    <p style="color: #15803d; margin: 0; font-size: 13px; line-height: 1.5;">We have processed a refund of <strong>${amount}</strong> for Invoice #${invoiceNo}.</p>
                    ${creditNoteNo ? `<p style="color: #15803d; margin: 8px 0 0; font-size: 13px;">Credit note: <strong>${creditNoteNo}</strong></p>` : ''}
                </div>
                <p style="font-size: 14px; color: #475569; line-height: 1.6;">Your payment provider confirmed completion. The time before funds appear in the original payment source is controlled by the provider and the receiving bank.</p>`
            );
            break;

        case 'subscription_cancelled':
            subject = `Subscription Cancelled — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Subscription Cancellation Notice',
                'SUBSCRIPTION UPDATE',
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
            subject = `Your AI Cover Letter is Ready — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'AI Cover Letter Generated',
                'AI OUTPUT',
                `
                <div style="text-align: center;">
                    <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Cover Letter Generated</h2>
                    <p style="font-size: 14px; color: #475569;">Your customized cover letter for <strong>${vars.job_title || 'Target Job'}</strong> is now complete.</p>
                    <div style="text-align: center; margin: 28px 0;">
                        <a href="${siteUrl}/dashboard?tab=cover-letter" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block;">View Cover Letter &rarr;</a>
                    </div>
                </div>`
            );
            break;

        case 'portfolio_published':
            subject = `Your Live Website Portfolio is Online — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Portfolio Website Published',
                'PORTFOLIO LIVE',
                `
                <div style="text-align: center;">
                    <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Congratulations, ${candidateName}!</h2>
                    <p style="font-size: 14px; color: #475569;">Your web portfolio is now live and accessible to recruiters worldwide.</p>
                    <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; margin: 20px 0; font-family: monospace; font-weight: 700; color: #4f46e5;">
                        ${siteUrl}/portfolio/${vars.portfolio_slug || 'candidate'}
                    </div>
                    <a href="${siteUrl}/portfolio/${vars.portfolio_slug || 'candidate'}" style="background-color: #0f172a; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block;">Visit Live Portfolio &rarr;</a>
                </div>`
            );
            break;

        case 'job_posted_employer':
            subject = `Job Listing Published: ${vars.job_title || 'Position'} — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'Job Listing Published',
                'EMPLOYER ALERT',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Listing is Now Live</h2>
                <p style="font-size: 14px; color: #475569;">Your job post for <strong>${vars.job_title || 'Software Position'}</strong> at <strong>${vars.company_name || 'TechCorp'}</strong> is active and receiving applicants.</p>
                <div style="text-align: center; margin-top: 24px;">
                    <a href="${siteUrl}/jobs" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 13px; display: inline-block;">View Job Listing &rarr;</a>
                </div>`
            );
            break;

        case 'admin_system_alert':
            subject = `System Alert: ${vars.alert_title || 'Operational Notice'} — ${brandName}`;
            bodyHtml = buildEmailWrapper(
                'System Operational Alert',
                'SYSTEM ALERT',
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
            subject = vars.subject || `Special Update from ${brandName}`;
            bodyHtml = buildEmailWrapper(
                vars.title || 'Platform Update',
                'ANNOUNCEMENT',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">${vars.title || 'Special Announcement'}</h2>
                <div style="font-size: 14px; color: #475569; line-height: 1.6;">${vars.body_html || vars.body || 'Thank you for being a valued member of our platform.'}</div>
                <div style="text-align: center; margin-top: 28px;">
                    <a href="${siteUrl}" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block;">Explore What's New &rarr;</a>
                </div>`
            );
            break;

        case 'enterprise-invitation':
        case 'enterprise_invitation':
        case 'invitation':
            subject = vars.subject || `You're invited to join ${vars.organization_name || 'your enterprise workspace'} on ResumePilot Enterprise`;
            bodyHtml = buildEmailWrapper(
                'Enterprise Workspace Invitation',
                'ENTERPRISE INVITATION',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Hi ${candidateName},</h2>
                <p style="font-size: 14px; color: #475569; line-height: 1.6;">${vars.inviter_name || 'Your team administrator'} has invited you to join the <strong>${vars.organization_name || 'enterprise'}</strong> workspace on ResumePilot AI.</p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; border-radius: 8px; padding: 18px 20px; margin: 20px 0;">
                    <p style="margin: 0 0 6px; font-size: 14px; color: #1e293b; font-weight: 700;">Assigned Role: ${vars.role_title || 'Enterprise Team Member'}</p>
                    <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">You'll have access to collaborative resume builders, AI content optimization, team templates, and candidate evaluation tools.</p>
                </div>
                <div style="text-align: center; margin: 28px 0;">
                    <a href="${vars.action_url}" target="_blank" rel="noopener noreferrer" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 10px 20px -5px rgba(79,70,229,0.4);">Accept Your Invitation &rarr;</a>
                </div>
                <p style="font-size: 12px; color: #94a3b8; margin-top: 8px; text-align: center; word-break: break-all;">If the button does not work, copy this link:<br/><a href="${vars.action_url}" style="color: #4f46e5;">${escapeEmailHtml(rawActionUrl)}</a></p>
                <p style="font-size: 12px; color: #94a3b8; margin-top: 24px; text-align: center;">This invitation link remains active for ${vars.expires_in || '7 days'}. If you did not expect this invitation, you can safely ignore this email.</p>`
            );
            break;

        case 'enterprise_role_update':
        case 'role_update':
            subject = vars.subject || `Access Role Updated: ${vars.role_title || 'Updated Role'} — ${vars.organization_name || brandName}`;
            bodyHtml = buildEmailWrapper(
                'Access Level Update Notice',
                'ACCESS & IAM UPDATE',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Hi ${candidateName},</h2>
                <p style="font-size: 14px; color: #475569; line-height: 1.6;">Your workspace permissions for <strong>${vars.organization_name || 'your enterprise organization'}</strong> have been updated by ${vars.updater_name || 'an administrator'}.</p>
                <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-left: 4px solid #6366f1; border-radius: 8px; padding: 18px 20px; margin: 20px 0;">
                    <p style="margin: 0; font-size: 14px; color: #3730a3; font-weight: 700;">New Access Role: ${vars.role_title || 'Updated Role'}</p>
                </div>
                <div style="text-align: center; margin: 26px 0;">
                    <a href="${vars.action_url}" target="_blank" rel="noopener noreferrer" style="background-color: #4f46e5; color: #ffffff; padding: 13px 30px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 13px; display: inline-block; box-shadow: 0 10px 20px -5px rgba(79,70,229,0.4);">Open Enterprise Console &rarr;</a>
                </div>
                <p style="font-size: 12px; color: #94a3b8; margin-top: 8px; text-align: center; word-break: break-all;">If the button does not work, copy this link:<br/><a href="${vars.action_url}" style="color: #4f46e5;">${escapeEmailHtml(rawActionUrl)}</a></p>`
            );
            break;

        case 'enterprise_workspace_assignment':
        case 'workspace_assignment':
            subject = vars.subject || `Added to ${vars.workspace_name || 'Workspace'} — ${vars.organization_name || brandName}`;
            bodyHtml = buildEmailWrapper(
                'Workspace Assignment',
                'COLLABORATION UPDATE',
                `
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0;">Hi ${candidateName},</h2>
                <p style="font-size: 14px; color: #475569; line-height: 1.6;">You've been assigned to workspace <strong>${vars.workspace_name || 'Workspace'}</strong> ${vars.team_name ? `and team <strong>${vars.team_name}</strong>` : ''} in ${vars.organization_name || 'ResumePilot Enterprise'}.</p>
                <div style="text-align: center; margin: 26px 0;">
                    <a href="${vars.action_url}" target="_blank" rel="noopener noreferrer" style="background-color: #4f46e5; color: #ffffff; padding: 13px 30px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 13px; display: inline-block; box-shadow: 0 10px 20px -5px rgba(79,70,229,0.4);">Open Team Workspace &rarr;</a>
                </div>
                <p style="font-size: 12px; color: #94a3b8; margin-top: 8px; text-align: center; word-break: break-all;">If the button does not work, copy this link:<br/><a href="${vars.action_url}" style="color: #4f46e5;">${escapeEmailHtml(rawActionUrl)}</a></p>`
            );
            break;

        case 'enterprise_security_alert':
            subject = vars.subject || `Security Notice: Emergency Diagnostic Support Access for ${vars.organization_name || brandName}`;
            bodyHtml = buildEmailWrapper(
                'Enterprise Security Alert',
                'SECURITY ALERT',
                `
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #991b1b; margin: 0 0 6px 0; font-size: 16px; font-weight: 800;">Emergency Break-Glass Access Authorized</h3>
                    <p style="color: #7f1d1d; margin: 0; font-size: 13px; line-height: 1.5;">A time-bound diagnostic grant was issued for support engineer <strong>${vars.support_agent || 'Support Engineer'}</strong>.</p>
                </div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 16px 0; font-size: 13px; color: #334155; line-height: 1.6;">
                    <p style="margin: 0 0 6px;"><strong>Authorized By:</strong> ${vars.granted_by || 'Enterprise Administrator'}</p>
                    <p style="margin: 0 0 6px;"><strong>Reason:</strong> ${vars.reason || 'Technical investigation'}</p>
                    <p style="margin: 0;"><strong>Valid Until:</strong> ${vars.expires_at || 'In 4 hours'}</p>
                </div>
                <div style="text-align: center; margin: 26px 0;">
                    <a href="${vars.action_url}" target="_blank" rel="noopener noreferrer" style="background-color: #dc2626; color: #ffffff; padding: 13px 30px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 13px; display: inline-block; box-shadow: 0 10px 20px -5px rgba(220,38,38,0.4);">Review Audit Log &rarr;</a>
                </div>
                <p style="font-size: 12px; color: #94a3b8; margin-top: 8px; text-align: center; word-break: break-all;">If the button does not work, copy this link:<br/><a href="${vars.action_url}" style="color: #dc2626;">${escapeEmailHtml(rawActionUrl)}</a></p>`
            );
            break;

        case 'enterprise_quota_alert':
        case 'quota_alert':
            subject = vars.subject || `AI Quota Notice: ${vars.usage_percent || '80'}% of Monthly Allocation Used — ${vars.organization_name || brandName}`;
            bodyHtml = buildEmailWrapper(
                'AI Quota Alert',
                'QUOTA WARNING',
                `
                <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #92400e; margin: 0 0 6px 0; font-size: 16px; font-weight: 800;">Token Allocation Velocity Notice</h3>
                    <p style="color: #b45309; margin: 0; font-size: 13px; line-height: 1.5;">Your organization has consumed <strong>${vars.usage_percent || '85'}%</strong> of its monthly AI token allocation (${vars.consumed_tokens || '850,000'} / ${vars.quota_limit || '1,000,000'} tokens).</p>
                </div>
                <div style="text-align: center; margin: 26px 0;">
                    <a href="${vars.action_url}" target="_blank" rel="noopener noreferrer" style="background-color: #d97706; color: #ffffff; padding: 13px 30px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 13px; display: inline-block; box-shadow: 0 10px 20px -5px rgba(217,119,6,0.4);">Inspect Token Usage &rarr;</a>
                </div>
                <p style="font-size: 12px; color: #94a3b8; margin-top: 8px; text-align: center; word-break: break-all;">If the button does not work, copy this link:<br/><a href="${vars.action_url}" style="color: #d97706;">${escapeEmailHtml(rawActionUrl)}</a></p>`
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

// MariaDB is the sole outbound-delivery history owner. Callers must explicitly
// handle persistence failures; no process-memory success fallback exists.
async function logOutboundEmail(logEntry) {
    const entry = {
        id: crypto.randomUUID(),
        recipient: String(logEntry.to || '').slice(0, 255),
        subject: String(logEntry.subject || '').replace(/[\r\n]/g, ' ').slice(0, 255),
        templateType: String(logEntry.templateType || 'custom').slice(0, 64),
        status: String(logEntry.status || 'FAILED').slice(0, 32),
        html: logEntry.html || null,
        messageId: logEntry.messageId ? String(logEntry.messageId).slice(0, 255) : null,
        error: logEntry.error ? String(logEntry.error).slice(0, 1000) : null,
        transport: String(logEntry.transport || 'primary_smtp').slice(0, 64),
        sentAt: new Date().toISOString(),
    };
    await getPool().query(
        `INSERT INTO email_logs
           (id, recipient, subject, template_type, status, html, message_id, error, transport, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.id, entry.recipient, entry.subject, entry.templateType, entry.status, entry.html,
            entry.messageId, entry.error, entry.transport, new Date(entry.sentAt)]
    );
    return entry;
}

// Circuit Breaker State for High-Availability Primary SMTP Failover
let primaryConsecutiveFailures = 0;
let primaryCircuitBreakerUntil = 0;

// Discerning Helper: Only genuine transport/network/auth infrastructure errors trip circuit breaker
function isTransportInfrastructureError(err) {
    if (!err) return false;
    const code = String(err.code || '').toUpperCase();
    const msg = String(err.message || '').toLowerCase();
    const responseCode = Number(err.responseCode);
    // Recipient-specific 4xx/5xx rejection (user unknown, mailbox full, etc.) is NOT a transport outage
    if (responseCode >= 500 && responseCode <= 554 && (msg.includes('user') || msg.includes('mailbox') || msg.includes('recipient') || msg.includes('does not exist'))) {
        return false;
    }
    if (code === 'EENVELOPE' || code === 'EMSGSIZE') return false;
    if (['ECONNREFUSED', 'ETIMEDOUT', 'ESOCKET', 'ENOTFOUND', 'EAI_AGAIN', 'EAUTH', 'ECONNRESET'].includes(code)) return true;
    if (msg.includes('timeout') || msg.includes('refused') || msg.includes('greeting') || msg.includes('auth') || msg.includes('connect') || msg.includes('closed')) return true;
    return false;
}

// Create Nodemailer Transporter instance with resilient timeouts and STARTTLS support
function createTransporter(smtpConfig, resolvedAddress = null) {
    const isSecure = smtpConfig.encryption === 'ssl' || smtpConfig.port === 465;
    const isTls = smtpConfig.encryption === 'tls' || smtpConfig.encryption === 'starttls' || smtpConfig.port === 587;
    return nodemailer.createTransport({
        host: resolvedAddress || smtpConfig.host,
        port: smtpConfig.port,
        secure: isSecure,
        requireTLS: isTls && !isSecure,
        auth: (smtpConfig.username && smtpConfig.password) ? {
            user: smtpConfig.username,
            pass: smtpConfig.password,
        } : undefined,
        tls: {
            rejectUnauthorized: true,
            servername: smtpConfig.host,
            minVersion: 'TLSv1.2'
        },
        connectionTimeout: 20000, // 20s resilient connection timeout (avoids premature drop on cloud relays)
        greetingTimeout: 15000,   // 15s greeting timeout (handles TLS handshake latency gracefully)
        socketTimeout: 30000      // 30s socket timeout
    });
}

// Helper: Dispatch Outbound Mail with Fallback Transport Support (10/10 High-Availability Circuit Breaker)
async function dispatchMailWithFallback(config, mailOptions) {
    let primaryErr = null;
    const allowedEncryption = new Set(['ssl', 'tls', 'starttls']);
    let primaryTarget = null;
    let fallbackTarget = null;

    if (!mailOptions.text && mailOptions.html) {
        mailOptions.text = htmlToPlainText(mailOptions.html);
    }
    if (!mailOptions.headers) {
        mailOptions.headers = {};
    }
    mailOptions.headers['X-Mailer'] = mailOptions.headers['X-Mailer'] || 'ResumePilot Enterprise Mail Gateway/2.0';
    mailOptions.headers['X-Auto-Response-Suppress'] = 'OOF, AutoReply';
    mailOptions.headers['MIME-Version'] = '1.0';
    if (!mailOptions.headers['Date'] && !mailOptions.date) {
        mailOptions.headers['Date'] = new Date().toUTCString();
    }
    delete mailOptions.headers['Precedence']; // Do not set bulk precedence on transactional mail
    delete mailOptions.headers['Auto-Submitted']; // Do not set Auto-Submitted on transactional user mail (prevents Spam classification)

    // Ensure authentic Message-ID is generated if missing
    if (!mailOptions.messageId) {
        const senderDomain = config.smtp?.username?.includes('@')
            ? config.smtp.username.split('@')[1]
            : (new URL(publicSiteOrigin()).hostname || process.env.APP_DOMAIN || 'ai-resume-builder.local');
        mailOptions.messageId = `<${Date.now()}.${Math.random().toString(36).substring(2, 11)}@${senderDomain}>`;
    }

    // Standardize sender and reply-to addresses
    if (!mailOptions.from) {
        const senderName = config.smtp?.senderName || 'ResumePilot AI';
        const senderUser = config.smtp?.senderEmail || (config.smtp?.username?.includes('@') ? config.smtp.username : `no-reply@${new URL(publicSiteOrigin()).hostname}`);
        mailOptions.from = `"${senderName}" <${senderUser}>`;
    }
    if (!mailOptions.replyTo) {
        mailOptions.replyTo = config.smtp?.replyTo || config.smtp?.username || `support@${new URL(publicSiteOrigin()).hostname}`;
    }

    const hasPrimaryCreds = Boolean(config.smtp?.username && config.smtp?.password);
    const hasFallbackCreds = Boolean(config.fallbackSmtp?.enabled && config.fallbackSmtp?.username && config.fallbackSmtp?.password);

    if (!hasPrimaryCreds && !hasFallbackCreds) {
        const notConfigured = new Error('No valid SMTP credentials configured.');
        notConfigured.code = 'EMAIL_NOT_CONFIGURED';
        throw notConfigured;
    }

    if (config.smtp?.host && hasPrimaryCreds) {
        if (!allowedEncryption.has(String(config.smtp.encryption || '').toLowerCase())) throw new Error('Encrypted SMTP transport is required');
        primaryTarget = await assertPublicNetworkTarget(config.smtp.host);
    }
    if (config.fallbackSmtp?.enabled && config.fallbackSmtp?.host && hasFallbackCreds) {
        if (!allowedEncryption.has(String(config.fallbackSmtp.encryption || '').toLowerCase())) throw new Error('Encrypted fallback SMTP transport is required');
        fallbackTarget = await assertPublicNetworkTarget(config.fallbackSmtp.host);
    }
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
            const primaryTransporter = createTransporter(config.smtp, primaryTarget?.addresses?.[0]);
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
            if (isTransportInfrastructureError(err)) {
                primaryConsecutiveFailures++;
                console.warn(`⚠️ Primary SMTP Transport Error (Attempt ${primaryConsecutiveFailures}/${maxFailures}):`, err.message);

                if (primaryConsecutiveFailures >= maxFailures) {
                    primaryCircuitBreakerUntil = now + cooldownMinutes * 60 * 1000;
                    console.error(`🚨 Primary SMTP failed ${primaryConsecutiveFailures} consecutive times. Opening Circuit Breaker for ${cooldownMinutes} mins until ${new Date(primaryCircuitBreakerUntil).toLocaleTimeString()}`);
                }
            } else {
                console.warn(`⚠️ Primary SMTP Recipient/Content Error (Non-circuit tripping):`, err.message);
            }
        }
    }

    // 2. Try Secondary Fallback Transporter if enabled
    const fallbackEnabled = config.fallbackSmtp && (config.fallbackSmtp.enabled === true || config.fallbackSmtp.enabled === 'true' || config.fallbackSmtp.enabled === 1);
    if (fallbackEnabled && config.fallbackSmtp.username && config.fallbackSmtp.password) {
        try {
            console.warn('⚡ Primary SMTP unavailable/bypassed. Activating Secondary Fallback Relay (Failover)...');
            const fallbackTransporter = createTransporter(config.fallbackSmtp, fallbackTarget?.addresses?.[0]);

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
    // No transport was even attempted because no credentials exist. This is a
    // configuration gap, not a delivery failure, and the distinction has to
    // survive all the way to the HTTP status: a missing SMTP account must not
    // be reported to an operator as "the mail server rejected your message".
    const notConfigured = new Error('No valid SMTP credentials configured.');
    notConfigured.code = 'EMAIL_NOT_CONFIGURED';
    throw notConfigured;
}

// --- API ENDPOINTS ---

async function recordMailAdminAudit(req, { action, outcome = 'SUCCESS', severity = 'MEDIUM', metadata = {}, requestId = null } = {}) {
    return recordAdminAuditLog(req, {
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorRole: String(req.user?.claims?.role || 'ADMIN').toUpperCase(),
        action,
        category: 'communications.email',
        severity,
        outcome,
        method: req.method,
        pathname: req.originalUrl || req.path,
        statusCode: outcome === 'SUCCESS' ? 200 : 500,
        metadata,
        requestId: requestId || null,
    });
}

function recentAuthForMailSecretMutation(req, res, next) {
    const input = req.body || {};
    const clear = Object.values(input.clearSecrets || {}).some(value => value === true);
    const suppliedPassword = ['smtp', 'fallbackSmtp', 'imap']
        .map(section => input[section]?.password)
        .some(value => String(value || '').trim() !== '');
    if (!clear && !suppliedPassword) return next();
    // Let malformed requests reach the normal schema validator so callers get
    // the precise 400 response; no write occurs before validation. A valid
    // secret-bearing request still requires the Super Admin recent-auth gate.
    const encryptedTransport = section => {
        const value = input[section];
        if (!value || typeof value !== 'object' || !value.password) return true;
        const encryption = String(value.encryption || '').toLowerCase();
        const port = Number(value.port);
        return (section === 'imap' ? encryption === 'ssl' && port === 993 : ['ssl', 'tls', 'starttls'].includes(encryption));
    };
    if (!['smtp', 'fallbackSmtp', 'imap'].every(encryptedTransport)) return next();
    return requireRecentAdminAuthentication(req, res, next);
}

// 0. Circuit Breaker Control & Status Endpoints
router.get('/admin/circuit-breaker-status', requirePermission('email.logs.read'), (req, res) => {
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

router.post('/admin/reset-circuit-breaker', requireRecentAdminAuthentication, async (req, res) => {
    const previous = { failures: primaryConsecutiveFailures, until: primaryCircuitBreakerUntil };
    primaryConsecutiveFailures = 0;
    primaryCircuitBreakerUntil = 0;
    const audit = await recordMailAdminAudit(req, {
        action: 'EMAIL_CIRCUIT_BREAKER_RESET',
        severity: 'HIGH',
        metadata: { previousFailures: previous.failures, previousOpenUntil: previous.until ? new Date(previous.until).toISOString() : null },
        requestId: res.locals?.requestId,
    });
    if (!audit) {
        primaryConsecutiveFailures = previous.failures;
        primaryCircuitBreakerUntil = previous.until;
        return res.status(503).json({ success: false, code: 'AUDIT_WRITE_FAILED', error: 'Circuit-breaker state was not changed because the audit event could not be persisted.', requestId: res.locals?.requestId });
    }
    return res.json({ success: true, message: 'Circuit breaker reset successfully! Primary SMTP restored to Operational state.' });
});

// 0b. Custom templates share the revisioned MariaDB email configuration row.
async function saveTemplateCustomization(req, res) {
    let connection;
    try {
        const expectedRevision = validateExpectedEmailRevision(req.body?.expectedRevision);
        const template = assertSafeCustomTemplate(req.body || {});
        connection = await getPool().getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.query(
            'SELECT data, revision FROM system_settings WHERE category = ? FOR UPDATE',
            [EMAIL_SETTING_CATEGORY]
        );
        const currentRevision = Number(rows[0]?.revision || 0);
        if (currentRevision !== expectedRevision) {
            throw Object.assign(new Error('Email templates changed after this panel loaded.'), {
                code: 'EMAIL_SETTINGS_CONFLICT', status: 409, currentRevision,
            });
        }
        const current = rows[0] ? parseStoredJson(rows[0].data, {}) : {};
        const templates = current.customTemplates && typeof current.customTemplates === 'object' ? current.customTemplates : {};
        if (!Object.hasOwn(templates, template.templateType) && Object.keys(templates).length >= 100) {
            throw Object.assign(new Error('The custom email template limit has been reached.'), { code: 'EMAIL_TEMPLATE_LIMIT', status: 409 });
        }
        const revision = currentRevision + 1;
        const next = {
            ...current,
            customTemplates: {
                ...templates,
                [template.templateType]: { subject: template.subject, html: template.html, updatedAt: new Date().toISOString() },
            },
        };
        await connection.query(
            `INSERT INTO system_settings (category, data, revision, updated_at)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision), updated_at = NOW()`,
            [EMAIL_SETTING_CATEGORY, JSON.stringify(next), revision]
        );
        await insertEmailAdminAudit(connection, req, 'EMAIL_TEMPLATE_CUSTOMIZATION_UPDATED', { templateType: template.templateType, revision });
        await connection.commit();
        return res.json({ success: true, message: `Template '${template.templateType}' customized successfully.`, revision });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        return res.status(error.status || 503).json({
            success: false,
            code: error.code || 'EMAIL_TEMPLATE_SAVE_FAILED',
            error: error.status && error.status < 500 ? error.message : 'The email template could not be saved.',
            currentRevision: error.currentRevision,
            requestId: res.locals?.requestId,
        });
    } finally {
        connection?.release();
    }
}

async function getCustomTemplates(_req, res) {
    try {
        const [rows] = await getPool().query('SELECT data, revision FROM system_settings WHERE category = ? LIMIT 1', [EMAIL_SETTING_CATEGORY]);
        const current = rows[0] ? parseStoredJson(rows[0].data, {}) : {};
        return res.json({ success: true, templates: current.customTemplates || {}, revision: Number(rows[0]?.revision || 0), source: 'mariadb' });
    } catch (_error) {
        return res.status(503).json({ success: false, code: 'EMAIL_TEMPLATES_UNAVAILABLE', error: 'Email templates are unavailable.', requestId: res.locals?.requestId });
    }
}

router.post('/admin/save-template-customization', requireRecentAdminAuthentication, saveTemplateCustomization);
router.get('/admin/custom-templates', requirePermission('email.template.manage'), getCustomTemplates);

// 1. Test Outbound SMTP Socket Connection (Supports type='smtp' and type='fallback_smtp')
function recentAuthForEmailTest(req, res, next) {
    if (!['smtp', 'fallback_smtp'].includes(req.body?.type)) return next();
    return requireRecentAdminAuthentication(req, res, next);
}

router.post('/admin/test-connection', recentAuthForEmailTest, async (req, res) => {
    const { type } = req.body;

    if (type === 'fallback_smtp') {
        try {
            const stored = (await getEmailConfig()).fallbackSmtp || {};
            const fallbackConfig = {
                host: req.body.host || stored.host || 'smtp.gmail.com',
                port: parseInt(req.body.port || stored.port || '587', 10),
                encryption: req.body.encryption || stored.encryption || 'tls',
                username: req.body.username || stored.username || '',
                password: req.body.password || stored.password || '',
                senderName: req.body.senderName || stored.senderName || 'ResumePilot AI Failover',
                adminEmail: req.body.adminEmail || stored.adminEmail || req.body.username || stored.username || 'bhaskar.beyond@gmail.com',
            };

            if (!fallbackConfig.username || !fallbackConfig.password) {
                return res.status(400).json({ success: false, error: 'Secondary Fallback Relay Username and Password are required.' });
            }

            if (!['ssl', 'tls', 'starttls'].includes(String(fallbackConfig.encryption).toLowerCase())) {
                return res.status(400).json({ success: false, error: 'Encrypted SMTP transport is required.' });
            }
            const fallbackTarget = await assertPublicNetworkTarget(fallbackConfig.host);
            const transporter = createTransporter(fallbackConfig, fallbackTarget.addresses[0]);
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
            const audit = await recordMailAdminAudit(req, {
                action: 'EMAIL_PROVIDER_TESTED',
                metadata: { provider: 'fallback_smtp', host: fallbackConfig.host, result: 'SUCCESS' },
                requestId: res.locals?.requestId,
            });
            if (!audit) return res.status(503).json({ success: false, code: 'AUDIT_WRITE_FAILED', error: 'The fallback SMTP test ran but its audit event could not be persisted.', requestId: res.locals?.requestId });
            return res.json({
                success: true,
                messageId: info.messageId,
                message: `Secondary Fallback Relay verified! Test email sent to ${fallbackConfig.adminEmail}`
            });
        } catch (err) {
            console.error('[Fallback Test Error]:', err.code || err.name || 'provider_error');
            await recordMailAdminAudit(req, {
                action: 'EMAIL_PROVIDER_TESTED', outcome: 'FAILURE', severity: 'MEDIUM',
                metadata: { provider: 'fallback_smtp', result: 'FAILURE', errorCategory: err.code || err.name || 'PROVIDER_ERROR' },
                requestId: res.locals?.requestId,
            });
            return res.status(503).json({ success: false, code: 'EMAIL_PROVIDER_TEST_FAILED', error: 'Fallback SMTP verification failed.', requestId: res.locals?.requestId });
        }
    }

    if (type !== 'smtp') {
        return res.status(400).json({ success: false, code: 'EMAIL_TEST_TYPE_UNSUPPORTED', error: 'This endpoint supports SMTP tests only.' });
    }

    try {
        const stored = (await getEmailConfig()).smtp || {};
        const smtpConfig = {
            host: req.body.host || stored.host || 'smtp.hostinger.com',
            port: parseInt(req.body.port || stored.port || '465', 10),
            encryption: req.body.encryption || stored.encryption || 'ssl',
            username: req.body.username || stored.username || '',
            password: req.body.password || stored.password || '',
            senderName: req.body.senderName || stored.senderName || 'ResumePilot AI',
            adminEmail: req.body.adminEmail || stored.adminEmail || 'bhaskar.beyond@gmail.com',
        };

        if (!smtpConfig.username || !smtpConfig.password) {
            return res.status(400).json({ success: false, error: 'SMTP Username and Password are required.' });
        }

        if (!['ssl', 'tls', 'starttls'].includes(String(smtpConfig.encryption).toLowerCase())) {
            return res.status(400).json({ success: false, error: 'Encrypted SMTP transport is required.' });
        }
        const smtpTarget = await assertPublicNetworkTarget(smtpConfig.host);
        const transporter = createTransporter(smtpConfig, smtpTarget.addresses[0]);
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
        const audit = await recordMailAdminAudit(req, {
            action: 'EMAIL_PROVIDER_TESTED',
            metadata: { provider: 'smtp', host: smtpConfig.host, result: 'SUCCESS' },
            requestId: res.locals?.requestId,
        });
        if (!audit) return res.status(503).json({ success: false, code: 'AUDIT_WRITE_FAILED', error: 'The SMTP test ran but its audit event could not be persisted.', requestId: res.locals?.requestId });
        return res.json({
            success: true,
            message: `SMTP Verified! Live test mail dispatched to ${smtpConfig.adminEmail}. (Message ID: ${info.messageId})`
        });

    } catch (err) {
        console.error('SMTP Connection Test Error:', err.code || err.name || 'provider_error');
        await recordMailAdminAudit(req, {
            action: 'EMAIL_PROVIDER_TESTED', outcome: 'FAILURE', severity: 'MEDIUM',
            metadata: { provider: 'smtp', result: 'FAILURE', errorCategory: err.code || err.name || 'PROVIDER_ERROR' },
            requestId: res.locals?.requestId,
        });
        return res.status(503).json({
            success: false,
            code: 'EMAIL_PROVIDER_TEST_FAILED',
            error: 'SMTP verification failed. Check the configured host and credentials.',
            requestId: res.locals?.requestId,
        });
    }
});

// Admin-safe runtime projection: allowlisted metadata and configured booleans, never credentials.
router.get('/admin/settings', requirePermission('system.config.read'), async (_req, res) => {
    try {
        const config = await getEmailConfig();
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ success: true, settings: {
            smtp: projectMailSection('smtp', config.smtp),
            fallbackSmtp: projectMailSection('fallbackSmtp', config.fallbackSmtp),
            imap: projectMailSection('imap', config.imap),
            enabledTemplates: config.enabledTemplates || {},
            revision: config.revision,
        }, source: 'mariadb' });
    } catch (error) {
        return res.status(error.status || 503).json({ success: false, code: error.code || 'EMAIL_SETTINGS_UNAVAILABLE', error: 'Email runtime settings are unavailable.', requestId: res.locals?.requestId });
    }
});

/**
 * Real DNS deliverability inspection.
 *
 * The Admin console previously rendered a hardcoded "100% EXCELLENT
 * DELIVERABILITY" badge with four permanently-green SPF/DKIM/DMARC/MX cards.
 * Those values were never measured, so the panel claimed a healthy mail
 * posture even when the records were missing or broken.
 *
 * This resolves the records live and reports exactly what DNS returns. Every
 * card can come back OPERATIONAL, DEGRADED, NOT_CONFIGURED or UNKNOWN, and a
 * lookup failure is reported as UNKNOWN with the reason attached — never as a
 * pass.
 */
router.get('/admin/deliverability', async (req, res) => {
    // Derive the domain to inspect from the configured sender, never from
    // caller-supplied input, so this cannot be used as a DNS probe primitive.
    const config = await getEmailConfig();
    const sender = config?.smtp?.username || config?.smtp?.user || config?.smtp?.from || '';
    const domain = String(sender).includes('@') ? String(sender).split('@').pop().trim().toLowerCase() : '';

    if (!domain) {
        return res.json({
            success: true,
            domain: null,
            checkedAt: new Date().toISOString(),
            overall: 'NOT_CONFIGURED',
            summary: 'No sender domain is configured, so deliverability cannot be assessed.',
            records: [],
        });
    }

    const records = [];
    const check = async (label, fn) => {
        try {
            records.push({ label, ...(await fn()) });
        } catch (error) {
            // ENOTFOUND / ENODATA mean the record genuinely is not published;
            // anything else means we could not determine the answer.
            const missing = error?.code === 'ENOTFOUND' || error?.code === 'ENODATA';
            records.push({
                label,
                state: missing ? 'NOT_CONFIGURED' : 'UNKNOWN',
                detail: missing ? 'No record published for this domain.' : `Lookup failed: ${error?.code || error?.message || 'unknown error'}`,
                value: null,
                remediation: missing
                    ? `Publish the required ${label} record in the DNS zone for ${domain}.`
                    : 'Retry once DNS resolution is available from the server.',
            });
        }
    };

    await check('SPF', async () => {
        const txt = (await dnsPromises.resolveTxt(domain)).map(chunks => chunks.join(''));
        const spf = txt.find(entry => entry.toLowerCase().startsWith('v=spf1'));
        if (!spf) {
            return { state: 'NOT_CONFIGURED', value: null, detail: 'No v=spf1 TXT record found.', remediation: `Publish an SPF TXT record for ${domain}.` };
        }
        // "+all" accepts forged mail; it is published but actively unsafe.
        const permissive = /\+all\s*$/.test(spf);
        const fallbackEnabled = config?.fallbackSmtp?.enabled === true || config?.fallbackSmtp?.enabled === 'true' || config?.fallbackSmtp?.enabled === 1;
        const fallbackHost = String(config?.fallbackSmtp?.host || '').toLowerCase();
        const hasBrevo = spf.includes('brevo.com') || spf.includes('sendinblue.com');
        const isBrevoFallback = fallbackEnabled && (fallbackHost.includes('brevo') || fallbackHost.includes('sendinblue'));
        const missingRelay = isBrevoFallback && !hasBrevo;

        let detail = permissive ? 'SPF ends in +all, which authorises any sender.' : 'SPF record published.';
        let remediation = permissive ? 'Replace +all with ~all or -all.' : null;

        if (missingRelay) {
            detail = 'SPF authorizes primary provider but is missing fallback relay (include:spf.brevo.com).';
            remediation = `Update SPF record to include both providers: "v=spf1 include:_spf.mail.hostinger.com include:spf.brevo.com ~all"`;
        }

        return {
            state: permissive || missingRelay ? 'DEGRADED' : 'OPERATIONAL',
            value: spf,
            detail,
            remediation,
        };
    });

    await check('DKIM', async () => {
        // Probe the selectors this deployment is known to use.
        const selectors = ['hostingermail-a', 'hostingermail-b', 'hostingermail-c', 'default', 'google'];
        const found = [];
        for (const selector of selectors) {
            try {
                const txt = (await dnsPromises.resolveTxt(`${selector}._domainkey.${domain}`)).map(chunks => chunks.join(''));
                if (txt.some(entry => entry.includes('p='))) found.push(selector);
            } catch { /* selector not published; try the next one */ }
        }
        if (!found.length) {
            return { state: 'NOT_CONFIGURED', value: null, detail: 'No DKIM key found for the known selectors.', remediation: `Publish a DKIM key for ${domain}.` };
        }
        return { state: 'OPERATIONAL', value: found.join(', '), detail: `${found.length} DKIM ${found.length === 1 ? 'key' : 'keys'} published.`, remediation: null };
    });

    await check('DMARC', async () => {
        const txt = (await dnsPromises.resolveTxt(`_dmarc.${domain}`)).map(chunks => chunks.join(''));
        const dmarc = txt.find(entry => entry.toLowerCase().startsWith('v=dmarc1'));
        if (!dmarc) {
            return { state: 'NOT_CONFIGURED', value: null, detail: 'No _dmarc TXT record found.', remediation: `Publish a DMARC policy for ${domain}.` };
        }
        // p=none monitors only; it does not protect the domain.
        const monitoring = /p=\s*none/i.test(dmarc);
        return {
            state: monitoring ? 'DEGRADED' : 'OPERATIONAL',
            value: dmarc,
            detail: monitoring ? 'DMARC is published but the policy is p=none (monitor only).' : 'DMARC policy is enforced.',
            remediation: monitoring ? 'Move to p=quarantine or p=reject once reports look clean.' : null,
        };
    });

    await check('MX', async () => {
        const mx = await dnsPromises.resolveMx(domain);
        if (!mx.length) {
            return { state: 'NOT_CONFIGURED', value: null, detail: 'No MX records published.', remediation: `Publish MX records for ${domain}.` };
        }
        const hosts = mx.sort((a, b) => a.priority - b.priority).map(entry => entry.exchange);
        return {
            state: mx.length === 1 ? 'DEGRADED' : 'OPERATIONAL',
            value: hosts.join(', '),
            detail: mx.length === 1 ? 'Only one MX host is published, so mail routing has no redundancy.' : `${mx.length} MX hosts published.`,
            remediation: mx.length === 1 ? 'Add a secondary MX host for redundancy.' : null,
        };
    });

    // The overall verdict is the worst individual result, so one bad record
    // can never be averaged away into a green badge.
    const order = ['UNKNOWN', 'NOT_CONFIGURED', 'DEGRADED', 'OPERATIONAL'];
    const overall = records.reduce(
        (worst, record) => (order.indexOf(record.state) < order.indexOf(worst) ? record.state : worst),
        'OPERATIONAL',
    );

    return res.json({
        success: true,
        domain,
        checkedAt: new Date().toISOString(),
        overall,
        summary: {
            OPERATIONAL: 'All checked DNS records are published and correctly configured.',
            DEGRADED: 'DNS records are published but at least one weakens deliverability.',
            NOT_CONFIGURED: 'At least one required DNS record is missing.',
            UNKNOWN: 'At least one record could not be resolved from this server.',
        }[overall],
        records,
    });
});

// Save validated SMTP/IMAP settings in one revision-guarded MariaDB transaction.
router.post('/admin/save-smtp', recentAuthForMailSecretMutation, async (req, res) => {
    let connection;
    try {
        const { smtp, fallbackSmtp, imap, enabledTemplates } = req.body || {};
        if (!smtp && !fallbackSmtp && !imap && !enabledTemplates) {
            return res.status(400).json({ success: false, code: 'EMAIL_SETTINGS_REQUIRED', error: 'Email settings are required.' });
        }
        const expectedRevision = validateExpectedEmailRevision(req.body?.expectedRevision);
        const clearSecrets = req.body?.clearSecrets && typeof req.body.clearSecrets === 'object' ? req.body.clearSecrets : {};
        const environmentPairs = {
            smtp: environmentCredentialPair('SMTP_USER', 'SMTP_PASS', 'Primary SMTP'),
            fallbackSmtp: environmentCredentialPair('FALLBACK_SMTP_USER', 'FALLBACK_SMTP_PASS', 'Fallback SMTP'),
            imap: environmentCredentialPair('IMAP_USER', 'IMAP_PASS', 'IMAP'),
        };
        for (const section of ['smtp', 'fallbackSmtp', 'imap']) {
            const changesCredential = clearSecrets[section] === true || String(req.body?.[section]?.password || '').trim();
            if (changesCredential && environmentPairs[section].configured) {
                throw Object.assign(
                    new Error(`${section} credentials are deployment-managed and cannot be changed from the Admin UI.`),
                    { code: 'INFRASTRUCTURE_SECRET_READ_ONLY', status: 409 }
                );
            }
        }
        const hasReplacementSecret = ['smtp', 'fallbackSmtp', 'imap'].some(section => String(req.body?.[section]?.password || '').trim());
        const encryptionProvider = settingsEncryptionProvider({ required: hasReplacementSecret });

        connection = await getPool().getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.query(
            'SELECT data, revision FROM system_settings WHERE category = ? FOR UPDATE',
            [EMAIL_SETTING_CATEGORY]
        );
        const currentRevision = Number(rows[0]?.revision || 0);
        if (currentRevision !== expectedRevision) {
            throw Object.assign(new Error('Email settings changed after this panel loaded. Reload before saving.'), {
                code: 'EMAIL_SETTINGS_CONFLICT', status: 409, currentRevision,
            });
        }
        const current = rows[0] ? parseStoredJson(rows[0].data, {}) : {};
        const defaults = defaultEmailConfig();
        const next = { ...current };
        for (const section of ['smtp', 'fallbackSmtp', 'imap']) {
            if (!req.body?.[section]) continue;
            const currentRaw = current[section] && typeof current[section] === 'object' ? current[section] : {};
            const currentRuntime = { ...defaults[section], ...currentRaw, password: '' };
            next[section] = storedMailSection(
                section,
                req.body[section],
                currentRaw,
                currentRuntime,
                clearSecrets[section] === true,
                encryptionProvider
            );
        }
        if (enabledTemplates) {
            next.enabledTemplates = { ...defaults.enabledTemplates, ...normalizeTemplateToggles(enabledTemplates) };
        }
        const revision = currentRevision + 1;
        await connection.query(
            `INSERT INTO system_settings (category, data, revision, updated_at)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision), updated_at = NOW()`,
            [EMAIL_SETTING_CATEGORY, JSON.stringify(next), revision]
        );
        await insertEmailAdminAudit(connection, req, 'SMTP_SETTINGS_UPDATED', {
            revision,
            changedSections: ['smtp', 'fallbackSmtp', 'imap', 'enabledTemplates'].filter(section => Boolean(req.body?.[section])),
            credentialsCleared: Object.entries(clearSecrets).filter(([, value]) => value === true).map(([key]) => key),
            credentialsReplaced: ['smtp', 'fallbackSmtp', 'imap'].filter(section => String(req.body?.[section]?.password || '').trim()),
        });
        await connection.commit();
        const config = await getEmailConfig();
        return res.json({
            success: true,
            message: 'Email settings saved.',
            revision,
            settings: {
                smtp: projectMailSection('smtp', config.smtp),
                fallbackSmtp: projectMailSection('fallbackSmtp', config.fallbackSmtp),
                imap: projectMailSection('imap', config.imap),
                enabledTemplates: config.enabledTemplates,
                revision,
            },
            credentialPolicy: 'EMPTY_PRESERVES_EXPLICIT_CLEAR_REQUIRED',
        });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        console.error('[Email settings save]', { code: error.code, requestId: res.locals?.requestId });
        return res.status(error.status || (error.code ? 503 : 400)).json({
            success: false,
            code: error.code || 'INVALID_EMAIL_SETTINGS',
            error: error.status && error.status >= 500 ? 'Email settings could not be saved.' : error.message,
            currentRevision: error.currentRevision,
            requestId: res.locals?.requestId,
        });
    } finally {
        connection?.release();
    }
});

// 2. Test Inbound IMAP Connection Socket
router.post('/admin/test-imap', requireRecentAdminAuthentication, async (req, res) => {
    try {
        const stored = (await getEmailConfig()).imap || {};
        const imapConfig = {
            host: req.body.host || stored.host || 'imap.hostinger.com',
            port: parseInt(req.body.port || stored.port || '993', 10),
            encryption: req.body.encryption || stored.encryption || 'ssl',
            username: req.body.username || stored.username || '',
            password: req.body.password || stored.password || ''
        };

        if (imapConfig.encryption !== 'ssl' || imapConfig.port !== 993) {
            return res.status(400).json({ success: false, error: 'IMAP requires TLS on port 993.' });
        }
        const imapTarget = await assertPublicNetworkTarget(imapConfig.host);
        await verifyImapConnection(imapConfig, imapTarget.addresses[0]);
        const audit = await recordMailAdminAudit(req, {
            action: 'EMAIL_PROVIDER_TESTED',
            metadata: { provider: 'imap', host: imapConfig.host, result: 'SUCCESS' },
            requestId: res.locals?.requestId,
        });
        if (!audit) return res.status(503).json({ success: false, code: 'AUDIT_WRITE_FAILED', error: 'The IMAP test ran but its audit event could not be persisted.', requestId: res.locals?.requestId });
        return res.json({ success: true, message: `IMAP Socket Verified! Connected to ${imapConfig.host}:${imapConfig.port}` });
    } catch (err) {
        console.error('IMAP Test Error:', err.code || err.name || 'provider_error');
        await recordMailAdminAudit(req, {
            action: 'EMAIL_PROVIDER_TESTED', outcome: 'FAILURE', severity: 'MEDIUM',
            metadata: { provider: 'imap', result: 'FAILURE', errorCategory: err.code || err.name || 'PROVIDER_ERROR' },
            requestId: res.locals?.requestId,
        });
        return res.status(503).json({ success: false, code: 'EMAIL_PROVIDER_TEST_FAILED', error: 'IMAP verification failed.', requestId: res.locals?.requestId });
    }
});

// 3. Administrative one-off dispatcher. Product notifications use the durable
// notification outbox; this endpoint is restricted to recently authenticated operators.
router.post('/send-email', requirePermission('system.config.write'), requireRecentAdminAuthentication, async (req, res) => {
    const recipient = String(req.body?.to || '').trim().toLowerCase();
    const templateType = String(req.body?.templateType || 'default');
    if (!/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(recipient) || recipient.length > 254) {
        return res.status(400).json({ success: false, code: 'INVALID_EMAIL_RECIPIENT', error: 'A single valid recipient email address is required.' });
    }
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(templateType)) {
        return res.status(400).json({ success: false, code: 'INVALID_EMAIL_TEMPLATE', error: 'Invalid email template type.' });
    }
    let providerAccepted = false;
    try {
        const config = await getEmailConfig();
        if (config.enabledTemplates?.[templateType] === false) {
            const log = await logOutboundEmail(null, {
                to: recipient, subject: req.body?.customSubject || `Notification (${templateType})`,
                templateType, status: 'SKIPPED', error: 'Template disabled in email settings',
            });
            return res.status(409).json({ success: false, code: 'EMAIL_TEMPLATE_DISABLED', error: 'This email template is disabled.', logId: log.id });
        }
        const rendered = renderEmailTemplate(templateType, {
            ...(req.body?.vars || {}),
            subject: req.body?.customSubject,
            body: req.body?.customBody,
        }, config.customTemplates);
        const mailOptions = {
            from: `"${config.smtp.senderName}" <${config.smtp.username}>`,
            replyTo: config.smtp.replyTo || config.smtp.username,
            to: recipient,
            subject: String(req.body?.customSubject || rendered.subject).replace(/[\r\n]/g, ' ').slice(0, 255),
            html: req.body?.customBody ? formatCustomEmailBody(req.body.customBody) : rendered.html,
        };
        const result = await dispatchMailWithFallback(config, mailOptions);
        providerAccepted = true;
        const log = await logOutboundEmail(null, {
            to: recipient, subject: mailOptions.subject, templateType, status: 'SENT',
            html: mailOptions.html, messageId: result.messageId, transport: result.transport,
        });
        return res.json({ success: true, providerAccepted: true, messageId: result.messageId, logId: log.id });
    } catch (error) {
        if (!providerAccepted) {
            await logOutboundEmail(null, {
                to: recipient, subject: req.body?.customSubject || `Notification (${templateType})`,
                templateType, status: 'FAILED', error: error.message,
            }).catch(logError => console.error('[Email] Failed-attempt history unavailable:', logError.code || logError.message));
        }
        return res.status(providerAccepted ? 503 : (error.code === 'EMAIL_NOT_CONFIGURED' ? 503 : 502)).json({
            success: false,
            code: providerAccepted ? 'EMAIL_ACCEPTED_HISTORY_FAILED' : (error.code || 'EMAIL_DELIVERY_FAILED'),
            error: providerAccepted
                ? 'The provider accepted the email, but delivery history could not be persisted. Do not resend without checking the provider.'
                : 'The email provider did not accept the message.',
            providerAccepted,
            requestId: res.locals?.requestId,
        });
    }
});

// Client-authored invoice emails are retired. Invoice issuance now owns its
// immutable payload and notification outbox event in the invoice transaction.
router.post('/send-invoice-email', (_req, res) => {
    return res.status(410).json({
        success: false,
        code: 'LEGACY_INVOICE_EMAIL_RETIRED',
        error: 'Generate the verified invoice through /api/invoice/generate; delivery is queued transactionally.',
        requestId: res.locals?.requestId,
    });
});

router.get('/logs', requirePermission('email.logs.read'), async (_req, res) => {
    try {
        const [rows] = await getPool().query(
            `SELECT id, recipient, subject, template_type, status, message_id, error, transport, sent_at
             FROM email_logs ORDER BY sent_at DESC, id DESC LIMIT 100`
        );
        const logs = rows.map(row => ({
            id: row.id, recipient: row.recipient, to: row.recipient, subject: row.subject,
            templateType: row.template_type, status: row.status, messageId: row.message_id,
            error: row.error, transport: row.transport,
            sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
        }));
        return res.json({ success: true, logs, source: 'mariadb' });
    } catch (_error) {
        return res.status(503).json({ success: false, code: 'EMAIL_LOGS_UNAVAILABLE', error: 'Email delivery history is unavailable.', requestId: res.locals?.requestId });
    }
});

router.post('/resend', requirePermission('system.config.write'), requireRecentAdminAuthentication, async (req, res) => {
    const searchId = String(req.body?.logId || req.body?.id || '').trim();
    if (!/^[A-Za-z0-9@._:<>{}-]{1,255}$/.test(searchId)) {
        return res.status(400).json({ success: false, code: 'INVALID_EMAIL_LOG_ID', error: 'A valid logId is required.' });
    }
    try {
        const [rows] = await getPool().query(
            `SELECT id, recipient, subject, template_type, html, message_id
             FROM email_logs WHERE id = ? OR message_id = ? ORDER BY sent_at DESC LIMIT 1`,
            [searchId.slice(0, 64), searchId]
        );
        if (!rows.length) return res.status(404).json({ success: false, code: 'EMAIL_LOG_NOT_FOUND', error: 'Email log entry not found.' });
        const target = rows[0];
        const config = await getEmailConfig();
        const rendered = target.html
            ? { subject: target.subject, html: target.html }
            : renderEmailTemplate(target.template_type, { candidate_name: target.recipient }, config.customTemplates);
        const result = await dispatchMailWithFallback(config, {
            from: `"${config.smtp.senderName}" <${config.smtp.username}>`,
            replyTo: config.smtp.replyTo || config.smtp.username,
            to: target.recipient,
            subject: String(target.subject || rendered.subject).replace(/[\r\n]/g, ' ').slice(0, 255),
            html: rendered.html,
        });
        const log = await logOutboundEmail(null, {
            to: target.recipient, subject: `[RESENT] ${target.subject || rendered.subject}`,
            templateType: target.template_type, status: 'SENT', html: rendered.html,
            messageId: result.messageId, transport: result.transport,
        });
        return res.json({ success: true, providerAccepted: true, logId: log.id });
    } catch (error) {
        return res.status(error.status || 502).json({ success: false, code: error.code || 'EMAIL_RESEND_FAILED', error: 'The email could not be resent.', requestId: res.locals?.requestId });
    }
});

router.get('/templates', requirePermission('system.config.read'), getCustomTemplates);
router.post('/templates', requirePermission('system.config.write'), requireRecentAdminAuthentication, saveTemplateCustomization);

async function dispatchNotification({ to, templateType, vars = {}, customSubject, customBody }) {
    const recipient = String(to || '').trim().toLowerCase();
    if (!/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(recipient) || recipient.length > 254) {
        return { success: false, error: 'A single valid recipient address is required' };
    }
    to = recipient;
    try {
        const config = await getEmailConfig();
        
        // Check On/Off toggle
        if (templateType && config.enabledTemplates && config.enabledTemplates[templateType] === false) {
            console.log(`[Email Skipped] Template '${templateType}' is disabled in Admin settings.`);
            await logOutboundEmail({
                to,
                subject: customSubject || `Notification (${templateType})`,
                templateType: templateType || 'custom',
                status: 'SKIPPED',
                error: 'Template disabled in System Settings'
            });
            return { success: true, skipped: true };
        }

        const brandName = config.smtp?.senderName || 'ResumePilot AI';
        const siteUrl = publicSiteOrigin();
        const supportEmail = config.smtp?.replyTo || `support@${new URL(siteUrl).hostname}`;

        const rawCandidate = vars.user_name || vars.candidate_name || to;
        const candidateName = humanizeName(rawCandidate, 'Team Member');
        const inviterName = humanizeName(vars.inviter_name, 'Your team administrator');
        const orgName = humanizeOrgName(vars.organization_name, 'your enterprise workspace');
        const roleTitle = humanizeRole(vars.role_title, 'Enterprise Team Member');
        const updaterName = humanizeName(vars.updater_name, 'an administrator');
        const grantedBy = humanizeName(vars.granted_by, 'an administrator');

        const contextualTabMap = {
            'invitation': 'overview',
            'enterprise-invitation': 'overview',
            'enterprise_invitation': 'overview',
            'role_change': 'access',
            'enterprise_role_update': 'access',
            'role_update': 'access',
            'team_assignment': 'teams',
            'enterprise_workspace_assignment': 'teams',
            'workspace_assignment': 'teams',
            'security_alert': 'audit',
            'enterprise_security_alert': 'audit',
            'quota_warning': 'usage',
            'quota_alert': 'usage',
            'enterprise_quota_alert': 'usage',
        };
        const targetTab = contextualTabMap[templateType] || 'overview';
        const defaultActionUrl = enterpriseConsoleUrl({
            tab: targetTab,
            tenantId: vars.tenant_id || vars.tenantId || '',
            workspaceId: vars.workspace_id || vars.workspaceId || '',
        });
        let finalActionUrl = sanitizeAbsoluteHttpUrl(vars.action_url) || defaultActionUrl;
        // Production email CTAs fail closed: a supplied action URL that is not
        // https or that points at a placeholder/loopback host is replaced by the
        // server-derived enterprise console URL. No localhost/staging CTA is ever mailed.
        try {
            assertNoForbiddenEmailHost(finalActionUrl);
        } catch {
            finalActionUrl = defaultActionUrl;
        }

        const mergedVars = {
            brand_name: brandName,
            site_url: siteUrl,
            support_email: supportEmail,
            workspace_name: vars.workspace_name || 'Main Workspace',
            team_name: vars.team_name || 'Core Team',
            updater_name: updaterName,
            granted_by: grantedBy,
            support_agent: vars.support_agent || 'support-tier3@resumepilot.ai',
            reason: vars.reason || 'Technical operational review',
            expires_at: vars.expires_at || new Date(Date.now() + 4 * 3600 * 1000).toLocaleString(),
            usage_percent: vars.usage_percent || '85',
            consumed_tokens: vars.consumed_tokens || '850,000',
            quota_limit: vars.quota_limit || '1,000,000',
            reset_date: vars.reset_date || '1st of next month',
            expires_in: vars.expires_in || '7 days',
            date: vars.date || new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' }),
            ...vars,
            candidate_name: candidateName,
            user_name: candidateName,
            inviter_name: inviterName,
            organization_name: orgName,
            role_title: roleTitle,
            action_url: finalActionUrl,
        };

        const rendered = renderEmailTemplate(templateType || 'default', mergedVars, config.customTemplates);
        const resolvedSubject = replaceEmailVariables(customSubject || rendered.subject, mergedVars);
        const resolvedHtml = customBody
            ? formatCustomEmailBody(customBody, mergedVars, brandName, siteUrl, supportEmail)
            : rendered.html;

        const textFallback = customBody
            ? replaceEmailVariables(customBody, mergedVars)
            : htmlToPlainText(rendered.html, finalActionUrl);

        const senderDomain = config.smtp?.username?.includes('@')
            ? config.smtp.username.split('@')[1]
            : (new URL(siteUrl).hostname || process.env.APP_DOMAIN || 'ai-resume-builder.local');
        const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2, 11)}@${senderDomain}>`;

        const mailOptions = {
            from: `"${config.smtp?.senderName || 'ResumePilot Enterprise'}" <${config.smtp?.senderEmail || config.smtp?.username}>`,
            replyTo: config.smtp?.replyTo || config.smtp?.username,
            to,
            subject: String(resolvedSubject || '').replace(/[\r\n\p{Cc}]/gu, ' ').trim().slice(0, 255),
            html: resolvedHtml,
            text: textFallback,
            messageId,
            headers: {
                'X-Mailer': 'ResumePilot Enterprise Mail Gateway/2.0',
                'X-Entity-Ref-ID': `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                'X-Auto-Response-Suppress': 'OOF, AutoReply',
                'MIME-Version': '1.0',
            }
        };

        const result = await dispatchMailWithFallback(config, mailOptions);
        await logOutboundEmail({
            to,
            subject: mailOptions.subject,
            templateType: templateType || 'custom',
            status: 'SENT',
            html: resolvedHtml,
            messageId: result.messageId,
            transport: result.transport
        });
        return { success: true, result };
    } catch (err) {
        // Separate "we are not set up to send mail" from "we tried and it
        // failed". Only the latter is an incident; the former is a known,
        // reportable configuration state.
        const notConfigured = err.code === 'EMAIL_NOT_CONFIGURED';
        if (notConfigured) {
            console.warn(`[Notification Not Configured] Template '${templateType}' to '${to}': ${err.message}`);
        } else {
            console.error(`[Notification Error] Template '${templateType}' to '${to}' failed:`, err.message);
        }
        await logOutboundEmail({
            to,
            subject: customSubject || `Notification (${templateType})`,
            templateType: templateType || 'custom',
            status: notConfigured ? 'NOT_CONFIGURED' : 'FAILED',
            error: err.message
        });
        return { success: false, error: err.message, code: notConfigured ? 'EMAIL_NOT_CONFIGURED' : 'EMAIL_DELIVERY_FAILED' };
    }
}

router.dispatchNotification = dispatchNotification;

module.exports = router;
module.exports.dispatchNotification = dispatchNotification;
module.exports.getEmailConfig = getEmailConfig;
module.exports.renderEmailTemplate = renderEmailTemplate;
module.exports.createTransporter = createTransporter;
module.exports.isTransportInfrastructureError = isTransportInfrastructureError;
module.exports.dispatchMailWithFallback = dispatchMailWithFallback;
module.exports.htmlToPlainText = htmlToPlainText;
module.exports._test = { normalizedMailSection, normalizeTemplateToggles, projectMailSection, renderEmailTemplate, formatCustomEmailBody, replaceEmailVariables, isTransportInfrastructureError, createTransporter, dispatchMailWithFallback };
