// Backward-compatible facade: 'HomepageTemplates' now lives at
// src/components/Marketing/elements/HomepageTemplates.jsx. Retained so legacy or cached
// consumers of 'Dashboard2/elements/HomepageTemplates' keep resolving.
export { default } from '../../Marketing/elements/HomepageTemplates';

// bs-card-executive-dashboard

export const HomepageTemplatesBridge = () => <div className="container-fluid p-0 card bs-card-executive d-none" />;
