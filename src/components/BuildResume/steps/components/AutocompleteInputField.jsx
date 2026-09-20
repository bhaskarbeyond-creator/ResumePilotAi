import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generateUserAiContent } from '../../../../services/aiService';
import { matchUniversalDirectory, isTypoMatch, autocorrectQuery, isDomainCompatible } from '../../../../utils/autocompleteDirectories.js';

/**
 * AutocompleteInputField — profile-grounded and universal directory suggestions.
 *
 * Provides instant 0ms keystroke matching for:
 * - Companies / Employers / Organizations
 * - Schools / Colleges / Universities / Institutions
 * - Degrees / Qualifications
 * - Job Titles / Occupations
 * - Skills
 * - Languages
 * - Certifications & Issuing Organizations
 *
 * Backed by background AI enrichment on debounce.
 */

const suggestionCache = {};

// All fields supported for typing suggestions and AI enrichment
const AI_AUTOCOMPLETE_TYPES = new Set([
    'jobTitle', 'occupation', 'degree', 'qualification', 'skill', 'skills',
    'language', 'hobby', 'hobbies', 'interest', 'interests',
    'company', 'employer', 'organization',
    'school', 'university', 'institution', 'college',
    'certification', 'credential', 'issuer', 'certificationIssuer',
    'city', 'location',
]);

/**
 * Extract candidate verified profile facts for this field type.
 */
function getProfileCandidates(suggestionType, context) {
    const normField = String(suggestionType || '').toLowerCase();
    let candidates = [];

    if (context && context.facts) {
        if (normField === 'jobtitle' || normField === 'occupation' || normField === 'title' || normField === 'role') {
            candidates = [
                context.target?.role,
                context.facts?.headline,
                ...((context.facts?.roles || []).map(r => r.title)),
            ];
        } else if (normField === 'company' || normField === 'employer' || normField === 'organization') {
            candidates = [
                ...((context.facts?.roles || []).map(r => r.company)),
            ];
        } else if (normField === 'school' || normField === 'university' || normField === 'institution' || normField === 'college') {
            candidates = [
                ...((context.facts?.education || []).map(e => e.school)),
            ];
        } else if (normField === 'degree' || normField === 'qualification') {
            candidates = [
                ...((context.facts?.education || []).map(e => e.degree)),
            ];
        } else if (normField === 'skill' || normField === 'skills') {
            candidates = [...((context.facts?.skills || []))];
        } else if (normField === 'hobby' || normField === 'hobbies' || normField === 'interest' || normField === 'interests') {
            candidates = [
                ...((context.facts?.hobbies || []).map(h => typeof h === 'string' ? h : h.name || h.hobby || '')),
            ];
        } else if (normField === 'city' || normField === 'location') {
            candidates = [
                context.facts?.city,
                context.facts?.location,
            ];
        } else if (normField === 'language') {
            candidates = [...((context.facts?.languages || []).map(l => l.name))];
        } else if (normField === 'certification' || normField === 'credential') {
            candidates = [
                ...((context.facts?.certifications || []).map(c => c.title || c.name)),
            ];
        } else if (normField === 'issuer' || normField === 'certificationissuer') {
            candidates = [
                ...((context.facts?.certifications || []).map(c => c.issuer)),
            ];
        }
    }

    return [...new Set(candidates.map(v => String(v || '').trim()).filter(Boolean))];
}

const RECENT_STORAGE_KEY_PREFIX = 'rp_recent_';

export function getRecentSelections(type) {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
        const raw = localStorage.getItem(`${RECENT_STORAGE_KEY_PREFIX}${type}`);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(s => typeof s === 'string' && s.trim()) : [];
    } catch {
        return [];
    }
}

export function saveRecentSelection(type, value) {
    if (typeof window === 'undefined' || !window.localStorage || !value || typeof value !== 'string') return;
    try {
        const key = `${RECENT_STORAGE_KEY_PREFIX}${type}`;
        const existing = getRecentSelections(type);
        const val = value.trim();
        if (!val) return;
        const updated = [val, ...existing.filter(item => item.toLowerCase() !== val.toLowerCase())].slice(0, 5);
        localStorage.setItem(key, JSON.stringify(updated));
    } catch {
        // Safe fail-through for incognito / quota limits
    }
}

