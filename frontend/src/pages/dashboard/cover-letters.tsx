/**
 * Cover Letters Page
 *
 * List, create, and manage cover letters with AI-assisted generation.
 */

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSpinner } from '@/components/ui/loading';
import { get, del, post, normalizeError } from '@/lib/api-client';
import {
  FolderOpen,
  Plus,
  Trash2,
  Edit,
  Download,
  MoreVertical,
  Clock,
  FileText,
  Sparkles,
  X,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface CoverLetter {
  id: string;
  name: string;
  company: string;
  position: string;
  updatedAt: string;
  createdAt: string;
}

export function CoverLettersPage() {
  const [letters, setLetters] = useState<CoverLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  const fetchLetters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<{ covers: CoverLetter[] }>('/covers');
      setLetters(data.covers ?? []);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLetters(); }, [fetchLetters]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this cover letter?')) return;
    try {
      await del(`/covers/${id}`);
      setLetters((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      alert(normalizeError(err).message);
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Cover Letters</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {letters.length} cover letter{letters.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="size-4" />
          Create Cover Letter
        </Button>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700">
          <AlertCircle className="size-5 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={fetchLetters}>
            <RefreshCw className="size-3.5" /> Retry
          </Button>
        </div>
      )}

      {!error && letters.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-50">
              <FolderOpen className="size-8 text-brand-600" />
            </div>
            <h3 className="text-lg font-semibold text-ink">No cover letters yet</h3>
            <p className="mt-2 max-w-sm text-sm text-ink-muted">
              Create personalized cover letters for each job application with AI assistance.
            </p>
            <Button className="mt-6" onClick={() => setShowCreate(true)}>
              <Sparkles className="size-4" />
              Create with AI
            </Button>
          </CardContent>
        </Card>
      )}

      {letters.length > 0 && (
        <div className="space-y-3">
          {letters.map((letter) => (
            <div
              key={letter.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-neutral-25"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                <FileText className="size-5 text-brand-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{letter.name || 'Untitled Cover Letter'}</div>
                <div className="flex items-center gap-3 text-xs text-ink-muted">
                  {letter.company && <span>{letter.company}</span>}
                  {letter.position && <span>· {letter.position}</span>}
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatDate(letter.updatedAt || letter.createdAt)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm">
                  <Edit className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm">
                  <Download className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(letter.id)}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateCoverLetterModal onClose={() => setShowCreate(false)} onCreated={fetchLetters} />}
    </div>
  );
}

function CreateCoverLetterModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    position: '',
    jobDescription: '',
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await post('/covers/create', formData);
      onCreated();
      onClose();
    } catch (err) {
      alert(normalizeError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-dialog animate-[scale-in_200ms_ease-out]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Create Cover Letter</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink-muted hover:bg-neutral-100">
            <X className="size-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="cl-name" className="mb-1.5 block text-sm font-medium text-ink">Name *</label>
            <Input id="cl-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required placeholder="Cover Letter for Google" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cl-company" className="mb-1.5 block text-sm font-medium text-ink">Company</label>
              <Input id="cl-company" value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} placeholder="Google" />
            </div>
            <div>
              <label htmlFor="cl-position" className="mb-1.5 block text-sm font-medium text-ink">Position</label>
              <Input id="cl-position" value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} placeholder="Software Engineer" />
            </div>
          </div>
          <div>
            <label htmlFor="cl-jd" className="mb-1.5 block text-sm font-medium text-ink">Job Description (for AI)</label>
            <textarea
              id="cl-jd"
              value={formData.jobDescription}
              onChange={(e) => setFormData({ ...formData, jobDescription: e.target.value })}
              rows={4}
              className="flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
              placeholder="Paste the job description here for AI-tailored content…"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={saving}>
              <Sparkles className="size-4" />
              Create with AI
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}
