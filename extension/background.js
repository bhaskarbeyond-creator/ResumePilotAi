/**
 * ResumePilot AI Media Companion - Background Service Worker
 * Automatically configures browser contentSettings for microphone & camera
 */

const TARGET_ORIGIN_PATTERNS = [
    'http://localhost:*/*',
    'http://127.0.0.1:*/*',
    'https://airesume.projectdemo.guru/*'
];

async function autoAllowMediaPermissions() {
    for (const pattern of TARGET_ORIGIN_PATTERNS) {
        try {
            if (chrome.contentSettings && chrome.contentSettings.microphone) {
                chrome.contentSettings.microphone.set({
                    primaryPattern: pattern,
                    setting: 'allow',
                    scope: 'regular'
                });
            }
            if (chrome.contentSettings && chrome.contentSettings.camera) {
                chrome.contentSettings.camera.set({
                    primaryPattern: pattern,
                    setting: 'allow',
                    scope: 'regular'
                });
            }
        } catch (error) {
            console.error('[ResumePilot Extension] Failed setting permission for pattern:', pattern, error);
        }
    }
}

// Apply permissions immediately upon installation or startup
chrome.runtime.onInstalled.addListener(() => {
    autoAllowMediaPermissions();
});

chrome.runtime.onStartup.addListener(() => {
    autoAllowMediaPermissions();
});

// Respond to status queries and auto-registration from contentScript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'REGISTER_TAB_ORIGIN' && sender?.tab?.url) {
        try {
            const url = new URL(sender.tab.url);
            const pattern = `${url.protocol}//${url.host}/*`;
            if (chrome.contentSettings?.microphone) {
                chrome.contentSettings.microphone.set({ primaryPattern: pattern, setting: 'allow', scope: 'regular' });
            }
            if (chrome.contentSettings?.camera) {
                chrome.contentSettings.camera.set({ primaryPattern: pattern, setting: 'allow', scope: 'regular' });
            }
            sendResponse({ registered: true, pattern });
        } catch (err) {
            sendResponse({ registered: false, error: err.message });
        }
        return true;
    }

    if (message?.type === 'CHECK_EXTENSION_STATUS') {
        sendResponse({
            active: true,
            version: '1.0.0',
            permissions: 'auto-granted',
            timestamp: Date.now()
        });
        return true;
    }
    if (message?.type === 'FORCE_REFRESH_PERMISSIONS') {
        autoAllowMediaPermissions().then(() => {
            sendResponse({ success: true });
        });
        return true;
    }
});
