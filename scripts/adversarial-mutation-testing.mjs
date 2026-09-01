/**
 * ADVERSARIAL CHALLENGE 10: TEST THE TESTS (MUTATION TESTING)
 * 
 * Deliberately injects 5 subtle bugs into backend source code and verifies
 * that the test suite catches each mutation, then immediately reverts each file.
 * 
 * Target: backend/
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

const MUTATIONS = [
    {
        id: 1,
        title: 'Mutation 1: Allow any authenticated user as Super Admin in isSuperAdmin',
        file: 'backend/security/auth.js',
        find: 'function isSuperAdmin(user) {',
        replace: 'function isSuperAdmin(user) { return true;',
        testCmd: 'node --test --test-force-exit backend/test/admin-rbac-contract.test.js'
    },
    {
        id: 2,
        title: 'Mutation 2: Disable tenant usable check in tenantIsUsable',
        file: 'backend/enterprise/tenantContext.js',
        find: 'function tenantIsUsable(tenant) {',
        replace: 'function tenantIsUsable(tenant) { return false;',
        testCmd: 'node --test --test-force-exit backend/enterprise-test/tenant-foundation.test.js'
    },
    {
        id: 3,
        title: 'Mutation 3: Always grant tenant permission in tenantPolicy.js',
        file: 'backend/enterprise/tenantPolicy.js',
        find: "function hasTenantPermission(context, permission) {",
        replace: "function hasTenantPermission(context, permission) { return true;",
        testCmd: 'node --test --test-force-exit backend/test/enterprise-role-view-simulation.test.js'
    },
    {
        id: 4,
        title: 'Mutation 4: Disable Super Admin MFA enforcement in auth.js',
        file: 'backend/security/auth.js',
        find: "function superAdminMfaEnforced() {",
        replace: "function superAdminMfaEnforced() { return false;",
        testCmd: 'node --test --test-force-exit backend/test/payment-settings-rbac.test.js'
    },
    {
        id: 5,
        title: 'Mutation 5: Neutralize sessionMaxMinutes in tenantService.js to never expire',
        file: 'backend/enterprise/tenantService.js',
        find: "const maxMinutes = Number(identityPolicy.sessionMaxMinutes || 0);",
        replace: "const maxMinutes = Infinity;",
        testCmd: 'node --test --test-force-exit backend/enterprise-test/enterprise-org-management.test.js'
    }
];

function runTest(cmd) {
    try {
        const output = execSync(cmd, { cwd: ROOT_DIR, encoding: 'utf8', stdio: 'pipe' });
        return { passed: true, output };
    } catch (err) {
        return { passed: false, output: (err.stdout || '') + (err.stderr || '') };
    }
}

async function main() {
    console.log('='.repeat(70));
    console.log('ADVERSARIAL CHALLENGE 10: MUTATION TESTING (TEST THE TESTS)');
    console.log('='.repeat(70));

    const mutationResults = [];

    for (const m of MUTATIONS) {
        console.log(`\n[Mutation ${m.id}/5] ${m.title}`);
        const filePath = path.join(ROOT_DIR, m.file);
        const originalContent = fs.readFileSync(filePath, 'utf8');

        if (!originalContent.includes(m.find)) {
            console.error(`  ❌ Target string not found in ${m.file}!`);
            mutationResults.push({ id: m.id, title: m.title, file: m.file, caught: false, error: 'Target string not found' });
            continue;
        }

        // Apply mutation
        const mutatedContent = originalContent.replace(m.find, m.replace);
        fs.writeFileSync(filePath, mutatedContent, 'utf8');
        console.log(`  ✓ Mutation applied to ${m.file}`);

        // Run tests
        console.log(`  Running test suite: ${m.testCmd}`);
        const testRes = runTest(m.testCmd);

        // Revert immediately
        fs.writeFileSync(filePath, originalContent, 'utf8');
        console.log(`  ✓ Reverted ${m.file} cleanly`);

        if (!testRes.passed) {
            // Find which test failed
            const failureLines = testRes.output.split('\n').filter(l => l.includes('✖') || l.includes('FAIL') || l.includes('AssertionError') || l.includes('Error:'));
            const catchingTest = failureLines[0] ? failureLines[0].trim() : 'Test Assertion Failed';
            console.log(`  ✓ MUTATION CAUGHT! Test failure as expected: ${catchingTest}`);
            mutationResults.push({
                id: m.id,
                title: m.title,
                file: m.file,
                caught: true,
                catchingTest,
                status: 'PASSED'
            });
        } else {
            console.error(`  ❌ MUTATION MISSED! Test suite incorrectly passed with bug in code!`);
            mutationResults.push({
                id: m.id,
                title: m.title,
                file: m.file,
                caught: false,
                status: 'FAILED'
            });
        }

        // Verify clean revert passes
        const cleanRes = runTest(m.testCmd);
        if (cleanRes.passed) {
            console.log(`  ✓ Clean baseline confirmed: tests passing 100%`);
        } else {
            console.error(`  ❌ Revert validation failed!`);
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('MUTATION TESTING SUMMARY:');
    mutationResults.forEach(r => {
        console.log(`  ${r.id}. ${r.title}: ${r.caught ? 'CAUGHT (PASS)' : 'MISSED (FAIL)'}`);
        if (r.catchingTest) console.log(`     Test: ${r.catchingTest}`);
    });
    console.log('='.repeat(70));

    const reportPath = 'test-results/MUTATION_TESTING_REPORT.json';
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        mutations: mutationResults
    }, null, 2));
    console.log(`REPORT SAVED: ${reportPath}`);

    const allCaught = mutationResults.every(r => r.caught);
    if (!allCaught) {
        console.error('\n❌ ADVERSARIAL CHALLENGE 10 FAILED');
        process.exit(1);
    } else {
        console.log('\n✓ ADVERSARIAL CHALLENGE 10 PASSED 100%');
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
