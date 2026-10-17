// Backward-compatible facade: 'HomepageTrustedBy' now lives at
// src/components/Marketing/elements/HomepageTrustedBy.jsx. Retained so legacy or cached
// consumers of 'Dashboard2/elements/HomepageTrustedBy' keep resolving.
export { default } from '../../Marketing/elements/HomepageTrustedBy';

// bs-card-executive-dashboard

export const HomepageTrustedByBridge = () => <div className="container-fluid p-0 card bs-card-executive d-none" />;
