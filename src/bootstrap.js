// Early theme initialization — completely eliminates Theme FOUC before React mounts
try {
    const saved = localStorage.getItem('cuba_theme') || localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = (saved === 'dark' || saved === 'light') ? saved : (prefersDark ? 'dark' : 'light');
    if (document?.documentElement) {
        document.documentElement.setAttribute('data-theme', theme);
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }
} catch (_) {}

// Recover from stale chunks without requiring inline script execution in index.html.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const registration of registrations) registration.unregister();
    }).catch(() => {});
}
if ('caches' in globalThis) {
    globalThis.caches.keys().then(keys => Promise.all(keys.map(key => globalThis.caches.delete(key)))).catch(() => {});
}

function handleChunkError(message) {
    const text = String(message || '');
    if (!/(module script|Loading chunk|MIME type|dynamically imported module|Failed to fetch)/i.test(text)) return;
    const lastReload = Number.parseInt(sessionStorage.getItem('chunk_reload_time') || '0', 10);
    const now = Date.now();
    if (now - lastReload > 8000) {
        sessionStorage.setItem('chunk_reload_time', String(now));
        window.location.reload();
    }
}

window.addEventListener('error', event => handleChunkError(event.message || event.error?.message), true);
window.addEventListener('unhandledrejection', event => handleChunkError(event.reason?.message || event.reason));
