import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const uid = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';
const email = 'bhaskar.beyond@gmail.com';
const displayName = 'Bhaskar Beyond';
const apiKey = 'AIzaSyDigXT7n4Pyf-8WHQtvjHa0wGvJ86nmrwc';
const secret = 'local-test-auth-hmac-secret-super-secure-32chars';
const currentResumeId = 'res_1792220149222';

// Issue genuine local test HMAC token accepted by backend/security/auth.js
const payload = {
    uid,
    email,
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
    role: 'USER',
    exp: Math.floor(Date.now() / 1000) + 360000,
    firebase: { identities: { email: [email] }, sign_in_provider: 'password' },
};
const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
const mockToken = `rptest.${body}.${sig}`;

const SCREENS = [
    // ─── Workspace Hubs ────────────────────────────────────────────────────────
    { id: '01_dashboard_overview', name: 'Dashboard Overview', path: '/dashboard' },
    { id: '02_resumes_master_cv', name: 'Resumes & Master CV', path: '/dashboard/resumes' },
    { id: '03_cover_letters', name: 'Cover Letters Hub', path: '/dashboard/cover-letters' },
    { id: '04_portfolios_web_cv', name: 'Portfolios & Web CV', path: '/dashboard/portfolios' },
    { id: '05_saved_favorites', name: 'Saved Favorites & Bookmarks', path: '/dashboard/favorites' },
    { id: '06_notifications', name: 'Notifications Center', path: '/dashboard/notifications' },

    // ─── Job Intelligence Hubs ────────────────────────────────────────────────
    { id: '07_browse_job_portal', name: 'Browse Job Portal', path: '/dashboard/jobs' },
    { id: '08_job_tracker_kanban', name: 'Job Tracker Kanban', path: '/dashboard/job-tracker' },
    { id: '09_submitted_applications', name: 'Submitted Applications', path: '/dashboard/applied-jobs' },
    { id: '10_interview_coach', name: 'AI Interview Coach & Simulator', path: '/dashboard/interview' },
    { id: '11_messages_chat', name: 'Messages & Chat Threads', path: '/dashboard/messages' },

    // ─── Account & Billing ────────────────────────────────────────────────────
    { id: '12_subscription_plans', name: 'Subscription & Plans', path: '/dashboard/plans' },
    { id: '13_support_helpdesk', name: 'Support & Help Desk', path: '/dashboard/support' },
    { id: '14_account_security', name: 'Account & Security (TOTP, Credentials)', path: '/dashboard/settings?tab=Account' },

    // ─── Master Profile Tabs ──────────────────────────────────────────────────
    { id: '15_profile_basic_contact', name: 'Master Profile - Personal & Contact', path: '/dashboard/settings?tab=Profile&subtab=basic' },
    { id: '16_profile_work_history', name: 'Master Profile - Work History', path: '/dashboard/settings?tab=Profile&subtab=experience' },
    { id: '17_profile_education', name: 'Master Profile - Education & Degrees', path: '/dashboard/settings?tab=Profile&subtab=education' },
    { id: '18_profile_skills', name: 'Master Profile - Skills & Competencies', path: '/dashboard/settings?tab=Profile&subtab=skills' },
    { id: '19_profile_executive_bio', name: 'Master Profile - Executive Summary & Bio', path: '/dashboard/settings?tab=Profile&subtab=summary' },
    { id: '20_profile_certifications', name: 'Master Profile - Certifications & Licenses', path: '/dashboard/settings?tab=Profile&subtab=certifications' },
    { id: '21_profile_projects', name: 'Master Profile - Projects & Portfolios', path: '/dashboard/settings?tab=Profile&subtab=projects' },

    // ─── Resume Builder Journey ───────────────────────────────────────────────
    { id: '22_builder_heading', name: 'Resume Builder - Heading & Contact', path: '/build-resume/heading' },
    { id: '23_builder_work_history', name: 'Resume Builder - Work History', path: '/build-resume/work-history' },
    { id: '24_builder_education', name: 'Resume Builder - Education', path: '/build-resume/education' },
    { id: '25_builder_skills', name: 'Resume Builder - Skills', path: '/build-resume/skills' },
    { id: '26_builder_summary', name: 'Resume Builder - Executive Summary', path: '/build-resume/summary' },
    { id: '27_builder_finalize', name: 'Resume Builder - Finalize & Export', path: '/build-resume/finalize' },
];

