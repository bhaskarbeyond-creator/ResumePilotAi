import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { applyAnalyticsConsent, initGA, trackPageView } from '../utils/ga4';
import { CONSENT_EVENT, getAnalyticsConsent } from '../utils/privacyConsent';
import { getWebsiteData } from '../firestore/dbOperations';

const GA4Provider = ({ children }) => {
    const location = useLocation();
    const trackingIdRef = useRef('');
    const locationRef = useRef(location);
    locationRef.current = location;

    useEffect(() => {
        let active = true;
        getWebsiteData().then((websiteData) => {
            if (!active) return;
            const trackingCode = String(websiteData?.trackingCode || '').trim();
            if (!/^(G-[A-Z0-9]{10}|UA-[0-9]+-[0-9]+)$/.test(trackingCode)) return;
            trackingIdRef.current = trackingCode;
            initGA(trackingCode);
            if (getAnalyticsConsent() === 'granted') {
                const current = locationRef.current;
                trackPageView(current.pathname + current.search, document.title);
            }
        }).catch((error) => console.error('Failed to load analytics configuration:', error));

        const handleConsent = (event) => {
            const consent = event.detail?.analytics;
            applyAnalyticsConsent(consent);
            if (consent === 'granted' && trackingIdRef.current) {
                initGA(trackingIdRef.current);
                const current = locationRef.current;
                trackPageView(current.pathname + current.search, document.title);
            }
        };
        window.addEventListener(CONSENT_EVENT, handleConsent);
        return () => {
            active = false;
            window.removeEventListener(CONSENT_EVENT, handleConsent);
        };
    }, []);

    useEffect(() => {
        trackPageView(location.pathname + location.search, document.title);
    }, [location]);

    return <>{children}</>;
};

export default GA4Provider;