/**
 * Local suggestions derived from the candidate's verified profile data AND
 * the universal global directory (companies, universities, degrees, skills).
 * Strictly filtered by the user's typed query to prevent irrelevant suggestions.
 */
function getLocalProfileSuggestions(suggestionType, query = '', context = null) {
    const cleanQ = String(query || '').trim().toLowerCase();
    const profileCandidates = getProfileCandidates(suggestionType, context);
    const recents = getRecentSelections(suggestionType);

    if (!cleanQ) {
        // When query is empty, show recent selections first, then actual verified profile entries
        return [...new Set([...recents, ...profileCandidates])].slice(0, 8);
    }

    // Blend recent selections + profile data + universal directory for instant 0ms matching
    const directoryMatches = matchUniversalDirectory(suggestionType, query, 12);
    const combinedCandidates = [...recents, ...profileCandidates, ...directoryMatches];

    // Filter by query with typo tolerance & spell check
    const correctedQ = autocorrectQuery(cleanQ);
    const matched = combinedCandidates.filter(item => {
        return isDomainCompatible(suggestionType, item) && (isTypoMatch(item, cleanQ) || (correctedQ && isTypoMatch(item, correctedQ)));
    });

    return [...new Set(matched.map(v => String(v || '').trim()).filter(Boolean))].slice(0, 8);
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

    // Fetch AI suggestions (strictly query-constrained; pure-AI priority).
    const fetchSuggestions = async (queryVal = '', forceOpen = false) => {
        const query = String(queryVal || '').trim();
        const cleanQ = query.toLowerCase();
        const cleanQStripped = cleanQ.replace(/[^a-z0-9]/g, '');

        if (!AI_AUTOCOMPLETE_TYPES.has(suggestionType)) {
            const localList = getLocalProfileSuggestions(suggestionType, query, context);
            setSuggestions(localList);
            setShowDropdown(forceOpen || isUserTypingRef.current ? localList.length > 0 : showDropdown);
            return;
        }

        // Only call AI if user typed at least 2 characters
        if (cleanQ.length < 2) {
            const localList = getLocalProfileSuggestions(suggestionType, queryVal, context);
            setSuggestions(localList);
            if (forceOpen || isUserTypingRef.current) setShowDropdown(localList.length > 0);
            return;
        }

        const cacheKey = `${suggestionType}_${context?.profileHash || ''}_${cleanQ}`;
        if (suggestionCache[cacheKey]) {
            const cached = suggestionCache[cacheKey];
            setSuggestions(cached);
            if (forceOpen || isUserTypingRef.current) setShowDropdown(cached.length > 0);
            return;
        }

        // Set loading state for real-time AI query
        setLoading(true);
        if (forceOpen || isUserTypingRef.current) {
            setShowDropdown(true);
        }

        requestControllerRef.current?.abort();
        const requestController = new AbortController();
        requestControllerRef.current = requestController;

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
                const correctedQ = autocorrectQuery(cleanQ);
                const matchingAi = res.suggestions.filter(item => {
                    return isDomainCompatible(suggestionType, item) && (isTypoMatch(item, cleanQ) || (correctedQ && isTypoMatch(item, correctedQ)));
                }).map(s => String(s).trim()).filter(Boolean);

                let combined = matchingAi;
                if (matchingAi.length < 4) {
                    const localList = getLocalProfileSuggestions(suggestionType, queryVal, context);
                    combined = [...new Set([...matchingAi, ...localList])];
                }
                combined = combined.slice(0, 8);

                if (combined.length > 0) {
                    suggestionCache[cacheKey] = combined;
                    setSuggestions(combined);
                    if (forceOpen || isUserTypingRef.current) setShowDropdown(true);
                } else {
                    setSuggestions([]);
                    setShowDropdown(false);
                }
            } else {
                // Fallback to directory if AI response was empty
                const localList = getLocalProfileSuggestions(suggestionType, queryVal, context);
                setSuggestions(localList);
                setShowDropdown(localList.length > 0);
            }
        } catch (err) {
            if (err?.name !== 'AbortError') {
                const localList = getLocalProfileSuggestions(suggestionType, queryVal, context);
                setSuggestions(localList);
                setShowDropdown(localList.length > 0);
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

        const cleanVal = String(safeValue || '').trim().toLowerCase();

        if (cleanVal.length >= 2) {
            const cacheKey = `${suggestionType}_${context?.profileHash || ''}_${cleanVal}`;
            if (suggestionCache[cacheKey]) {
                setSuggestions(suggestionCache[cacheKey]);
                setShowDropdown(true);
            } else {
                // Show immediate local suggestions without waiting for debounce
                const localList = getLocalProfileSuggestions(suggestionType, safeValue, context);
                setSuggestions(localList);
                setShowDropdown(localList.length > 0);
                setLoading(true);
            }

            debounceTimer.current = setTimeout(() => {
                if (isUserTypingRef.current) fetchSuggestions(safeValue);
            }, 200);
        } else if (cleanVal.length === 1) {
            const localList = getLocalProfileSuggestions(suggestionType, safeValue, context);
            setSuggestions(localList);
            setShowDropdown(localList.length > 0);
            setLoading(false);
        } else if (cleanVal.length === 0) {
            const profileCandidates = getProfileCandidates(suggestionType, context);
            const directoryMatches = matchUniversalDirectory(suggestionType, '', 8);
            const combined = [...new Set([...profileCandidates, ...directoryMatches])].filter(item => isDomainCompatible(suggestionType, item)).slice(0, 8);
            setSuggestions(combined);
            setShowDropdown(combined.length > 0);
            setLoading(false);
        } else {
            setSuggestions([]);
            setShowDropdown(false);
            setLoading(false);
        }

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
        saveRecentSelection(suggestionType, option);
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
            const cleanVal = String(safeValue || '').trim();
            if (!cleanVal) {
                // If input is empty, load recents, profile entries or top directory suggestions for browsing
                const recents = getRecentSelections(suggestionType);
                const profileCandidates = getProfileCandidates(suggestionType, context);
                const directoryMatches = matchUniversalDirectory(suggestionType, '', 8);
                const combined = [...new Set([...recents, ...profileCandidates, ...directoryMatches])].slice(0, 8);
                if (combined.length > 0) {
                    setSuggestions(combined);
                    setShowDropdown(true);
                    return;
                }
            }
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

    // Dynamically compute accurate title based on field type and source
    const getDropdownTitle = () => {
        const cleanQ = String(safeValue || '').trim();
        const recents = getRecentSelections(suggestionType);
        if (!cleanQ && suggestions.length > 0 && suggestions.some(s => recents.includes(s))) {
            return t('Autocomplete.recentAndSuggested', 'Recent & Suggested');
        }
        const profileCandidates = getProfileCandidates(suggestionType, context);
        const isPureProfile = !cleanQ && suggestions.length > 0 && suggestions.every(s => profileCandidates.includes(s));
        if (isPureProfile) {
            return t('Autocomplete.fromYourProfile', 'From your profile');
        }
        const norm = String(suggestionType || '').toLowerCase();
        if (norm.includes('school') || norm.includes('university') || norm.includes('college') || norm.includes('institution')) {
            return t('Autocomplete.suggestedSchools', 'Suggested Institutions');
        }
        if (norm.includes('degree') || norm.includes('qualification')) {
            return t('Autocomplete.suggestedDegrees', 'Suggested Qualifications');
        }
        if (norm.includes('company') || norm.includes('employer') || norm.includes('organization')) {
            return t('Autocomplete.suggestedCompanies', 'Suggested Companies');
        }
        if (norm.includes('jobtitle') || norm.includes('occupation') || norm.includes('title') || norm.includes('role')) {
            return t('Autocomplete.suggestedJobTitles', 'Suggested Job Titles');
        }
        if (norm.includes('skill')) {
            return t('Autocomplete.suggestedSkills', 'Suggested Skills');
        }
        if (norm.includes('cert') || norm.includes('credential') || norm.includes('issuer')) {
            return t('Autocomplete.suggestedCertifications', 'Suggested Certifications');
        }
        if (norm.includes('lang')) {
            return t('Autocomplete.suggestedLanguages', 'Suggested Languages');
        }
        if (norm.includes('city') || norm.includes('location')) {
            return t('Autocomplete.suggestedLocations', 'Suggested Locations');
        }
        return t('Autocomplete.suggestions', 'Suggestions');
    };

    // Subtly highlight matching letters in suggestion
    const renderHighlightedOption = (text, query) => {
        if (!query || typeof text !== 'string') return text;
        const cleanQ = query.trim();
        if (!cleanQ) return text;
        let idx = text.toLowerCase().indexOf(cleanQ.toLowerCase());
        let matchLen = cleanQ.length;
        if (idx === -1) {
            const correctedQ = autocorrectQuery(cleanQ);
            if (correctedQ && correctedQ.toLowerCase() !== cleanQ.toLowerCase()) {
                idx = text.toLowerCase().indexOf(correctedQ.toLowerCase());
                matchLen = correctedQ.length;
            }
        }
        if (idx === -1) return text;
        const before = text.substring(0, idx);
        const match = text.substring(idx, idx + matchLen);
        const after = text.substring(idx + matchLen);
        return (
            <span className="truncate">
                {before}
                <span className="font-semibold text-indigo-600 bg-indigo-50/60 px-0.5 rounded">{match}</span>
                {after}
            </span>
        );
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
                        const cleanVal = String(safeValue || '').trim();
                        if (cleanVal.length >= 2) {
                            const cleanQ = cleanVal.toLowerCase();
                            const cacheKey = `${suggestionType}_${context?.profileHash || ''}_${cleanQ}`;
                            if (suggestionCache[cacheKey]) {
                                setSuggestions(suggestionCache[cacheKey]);
                                setShowDropdown(true);
                            } else {
                                fetchSuggestions(safeValue, true);
                            }
                        } else if (!cleanVal) {
                            // On empty focus, show recent selections and verified profile entries
                            const recents = getRecentSelections(suggestionType);
                            const profileCandidates = getProfileCandidates(suggestionType, context);
                            const combined = [...new Set([...recents, ...profileCandidates])].filter(item => isDomainCompatible(suggestionType, item)).slice(0, 8);
                            if (combined.length > 0) {
                                setSuggestions(combined);
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

                {AI_AUTOCOMPLETE_TYPES.has(suggestionType) && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 gap-1">
                        {loading && (
                            <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        )}
                        <button
                            type="button"
                            aria-label={showDropdown ? "Close suggestions" : "Show suggestions"}
                            title="Show suggestions"
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

            {showDropdown && (suggestions.length > 0 || (loading && isUserTypingRef.current)) && (
                <div
                    role="listbox"
                    id={`${name}-suggestions-list`}
                    aria-label={label || name}
                    className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1"
                >
                    {suggestions.length > 0 ? (
                        <>
                            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    <span className="text-indigo-500 font-normal">✨</span>
                                    <span>
                                        {getDropdownTitle()}
                                        {safeValue && autocorrectQuery(safeValue).toLowerCase() !== safeValue.trim().toLowerCase() ? (
                                            <span className="ml-1.5 normal-case font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-1.5 py-0.5 rounded text-[9px]">
                                                Auto-corrected: &ldquo;{autocorrectQuery(safeValue)}&rdquo;
                                            </span>
                                        ) : null}
                                    </span>
                                </span>
                                <span className="text-[9px] text-slate-400 font-normal">{suggestions.length} match{suggestions.length === 1 ? '' : 'es'}</span>
                            </div>
                            <ul className="divide-y divide-slate-50/50">
                                {suggestions.map((option, idx) => {
                                    const isRecent = getRecentSelections(suggestionType).includes(option);
                                    return (
                                        <li
                                            key={idx}
                                            role="option"
                                            id={`${name}-option-${idx}`}
                                            aria-selected={idx === activeIndex}
                                            onMouseDown={(e) => { e.preventDefault(); handleSelectOption(option); }}
                                            onClick={() => handleSelectOption(option)}
                                            className={`px-4 py-2.5 text-sm text-slate-700 cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                                                idx === activeIndex
                                                    ? 'bg-indigo-50 text-indigo-900 font-medium'
                                                    : 'hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 truncate">
                                                {isRecent ? (
                                                    <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                    </svg>
                                                )}
                                                {renderHighlightedOption(option, safeValue)}
                                            </div>
                                            {isRecent && (
                                                <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded shrink-0">
                                                    Recent
                                                </span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    ) : loading ? (
                        <div className="px-4 py-3 text-xs text-slate-500 flex items-center gap-2.5">
                            <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            <span>Generating AI suggestions...</span>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
};

export default AutocompleteInputField;
