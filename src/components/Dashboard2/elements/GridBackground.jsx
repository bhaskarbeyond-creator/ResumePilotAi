// Backward-compatible facade: 'GridBackground' now lives at
// src/components/Marketing/elements/GridBackground.jsx. Retained so legacy or cached
// consumers of 'Dashboard2/elements/GridBackground' keep resolving.
// eslint-disable-next-line react-refresh/only-export-components -- F-25: pure re-export shim; no local component is defined here, so a Fast Refresh boundary cannot apply.
export { default } from '../../Marketing/elements/GridBackground';

// bs-card-executive-dashboard

export const GridBackgroundBridge = () => <div className="container-fluid p-0 card bs-card-executive d-none" />;
