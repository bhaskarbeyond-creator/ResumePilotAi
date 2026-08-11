import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initGA, trackPageView } from '../utils/ga4';
import { getWebsiteData } from '../firestore/dbOperations';

const GA4Provider = ({ children }) => {
    const location = useLocation();

    useEffect(() => {
        // Initialize GA4 with tracking code from Firestore
        const initializeGA4 = async () => {
            try {
                const websiteData = await getWebsiteData();
                if (websiteData && websiteData.trackingCode) {
                    const trackingCode = websiteData.trackingCode.trim();

                    // Check if it's a valid GA4 tracking ID format (G-XXXXXXXXXX) or Universal Analytics (UA-XXXXXXXXX-X)
                    if (trackingCode.match(/^(G-[A-Z0-9]{10}|UA-[0-9]+-[0-9]+)$/)) {
                        initGA(trackingCode);
                    } else {
                        console.warn('Invalid Google Analytics tracking code format:', trackingCode);
                    }
                }
            } catch (error) {
                console.error('Failed to initialize GA4:', error);
            }
        };

        initializeGA4();
    }, []);

    useEffect(() => {
        // Track page views on route change
        const page = location.pathname + location.search;
        trackPageView(page, document.title);
    }, [location]);

    return <>{children}</>;
};

export default GA4Provider;
