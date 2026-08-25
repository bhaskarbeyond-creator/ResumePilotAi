import https from 'https';

function request(path, method = 'GET', headers = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'airesume.projectdemo.guru',
            port: 443,
            path,
            method,
            headers: {
                'User-Agent': 'ResumePilotSmokeTester/1.0',
                ...headers
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.end();
    });
}

async function smokeTest() {
    console.log('=== SECTION 15: LIVE PRODUCTION API SMOKE TEST ===');
    
    // 1. Root / Frontend App
    const root = await request('/');
    console.log('1. Root SPA HTML:', root.status, root.body.length > 1000 ? 'PASS (Length: ' + root.body.length + ')' : 'FAIL');

    // 2. Health Endpoint
    const health = await request('/api/health');
    console.log('2. /api/health:', health.status, health.body);

    // 3. Resumes Auth Gate
    const resumesAuth = await request('/api/resumes');
    console.log('3. /api/resumes Auth Gate:', resumesAuth.status, resumesAuth.status === 401 ? 'PASS (Protected)' : 'FAIL');

    // 4. Portfolios Auth Gate
    const portfoliosAuth = await request('/api/portfolios');
    console.log('4. /api/portfolios Auth Gate:', portfoliosAuth.status, portfoliosAuth.status === 401 ? 'PASS (Protected)' : 'FAIL');

    // 5. Covers Auth Gate
    const coversAuth = await request('/api/covers');
    console.log('5. /api/covers Auth Gate:', coversAuth.status, coversAuth.status === 401 ? 'PASS (Protected)' : 'FAIL');

    // 6. Users Profile Auth Gate
    const usersAuth = await request('/api/users-data/profile');
    console.log('6. /api/users-data/profile Auth Gate:', usersAuth.status, usersAuth.status === 401 ? 'PASS (Protected)' : 'FAIL');

    // 7. Database Settings Auth Gate
    const dbAdminAuth = await request('/api/admin/database-settings');
    console.log('7. /api/admin/database-settings SuperAdmin Gate:', dbAdminAuth.status, dbAdminAuth.status === 401 || dbAdminAuth.status === 403 ? 'PASS (Protected)' : 'FAIL');

    // 8. Public Templates Catalog
    const templates = await request('/api/resumes/templates/manifest');
    console.log('8. Public Templates / Manifest:', templates.status);

    console.log('==================================================');
}

smokeTest().catch(console.error);
