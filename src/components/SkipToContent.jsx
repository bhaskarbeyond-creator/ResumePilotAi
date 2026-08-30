/**
 * SkipToContent — Accessibility component that allows keyboard users
 * to skip navigation and jump directly to main content.
 *
 * Becomes visible on focus (Tab key) and hidden otherwise.
 */
import React from 'react';

const skipStyle = {
    position: 'absolute',
    left: '-10000px',
    top: 'auto',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
};

const skipFocusStyle = {
    position: 'fixed',
    top: '8px',
    left: '8px',
    width: 'auto',
    height: 'auto',
    overflow: 'visible',
    zIndex: 999999,
    padding: '12px 24px',
    background: '#0f172a',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 700,
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    textDecoration: 'none',
    outline: '2px solid #3b82f6',
    outlineOffset: '2px',
};

export default function SkipToContent() {
    const [focused, setFocused] = React.useState(false);

    return (
        <a
            href="#main-content"
            style={focused ? skipFocusStyle : skipStyle}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onClick={(e) => {
                const target = document.getElementById('main-content');
                if (target) {
                    e.preventDefault();
                    target.setAttribute('tabindex', '-1');
                    target.focus();
                }
            }}
        >
            Skip to main content
        </a>
    );
}
