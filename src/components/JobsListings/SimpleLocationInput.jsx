import React, { useState, useRef, useEffect } from 'react';
import { FaMapMarkerAlt, FaTimes } from 'react-icons/fa';

// Common location suggestions for fallback
const POPULAR_LOCATIONS = [
    'New York, NY, United States',
    'Los Angeles, CA, United States',
    'Chicago, IL, United States',
    'Houston, TX, United States',
    'Phoenix, AZ, United States',
    'Philadelphia, PA, United States',
    'San Antonio, TX, United States',
    'San Diego, CA, United States',
    'Dallas, TX, United States',
    'San Jose, CA, United States',
    'Austin, TX, United States',
    'Jacksonville, FL, United States',
    'San Francisco, CA, United States',
    'Columbus, OH, United States',
    'Charlotte, NC, United States',
    'Fort Worth, TX, United States',
    'Indianapolis, IN, United States',
    'Seattle, WA, United States',
    'Denver, CO, United States',
    'Boston, MA, United States',
    'London, England, United Kingdom',
    'Paris, France',
    'Berlin, Germany',
    'Tokyo, Japan',
    'Sydney, Australia',
    'Toronto, Canada',
    'Vancouver, Canada',
    'Amsterdam, Netherlands',
    'Barcelona, Spain',
    'Rome, Italy',
];

const SimpleLocationInput = ({ value, onChange, placeholder = 'Location', className = '' }) => {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [filteredSuggestions, setFilteredSuggestions] = useState([]);
    const inputRef = useRef(null);
    const suggestionsRef = useRef(null);

    // Debug logging
    useEffect(() => {
        console.log('SimpleLocationInput is being used as fallback');
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (inputRef.current && !inputRef.current.contains(event.target) && suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e) => {
        const inputValue = e.target.value;
        console.log('SimpleLocationInput - Input changed:', inputValue);
        onChange(inputValue);

        if (inputValue.length > 1) {
            const filtered = POPULAR_LOCATIONS.filter((location) => location.toLowerCase().includes(inputValue.toLowerCase())).slice(0, 8); // Limit to 8 suggestions

            console.log('SimpleLocationInput - Filtered suggestions:', filtered);
            setFilteredSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
        } else {
            setShowSuggestions(false);
        }
    };

    const handleSuggestionClick = (suggestion) => {
        onChange(suggestion);
        setShowSuggestions(false);
        inputRef.current?.blur();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            setShowSuggestions(false);
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
            inputRef.current?.blur();
        }
    };

    const clearInput = () => {
        onChange('');
        setShowSuggestions(false);
        inputRef.current?.focus();
    };

    return (
        <div className="relative">
            <FaMapMarkerAlt className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 z-10" />
            {value && (
                <button onClick={clearInput} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 w-4 h-4 z-10" type="button">
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
                onFocus={() => {
                    if (value.length > 1) {
                        const filtered = POPULAR_LOCATIONS.filter((location) => location.toLowerCase().includes(value.toLowerCase())).slice(0, 8);
                        setFilteredSuggestions(filtered);
                        setShowSuggestions(filtered.length > 0);
                    }
                }}
                className={`w-full pl-10 pr-10 py-3 border border-slate-300 rounded-lg bg-white text-sm placeholder-slate-400
                         focus:outline-none focus:border-blue-500 transition-all duration-200 ${className}`}
                autoComplete="off"
                title="Start typing for location suggestions"
            />

            {showSuggestions && filteredSuggestions.length > 0 && (
                <div ref={suggestionsRef} className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg z-50 mt-1 max-h-64 overflow-y-auto">
                    {filteredSuggestions.map((suggestion, index) => (
                        <button
                            key={index}
                            onClick={() => handleSuggestionClick(suggestion)}
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 text-sm text-slate-700 hover:text-slate-900 transition-colors duration-150"
                            type="button">
                            <FaMapMarkerAlt className="inline w-3 h-3 mr-2 text-slate-400" />
                            {suggestion}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SimpleLocationInput;
