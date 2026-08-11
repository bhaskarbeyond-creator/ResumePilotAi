import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generateUserAiContent } from '../../../../services/aiService';

// Client-side cache to minimize API cost and latency
const suggestionCache = {};

const AutocompleteInputField = ({
    label,
    name,
    type = 'text',
    placeholder,
    required = false,
    value = '',
    onChange,
    disabled = false,
    suggestionType = 'jobTitle', // 'jobTitle', 'company', 'city', 'school', 'degree', 'skill', 'certification', 'certificationIssuer'
    error = '',
    hint = '',
    inputClassName = '',
    labelClassName = '',
    hideLabel = false
}) => {
    const { t } = useTranslation('common');
    const safeValue = (value && typeof value === 'object') ? (value.name || value.title || value.value || '') : (value || '');
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    
    const containerRef = useRef(null);
    const debounceTimer = useRef(null);
    const isUserTypingRef = useRef(false);

    // Fetch AI suggestions
    const fetchSuggestions = async (queryVal) => {
        const query = queryVal.trim();
        if (query.length < 2) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }

        const cacheKey = `${suggestionType}_${query.toLowerCase()}`;
        if (suggestionCache[cacheKey]) {
            setSuggestions(suggestionCache[cacheKey]);
            if (isUserTypingRef.current) setShowDropdown(true);
            return;
        }

        setLoading(true);
        try {
            const res = await generateUserAiContent('autocomplete', {
                type: suggestionType,
                query: query
            });
            if (res && Array.isArray(res.suggestions)) {
                // Remove duplicates and empty options
                const list = [...new Set(res.suggestions.map(s => String(s).trim()))].filter(Boolean);
                suggestionCache[cacheKey] = list;
                setSuggestions(list);
                if (isUserTypingRef.current) {
                    setShowDropdown(list.length > 0);
                }
            }
        } catch (err) {
            console.warn('Autocomplete fetch failed:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        isUserTypingRef.current = true;
        onChange(e);
    };

    // Trigger debounced fetch ONLY when user actively types
    useEffect(() => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        if (!isUserTypingRef.current || !safeValue || String(safeValue).trim().length < 2 || disabled) {
            setShowDropdown(false);
            return;
        }

        debounceTimer.current = setTimeout(() => {
            if (isUserTypingRef.current) {
                fetchSuggestions(safeValue);
            }
        }, 400);

        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [safeValue]);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setShowDropdown(false);
                isUserTypingRef.current = false;
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectOption = (option) => {
        isUserTypingRef.current = false;
        onChange({ target: { name, value: option } });
        setShowDropdown(false);
        setSuggestions([]);
        setActiveIndex(-1);
    };

    const handleKeyDown = (e) => {
        if (!showDropdown || suggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0 && activeIndex < suggestions.length) {
                e.preventDefault();
                handleSelectOption(suggestions[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            setShowDropdown(false);
            isUserTypingRef.current = false;
            setActiveIndex(-1);
        }
    };

    return (
        <div className="relative w-full" ref={containerRef}>
            {!hideLabel && label && (
                <label htmlFor={name} className={labelClassName || "block text-sm font-semibold text-slate-800 mb-1.5 tracking-wide"}>
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}
            
            <div className="relative">
                <input
                    type={type}
                    id={name}
                    name={name}
                    value={safeValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    spellCheck="true"
                    className={inputClassName || `w-full px-3 py-3 pr-10 border rounded-sm transition-all duration-200 text-sm text-slate-900 placeholder-slate-400 bg-white
                        ${
                            disabled
                                ? 'border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed'
                                : value && value.trim() !== ''
                                ? 'border-green-300 bg-green-50 focus:border-green-500 focus:ring-2 focus:ring-green-100'
                                : 'border-slate-300 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                        } 
                        focus:outline-none focus:ring-opacity-50`}
                    placeholder={placeholder}
                    autoComplete="off"
                />

                {/* Right side loader / checkmark */}
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    {loading ? (
                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    ) : value && value.trim() !== '' && !disabled ? (
                        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    ) : null}
                </div>
            </div>

            {/* Hint / Error messages */}
            {error ? (
                <p className="mt-1 text-xs text-red-500 font-medium">{error}</p>
            ) : hint ? (
                <p className="mt-1 text-xs text-slate-400">{hint}</p>
            ) : null}

            {/* Suggestions Overlay Dropdown */}
            {showDropdown && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50">
                        {typeof t === 'function' ? t('Autocomplete.suggestionsTitle', 'Suggested by AI') : 'Suggested by AI'}
                    </div>
                    <ul>
                        {suggestions.map((option, idx) => (
                            <li
                                key={idx}
                                onClick={() => handleSelectOption(option)}
                                className={`px-4 py-2.5 text-sm text-slate-700 cursor-pointer flex items-center gap-2 transition-colors ${
                                    idx === activeIndex
                                        ? 'bg-indigo-50 text-indigo-900 font-medium'
                                        : 'hover:bg-slate-50'
                                }`}
                            >
                                <svg className="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                <span className="truncate">{option}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default AutocompleteInputField;
