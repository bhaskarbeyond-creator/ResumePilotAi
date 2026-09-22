/**
 * IME365 Media Companion - Content Script
 * Bridges communication between the extension and the web application
 */

// Inject a global flag into the page DOM
const script = document.createElement('script');
script.textContent = `
  const companionInfo = {
    installed: true,
    version: '2.0.0',
    capabilities: ['auto-permissions', 'stream-continuity']
  };
  window.__IME365_COMPANION__ = companionInfo;
  window.__RESUMEPILOT_COMPANION__ = companionInfo;
  window.dispatchEvent(new CustomEvent('ime365_companion_ready', { detail: companionInfo }));
  window.dispatchEvent(new CustomEvent('resumepilot_companion_ready', { detail: companionInfo }));
`;
(document.head || document.documentElement).appendChild(script);
script.remove();

// Automatically register this tab's origin with the background service worker
try {
    chrome.runtime.sendMessage({ type: 'REGISTER_TAB_ORIGIN' });
} catch (_) {}

// Relay messages between web page and extension background worker
window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    const isOurSource = event.data.source === 'ime365_web' || event.data.source === 'resumepilot_web';
    if (!isOurSource) return;

    if (event.data.type === 'CHECK_EXTENSION') {
        chrome.runtime.sendMessage({ type: 'CHECK_EXTENSION_STATUS' }, (response) => {
            window.postMessage({
                source: 'ime365_companion',
                type: 'EXTENSION_STATUS_RESPONSE',
                data: response
            }, '*');
        });
    }

    if (event.data.type === 'REFRESH_PERMISSIONS') {
        chrome.runtime.sendMessage({ type: 'FORCE_REFRESH_PERMISSIONS' }, (response) => {
            window.postMessage({
                source: 'ime365_companion',
                type: 'REFRESH_PERMISSIONS_RESPONSE',
                data: response
            }, '*');
        });
    }
});
