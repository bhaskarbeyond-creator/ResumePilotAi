import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('Zero-FOUC Architecture & Pre-Paint Hydration Gate', () => {
    it('index.html contains a synchronous pre-paint script tag in <head>', () => {
        const html = read('index.html');
        // Must contain synchronous <script src="/theme-init.js"></script> before closing </head>
        const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
        assert.ok(headMatch, 'index.html must have a <head> block');
        const head = headMatch[1];
        
        assert.match(head, /<script[^>]+src=["']\/theme-init\.js["'][^>]*><\/script>/i, 'must link /theme-init.js in <head>');
        // Must NOT be deferred or module (so it executes synchronously before paint)
        const scriptTag = head.match(/<script[^>]+src=["']\/theme-init\.js["'][^>]*>/i)[0];
        assert.doesNotMatch(scriptTag, /\btype=["']module["']/i, 'theme-init.js must not be a deferred module');
        assert.doesNotMatch(scriptTag, /\bdefer\b/i, 'theme-init.js must not have defer attribute');
        assert.doesNotMatch(scriptTag, /\basync\b/i, 'theme-init.js must not have async attribute');
    });

    it('public/theme-init.js exists and implements synchronous theme resolution', () => {
        assert.ok(fs.existsSync(path.join(root, 'public/theme-init.js')), 'public/theme-init.js must exist');
        const code = read('public/theme-init.js');
        assert.match(code, /localStorage\.getItem\(['"]cuba_theme['"]\)/);
        assert.match(code, /matchMedia\(['"]\(prefers-color-scheme: dark\)['"]\)/);
        assert.match(code, /setAttribute\(['"]data-theme['"]/);
        assert.match(code, /classList\.add\(['"]dark['"]\)/);
    });

    it('index.html includes critical pre-paint styling for instant canvas rendering', () => {
        const html = read('index.html');
        const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
        const head = headMatch[1];
        assert.match(head, /<style>[\s\S]*?<\/style>/i, 'must contain critical inline style block');
        assert.match(head, /background-color:\s*#f4f5f9/, 'must define light canvas color #f4f5f9');
        assert.match(head, /background-color:\s*#0d0f16/, 'must define dark canvas color #0d0f16');
        assert.match(head, /@media\s*\(prefers-color-scheme:\s*dark\)/, 'must support system dark preference');
        assert.match(head, /\.skip-link[\s\S]*?top:\s*-100px/, 'must hide skip-link before external CSS loads');
    });

    it('src/index.css avoids hardcoding plain white on :root', () => {
        const css = read('src/index.css');
        assert.doesNotMatch(css, /:root\s*\{[^}]*background-color:\s*#ffffff;/i, 'must not hardcode #ffffff on :root in index.css');
        assert.match(css, /var\(--cuba-canvas/);
    });

    it('Spinner component includes full viewport coverage and theme canvas background', () => {
        const scss = read('src/components/Spinner/spinner.scss');
        assert.match(scss, /min-height:\s*100vh/);
        assert.match(scss, /var\(--cuba-canvas/);
        assert.match(scss, /display:\s*flex/);
    });
});
