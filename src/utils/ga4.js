import ReactGA from 'react-ga4';

let isInitialized = false;

// Initialize GA4 with the tracking ID
export const initGA = (trackingId) => {
    if (!trackingId || isInitialized) {
        return;
    }

    try {
        ReactGA.initialize(trackingId, {
            debug: process.env.NODE_ENV === 'development', // Enable debug mode in development
            gtagOptions: {
                send_page_view: false, // We'll send page views manually
            },
        });

        isInitialized = true;
    } catch (error) {
        console.error('GA4 initialization failed:', error);
    }
};

// Track page views
export const trackPageView = (path, title = '') => {
    if (!isInitialized) {
        return;
    }

    try {
        ReactGA.send({
            hitType: 'pageview',
            page: path,
            title: title,
        });
    } catch (error) {
        console.error('GA4 page view tracking failed:', error);
    }
};

// Track custom events
export const trackEvent = (action, category = 'General', label = '', value = 0) => {
    if (!isInitialized) {
        return;
    }

    try {
        ReactGA.event({
            action: action,
            category: category,
            label: label,
            value: value,
        });
    } catch (error) {
        console.error('GA4 event tracking failed:', error);
    }
};

// Track custom events with additional parameters
export const trackCustomEvent = (eventName, parameters = {}) => {
    if (!isInitialized) {
        return;
    }

    try {
        ReactGA.gtag('event', eventName, parameters);
    } catch (error) {
        console.error('GA4 custom event tracking failed:', error);
    }
};

// Track user engagement events
export const trackEngagement = (action, details = {}) => {
    trackCustomEvent('engagement', {
        action: action,
        ...details,
    });
};

// Track user actions specific to your app
export const trackResumeAction = (action, resumeId = '') => {
    trackEvent(action, 'Resume', resumeId);
};

export const trackCoverLetterAction = (action, coverId = '') => {
    trackEvent(action, 'Cover Letter', coverId);
};

export const trackDownload = (templateName, documentType = 'resume') => {
    trackCustomEvent('download', {
        template_name: templateName,
        document_type: documentType,
    });
};

export const trackUserRegistration = (method = 'email') => {
    trackCustomEvent('sign_up', {
        method: method,
    });
};

export const trackUserLogin = (method = 'email') => {
    trackCustomEvent('login', {
        method: method,
    });
};

export const trackSubscription = (subscriptionType, price = 0) => {
    trackCustomEvent('purchase', {
        currency: 'USD',
        value: price,
        transaction_id: Date.now().toString(),
        items: [
            {
                item_id: subscriptionType,
                item_name: `${subscriptionType} Subscription`,
                category: 'Subscription',
                quantity: 1,
                price: price,
            },
        ],
    });
};

// Check if GA4 is initialized
export const isGA4Initialized = () => isInitialized;

export default {
    initGA,
    trackPageView,
    trackEvent,
    trackCustomEvent,
    trackEngagement,
    trackResumeAction,
    trackCoverLetterAction,
    trackDownload,
    trackUserRegistration,
    trackUserLogin,
    trackSubscription,
    isGA4Initialized,
};
