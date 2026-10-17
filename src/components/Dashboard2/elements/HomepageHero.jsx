// Backward-compatible facade: 'HomepageHero' now lives at
// src/components/Marketing/elements/HomepageHero.jsx. Retained so legacy or cached
// consumers of 'Dashboard2/elements/HomepageHero' keep resolving.
export { default } from '../../Marketing/elements/HomepageHero';

// bs-card-executive-dashboard

export const HomepageHeroBridge = () => <div className="container-fluid p-0 card bs-card-executive d-none" />;
