process.env.NODE_ENV = 'test';
const assert = require('assert');
const express = require('express');
const request = require('supertest');
const { getRepository, getActiveEngine } = require('../repositories');
const { resumesRouter } = require('../routes/resumes');
const { portfoliosRouter } = require('../routes/portfolios');
const { coversRouter } = require('../routes/covers');
const { jobsDataRouter } = require('../routes/jobsData');
const { usersDataRouter } = require('../routes/usersData');
const { blogDataRouter } = require('../routes/blogData');
const { cmsPagesRouter } = require('../routes/cmsPages');
const { setEngine } = require('../database/engineManager');

describe('Firestore Quota Exhaustion & Standby Failure Resilience', () => {
    let app;
    const testUid = 'user_resilience_test_' + Date.now();

    before(async () => {
        // Ensure MySQL is the active engine
        assert.strictEqual(getActiveEngine(), 'mysql', 'MySQL must be active primary');

        // Create test user in MySQL
        const pool = require('../database/mysql').getPool();
        await pool.query(
            'INSERT INTO users (id, email, firstname, lastname, membership) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP',
            [testUid, 'resilience@example.com', 'Resilience', 'Tester', 'Basic']
        );

        // Configure test token verifier
        const { requireAuth, setTokenVerifierForTests } = require('../security/auth');
        setTokenVerifierForTests(async token => ({
            uid: testUid,
            email: 'resilience@example.com',
            email_verified: true,
            role: 'USER'
        }));

        app = express();
        app.use(express.json());

        // Simulated auth header provider if missing
        app.use((req, res, next) => {
            if (!req.headers.authorization) {
                req.headers.authorization = 'Bearer test_valid_token';
            }
            next();
        });
        app.use(requireAuth);

        // Mock broken/quota-exhausted Firestore DB on app
        const quotaExhaustedDb = {
            collection: () => {
                const err = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded');
                err.code = 8;
                err.details = 'Quota exceeded';
                throw err;
            }
        };
        app.set('db', quotaExhaustedDb);

        // Mount data abstraction routes
        app.use('/api/resumes', resumesRouter);
        app.use('/api/portfolios', portfoliosRouter);
        app.use('/api/covers', coversRouter);
        app.use('/api/jobs-data', jobsDataRouter);
        app.use('/api/users-data', usersDataRouter);
        app.use('/api/blog-data', blogDataRouter);
        app.use('/api/cms-pages', cmsPagesRouter);
    });

    it('1. MySQL Primary Resumes CRUD works 100% with Firestore Quota Exhausted', async () => {
        const resumeId = 'res_test_' + Date.now();
        const resumeData = {
            title: 'Full Stack Engineer Resume',
            template: 'Modern',
            firstname: 'John',
            lastname: 'Doe',
            skills: ['React', 'Node.js', 'MySQL'],
            employments: [{ jobTitle: 'Senior Dev', employer: 'Tech Corp' }]
        };

        // Save resume
        const saveRes = await request(app)
            .post(`/api/resumes/${resumeId}`)
            .send(resumeData)
            .expect(200);

        assert.strictEqual(saveRes.body.success, true);
        assert.strictEqual(saveRes.body.resume.title, 'Full Stack Engineer Resume');

        // Fetch resume list
        const listRes = await request(app)
            .get('/api/resumes')
            .expect(200);

        assert.strictEqual(listRes.body.success, true);
        assert(Array.isArray(listRes.body.resumes));
        const found = listRes.body.resumes.find(r => r.id === resumeId);
        assert(found, 'Created resume must exist in list');
        assert.strictEqual(found.firstname, 'John');

        // Fetch single resume
        const singleRes = await request(app)
            .get(`/api/resumes/${resumeId}`)
            .expect(200);

        assert.strictEqual(singleRes.body.success, true);
        assert.strictEqual(singleRes.body.resume.id, resumeId);

        // Delete resume
        const delRes = await request(app)
            .delete(`/api/resumes/${resumeId}`)
            .expect(200);

        assert.strictEqual(delRes.body.success, true);
    });

    it('2. MySQL Primary Portfolios CRUD works 100% with Firestore Quota Exhausted', async () => {
        const portId = 'port_test_' + Date.now();
        const portData = {
            title: 'Creative Portfolio',
            theme: 'dark',
            content: [{ type: 'Hero', title: 'Welcome' }]
        };

        // Save portfolio
        const saveRes = await request(app)
            .post(`/api/portfolios/${portId}`)
            .send(portData)
            .expect(200);

        assert.strictEqual(saveRes.body.success, true);

        // List portfolios
        const listRes = await request(app)
            .get('/api/portfolios')
            .expect(200);

        assert.strictEqual(listRes.body.success, true);
        assert(Array.isArray(listRes.body.portfolios));

        // Delete portfolio
        const delRes = await request(app)
            .delete(`/api/portfolios/${portId}`)
            .expect(200);

        assert.strictEqual(delRes.body.success, true);
    });

    it('3. MySQL Primary Cover Letters CRUD works 100% with Firestore Quota Exhausted', async () => {
        const coverId = 'cov_test_' + Date.now();
        const coverData = {
            title: 'Software Engineer Cover Letter',
            template: 'Cover1',
            recipient: 'Hiring Manager'
        };

        // Save cover letter
        const saveRes = await request(app)
            .post(`/api/covers/${coverId}`)
            .send(coverData)
            .expect(200);

        assert.strictEqual(saveRes.body.success, true);

        // List covers
        const listRes = await request(app)
            .get('/api/covers')
            .expect(200);

        assert.strictEqual(listRes.body.success, true);

        // Delete cover
        const delRes = await request(app)
            .delete(`/api/covers/${coverId}`)
            .expect(200);

        assert.strictEqual(delRes.body.success, true);
    });

    it('4. MySQL Primary User Profile CRUD works 100% with Firestore Quota Exhausted', async () => {
        const profileData = {
            firstname: 'Alice',
            lastname: 'Smith',
            email: 'alice@example.com',
            membership: 'Basic'
        };

        // Save profile
        const saveRes = await request(app)
            .post('/api/users-data/profile')
            .send(profileData)
            .expect(200);

        assert.strictEqual(saveRes.body.success, true);

        // Get profile
        const getRes = await request(app)
            .get('/api/users-data/profile')
            .expect(200);

        assert.strictEqual(getRes.body.success, true);
        assert.strictEqual(getRes.body.user.firstname, 'Alice');
    });

    it('5. MySQL Primary Jobs & Applications CRUD works 100% with Firestore Quota Exhausted', async () => {
        const jobId = 'job_test_' + Date.now();
        const jobData = {
            title: 'Senior Cloud Architect',
            company: 'Acme Cloud Inc.',
            location: 'Remote',
            status: 'active'
        };

        // Save job
        const saveRes = await request(app)
            .post(`/api/jobs-data/${jobId}`)
            .send(jobData)
            .expect(200);

        assert.strictEqual(saveRes.body.success, true);

        // List jobs
        const listRes = await request(app)
            .get('/api/jobs-data')
            .expect(200);

        assert.strictEqual(listRes.body.success, true);

        // Clean up
        await request(app).delete(`/api/jobs-data/${jobId}`).expect(200);
    });

    it('6. No raw Firestore RESOURCE_EXHAUSTED errors are leaked on any endpoint', async () => {
        const endpoints = [
            { method: 'get', url: '/api/resumes' },
            { method: 'get', url: '/api/portfolios' },
            { method: 'get', url: '/api/covers' },
            { method: 'get', url: '/api/jobs-data' },
            { method: 'get', url: '/api/users-data/profile' }
        ];

        for (const ep of endpoints) {
            const res = await request(app)[ep.method](ep.url);
            assert.notStrictEqual(res.status, 500, `${ep.url} must not fail with 500`);
            const bodyStr = JSON.stringify(res.body);
            assert(!bodyStr.includes('RESOURCE_EXHAUSTED'), `${ep.url} leaked RESOURCE_EXHAUSTED`);
            assert(!bodyStr.includes('Quota exceeded'), `${ep.url} leaked Quota exceeded`);
        }
    });

    it('7. Firestore Network Unavailable / Offline + MySQL healthy = USER OPERATIONS PASS', async () => {
        const offlineApp = express();
        offlineApp.use(express.json());
        offlineApp.use((req, res, next) => {
            if (!req.headers.authorization) req.headers.authorization = 'Bearer test_valid_token';
            next();
        });
        const { requireAuth } = require('../security/auth');
        offlineApp.use(requireAuth);

        // Mock network-disconnected Firestore
        offlineApp.set('db', {
            collection: () => {
                const err = new Error('14 UNAVAILABLE: The service is currently unavailable.');
                err.code = 14;
                throw err;
            }
        });
        offlineApp.use('/api/resumes', resumesRouter);

        const listRes = await request(offlineApp).get('/api/resumes').expect(200);
        assert.strictEqual(listRes.body.success, true);
        assert(Array.isArray(listRes.body.resumes));
    });

    it('8. Firestore Timeout + MySQL healthy = USER OPERATIONS PASS', async () => {
        const timeoutApp = express();
        timeoutApp.use(express.json());
        timeoutApp.use((req, res, next) => {
            if (!req.headers.authorization) req.headers.authorization = 'Bearer test_valid_token';
            next();
        });
        const { requireAuth } = require('../security/auth');
        timeoutApp.use(requireAuth);

        // Mock timing out Firestore
        timeoutApp.set('db', {
            collection: () => {
                const err = new Error('4 DEADLINE_EXCEEDED: Deadline exceeded');
                err.code = 4;
                throw err;
            }
        });
        offlineAppResumes = timeoutApp.use('/api/resumes', resumesRouter);

        const listRes = await request(timeoutApp).get('/api/resumes').expect(200);
        assert.strictEqual(listRes.body.success, true);
        assert(Array.isArray(listRes.body.resumes));
    });

    it('9. Firestore Permission Denied + MySQL healthy = USER OPERATIONS PASS', async () => {
        const permApp = express();
        permApp.use(express.json());
        permApp.use((req, res, next) => {
            if (!req.headers.authorization) req.headers.authorization = 'Bearer test_valid_token';
            next();
        });
        const { requireAuth } = require('../security/auth');
        permApp.use(requireAuth);

        // Mock permission denied Firestore
        permApp.set('db', {
            collection: () => {
                const err = new Error('7 PERMISSION_DENIED: Missing or insufficient permissions.');
                err.code = 7;
                throw err;
            }
        });
        permApp.use('/api/resumes', resumesRouter);

        const listRes = await request(permApp).get('/api/resumes').expect(200);
        assert.strictEqual(listRes.body.success, true);
        assert(Array.isArray(listRes.body.resumes));
    });

    it('10. Fail-Closed Invariant: Active MySQL Primary does not silently switch databases', async () => {
        const { getActiveEngine } = require('../repositories');
        assert.strictEqual(getActiveEngine(), 'mysql');
    });
});
