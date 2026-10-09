/**
 * DIR-070 probe harness.
 *
 * Mounts the REAL `SmartResumeComposer` (real partitioner + real `smartEngine.css`)
 * for a given template + fixture so the Page-1 void invariant can be measured in a
 * real Chromium DOM. Built statically by `vite.dir070probe.config.js` and served
 * strictly through XAMPP (Apache :80) — no detached server is ever spawned.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import SmartResumeComposer from '../src/engine/hybrid/SmartResumeComposer';
import { FIXTURES } from './fixtures.js';

const params = new URLSearchParams(window.location.search);
const templateId = params.get('template') || 'Cv1';
const fixture = params.get('fixture') || 'gridDense';
const values = FIXTURES[fixture] || FIXTURES.normal;

createRoot(document.getElementById('dir070-root')).render(
    <div id="dir070-harness-root" style={{ background: '#fff', padding: '12px' }}>
        <SmartResumeComposer templateId={templateId} values={values} />
    </div>,
);
