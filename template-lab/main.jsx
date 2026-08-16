/**
 * Template Forensic Lab — renders one template full-size with one fixture,
 * with no application chrome. Driven by URL parameters:
 *   /template-lab/index.html?template=Cv1&fixture=normal&lang=en
 *
 * Exposes machine-readable state on <html> so the audit harness can wait for
 * deterministic rendering:
 *   data-lab-state = "rendering" | "ready" | "error"
 *   data-lab-template, data-lab-fixture
 */
import './i18n.bootstrap.js';
// Mirrors src/main.jsx: the shared global template design system must be loaded
// exactly like the production app loads it.
import '../src/cv-templates/css/globalTemplateEnhancements.css';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TemplateRenderer from '../src/components/TemplateRenderer';
import { FIXTURES, FIXTURE_ORDER, TEMPLATE_IDS, TEMPLATE_DEFAULT_COLORS } from './fixtures.js';

const params = new URLSearchParams(window.location.search);
const templateId = TEMPLATE_IDS.includes(params.get('template')) ? params.get('template') : 'Cv1';
const fixtureName = FIXTURE_ORDER.includes(params.get('fixture')) ? params.get('fixture') : 'normal';
const language = String(params.get('lang') || 'en');
// Mirror the production builder: template selection injects the template's
// default colors into the resume view model.
const values = {
  ...FIXTURES[fixtureName],
  colors: FIXTURES[fixtureName].colors || TEMPLATE_DEFAULT_COLORS[templateId] || undefined,
};

const stateEl = document.documentElement;
stateEl.setAttribute('data-lab-state', 'rendering');
stateEl.setAttribute('data-lab-template', templateId);
stateEl.setAttribute('data-lab-fixture', fixtureName);
stateEl.setAttribute('data-lab-language', language);

// The A4 composer fires `resume-composed` once the document has been
// partitioned into pages; the lab is only "ready" for measurement then.
// (Cover-letter documents never compose — fallback timer keeps the lab usable.)
let composed = false;
let readyAttempts = 0;
let quietTimer = null;
const markReady = () => {
    if (composed) return;
    // Never signal ready while a composition is mid-flight (scratch host present).
    if (document.querySelector('.resume-scratch')) {
        if (readyAttempts++ < 60) setTimeout(markReady, 120);
        return;
    }
    composed = true;
    stateEl.setAttribute('data-lab-state', 'ready');
    stateEl.removeAttribute('data-lab-error');
};
// The composer fires resume-composed for every rebuild; only mark the lab
// ready after a quiet period so late-arriving content (extras portal, image
// loads, font settling) is included in the measured document.
document.addEventListener('resume-composed', () => {
    if (composed) return;
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(markReady, 600);
});
setTimeout(markReady, 4000);

function CrashFallback() {
  useEffect(() => {
    stateEl.setAttribute('data-lab-state', 'error');
    stateEl.setAttribute('data-lab-error', 'render-boundary');
  }, []);
  return <div data-lab-crash="true">Template failed to render.</div>;
}

function LabApp() {
  const [error, setError] = useState(null);
  const handleReady = () => {
    if (!error) {
      stateEl.setAttribute('data-lab-state', 'ready');
      stateEl.removeAttribute('data-lab-error');
    }
  };
  useEffect(() => {
    if (error) {
      stateEl.setAttribute('data-lab-state', 'error');
      stateEl.setAttribute('data-lab-error', String(error?.message || error).slice(0, 500));
      markReady();
    }
  }, [error]);
  return (
    <TemplateRenderer
      templateId={templateId}
      values={values}
      language={language}
      onReady={handleReady}
      onError={(err) => setError(err)}
      errorFallback={<CrashFallback />}
    />
  );
}

createRoot(document.getElementById('lab-root')).render(
  <React.StrictMode>
    <LabApp />
  </React.StrictMode>
);
