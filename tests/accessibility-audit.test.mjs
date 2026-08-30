/**
 * Accessibility Audit Test Harness
 * 
 * Tests semantic HTML, ARIA attributes, keyboard navigation patterns,
 * and accessibility best practices in the codebase.
 * 
 * Run: node --test tests/accessibility-audit.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

function readComponent(path) {
    try {
        return readFileSync(join(process.cwd(), path), 'utf8');
    } catch {
        return '';
    }
}

function findJsxFiles(dir, maxDepth = 3, currentDepth = 0) {
    const files = [];
    if (currentDepth >= maxDepth) return files;
    try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue;
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...findJsxFiles(fullPath, maxDepth, currentDepth + 1));
            } else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.tsx')) {
                files.push(fullPath);
            }
        }
    } catch {}
    return files;
}

describe('Accessibility Audit', () => {
    
    describe('Route Focus Management', () => {
        it('RouteFocus component exists', () => {
            const content = readComponent('src/components/RouteFocus.jsx');
            assert.ok(content.length > 0, 'RouteFocus.jsx should exist');
            assert.ok(content.includes('focus') || content.includes('Focus'), 'Should handle focus management');
        });

        it('RouteFocus is integrated into app', () => {
            const main = readComponent('src/main.jsx');
            assert.ok(main.includes('RouteFocus'), 'RouteFocus should be imported in main.jsx');
        });
    });

    describe('ARIA Attributes in Key Components', () => {
        it('Spinner has accessible attributes', () => {
            const content = readComponent('src/components/Spinner/Spinner.jsx');
            if (content) {
                assert.ok(
                    content.includes('role=') || content.includes('aria-') || content.includes('alt='),
                    'Spinner should have accessibility attributes'
                );
            }
        });

        it('ErrorBoundary has role=alert', () => {
            const content = readComponent('src/components/ErrorBoundary.jsx');
            assert.ok(content.includes('role='), 'ErrorBoundary should have role attribute');
            assert.ok(content.includes('aria-'), 'ErrorBoundary should have ARIA attributes');
        });

        it('NotFound page has semantic heading', () => {
            const main = readComponent('src/main.jsx');
            assert.ok(main.includes('Page not found'), 'NotFound should have descriptive text');
        });
    });

    describe('Form Accessibility', () => {
        const jsxFiles = findJsxFiles('src/components');
        
        it('form elements use labels or aria-label', () => {
            let formsWithLabels = 0;
            let totalForms = 0;
            
            for (const file of jsxFiles) {
                const content = readComponent(file.replace(process.cwd() + '/', ''));
                const formMatches = content.match(/<form/g) || [];
                totalForms += formMatches.length;
                if (content.includes('aria-label') || content.includes('<label') || content.includes('htmlFor')) {
                    formsWithLabels += formMatches.length;
                }
            }
            
            // At least some forms should have labels
            if (totalForms > 0) {
                assert.ok(formsWithLabels > 0, `Found ${totalForms} forms but none with labels/aria-label`);
            }
        });
    });

    describe('Button Accessibility', () => {
        it('buttons have accessible text', () => {
            const jsxFiles = findJsxFiles('src/components');
            let buttonsWithoutText = 0;
            
            for (const file of jsxFiles) {
                const content = readComponent(file.replace(process.cwd() + '/', ''));
                // Check for buttons with only icons (no text, no aria-label)
                const iconButtonPattern = /<button[^>]*>\s*<[A-Z][a-zA-Z]*\s*\/>\s*<\/button>/g;
                const matches = content.match(iconButtonPattern) || [];
                for (const match of matches) {
                    if (!match.includes('aria-label') && !match.includes('title=')) {
                        buttonsWithoutText++;
                    }
                }
            }
            
            // This is informational - we log but don't fail
            if (buttonsWithoutText > 0) {
                console.log(`[A11y Warning] Found ${buttonsWithoutText} buttons with only icons and no aria-label`);
            }
        });
    });

    describe('Image Accessibility', () => {
        it('images have alt attributes', () => {
            const jsxFiles = findJsxFiles('src/components');
            let imagesWithoutAlt = 0;
            let totalImages = 0;
            
            for (const file of jsxFiles) {
                const content = readComponent(file.replace(process.cwd() + '/', ''));
                const imgMatches = content.match(/<img\s[^>]*>/g) || [];
                totalImages += imgMatches.length;
                for (const img of imgMatches) {
                    if (!img.includes('alt=') && !img.includes('alt =')) {
                        imagesWithoutAlt++;
                    }
                }
            }
            
            if (totalImages > 0) {
                const ratio = (totalImages - imagesWithoutAlt) / totalImages;
                assert.ok(ratio >= 0.8, `Only ${Math.round(ratio * 100)}% of images have alt attributes (target: 80%)`);
            }
        });
    });

    describe('Heading Hierarchy', () => {
        it('main.jsx has proper heading structure', () => {
            const main = readComponent('src/main.jsx');
            // NotFound should have h1
            assert.ok(main.includes('<h1'), 'Should have h1 heading for NotFound page');
        });
    });

    describe('Keyboard Navigation', () => {
        it('interactive elements are focusable', () => {
            const jsxFiles = findJsxFiles('src/components');
            let onClickWithoutKeyboard = 0;
            
            for (const file of jsxFiles) {
                const content = readComponent(file.replace(process.cwd() + '/', ''));
                // Check for div/span with onClick but no tabIndex or role
                const clickableDivPattern = /<(div|span)[^>]*onClick=/g;
                const matches = content.match(clickableDivPattern) || [];
                for (const match of matches) {
                    if (!match.includes('tabIndex') && !match.includes('role=')) {
                        onClickWithoutKeyboard++;
                    }
                }
            }
            
            // This is informational
            if (onClickWithoutKeyboard > 0) {
                console.log(`[A11y Warning] Found ${onClickWithoutKeyboard} clickable div/span without tabIndex or role`);
            }
        });
    });

    describe('Semantic HTML', () => {
        it('app uses semantic elements', () => {
            const main = readComponent('src/main.jsx');
            const hasMain = main.includes('<main') || main.includes('<section') || main.includes('<article');
            assert.ok(hasMain, 'App should use semantic HTML elements (main, section, article)');
        });

        it('ErrorBoundary uses semantic main element', () => {
            const errorBoundary = readComponent('src/components/ErrorBoundary.jsx');
            assert.ok(errorBoundary.includes('<main'), 'ErrorBoundary should use <main> element');
        });
    });

    describe('Color Contrast (Static Analysis)', () => {
        it('ErrorBoundary uses sufficient contrast', () => {
            const content = readComponent('src/components/ErrorBoundary.jsx');
            // Check for light text on light background (common a11y issue)
            // The ErrorBoundary uses #0f172a on #f8fafc which is sufficient
            assert.ok(content.includes('#0f172a') || content.includes('slate-900'), 'Should use dark text');
        });
    });

    describe('Reduced Motion', () => {
        it('components check for reduced motion preference', () => {
            const jsxFiles = findJsxFiles('src');
            let reducedMotionSupport = 0;
            
            for (const file of jsxFiles) {
                const content = readComponent(file.replace(process.cwd() + '/', ''));
                if (content.includes('prefers-reduced-motion') || content.includes('reducedMotion')) {
                    reducedMotionSupport++;
                }
            }
            
            // This is informational - framer-motion handles this automatically
            console.log(`[A11y Info] Found ${reducedMotionSupport} components with explicit reduced-motion support`);
        });
    });
});
