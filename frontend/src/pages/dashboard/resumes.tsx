/**
 * Resumes List Page
 *
 * Displays user's resumes with actions: create, edit, delete, export, share.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageSpinner, Skeleton } from '@/components/ui/loading';
import { get, del, normalizeError, type ApiError } from '@/lib/api-client';
import {
  Plus,
  FileText,
  MoreVertical,
  Edit,
  Trash2,
  Download,
  Share2,
  Eye,
  Clock,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface Resume {
  id: string;
  name: string;
  template: string;
  updatedAt: string;
  createdAt: string;
  completeness?: number;
}

export function ResumesPage() {
  const navigate = useNavigate();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const fetchResumes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<{ resumes: Resume[] }>('/resumes');
      setResumes(data.resumes ?? []);
    } catch (err) {
      const apiErr = normalizeError(err);
      setError(apiErr.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchResumes(); }, [fetchResumes]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this resume?')) return;
    setDeleteLoading(id);
    try {
      await del(`/resumes/${id}`);
      setResumes((prev) => prev.filter((r) => r.id !== id));
      setActionMenuId(null);
    } catch (err) {
      const apiErr = normalizeError(err);
      alert(`Failed to delete: ${apiErr.message}`);
    } finally {
      setDeleteLoading(null);
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">My Resumes</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {resumes.length} resume{resumes.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button asChild>
          <Link to="/build-resume">
            <Plus className="size-4" />
            Create Resume
          </Link>
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700">
          <AlertCircle className="size-5 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={fetchResumes}>
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!error && resumes.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-50">
              <FileText className="size-8 text-brand-600" />
            </div>
            <h3 className="text-lg font-semibold text-ink">No resumes yet</h3>
            <p className="mt-2 max-w-sm text-sm text-ink-muted">
              Create your first professional resume using our AI-powered builder with 51+ templates.
            </p>
            <Button className="mt-6" asChild>
              <Link to="/build-resume">
                <Plus className="size-4" />
                Create Your First Resume
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Resume grid */}
      {resumes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {resumes.map((resume) => (
            <Card
              key={resume.id}
              className="group relative overflow-hidden transition-all hover:border-brand-200 hover:shadow-md"
            >
              {/* Resume preview area */}
              <div className="relative aspect-[3/4] bg-neutral-50 p-4">
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <FileText className="mb-2 size-10 text-ink-subtle" />
                  <span className="text-xs text-ink-muted">{resume.template || 'Default'}</span>
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-neutral-950/60 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="bg-white/90 text-ink hover:bg-white"
                    onClick={() => navigate(`/build-resume/${resume.id}`)}
                  >
                    <Edit className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="bg-white/90 text-ink hover:bg-white"
                  >
                    <Eye className="size-3.5" />
                    Preview
                  </Button>
                </div>
              </div>

              {/* Resume info */}
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-ink">
                      {resume.name || 'Untitled Resume'}
                    </h3>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                      <Clock className="size-3" />
                      <span>{formatDate(resume.updatedAt || resume.createdAt)}</span>
                    </div>
                  </div>

                  {/* Actions menu */}
                  <div className="relative">
                    <button
                      className="rounded-md p-1 text-ink-muted hover:bg-neutral-100 hover:text-ink transition-colors"
                      onClick={() => setActionMenuId(actionMenuId === resume.id ? null : resume.id)}
                      aria-label="Resume actions"
                    >
                      <MoreVertical className="size-4" />
                    </button>

                    {actionMenuId === resume.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setActionMenuId(null)}
                        />
                        <div className="absolute right-0 top-8 z-20 w-44 rounded-lg border border-border bg-surface py-1 shadow-lg">
                          <button
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-neutral-50"
                            onClick={() => { navigate(`/build-resume/${resume.id}`); setActionMenuId(null); }}
                          >
                            <Edit className="size-4 text-ink-muted" />
                            Edit
                          </button>
                          <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-neutral-50">
                            <Download className="size-4 text-ink-muted" />
                            Download
                          </button>
                          <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-neutral-50">
                            <Share2 className="size-4 text-ink-muted" />
                            Share
                          </button>
                          <div className="my-1 border-t border-border" />
                          <button
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-error-600 hover:bg-error-50"
                            onClick={() => handleDelete(resume.id)}
                            disabled={deleteLoading === resume.id}
                          >
                            <Trash2 className="size-4" />
                            {deleteLoading === resume.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Unknown';
  }
}
