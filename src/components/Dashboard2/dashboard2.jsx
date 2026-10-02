// Backward-compatible facade: the marketing landing shell now lives at
// src/components/Marketing/LandingPage.jsx. This module is retained so any
// cached, external or legacy consumer of 'Dashboard2/dashboard2' still resolves.
export { default } from '../Marketing/LandingPage';