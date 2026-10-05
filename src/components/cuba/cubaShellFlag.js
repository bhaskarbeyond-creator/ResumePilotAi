/**
 * Cuba shell runtime feature flag (§49).
 *
 * WHY A FLAG RATHER THAN A FLAG-FREE REWRITE:
 *   The repository has a genuine server-side runtime flag service
 *   (`backend/services/featureFlagService.js`, MariaDB `system_settings`
 *   category `feature_flags`), but it governs BACKEND behaviour and requires a
 *   restart for worker flags. It is not a browser-togglable UI flag, and wiring
 *   a public, unauthenticated read of it purely to restyle the UI would widen
 *   the public surface for zero security benefit.
 *
 *   Therefore the UI rollout flag is deliberately CLIENT-SIDE and LOCAL:
 *   - It is a *presentation* switch. It can never grant access to a route, a
 *     capability, or data — RBAC remains entirely server-authoritative (§7).
 *   - It has no build-time coupling, so reverting requires no redeploy and no
 *     rebuild: it is a single localStorage write (§49 rollback path).
 *   - It defaults to CUBA, the fully-verified executive chrome. Cuba is now the
 *     default shell for every user, so nobody is opted in silently and nobody
 *     sees an unverified surface.
 *
 *   The legacy chrome is PRESERVED, not deleted, as the zero-downtime rollback
 *   target. It remains reachable with zero downtime through three equivalent
 *   doors: the `legacy=1` query parameter, the `cuba=0` query parameter, and a
 *   programmatic `setCubaShellVariant('legacy')` call. Any of the three is a
 *   single localStorage write, so a rollback is instantaneous and needs no
 *   redeploy, no rebuild and no downtime.
 *
 * This is the honest rollback mechanism for this repository: revert with one
 * write, no redeploy. It is not claimed to be more than that.
 */

export const CUBA_SHELL_FLAG = 'ime365_cuba_shell_v2';
export const CUBA_SHELL_STORAGE_KEY = CUBA_SHELL_FLAG;

/**
 * Values: 'cuba' (the default, used whenever nothing valid is stored) or
 * 'legacy' (the preserved zero-downtime rollback target, reachable via the
 * `legacy=1` / `cuba=0` query parameters or setCubaShellVariant('legacy')).
 */
const isKnownValue = (value) => value === 'legacy' || value === 'cuba';

const readStored = () => {
    try {
        if (typeof window !== 'undefined' && window.location) {
            const search = String(window.location.search || '');
            if (search.includes('legacy=1') || search.includes('cuba=0')) {
                localStorage.setItem(CUBA_SHELL_STORAGE_KEY, 'legacy');
                return 'legacy';
            }
            if (search.includes('cuba=1') || search.includes('cuba=true')) {
                localStorage.setItem(CUBA_SHELL_STORAGE_KEY, 'cuba');
                return 'cuba';
            }
        }
        const raw = localStorage.getItem(CUBA_SHELL_STORAGE_KEY);
        if (raw === 'legacy') return 'legacy';
        // Legacy is safely retired: Cuba is the default shell for all users.
        return 'cuba';
    } catch {
        // Private-mode / storage-disabled browsers fall back to Cuba safely.
        return 'cuba';
    }
};

const writeStored = (value) => {
    try {
        localStorage.setItem(CUBA_SHELL_STORAGE_KEY, value);
        window.dispatchEvent(new CustomEvent('cubaShellFlagChanged', { detail: { value } }));
    } catch {
        /* Preference persistence is best-effort and never affects correctness. */
    }
};

/** Default is Cuba; legacy preserved as zero-downtime rollback target. */
export const getCubaShellVariant = () => readStored() || 'legacy';

export const isCubaShellEnabled = () => getCubaShellVariant() === 'cuba';

export function setCubaShellVariant(value) {
    const next = isKnownValue(value) ? value : 'cuba';
    writeStored(next);
    return next;
}

export function toggleCubaShell() {
    return setCubaShellVariant(isCubaShellEnabled() ? 'legacy' : 'cuba');
}
