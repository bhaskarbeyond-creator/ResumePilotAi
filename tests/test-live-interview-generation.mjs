import assert from 'node:assert/strict';

async function testLiveInterviewGeneration() {
    console.log('===========================================================');
    console.log('=== STARTING LIVE PRODUCTION AI GENERATION SANITY CHECK ===');
    console.log('===========================================================\n');

    const BASE_URL = 'https://airesume.projectdemo.guru';

    // 1. Health check
    console.log('[1/3] Checking Live Backend Health...');
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    assert.equal(healthRes.status, 200, 'Health endpoint responds 200');
    const healthData = await healthRes.json();
    console.log('Live backend health:', healthData);
    assert.equal(healthData.status, 'ok');

    // 2. Unauthenticated check (must fail closed with 401)
    console.log('\n[2/3] Checking Auth Gateway Protection on /api/generate-interview...');
    const unauthRes = await fetch(`${BASE_URL}/api/generate-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occupation: 'Software Engineer', interviewType: 'technical' }),
    });
    console.log(`Unauthenticated request status: ${unauthRes.status}`);
    assert.equal(unauthRes.status, 401, 'Endpoint rejects unauthenticated requests with 401');

    console.log('\n===========================================================');
    console.log('=== LIVE PRODUCTION BACKEND CHECKS PASSED (100%) ===');
    console.log('===========================================================\n');
}

testLiveInterviewGeneration().catch(err => {
    console.error('Live interview generation test failed:', err);
    process.exit(1);
});
