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
