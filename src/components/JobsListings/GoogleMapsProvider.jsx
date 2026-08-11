import React, { createContext, useContext, useEffect, useState } from 'react';

const GoogleMapsContext = createContext();

export const useGoogleMaps = () => {
    const context = useContext(GoogleMapsContext);
    if (!context) {
        throw new Error('useGoogleMaps must be used within a GoogleMapsProvider');
    }
    return context;
};

const GoogleMapsProvider = ({ children, apiKey }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadError, setLoadError] = useState(null);

    useEffect(() => {
        // Check if Google Maps is already loaded
        if (window.google && window.google.maps) {
            setIsLoaded(true);
            return;
        }

        // Check if script is already being loaded
        if (document.querySelector('script[src*="maps.googleapis.com"]')) {
            // Wait for the existing script to load
            const checkLoaded = setInterval(() => {
                if (window.google && window.google.maps) {
                    setIsLoaded(true);
                    clearInterval(checkLoaded);
                }
            }, 100);
            return () => clearInterval(checkLoaded);
        }

        if (!apiKey) {
            console.error('Google Maps API key is required');
            setLoadError('Google Maps API key is required');
            return;
        }

        console.log('Loading Google Maps API with key:', apiKey.substring(0, 10) + '...');

        // Create the script URL
        const scriptUrl = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
        console.log('Google Maps API URL:', scriptUrl);

        // Try to manually test the URL
        console.log('You can test this URL manually in a new tab:', scriptUrl.replace('&loading=async', ''));

        // Load Google Maps script with proper loading attributes
        const script = document.createElement('script');
        script.src = scriptUrl;
        script.async = true;
        script.defer = true;

        script.onload = () => {
            console.log('Google Maps script loaded successfully');
            
            // Give the API more time to initialize, then check if it's available
            const checkApiAvailable = () => {
                if (window.google && window.google.maps && window.google.maps.places) {
                    console.log('Google Maps Places API is available');
                    setIsLoaded(true);
                    return true;
                }
                return false;
            };
            
            // Check immediately first
            if (checkApiAvailable()) {
                return;
            }
            
            // If not available immediately, try a few more times with delays
            let attempts = 0;
            const maxAttempts = 10;
            const checkInterval = setInterval(() => {
                attempts++;
                if (checkApiAvailable()) {
                    clearInterval(checkInterval);
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    console.error('Google Maps script loaded but API not available after multiple attempts');
                    console.error('This might be due to:');
                    console.error('1. Content Security Policy (CSP) restrictions');
                    console.error('2. Ad blocker blocking Google Maps');
                    console.error('3. Network connectivity issues');
                    console.error('4. Browser extensions interfering');
                    setLoadError('Google Maps API not available - using fallback input');
                }
            }, 200); // Check every 200ms
        };

        script.onerror = (error) => {
            console.error('Failed to load Google Maps API script:', error);
            console.error('This could be due to:');
            console.error('1. Invalid API key');
            console.error('2. API key restrictions (HTTP referrers, IP restrictions)');
            console.error('3. Billing not enabled for the project');
            console.error('4. Places API not enabled');
            setLoadError('Failed to load Google Maps API - check console for details');
        };

        document.head.appendChild(script);

        // Set a timeout to detect if the API is blocked or taking too long
        const timeout = setTimeout(() => {
            if (!isLoaded) {
                console.warn('Google Maps API loading timeout after 10 seconds');
                console.warn('Possible causes:');
                console.warn('1. Slow network connection');
                console.warn('2. API key issues');
                console.warn('3. Firewall/network restrictions');
                console.warn('4. Google Maps service unavailable');
                setLoadError('Google Maps API loading timeout - using fallback');
            }
        }, 10000); // 10 second timeout

        return () => {
            clearTimeout(timeout);
            // Cleanup: remove script if component unmounts
// Keep the global Google Maps script loaded; do not remove it on unmount to avoid reloading.
        };
    }, [apiKey]);

    const value = {
        isLoaded,
        loadError,
    };

    return <GoogleMapsContext.Provider value={value}>{children}</GoogleMapsContext.Provider>;
};

export default GoogleMapsProvider;
