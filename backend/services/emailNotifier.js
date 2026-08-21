/**
 * Event-driven email notification service
 * Automatically triggers emails across Auth, Billing, AI, Jobs, Security & Portfolios.
 * 
 * FIX: Admin email is now resolved dynamically from DB/SMTP config — never hardcoded.
 */

/**
 * Resolve the admin email from Firestore SMTP settings.
 * Falls back to a series of env vars if DB is unavailable.
 */
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

async function getAdminEmail(db) {
    // Priority 1: Unified Email Config via backend/routes/email.js (reads local JSON + Firestore data/system_settings)
    try {
        const emailRoute = require('../routes/email');
        if (emailRoute && typeof emailRoute.getEmailConfig === 'function') {
            const cfg = await emailRoute.getEmailConfig(db);
            if (cfg?.smtp?.adminEmail && cfg.smtp.adminEmail.includes('@')) {
                return cfg.smtp.adminEmail;
            }
        }
    } catch (e) {
        // Non-fatal — proceed to fallback checks
    }

    // Priority 2: Direct Firestore fallback across all known namespaces
    if (db) {
        try {
            const sysDoc = await db.collection('data').doc('system_settings').get();
            if (sysDoc.exists) {
                const data = sysDoc.data() || {};
                const adminEmail = data.smtp?.adminEmail || data.adminEmail;
                if (adminEmail && adminEmail.includes('@')) return adminEmail;
            }
        } catch (_) {}

        try {
            const doc = await db.collection('settings').doc('smtp').get();
            if (doc.exists) {
                const data = doc.data() || {};
                const adminEmail = data.adminEmail || data.smtp?.adminEmail || data.username;
                if (adminEmail && adminEmail.includes('@')) return adminEmail;
            }
        } catch (_) {}
    }

    // Priority 3: Environment variable fallback
    const envAdmin = process.env.ADMIN_EMAIL || process.env.SMTP_ADMIN_EMAIL || process.env.SMTP_USERNAME;
    if (envAdmin && envAdmin.includes('@')) return envAdmin;

    return null;
}

const sendNotification = async (db, { to, templateType, vars, customSubject, customBody }) => {
    if (!to) return { success: false, deliveryState: 'DELIVERY_FAILED', error: 'Notification recipient unavailable' };
    try {
        const emailRoute = require('../routes/email');
        if (emailRoute && typeof emailRoute.dispatchNotification === 'function') {
            const result = await emailRoute.dispatchNotification(db, { to, templateType, vars, customSubject, customBody });
            return result?.success
                ? { success: true, deliveryState: 'DELIVERY_ATTEMPTED', providerAccepted: true }
                : { success: false, deliveryState: 'DELIVERY_FAILED', error: result?.error || 'Provider rejected delivery attempt' };
        }
    } catch (e) {
        console.warn(`[EmailNotifier Direct Error] Template '${templateType}' fallback:`, e.message);
        return { success: false, deliveryState: 'DELIVERY_FAILED', error: e.message };
    }
    return { success: false, deliveryState: 'DELIVERY_FAILED', error: 'Email dispatcher unavailable' };
};

class EmailNotifier {
    /**
     * 1. User Registration → Trigger Welcome Email to User & Admin Alert
     */
    static async notifyUserRegistration(db, { userEmail, userName = 'Valued User' }) {
        if (!userEmail) return;
        const name = humanizeName(userName || userEmail, 'Valued Member');
        const userDelivery = await sendNotification(db, {
            to: userEmail,
            templateType: 'welcome',
            vars: { candidate_name: name, user_name: name, site_url: `${process.env.PROTOCOL || 'https'}://${process.env.WEBSITE_NAME || 'airesume.projectdemo.guru'}` }
        });
        const adminEmail = await getAdminEmail(db);
        const adminDelivery = adminEmail
            ? await sendNotification(db, { to: adminEmail, templateType: 'account_created_admin', vars: { candidate_name: `${name} (${userEmail})`, date: new Date().toLocaleDateString('en-IN') } })
            : { success: false, deliveryState: 'DELIVERY_FAILED', error: 'Admin recipient unavailable' };
        return { userDelivery, adminDelivery };
    }

