import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiCheck, FiFolder, FiLoader, FiPlus, FiRefreshCw, FiSave, FiTrash2 } from 'react-icons/fi';
import { fetchAdminWithReauth } from '../../../services/adminReauth';
import AdminDialog from '../shared/AdminDialog';
import './Phrases.scss';

function messageFor(response, data, fallback) {
  return data?.error?.message || data?.error || data?.message || `${fallback}${response?.status ? ` (HTTP ${response.status})` : ''}`;
}

export default function Phrases() {
  const [categories, setCategories] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [phrase, setPhrase] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmation, setConfirmation] = useState('');

  const selected = useMemo(() => categories.find(category => category.id === selectedId) || null, [categories, selectedId]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { response, data } = await fetchAdminWithReauth('/api/admin/phrases', { cache: 'no-store' });
      if (!response.ok) throw new Error(messageFor(response, data, 'Unable to load phrase categories.'));
      const next = Array.isArray(data.categories) ? data.categories : [];
      setCategories(next);
      setSelectedId(current => next.some(category => category.id === current) ? current : (next[0]?.id || ''));
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Unable to load phrase categories.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createCategory = async event => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const { response, data } = await fetchAdminWithReauth('/api/admin/phrases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: categoryName }),
      });
      if (!response.ok) throw new Error(messageFor(response, data, 'Unable to create phrase category.'));
      setCategoryName('');
      setNotice({ type: 'success', text: `Created ${data.category?.name || 'phrase category'} and recorded the administrative audit event.` });
      await load();
      if (data.category?.id) setSelectedId(data.category.id);
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Unable to create phrase category.' });
    } finally {
      setSaving(false);
    }
  };

  const addPhrase = async event => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setNotice(null);
    try {
      const { response, data } = await fetchAdminWithReauth(`/api/admin/phrases/${encodeURIComponent(selected.id)}/entries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phrase, expectedRevision: selected.revision }),
      });
      if (!response.ok) throw new Error(messageFor(response, data, 'Unable to save phrase.'));
      setPhrase('');
      setNotice({ type: 'success', text: 'Phrase saved and audited.' });
      await load();
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Unable to save phrase.' });
    } finally {
      setSaving(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget || confirmation !== deleteTarget.value) return;
    const targetCategory = categories.find(category => category.id === deleteTarget.categoryId);
    if (!targetCategory) return;
    setSaving(true);
    setNotice(null);
    try {
      const url = deleteTarget.kind === 'category'
        ? `/api/admin/phrases/${encodeURIComponent(targetCategory.id)}`
        : `/api/admin/phrases/${encodeURIComponent(targetCategory.id)}/entries`;
      const body = deleteTarget.kind === 'category'
        ? { expectedRevision: targetCategory.revision }
        : { phrase: deleteTarget.value, expectedRevision: targetCategory.revision };
      const { response, data } = await fetchAdminWithReauth(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(messageFor(response, data, `Unable to remove ${deleteTarget.kind}.`));
      setDeleteTarget(null);
      setConfirmation('');
      setNotice({ type: 'success', text: `${deleteTarget.kind === 'category' ? 'Category' : 'Phrase'} removed and audited.` });
      await load();
    } catch (error) {
      setNotice({ type: 'error', text: error.message || `Unable to remove ${deleteTarget.kind}.` });
    } finally {
      setSaving(false);
    }
  };

  const askDelete = (kind, value, categoryId) => {
    setConfirmation('');
    setDeleteTarget({ kind, value, categoryId });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo-600">Content operations</p><h1 className="mt-1 text-2xl font-extrabold text-slate-900">Phrase library</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Maintain reusable phrase categories through the trusted, revision-safe Admin API. Browser clients cannot write this collection directly.</p></div>
        <button type="button" onClick={load} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} />Refresh</button>
      </header>

      {notice && <div role={notice.type === 'success' ? 'status' : 'alert'} aria-live="polite" className={`flex gap-2 rounded-2xl border p-4 text-sm ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>{notice.type === 'success' ? <FiCheck className="mt-0.5 shrink-0 text-emerald-600" /> : <FiTrash2 className="mt-0.5 shrink-0 text-red-600" />}<span>{notice.text}</span></div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(16rem,0.85fr)_minmax(0,2fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs"><h2 className="text-sm font-extrabold text-slate-900">Categories</h2><form onSubmit={createCategory} className="mt-4 flex gap-2"><label className="sr-only" htmlFor="phrase-category-name">New category name</label><input id="phrase-category-name" value={categoryName} onChange={event => setCategoryName(event.target.value)} required maxLength={80} placeholder="e.g. achievements" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" /><button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 p-2 text-white hover:bg-indigo-700 disabled:opacity-50" aria-label="Create phrase category"><FiPlus /></button></form>{loading ? <div className="flex justify-center py-10 text-slate-500"><FiLoader className="animate-spin" /></div> : categories.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Create the first category to begin.</p> : <ul className="mt-4 space-y-1">{categories.map(category => <li key={category.id} className={`flex items-center gap-2 rounded-xl border p-2 ${selected?.id === category.id ? 'border-indigo-200 bg-indigo-50' : 'border-transparent hover:bg-slate-50'}`}><button type="button" onClick={() => setSelectedId(category.id)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-bold text-slate-800">{category.name}</span><span className="text-[11px] text-slate-500">{category.phrases.length} phrase{category.phrases.length === 1 ? '' : 's'}</span></button><button type="button" onClick={() => askDelete('category', category.name, category.id)} disabled={saving} className="rounded-lg p-2 text-rose-700 hover:bg-rose-100 disabled:opacity-50" aria-label={`Delete ${category.name}`}><FiTrash2 /></button></li>)}</ul>}</section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs"><div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><FiFolder className="text-indigo-600" />{selected?.name || 'Select a category'}</h2><p className="mt-1 text-xs text-slate-500">Every phrase change checks the latest category revision before it is persisted.</p></div>{selected && <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">Revision {selected.revision}</span>}</div>{selected ? <><form onSubmit={addPhrase} className="mt-5 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="phrase-entry">Phrase</label><input id="phrase-entry" value={phrase} onChange={event => setPhrase(event.target.value)} required maxLength={300} placeholder="Add a reusable phrase" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" /><button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? <FiLoader className="animate-spin" /> : <FiSave />}Save phrase</button></form><div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">{selected.phrases.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No phrases in this category yet.</p> : selected.phrases.map(item => <div key={item} className="flex items-center justify-between gap-4 p-3"><p className="min-w-0 break-words text-sm text-slate-800">{item}</p><button type="button" onClick={() => askDelete('phrase', item, selected.id)} disabled={saving} className="shrink-0 rounded-lg p-2 text-rose-700 hover:bg-rose-100 disabled:opacity-50" aria-label={`Remove phrase ${item}`}><FiTrash2 /></button></div>)}</div></> : <div className="flex min-h-48 items-center justify-center text-center text-sm text-slate-500">Choose a category to inspect and maintain its phrase library.</div>}</section>
      </div>

      <AdminDialog open={Boolean(deleteTarget)} onClose={() => !saving && setDeleteTarget(null)} dismissible={!saving} title={deleteTarget?.kind === 'category' ? 'Delete phrase category' : 'Remove phrase'} description={deleteTarget?.kind === 'category' ? 'This removes the selected category and all phrases it contains.' : 'This removes one phrase from the selected category.'} className="max-w-lg"><div className="space-y-4 p-5"><label className="block text-sm font-bold text-slate-800">Type <span className="font-mono text-rose-700">{deleteTarget?.value}</span> to confirm<input autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm" /></label><div className="flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" disabled={saving} onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Cancel</button><button type="button" disabled={saving || confirmation !== deleteTarget?.value} onClick={executeDelete} className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving && <FiLoader className="animate-spin" />}{saving ? 'Removing…' : 'Confirm removal'}</button></div></div></AdminDialog>
    </div>
  );
}
