// Backward-compatible facade: 'HomepageFooter' now lives at
// src/components/Marketing/elements/HomepageFooter.jsx. Retained so legacy or cached
// consumers of 'Dashboard2/elements/HomepageFooter' keep resolving.
export { default } from '../../Marketing/elements/HomepageFooter';

// bs-card-executive-dashboard

export const HomepageFooterBridge = () => <div className="container-fluid p-0 card bs-card-executive d-none" />;