    /**
     * 2. Password Reset Requested
     */
    static async notifyPasswordReset(db, { userEmail, userName = 'User', resetLink }) {
        if (!userEmail) return;
        const name = humanizeName(userName || userEmail, 'User');
        return sendNotification(db, {
            to: userEmail,
            templateType: 'password_reset',
            vars: { candidate_name: name, user_name: name, reset_link: resetLink }
        });
    }

    /**
     * 3. Password Changed Confirmation
     */
    static async notifyPasswordChanged(db, { userEmail, userName = 'User' }) {
        if (!userEmail) return;
        return sendNotification(db, {
            to: userEmail,
            templateType: 'password_changed_confirm',
            vars: { candidate_name: userName, date: new Date().toLocaleDateString('en-IN') }
        });
    }

    /**
     * 4. Email OTP Verification Code
     */
    static async notifyEmailOTP(db, { userEmail, userName = 'User', otpCode }) {
        if (!userEmail) return;
        return sendNotification(db, {
            to: userEmail,
            templateType: 'email_verification',
            vars: { candidate_name: userName, otp_code: otpCode }
        });
    }

    /**
     * 4b. Email Verification Link (Crypto Signed)
     */
    static async notifyEmailVerificationLink(db, { userEmail, userName = 'User', verificationLink }) {
        if (!userEmail) return;
        return sendNotification(db, {
            to: userEmail,
            templateType: 'email_verification',
            vars: { candidate_name: userName, verification_link: verificationLink }
        });
    }

    /**
     * 5. Payment Failure Alert
     */
    static async notifyPaymentFailed(db, { userEmail, userName = 'Customer', amount = 'Amount unavailable', retryUrl }) {
        if (!userEmail) return;
        const siteUrl = `${process.env.PROTOCOL || 'https'}://${process.env.WEBSITE_NAME || 'airesume.projectdemo.guru'}`;
        return sendNotification(db, {
            to: userEmail,
            templateType: 'payment_failed',
            vars: { candidate_name: userName, amount, retry_url: retryUrl || `${siteUrl}/pricing` }
        });
    }

