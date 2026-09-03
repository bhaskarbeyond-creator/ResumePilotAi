import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generateUserAiContent } from '../../../../services/aiService';

/**
 * AutocompleteInputField — profile-grounded input suggestions.
 *
 * Decoupled from the removed profession taxonomy: local suggestions come ONLY
 * from the candidate's own data (their titles, their skills), and remote
 * suggestions come from the evidence-grounded `autocomplete` AI operation.
 * Identity fields (employers, schools, cities, credentials) intentionally get
 * no suggestions — they require the candidate's own entries.
 */

const suggestionCache = {};

// The subset of fields the backend autocomplete contract supports.
const AI_AUTOCOMPLETE_TYPES = new Set([
    'jobTitle', 'occupation', 'degree', 'skill', 'language',
    'hobby', 'hobbies', 'interest', 'interests',
]);

/**
 * Local candidates derived from the candidate's OWN data only.
 * `context` = getCandidateContext() output (facts, target, …).
 */
function getLocalProfileSuggestions(suggestionType, query = '', context = null) {
    if (!context) return [];
    const normField = String(suggestionType || '').toLowerCase();
    let candidates = [];

    if (normField === 'jobtitle' || normField === 'occupation') {
        candidates = [
            context.target?.role,
            context.facts?.headline,
            ...((context.facts?.roles || []).map(r => r.title)),
        ];
    } else if (normField === 'skill') {
        candidates = [...((context.facts?.skills || []))];
    } else if (normField === 'language') {
        candidates = [...((context.facts?.languages || []).map(l => l.name))];
    } else {
        // identity/credential fields: no local candidates by design
        candidates = [];
    }

    const cleanQ = String(query || '').trim().toLowerCase();
    const unique = [...new Set(candidates.map(v => String(v || '').trim()).filter(Boolean))];
    if (!cleanQ) return unique.slice(0, 6);
    return unique.filter(item => item.toLowerCase().includes(cleanQ)).slice(0, 6);
}

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
    suggestionType = 'jobTitle',
    context = null,
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

    // Fetch AI suggestions (evidence-grounded; identity fields never call it).
    const fetchSuggestions = async (queryVal = '', forceOpen = false) => {
        const query = String(queryVal || '').trim();
        const localList = getLocalProfileSuggestions(suggestionType, query, context);
        if (!AI_AUTOCOMPLETE_TYPES.has(suggestionType)) {
            setSuggestions(localList);
            setShowDropdown(forceOpen || isUserTypingRef.current ? localList.length > 0 : showDropdown);
            return;
        }

        if (localList.length > 0) {
            setSuggestions(localList);
            if (forceOpen || isUserTypingRef.current) setShowDropdown(true);
        }

        const cacheKey = `${suggestionType}_${context?.profileHash || ''}_${query.toLowerCase()}`;
        if (suggestionCache[cacheKey]) {
            setSuggestions(suggestionCache[cacheKey]);
            if (forceOpen || isUserTypingRef.current) setShowDropdown(true);
            return;
        }

        requestControllerRef.current?.abort();
        const requestController = new AbortController();
        requestControllerRef.current = requestController;
        setLoading(true);

        try {
            const res = await generateUserAiContent('autocomplete', {
                type: suggestionType,
                query,
                context: {
                    facts: context?.facts || {},
                    target: context?.target || {},
                    vocabulary: context?.vocabulary || [],
                    region: context?.region || '',
                },
            }, { signal: requestController.signal });

            if (res && Array.isArray(res.suggestions) && res.suggestions.length > 0) {
                const combined = [...new Set([...res.suggestions, ...localList].map(s => String(s).trim()))].filter(Boolean);
                suggestionCache[cacheKey] = combined;
                setSuggestions(combined);
                if (forceOpen || isUserTypingRef.current) setShowDropdown(combined.length > 0);
            } else if (localList.length > 0) {
                setSuggestions(localList);
            }
        } catch (err) {
            if (err?.name !== 'AbortError' && localList.length > 0) {
                setSuggestions(localList);
            }
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

    useEffect(() => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        if (!isUserTypingRef.current || disabled) return undefined;

        if (!safeValue || String(safeValue).trim().length < 1) {
            const localList = getLocalProfileSuggestions(suggestionType, '', context);
            setSuggestions(localList);
            setShowDropdown(localList.length > 0);
            return undefined;
        }
        debounceTimer.current = setTimeout(() => {
            if (isUserTypingRef.current) fetchSuggestions(safeValue);
        }, 350);
        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safeValue]);

    useEffect(() => () => { const controller = requestControllerRef.current; requestControllerRef.current = null; controller?.abort(); }, []);

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
        if (typeof onSelect === 'function') onSelect(option);
        setShowDropdown(false);
        setActiveIndex(-1);
    };

    const handleToggleDropdown = () => {
        if (showDropdown) {
            setShowDropdown(false);
            isUserTypingRef.current = false;
        } else {
            isUserTypingRef.current = true;
            fetchSuggestions(safeValue, true);
        }
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
        if (typeof onKeyDown === 'function') onKeyDown(e);
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
                    onFocus={() => {
                        const localList = getLocalProfileSuggestions(suggestionType, safeValue, context);
                        if (localList.length > 0) {
                            setSuggestions(localList);
                            setShowDropdown(true);
                        }
                    }}
                    disabled={disabled}
                    spellCheck="true"
                    className={inputClassName || `w-full px-3.5 py-2.5 pr-14 border rounded-xl transition-all duration-150 text-sm text-slate-900 placeholder-slate-400 bg-white
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

                {AI_AUTOCOMPLETE_TYPES.has(suggestionType) && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 gap-1">
                        {loading && (
                            <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        )}
                        <button
                            type="button"
                            aria-label={showDropdown ? "Close suggestions" : "Show suggestions based on your profile"}
                            title="Suggestions based on your profile"
                            onClick={handleToggleDropdown}
                            className={`p-1 rounded-md transition-colors ${
                                showDropdown
                                    ? 'text-indigo-600 bg-indigo-50'
                                    : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'
                            }`}
                        >
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 010 15zM4.25 10a.75.75 0 01-.75-.75h-1.5a.75.75 0 010 1.5h1.5a.75.75 0 01.75-.75zM17.25 10a.75.75 0 01-.75-.75h-1.5a.75.75 0 010 1.5h1.5a.75.75 0 01.75-.75zM5.929 5.929a.75.75 0 01-1.06 0l-1.061-1.06a.75.75 0 011.06-1.061l1.061 1.06a.75.75 0 010 1.061zM16.192 16.192a.75.75 0 01-1.06 0l-1.061-1.06a.75.75 0 011.06-1.061l1.061 1.06a.75.75 0 010 1.061zM5.929 14.071a.75.75 0 010 1.06l-1.06 1.062a.75.75 0 01-1.062-1.061l1.061-1.061a.75.75 0 011.061 0zM16.192 3.808a.75.75 0 010 1.06l-1.06 1.061a.75.75 0 01-1.062-1.06l1.061-1.061a.75.75 0 011.061 0zM10 6a4 4 0 100 8 4 4 0 000-8z" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            {error ? (
                <p className="mt-1 text-xs text-red-500 font-medium">{error}</p>
            ) : hint ? (
                <p className="mt-1 text-xs text-slate-400">{hint}</p>
            ) : null}

            {showDropdown && suggestions.length > 0 && (
                <div
                    role="listbox"
                    id={`${name}-suggestions-list`}
                    aria-label={label || name}
                    className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1"
                >
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50">
                        <span>{t('Autocomplete.suggestionsTitle', 'From your profile')}</span>
                    </div>
                    <ul className="divide-y divide-slate-50/50">
                        {suggestions.map((option, idx) => (
                            <li
                                key={idx}
                                role="option"
                                id={`${name}-option-${idx}`}
                                aria-selected={idx === activeIndex}
                                onMouseDown={(e) => { e.preventDefault(); handleSelectOption(option); }}
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
