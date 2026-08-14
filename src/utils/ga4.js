import ReactGA from 'react-ga4';
import { getAnalyticsConsent } from './privacyConsent';

let isInitialized = false;
let configuredTrackingId = '';
let lastPageView = '';
const recentEvents = new Map();
const DEDUPE_WINDOW_MS = 1500;

const analyticsAllowed = () => getAnalyticsConsent() === 'granted';

function isDuplicate(key) {
    const now = Date.now();
    const previous = recentEvents.get(key) || 0;
    recentEvents.set(key, now);
    if (recentEvents.size > 200) {
        for (const [eventKey, timestamp] of recentEvents) if (now - timestamp > DEDUPE_WINDOW_MS) recentEvents.delete(eventKey);
    }
    return now - previous < DEDUPE_WINDOW_MS;
}

export const initGA = (trackingId) => {
    if (!/^(G-[A-Z0-9]{10}|UA-[0-9]+-[0-9]+)$/.test(String(trackingId || ''))) return false;
    configuredTrackingId = trackingId;
    if (isInitialized || !analyticsAllowed()) return false;
    try {
        ReactGA.initialize(trackingId, {
            debug: import.meta.env.DEV,
            gtagOptions: { send_page_view: false, anonymize_ip: true },
        });
        ReactGA.gtag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
        isInitialized = true;
        return true;
    } catch (error) {
        console.error('GA4 initialization failed:', error);
        return false;
    }
};

export const applyAnalyticsConsent = (value) => {
    if (value === 'granted') {
        if (configuredTrackingId) initGA(configuredTrackingId);
        if (isInitialized) ReactGA.gtag('consent', 'update', { analytics_storage: 'granted' });
    } else if (isInitialized) {
        ReactGA.gtag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    }
};

export const trackPageView = (path, title = '') => {
    if (!isInitialized || !analyticsAllowed()) return;
    const page = String(path || '').slice(0, 500);
    if (!page || page === lastPageView) return;
    lastPageView = page;
    try { ReactGA.send({ hitType: 'pageview', page, title: String(title || '').slice(0, 200) }); }
    catch (error) { console.error('GA4 page view tracking failed:', error); }
};

export const trackEvent = (action, category = 'General', label = '', value = 0) => {
    if (!isInitialized || !analyticsAllowed()) return;
    const event = {
        action: String(action || '').slice(0, 100), category: String(category || 'General').slice(0, 100),
        label: String(label || '').slice(0, 100), value: Number.isFinite(Number(value)) ? Number(value) : 0,
    };
    if (!event.action || isDuplicate(JSON.stringify(event))) return;
    try { ReactGA.event(event); } catch (error) { console.error('GA4 event tracking failed:', error); }
};

export const trackCustomEvent = (eventName, parameters = {}) => {
    if (!isInitialized || !analyticsAllowed()) return;
    const name = String(eventName || '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40);
    if (!name) return;
    const safeParameters = Object.fromEntries(Object.entries(parameters).slice(0, 25).map(([key, value]) => [
        String(key).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40),
        typeof value === 'number' || typeof value === 'boolean' ? value : String(value ?? '').slice(0, 100),
    ]));
    if (isDuplicate(`${name}:${JSON.stringify(safeParameters)}`)) return;
    try { ReactGA.gtag('event', name, safeParameters); } catch (error) { console.error('GA4 custom event tracking failed:', error); }
};

export const trackEngagement = (action, details = {}) => trackCustomEvent('engagement', { action, ...details });
export const trackResumeAction = (action, resumeId = '') => trackEvent(action, 'Resume', resumeId ? 'resume' : '');
export const trackCoverLetterAction = (action, coverId = '') => trackEvent(action, 'Cover Letter', coverId ? 'cover_letter' : '');
export const trackDownload = (templateName, documentType = 'resume') => trackCustomEvent('download', { template_name: templateName, document_type: documentType });
export const trackUserRegistration = (method = 'email') => trackCustomEvent('sign_up', { method });
export const trackUserLogin = (method = 'email') => trackCustomEvent('login', { method });
export const trackSubscription = (subscriptionType, price = 0) => trackCustomEvent('purchase', {
    currency: 'USD', value: Number(price) || 0, item_name: `${subscriptionType} Subscription`, item_category: 'Subscription', quantity: 1,
});
export const isGA4Initialized = () => isInitialized;

export default { initGA, applyAnalyticsConsent, trackPageView, trackEvent, trackCustomEvent, trackEngagement, trackResumeAction, trackCoverLetterAction, trackDownload, trackUserRegistration, trackUserLogin, trackSubscription, isGA4Initialized };
