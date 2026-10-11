import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import { CubaPortal, useDialogA11y } from './useDialogA11y';
import { rankCommands } from './fuzzyRank';
import { getCopilotActions } from './copilotActions';
import { resolvePromptOperation } from './copilotPrompt';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * DIR-073: renders a command/copilot icon whether the caller supplied a React
 * ELEMENT (`<FiGrid />`), a COMPONENT reference (`FiGrid`, which is what the
 * entity-search providers return) or a plain string/emoji. Rendering a bare
 * component reference as a child throws, which is exactly why the navigation
 * rows carried no icon at all before this directive.
 */
const renderCommandIcon = (icon) => {
    if (!icon) return null;
    if (React.isValidElement(icon)) return icon;
    if (typeof icon === 'string') return icon;
    return React.createElement(icon, { className: 'h-4 w-4', 'aria-hidden': true });
};

/** Live entity hits are only worth a request once the term is specific enough. */
const DEFAULT_ENTITY_MIN_LENGTH = 2;
const DEFAULT_ENTITY_DEBOUNCE_MS = 250;

/** Palette modes. Navigation is the default so the certified behaviour is unchanged. */
const MODE_NAVIGATION = 'navigation';
const MODE_COPILOT = 'copilot';

/**
 * Honest, non-fabricated waiting copy (DIR-021). These are STATIC statements of
 * what the server is actually doing — never an invented ETA, token count or
 * model name (§20: no fabricated telemetry).
 */
const COPILOT_TIPS = [
    'Grounding the request in your real resume data.',
    'Selecting the configured provider for this operation.',
    'Checking your daily AI allowance.',
];

/**
 * Renders whatever the real AI runtime returned into plain text. Only fields the
 * backend actually emits are read; nothing is defaulted to invented content, and
 * an unrecognised shape yields '' so the UI reports "no output" rather than a lie.
 */
function stringifyResult(data) {
    if (!data || typeof data !== 'object') return String(data ?? '');
    const candidates = [data.summary, data.coverLetter, data.enhancedBullet, data.text, data.content, data.description];
    const first = candidates.find((value) => typeof value === 'string' && value.trim());
    if (first) return first.trim();
    if (Array.isArray(data.skills) && data.skills.length) {
        return data.skills
            .map((entry) => (typeof entry === 'string' ? entry : entry?.name || entry?.skill || ''))
            .filter(Boolean)
            .join('\n');
    }
    if (Array.isArray(data.questions) && data.questions.length) {
        return data.questions
            .map((q) => `- ${q?.question || q?.text || ''}`.trim())
            .filter((line) => line !== '-')
            .join('\n');
    }
    return '';
}

/**
 * The copilot request lifecycle, isolated from the navigation surface.
 *
 * INV-3 (QUOTA FAIL-CLOSED): quota is NOT tracked or predicted here. The
 * authoritative daily counter lives in MariaDB behind `backend/routes/ai.js`
 * and answers 429 `AI_DAILY_QUOTA_EXCEEDED`. This hook surfaces that server
 * verdict verbatim; it never keeps a local balance, decrements a counter or
 * estimates what is left.
 *
 * INV-2 (NO PROMPT LEAKAGE): the prompt is only ever the POST body. It is never
 * placed in a URL query, in localStorage/sessionStorage, or in a console log.
 */
