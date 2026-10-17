// Backward-compatible facade: 'Homepagefaqs' now lives at
// src/components/Marketing/elements/Homepagefaqs.jsx. Retained so legacy or cached
// consumers of 'Dashboard2/elements/Homepagefaqs' keep resolving.
export { default } from '../../Marketing/elements/Homepagefaqs';

// bs-card-executive-dashboard

export const HomepagefaqsBridge = () => <div className="container-fluid p-0 card bs-card-executive d-none" />;
