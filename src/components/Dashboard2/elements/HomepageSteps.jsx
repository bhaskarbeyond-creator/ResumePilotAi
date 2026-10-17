// Backward-compatible facade: 'HomepageSteps' now lives at
// src/components/Marketing/elements/HomepageSteps.jsx. Retained so legacy or cached
// consumers of 'Dashboard2/elements/HomepageSteps' keep resolving.
export { default } from '../../Marketing/elements/HomepageSteps';

// bs-card-executive-dashboard

export const HomepageStepsBridge = () => <div className="container-fluid p-0 card bs-card-executive d-none" />;
