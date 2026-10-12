import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// The Firebase web API key is NEVER hardcoded. It is resolved from the environment
// (or the local .env), so no plaintext credential is ever committed (INV-5).
const API_KEY = (() => {
    const fromEnv = process.env.VITE_FIREBASE_KEY || process.env.FIREBASE_API_KEY;
    if (fromEnv) return fromEnv;
    try {
        const m = readFileSync(path.resolve('.env'), 'utf8').match(/^\s*VITE_FIREBASE_KEY\s*=\s*(.+)\s*$/m);
        if (m) return m[1].trim();
    } catch { /* no .env present */ }
    throw new Error('VITE_FIREBASE_KEY is required (set it in .env or the environment); the Firebase web API key must never be hardcoded.');
})();

const makeJwt = (payload) => {
    const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.${Buffer.from('sig').toString('base64url')}`;
};

const mockToken = makeJwt({
    iss: 'https://securetoken.google.com/ai-resume-builder-424cf',
    aud: 'ai-resume-builder-424cf',
    auth_time: Math.floor(Date.now() / 1000),
    user_id: 'test-user',
    sub: 'test-user',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: 'bhaskar@beyond.com',
    email_verified: true,
    firebase: { identities: { email: ['bhaskar@beyond.com'] }, sign_in_provider: 'password' }
});

async function capture() {
    console.log('Starting Vite server...');
    const vite = await createServer({
        server: { port: 5188, host: '127.0.0.1', strictPort: false },
        logLevel: 'error',
    });
    const server = await vite.listen();
    const port = server.config.server.port;
    const base = `http://127.0.0.1:${port}`;
    console.log(`Vite running at ${base}`);

    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-gpu'],
    });

    try {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

        // Seed auth session
        const authUserKey = `firebase:authUser:${API_KEY}:[DEFAULT]`;
        await context.addInitScript(({ key, apiKey, token }) => {
            const userObj = {
                uid: 'test-user',
                email: 'bhaskar@beyond.com',
                emailVerified: true,
                displayName: 'Bhaskar Beyond',
                isAnonymous: false,
                stsTokenManager: { apiKey, refreshToken: 'fix', accessToken: token, expirationTime: Date.now() + 3600000 },
                createdAt: String(Date.now()),
                lastLoginAt: String(Date.now()),
                apiKey,
                appName: '[DEFAULT]'
            };
            localStorage.setItem(key, JSON.stringify(userObj));
            localStorage.setItem('firebase:authUser:demo-browser-api-key:[DEFAULT]', JSON.stringify(userObj));
            if (apiKey) localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify(userObj));
            localStorage.setItem('user', 'test-user');
            localStorage.setItem('cuba_workspace_rail', 'docked');
        }, { key: authUserKey, apiKey: API_KEY, token: mockToken });

        const page = await context.newPage();
        page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
        page.on('pageerror', err => console.error('BROWSER ERROR:', err.message, err.stack));

        // Intercept securetoken and identitytoolkit
        await page.route('**/securetoken.googleapis.com/**', r => r.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                access_token: mockToken,
                expires_in: '3600',
                token_type: 'Bearer',
                refresh_token: 'fix',
                id_token: mockToken,
                user_id: 'test-user',
                project_id: 'ai-resume-builder-424cf'
            })
        }));

        await page.route('**/identitytoolkit.googleapis.com/**', r => r.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                users: [{
                    localId: 'test-user',
                    email: 'bhaskar@beyond.com',
                    emailVerified: true,
                    displayName: 'Bhaskar Beyond'
                }]
            })
        }));

        // Mock resumes matching the exact reference specifications (flattened so platform.js wraps correctly)
        const mockResumes = [
            {
                id: 'res-master',
                template: 'Cv1',
                title: 'Master Resume',
                firstname: 'BHASKAR',
                lastname: 'M',
                email: 'bhaskar@beyond.com',
                phone: '+1 555-0199',
                city: 'San Francisco',
                country: 'USA',
                occupation: 'Lead Product Engineer',
                type: 'master',
                matchCount: 3,
                summary: 'Experienced Full Stack Product Engineer with over 8 years of proven expertise leading engineering teams, building scalable web applications with React and Node.js.',
                updated_at: '2026-10-11T09:30:00.000Z',
                created_at: '2026-10-01T09:30:00.000Z',
                employments: [
                    { jobTitle: 'Lead Product Engineer', employer: 'Beyond Technologies', startDate: '2021-01-01', endDate: '2026-10-01', description: 'Led development of enterprise SaaS platform serving users and increased customer retention by 28%.\nArchitected cloud services and improved system uptime.\nMentored junior engineers and conducted code reviews.' }
                ],
                educations: [
                    { school: 'University of Engineering', degree: 'Bachelor of Science in Computer Science', graduationYear: '2018' }
                ],
                skills: [
                    { skill: 'React' }, { skill: 'TypeScript' }, { skill: 'Node.js' }, { skill: 'AWS' }, { skill: 'Docker' }
                ],
                certifications: [{ title: 'AWS Cloud Practitioner' }]
            },
            {
                id: 'res-product',
                template: 'Cv2',
                title: 'Software Engineer - Product',
                firstname: 'BHASKAR',
                lastname: 'M',
                email: 'bhaskar@beyond.com',
                phone: '+1 555-0199',
                city: 'San Francisco',
                country: 'USA',
                occupation: 'Software Engineer - Product',
                type: 'tailored',
                matchCount: 5,
                summary: 'Product-focused software engineer with 6 years experience building customer-facing web applications. Specialized in frontend architecture and high-performance user interfaces.',
                updated_at: '2026-10-11T08:00:00.000Z',
                created_at: '2026-10-02T08:00:00.000Z',
                employments: [
                    { jobTitle: 'Software Engineer', employer: 'Product SaaS Inc', startDate: '2020-03-01', endDate: '2026-10-01', description: 'Developed core customer dashboard with React and TypeScript, increasing user retention by 25%.\nEngineered analytics pipeline that reduced event processing latency by 40%.\nImplemented design system tokens used across 12 product modules.' }
                ],
                educations: [
                    { school: 'Tech University', degree: 'Bachelor of Science in Software Engineering' }
                ],
                skills: [
                    { skill: 'React' }, { skill: 'TypeScript' }, { skill: 'Node.js' }, { skill: 'Next.js' }, { skill: 'Tailwind CSS' }, { skill: 'Redux' }, { skill: 'GraphQL' }, { skill: 'Jest' }
                ],
                certifications: [{ title: 'Meta Frontend Developer Certificate' }]
            },
            {
                id: 'res-data',
                template: 'Cv3',
                title: 'Data Analyst Resume',
                firstname: 'BHASKAR',
                lastname: 'M',
                email: 'bhaskar@beyond.com',
                phone: '+1 555-0199',
                city: 'San Francisco',
                country: 'USA',
                occupation: 'Data Analyst',
                type: 'tailored',
                matchCount: 4,
                summary: 'Data Analyst with 5 years experience extracting actionable insights from large datasets. Proficient in SQL, Python, Tableau and predictive statistical modeling.',
                updated_at: '2026-10-10T14:15:00.000Z',
                created_at: '2026-09-25T14:15:00.000Z',
                employments: [
                    { jobTitle: 'Senior Data Analyst', employer: 'Analytics Insights Corp', startDate: '2020-01-01', endDate: '2026-10-01', description: 'Built executive dashboards in Tableau used by 50+ leadership stakeholders to track KPIs.\nOptimized complex SQL queries reducing report generation time by 60%.\nIdentified customer churn drivers leading to a 15% increase in retention.' }
                ],
                educations: [
                    { school: 'Data Science Institute', degree: 'Bachelor of Science in Statistics', startDate: '2015-09-01' }
                ],
                skills: [
                    { skill: 'Python' }, { skill: 'SQL' }, { skill: 'Tableau' }, { skill: 'Power BI' }, { skill: 'R' }, { skill: 'Pandas' }, { skill: 'Excel' }, { skill: 'Statistics' }
                ],
                certifications: [{ title: 'Tableau Certified Data Analyst', issuer: 'Tableau', date: '2023-01-01' }],
                achievements: [{ title: 'Top Analytics Contributor', description: 'Recognized with analytics excellence award for delivering predictive churn model with 85% accuracy.' }]
            },
            {
                id: 'res-ux',
                template: 'Cv4',
                title: 'UX Designer Resume',
                firstname: 'BHASKAR',
                lastname: 'M',
                email: 'bhaskar@beyond.com',
                phone: '+1 555-0199',
                city: 'San Francisco',
                country: 'USA',
                occupation: 'UX Designer',
                type: 'draft',
                matchCount: 2,
                summary: 'UX Designer creating intuitive digital product interfaces with a user-centered design approach and rapid prototyping in Figma.',
                updated_at: '2026-10-05T11:20:00.000Z',
                created_at: '2026-09-20T11:20:00.000Z',
                employments: [
                    { jobTitle: 'UX Designer', employer: 'Creative Design Studio', startDate: '2022-01-01', endDate: '2026-10-01', description: 'Designed wireframes and interactive prototypes in Figma.\nConducted usability testing with 20 users and increased user satisfaction score by 15%.\nCollaborated with frontend developers to ensure design system consistency.' }
                ],
                educations: [
                    { school: 'Design Academy', degree: 'Bachelor of Fine Arts in Interaction Design' }
                ],
                skills: [
                    { skill: 'Figma' }, { skill: 'Wireframing' }, { skill: 'Prototyping' }, { skill: 'User Research' }, { skill: 'Design Systems' }
                ],
                achievements: [{ title: 'Design Award', description: 'Selected for design showcase' }]
            }
        ];

        // Tracked jobs across 6 months
        const now = new Date();
        const trackedJobs = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
            const dateStr = d.toISOString().split('T')[0];
            trackedJobs.push({ id: `tr-app-${i}`, status: 'applied', dateApplied: dateStr });
            trackedJobs.push({ id: `tr-app2-${i}`, status: 'applied', dateApplied: dateStr });
            if (i <= 4) trackedJobs.push({ id: `tr-int-${i}`, status: 'interview', dateApplied: dateStr });
            if (i <= 2) trackedJobs.push({ id: `tr-off-${i}`, status: 'offer', dateApplied: dateStr });
        }

        const mockJobs = [
            {
                id: 'job-1',
                title: 'Senior Software Engineer',
                company_name: 'TCS',
                location: 'Bangalore (Remote)',
                created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
            },
            {
                id: 'job-2',
                title: 'Product Analyst',
                company_name: 'Accenture',
                location: 'Hyderabad',
                created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
            },
            {
                id: 'job-3',
                title: 'Data Analyst',
                company_name: 'Infosys',
                location: 'Visakhapatnam',
                created_at: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString()
            }
        ];

        // Intercept ONLY real /api/ HTTP requests (never /src/ JavaScript modules)
        const mockApi = (matchFn, data) => page.route(
            url => {
                const pathname = typeof url === 'string' ? new URL(url).pathname : url.pathname;
                if (pathname.includes('/src/')) return false;
                return matchFn(pathname);
            },
            route => route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(data)
            })
        );

        await mockApi(p => p === '/api/user-stats', {
            success: true,
            stats: { resumes: 5, applications: 1, bestScore: 69, targetScore: 80, interviewStatus: 'Ready' }
        });

        await mockApi(p => p === '/api/resumes', {
            resumes: mockResumes,
            allResumes: mockResumes
        });

        await mockApi(p => p === '/api/jobs-data/tracker', {
            jobs: trackedJobs
        });

        await mockApi(p => p === '/api/jobs-data', {
            jobs: mockJobs
        });

        await mockApi(p => p === '/api/favourites' || p === '/api/jobs-data/favourites', {
            favourites: []
        });

        await mockApi(p => p === '/api/notifications-data', {
            notifications: [
                { id: 'n1', read: false, title: 'Interview invite' },
                { id: 'n2', read: false, title: 'Job match alert' },
                { id: 'n3', read: false, title: 'Resume ATS improved' }
            ],
            unreadCount: 3
        });

        await mockApi(p => p.startsWith('/api/users-data'), {
            user: { uid: 'test-user', displayName: 'Bhaskar Beyond', email: 'bhaskar@beyond.com' }
        });

        await mockApi(p => p === '/api/covers', { covers: [] });
        await mockApi(p => p === '/api/portfolios', { portfolios: [] });
        await mockApi(p => p === '/api/system/settings', { settings: {} });

        console.log('Navigating to /dashboard at 1920x1080...');
        await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(4000);

        const outPath = 'C:/Users/mbhas/.gemini/antigravity-ide/brain/a97e1dfc-8786-49f1-af66-3de9b20fbc00/current_dashboard_live_1920.png';
        await page.screenshot({ path: outPath });
        console.log(`1920 Viewport Screenshot saved to ${outPath}`);

        // Scroll the inner container down to capture the analytics cards
        const scrollContainer = await page.$('.cuba-scrollbar');
        if (scrollContainer) {
            await scrollContainer.evaluate(el => el.scrollTop = el.scrollHeight);
            await page.waitForTimeout(1000);
            const scrollPath = 'C:/Users/mbhas/.gemini/antigravity-ide/brain/a97e1dfc-8786-49f1-af66-3de9b20fbc00/current_dashboard_bottom_analytics.png';
            await page.screenshot({ path: scrollPath });
            console.log(`Bottom Analytics Screenshot saved to ${scrollPath}`);
            // Scroll back to top
            await scrollContainer.evaluate(el => el.scrollTop = 0);
            await page.waitForTimeout(500);
        }

        // Also take a taller viewport capture (1920x1300) to see full composition
        await page.setViewportSize({ width: 1920, height: 1300 });
        await page.waitForTimeout(1000);
        const fullPath = 'C:/Users/mbhas/.gemini/antigravity-ide/brain/a97e1dfc-8786-49f1-af66-3de9b20fbc00/current_dashboard_tall_1300.png';
        await page.screenshot({ path: fullPath });
        console.log(`Tall Composition Screenshot saved to ${fullPath}`);
    } catch (err) {
        console.error('Error during capture:', err);
    } finally {
        await browser.close();
        await vite.close();
        process.exit(0);
    }
}

capture();
