/**
 * Mutation Testing Verification Script
 * Intentionally injects controlled faults into application code / tests,
 * executes the test runner, asserts that the test FAILS (detecting the fault),
 * and restores the original code cleanly.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const mutations = [
    {
        name: 'Mutation 1: Invert In-Memory Fail-Closed Invariant',
        file: 'backend/repositories/index.js',
        target: "if (process.env.NODE_ENV === 'production') return false;",
        mutation: "if (process.env.NODE_ENV === 'production') return true;",
        testCommand: 'node --test tests/in-memory-safety.test.mjs',
        expectedFailureText: 'Production MUST NEVER select InMemoryRepository'
    },
    {
        name: 'Mutation 2: Break Blog Post GET-by-ID API Route Contract',
        file: 'backend/routes/blogData.js',
        target: "router.get('/:id'",
        mutation: "router.get('/broken-path/:id'",
        testCommand: 'node --test tests/blog-editor-defects-regression.test.mjs',
        expectedFailureText: 'backend/routes/blogData.js must define GET /:id route'
    },
    {
        name: 'Mutation 3: Alter Blog Fallback Error Shape',
        file: 'src/services/api/platform.js',
        target: 'return { ...emptyEnvelope, success: true, error: _error.message || null };',
        mutation: 'return { success: false, error: "MUTATED_FAILURE" };',
        testCommand: 'node --test tests/blog-list-fallback.test.mjs',
        expectedFailureText: 'AssertionError'
    }
];

async function run() {
    console.log('=== MUTATION TESTING: VERIFYING TEST SUITE SENSITIVITY ===\n');

    const results = [];

    for (const m of mutations) {
        console.log(`--- Running ${m.name} ---`);
        const filePath = path.join(rootDir, m.file);
        const originalContent = fs.readFileSync(filePath, 'utf8');

        if (!originalContent.includes(m.target)) {
            console.error(`Target not found in ${m.file}: "${m.target}"`);
            results.push({ name: m.name, detected: false, error: 'Target pattern not found' });
            continue;
        }

        try {
            // Apply mutation
            const mutatedContent = originalContent.replace(m.target, m.mutation);
            fs.writeFileSync(filePath, mutatedContent, 'utf8');

            // Run test suite
            let testPassed = false;
            let output = '';
            try {
                output = execSync(m.testCommand, { cwd: rootDir, encoding: 'utf8', stdio: 'pipe' });
                testPassed = true;
            } catch (err) {
                testPassed = false;
                output = err.stdout + '\n' + err.stderr;
            }

            const caughtMutation = !testPassed && output.includes(m.expectedFailureText);
            console.log(`Mutation injected: ${m.mutation.trim()}`);
            console.log(`Test failed as expected? ${!testPassed} (Detected: ${caughtMutation})`);

            results.push({
                name: m.name,
                testFailedAsExpected: !testPassed,
                failureMessageMatched: caughtMutation,
                status: caughtMutation ? 'PASS (Defect Detected)' : 'FAIL (Test Missed Defect)'
            });
        } finally {
            // Restore original content
            fs.writeFileSync(filePath, originalContent, 'utf8');
            console.log(`✓ Restored original content of ${m.file}\n`);
        }
    }

    console.log('=== MUTATION TESTING RESULTS ===');
    console.table(results);

    const allPassed = results.every(r => r.failureMessageMatched);
    if (allPassed) {
        console.log('✓ 100% OF CONTROLLED MUTATIONS WERE DETECTED BY TEST SUITES!');
    } else {
        console.warn('⚠ Some mutations were not detected by the test suites.');
    }
}

run().catch(console.error);
