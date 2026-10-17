// Backward-compatible facade: 'HomepagePricing' now lives at
// src/components/Marketing/elements/HomepagePricing.jsx. Retained so legacy or cached
// consumers of 'Dashboard2/elements/HomepagePricing' keep resolving.
export { default } from '../../Marketing/elements/HomepagePricing';

// bs-card-executive-dashboard

export const HomepagePricingBridge = () => <div className="container-fluid p-0 card bs-card-executive d-none" />;
