/**
 * Event-driven email notification service
 * Automatically triggers emails across Auth, Billing, AI, Jobs, Security & Portfolios.
 * 
 * FIX: Admin email is now resolved dynamically from DB/SMTP config — never hardcoded.
 */

const crypto = require('crypto');
const { getPool } = require('../database/mysql');
const { queueEmail } = require('./notificationOutbox');

/** Resolve the administrative recipient through the MariaDB-owned mail runtime. */
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

async function getAdminEmail() {
    const emailRoute = require('../routes/email');
    if (!emailRoute || typeof emailRoute.getEmailConfig !== 'function') {
        throw Object.assign(new Error('Email configuration service is unavailable'), { code: 'EMAIL_CONFIGURATION_UNAVAILABLE', status: 503 });
    }
    const config = await emailRoute.getEmailConfig();
    const adminEmail = String(config?.smtp?.adminEmail || '').trim().toLowerCase();
    if (!adminEmail) return null;
    if (!/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(adminEmail)) {
        throw Object.assign(new Error('Administrative email recipient is invalid'), { code: 'EMAIL_CONFIGURATION_INVALID', status: 503 });
    }
    return adminEmail;
}

const { resolvePublicAppOrigin } = require('./publicAppUrl');

function publicSiteOrigin() {
    return resolvePublicAppOrigin();
}

/**
 * Delivery states are deliberately three-valued. Collapsing NOT_CONFIGURED into
 * DELIVERY_FAILED is what previously made an unconfigured SMTP account look
 * like a mail outage, and drove notification endpoints to answer 502 on a
 * perfectly healthy deployment that simply has no mail provider yet.
 */
const SENSITIVE_TEMPLATES = new Set(['password_reset', 'email_verification']);
const sendNotification = async ({ to, templateType, vars, customSubject, customBody, eventId = null }) => {
    if (!to) return { success: false, deliveryState: 'DELIVERY_FAILED', error: 'Notification recipient unavailable' };
    const identity = eventId || `notification:${templateType}:${crypto.randomUUID()}`;
    const notificationId = await queueEmail(getPool(), {
        eventId: identity,
        recipient: to,
        templateType,
        vars: vars || {},
        metadata: { source: 'server_notification_service', customSubject, customBody },
        idempotencyKey: identity,
        sensitive: SENSITIVE_TEMPLATES.has(templateType),
    });
    return { success: true, deliveryState: 'NOTIFICATION_QUEUED', providerAccepted: false, notificationId };
};

class EmailNotifier {
    /**
     * 1. User Registration → Trigger Welcome Email to User & Admin Alert
     */
    static async notifyUserRegistration({ userEmail, userName = 'Valued User' }) {
        if (!userEmail) return;
        const name = humanizeName(userName || userEmail, 'Valued Member');
        const userDelivery = await sendNotification({
            to: userEmail,
            templateType: 'welcome',
            vars: { candidate_name: name, user_name: name, site_url: publicSiteOrigin() }
        });
        const adminEmail = await getAdminEmail();
        const adminDelivery = adminEmail
            ? await sendNotification({ to: adminEmail, templateType: 'account_created_admin', vars: { candidate_name: `${name} (${userEmail})`, date: new Date().toLocaleDateString('en-IN') } })
            : { success: false, deliveryState: 'DELIVERY_FAILED', error: 'Admin recipient unavailable' };
        return { userDelivery, adminDelivery };
    }

    /**
     * 2. Password Reset Requested
     */
    static async notifyPasswordReset({ userEmail, userName = 'User', resetLink }) {
        if (!userEmail) return;
        const name = humanizeName(userName || userEmail, 'User');
        return sendNotification({
            to: userEmail,
            templateType: 'password_reset',
            vars: { candidate_name: name, user_name: name, reset_link: resetLink }
        });
    }

    /**
     * 3. Password Changed Confirmation
     */
    static async notifyPasswordChanged({ userEmail, userName = 'User' }) {
        if (!userEmail) return;
        return sendNotification({
            to: userEmail,
            templateType: 'password_changed_confirm',
            vars: { candidate_name: userName, date: new Date().toLocaleDateString('en-IN') }
        });
    }

    /**
     * 4. Email OTP Verification Code
     */
    static async notifyEmailOTP({ userEmail, userName = 'User', otpCode }) {
        if (!userEmail) return;
        return sendNotification({
            to: userEmail,
            templateType: 'email_verification',
            vars: { candidate_name: userName, otp_code: otpCode }
        });
    }

    /**
     * 4b. Email Verification Link (Crypto Signed)
     */
    static async notifyEmailVerificationLink({ userEmail, userName = 'User', verificationLink }) {
        if (!userEmail) return;
        return sendNotification({
            to: userEmail,
            templateType: 'email_verification',
            vars: { candidate_name: userName, verification_link: verificationLink }
        });
    }

    /**
     * 5. Payment Failure Alert
     */
    static async notifyPaymentFailed({ userEmail, userName = 'Customer', amount = 'Amount unavailable', retryUrl }) {
        if (!userEmail) return;
        const siteUrl = publicSiteOrigin();
        return sendNotification({
            to: userEmail,
            templateType: 'payment_failed',
            vars: { candidate_name: userName, amount, retry_url: retryUrl || `${siteUrl}/pricing` }
        });
    }

    /**
     * 6. Subscription Renewal Notice
     */
    static async notifySubscriptionRenewal({ userEmail, userName = 'Customer', planName = 'Plan unavailable', amount = 'Amount unavailable', renewalDate }) {
        if (!userEmail) return;
        return sendNotification({
            to: userEmail,
            templateType: 'subscription_renewal',
            vars: {
                candidate_name: userName,
                plan_name: planName,
                amount,
                date: renewalDate || new Date(Date.now() + 86400000 * 7).toLocaleDateString('en-IN')
            }
        });
    }

