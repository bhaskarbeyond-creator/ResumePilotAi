// @ts-check
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

test('dir047 probe: dynamic import of template-lab fixtures inside a Playwright spec', async () => {
    const mod = await import(pathToFileURL(path.join(ROOT, 'template-lab', 'fixtures.js')).href);
    expect(Array.isArray(mod.TEMPLATE_IDS)).toBe(true);
    expect(mod.TEMPLATE_IDS.length).toBe(51);
});