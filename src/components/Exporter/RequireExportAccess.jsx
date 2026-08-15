import React from 'react';
import { Navigate } from 'react-router-dom';
import { hasRenderToken } from './exportAccess';

/**
 * Route guard for the isolated PDF render page.
 *
 * Two legitimate callers reach `/export/:template/:resumeId/:language`:
 *
 *  1. The server-side PDF pipeline, using a headless Chromium context that has NO
 *     Firebase session by construction (fresh context, empty IndexedDB). It proves its
 *     authorization with a single-use render token in the URL fragment. The backend
 *     already verified ownership/publication AND subscription entitlement before minting
 *     that token, so requiring a browser session here would reject the only caller the
 *     page exists for — while adding no security, because the token is the stronger proof.
 *
 *  2. A signed-in human who navigates to the URL directly. With no render token the
 *     page falls back to reading the resume with the caller's own Firebase credentials,
 *     so an authenticated session is still mandatory and Firestore rules remain the
 *     authoritative control.
 *
 * The token never widens access: it is 256-bit, single-use, 60-second, server-issued,
 * and stored only as a SHA-256 hash in a collection no browser can read.
 */
export default function RequireExportAccess({ user, children }) {
    const tokenPresent = typeof window !== 'undefined' && hasRenderToken(window.location.hash);
    if (tokenPresent || user) return children;
    return <Navigate to="/login" replace />;
}