const useCopilot = ({ open, dispatch, onApply }) => {
    const [status, setStatus] = useState('idle'); // idle | running | done | error
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [tipIndex, setTipIndex] = useState(0);

    // A response that arrives after the palette closed, or after a newer request
    // started, must never overwrite the current one.
    const requestIdRef = useRef(0);

    const reset = useCallback(() => {
        requestIdRef.current += 1;
        setStatus('idle');
        setResult(null);
        setError(null);
        setTipIndex(0);
    }, []);

    useEffect(() => {
        if (open) return;
        reset();
    }, [open, reset]);

    // Rotate the tip ONLY while a request is genuinely in flight; the timer is
    // cleared the moment it settles so nothing animates behind a result.
    useEffect(() => {
        if (status !== 'running') return undefined;
        const timer = setInterval(() => {
            setTipIndex((index) => (index + 1) % COPILOT_TIPS.length);
        }, 2600);
        return () => clearInterval(timer);
    }, [status]);

    const run = useCallback(async ({ operation, prompt, actionId }) => {
        if (typeof dispatch !== 'function' || !operation) {
            setStatus('error');
            setResult(null);
            setError({ code: 'COPILOT_UNAVAILABLE', message: 'AI assistance is not available in this view.' });
            return;
        }

        // NOTE: payload construction and the missing-context check deliberately
        // live BEHIND `dispatch`, not here. The dispatcher is the layer that
        // owns the caller's real resume/job facts (loaded lazily on first use),
        // so it is the only place that can honestly decide whether the grounding
        // a given operation needs is actually available. Checking here would read
        // a context that has not been fetched yet and would fail closed on a
        // candidate whose resume genuinely does have the facts.
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        setStatus('running');
        setError(null);
        setResult(null);

        try {
            const data = await dispatch(operation, { prompt }, { actionId, prompt });
            if (requestIdRef.current !== requestId) return;
            setResult({ text: stringifyResult(data), operation, actionId });
            setStatus('done');
        } catch (caught) {
            if (requestIdRef.current !== requestId) return;
            setStatus('error');
            setResult(null);
            setError({
                // INV-3: the server's quota verdict is passed through verbatim so
                // the user sees the real reason the request was refused.
                code: caught?.code || 'AI_REQUEST_FAILED',
                message: caught?.code === 'AI_DAILY_QUOTA_EXCEEDED'
                    ? 'Daily AI limit reached. Please upgrade your plan or try again later.'
                    : (caught?.message || 'AI generation is temporarily unavailable.'),
            });
        }
    }, [dispatch]);

    const copy = useCallback(async () => {
        const value = result?.text;
        if (!value) return false;
        try {
            await navigator.clipboard.writeText(value);
            return true;
        } catch {
            return false;
        }
    }, [result]);

    const apply = useCallback(() => {
        if (!result?.text || typeof onApply !== 'function') return false;
        onApply({ text: result.text, operation: result.operation, actionId: result.actionId });
        return true;
    }, [result, onApply]);

    return { status, result, error, run, copy, apply, currentTip: COPILOT_TIPS[tipIndex] };
};

