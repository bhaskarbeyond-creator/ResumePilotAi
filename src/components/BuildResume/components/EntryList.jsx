import React, { useEffect, useState } from 'react';
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

    // When a new entry is added (new first id), expand it.
    useEffect(() => {
        if (firstId && firstId !== prevFirstId) {
            setExpandedId(firstId);
            setPrevFirstId(firstId);
        }
    }, [firstId, prevFirstId]);

    if (!entries.length) return null;

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
            <ul className="divide-y divide-slate-100">
                {entries.map((entry, index) => {
                    const expanded = expandedId === entry.id;
                    const title = renderEntryTitle ? renderEntryTitle(entry, index) : { title: '', subtitle: '', meta: '' };
                    return (
                        <li key={entry.id}>
                            <EntryHeader
                                title={title.title}
                                subtitle={title.subtitle}
                                meta={title.meta}
                                expanded={expanded}
                                onToggle={() => setExpandedId(expanded ? null : entry.id)}
                                onMoveUp={index > 0 ? entry.onMoveUp : null}
                                onMoveDown={index < entries.length - 1 ? entry.onMoveDown : null}
                                onDuplicate={entry.onDuplicate}
                                onDelete={entry.onDelete}
                            />
                            {expanded && (
                                <div className="px-3 pb-4 pt-1 sm:px-4">
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
