/**
 * ResumePilot AI Media Companion - Content Script
 * Bridges communication between the extension and the web application
 */

// Inject a global flag into the page DOM
const script = document.createElement('script');
script.textContent = `
  window.__RESUMEPILOT_COMPANION__ = {
    installed: true,
    version: '1.0.0',
    capabilities: ['auto-permissions', 'stream-continuity']
  };
  window.dispatchEvent(new CustomEvent('resumepilot_companion_ready', {
    detail: window.__RESUMEPILOT_COMPANION__
  }));
`;
(document.head || document.documentElement).appendChild(script);
script.remove();

// Automatically register this tab's origin with the background service worker
try {
    chrome.runtime.sendMessage({ type: 'REGISTER_TAB_ORIGIN' });
} catch (_) {}

// Relay messages between web page and extension background worker
window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'resumepilot_web') return;

    if (event.data.type === 'CHECK_EXTENSION') {
        chrome.runtime.sendMessage({ type: 'CHECK_EXTENSION_STATUS' }, (response) => {
            window.postMessage({
                source: 'resumepilot_companion',
                type: 'EXTENSION_STATUS_RESPONSE',
                data: response
            }, '*');
        });
    }

    if (event.data.type === 'REFRESH_PERMISSIONS') {
        chrome.runtime.sendMessage({ type: 'FORCE_REFRESH_PERMISSIONS' }, (response) => {
            window.postMessage({
                source: 'resumepilot_companion',
                type: 'REFRESH_PERMISSIONS_RESPONSE',
                data: response
            }, '*');
        });
    }
});
