import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import { CubaPortal, useDialogA11y } from './useDialogA11y';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * CubaCommandPalette â€” the âŒ˜K / Ctrl+K launcher (Â§25).
 *
 * ZERO DEAD COMMANDS, BY CONSTRUCTION:
 *   A command is rendered only if it exists in the `commands` array, which the
 *   caller must build from routes that are actually mounted and capabilities the
 *   user actually has. There is no built-in command list in this component, so it
 *   cannot invent an action, cannot offer a feature the user cannot access, and
 *   cannot navigate to a route that does not exist.
 *
 * Accessibility: combobox/listbox pattern â€” the input owns `aria-activedescendant`,
 * arrow keys move the active option, Enter runs it, Escape closes, and focus is
 * restored to the launcher on close.
 */
const CubaCommandPalette = ({ open, onClose, commands = [], placeholder = 'Search or run a command' }) => {
    const inputRef = useRef(null);
    const { panelRef } = useDialogA11y({ open, onClose, initialFocusRef: inputRef });
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);

    const results = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return commands;
        return commands.filter((command) =>
            `${command.label} ${command.group || ''} ${command.keywords || ''}`.toLowerCase().includes(term),
        );
    }, [commands, query]);

    useEffect(() => {
        if (open) return;
        setQuery('');
        setActiveIndex(0);
    }, [open]);

    useEffect(() => {
        setActiveIndex((index) => (index >= results.length ? 0 : index));
    }, [results.length]);

    const run = useCallback((command) => {
        if (!command) return;
        onClose?.();
        command.run();
    }, [onClose]);

    const onKeyDown = useCallback((event) => {
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
    }, [results, activeIndex, run]);

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
                    <div className="flex items-center gap-3 border-b border-cuba-line px-4">
                        <FiSearch className="h-5 w-5 flex-none text-cuba-ink-subtle" aria-hidden="true" />
                        <input
                            ref={inputRef}
                            type="text"
                            role="combobox"
                            aria-expanded="true"
                            aria-controls="cuba-command-list"
                            aria-autocomplete="list"
                            aria-activedescendant={results[activeIndex] ? `cuba-command-${activeIndex}` : undefined}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={placeholder}
                            className="cuba-focus-ring h-14 w-full bg-transparent text-sm text-cuba-ink outline-none placeholder:text-cuba-ink-subtle"
                        />
                        <kbd className="hidden flex-none rounded border border-cuba-line px-1.5 py-0.5 text-[10px] font-semibold text-cuba-ink-subtle sm:block">
                            Esc
                        </kbd>
                    </div>
                    <ul id="cuba-command-list" role="listbox" aria-label="Commands" className="min-h-0 flex-1 overflow-y-auto p-2">
                        {results.length === 0 && (
                            <li className="px-3 py-6 text-center text-sm text-cuba-ink-muted">No matching command.</li>
                        )}
                        {results.map((command, index) => (
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
                                        <span className="flex-none text-cuba-primary-ink-strong" aria-hidden="true">{command.icon}</span>
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
                    </ul>
                </div>
            </div>
        </CubaPortal>
    );
};

export default CubaCommandPalette;