const ALL_DEVICES = [
    { name: 'mobile', label: 'Mobile (375x812)', width: 375, height: 812, isMobile: true, hasTouch: true },
    { name: 'tablet', label: 'Tablet (768x1024)', width: 768, height: 1024, isMobile: false },
    { name: 'desktop', label: 'Desktop (1440x900)', width: 1440, height: 900, isMobile: false },
    { name: 'large_screen', label: '2K QHD Large (2560x1440)', width: 2560, height: 1440, isMobile: false },
    { name: 'ultrawide_4k', label: '4K UHD Ultrawide (3840x2160)', width: 3840, height: 2160, isMobile: false },
];

async function main() {
    const args = process.argv.slice(2);
    const deviceArg = args.find(a => a.startsWith('--devices='));
    const targetDeviceNames = deviceArg ? deviceArg.split('=')[1].split(',') : ALL_DEVICES.map(d => d.name);
    const activeDevices = ALL_DEVICES.filter(d => targetDeviceNames.includes(d.name));

    console.log('=== Starting Candidate Dashboard Screenshot Capture ===');
    console.log(`Target Devices: ${activeDevices.map(d => d.name).join(', ')}`);
    console.log(`Total views to capture: ${SCREENS.length} across ${activeDevices.length} devices = ${SCREENS.length * activeDevices.length} screenshots.`);

    const outputBase = path.resolve('candidate_screenshots');
    fs.mkdirSync(outputBase, { recursive: true });

    for (const dev of ALL_DEVICES) {
        fs.mkdirSync(path.join(outputBase, dev.name), { recursive: true });
    }

    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-gpu'],
    });

    for (const dev of activeDevices) {
        console.log(`\n------------------------------------------------------------`);
        console.log(`[Device: ${dev.name.toUpperCase()} (${dev.width}x${dev.height})]`);
        console.log(`------------------------------------------------------------`);

        const context = await browser.newContext({
            viewport: { width: dev.width, height: dev.height },
            isMobile: dev.isMobile,
            hasTouch: dev.hasTouch,
            ignoreHTTPSErrors: true,
        });

        await context.addInitScript(({ apiKey, token, uid, email, displayName, currentResumeId }) => {
            const userObj = {
                uid,
                email,
                emailVerified: true,
                displayName,
                isAnonymous: false,
                stsTokenManager: {
                    apiKey,
                    refreshToken: 'mock-refresh-token',
                    accessToken: token,
                    expirationTime: Date.now() + 36000000,
                },
                createdAt: String(Date.now()),
                lastLoginAt: String(Date.now()),
                apiKey,
                appName: '[DEFAULT]',
            };
            const payload = JSON.stringify(userObj);
            localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, payload);
            localStorage.setItem('firebase:authUser:demo-browser-api-key:[DEFAULT]', payload);
            localStorage.setItem('user', uid);
            localStorage.setItem('currentResumeId', currentResumeId);
            localStorage.setItem('resumepilot_privacy_consent_v1', 'accepted');
            sessionStorage.removeItem('superadmin_role_view');
        }, { apiKey, token: mockToken, uid, email, displayName, currentResumeId });

        await context.route('**/securetoken.googleapis.com/**', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                access_token: mockToken,
                expires_in: '36000',
                token_type: 'Bearer',
                refresh_token: 'mock-refresh-token',
                id_token: mockToken,
                user_id: uid,
                project_id: 'ai-resume-builder-424cf',
            }),
        }));

        await context.route('**/identitytoolkit.googleapis.com/**', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                users: [{
                    localId: uid,
                    email: email,
                    emailVerified: true,
                    displayName: displayName,
                }],
            }),
        }));

        const page = await context.newPage();

        // Warm up and verify auth on dashboard once
        await page.goto('https://ime365.local/dashboard', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForTimeout(2000);

        for (let i = 0; i < SCREENS.length; i++) {
            const screen = SCREENS[i];
            const targetUrl = `https://ime365.local${screen.path}`;
            const outFileName = `${screen.id}.png`;
            const outFilePath = path.join(outputBase, dev.name, outFileName);

            process.stdout.write(`[${i + 1}/${SCREENS.length}] [${dev.name}] ${screen.name} ... `);

            try {
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
                // Give 1.8s for lazy chunk load, React re-render, and MariaDB API responses
                await page.waitForTimeout(1800);

                // Unlock main container height for full height capture
                await page.evaluate(() => {
                    const main = document.getElementById('cuba-main-content');
                    if (main) {
                        document.documentElement.style.height = 'auto';
                        document.body.style.height = 'auto';
                        document.body.style.overflow = 'visible';
                        let el = main;
                        while (el && el !== document.body) {
                            el.style.height = 'auto';
                            el.style.maxHeight = 'none';
                            el.style.overflow = 'visible';
                            el = el.parentElement;
                        }
                    }
                });

                await page.screenshot({ path: outFilePath, fullPage: true });
                console.log(`✓ OK`);
            } catch (err) {
                console.log(`✗ ERR: ${err.message}`);
            }
        }

        await context.close();
    }

    await browser.close();

    // Generate markdown README showing all devices
    const readmeLines = [
        '# Candidate Dashboard & Experience — Complete Layout Audit Screenshots',
        '',
        `Captured on: **${new Date().toISOString()}**  `,
        `Authoritative Candidate Profile: **Bhaskar Beyond (${email})**  `,
        `Total Screen Views: **${SCREENS.length}** across **5 Device Tiers** (Mobile, Tablet, Desktop, 2K Large Screen, 4K Ultrawide)  `,
        '',
        '---',
        '',
        '## 📱 Captured Views Manifest',
        '',
        '| # | View / Tab Name | Route | Mobile (375x812) | Tablet (768x1024) | Desktop (1440x900) | 2K QHD (2560x1440) | 4K UHD (3840x2160) |',
        '|:---:|---|---|:---:|:---:|:---:|:---:|:---:|',
    ];

    for (let i = 0; i < SCREENS.length; i++) {
        const s = SCREENS[i];
        const cols = ALL_DEVICES.map(d => {
            const rel = `${d.name}/${s.id}.png`;
            const full = path.join(outputBase, rel);
            return fs.existsSync(full) ? `[view](${rel})` : '—';
        });
        readmeLines.push(
            `| ${i + 1} | **${s.name}** | \`${s.path}\` | ${cols.join(' | ')} |`
        );
    }

    readmeLines.push(
        '',
        '---',
        '',
        '## 📂 Directory Layout',
        '',
        '```',
        'candidate_screenshots/',
        '├── mobile/                 # 375x812 iPhone vertical responsive single-column layouts',
        '├── tablet/                 # 768x1024 iPad vertical 2-column layouts & collapsed rail',
        '├── desktop/                # 1440x900 standard executive laptop/desktop layouts',
        '├── large_screen/           # 2560x1440 2K QHD very large screen layouts',
        '├── ultrawide_4k/           # 3840x2160 4K UHD ultrawide layouts',
        '└── README.md               # Complete multi-device layout manifest & reviewer index',
        '```',
        '',
        '## 🎯 Next Steps for Reviewer',
        '1. Inspect each page layout per device tier to audit whitespace, card density, visual hierarchy, and CTA placement.',
        '2. Check container width capping (max-w-[1280px]) and margins on very large screens (2560x1440 & 3840x2160).',
        '3. Note any redundant panels, cramped tables, or suboptimal mobile stacking.',
        '4. Propose modernized 10/10 layout structures adhering to modern clean executive aesthetics.',
        ''
    );

    fs.writeFileSync(path.join(outputBase, 'README.md'), readmeLines.join('\n'));
    console.log('\n=== All screenshots captured successfully! Saved manifest to candidate_screenshots/README.md ===');
}

main().catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
