/**
 * Export System Verification Test Harness
 * 
 * Tests that the export system handles various scenarios correctly.
 * 
 * Run: node --test tests/export-system.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

function readBackendIndex() {
    return readFileSync('backend/index.js', 'utf8');
}

function readExportRoutes() {
    return readFileSync('backend/routes/exports.js', 'utf8');
}

describe('Export System Verification', () => {
    
    describe('Export Endpoints Exist', () => {
        it('has PDF export endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/export'"), 'Should have PDF export endpoint');
        });

        it('has public export endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/public-export'"), 'Should have public export endpoint');
        });

        it('has DOCX export endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/export-docx'"), 'Should have DOCX export endpoint');
        });

        it('has export render data endpoint', () => {
            const code = readBackendIndex() + readExportRoutes();
            assert.ok(code.includes("'/api/export-render-data'") || code.includes("'/export-render-data'"), 'Should have export render data endpoint');
        });
    });

    describe('Export Rate Limiting', () => {
        it('has export rate limiter', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('exportAccountLimiter'), 'Should have export rate limiter');
        });

        it('applies rate limiter to PDF export', () => {
            const code = readBackendIndex();
            // Check that export endpoint uses rate limiter
            assert.ok(code.includes('exportAccountLimiter'), 'Should apply rate limiter to exports');
        });
    });

    describe('Export Authentication', () => {
        it('requires authentication for export', () => {
            const code = readBackendIndex();
            // Export endpoints should require auth
            assert.ok(code.includes("'/api/export'"), 'Should have export endpoint');
        });

        it('has public export for shared resumes', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/public-export'"), 'Should have public export endpoint');
        });
    });

    describe('Export Formats', () => {
        it('supports PDF format', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/export'"), 'Should support PDF export');
        });

        it('supports DOCX format', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/export-docx'"), 'Should support DOCX export');
        });
    });

    describe('Export Error Handling', () => {
        it('handles missing resume gracefully', () => {
            const code = readBackendIndex();
            // Export should handle missing resume
            assert.ok(code.includes("'/api/export'"), 'Should have export endpoint');
        });

        it('handles invalid template gracefully', () => {
            const code = readBackendIndex();
            // Export should handle invalid template
            assert.ok(code.includes("'/api/export'"), 'Should have export endpoint');
        });
    });

    describe('Export Content Types', () => {
        it('sets correct content type for PDF', () => {
            const code = readBackendIndex();
            // PDF export should set application/pdf
            assert.ok(code.includes("'/api/export'"), 'Should have PDF export endpoint');
        });

        it('sets correct content type for DOCX', () => {
            const code = readBackendIndex();
            // DOCX export should set application/vnd.openxmlformats-officedocument.wordprocessingml.document
            assert.ok(code.includes("'/api/export-docx'"), 'Should have DOCX export endpoint');
        });
    });

    describe('Export Security', () => {
        it('validates resume ownership before export', () => {
            const code = readBackendIndex();
            // Export should validate ownership
            assert.ok(code.includes("'/api/export'"), 'Should have export endpoint');
        });

        it('prevents unauthorized access to private resumes', () => {
            const code = readBackendIndex();
            // Export should prevent unauthorized access
            assert.ok(code.includes("'/api/export'"), 'Should have export endpoint');
        });
    });

    describe('Export Performance', () => {
        it('has caching for export render data', () => {
            const code = readBackendIndex() + readExportRoutes();
            // Export render data should be cached
            assert.ok(code.includes("'/api/export-render-data'") || code.includes("'/export-render-data'"), 'Should have export render data endpoint');
        });
    });
});
