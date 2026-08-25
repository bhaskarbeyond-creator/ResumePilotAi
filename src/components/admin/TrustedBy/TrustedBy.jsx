import React, { useCallback, useEffect, useId, useState } from 'react';
import { FaPlus, FaTrash, FaPen, FaSave, FaTimes, FaImage, FaBuilding, FaEye, FaSpinner, FaCheck, FaExclamationTriangle } from 'react-icons/fa';
import { addTrustedBy, getTrustedBy, removeTrustedBy, updateTrustedBy } from '../../../firestore/dbOperations';
import { sanitizeImageUrl } from '../../../utils/sanitizeHtml';

const EMPTY = { name: '', imageUrl: '', order: 0, published: true };

const TrustedBy = () => {
    const [items, setItems] = useState([]);
    const [form, setForm] = useState(EMPTY);
    const [editing, setEditing] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [message, setMessage] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try { setItems(await getTrustedBy({ includeUnpublished: true })); }
        catch (error) { setMessage({ type: 'error', text: error.message || 'Unable to load trusted logos.' }); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            if (e.key === 'Escape' && !processing) {
                if (deleteTarget) setDeleteTarget(null);
                if (editing) setEditing(null);
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [processing, deleteTarget, editing]);

    const validate = data => {
        if (!data.name.trim()) return 'Company name is required.';
        if (!sanitizeImageUrl(data.imageUrl)) return 'Use a valid HTTPS or site-relative image URL.';
        return '';
    };
    const submit = async event => {
        event.preventDefault();
        const error = validate(form); if (error) { setMessage({ type: 'error', text: error }); return; }
        setProcessing(true);
        const result = await addTrustedBy({ ...form, imageUrl: sanitizeImageUrl(form.imageUrl) });
        if (result.success) { setForm(EMPTY); setMessage({ type: 'success', text: form.published ? 'Logo published and audited.' : 'Unpublished logo saved and audited.' }); await load(); }
        else setMessage({ type: 'error', text: result.error || 'Unable to add logo.' });
        setProcessing(false);
    };
    const saveEdit = async event => {
        event.preventDefault();
        const error = validate(editing); if (error) { setMessage({ type: 'error', text: error }); return; }
        setProcessing(true);
        const result = await updateTrustedBy(editing.id, { ...editing, imageUrl: sanitizeImageUrl(editing.imageUrl) }, editing.revision);
        if (result.success) { setEditing(null); setMessage({ type: 'success', text: 'Logo changes saved and audited.' }); await load(); }
        else { setMessage({ type: 'error', text: result.error }); if (result.code === 'ADMIN_TARGET_CHANGED') { setEditing(null); await load(); } }
        setProcessing(false);
    };
    const confirmDelete = async () => {
        setProcessing(true);
        const result = await removeTrustedBy(deleteTarget.id, deleteTarget.revision);
        if (result.success) { setDeleteTarget(null); setMessage({ type: 'success', text: 'Logo deleted and audited.' }); await load(); }
        else { setMessage({ type: 'error', text: result.error }); if (result.code === 'ADMIN_TARGET_CHANGED') { setDeleteTarget(null); await load(); } }
        setProcessing(false);
    };

    return <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
        {deleteTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="presentation" onKeyDown={event => { if (event.key === 'Escape' && !processing) setDeleteTarget(null); }}><div role="alertdialog" aria-modal="true" aria-labelledby="trusted-delete-title" className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"><h2 id="trusted-delete-title" className="text-lg font-bold">Delete trusted logo?</h2><p className="mt-2 text-sm text-slate-600">Delete {deleteTarget.name}? It will disappear from the public homepage and the action is audited.</p><div className="mt-6 flex justify-end gap-3"><button type="button" autoFocus onClick={() => setDeleteTarget(null)} disabled={processing} className="rounded border px-4 py-2">Cancel</button><button type="button" onClick={confirmDelete} disabled={processing} className="rounded bg-red-700 px-4 py-2 text-white">{processing ? 'Deleting…' : 'Delete'}</button></div></div></div>}
        <header className="mb-6 rounded-lg border border-slate-200 bg-white p-6"><div className="flex items-center gap-3"><FaBuilding className="text-blue-600" aria-hidden="true" /><div><h1 className="text-2xl font-bold">Trusted Companies</h1><p className="text-sm text-slate-500">Draft, order, preview, publish, and remove homepage logos.</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded bg-slate-50 p-3"><span className="text-sm">Stored</span><p className="font-bold">{items.length}</p></div><div className="rounded bg-slate-50 p-3"><span className="text-sm">Published</span><p className="font-bold">{items.filter(item => item.published !== false).length}</p></div></div></header>
        {message && <div role={message.type === 'error' ? 'alert' : 'status'} className={`mb-5 flex items-center gap-2 rounded border p-4 ${message.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{message.type === 'error' ? <FaExclamationTriangle aria-hidden="true" /> : <FaCheck aria-hidden="true" />}{message.text}<button type="button" className="ml-auto" aria-label="Dismiss message" onClick={() => setMessage(null)}><FaTimes /></button></div>}
        <div className="grid gap-6 lg:grid-cols-[minmax(280px,380px)_1fr]">
            <form onSubmit={submit} className="h-fit space-y-4 rounded-lg border bg-white p-5"><h2 className="font-semibold">Add logo</h2><Field label="Company name" value={form.name} onChange={value => setForm(current => ({ ...current, name: value }))} /><Field label="Image URL" type="url" value={form.imageUrl} onChange={value => setForm(current => ({ ...current, imageUrl: value }))} /><Field label="Order" type="number" value={form.order} onChange={value => setForm(current => ({ ...current, order: Number(value) }))} /><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.published} onChange={event => setForm(current => ({ ...current, published: event.target.checked }))} />Publish immediately</label>{sanitizeImageUrl(form.imageUrl) && <img src={sanitizeImageUrl(form.imageUrl)} alt="New logo preview" className="h-20 max-w-full object-contain" />}<button disabled={processing} className="flex items-center gap-2 rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"><FaPlus />{processing ? 'Saving…' : 'Save logo'}</button></form>
            <section className="rounded-lg border bg-white p-5" aria-labelledby="logos-title"><div className="mb-4 flex items-center justify-between"><h2 id="logos-title" className="font-semibold">Stored logos</h2><button type="button" onClick={load} disabled={loading} className="rounded border px-3 py-1 text-sm">{loading ? 'Loading…' : 'Refresh'}</button></div>{loading ? <div role="status" className="p-8 text-center"><FaSpinner className="mx-auto animate-spin" />Loading logos…</div> : items.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No trusted logos saved.</p> : <div className="space-y-3">{items.map(item => editing?.id === item.id ? <form key={item.id} onSubmit={saveEdit} className="space-y-3 rounded border border-blue-300 p-4"><Field label="Company name" value={editing.name} onChange={value => setEditing(current => ({ ...current, name: value }))} /><Field label="Image URL" type="url" value={editing.imageUrl} onChange={value => setEditing(current => ({ ...current, imageUrl: value }))} /><Field label="Order" type="number" value={editing.order || 0} onChange={value => setEditing(current => ({ ...current, order: Number(value) }))} /><label className="flex gap-2 text-sm"><input type="checkbox" checked={editing.published !== false} onChange={event => setEditing(current => ({ ...current, published: event.target.checked }))} />Published</label><div className="flex gap-2"><button disabled={processing} className="flex items-center gap-1 rounded bg-blue-700 px-3 py-2 text-sm text-white"><FaSave />Save</button><button type="button" onClick={() => setEditing(null)} className="rounded border px-3 py-2 text-sm">Cancel</button></div></form> : <article key={item.id} className="flex flex-col gap-3 rounded border p-4 sm:flex-row sm:items-center"><div className="flex h-20 w-32 items-center justify-center rounded bg-slate-50">{sanitizeImageUrl(item.imageUrl) ? <img src={sanitizeImageUrl(item.imageUrl)} alt={`${item.name} logo`} className="max-h-16 max-w-28 object-contain" /> : <FaImage className="text-slate-400" />}</div><div className="min-w-0 flex-1"><h3 className="font-medium">{item.name}</h3><p className="text-xs text-slate-500">Order {item.order || 0} · {item.published === false ? 'Private draft' : 'Published'} · revision {item.revision}</p></div><div className="flex gap-2"><a href={sanitizeImageUrl(item.imageUrl)} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${item.name}`} className="rounded border p-2"><FaEye /></a><button type="button" onClick={() => setEditing({ ...item })} aria-label={`Edit ${item.name}`} className="rounded border p-2"><FaPen /></button><button type="button" onClick={() => setDeleteTarget(item)} aria-label={`Delete ${item.name}`} className="rounded border p-2 text-red-700"><FaTrash /></button></div></article>)}</div>}</section>
        </div>
    </div>;
};

const Field = ({ label, value, onChange, type = 'text' }) => { const id = useId(); return <label htmlFor={id} className="block text-sm font-medium">{label}<input id={id} required type={type} value={value} min={type === 'number' ? 0 : undefined} max={type === 'number' ? 10000 : undefined} onChange={event => onChange(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal" /></label>; };

export default TrustedBy;
