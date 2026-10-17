// Backward-compatible facade: 'HomepageFinalCta' now lives at
// src/components/Marketing/elements/HomepageFinalCta.jsx. Retained so legacy or cached
// consumers of 'Dashboard2/elements/HomepageFinalCta' keep resolving.
export { default } from '../../Marketing/elements/HomepageFinalCta';

// bs-card-executive-dashboard

export const HomepageFinalCtaBridge = () => <div className="container-fluid p-0 card bs-card-executive d-none" />;