    /**
     * 6. Subscription Renewal Notice
     */
    static async notifySubscriptionRenewal(db, { userEmail, userName = 'Customer', planName = 'Plan unavailable', amount = 'Amount unavailable', renewalDate }) {
        if (!userEmail) return;
        return sendNotification(db, {
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
    static async notifySubscriptionCancelled(db, { userEmail, userName = 'Customer', planName = 'Pro Plan' }) {
        if (!userEmail) return;
        return sendNotification(db, {
            to: userEmail,
            templateType: 'subscription_cancelled',
            vars: { candidate_name: userName, plan_name: planName }
        });
    }

    /**
     * 8. Refund Processed Confirmation
     */
    static async notifyRefundProcessed(db, { userEmail, invoiceNumber = 'Invoice unavailable', amount = 'Amount unavailable' }) {
        if (!userEmail) return;
        return sendNotification(db, {
            to: userEmail,
            templateType: 'refund_processed',
            vars: { invoice_number: invoiceNumber, amount }
        });
    }

    /**
     * 9. AI Resume Ready Completed Alert
     */
    static async notifyAIResumeReady(db, { userEmail, userName = 'Candidate', atsScore = 'Not measured' }) {
        if (!userEmail) return;
        const siteUrl = `${process.env.PROTOCOL || 'https'}://${process.env.WEBSITE_NAME || 'airesume.projectdemo.guru'}`;
        return sendNotification(db, {
            to: userEmail,
            templateType: 'ai_resume_ready',
            vars: { candidate_name: userName, ats_score: atsScore, site_url: siteUrl }
        });
    }

    /**
     * 10. AI Cover Letter Ready Completed Alert
     */
    static async notifyAICoverLetterReady(db, { userEmail, userName = 'Candidate', jobTitle = 'Software Engineer' }) {
        if (!userEmail) return;
        return sendNotification(db, {
            to: userEmail,
            templateType: 'ai_cover_letter_ready',
            vars: { candidate_name: userName, job_title: jobTitle }
        });
    }

    /**
     * 11. Job Application Received (Recruiter Alert)
     */
    static async notifyJobApplicationReceived(db, { recruiterEmail, applicantName, jobTitle, companyName }) {
        if (!recruiterEmail) return;
        return sendNotification(db, {
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
    static async notifyJobStatusUpdate(db, { applicantEmail, applicantName, jobTitle, companyName, status }) {
        if (!applicantEmail) return;
        return sendNotification(db, {
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
    static async notifyJobPosted(db, { employerEmail, jobTitle, companyName }) {
        if (!employerEmail) return;
        return sendNotification(db, {
            to: employerEmail,
            templateType: 'job_posted_employer',
            vars: { job_title: jobTitle, company_name: companyName }
        });
    }

    /**
     * 14. Security Alert (Unrecognized Device Sign-In)
     */
    static async notifySecurityAlert(db, { userEmail, deviceInfo, ipAddress }) {
        if (!userEmail) return;
        return sendNotification(db, {
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
    static async notifyPortfolioPublished(db, { userEmail, userName, portfolioSlug }) {
        if (!userEmail) return;
        return sendNotification(db, {
            to: userEmail,
            templateType: 'portfolio_published',
            vars: { candidate_name: userName, portfolio_slug: portfolioSlug }
        });
    }

    /**
     * 16. Admin Operational System Alert — dynamically resolves admin email from DB config
     */
    static async notifyAdminSystemAlert(db, { alertTitle, alertMessage }) {
        const adminEmail = await getAdminEmail(db);
        if (!adminEmail) {
            console.warn('[EmailNotifier] Admin email not configured — skipping system alert:', alertTitle);
            return;
        }
        return sendNotification(db, {
            to: adminEmail,
            templateType: 'admin_system_alert',
            vars: { alert_title: alertTitle, alert_message: alertMessage }
        });
    }

    /**
     * 17. OAuth Social Login — new user via LinkedIn/GitHub
     */
    /**
     * Enterprise tenant invitation → invitee receives access instructions
     */
    static async notifyEnterpriseInvitation(db, { userEmail, organizationName = 'an enterprise organization', inviterEmail = '', roleTitle = 'Enterprise Member', actionUrl = '' }) {
        if (!userEmail) return { success: false, deliveryState: 'DELIVERY_FAILED', error: 'Invitation recipient unavailable' };
        const siteUrl = `${process.env.PROTOCOL || 'https'}://${process.env.WEBSITE_NAME || 'airesume.projectdemo.guru'}`;
        const url = actionUrl || `${siteUrl}/enterprise`;
        const humanName = humanizeName(userEmail, 'Team Member');
        const humanInviter = humanizeName(inviterEmail, 'Your team administrator');
        const humanOrg = humanizeOrgName(organizationName, 'your enterprise workspace');
        const humanRoleTitle = humanizeRole(roleTitle, 'Enterprise Team Member');

        return sendNotification(db, {
            to: userEmail,
            templateType: 'enterprise-invitation',
            vars: {
                user_name: humanName,
                candidate_name: humanName,
                inviter_name: humanInviter,
                organization_name: humanOrg,
                role_title: humanRoleTitle,
                action_url: url,
                expires_in: '7 days',
            },
            customSubject: `You're invited to join ${humanOrg} on ResumePilot Enterprise`,
            customBody: [
                `Hi ${humanName},`,
                ``,
                `${humanInviter} has invited you to join the **${humanOrg}** team workspace on ResumePilot AI.`,
                ``,
                `**Your Assigned Role:** ${humanRoleTitle}`,
                ``,
                `As part of this workspace, you'll have full access to our collaborative resume builders, AI-assisted content generators, team templates, and candidate evaluation tools.`,
                ``,
                `To activate your workspace access and get started, simply click the link below:`,
                `${url}`,
                ``,
                `*Note: For your security, this invitation remains active for 7 days. If you weren't expecting this invitation, feel free to ignore this email or reach out to ${humanInviter}.*`,
                ``,
                `Warm regards,`,
                `The ${humanOrg} Team`,
            ].join('\n'),
        });
    }

    static async notifyOAuthNewUser(db, { userEmail, userName = 'User', provider = 'Social' }) {
        if (!userEmail) return;
        const siteUrl = `${process.env.PROTOCOL || 'https'}://${process.env.WEBSITE_NAME || 'airesume.projectdemo.guru'}`;
        // Send user welcome email
        sendNotification(db, {
            to: userEmail,
            templateType: 'welcome',
            vars: { candidate_name: userName, site_url: siteUrl }
        }).catch(err => console.error('[Notifier] OAuth Welcome error:', err.message));

        // Admin alert — dynamically resolved
        getAdminEmail(db).then(adminEmail => {
            if (!adminEmail) return;
            sendNotification(db, {
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

