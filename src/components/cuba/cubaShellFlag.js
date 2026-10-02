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
 *     permission, or data — RBAC remains entirely server-authoritative (§7).
 *   - It has no build-time coupling, so flipping it OFF requires no redeploy
 *     and no rebuild: it is a single localStorage write (§49 rollback path).
 *   - It defaults to the CURRENT, fully-verified legacy chrome, so a user with no
 *     stored preference sees exactly the shell that shipped and passed the
 *     baseline gates. The new shell is opt-in, therefore it cannot regress an
 *     un-flagged production user.
 *
 * This is the honest rollback mechanism for this repository: flip OFF, no
 * redeploy. It is not claimed to be more than that.
 */

export const CUBA_SHELL_FLAG = 'ime365_cuba_shell_v2';
export const CUBA_SHELL_STORAGE_KEY = CUBA_SHELL_FLAG;

/** Values: 'legacy' (default), 'cuba', or absent (= legacy). */
const isKnownValue = (value) => value === 'legacy' || value === 'cuba';

const readStored = () => {
    try {
        if (typeof window !== 'undefined' && window.location) {
            const search = String(window.location.search || '');
            if (search.includes('cuba=1') || search.includes('cuba=true')) {
                localStorage.setItem(CUBA_SHELL_STORAGE_KEY, 'cuba');
                return 'cuba';
            }
            if (search.includes('legacy=1') || search.includes('cuba=0')) {
                localStorage.setItem(CUBA_SHELL_STORAGE_KEY, 'legacy');
                return 'legacy';
            }
        }
        const raw = localStorage.getItem(CUBA_SHELL_STORAGE_KEY);
        return isKnownValue(raw) ? raw : null;
    } catch {
        // Private-mode / storage-disabled browsers fall back to the default.
        return null;
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

/** Default is 'legacy' — the shell that passed the pre-flight gates. */
export const getCubaShellVariant = () => readStored() || 'legacy';

export const isCubaShellEnabled = () => getCubaShellVariant() === 'cuba';

export function setCubaShellVariant(value) {
    const next = isKnownValue(value) ? value : 'legacy';
    writeStored(next);
    return next;
}

export function toggleCubaShell() {
    return setCubaShellVariant(isCubaShellEnabled() ? 'legacy' : 'cuba');
}
