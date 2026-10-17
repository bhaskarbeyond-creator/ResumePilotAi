// @ts-check
import React from 'react';
import { Puck } from '@puckeditor/core';
import '@puckeditor/core/puck.css';

/**
 * DIR-019 DEFECT 1 — the legacy Puck editor, ISOLATED into its own module.
 *
 * WHY THIS FILE EXISTS (do not "simplify" it back into PortfolioBuilder.jsx):
 *
 * `node_modules/@puckeditor/core/dist/index.css` line 1 is
 *     @import "https://rsms.me/inter/inter.css";
 * A STATIC `import '@puckeditor/core/puck.css'` in PortfolioBuilder.jsx made
 * Vite emit that stylesheet as `assets/PortfolioBuilder-*.css` and eagerly
 * preload it on the DEFAULT studio route. Under the production CSP
 * (`public/.htaccess`, style-src 'self' 'unsafe-inline' https://fonts.googleapis.com)
 * the browser refuses the remote `rsms.me` @import, Vite's preload helper
 * throws `Unable to preload CSS for .../assets/PortfolioBuilder-*.css`, and
 * RouteErrorBoundary renders a fatal 'Application View Error' on
 * /portfolio/builder?edit=:id.
 *
 * The modern studio (WebCvStudio) has ZERO dependency on Puck, so keeping this
 * behind a dynamic `import()` means:
 *   - the default /portfolio/builder route never requests Puck CSS at all, and
 *   - the legacy editor is fetched on demand, and only for `?legacy=1`.
 *
 * This is a pure code-motion refactor: config, data, overrides, onPublish and
 * onChange are all supplied by the caller, so the legacy behaviour (and its
 * bundle) is byte-for-byte equivalent when it IS requested.
 */
const LegacyPuckEditor = ({ config, data, overrides, onPublish, onChange }) => (
    <div className="container-fluid p-0 legacy-puck-editor-bs-root">
    <Puck
        config={config}
        data={data}
        headerTitle="Portfolio Builder"
        overrides={overrides}
        onPublish={onPublish}
        onChange={onChange}
    />
    </div>
);

export default LegacyPuckEditor;
// bs-card-executive-block
