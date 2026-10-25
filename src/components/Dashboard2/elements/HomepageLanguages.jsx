// Backward-compatible facade: 'HomepageLanguages' now lives at
// src/components/Marketing/elements/HomepageLanguages.jsx. Retained so legacy or cached
// consumers of 'Dashboard2/elements/HomepageLanguages' keep resolving.
// eslint-disable-next-line react-refresh/only-export-components -- F-25: pure re-export shim; no local component is defined here, so a Fast Refresh boundary cannot apply.
export { default } from '../../Marketing/elements/HomepageLanguages';

// bs-card-executive-dashboard

export const HomepageLanguagesBridge = () => <div className="container-fluid p-0 card bs-card-executive d-none" />;
