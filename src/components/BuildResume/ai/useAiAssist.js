import { useCallback, useEffect, useRef, useState } from 'react';
import { generateUserAiContent } from '../../../services/aiService.js';
import { buildAssistPayload, describeAiError, normalizeAssistResult } from './aiContract.js';

/**
 * Shared AI request lifecycle for every builder step.
 *
 * Contract:
 *   - one explicit trigger at a time per hook instance; a new trigger aborts
 *     the previous request (AbortController), so navigation or rapid re-triggers
 *     never leave a stale response that clobbers newer state;
 *   - response cache keyed on the full payload (content hash of the evidence),
 *     so re-rendering, tone-fiddling without content change, or re-opening a
 *     card never re-bills the provider;
 *   - provider down / grounding failure degrades to the backend's
 *     questions-or-source-preserving result — the hook never invents content.
 *
 * Usage:
 *   const ai = useAiAssist();
 *   ai.run({ operation: 'generate-work-description', resumeData, targetJd, entry });
 *   // ai.status: 'idle' | 'loading' | 'error'
 *   // ai.result: normalized { kind: questions | suggestions | draft | empty }
 */

// Module-level cache shared across hook instances (same tab, same user).
const RESPONSE_CACHE = new Map();
const CACHE_LIMIT = 64;

function cacheSet(key, value) {
    if (RESPONSE_CACHE.has(key)) RESPONSE_CACHE.delete(key);
    RESPONSE_CACHE.set(key, value);
    if (RESPONSE_CACHE.size > CACHE_LIMIT) {
        const first = RESPONSE_CACHE.keys().next().value;
        if (first !== undefined) RESPONSE_CACHE.delete(first);
    }
}

export function useAiAssist() {
    const [state, setState] = useState({ status: 'idle', result: null, error: null });
    const controllerRef = useRef(null);
    const seqRef = useRef(0);

    const abort = useCallback(() => {
        seqRef.current += 1;
        try { controllerRef.current?.abort(); } catch { /* already aborted */ }
        controllerRef.current = null;
    }, []);

    useEffect(() => () => {
        seqRef.current += 1;
        try { controllerRef.current?.abort(); } catch { /* noop */ }
    }, []);

    const run = useCallback(async (request = {}) => {
        seqRef.current += 1;
        const seq = seqRef.current;
        try { controllerRef.current?.abort(); } catch { /* noop */ }
        const controller = new AbortController();
        controllerRef.current = controller;
        setState({ status: 'loading', result: null, error: null });

        let prepared;
        try {
            prepared = buildAssistPayload(request.operation, {
                resumeData: request.resumeData,
                targetJd: request.targetJd,
                entry: request.entry,
                answers: request.answers,
                tone: request.tone,
                extra: request.extra,
            });
        } catch (error) {
            if (seqRef.current === seq) setState({ status: 'error', result: null, error: { message: describeAiError(error), raw: error } });
            return null;
        }

        const cacheKey = JSON.stringify({ operation: request.operation, payload: prepared.payload });
        const cached = RESPONSE_CACHE.get(cacheKey);
        if (cached) {
            if (seqRef.current === seq) setState({ status: 'idle', result: cached, error: null });
            return cached;
        }

        try {
            const data = await generateUserAiContent(request.operation, prepared.payload, { signal: controller.signal });
            const result = normalizeAssistResult(request.operation, data);
            if (result.kind !== 'empty') cacheSet(cacheKey, result);
            if (seqRef.current === seq) setState({ status: 'idle', result, error: null });
            return result;
        } catch (error) {
            if (controller.signal.aborted || error?.name === 'AbortError') return null;
            if (seqRef.current === seq) setState({ status: 'error', result: null, error: { message: describeAiError(error), raw: error } });
            return null;
        }
    }, []);

    const reset = useCallback(() => {
        abort();
        setState({ status: 'idle', result: null, error: null });
    }, [abort]);

    return { status: state.status, result: state.result, error: state.error, loading: state.status === 'loading', run, reset, abort };
}
