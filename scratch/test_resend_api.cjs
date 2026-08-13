const http = require('http');

function testPort(port, logId) {
    return new Promise((resolve) => {
        const postData = JSON.stringify({ logId });
        const req = http.request({
            hostname: 'localhost',
            port: port,
            path: '/api/email/resend',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log(`Port ${port} Response (Status ${res.statusCode}): ${data}`);
                resolve(true);
            });
        });

        req.on('error', () => { resolve(false); });
        req.write(postData);
        req.end();
    });
}

async function runTests() {
    const logId = 'd12421c7-364c-6c8d-8d18-6a530ce03a4a@airesume.projectdemo.guru';
    console.log(`Testing resend for ID: ${logId}`);
    for (const port of [3000, 3001, 5000, 8000, 8080]) {
        await testPort(port, logId);
    }
}

runTests();
