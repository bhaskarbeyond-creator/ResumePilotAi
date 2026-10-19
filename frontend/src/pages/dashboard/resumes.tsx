/**
 * Resumes List Page
 *
 * Displays user's resumes with live template thumbnails, Cuba glassmorphism,
 * interactive PreviewModal, ShareModal, export triggers, and CRUD operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/loading';
import { get, del, normalizeError } from '@/lib/api-client';
import { getTemplateMeta } from '@/lib/template-catalog';
import { PreviewModal } from '@/components/ui/preview-modal';
import { ShareModal } from '@/components/ui/share-modal';
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
  Sparkles,
} from 'lucide-react';

interface Resume {
  id: string;
  name: string;
  template: string;
  updatedAt: string;
  createdAt: string;
  completeness?: number;
  data?: any;
}

export function ResumesPage() {
  const navigate = useNavigate();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  // Modal states
  const [previewResume, setPreviewResume] = useState<any | null>(null);
  const [shareResume, setShareResume] = useState<{ id: string; name: string; template: string } | null>(null);

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

  useEffect(() => {
    fetchResumes();
  }, [fetchResumes]);

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

  const handleOpenPreview = async (resume: Resume) => {
    setActionMenuId(null);
    // If resume.data is already present, use it; otherwise fetch complete record
    try {
      const full = await get<{ resume: any }>(`/resumes/${resume.id}`);
      const raw = full.resume || resume;
      const parsedData = typeof raw.data === 'string' ? JSON.parse(raw.data) : (raw.data || {});
      setPreviewResume({
        id: raw.id || resume.id,
        name: raw.name || resume.name,
        template: raw.template || resume.template || 'Cv1',
        heading: parsedData.heading || {
          firstName: parsedData.firstName || 'Candidate',
          lastName: parsedData.lastName || 'Name',
          email: parsedData.email || '',
          phone: parsedData.phone || '',
          location: parsedData.location || '',
          title: parsedData.title || '',
        },
        experience: parsedData.experience || [],
        education: parsedData.education || [],
        skillCategories: parsedData.skillCategories || [],
        summary: parsedData.summary || '',
        certifications: parsedData.certifications || [],
        projects: parsedData.projects || [],
        languages: parsedData.languages || [],
      });
    } catch {
      // Fallback preview
      setPreviewResume({
        id: resume.id,
        name: resume.name,
        template: resume.template || 'Cv1',
        heading: {
          firstName: resume.name || 'Candidate',
          lastName: '',
          email: '',
          phone: '',
          location: '',
          title: '',
        },
        experience: [],
        education: [],
        skillCategories: [],
        summary: '',
      });
    }
  };

  const handleDownloadPdf = (resume: Resume) => {
    setActionMenuId(null);
    const templateId = resume.template || 'Cv1';
    window.open(`/export/${templateId}/${resume.id}/en`, '_blank');
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">My Resumes</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {resumes.length} saved resume{resumes.length !== 1 ? 's' : ''} with 51 canonical templates
          </p>
        </div>
        <Button asChild className="gap-2 shadow-sm">
          <Link to="/build-resume">
            <Plus className="size-4" />
            Create New Resume
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
              Create your first professional resume using our AI-powered builder with 51+ high-fidelity templates.
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
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {resumes.map((resume) => {
            const templateId = resume.template || 'Cv1';
            const meta = getTemplateMeta(templateId);

            return (
              <Card
                key={resume.id}
                className="group relative flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-xl"
              >
                {/* Resume visual thumbnail */}
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-100">
                  <img
                    src={meta.thumbnail}
                    alt={`${meta.name} preview`}
                    className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => {
                      // Fallback if image fails to load
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />

                  {/* Template Chip Badge */}
                  <div className="absolute top-2.5 left-2.5 z-10">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-neutral-800 shadow-sm backdrop-blur-md">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: meta.primary }}
                      />
                      {meta.id} · {meta.name}
                    </span>
                  </div>

                  {/* Hover overlay with action buttons */}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-neutral-950/65 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="bg-white/95 font-medium text-ink hover:bg-white shadow-md gap-1"
                      onClick={() => navigate(`/build-resume/${resume.id}`)}
                    >
                      <Edit className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="bg-white/95 font-medium text-ink hover:bg-white shadow-md gap-1"
                      onClick={() => void handleOpenPreview(resume)}
                    >
                      <Eye className="size-3.5 text-brand-600" />
                      Preview
                    </Button>
                  </div>
                </div>

                {/* Resume details */}
                <CardContent className="flex flex-1 flex-col justify-between p-3.5 bg-surface">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-ink hover:text-brand-600 transition-colors">
                        <Link to={`/build-resume/${resume.id}`}>
                          {resume.name || 'Untitled Resume'}
                        </Link>
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
                            className="fixed inset-0 z-20"
                            onClick={() => setActionMenuId(null)}
                          />
                          <div className="absolute right-0 top-8 z-30 w-44 rounded-xl border border-border bg-surface py-1.5 shadow-2xl">
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-neutral-50"
                              onClick={() => { navigate(`/build-resume/${resume.id}`); setActionMenuId(null); }}
                            >
                              <Edit className="size-3.5 text-ink-muted" />
                              Edit Resume
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-neutral-50"
                              onClick={() => void handleOpenPreview(resume)}
                            >
                              <Eye className="size-3.5 text-brand-600" />
                              View Preview
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-neutral-50"
                              onClick={() => handleDownloadPdf(resume)}
                            >
                              <Download className="size-3.5 text-emerald-600" />
                              Download PDF
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-neutral-50"
                              onClick={() => {
                                setShareResume({
                                  id: resume.id,
                                  name: resume.name,
                                  template: templateId,
                                });
                                setActionMenuId(null);
                              }}
                            >
                              <Share2 className="size-3.5 text-indigo-600" />
                              Share Link
                            </button>
                            <div className="my-1 border-t border-border" />
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-error-600 hover:bg-error-50"
                              onClick={() => handleDelete(resume.id)}
                              disabled={deleteLoading === resume.id}
                            >
                              <Trash2 className="size-3.5" />
                              {deleteLoading === resume.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick Card Footer */}
                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-ink-muted">
                    <span className="truncate">{meta.archetype.replace('-', ' ')}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setShareResume({
                          id: resume.id,
                          name: resume.name,
                          template: templateId,
                        });
                      }}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      Share
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Global PreviewModal */}
      {previewResume && (
        <PreviewModal
          open={!!previewResume}
          onOpenChange={(open) => {
            if (!open) setPreviewResume(null);
          }}
          resume={previewResume}
          onTemplateChange={(tmplId) => {
            setPreviewResume((prev: any) => prev ? { ...prev, template: tmplId } : null);
          }}
        />
      )}

      {/* Global ShareModal */}
      {shareResume && (
        <ShareModal
          open={!!shareResume}
          onOpenChange={(open) => {
            if (!open) setShareResume(null);
          }}
          resumeId={shareResume.id}
          resumeName={shareResume.name}
          templateId={shareResume.template}
        />
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
