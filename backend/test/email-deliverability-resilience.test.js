const test = require('node:test');
const assert = require('node:assert/strict');
const emailRoutes = require('../routes/email');

test('Email Resilience & Anti-Spam Test Suite', async (t) => {
    
    await t.test('1. Error discriminator distinguishes transport outages from recipient rejections', () => {
        // Transport infrastructure errors MUST be recognized
        const connRefused = new Error('connect ECONNREFUSED 127.0.0.1:465');
        connRefused.code = 'ECONNREFUSED';
        assert.equal(emailRoutes.isTransportInfrastructureError(connRefused), true);

        const timedOut = new Error('Connection timeout');
        timedOut.code = 'ETIMEDOUT';
        assert.equal(emailRoutes.isTransportInfrastructureError(timedOut), true);

        const greetingTimeout = new Error('Greeting timeout');
        assert.equal(emailRoutes.isTransportInfrastructureError(greetingTimeout), true);

        const authFailed = new Error('Invalid login credentials');
        authFailed.code = 'EAUTH';
        assert.equal(emailRoutes.isTransportInfrastructureError(authFailed), true);

        // Recipient rejections MUST NOT be treated as transport outages
        const userUnknown = new Error('550 5.1.1 <fakeuser@nonexistentdomain.org>: Recipient address rejected: User unknown');
        userUnknown.responseCode = 550;
        assert.equal(emailRoutes.isTransportInfrastructureError(userUnknown), false);

        const mailboxFull = new Error('552 5.2.2 Mailbox is full / quota exceeded for recipient');
        mailboxFull.responseCode = 552;
        assert.equal(emailRoutes.isTransportInfrastructureError(mailboxFull), false);

        const invalidRecipient = new Error('553 5.1.3 Invalid recipient syntax');
        invalidRecipient.responseCode = 553;
        assert.equal(emailRoutes.isTransportInfrastructureError(invalidRecipient), false);
    });

    await t.test('2. Transporter configuration enforces resilient timeouts and TLS 1.2+', () => {
        const transporter = emailRoutes.createTransporter({
            host: 'smtp.hostinger.com',
            port: 465,
            encryption: 'ssl',
            username: 'test@airesume.projectdemo.guru',
            password: 'secret_password'
        });

        assert.ok(transporter.options.connectionTimeout >= 15000, 'connectionTimeout must be >= 15s');
        assert.ok(transporter.options.greetingTimeout >= 10000, 'greetingTimeout must be >= 10s');
        assert.ok(transporter.options.socketTimeout >= 20000, 'socketTimeout must be >= 20s');
        assert.equal(transporter.options.secure, true);
        assert.equal(transporter.options.tls.servername, 'smtp.hostinger.com');
        assert.equal(transporter.options.tls.minVersion, 'TLSv1.2');
        assert.equal(transporter.options.tls.rejectUnauthorized, true);
    });

    await t.test('3. Template subject lines are free from spam-trigger emojis and aggressive hype buzzwords', () => {
        const templatesToTest = [
            'welcome',
            'password_reset',
            'email_verification',
            'payment_failed',
            'subscription_renewal',
            'ai_resume_ready',
            'job_application_received',
            'job_status_update',
            'security_alert',
            'account_created_admin',
            'password_changed_confirm',
            'refund_processed',
            'subscription_cancelled',
            'ai_cover_letter_ready',
            'portfolio_published',
            'job_posted_employer',
            'admin_system_alert',
            'broadcast_announcement',
            'enterprise-invitation',
            'enterprise_role_update',
            'enterprise_workspace_assignment',
            'enterprise_security_alert',
            'enterprise_quota_alert',
        ];

        // Unicode emoji regex range
        const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{238C}-\u{2454}\u{20D0}-\u{20FF}]/u;

        for (const tmpl of templatesToTest) {
            const rendered = emailRoutes.renderEmailTemplate(tmpl, {
                candidate_name: 'Alex Johnson',
                invoice_number: 'RPAI-998811',
                amount: 'INR 499.00',
                plan_name: 'Pro Lifetime',
                brand_name: 'ResumePilot AI',
                site_url: 'https://airesume.projectdemo.guru',
                support_email: 'support@airesume.projectdemo.guru',
                job_title: 'Full Stack Engineer',
                company_name: 'Acme Corp',
                otp_code: '581923',
                ats_score: '94',
                workspace_name: 'Core Engineering',
                role_title: 'Senior Engineer',
                organization_name: 'Acme Global',
                action_url: 'https://airesume.projectdemo.guru/app'
            });

            assert.ok(rendered.subject, `Template '${tmpl}' must have a subject`);
            assert.equal(
                emojiRegex.test(rendered.subject),
                false,
                `Template '${tmpl}' subject line "${rendered.subject}" contains spam-triggering emojis!`
            );
            assert.ok(rendered.html.length > 50, `Template '${tmpl}' must render valid HTML`);
        }
    });

    await t.test('4. Outbound headers NEVER inject damaging Auto-Submitted on transactional messages', async () => {
        const dummyConfig = {
            smtp: {
                host: 'smtp.hostinger.com',
                port: 465,
                encryption: 'ssl',
                username: 'no-reply@airesume.projectdemo.guru',
                password: 'dummy'
            }
        };

        const mailOptions = {
            to: 'candidate@example.com',
            subject: 'Test Subject',
            html: '<p>Test body</p>'
        };

        // We simulate calling dispatchMailWithFallback intercepting createTransporter
        const originalCreateTransporter = emailRoutes.createTransporter;
        let sentOptions = null;
        try {
            // Stub createTransporter to capture mail options
            const nodemailer = require('nodemailer');
            const originalCreateTransport = nodemailer.createTransport;
            nodemailer.createTransport = (opts) => ({
                sendMail: async (mo) => {
                    sentOptions = mo;
                    return { messageId: '<test-message-id@airesume.projectdemo.guru>' };
                }
            });

            const result = await emailRoutes.dispatchMailWithFallback(dummyConfig, mailOptions);
            assert.ok(result.success);
            assert.ok(sentOptions);
            assert.equal(sentOptions.headers['Auto-Submitted'], undefined, 'Auto-Submitted must NOT be set on transactional user emails');
            assert.ok(sentOptions.text, 'text plain fallback must be auto-generated from HTML');
            assert.ok(sentOptions.headers['X-Mailer'], 'X-Mailer must be set');
            assert.ok(sentOptions.messageId, 'Message-ID must be set');
            assert.ok(sentOptions.headers['Date'], 'RFC 2822 Date header must be set');

            nodemailer.createTransport = originalCreateTransport;
        } finally {
            emailRoutes.createTransporter = originalCreateTransporter;
        }
    });

});
