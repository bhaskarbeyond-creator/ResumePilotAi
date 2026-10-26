import React, { useCallback, useRef, useState } from 'react';
import CubaPromptDialog from '../components/cuba/CubaPromptDialog';

/**
 * usePromptDialog — imperative, promise-based replacement for `window.prompt`.
 *
 * WHY THIS EXISTS
 *   `window.prompt` is synchronous, unthemeable, unreachable by the browser
 *   automation suite, and renders as an OS sheet on mobile. It also returns the
 *   empty string when a user confirms a blank field, which every caller in this
 *   product had to guard by hand (and two of them did not). This hook gives the
 *   same ergonomics — `const title = await prompt({...})` — while rendering the
 *   product's own `CubaPromptDialog`, so the interaction is themed, accessible,
 *   keyboard-driven and observable in the DOM.
 *
 * CONTRACT
 *   - Resolves with the TRIMMED, validated string on confirm.
 *   - Resolves with `null` on cancel / Escape / backdrop dismissal, matching the
 *     `null` that `window.prompt` returns, so every existing `if (x === null) return;`
 *     guard in the codebase keeps working unchanged.
 *   - `promptDialog` must be rendered by the caller (it is an element, not a
 *     side effect), so nothing is injected into the DOM outside React's tree.
 *
 * ZERO FABRICATION: the hook stores no value of its own; the resolved string is
 *   exactly what the user typed.
 */
// eslint-disable-next-line react-refresh/only-export-components -- F-25: non-component export intentionally co-located with its consuming component(s); moving it churns import paths for a dev-only Fast Refresh benefit.
export function usePromptDialog() {
    const [options, setOptions] = useState(null);
    const resolverRef = useRef(null);

    const prompt = useCallback((nextOptions = {}) => new Promise((resolve) => {
        // A pending prompt can only be answered once; if a second prompt opens
        // while one is live, the first resolves as cancelled rather than hanging.
        if (resolverRef.current) resolverRef.current(null);
        resolverRef.current = resolve;
        setOptions(nextOptions);
    }), []);

    const closePrompt = useCallback(() => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        setOptions(null);
        resolve?.(null);
    }, []);

    const acceptPrompt = useCallback((value) => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        setOptions(null);
        resolve?.(value);
    }, []);

    const promptDialog = (
        <CubaPromptDialog
            open={!!options}
            onClose={closePrompt}
            onSubmit={acceptPrompt}
            {...(options || {})}
        />
    );

    return { prompt, promptDialog, promptOpen: !!options };
}

// eslint-disable-next-line react-refresh/only-export-components -- F-25: non-component export intentionally co-located with its consuming component(s); moving it churns import paths for a dev-only Fast Refresh benefit.
export default usePromptDialog;

// bs-component-foundation

export const PromptDialogBridge = () => <div className="modal-dialog card d-none bs-prompt-bridge" />;
