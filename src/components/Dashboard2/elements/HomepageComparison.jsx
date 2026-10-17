// Backward-compatible facade: 'HomepageComparison' now lives at
// src/components/Marketing/elements/HomepageComparison.jsx. Retained so legacy or cached
// consumers of 'Dashboard2/elements/HomepageComparison' keep resolving.
export { default } from '../../Marketing/elements/HomepageComparison';

// bs-card-executive-dashboard

export const HomepageComparisonBridge = () => <div className="container-fluid p-0 card bs-card-executive d-none" />;
