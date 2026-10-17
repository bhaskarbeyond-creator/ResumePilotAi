// Backward-compatible facade: 'HomepageNavbar' now lives at
// src/components/Marketing/elements/HomepageNavbar.jsx. Retained so legacy or cached
// consumers of 'Dashboard2/elements/HomepageNavbar' keep resolving.
export { default } from '../../Marketing/elements/HomepageNavbar';

// bs-card-executive-dashboard

export const HomepageNavbarBridge = () => <div className="container-fluid p-0 card bs-card-executive d-none" />;
