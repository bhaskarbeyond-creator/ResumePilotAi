import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generateUserAiContent } from '../../../../services/aiService';

// Client-side cache to minimize API cost and latency.
const suggestionCache = {};

// All supported autocomplete / recommendation fields across 11 builder steps
const AI_AUTOCOMPLETE_TYPES = new Set([
    'jobTitle', 'occupation', 'degree', 'skill', 'language',
    'hobby', 'hobbies', 'interest', 'interests',
    'school', 'company', 'city', 'certification', 'certificationIssuer',
    'projectTitle', 'achievementTitle',
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
    suggestionType = 'jobTitle',
    context = null, // Candidate context { domain, domainData, starterBlueprints, targetTitle, currentTitle, profession, seniority }
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

    // Extract normalized candidate domain suggestions locally from context
    const getLocalDomainSuggestions = (field, query = '') => {
        if (!context) return [];
        let candidates = [];
        const normField = String(field || '').toLowerCase();

        if (normField === 'jobtitle' || normField === 'occupation') {
            candidates = [
                context.targetTitle,
                context.currentTitle,
                context.profession,
                ...(context.starterBlueprints?.workHistory?.map(w => w.jobTitle) || [])
            ];
        } else if (normField === 'skill') {
            candidates = [
                ...(context.domainData?.skills || []),
                ...(context.skillCategories?.flatMap(c => c.skills) || [])
            ];
        } else if (normField === 'degree') {
            candidates = [
                ...(context.domainData?.degrees || []),
                ...(context.starterBlueprints?.education?.map(e => e.degree) || [])
            ];
        } else if (normField === 'school') {
            candidates = [
                ...(context.domainData?.schools || []),
                ...(context.starterBlueprints?.education?.map(e => e.school) || [])
            ];
        } else if (normField === 'certification' || normField === 'title') {
            candidates = [
                ...(context.domainData?.issuers?.map(c => typeof c === 'string' ? c : c.title) || []),
                ...(context.starterBlueprints?.certifications?.map(c => c.title) || [])
            ];
        } else if (normField === 'certificationissuer' || normField === 'issuer') {
            candidates = [
                ...(context.starterBlueprints?.certifications?.map(c => c.issuer) || [])
            ];
        } else if (normField === 'projecttitle') {
            candidates = [
                ...(context.starterBlueprints?.projects?.map(p => p.title) || [])
            ];
        } else if (normField === 'achievementtitle') {
            candidates = [
                ...(context.starterBlueprints?.achievements?.map(a => a.title) || [])
            ];
        } else if (normField === 'company' || normField === 'employer') {
            candidates = [
                ...(context.starterBlueprints?.workHistory?.map(w => w.employer) || [])
            ];
        } else if (normField === 'city' || normField === 'location') {
            const reg = context?.geography?.region || '';
            if (reg === 'IN') {
                candidates = ['Bengaluru', 'Mumbai', 'Delhi NCR', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata', 'Ahmedabad', 'Noida', 'Gurugram'];
            } else if (reg === 'UK') {
                candidates = ['London', 'Manchester', 'Birmingham', 'Edinburgh', 'Bristol', 'Glasgow', 'Leeds'];
            } else if (reg === 'CA') {
                candidates = ['Toronto', 'Vancouver', 'Montreal', 'Ottawa', 'Calgary', 'Edmonton'];
            } else if (reg === 'AU') {
                candidates = ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra'];
            } else if (reg === 'EU') {
                candidates = ['Berlin', 'Paris', 'Amsterdam', 'Munich', 'Dublin', 'Madrid', 'Stockholm'];
            } else if (reg === 'US') {
                candidates = ['New York', 'San Francisco', 'Chicago', 'Austin', 'Seattle', 'Boston', 'Los Angeles'];
            } else {
                candidates = ['London', 'New York', 'Tokyo', 'Singapore', 'Sydney', 'Toronto', 'Berlin', 'Dubai'];
            }
        } else if (normField.includes('hobby') || normField.includes('interest')) {
            candidates = ['Marathon Running', 'Chess Strategy', 'Photography', 'Volunteering', 'Public Speaking', 'Reading'];
        }

        // Deduplicate against existing candidate items to prevent redundant suggestions
        const existingItems = new Set();
        if (normField === 'skill') {
            const rawSkills = context?.rawCandidateSkills || context?.skills || [];
            if (Array.isArray(rawSkills)) {
                rawSkills.forEach(s => {
                    const name = typeof s === 'string' ? s : s?.name || s?.skillName;
                    if (name) existingItems.add(String(name).trim().toLowerCase());
                });
            }
        } else if (normField === 'certification' || normField === 'title') {
            const rawCerts = context?.rawCandidateCerts || context?.certifications || [];
            if (Array.isArray(rawCerts)) {
                rawCerts.forEach(c => {
                    if (c?.title) existingItems.add(String(c.title).trim().toLowerCase());
                });
            }
        }

        const cleanQ = String(query || '').trim().toLowerCase();
        const unique = [...new Set(candidates.filter(Boolean))].filter(item => {
            const norm = String(item).trim().toLowerCase();
            return !existingItems.has(norm);
        });
        if (!cleanQ) return unique.slice(0, 6);
        return unique.filter(item => String(item).toLowerCase().includes(cleanQ)).slice(0, 6);
    };

    // Fetch AI suggestions
    const fetchSuggestions = async (queryVal = '', forceOpen = false) => {
        const query = String(queryVal || '').trim();
        if (!AI_AUTOCOMPLETE_TYPES.has(suggestionType)) {
            setSuggestions([]);
            setShowDropdown(false);
            setLoading(false);
            return;
        }

        // Compute instant local suggestions to guarantee instant responsiveness
        const localList = getLocalDomainSuggestions(suggestionType, query);
        if (localList.length > 0) {
            setSuggestions(localList);
            if (forceOpen || isUserTypingRef.current) {
                setShowDropdown(true);
            }
        }

        const resolvedDomain = context?.domain || '';
        const resolvedProfession = context?.profession || context?.targetTitle || context?.currentTitle || context?.occupation || '';
        const resolvedSeniority = context?.seniority || '';
        const candidateIdentityKey = context?.rawCandidateContext?.name || context?.name || context?.email || '';
        const cacheKey = `${candidateIdentityKey}_${suggestionType}_${resolvedDomain}_${resolvedProfession}_${query.toLowerCase()}`;

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
            const contextPayload = {
                domain: resolvedDomain,
                profession: resolvedProfession,
                seniority: resolvedSeniority,
                currentField: suggestionType,
                targetJd: context?.rawCandidateContext?.targetJd || ''
            };

            const res = await generateUserAiContent('autocomplete', {
                type: suggestionType,
                query: query,
                context: contextPayload
            }, { signal: requestController.signal });

            if (res && Array.isArray(res.suggestions) && res.suggestions.length > 0) {
                const combined = [...new Set([...res.suggestions, ...localList].map(s => String(s).trim()))].filter(Boolean);
                suggestionCache[cacheKey] = combined;
                setSuggestions(combined);
                if (forceOpen || isUserTypingRef.current) {
                    setShowDropdown(combined.length > 0);
                }
            } else if (localList.length > 0) {
                setSuggestions(localList);
            }
        } catch (err) {
            if (err?.name !== 'AbortError') {
                // If API fails or is offline, keep local domain suggestions intact
                if (localList.length > 0) {
                    setSuggestions(localList);
                }
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

    // Trigger debounced fetch when user actively types
    useEffect(() => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        if (!isUserTypingRef.current || disabled) {
            return;
        }

        if (!safeValue || String(safeValue).trim().length < 1) {
            const localList = getLocalDomainSuggestions(suggestionType, '');
            if (localList.length > 0) {
                setSuggestions(localList);
                setShowDropdown(true);
            } else {
                setShowDropdown(false);
            }
            return;
        }

        debounceTimer.current = setTimeout(() => {
            if (isUserTypingRef.current) {
                fetchSuggestions(safeValue);
            }
        }, 350);

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
        setActiveIndex(-1);
    };

    const handleToggleDropdown = () => {
        if (showDropdown) {
            setShowDropdown(false);
            isUserTypingRef.current = false;
        } else {
            isUserTypingRef.current = true;
            fetchSuggestions(safeValue, true);
            setShowDropdown(true);
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
                    onFocus={() => {
                        if (!safeValue || safeValue.length < 2) {
                            const localList = getLocalDomainSuggestions(suggestionType, safeValue);
                            if (localList.length > 0) {
                                setSuggestions(localList);
                                setShowDropdown(true);
                            }
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

                {/* Right side controls: spinner + AI trigger button */}
                <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 gap-1">
                    {loading && (
                        <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    )}
                    <button
                        type="button"
                        aria-label={showDropdown ? "Close suggestions" : "Show AI suggestions"}
                        title="Click to view contextual suggestions"
                        onClick={handleToggleDropdown}
                        className={`p-1 rounded-md transition-colors ${
                            showDropdown 
                                ? 'text-indigo-600 bg-indigo-50' 
                                : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'
                        }`}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM4.25 10a.75.75 0 01-.75-.75h-1.5a.75.75 0 010 1.5h1.5a.75.75 0 01.75-.75zM17.25 10a.75.75 0 01-.75-.75h-1.5a.75.75 0 010 1.5h1.5a.75.75 0 01.75-.75zM5.929 5.929a.75.75 0 01-1.06 0l-1.061-1.06a.75.75 0 011.06-1.061l1.061 1.06a.75.75 0 010 1.061zM16.192 16.192a.75.75 0 01-1.06 0l-1.061-1.06a.75.75 0 011.06-1.061l1.061 1.06a.75.75 0 010 1.061zM5.929 14.071a.75.75 0 010 1.06l-1.06 1.062a.75.75 0 01-1.062-1.061l1.061-1.061a.75.75 0 011.061 0zM16.192 3.808a.75.75 0 010 1.06l-1.06 1.061a.75.75 0 01-1.062-1.06l1.061-1.061a.75.75 0 011.061 0zM10 6a4 4 0 100 8 4 4 0 000-8z" />
                        </svg>
                    </button>
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
                <div 
                    role="listbox"
                    id={`${name}-suggestions-list`}
                    aria-label={label || name}
                    className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1 animate-in fade-in slide-in-from-top-1 duration-150"
                >
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50 flex items-center justify-between">
                        <span>{typeof t === 'function' ? t('Autocomplete.suggestionsTitle', 'Suggested for your role') : 'Suggested for your role'}</span>
                        {context?.domainLabel && <span className="text-[9px] font-medium text-indigo-500 capitalize">{context.domainLabel}</span>}
                    </div>
                    <ul className="divide-y divide-slate-50/50">
                        {suggestions.map((option, idx) => (
                            <li
                                key={idx}
                                role="option"
                                id={`${name}-option-${idx}`}
                                aria-selected={idx === activeIndex}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSelectOption(option);
                                }}
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
