import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

test.describe('Architectural Invariant: Unauthorized Direct Browser Firestore Access Guard', () => {
    const srcDir = path.resolve('src');

    function getAllFiles(dir, exts = ['.js', '.jsx', '.ts', '.tsx']) {
        if (!fs.existsSync(dir)) return [];
        let results = [];
        const list = fs.readdirSync(dir);
        for (const file of list) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                if (!filePath.includes('node_modules') && !filePath.includes('dist')) {
                    results = results.concat(getAllFiles(filePath, exts));
                }
            } else if (exts.some(ext => file.endsWith(ext))) {
                results.push(filePath);
            }
        }
        return results;
    }

    test('1. No React View Component directly calls fire.firestore().collection for business CRUD', () => {
        const componentFiles = getAllFiles(path.join(srcDir, 'components')).concat(
            getAllFiles(path.join(srcDir, 'enterprise'))
        );

        const violations = [];
        for (const file of componentFiles) {
            const content = fs.readFileSync(file, 'utf8');
            // Check for direct firestore queries on business collections
            if (
                content.includes("fire.firestore().collection('resumes')") ||
                content.includes('fire.firestore().collection("resumes")') ||
                content.includes("fire.firestore().collection('portfolios')") ||
                content.includes('fire.firestore().collection("portfolios")') ||
                content.includes("fire.firestore().collection('covers')") ||
                content.includes('fire.firestore().collection("covers")')
            ) {
                violations.push(path.relative(process.cwd(), file));
            }
        }

        assert.strictEqual(
            violations.length,
            0,
            `Direct browser Firestore access detected in business components:\n${violations.join('\n')}`
        );
    });

    test('2. DB Operations layer routes business CRUD through canonical API endpoints', () => {
        const dbOpsPath = path.join(srcDir, 'firestore', 'dbOperations.js');
        const content = fs.readFileSync(dbOpsPath, 'utf8');

        // Assert API-first dynamic imports are present and invoked
        assert(content.includes("import('../services/api/resumes.js')"), 'getResumes must route to resumes API');
        assert(content.includes("import('../services/api/portfolios.js')"), 'getUserPortfolios must route to portfolios API');
        assert(content.includes("import('../services/api/covers.js')"), 'getCovers must route to covers API');
        assert(content.includes("import('../services/api/users.js')"), 'getUserData must route to users API');
    });

    test('3. Explicit Allowlist Governance: Only sanctioned infrastructure modules may import fire.js', () => {
        const allSrcFiles = getAllFiles(srcDir);
        const allowlistedPatterns = [
            'src/conf/fire.js',
            'src/firestore/',
            'src/services/',
            'src/hooks/',
            'src/utils/',
            'src/components/',
            'src/enterprise/',
            'src/context/',
            'src/App.jsx',
            'src/main.jsx'
        ];

        let checked = 0;
        for (const file of allSrcFiles) {
            const normPath = file.replace(/\\/g, '/');
            const content = fs.readFileSync(file, 'utf8');
            if (content.includes("from '../conf/fire'") || content.includes('from "../conf/fire"') || content.includes("from './conf/fire'") || content.includes("from '../../conf/fire'") || content.includes("from '../../../conf/fire'")) {
                checked++;
                const isAllowed = allowlistedPatterns.some(p => normPath.includes(p));
                assert(isAllowed, `Unauthorized fire.js import in ${normPath}`);
            }
        }
        assert(checked > 0, 'Must have verified fire.js imports');
    });
});
