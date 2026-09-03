import React, { useEffect, useRef, useState } from 'react';
import EntryHeader from './EntryHeader.jsx';

/**
 * EntryList — the card list every "many entries" step uses
 * (work history, education, projects, certifications, achievements,
 * languages, references, custom-section items).
 *
 * One collapsible entry per item: summary row (EntryHeader) + expanded body
 * rendered by `renderEntry`. Expand state is internal; the first entry is
 * expanded by default so a new entry is immediately editable.
 */
export default function EntryList({
    entries = [],
    renderEntry,
    renderEntryTitle = null,
}) {
    const firstId = entries[0]?.id;
    const [expandedId, setExpandedId] = useState(firstId ?? null);
    const [prevFirstId, setPrevFirstId] = useState(firstId ?? null);
    const activeRef = useRef(null);

    // When a new entry is added (new first id), expand it.
    useEffect(() => {
        if (firstId && firstId !== prevFirstId) {
            setExpandedId(firstId);
            setPrevFirstId(firstId);
        }
    }, [firstId, prevFirstId]);

    // Smooth scroll newly opened entry into viewport view if needed
    useEffect(() => {
        if (expandedId && activeRef.current) {
            const rect = activeRef.current.getBoundingClientRect();
            if (rect.top < 120 || rect.bottom > window.innerHeight) {
                activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [expandedId]);

    if (!entries.length) return null;

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
            <ul className="divide-y divide-slate-100">
                {entries.map((entry, index) => {
                    const expanded = expandedId === entry.id;
                    const title = renderEntryTitle ? renderEntryTitle(entry, index) : { title: '', subtitle: '', meta: '' };
                    const panelId = `entry-panel-${entry.id}`;
                    return (
                        <li key={entry.id} ref={expanded ? activeRef : null}>
                            <EntryHeader
                                title={title.title}
                                subtitle={title.subtitle}
                                meta={title.meta}
                                expanded={expanded}
                                controlsId={panelId}
                                onToggle={() => setExpandedId(expanded ? null : entry.id)}
                                onMoveUp={index > 0 ? entry.onMoveUp : null}
                                onMoveDown={index < entries.length - 1 ? entry.onMoveDown : null}
                                onDuplicate={entry.onDuplicate}
                                onDelete={entry.onDelete}
                            />
                            {expanded && (
                                <div id={panelId} role="region" aria-label={title.title || 'Entry details'} className="px-3 pb-4 pt-1 sm:px-4">
                                    {renderEntry(entry, index, { expanded, onToggle: () => setExpandedId(null) })}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
