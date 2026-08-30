import React from 'react';

/**
 * Top-level React Error Boundary.
 *
 * Catches unhandled rendering errors anywhere in the component tree and
 * displays a recoverable fallback UI instead of a blank white screen.
 *
 * The boundary intentionally does NOT attempt to auto-recover: a crashed
 * component tree may have left inconsistent state (half-committed form
 * data, dangling subscriptions, etc.). The user is offered a manual
 * "Reload application" action that performs a clean full-page navigation.
 *
 * Design decisions:
 *   - No external dependencies (zero bundle impact beyond React itself).
 *   - Uses only inline styles so the fallback renders even when the
 *     stylesheet fails to load or is corrupted.
 *   - Logs the error to the console for developer diagnostics; in
 *     production this would be forwarded to an error-reporting service.
 *   - Never exposes stack traces or internal details to the user.
 */

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, errorId: null };
    }

    static getDerivedStateFromError(_error) {
        // Generate a short, user-visible correlation ID so support can
        // cross-reference it with server-side logs if the user reports it.
        const errorId = `ERR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        return { hasError: true, errorId };
    }

    componentDidCatch(error, errorInfo) {
        // In production this would forward to Sentry / Datadog / etc.
        // For now, log structured data so it is greppable.
        console.error('[ErrorBoundary] Unhandled rendering error', {
            errorId: this.state.errorId,
            message: error?.message,
            componentStack: errorInfo?.componentStack,
        });
    }

    handleReload = () => {
        // Full navigation, not React state reset, to guarantee a clean slate.
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            return (
                <main
                    style={{
                        display: 'flex',
                        minHeight: '100vh',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#f8fafc',
                        padding: '24px',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                    }}
                >
                    <div
                        style={{
                            maxWidth: '480px',
                            width: '100%',
                            textAlign: 'center',
                            background: '#ffffff',
                            borderRadius: '16px',
                            padding: '40px 32px',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                        }}
                        role="alert"
                        aria-live="assertive"
                    >
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
                            Something went wrong
                        </h1>
                        <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 24px', lineHeight: 1.6 }}>
                            An unexpected error occurred while rendering this page.
                            Reloading the application should resolve the issue.
                        </p>
                        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 24px' }}>
                            Error reference: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{this.state.errorId}</code>
                        </p>
                        <button
                            onClick={this.handleReload}
                            style={{
                                background: '#0f172a',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '12px 24px',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            Reload application
                        </button>
                    </div>
                </main>
            );
        }

        return this.props.children;
    }
}
