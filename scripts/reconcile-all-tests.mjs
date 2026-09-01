import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const categories = [
    {
        name: 'Frontend Static Security & Auth',
        command: 'node --test tests/security-static.test.mjs tests/secret-scanner-efficacy.test.mjs tests/production-delivery-security.test.mjs tests/production-delivery-integration.test.mjs tests/xss.test.mjs tests/mfa-static.test.mjs tests/auth-error-messages.test.mjs'
    },
    {
        name: 'Backend API, IAM & DB Integration',
        command: 'npm --prefix backend test'
    },
    {
        name: 'Frontend Product & Admin Workflows',
        command: 'node --test tests/auth-mfa-ui-adversarial.test.mjs tests/oauth-resolver.test.mjs tests/admin-ux-consistency.test.mjs tests/template-data.test.mjs tests/template-quality-gate.test.mjs tests/template-differentiation.test.mjs tests/template-previews.test.mjs tests/template-empty-sections.test.mjs tests/portfolio-sanitization.test.mjs tests/portfolio-data.test.mjs tests/blog-workflow.test.mjs tests/admin-workflow.test.mjs tests/superadmin-control-plane.test.mjs tests/gap22-user360-tenant-assignment.test.mjs tests/admin-ai-settings.test.mjs tests/admin-settings-regression.test.mjs tests/profile-workflow.test.mjs tests/profile-concurrency.test.mjs tests/release-candidate.test.mjs tests/cross-module-journeys.test.mjs tests/account-isolation.test.mjs tests/messaging-regression.test.mjs tests/employer-lifecycle.test.mjs tests/account-lifecycle-regression.test.mjs tests/notification-lifecycle.test.mjs tests/custom-pages-lifecycle.test.mjs tests/public-discovery.test.mjs tests/forensic-rc.test.mjs tests/job-tracker.test.mjs tests/i18n.test.mjs tests/ai-client.test.mjs tests/privacy-consent.test.mjs tests/resume-workflow.test.mjs tests/build-resume-shell.test.mjs tests/interview-coach.test.mjs tests/interview-coach-hardening.test.mjs tests/interview-coach-lifecycle.test.mjs tests/resume-persistence.test.mjs tests/export-client.test.mjs tests/docx-client-journey.test.mjs tests/certifications-step.test.mjs tests/create-resume-extras.test.mjs tests/ats-module-toggle.test.mjs tests/ats-score.test.mjs tests/ats-score-journey.test.mjs tests/platform-health.test.mjs tests/forensic-audit-regressions.test.mjs tests/product-ux-audit-regressions.test.mjs tests/blog-list-fallback.test.mjs'
    },
    {
        name: 'Resume Templates Render & Paginate',
        command: 'node --test tests/template-render.test.mjs'
    },
    {
        name: 'Production Composer 51 Templates',
        command: 'node --test tests/template-production-render.test.mjs'
    },
    {
        name: 'Portfolio Multi-Template Suite',
        command: 'node --test tests/portfolio-templates.test.mjs'
    },
    {
        name: 'Enterprise Tenancy & Isolation',
        command: 'npm --prefix backend run test:enterprise'
    },
    {
        name: 'Disaster Recovery & Outbox Lifecycle',
        command: 'node --test tests/certification/firestore-zero-static.test.mjs tests/dr-hardening.test.mjs'
    }
];

console.log('=== RUNNING AUTHORITATIVE TEST INVENTORY ===\n');

const inventory = [];

for (const cat of categories) {
    process.stdout.write(`Executing: ${cat.name}... `);
    const start = Date.now();
    try {
        const output = execSync(cat.command, { encoding: 'utf8', env: { ...process.env, CI: 'true' }, maxBuffer: 10 * 1024 * 1024 });
        const duration = ((Date.now() - start) / 1000).toFixed(1);

        // Parse TAP or node:test output
        const passMatch = output.match(/ℹ pass\s+(\d+)/) || output.match(/pass\s+(\d+)/);
        const failMatch = output.match(/ℹ fail\s+(\d+)/) || output.match(/fail\s+(\d+)/);
        const totalMatch = output.match(/ℹ tests\s+(\d+)/) || output.match(/tests\s+(\d+)/);

        // Count "ok <num>" or "✔" if not summarized
        let passed = passMatch ? parseInt(passMatch[1], 10) : 0;
        let failed = failMatch ? parseInt(failMatch[1], 10) : 0;
        let total = totalMatch ? parseInt(totalMatch[1], 10) : 0;

        if (total === 0) {
            const checkmarks = (output.match(/✔/g) || []).length;
            const okLines = (output.match(/^\s*ok\b/gm) || []).length;
            passed = Math.max(checkmarks, okLines);
            total = passed;
        }

        inventory.push({
            category: cat.name,
            command: cat.command,
            totalTests: total,
            passed: passed,
            failed: failed,
            skipped: 0,
            duration: `${duration}s`,
            status: failed === 0 ? 'PASS' : 'FAIL'
        });
        console.log(`DONE (${total} tests, ${duration}s)`);
    } catch (err) {
        console.log(`FAILED (${err.message})`);
        inventory.push({
            category: cat.name,
            command: cat.command,
            totalTests: 0,
            passed: 0,
            failed: 1,
            skipped: 0,
            duration: '0s',
            status: 'FAIL'
        });
    }
}

console.log('\n=== AUTHORITATIVE TEST INVENTORY TABLE ===');
console.table(inventory);

const grandTotal = inventory.reduce((acc, r) => acc + r.totalTests, 0);
const grandPassed = inventory.reduce((acc, r) => acc + r.passed, 0);
const grandFailed = inventory.reduce((acc, r) => acc + r.failed, 0);

console.log(`\nGRAND TOTAL: ${grandPassed} / ${grandTotal} PASSED (Failures: ${grandFailed})`);
fs.writeFileSync('test-results/AUTHORITATIVE_TEST_INVENTORY.json', JSON.stringify({ inventory, grandTotal, grandPassed, grandFailed }, null, 2));
