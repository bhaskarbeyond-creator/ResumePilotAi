import React, { useRef, useEffect, useState } from 'react';
import { FaMapMarkerAlt, FaSpinner } from 'react-icons/fa';
import { useGoogleMaps } from './GoogleMapsProvider';
import SimpleLocationInput from './SimpleLocationInput';

const LocationAutocomplete = ({ value, onChange, placeholder = 'Location', className = '' }) => {
    const inputRef = useRef(null);
    const autocompleteRef = useRef(null);
    const [isLoading, setIsLoading] = useState(false);
    const { isLoaded, loadError } = useGoogleMaps();

    // Debug logging
    useEffect(() => {
        console.log('LocationAutocomplete Debug:', {
            isLoaded,
            loadError,
            hasGoogle: !!window.google,
            hasMaps: !!(window.google && window.google.maps),
            hasPlaces: !!(window.google && window.google.maps && window.google.maps.places),
        });
    }, [isLoaded, loadError]);

    useEffect(() => {
        // Wait for Google Maps API to be loaded
        if (!isLoaded) {
            console.log('Google Maps API not loaded yet');
            return;
        }

        // Check if Google Maps API is properly loaded
        if (!window.google || !window.google.maps || !window.google.maps.places) {
            console.warn('Google Maps Places API not loaded properly');
            return;
        }

        // Ensure input ref is available
        if (!inputRef.current) {
            return;
        }

        // Initialize the autocomplete
        const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
            types: ['(cities)'], // Restrict to cities
            fields: ['formatted_address', 'geometry', 'name', 'address_components'],
        });

        autocompleteRef.current = autocomplete;

        // Handle place selection
        const handlePlaceSelect = () => {
            setIsLoading(true);
            const place = autocomplete.getPlace();

            if (place && place.formatted_address) {
                // Format the address for better display
                let formattedLocation = place.formatted_address;

                // Try to get a cleaner format: "City, State, Country"
                if (place.address_components) {
                    const components = place.address_components;
                    let city = '';
                    let state = '';
                    let country = '';

                    components.forEach((component) => {
                        const types = component.types;
                        if (types.includes('locality')) {
                            city = component.long_name;
                        } else if (types.includes('administrative_area_level_1')) {
                            state = component.short_name;
                        } else if (types.includes('country')) {
                            country = component.long_name;
                        }
                    });

                    // Build a cleaner format
                    if (city && state && country) {
                        formattedLocation = `${city}, ${state}, ${country}`;
                    } else if (city && country) {
                        formattedLocation = `${city}, ${country}`;
                    }
                }

                onChange(formattedLocation);
            }
            setIsLoading(false);
        };

        // Add event listener
        autocomplete.addListener('place_changed', handlePlaceSelect);

        // Cleanup function
        return () => {
            if (autocompleteRef.current && window.google && window.google.maps) {
                window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
            }
        };
    }, [onChange, isLoaded]);

    const handleInputChange = (e) => {
        onChange(e.target.value);
    };

    const handleKeyDown = (e) => {
        // Prevent form submission when Enter is pressed on autocomplete
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    };

    // If Google Maps failed to load or is not available, use simple fallback
    if (loadError || !isLoaded) {
        console.log('Using SimpleLocationInput fallback - loadError:', loadError, 'isLoaded:', isLoaded);
        return <SimpleLocationInput value={value} onChange={onChange} placeholder={placeholder} className={className} />;
    }

    return (
        <div className="relative">
            <FaMapMarkerAlt className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 z-10" />
            {isLoading && <FaSpinner className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 animate-spin z-10" />}
            <input
                ref={inputRef}
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                className={`w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg bg-white text-sm placeholder-slate-400
                         focus:outline-none focus:border-blue-500 transition-all duration-200 ${className}`}
                autoComplete="off"
                title={isLoaded ? 'Start typing for location suggestions' : 'Loading location suggestions...'}
            />
        </div>
    );
};

export default LocationAutocomplete;
