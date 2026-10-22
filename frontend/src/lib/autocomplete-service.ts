/**
 * Autocomplete Service — Universal Directory & AI Autocomplete Provider
 *
 * Provides instant 0ms local matching from universal directories & local recents,
 * augmented by server-grounded AI autocomplete on debounce.
 */

// @ts-ignore - Javascript utility in root src
import { matchUniversalDirectory } from '../../../src/utils/autocompleteDirectories.js';
import { fetchAiAutocomplete } from './ai-content';

const suggestionCache: Record<string, string[]> = {};
const RECENT_STORAGE_KEY_PREFIX = 'rp_recent_';

export function getRecentSelections(type: string): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(`${RECENT_STORAGE_KEY_PREFIX}${type}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string' && s.trim()) : [];
  } catch {
    return [];
  }
}

export function saveRecentSelection(type: string, value: string): void {
  if (typeof window === 'undefined' || !window.localStorage || !value || typeof value !== 'string') return;
  try {
    const key = `${RECENT_STORAGE_KEY_PREFIX}${type}`;
    const existing = getRecentSelections(type);
    const val = value.trim();
    if (!val) return;
    const updated = [val, ...existing.filter((item) => item.toLowerCase() !== val.toLowerCase())].slice(0, 5);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {
    // Graceful fallback for storage limits
  }
}

export interface AutocompleteSuggestion {
  text: string;
  source: 'recent' | 'directory' | 'ai';
}

/**
 * Synchronous instant (0ms) suggestions from Universal Directory and local recents.
 */
export function getLocalSuggestions(type: string, query: string, limit = 8): AutocompleteSuggestion[] {
  const cleanQ = String(query || '').trim();
  const recents = getRecentSelections(type);

  if (!cleanQ) {
    return recents.slice(0, limit).map((text) => ({ text, source: 'recent' }));
  }

  let dirMatches: string[] = [];
  try {
    dirMatches = matchUniversalDirectory(type, cleanQ, limit);
  } catch {
    dirMatches = [];
  }

  const results: AutocompleteSuggestion[] = [];
  const seen = new Set<string>();

  // Add matching recents first
  for (const r of recents) {
    if (r.toLowerCase().includes(cleanQ.toLowerCase())) {
      results.push({ text: r, source: 'recent' });
      seen.add(r.toLowerCase());
    }
  }

  // Add directory matches
  for (const match of dirMatches) {
    if (!seen.has(match.toLowerCase())) {
      results.push({ text: match, source: 'directory' });
      seen.add(match.toLowerCase());
    }
  }

  return results.slice(0, limit);
}

/**
 * Async query that fetches AI autocomplete from backend with caching.
 */
export async function getAiSuggestions(
  type: string,
  query: string,
  context?: Record<string, unknown>
): Promise<AutocompleteSuggestion[]> {
  const cleanQ = String(query || '').trim();
  if (cleanQ.length < 2) return [];

  const cacheKey = `${type}_${cleanQ.toLowerCase()}`;
  if (suggestionCache[cacheKey]) {
    return suggestionCache[cacheKey].map((text) => ({ text, source: 'ai' }));
  }

  try {
    const aiList = await fetchAiAutocomplete(type, cleanQ, context);
    if (aiList.length > 0) {
      suggestionCache[cacheKey] = aiList;
      return aiList.map((text) => ({ text, source: 'ai' }));
    }
  } catch {
    // AI failure handled silently
  }

  return [];
}