    /**
     * 7. Subscription Cancellation Confirmation
     */
    static async notifySubscriptionCancelled({ userEmail, userName = 'Customer', planName = 'Pro Plan' }) {
        if (!userEmail) return;
        return sendNotification({
            to: userEmail,
            templateType: 'subscription_cancelled',
            vars: { candidate_name: userName, plan_name: planName }
        });
    }

    /**
     * 8. Refund Processed Confirmation
     */
    static async notifyRefundProcessed({ userEmail, invoiceNumber = 'Invoice unavailable', amount = 'Amount unavailable' }) {
        if (!userEmail) return;
        return sendNotification({
            to: userEmail,
            templateType: 'refund_processed',
            vars: { invoice_number: invoiceNumber, amount }
        });
    }

    /**
     * 9. AI Resume Ready Completed Alert
     */
    static async notifyAIResumeReady({ userEmail, userName = 'Candidate', atsScore = 'Not measured', eventId = null }) {
        if (!userEmail) return;
        const siteUrl = publicSiteOrigin();
        return sendNotification({
            to: userEmail,
            templateType: 'ai_resume_ready',
            vars: { candidate_name: userName, ats_score: atsScore, site_url: siteUrl },
            eventId
        });
    }

    /**
     * 10. AI Cover Letter Ready Completed Alert
     */
    static async notifyAICoverLetterReady({ userEmail, userName = 'Candidate', jobTitle = 'Software Engineer' }) {
        if (!userEmail) return;
        return sendNotification({
            to: userEmail,
            templateType: 'ai_cover_letter_ready',
            vars: { candidate_name: userName, job_title: jobTitle }
        });
    }

    /**
     * 11. Job Application Received (Recruiter Alert)
     */
    static async notifyJobApplicationReceived({ recruiterEmail, applicantName, jobTitle, companyName }) {
        if (!recruiterEmail) return;
        return sendNotification({
            to: recruiterEmail,
            templateType: 'job_application_received',
            vars: {
                candidate_name: applicantName,
                job_title: jobTitle,
                company_name: companyName,
                date: new Date().toLocaleDateString('en-IN')
            }
        });
    }

    /**
     * 12. Application Status Update (Candidate Alert)
     */
    static async notifyJobStatusUpdate({ applicantEmail, applicantName, jobTitle, companyName, status }) {
        if (!applicantEmail) return;
        return sendNotification({
            to: applicantEmail,
            templateType: 'job_status_update',
            vars: {
                candidate_name: applicantName,
                job_title: jobTitle,
                company_name: companyName,
                application_status: status
            }
        });
    }

    /**
     * 13. Job Posted Confirmation (Employer Alert)
     */
    static async notifyJobPosted({ employerEmail, jobTitle, companyName }) {
        if (!employerEmail) return;
        return sendNotification({
            to: employerEmail,
            templateType: 'job_posted_employer',
            vars: { job_title: jobTitle, company_name: companyName }
        });
    }

    /**
     * 14. Security Alert (Unrecognized Device Sign-In)
     */
    static async notifySecurityAlert({ userEmail, deviceInfo, ipAddress }) {
        if (!userEmail) return;
        return sendNotification({
            to: userEmail,
            templateType: 'security_alert',
            vars: {
                device_info: deviceInfo || 'Chrome on Windows',
                ip_address: ipAddress || 'Unknown',
                login_time: new Date().toUTCString()
            }
        });
    }

    /**
     * 15. Web Portfolio Published Alert
     */
    static async notifyPortfolioPublished({ userEmail, userName, portfolioSlug }) {
        if (!userEmail) return;
        return sendNotification({
            to: userEmail,
            templateType: 'portfolio_published',
            vars: { candidate_name: userName, portfolio_slug: portfolioSlug }
        });
    }

    /**
     * 16. Admin Operational System Alert — dynamically resolves admin email from DB config
     */
    static async notifyAdminSystemAlert({ alertTitle, alertMessage }) {
        const adminEmail = await getAdminEmail();
        if (!adminEmail) {
            console.warn('[EmailNotifier] Admin email not configured — skipping system alert:', alertTitle);
            return;
        }
        return sendNotification({
            to: adminEmail,
            templateType: 'admin_system_alert',
            vars: { alert_title: alertTitle, alert_message: alertMessage }
        });
    }

    /** OAuth Social Login — new user via a federated provider. */
    static async notifyOAuthNewUser({ userEmail, userName = 'User', provider = 'Social' }) {
        if (!userEmail) return;
        const siteUrl = publicSiteOrigin();
        // Send user welcome email
        sendNotification({
            to: userEmail,
            templateType: 'welcome',
            vars: { candidate_name: userName, site_url: siteUrl }
        }).catch(err => console.error('[Notifier] OAuth Welcome error:', err.message));

        // Admin alert — dynamically resolved
        getAdminEmail().then(adminEmail => {
            if (!adminEmail) return;
            sendNotification({
                to: adminEmail,
                templateType: 'account_created_admin',
                vars: {
                    candidate_name: `${userName} (${userEmail}) via ${provider}`,
                    date: new Date().toLocaleDateString('en-IN')
                }
            }).catch(() => {});
        }).catch(() => {});
    }
}

module.exports = EmailNotifier;
module.exports.EmailNotifier = EmailNotifier;
module.exports.default = EmailNotifier;