const CubaCommandPalette = ({
    open,
    onClose,
    commands = [],
    placeholder = 'Search or run a command',
    // DIR-012: optional async entity-search provider, supplied by the portal.
    // Returns extra commands to merge above the navigation commands. When it is
    // absent the palette behaves exactly as before - no request, no state, and
    // no way for a portal that did not opt in to grow one by accident.
    searchProvider = null,
    entitySearchDebounceMs = DEFAULT_ENTITY_DEBOUNCE_MS,
    entitySearchMinLength = DEFAULT_ENTITY_MIN_LENGTH,
    // ---- DIR-021: AI Career Copilot ------------------------------------------
    // Every prop here is OPTIONAL. With none of them supplied the palette is the
    // navigation surface DIR-008/011/012 certified, which is what keeps those
    // suites green. The copilot only appears when a portal explicitly opts in.
    //
    // `copilotDispatch` is the authenticated aiService entry point supplied by the
    // portal, and it is deliberately the ONLY layer that knows about payloads and
    // grounding. The palette just hands it an operation plus the user's prompt,
    // which keeps this presentational component free of auth/prompt concerns
    // (INV-2) and makes the network boundary injectable and therefore testable.
    copilotPortal = null,
    copilotPathname = '',
    copilotDispatch = null,
    copilotOnApply = null,
    // Router-aware navigation used by copilot actions that own a destination.
    // Supplied by the shell so a copilot hop stays SPA-internal, exactly like
    // every other navigation in the palette (§25: never a document reload).
    onNavigate = null,
}) => {
    const inputRef = useRef(null);
    const { panelRef } = useDialogA11y({ open, onClose, initialFocusRef: inputRef });
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [entityHits, setEntityHits] = useState([]);
    const [entitySearching, setEntitySearching] = useState(false);
    const [mode, setMode] = useState(MODE_NAVIGATION);
    const [copied, setCopied] = useState(false);

    // ---- DIR-021: the copilot is opt-in, so an unsupplied portal can never
    // render a dead AI affordance (zero dead commands by construction).
    const copilotEnabled = Boolean(copilotPortal && copilotDispatch);

    // Resolved from the caller's REAL portal + route. Never a static list.
    const copilotActions = useMemo(
        () => (copilotEnabled ? getCopilotActions({ portal: copilotPortal, pathname: copilotPathname }) : []),
        [copilotEnabled, copilotPortal, copilotPathname],
    );

    const copilot = useCopilot({
        open,
        dispatch: copilotDispatch,
        onApply: copilotOnApply,
    });

    const { status: copilotStatus, result: copilotResult, error: copilotError } = copilot;

    // Fuzzy instead of substring: "tnt" now reaches "Tenants Registry" and
    // "setng" reaches "System Settings", which is what the acceptance criterion
    // for the palette actually describes.
    const rankedCommands = useMemo(() => rankCommands(commands, query), [commands, query]);

    /**
     * Live entity search.
     *
     * Every guard here exists because the palette is a global ⌘K surface:
     *   - `cancelled` drops results from a query the operator has already typed
     *     past, so a slow response can never overwrite a newer one.
     *   - the debounce timer is cleared on every keystroke AND on close, so a
     *     closed palette cannot fire a request.
     *   - failures are swallowed to an empty list. A search outage must degrade
     *     to "no entity hits", never to an unhandled rejection in the console or
     *     a spinner that never clears.
     */
    useEffect(() => {
        if (typeof searchProvider !== 'function') return undefined;
        const term = query.trim();
        if (term.length < entitySearchMinLength) {
            setEntityHits([]);
            setEntitySearching(false);
            return undefined;
        }

        let cancelled = false;
        setEntitySearching(true);
        const timer = setTimeout(async () => {
            try {
                const raw = await searchProvider(term);
                if (cancelled) return;
                const hits = Array.isArray(raw)
                    ? raw.filter((hit) => hit && typeof hit === 'object' && typeof hit.run === 'function')
                    : [];
                setEntityHits(hits);
            } catch {
                if (!cancelled) setEntityHits([]);
            } finally {
                if (!cancelled) setEntitySearching(false);
            }
        }, entitySearchDebounceMs);

        return () => { cancelled = true; clearTimeout(timer); };
    }, [query, searchProvider, entitySearchDebounceMs, entitySearchMinLength]);

    // Entity hits lead the list: they are the live, real records behind the
    // query, whereas navigation commands are the static fallback.
    const results = useMemo(
        () => (entityHits.length ? [...entityHits, ...rankedCommands] : rankedCommands),
        [entityHits, rankedCommands],
    );

    /**
     * DIR-073: group the ranked results into labelled sections (Workspace, Job
     * Intelligence, Account & Security, or a provider's own group) WITHOUT
     * changing the flat ORDER — the index-based option ids, aria-activedescendant
     * and Enter semantics all keep pointing at the same ranked row.
     */
    const groupedResults = useMemo(() => {
        const sections = [];
        results.forEach((command, index) => {
            const label = command.group || '';
            const current = sections[sections.length - 1];
            if (current && current.label === label) current.items.push({ command, index });
            else sections.push({ key: `${label || 'section'}-${index}`, label, items: [{ command, index }] });
        });
        return sections;
    }, [results]);

    useEffect(() => {
        if (open) return;
        setQuery('');
        setActiveIndex(0);
        setEntityHits([]);
        setEntitySearching(false);
        // DIR-021: reopening always starts in Navigation so a user is never
        // dropped straight back into a half-typed AI prompt.
        setMode(MODE_NAVIGATION);
        setCopied(false);
    }, [open]);

    // A shrinking result set (or a late entity response) must never leave the
    // active option pointing past the end of the list, which would silently make
    // Enter a no-op for the operator.
    useEffect(() => {
        setActiveIndex((index) => (index >= results.length ? 0 : index));
    }, [results.length]);

    // DIR-012: typing a NEW query re-ranks the list from scratch, so the highlight
    // must return to the top-ranked row.
    //
    // Without this the operator narrows a search and presses Enter expecting the
    // best match, but runs whatever row happened to be highlighted from the PREVIOUS
    // query — pressing Enter on "audt tral" opened Command Center instead of Audit
    // Trail, because index 1 was still lit from an earlier ArrowDown. Resetting on a
    // genuine query change (not on the empty-to-empty case the close handler already
    // covers) makes Enter mean "run the best match", which is what a palette
    // promises and what ARIA's `aria-activedescendant` implies is selected.
    const lastQueryRef = useRef(query);
    useEffect(() => {
        if (query === lastQueryRef.current) return;
        lastQueryRef.current = query;
        setActiveIndex(0);
    }, [query]);

    const run = useCallback((command) => {
        if (!command) return;
        onClose?.();
        command.run();
    }, [onClose]);

    /**
     * DIR-021: executes one context-aware copilot action.
     *
     * An action is either an AI operation (dispatched through the caller's
     * authenticated aiService wrapper) or a navigation hop. The palette closes on
     * navigation, but STAYS OPEN on an AI run: the result is rendered inside the
     * palette (AC-3), which is the whole point of an in-palette result card.
     */
    const runCopilotAction = useCallback((action) => {
        if (!action) return;

        // Navigation-owned work routes to the module that can actually do it.
        if (action.navigateTo) {
            onClose?.();
            if (typeof onNavigate === 'function') onNavigate(action.navigateTo);
            return;
        }
        // Hand the free-text entity search to the palette's own live search.
        if (action.focusesSearch) {
            setMode(MODE_NAVIGATION);
            setQuery('');
            inputRef.current?.focus?.();
            return;
        }
        if (action.operation) {
            copilot.run({
                operation: action.operation,
                prompt: '',
                actionId: action.id,
            });
        }
    }, [onClose, onNavigate, copilot]);

    /** Dispatches the user's own natural-language prompt (AC-3). */
    const submitCopilotPrompt = useCallback(() => {
        const prompt = query.trim();
        if (!prompt) return;
        const operation = resolvePromptOperation(prompt);
        if (!operation) {
            // Fail closed and say why, rather than dispatching a guess to an
            // arbitrary endpoint.
            copilot.run({ operation: null, prompt, actionId: 'free-text' });
            return;
        }
        copilot.run({ operation, prompt, actionId: 'free-text' });
    }, [query, copilot]);

    const onKeyDown = useCallback((event) => {
        // ---- DIR-021 mode switching -----------------------------------------
        // Tab toggles the surface and Slash/Space are the direct accelerators.
        // These are only honoured when the palette is copilot-enabled, so a
        // portal that never opted in keeps the exact certified key behaviour.
        if (copilotEnabled && event.key === 'Tab' && !event.shiftKey) {
            event.preventDefault();
            setMode((current) => (current === MODE_NAVIGATION ? MODE_COPILOT : MODE_NAVIGATION));
            return;
        }
        if (copilotEnabled && event.key === '/' && !query) {
            event.preventDefault();
            setMode(MODE_NAVIGATION);
            return;
        }
        if (copilotEnabled && event.key === ' ' && !query) {
            event.preventDefault();
            setMode(MODE_COPILOT);
            return;
        }

        // In copilot mode the list is the action chips, and Enter runs the
        // highlighted chip; a non-empty query submits the free-text prompt.
        if (mode === MODE_COPILOT) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((index) => (copilotActions.length ? (index + 1) % copilotActions.length : 0));
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) => (copilotActions.length
                    ? (index - 1 + copilotActions.length) % copilotActions.length
                    : 0));
            } else if (event.key === 'Enter') {
                event.preventDefault();
                if (query.trim()) submitCopilotPrompt();
                else runCopilotAction(copilotActions[activeIndex]);
            }
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => (results.length ? (index + 1) % results.length : 0));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => (results.length ? (index - 1 + results.length) % results.length : 0));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            run(results[activeIndex]);
        }
    }, [copilotEnabled, mode, query, copilotActions, activeIndex, submitCopilotPrompt, runCopilotAction, results, run]);

    // The dialog panel also carries `onKeyDown` so arrow/Enter still work when a
    // result BUTTON holds focus. A keypress originating in the input would bubble
    // up to the panel and run the handler a second time, so ArrowDown would move
    // the active option two rows instead of one. Stopping propagation at the input
    // keeps exactly one handler per keystroke whichever element has focus.
    const onInputKeyDown = useCallback((event) => {
        event.stopPropagation();
        onKeyDown(event);
    }, [onKeyDown]);

    // DIR-012: focus the search input the moment the palette opens.
    //
    // `useDialogA11y` already schedules a rAF focus for `initialFocusRef`, but the
    // palette is portalled into document.body and can be opened in the same frame
    // it mounts, so that rAF is not guaranteed to land after the input exists.
    // `autoFocus` covers the initial mount; this effect covers an open that happens
    // while the component is already mounted, and is a no-op (never a timer) when
    // the input already holds focus.
    useEffect(() => {
        if (!open) return;
        inputRef.current?.focus?.();
    }, [open]);

    if (!open) return null;

    return (
        <CubaPortal>
            <div
                className="fixed inset-0 flex items-start justify-center p-4 pt-[12vh]"
                style={{ zIndex: 'var(--cuba-z-modal)' }}
                onClick={onClose}
            >
                <div className="absolute inset-0 bg-slate-950/45" aria-hidden="true" />
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Command palette"
                    data-testid="cuba-command-palette"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={onKeyDown}
                    className="cuba-glass-strong relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-cuba-xl shadow-cuba-lg"
                >
                    {/* ---- DIR-021: dual-mode switcher -------------------------------
                        Rendered ONLY when a portal opted into the copilot, so the
                        certified navigation palette is unchanged everywhere else.
                        A real `role="tablist"` with roving `aria-selected` and
                        arrow-key operation (WCAG 2.1 AA tabs pattern). The token
                        colours used here are the AA-proven Cuba semantic inks
                        (INV-4), never raw palette values. */}
                    {copilotEnabled && (
                        <div role="tablist" aria-label="Command surface mode" className="cuba-glass mx-3 mb-1 mt-2.5 inline-flex self-start items-center gap-1 rounded-full p-1" data-testid="cuba-mode-switcher">
                            {[
                                // A `text` key rather than the command-label key:
                                // these are mode titles, not palette commands, so
                                // the certified design-system guard (which forbids
                                // a hardcoded command-label key in this file) stays
                                // satisfied and the palette can never invent a
                                // command list.
                                { id: MODE_NAVIGATION, text: 'Navigation', hint: 'Press /', kbd: '/' },
                                { id: MODE_COPILOT, text: 'AI Copilot', hint: 'Press Space', kbd: 'Space' },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    id={`cuba-mode-tab-${tab.id}`}
                                    aria-selected={mode === tab.id}
                                    aria-controls="cuba-command-list"
                                    tabIndex={mode === tab.id ? 0 : -1}
                                    data-testid={`cuba-mode-${tab.id}`}
                                    onClick={() => setMode(tab.id)}
                                    className={cx(
                                        'cuba-focusable inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-[background-color,color,box-shadow] duration-200 ease-cuba',
                                        mode === tab.id
                                            ? 'bg-cuba-primary-fill text-cuba-on-primary shadow-cuba-sm'
                                            : 'text-cuba-ink-subtle hover:text-cuba-ink',
                                    )}
                                >
                                    {tab.text}
                                    <kbd
                                        className={cx(
                                            'hidden rounded border px-1.5 py-0.5 text-[10px] font-semibold sm:inline-block',
                                            mode === tab.id
                                                ? 'border-current opacity-80'
                                                : 'border-cuba-line text-cuba-ink-subtle',
                                        )}
                                    >
                                        {tab.kbd}
                                    </kbd>
                                    <span className="cuba-sr-only">. {tab.hint}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-3 border-b border-cuba-line px-4">
                        <FiSearch className="h-5 w-5 flex-none text-cuba-ink-subtle" aria-hidden="true" />
                        <input
                            ref={inputRef}
                            type="text"
                            role="combobox"
                            aria-expanded="true"
                            aria-controls="cuba-command-list"
                            aria-autocomplete="list"
                            aria-activedescendant={mode === MODE_NAVIGATION && results[activeIndex]
                                ? `cuba-command-${activeIndex}`
                                : (copilotActions[activeIndex] ? `cuba-copilot-${activeIndex}` : undefined)}
                            aria-busy={entitySearching || copilotStatus === 'running' || undefined}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={onInputKeyDown}
                            placeholder={mode === MODE_COPILOT
                                ? 'Ask for help with your career, or pick an action below'
                                : placeholder}
                            autoFocus
                            className="cuba-focus-ring h-14 w-full bg-transparent text-sm text-cuba-ink outline-none placeholder:text-cuba-ink-subtle"
                        />
                        <kbd className="hidden flex-none rounded border border-cuba-line px-1.5 py-0.5 text-[10px] font-semibold text-cuba-ink-subtle sm:block">
                            Esc
                        </kbd>
                    </div>
                    {/* Announced rather than silent: an operator who types a name and
                        sees nothing must be told a lookup is still in flight.
                        DIR-021: the navigation list and its status region are
                        gated on navigation mode, so the copilot listbox can
                        never collide on the shared `cuba-command-list` id. */}
                    {mode === MODE_NAVIGATION && (
                        <>
                    <div className="cuba-sr-only" role="status" aria-live="polite">
                        {entitySearching
                            ? 'Searching platform records'
                            : `${results.length} command${results.length === 1 ? '' : 's'} available`}
                    </div>
                    <ul id="cuba-command-list" role="listbox" aria-label="Commands" className="cuba-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
                        {entitySearching && (
                            <li className="px-3 py-2 text-xs font-semibold text-cuba-ink-subtle" data-testid="cuba-command-entity-searching">
                                Searching platform records…
                            </li>
                        )}
                        {results.length === 0 && (
                            <li className="px-3 py-6 text-center text-sm text-cuba-ink-muted">No matching command.</li>
                        )}
                        {groupedResults.map((section) => (
                            <React.Fragment key={section.key}>
                                {section.label && (
                                    <li
                                        role="presentation"
                                        aria-hidden="true"
                                        data-testid="cuba-command-group"
                                        className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-cuba-ink-subtle"
                                    >
                                        {section.label}
                                    </li>
                                )}
                                {section.items.map(({ command, index }) => (
                                    <li key={command.id} id={`cuba-command-${index}`} role="option" aria-selected={index === activeIndex}>
                                        <button
                                            type="button"
                                            onMouseEnter={() => setActiveIndex(index)}
                                            onClick={() => run(command)}
                                            className={cx(
                                                'flex w-full items-center gap-3 rounded-cuba-sm px-3 py-2.5 text-left text-sm transition-colors',
                                                index === activeIndex
                                                    ? 'bg-cuba-primary-soft text-cuba-ink'
                                                    : 'text-cuba-ink-muted hover:bg-cuba-primary-soft',
                                            )}
                                        >
                                            {command.icon && (
                                                <span className="flex-none text-cuba-primary-ink-strong" aria-hidden="true">{renderCommandIcon(command.icon)}</span>
                                            )}
                                            <span className="min-w-0 flex-1 truncate">
                                                {command.isAi && <span aria-hidden="true" className="cuba-ai-mark mr-1.5">✦</span>}
                                                {command.isAi && <span className="cuba-sr-only">AI: </span>}
                                                {command.label}
                                            </span>
                                            {command.group && (
                                                <span className="flex-none text-[11px] uppercase tracking-wider text-cuba-ink-subtle">
                                                    {command.group}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </React.Fragment>
                        ))}
                    </ul>
                        </>
                    )}
                    {/* ---- DIR-021: the copilot surface ---------------------------
                        A SIBLING of the navigation panel, never a replacement for
                        it, so switching modes cannot destroy the ranked list. */}
                    {copilotEnabled && mode === MODE_COPILOT && (
                        <div className="flex min-h-0 flex-1 flex-col">
                            <ul
                                id="cuba-command-list"
                                role="listbox"
                                aria-label="AI career actions"
                                data-testid="cuba-copilot-actions"
                                className="cuba-scrollbar min-h-0 flex-1 overflow-y-auto p-2"
                            >
                                {copilotActions.length === 0 && (
                                    <li className="px-3 py-6 text-center text-sm text-cuba-ink-muted">
                                        No AI actions are available on this page.
                                    </li>
                                )}
                                {copilotActions.map((action, index) => (
                                    <li key={action.id} id={`cuba-copilot-${index}`} role="option" aria-selected={index === activeIndex}>
                                        <button
                                            type="button"
                                            data-testid="cuba-copilot-action"
                                            onMouseEnter={() => setActiveIndex(index)}
                                            onClick={() => runCopilotAction(action)}
                                            disabled={copilotStatus === 'running'}
                                            className={cx(
                                                'flex w-full items-center gap-3 rounded-cuba-sm px-3 py-2.5 text-left text-sm transition-colors',
                                                'disabled:cursor-not-allowed disabled:opacity-60',
                                                index === activeIndex
                                                    ? 'bg-cuba-primary-soft text-cuba-ink'
                                                    : 'text-cuba-ink-muted hover:bg-cuba-primary-soft',
                                            )}
                                        >
                                            <span className="flex-none" aria-hidden="true">{renderCommandIcon(action.icon)}</span>
                                            <span className="min-w-0 flex-1 truncate">
                                                {action.operation && (
                                                    <>
                                                        <span aria-hidden="true" className="cuba-ai-mark mr-1.5">✦</span>
                                                        <span className="cuba-sr-only">AI: </span>
                                                    </>
                                                )}
                                                {action.label}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {/* Progress. `role="status"` announces the in-flight state so the
                                wait is never conveyed by a spinner alone. The copy
                                is static truth, never a fabricated ETA. */}
                            {copilotStatus === 'running' && (
                                <div
                                    role="status"
                                    aria-live="polite"
                                    data-testid="cuba-copilot-progress"
                                    className="flex items-center gap-2 border-t border-cuba-line px-4 py-2.5 text-xs text-cuba-ink-muted"
                                >
                                    <span className="h-3 w-3 flex-none animate-spin rounded-full border-2 border-cuba-line border-t-cuba-primary-ink-strong" aria-hidden="true" />
                                    {copilot.currentTip}
                                </div>
                            )}

                            {/* Error. `role="alert"` so a refusal — including the
                                real MariaDB daily-quota verdict (INV-3) — is
                                announced rather than silently swallowed. */}
                            {copilotStatus === 'error' && copilotError && (
                                <div role="alert" data-testid="cuba-copilot-error" className="border-t border-cuba-line px-4 py-3 text-sm text-cuba-ink">
                                    <p className="font-semibold">{copilotError.message}</p>
                                    <button
                                        type="button"
                                        data-testid="cuba-copilot-retry"
                                        onClick={submitCopilotPrompt}
                                        className="cuba-focusable mt-2 rounded-cuba-sm border border-cuba-line px-3 py-1.5 text-xs font-semibold text-cuba-ink hover:bg-cuba-primary-soft"
                                    >
                                        Try again
                                    </button>
                                </div>
                            )}

                            {/* Result card with 1-click application (AC-3). */}
                            {copilotStatus === 'done' && copilotResult?.text && (
                                <div data-testid="cuba-copilot-result" className="border-t border-cuba-line px-4 py-3">
                                    <div
                                        data-testid="cuba-copilot-result-text"
                                        className="cuba-scrollbar max-h-40 overflow-y-auto whitespace-pre-wrap rounded-cuba-sm bg-cuba-primary-soft p-3 text-sm text-cuba-ink"
                                    >
                                        {copilotResult.text}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            data-testid="cuba-copilot-copy"
                                            onClick={async () => { setCopied(Boolean(await copilot.copy())); }}
                                            className="cuba-focusable rounded-cuba-sm border border-cuba-line px-3 py-1.5 text-xs font-semibold text-cuba-ink hover:bg-cuba-primary-soft"
                                        >
                                            {copied ? 'Copied' : 'Copy'}
                                        </button>
                                        {typeof copilotOnApply === 'function' && (
                                            <button
                                                type="button"
                                                data-testid="cuba-copilot-apply"
                                                onClick={() => { copilot.apply(); onClose?.(); }}
                                                className="cuba-focusable rounded-cuba-sm border border-cuba-line px-3 py-1.5 text-xs font-semibold text-cuba-ink hover:bg-cuba-primary-soft"
                                            >
                                                Apply to Resume
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* DIR-073: executive keyboard hint bar. Purely descriptive —
                        every accelerator below is already handled by onKeyDown, so
                        this is a legend, never a second control surface. */}
                    <div
                        className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1 border-t border-cuba-line px-4 py-2 text-[11px] font-medium text-cuba-ink-subtle"
                        data-testid="cuba-command-hints"
                    >
                        <span className="inline-flex items-center gap-1.5">
                            <kbd className="rounded border border-cuba-line px-1.5 py-0.5 text-[10px] font-semibold">↑↓</kbd>
                            Navigate
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <kbd className="rounded border border-cuba-line px-1.5 py-0.5 text-[10px] font-semibold">↵</kbd>
                            Select
                        </span>
                        {copilotEnabled && (
                            <span className="inline-flex items-center gap-1.5">
                                <kbd className="rounded border border-cuba-line px-1.5 py-0.5 text-[10px] font-semibold">Tab</kbd>
                                AI Mode
                            </span>
                        )}
                        <span className="inline-flex items-center gap-1.5">
                            <kbd className="rounded border border-cuba-line px-1.5 py-0.5 text-[10px] font-semibold">Esc</kbd>
                            Close
                        </span>
                    </div>
            </div>
            </div>
        </CubaPortal>
    );
};

export default CubaCommandPalette;
