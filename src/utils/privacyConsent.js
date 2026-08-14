export const CONSENT_STORAGE_KEY = 'resumepilot_privacy_consent_v1';
export const CONSENT_EVENT = 'resumepilot:privacy-consent';
export const CONSENT_VALUES = Object.freeze(['pending', 'granted', 'denied']);

export function getAnalyticsConsent(storage = globalThis.localStorage) {
    try {
        const value = storage?.getItem(CONSENT_STORAGE_KEY);
        return CONSENT_VALUES.includes(value) ? value : 'pending';
    } catch {
        return 'pending';
    }
}

export function setAnalyticsConsent(value, storage = globalThis.localStorage, target = globalThis.window) {
    if (!['granted', 'denied'].includes(value)) throw new Error('Invalid privacy consent value');
    try { storage?.setItem(CONSENT_STORAGE_KEY, value); } catch { /* consent still applies for this page */ }
    target?.dispatchEvent?.(new CustomEvent(CONSENT_EVENT, { detail: { analytics: value } }));
    return value;
}
