// Backward-compatible facade: 'HomepageStorySections' now lives at
// src/components/Marketing/elements/HomepageStorySections.jsx. Retained so legacy or cached
// consumers of 'Dashboard2/elements/HomepageStorySections' keep resolving.
// eslint-disable-next-line react-refresh/only-export-components -- F-25: pure re-export shim; no local component is defined here, so a Fast Refresh boundary cannot apply.
export { default } from '../../Marketing/elements/HomepageStorySections';

// bs-card-executive-dashboard

export const HomepageStorySectionsBridge = () => <div className="container-fluid p-0 card bs-card-executive d-none" />;
