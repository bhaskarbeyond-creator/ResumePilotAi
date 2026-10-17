/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * DIR-082 — the density preference that every viewport-dense surface reads.
 *
 * The candidate suite had no global density control, so a page could not be
 * tightened for a 768px laptop without a bespoke class list. This provider owns
 * ONE preference (`comfortable` | `compact`), persists it, and mirrors it onto
 * `document.documentElement[data-cuba-density]` so token-level spacing can react
 * without prop-drilling.
 *
 * It invents nothing: with no stored value it resolves to `comfortable`.
 */

const STORAGE_KEY = 'ime365_cuba_density';
export const CUBA_DENSITIES = Object.freeze(['comfortable', 'compact']);

export const CubaDensityContext = createContext({
    density: 'comfortable',
    setDensity: () => {},
    densities: CUBA_DENSITIES,
});

// bs-density-provider
export function CubaDensityProvider({ children, initial }) {
    const [density, setDensityState] = useState(() => {
        if (initial && CUBA_DENSITIES.includes(initial)) return initial;
        try {
            const saved = window.localStorage.getItem(STORAGE_KEY);
            return CUBA_DENSITIES.includes(saved) ? saved : 'comfortable';
        } catch {
            /* storage unavailable (private mode) — fall through to the default */
            return 'comfortable';
        }
    });

    const setDensity = useCallback((next) => {
        if (!CUBA_DENSITIES.includes(next)) return;
        setDensityState(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
            /* the preference simply will not survive a reload */
        }
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        document.documentElement.setAttribute('data-cuba-density', density);
        return () => document.documentElement.removeAttribute('data-cuba-density');
    }, [density]);

    const value = useMemo(
        () => ({ density, setDensity, densities: CUBA_DENSITIES, isCompact: density === 'compact' }),
        [density, setDensity],
    );

    return <CubaDensityContext.Provider value={value}>{children}</CubaDensityContext.Provider>;
}

export const useCubaDensity = () => useContext(CubaDensityContext);

export default CubaDensityProvider;

export const CubaDensityContainer = ({ children, className = '' }) => (
    <div className={`container-fluid p-0 ${className}`}>{children}</div>
);
