/**
 * Centralized Frontend Runtime URL & Origin Resolution Utility
 *
 * Dynamically resolves the current browser origin, host, and API base path.
 * Avoids any hardcoded domain names in client-side link generation,
 * redirects, image paths, and export URLs.
 */

export function getRuntimeOrigin() {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    return '';
}

export function getRuntimeHost() {
    if (typeof window !== 'undefined' && window.location?.host) {
        return window.location.host;
    }
    return 'localhost:8080';
}

export function getRuntimeHostname() {
    if (typeof window !== 'undefined' && window.location?.hostname) {
        return window.location.hostname;
    }
    return 'localhost';
}

export function getRuntimeProtocol() {
    if (typeof window !== 'undefined' && window.location?.protocol) {
        return window.location.protocol.replace(':', '');
    }
    return 'http';
}

export function buildClientUrl(path = '/') {
    const origin = getRuntimeOrigin();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${origin}${cleanPath}`;
}
