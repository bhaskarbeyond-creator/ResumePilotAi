import React, { useEffect, useRef, useState } from 'react';
import { MdArrowUpward, MdArrowDownward, MdContentCopy, MdDeleteOutline, MdExpandMore, MdMoreVert } from 'react-icons/md';

/**
 * EntryHeader — the summary row of one resume entry: title + subtitle +
 * meta (dates) + expand toggle + a quiet kebab menu (duplicate, move,
 * delete). No badges, no gradients.
 */
export default function EntryHeader({
    title = '',
    subtitle = '',
    meta = '',
    expanded = false,
    onToggle,
    onDuplicate = null,
    onDelete = null,
    onMoveUp = null,
    onMoveDown = null,
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!menuOpen) return undefined;
        const close = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [menuOpen]);

    const hasMenu = Boolean(onDuplicate || onDelete || onMoveUp || onMoveDown);

    const menuItem = (label, icon, onClick, danger = false) => (
        <button
            type="button"
            onClick={() => { setMenuOpen(false); onClick?.(); }}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'
            }`}
        >
            <span className="w-4">{icon}</span>
            {label}
        </button>
    );

    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
                <span
                    className={`min-w-0 flex-1 ${title ? '' : 'text-slate-400'}`}
                >
                    <span className={`block truncate text-sm font-semibold ${title ? 'text-slate-900' : 'italic'}`}>
                        {title || 'Untitled entry'}
                    </span>
                    {subtitle ? (
                        <span className="block truncate text-xs text-slate-500">{subtitle}</span>
                    ) : null}
                </span>
                {meta ? (
                    <span className="hidden sm:block shrink-0 text-xs font-medium text-slate-400">{meta}</span>
                ) : null}
                <MdExpandMore className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {hasMenu && (
                <div className="relative shrink-0" ref={menuRef}>
                    <button
                        type="button"
                        onClick={() => setMenuOpen(prev => !prev)}
                        aria-label="Entry actions"
                        aria-expanded={menuOpen}
                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    >
                        <MdMoreVert className="w-4 h-4" />
                    </button>
                    {menuOpen && (
                        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                            {onMoveUp && menuItem('Move up', <MdArrowUpward className="w-4 h-4" />, onMoveUp)}
                            {onMoveDown && menuItem('Move down', <MdArrowDownward className="w-4 h-4" />, onMoveDown)}
                            {onDuplicate && menuItem('Duplicate', <MdContentCopy className="w-4 h-4" />, onDuplicate)}
                            {onDelete && menuItem('Delete', <MdDeleteOutline className="w-4 h-4" />, onDelete, true)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
