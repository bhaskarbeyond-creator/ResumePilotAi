/**
 * Automatic Event-Driven Email Notifier Service (10/10 Enterprise Coverage)
 * Automatically triggers emails across Auth, Billing, AI, Jobs, Security & Portfolios.
 */

const sendNotification = async (db, { to, templateType, vars, customSubject, customBody }) => {
    if (!to) return;
    try {
        const emailRoute = require('../routes/email');
        if (emailRoute && typeof emailRoute.dispatchNotification === 'function') {
            return await emailRoute.dispatchNotification(db, { to, templateType, vars, customSubject, customBody });
        }
    } catch (e) {
        console.warn(`[EmailNotifier Direct Error] Template '${templateType}' fallback:`, e.message);
    }

    // HTTP Fallback to /api/email/send-email endpoint
    try {
        const fetch = global.fetch || require('node-fetch');
        const port = process.env.PORT || 8080;
        await fetch(`http://localhost:${port}/api/email/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, templateType, customSubject, customBody, vars })
        });
    } catch (httpErr) {
        console.error(`[EmailNotifier HTTP Error] Template '${templateType}' failed:`, httpErr.message);
    }
};

class EmailNotifier {
    /**
     * 1. User Registration -> Trigger Welcome Email to User & Admin Alert
     */
    static async notifyUserRegistration(db, { userEmail, userName = 'Valued User' }) {
        if (!userEmail) return;

        // User Welcome
        sendNotification(db, {
            to: userEmail,
            templateType: 'welcome',
            vars: { candidate_name: userName, site_url: 'https://airesume.projectdemo.guru' }
        }).catch(err => console.error('[Notifier] Welcome trigger error:', err.message));

        // Admin Notification
        sendNotification(db, {
            to: 'bhaskar.beyond@gmail.com',
            templateType: 'account_created_admin',
            vars: { candidate_name: `${userName} (${userEmail})`, date: new Date().toLocaleDateString('en-IN') }
        }).catch(err => console.error('[Notifier] Account Admin Alert error:', err.message));
    }

    /**
     * 2. Password Reset Requested
     */
    static async notifyPasswordReset(db, { userEmail, userName = 'User', resetLink }) {
        if (!userEmail) return;
        return sendNotification(db, {
            to: userEmail,
            templateType: 'password_reset',
            vars: { candidate_name: userName, reset_link: resetLink }
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
     * 5. Payment Failure Alert
     */
    static async notifyPaymentFailed(db, { userEmail, userName = 'Customer', amount = '₹199.00', retryUrl = 'https://airesume.projectdemo.guru/pricing' }) {
        if (!userEmail) return;
        return sendNotification(db, {
            to: userEmail,
            templateType: 'payment_failed',
            vars: { candidate_name: userName, amount, retry_url: retryUrl }
        });
    }

    /**
     * 6. Subscription Renewal Notice
     */
    static async notifySubscriptionRenewal(db, { userEmail, userName = 'Customer', planName = 'Pro Plan', amount = '₹1,999.00', renewalDate }) {
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
    static async notifyRefundProcessed(db, { userEmail, invoiceNumber = 'RPAI-INV-1001', amount = '₹199.00' }) {
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
    static async notifyAIResumeReady(db, { userEmail, userName = 'Candidate', atsScore = '94' }) {
        if (!userEmail) return;
        return sendNotification(db, {
            to: userEmail,
            templateType: 'ai_resume_ready',
            vars: { candidate_name: userName, ats_score: atsScore, site_url: 'https://airesume.projectdemo.guru' }
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
                ip_address: ipAddress || '103.211.54.12',
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
     * 16. Admin Operational System Alert
     */
    static async notifyAdminSystemAlert(db, { alertTitle, alertMessage }) {
        return sendNotification(db, {
            to: 'bhaskar.beyond@gmail.com',
            templateType: 'admin_system_alert',
            vars: { alert_title: alertTitle, alert_message: alertMessage }
        });
    }
}

module.exports = EmailNotifier;
