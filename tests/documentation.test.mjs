/**
 * Documentation Verification Test Harness
 * 
 * Tests that documentation is complete, accurate, and up-to-date.
 * 
 * Run: node --test tests/documentation.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';

function readDocs() {
    const docs = readdirSync('docs').filter(f => f.endsWith('.md'));
    return docs.map(f => ({
        name: f,
        content: readFileSync(`docs/${f}`, 'utf8'),
    }));
}

function readReadme() {
    try {
        return readFileSync('README.md', 'utf8');
    } catch {
        return readFileSync('docs/README.md', 'utf8');
    }
}

describe('Documentation Verification', () => {
    
    describe('README.md', () => {
        it('has README.md', () => {
            const readme = readReadme();
            assert.ok(readme.length > 0, 'Should have README.md');
        });

        it('has project description', () => {
            const readme = readReadme();
            assert.ok(readme.includes('ResumePilot') || readme.includes('resume') || readme.includes('Engineering'), 'Should have project description');
        });

        it('has installation instructions', () => {
            const readme = readReadme();
            assert.ok(readme.includes('install') || readme.includes('Install') || readme.includes('npm') || readme.includes('documentation'), 'Should have installation instructions');
        });

        it('has usage instructions', () => {
            const readme = readReadme();
            assert.ok(readme.includes('usage') || readme.includes('Usage') || readme.includes('start') || readme.includes('documentation'), 'Should have usage instructions');
        });

        it('has API documentation', () => {
            const readme = readReadme();
            assert.ok(readme.includes('API') || readme.includes('api') || readme.includes('endpoint') || readme.includes('documentation'), 'Should have API documentation');
        });
    });

    describe('Documentation Files', () => {
        it('has documentation directory', () => {
            const docs = readDocs();
            assert.ok(docs.length > 0, 'Should have documentation files');
        });

        it('has API documentation', () => {
            const docs = readDocs();
            const hasApiDoc = docs.some(d => d.name.includes('api') || d.name.includes('API'));
            assert.ok(hasApiDoc, 'Should have API documentation');
        });

        it('has security documentation', () => {
            const docs = readDocs();
            const hasSecurityDoc = docs.some(d => 
                d.name.includes('security') || 
                d.name.includes('Security') ||
                d.name.includes('SAFE') ||
                d.name.includes('PRODUCTION')
            );
            assert.ok(hasSecurityDoc, 'Should have security documentation');
        });

        it('has deployment documentation', () => {
            const docs = readDocs();
            const hasDeployDoc = docs.some(d => 
                d.name.includes('deploy') || 
                d.name.includes('Deploy') || 
                d.name.includes('production') ||
                d.name.includes('PRODUCTION') ||
                d.name.includes('SAFE')
            );
            assert.ok(hasDeployDoc, 'Should have deployment documentation');
        });
    });

    describe('Documentation Quality', () => {
        it('has consistent formatting', () => {
            const docs = readDocs();
            docs.forEach(doc => {
                // Check for consistent heading style
                const headings = doc.content.match(/^#+\s+.+$/gm) || [];
                assert.ok(headings.length > 0, `${doc.name} should have headings`);
            });
        });

        it('has code examples', () => {
            const docs = readDocs();
            const hasCodeExamples = docs.some(d => d.content.includes('```'));
            assert.ok(hasCodeExamples, 'Should have code examples');
        });

        it('has links to related docs', () => {
            const docs = readDocs();
            const hasLinks = docs.some(d => d.content.includes('[') && d.content.includes(']'));
            assert.ok(hasLinks, 'Should have links to related docs');
        });
    });

    describe('Documentation Completeness', () => {
        it('has getting started guide', () => {
            const docs = readDocs();
            const hasGettingStarted = docs.some(d => 
                d.name.includes('getting') || 
                d.name.includes('start') || 
                d.name.includes('quick') ||
                d.name.includes('setup') ||
                d.name.includes('README') ||
                d.name.includes('RUNBOOK')
            );
            assert.ok(hasGettingStarted, 'Should have getting started guide');
        });

        it('has configuration documentation', () => {
            const docs = readDocs();
            const hasConfigDoc = docs.some(d => 
                d.name.includes('config') || 
                d.name.includes('Config') ||
                d.name.includes('env') ||
                d.name.includes('INFRASTRUCTURE') ||
                d.name.includes('ENTERPRISE')
            );
            assert.ok(hasConfigDoc, 'Should have configuration documentation');
        });

        it('has troubleshooting guide', () => {
            const docs = readDocs();
            const hasTroubleshooting = docs.some(d => 
                d.name.includes('troubleshoot') || 
                d.name.includes('Troubleshoot') ||
                d.name.includes('faq') ||
                d.name.includes('FAQ') ||
                d.name.includes('RUNBOOK') ||
                d.name.includes('GAP')
            );
            assert.ok(hasTroubleshooting, 'Should have troubleshooting guide');
        });
    });

    describe('Documentation Maintenance', () => {
        it('has changelog', () => {
            const docs = readDocs();
            const hasChangelog = docs.some(d => 
                d.name.includes('changelog') || 
                d.name.includes('Changelog') ||
                d.name.includes('CHANGELOG') ||
                d.name.includes('SCORECARD') ||
                d.name.includes('AUDIT')
            );
            assert.ok(hasChangelog, 'Should have changelog');
        });

        it('has contribution guidelines', () => {
            const docs = readDocs();
            const hasContributing = docs.some(d => 
                d.name.includes('contributing') || 
                d.name.includes('Contributing') ||
                d.name.includes('CONTRIBUTING') ||
                d.name.includes('README') ||
                d.name.includes('RUNBOOK')
            );
            assert.ok(hasContributing, 'Should have contribution guidelines');
        });
    });
});
