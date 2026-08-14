import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../../main';
import { createTrackedJob, deleteTrackedJob, getTrackedJobs, updateTrackedJob } from '../../firestore/dbOperations';
import { filterAndSortTrackedJobs, JOB_TRACKER_STATUSES, validateTrackedJob } from '../../utils/jobTracker';

const COLUMNS = Object.freeze([
    { id: 'wishlist', label: 'Wishlist' },
    { id: 'applied', label: 'Applied' },
    { id: 'interview', label: 'Interview' },
    { id: 'offer', label: 'Offer' },
    { id: 'rejected', label: 'Closed' },
]);
const EMPTY_FORM = Object.freeze({ title: '', company: '', location: '', url: '', notes: '', deadline: '', status: 'wishlist' });

export default function JobTracker({ showToast }) {
    const user = useContext(AuthContext);
    const [jobs, setJobs] = useState([]);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [retryCount, setRetryCount] = useState(0);
    const [draggedId, setDraggedId] = useState(null);

    useEffect(() => {
        let active = true;
        setJobs([]);
        setForm(EMPTY_FORM);
        setEditingId(null);
        setShowForm(false);
        setErrors({});
        if (!user?.uid) {
            setLoading(false);
            return () => { active = false; };
        }
        setLoading(true);
        setLoadError('');
        getTrackedJobs(user.uid)
            .then((result) => { if (active) setJobs(result); })
            .catch((error) => {
                if (!active) return;
                console.error('Unable to load job tracker', error);
                setLoadError('Your job tracker could not be loaded.');
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [user?.uid, retryCount]);

    const formDirty = showForm && (Boolean(editingId) || Object.entries(form).some(([key, value]) => key !== 'status' && Boolean(value)));
    useEffect(() => {
        const warn = (event) => {
            if (!formDirty) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [formDirty]);

    const visibleJobs = useMemo(() => filterAndSortTrackedJobs(jobs, search), [jobs, search]);

    const closeForm = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setErrors({});
        setShowForm(false);
    };

    const submit = async (event) => {
        event.preventDefault();
        const validation = validateTrackedJob(form);
        setErrors(validation.errors);
        if (!validation.valid || !user?.uid) return;
        setSaving(true);
        try {
            if (editingId) {
                await updateTrackedJob(user.uid, editingId, validation.job);
                setJobs((current) => current.map((job) => job.id === editingId ? { ...job, ...validation.job, updatedAt: new Date() } : job));
            } else {
                const created = await createTrackedJob(user.uid, { ...validation.job, order: jobs.filter((job) => job.status === validation.job.status).length });
                setJobs((current) => [...current, created]);
            }
            showToast?.(editingId ? 'Tracked job updated' : 'Job added to tracker', 'success');
            closeForm();
        } catch (error) {
            setErrors({ form: error.message || 'The job could not be saved' });
        } finally {
            setSaving(false);
        }
    };

    const startEditing = (job) => {
        setForm({
            title: job.title || '', company: job.company || '', location: job.location || '',
            url: job.url || '', notes: job.notes || '', deadline: job.deadline || '', status: job.status || 'wishlist',
        });
        setEditingId(job.id);
        setErrors({});
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const moveJob = async (jobId, status) => {
        if (!user?.uid || !JOB_TRACKER_STATUSES.includes(status)) return;
        const existing = jobs.find((job) => job.id === jobId);
        if (!existing || existing.status === status) return;
        const previous = jobs;
        const order = jobs.filter((job) => job.status === status).length;
        setJobs((current) => current.map((job) => job.id === jobId ? { ...job, status, order, updatedAt: new Date() } : job));
        try {
            await updateTrackedJob(user.uid, jobId, { status, order });
            showToast?.(`Moved to ${COLUMNS.find((column) => column.id === status)?.label}`, 'success');
        } catch (error) {
            setJobs(previous);
            showToast?.(error.message || 'Unable to move job', 'error');
        }
    };

    const removeJob = async (job) => {
        if (!user?.uid || !window.confirm(`Delete ${job.title} at ${job.company}?`)) return;
        try {
            await deleteTrackedJob(user.uid, job.id);
            setJobs((current) => current.filter((item) => item.id !== job.id));
            showToast?.('Tracked job deleted', 'success');
        } catch (error) {
            showToast?.(error.message || 'Unable to delete job', 'error');
        }
    };

    if (!user?.uid) return <main className="p-8 text-center text-slate-600">Sign in to use your private job tracker.</main>;
    if (loading) return <main className="min-h-64 flex items-center justify-center" aria-busy="true"><p role="status">Loading job tracker…</p></main>;
    if (loadError) return (
        <main className="min-h-64 flex items-center justify-center px-4">
            <div role="alert" className="text-center">
                <p className="text-slate-700 mb-3">{loadError}</p>
                <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Try again</button>
            </div>
        </main>
    );

    return (
        <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
            <div className="mx-auto max-w-[1600px]">
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">Job Tracker</h1>
                        <p className="mt-1 text-sm text-slate-600">Keep personal opportunities organized. Employer application statuses remain separate.</p>
                    </div>
                    <button type="button" onClick={() => { closeForm(); setShowForm(true); }} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">Add job</button>
                </div>

                {showForm && (
                    <form onSubmit={submit} className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" noValidate>
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit tracked job' : 'Add a job'}</h2>
                            <button type="button" onClick={closeForm} className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
                        </div>
                        {errors.form && <p role="alert" className="mb-3 text-sm text-red-700">{errors.form}</p>}
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <label className="text-sm font-medium text-slate-700">Job title *
                                <input autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} aria-invalid={Boolean(errors.title)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
                                {errors.title && <span className="text-xs text-red-700">{errors.title}</span>}
                            </label>
                            <label className="text-sm font-medium text-slate-700">Company *
                                <input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} aria-invalid={Boolean(errors.company)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
                                {errors.company && <span className="text-xs text-red-700">{errors.company}</span>}
                            </label>
                            <label className="text-sm font-medium text-slate-700">Location
                                <input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
                            </label>
                            <label className="text-sm font-medium text-slate-700">Stage
                                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal">
                                    {COLUMNS.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}
                                </select>
                            </label>
                            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Job link
                                <input type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} aria-invalid={Boolean(errors.url)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" placeholder="https://…" />
                                {errors.url && <span className="text-xs text-red-700">{errors.url}</span>}
                            </label>
                            <label className="text-sm font-medium text-slate-700">Deadline
                                <input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
                            </label>
                            <label className="text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-4">Notes
                                <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows="3" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
                            </label>
                        </div>
                        <button type="submit" disabled={saving} className="mt-4 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add to tracker'}</button>
                    </form>
                )}

                <label htmlFor="tracker-search" className="sr-only">Search tracked jobs</label>
                <input id="tracker-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, company, location, or notes" className="mb-4 w-full max-w-xl rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />

                <div className="grid gap-4 overflow-x-auto pb-4 lg:grid-cols-5" aria-label="Job tracker board">
                    {COLUMNS.map((column) => {
                        const columnJobs = visibleJobs.filter((job) => job.status === column.id);
                        return (
                            <section key={column.id} aria-labelledby={`tracker-column-${column.id}`} className="min-w-[280px] rounded-xl border border-slate-200 bg-slate-100/70 p-3"
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={() => { if (draggedId) moveJob(draggedId, column.id); setDraggedId(null); }}>
                                <div className="mb-3 flex items-center justify-between">
                                    <h2 id={`tracker-column-${column.id}`} className="font-semibold text-slate-800">{column.label}</h2>
                                    <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">{columnJobs.length}</span>
                                </div>
                                <div className="space-y-3">
                                    {columnJobs.map((job) => (
                                        <article key={job.id} draggable onDragStart={() => setDraggedId(job.id)} onDragEnd={() => setDraggedId(null)} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                                            <h3 className="font-semibold text-slate-900">{job.title}</h3>
                                            <p className="text-sm text-slate-600">{job.company}{job.location ? ` · ${job.location}` : ''}</p>
                                            {job.deadline && <p className="mt-2 text-xs text-slate-500">Deadline: {job.deadline}</p>}
                                            {job.notes && <p className="mt-2 line-clamp-3 text-xs text-slate-600">{job.notes}</p>}
                                            <label className="mt-3 block text-xs font-medium text-slate-600">Move to
                                                <select value={job.status} onChange={(event) => moveJob(job.id, event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm font-normal">
                                                    {COLUMNS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                                                </select>
                                            </label>
                                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                                {job.url && <a href={job.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline">Open job</a>}
                                                <button type="button" onClick={() => startEditing(job)} className="font-medium text-slate-700 hover:underline">Edit</button>
                                                <button type="button" onClick={() => removeJob(job)} className="font-medium text-red-700 hover:underline">Delete</button>
                                            </div>
                                        </article>
                                    ))}
                                    {columnJobs.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">Drop a job here</p>}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>
        </main>
    );
}
