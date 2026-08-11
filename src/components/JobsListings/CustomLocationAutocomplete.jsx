import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FaMapMarkerAlt, FaSpinner, FaTimes, FaExclamationTriangle } from 'react-icons/fa';
import { useGoogleMaps } from './GoogleMapsProvider';
import SimpleLocationInput from './SimpleLocationInput';

const CustomLocationAutocomplete = ({ value, onChange, placeholder = 'Location', className = '' }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [quotaExceeded, setQuotaExceeded] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const inputRef = useRef(null);
    const suggestionsRef = useRef(null);
    const autocompleteService = useRef(null);
    const placesService = useRef(null);
    const debounceTimer = useRef(null);
    const requestCount = useRef(0);
    const lastRequestTime = useRef(0);
    const { isLoaded, loadError } = useGoogleMaps();

    // Initialize Google Places services
    useEffect(() => {
        if (isLoaded && window.google && window.google.maps && window.google.maps.places) {
            autocompleteService.current = new window.google.maps.places.AutocompleteService();
            // Create a dummy div for PlacesService (required by Google)
            const dummyDiv = document.createElement('div');
            placesService.current = new window.google.maps.places.PlacesService(dummyDiv);
            console.log('Google Places services initialized');
        }
    }, [isLoaded]);

    // Handle click outside to close suggestions
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (inputRef.current && !inputRef.current.contains(event.target) && suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
                setShowSuggestions(false);
                setSelectedIndex(-1);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Rate limiting helper
    const canMakeRequest = useCallback(() => {
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime.current;
        
        // Reset request count every minute
        if (timeSinceLastRequest > 60000) {
            requestCount.current = 0;
        }
        
        // Limit to 50 requests per minute (well below Google's limits)
        if (requestCount.current >= 50) {
            console.warn('Rate limit reached, throttling requests');
            return false;
        }
        
        return true;
    }, []);

    // Debounced search function
    const debouncedSearch = useCallback((input) => {
        // Clear any existing timer
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }
        
        // Set new timer
        debounceTimer.current = setTimeout(() => {
            searchPlaces(input);
        }, 300); // 300ms debounce
    }, []);

    const searchPlaces = async (input) => {
        if (!autocompleteService.current || input.length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            setErrorMessage('');
            return;
        }

        // Check rate limiting
        if (!canMakeRequest()) {
            setErrorMessage('Too many requests. Please wait a moment.');
            return;
        }

        // If quota was exceeded, try to reinitialize service
        if (quotaExceeded) {
            try {
                autocompleteService.current = new window.google.maps.places.AutocompleteService();
                setQuotaExceeded(false);
                setErrorMessage('');
                console.log('Reinitializing Google Places service after quota error');
            } catch (error) {
                console.error('Failed to reinitialize service:', error);
                setErrorMessage('Service temporarily unavailable. Please try again later.');
                return;
            }
        }

        setIsLoading(true);
        setErrorMessage('');
        requestCount.current++;
        lastRequestTime.current = Date.now();

        try {
            const request = {
                input: input,
                types: ['(cities)'],
                componentRestrictions: {}, // Remove to allow worldwide search
            };

            autocompleteService.current.getPlacePredictions(request, (predictions, status) => {
                setIsLoading(false);

                console.log('Google Places API response status:', status);

                switch (status) {
                    case window.google.maps.places.PlacesServiceStatus.OK:
                        if (predictions && predictions.length > 0) {
                            const formattedSuggestions = predictions.slice(0, 8).map((prediction) => ({
                                placeId: prediction.place_id,
                                description: prediction.description,
                                mainText: prediction.structured_formatting.main_text,
                                secondaryText: prediction.structured_formatting.secondary_text,
                            }));

                            setSuggestions(formattedSuggestions);
                            setShowSuggestions(true);
                            setSelectedIndex(-1);
                            setQuotaExceeded(false);
                            setErrorMessage('');
                        } else {
                            setSuggestions([]);
                            setShowSuggestions(false);
                        }
                        break;

                    case window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS:
                        setSuggestions([]);
                        setShowSuggestions(false);
                        setErrorMessage('');
                        console.log('No results found for:', input);
                        break;

                    case window.google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT:
                        console.error('Google Places API quota exceeded');
                        setQuotaExceeded(true);
                        setSuggestions([]);
                        setShowSuggestions(false);
                        setErrorMessage('Search quota exceeded. Please try again in a few minutes.');
                        break;

                    case window.google.maps.places.PlacesServiceStatus.REQUEST_DENIED:
                        console.error('Google Places API request denied - check API key and restrictions');
                        setSuggestions([]);
                        setShowSuggestions(false);
                        setErrorMessage('Location search unavailable. Please type location manually.');
                        break;

                    case window.google.maps.places.PlacesServiceStatus.INVALID_REQUEST:
                        console.error('Invalid request to Google Places API');
                        setSuggestions([]);
                        setShowSuggestions(false);
                        setErrorMessage('Invalid search request.');
                        break;

                    default:
                        console.error('Google Places API error:', status);
                        setSuggestions([]);
                        setShowSuggestions(false);
                        setErrorMessage('Location search temporarily unavailable.');
                        break;
                }
            });
        } catch (error) {
            console.error('Error fetching place predictions:', error);
            setIsLoading(false);
            setSuggestions([]);
            setShowSuggestions(false);
            setErrorMessage('Location search error. Please try again.');
        }
    };

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, []);

    const handleInputChange = (e) => {
        const inputValue = e.target.value;
        onChange(inputValue);
        
        // Clear error when user starts typing
        if (errorMessage) {
            setErrorMessage('');
        }
        
        // Use debounced search to prevent too many API calls
        debouncedSearch(inputValue);
    };

    const handleSuggestionClick = (suggestion) => {
        onChange(suggestion.description);
        setShowSuggestions(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
    };

    const handleKeyDown = (e) => {
        if (!showSuggestions || suggestions.length === 0) {
            if (e.key === 'Enter') {
                e.preventDefault();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
                    handleSuggestionClick(suggestions[selectedIndex]);
                } else {
                    setShowSuggestions(false);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setShowSuggestions(false);
                setSelectedIndex(-1);
                inputRef.current?.blur();
                break;
            default:
                break;
        }
    };

    const clearInput = () => {
        onChange('');
        setSuggestions([]);
        setShowSuggestions(false);
        setSelectedIndex(-1);
        inputRef.current?.focus();
    };

    // Fallback to SimpleLocationInput if Google Maps is not available
    if (loadError || !isLoaded) {
        console.log('Using SimpleLocationInput fallback for custom autocomplete');
        return <SimpleLocationInput value={value} onChange={onChange} placeholder={placeholder} className={className} />;
    }

    return (
        <div className="relative">
            <FaMapMarkerAlt className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 z-10" />

            {isLoading && <FaSpinner className="absolute right-10 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 animate-spin z-10" />}

            {value && (
                <button
                    onClick={clearInput}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 w-4 h-4 z-10 transition-colors duration-200"
                    type="button"
                    title="Clear location">
                    <FaTimes className="w-3 h-3" />
                </button>
            )}

            <input
                ref={inputRef}
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                className={`w-full pl-10 pr-12 py-3 border border-slate-300 rounded-lg bg-white text-sm placeholder-slate-400
                         focus:outline-none focus:border-blue-500 transition-all duration-200 ${className}`}
                autoComplete="off"
                title="Start typing for location suggestions"
            />

            {showSuggestions && suggestions.length > 0 && (
                <div
                    ref={suggestionsRef}
                    className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-xl z-[9999] mt-2"
                    style={{
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    }}>
                    <div className="py-2 max-h-80 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        <style
                            dangerouslySetInnerHTML={{
                                __html: `
                                .overflow-y-auto::-webkit-scrollbar {
                                    display: none;
                                }
                            `,
                            }}
                        />
                        {suggestions.map((suggestion, index) => (
                            <button
                                key={suggestion.placeId}
                                onClick={() => handleSuggestionClick(suggestion)}
                                className={`w-full text-left px-4 py-3 mx-2 rounded-lg transition-all duration-200 ${
                                    index === selectedIndex ? 'bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 shadow-sm' : 'hover:bg-slate-50 hover:shadow-sm'
                                }`}
                                type="button">
                                <div className="flex items-start space-x-3">
                                    <div
                                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                            index === selectedIndex ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'
                                        }`}>
                                        <FaMapMarkerAlt className="w-3 h-3" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-semibold text-sm truncate ${index === selectedIndex ? 'text-blue-900' : 'text-slate-900'}`}>{suggestion.mainText}</div>
                                        <div className={`text-xs truncate mt-0.5 ${index === selectedIndex ? 'text-blue-600' : 'text-slate-500'}`}>{suggestion.secondaryText}</div>
                                    </div>
                                    {index === selectedIndex && <div className="text-blue-500 text-xs font-medium bg-blue-100 px-2 py-1 rounded-full">Press Enter</div>}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomLocationAutocomplete;
