'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

describe('API Contract Fuzzing', () => {
    let server, baseUrl;
    
    before(async () => {
        const app = require('../index.js');
        server = app.listen(0);
        await new Promise(resolve => server.once('listening', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });
    
    after(() => server?.close());
    
    async function request(path, method = 'GET', body = null, headers = {}) {
        return new Promise((resolve) => {
            const opts = {
                method,
                headers: { 'Content-Type': 'application/json', ...headers },
            };
            const req = http.request(baseUrl + path, opts, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    let json;
                    try { json = JSON.parse(data); } catch { json = data; }
                    resolve({ status: res.statusCode, body: json });
                });
            });
            req.on('error', (err) => resolve({ status: 0, error: err.message }));
            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    }
    
    describe('Health endpoints', () => {
        it('GET /healthz returns 200', async () => {
            const res = await request('/healthz');
            assert.equal(res.status, 200);
        });
        
        it('GET /api/healthz returns 200', async () => {
            const res = await request('/api/healthz');
            assert.equal(res.status, 200);
        });
        
        it('GET /api/health returns 200', async () => {
            const res = await request('/api/health');
            assert.equal(res.status, 200);
        });
        
        it('GET /api/health/databases returns 200', async () => {
            const res = await request('/api/health/databases');
            assert.equal(res.status, 200);
        });
        
        it('GET /api/health/ai-providers returns 200', async () => {
            const res = await request('/api/health/ai-providers');
            assert.equal(res.status, 200);
        });
        
        it('GET /api/health/export-concurrency returns 200', async () => {
            const res = await request('/api/health/export-concurrency');
            assert.equal(res.status, 200);
        });
    });
    
    describe('Public endpoints', () => {
        it('GET /api/service-availability returns 200 or 503 (depends on DB)', async () => {
            const res = await request('/api/service-availability');
            assert.ok([200, 503].includes(res.status), `Expected 200 or 503, got ${res.status}`);
        });
        
        it('GET /api/rtl-font-config returns 401 (requires auth)', async () => {
            const res = await request('/api/rtl-font-config');
            assert.equal(res.status, 401);
        });
        
        it('GET /api/llms.txt returns 503 (no DB)', async () => {
            const res = await request('/api/llms.txt');
            assert.equal(res.status, 503);
        });
        
        it('GET /llms.txt returns 503 (no DB)', async () => {
            const res = await request('/llms.txt');
            assert.equal(res.status, 503);
        });
    });
    
    describe('Protected endpoints', () => {
        it('GET /api/payment-orders returns 401', async () => {
            const res = await request('/api/payment-orders');
            assert.equal(res.status, 401);
        });
        
        it('GET /api/messages/conversations returns 401', async () => {
            const res = await request('/api/messages/conversations');
            assert.equal(res.status, 401);
        });
        
        it('GET /api/employer/companies returns 401', async () => {
            const res = await request('/api/employer/companies');
            assert.equal(res.status, 401);
        });
        
        it('GET /api/export-render-data returns 404', async () => {
            const res = await request('/api/export-render-data');
            assert.equal(res.status, 404);
        });
    });
    
    describe('Retired endpoints', () => {
        it('POST /api/jobs/naukri returns 501', async () => {
            const res = await request('/api/jobs/naukri', 'POST');
            assert.equal(res.status, 501);
        });
        
        it('POST /api/invoice returns 410 (retired, in publicApiPaths)', async () => {
            const res = await request('/api/invoice', 'POST');
            assert.equal(res.status, 410);
        });
    });
});
