import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generateUserAiContent } from '../../../../services/aiService';

// Client-side cache to minimize API cost and latency. AI suggestions are
// intentionally limited to non-identity taxonomies; authoritative employers,
// schools, locations, issuers, and credentials remain direct user entry.
const suggestionCache = {};
const AI_AUTOCOMPLETE_TYPES = new Set([
    'jobTitle', 'occupation', 'degree', 'skill', 'language',
    'hobby', 'hobbies', 'interest', 'interests',
]);

const AutocompleteInputField = ({
    label,
    name,
    type = 'text',
    placeholder,
    required = false,
    value = '',
    onChange,
    onSelect,
    onKeyDown,
    disabled = false,
    suggestionType = 'jobTitle', // 'jobTitle', 'company', 'city', 'school', 'degree', 'skill', 'certification', 'certificationIssuer', 'language', 'hobby'
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
    const requestControllerRef = useRef(null);
    const isUserTypingRef = useRef(false);

    // Fetch AI suggestions
    const fetchSuggestions = async (queryVal) => {
        const query = queryVal.trim();
        if (!AI_AUTOCOMPLETE_TYPES.has(suggestionType)) {
            setSuggestions([]);
            setShowDropdown(false);
            setLoading(false);
            return;
        }
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

        requestControllerRef.current?.abort();
        const requestController = new AbortController();
        requestControllerRef.current = requestController;
        setLoading(true);
        try {
            const res = await generateUserAiContent('autocomplete', {
                type: suggestionType,
                query: query
            }, { signal: requestController.signal });
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
            if (err?.name !== 'AbortError') console.warn('Autocomplete fetch failed:', err);
        } finally {
            if (requestControllerRef.current === requestController) {
                requestControllerRef.current = null;
                setLoading(false);
            }
        }
    };

    const handleInputChange = (e) => {
        requestControllerRef.current?.abort();
        requestControllerRef.current = null;
        setLoading(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safeValue]);

    useEffect(() => () => { const controller = requestControllerRef.current; requestControllerRef.current = null; controller?.abort(); }, []);

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
        if (typeof onSelect === 'function') {
            onSelect(option);
        }
        setShowDropdown(false);
        setSuggestions([]);
        setActiveIndex(-1);
    };

    const handleKeyDown = (e) => {
        if (showDropdown && suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
                return;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
                return;
            } else if (e.key === 'Enter') {
                if (activeIndex >= 0 && activeIndex < suggestions.length) {
                    e.preventDefault();
                    handleSelectOption(suggestions[activeIndex]);
                    return;
                }
            } else if (e.key === 'Escape') {
                setShowDropdown(false);
                isUserTypingRef.current = false;
                setActiveIndex(-1);
                return;
            }
        }
        if (typeof onKeyDown === 'function') {
            onKeyDown(e);
        }
    };

    return (
        <div className="relative w-full" ref={containerRef}>
            {!hideLabel && label && (
                <label htmlFor={name} className={labelClassName || "block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"}>
                    {label}
                    {required && <span className="text-red-500 ml-1 font-bold">*</span>}
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
                    className={inputClassName || `w-full px-3.5 py-2.5 pr-10 border rounded-xl transition-all duration-150 text-sm text-slate-900 placeholder-slate-400 bg-white
                        ${
                            disabled
                                ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                                : error
                                ? 'border-red-300 bg-red-50/50 focus:border-red-500 focus:ring-3 focus:ring-red-500/15'
                                : 'border-slate-200 hover:border-slate-300 focus:border-indigo-600 focus:ring-3 focus:ring-indigo-500/15'
                        } 
                        focus:outline-none shadow-2xs`}
                    placeholder={placeholder}
                    autoComplete="off"
                />

                {/* Right side loader */}
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    {loading && (
                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    )}
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
