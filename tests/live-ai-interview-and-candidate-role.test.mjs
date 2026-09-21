import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();

test('Candidate Dashboard Job Post Restrictions', async (t) => {
    await t.test('checkIsEmployer sanitizes input correctly', async () => {
        const platformPath = path.join(ROOT_DIR, 'src', 'services', 'api', 'platform.js');
        const content = fs.readFileSync(platformPath, 'utf8');

        assert.ok(
            content.includes("typeof userId === 'string' ? userId : (userId?.uid || userId?.id || '')"),
            'platform.js checkIsEmployer must sanitize userId object to string UID'
        );
    });

    await t.test('JobSearchBar suppresses Post a Job inside candidate dashboard', async () => {
        const barPath = path.join(ROOT_DIR, 'src', 'components', 'JobsListings', 'JobSearchBar.jsx');
        const content = fs.readFileSync(barPath, 'utf8');

        assert.ok(content.includes('isInsideDashboard = false'), 'JobSearchBar accepts isInsideDashboard prop');
        assert.ok(
            content.includes('!isInsideDashboard && canPostJob'),
            'JobSearchBar hides Post a Job when inside candidate dashboard'
        );
    });

    await t.test('MainJobListings passes isInsideDashboard and suppresses canPostJob in dashboard', async () => {
        const listPath = path.join(ROOT_DIR, 'src', 'components', 'JobsListings', 'MainJobListings.jsx');
        const content = fs.readFileSync(listPath, 'utf8');

        assert.ok(
            content.includes('canPostJob={!isInsideDashboard && canPostJob}'),
            'MainJobListings disables canPostJob when isInsideDashboard is true'
        );
        assert.ok(
            content.includes('isInsideDashboard={isInsideDashboard}'),
            'MainJobListings passes isInsideDashboard down to JobSearchBar'
        );
    });

    await t.test('ProfileDisplay passes user.uid or authUser.uid to checkIsEmployer', async () => {
        const profilePath = path.join(ROOT_DIR, 'src', 'components', 'Dashboard', 'ProfileDisplay', 'ProfileDisplay.jsx');
        const content = fs.readFileSync(profilePath, 'utf8');

        assert.ok(
            content.includes('const targetUid = user?.uid || authUser?.uid') &&
            content.includes('checkIsEmployer(targetUid)'),
            'ProfileDisplay passes sanitized targetUid to checkIsEmployer'
        );
    });
});

test('Live AI CBT Interview Session Architecture & Contracts', async (t) => {
    await t.test('aiService ALLOWED_ENDPOINTS includes evaluate-interview-answer', async () => {
        const aiServicePath = path.join(ROOT_DIR, 'src', 'services', 'aiService.js');
        const content = fs.readFileSync(aiServicePath, 'utf8');

        assert.ok(
            content.includes("'evaluate-interview-answer'"),
            'aiService must permit evaluate-interview-answer endpoint'
        );
    });

    await t.test('backend ai router exposes evaluate-interview-answer endpoint', async () => {
        const aiRoutePath = path.join(ROOT_DIR, 'backend', 'routes', 'ai.js');
        const content = fs.readFileSync(aiRoutePath, 'utf8');

        assert.ok(
            content.includes("'/evaluate-interview-answer'"),
            'backend/routes/ai.js must include evaluate-interview-answer endpoint'
        );
        assert.ok(
            content.includes('generateFallbackStarEvaluation'),
            'backend/routes/ai.js must have fallback STAR evaluation engine'
        );
    });

    await t.test('interviewCoach config defines live mode', async () => {
        const coachPath = path.join(ROOT_DIR, 'src', 'utils', 'interviewCoach.js');
        const content = fs.readFileSync(coachPath, 'utf8');

        assert.ok(content.includes("id: 'live'"), 'INTERVIEW_MODES must define live mode');
        assert.ok(content.includes('Live AI CBT Interview'), 'INTERVIEW_MODES must have Live AI CBT Interview label');
    });

    await t.test('DashboardInterviews renders Live AI CBT Session with exact 3-card structure & STAR Grade badge', async () => {
        const dashPath = path.join(ROOT_DIR, 'src', 'components', 'Dashboard', 'DashboardInterviews', 'DashboardInterviews.jsx');
        const content = fs.readFileSync(dashPath, 'utf8');

        // Header & Badge
        assert.ok(content.includes('Live AI CBT Interview Session'), 'Must have Live AI CBT Interview Session title');
        assert.ok(content.includes('STAR Grade:'), 'Must have STAR Grade badge');
        
        // Cards
        assert.ok(content.includes('AI Recruiter:'), 'Card 1 must feature AI Recruiter: label');
        assert.ok(content.includes('Your Answer:'), 'Card 2 must feature Your Answer: label');
        assert.ok(content.includes('Rubric Feedback:'), 'Card 3 must feature Rubric Feedback: label');

        // Real-time STAR Telemetry HUD & Starters
        assert.ok(content.includes('Real-time STAR:'), 'Must have real-time STAR indicator');
        assert.ok(content.includes('STAR Starters:'), 'Must provide STAR Starters helpers');

        // Gold-Standard Model Answer comparison
        assert.ok(content.includes('100/100 STAR Model Answer'), 'Must support 100/100 STAR Model Answer preview');
    });
});
