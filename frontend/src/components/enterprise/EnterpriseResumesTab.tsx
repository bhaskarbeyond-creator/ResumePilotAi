/**
 * Enterprise Resumes Tab (Candidate Talent Pool & Shared CVs)
 *
 * Bulk candidate resume management, multi-candidate scoring, filtering,
 * candidate identity grouping, ATS score distribution, and PDF evaluation drawer.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Search,
  Filter,
  Eye,
  Trash2,
  Download,
  Star,
  Users,
  Layers,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEnterprise } from './EnterpriseContext';
import { HelpTooltip } from './HelpTooltip';
import { EnterpriseConfirmModal } from './EnterpriseConfirmModal';
import { EnterpriseResumePdfModal } from './EnterpriseResumePdfModal';
import { enterpriseApi, type EnterpriseResource } from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

function getCandidateName(resource: EnterpriseResource): string {
  const p = (resource.payload || {}) as Record<string, unknown>;
  const personalInfo = (p.personalInfo || {}) as Record<string, unknown>;
  return String(
    personalInfo.fullName ||
    (p.firstname || p.lastname ? `${p.firstname || ''} ${p.lastname || ''}`.trim() : '') ||
    resource.candidateName ||
    `Candidate #${resource.id.slice(0, 6)}`
  );
}

function getJobTitle(resource: EnterpriseResource): string {
  const p = (resource.payload || {}) as Record<string, unknown>;
  const personalInfo = (p.personalInfo || {}) as Record<string, unknown>;
  return String(
    personalInfo.jobTitle ||
    p.jobTitle ||
    p.occupation ||
    p.positionTitle ||
    resource.jobTitle ||
    'Executive Professional'
  );
}

function getAtsScore(resource: EnterpriseResource): number {
  const p = (resource.payload || {}) as Record<string, unknown>;
  const score = Number(resource.atsScore ?? p.atsScore ?? p.score);
  return Number.isFinite(score) && score > 0 ? Math.min(100, Math.max(0, score)) : 85;
}

export function EnterpriseResumesTab() {
  const { tenant, hasPermission } = useEnterprise();
  const [resources, setResources] = useState<EnterpriseResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [atsFilter, setAtsFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [previewResource, setPreviewResource] = useState<EnterpriseResource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnterpriseResource | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const canManageResources = hasPermission('resource.update');

  const loadResources = useCallback(async () => {
    if (!tenant?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await enterpriseApi.getResources(tenant.id, 'resume');
      setResources(res.resources || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch candidate resumes';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  // Filtered resources
  const filtered = useMemo(() => {
    return resources.filter((r) => {
      const name = getCandidateName(r).toLowerCase();
      const role = getJobTitle(r).toLowerCase();
      const owner = (r.ownerEmail || r.ownerPrincipalId || '').toLowerCase();
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || name.includes(q) || role.includes(q) || owner.includes(q);

      const ats = getAtsScore(r);
      let matchesAts = true;
      if (atsFilter === 'HIGH') matchesAts = ats >= 80;
      else if (atsFilter === 'MEDIUM') matchesAts = ats >= 60 && ats < 80;
      else if (atsFilter === 'LOW') matchesAts = ats < 60;

      return matchesSearch && matchesAts;
    });
  }, [resources, searchQuery, atsFilter]);

  // Group by candidate identity
  interface CandidateGroup {
    key: string;
    candidateName: string;
    ownerEmail: string | null;
    resumes: EnterpriseResource[];
    bestAts: number;
    roles: string[];
    latestUpdated: string;
  }

  const grouped = useMemo(() => {
    const map = new Map<string, CandidateGroup>();

    for (const r of filtered) {
      const email = (r.ownerEmail || '').trim().toLowerCase();
      const name = getCandidateName(r).trim();
      const key = email || `name:${name.toLowerCase()}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          candidateName: name,
          ownerEmail: r.ownerEmail || null,
          resumes: [],
          bestAts: 0,
          roles: [],
          latestUpdated: r.updatedAt || r.createdAt || '',
        });
      }

      const g = map.get(key)!;
      g.resumes.push(r);
      const ats = getAtsScore(r);
      if (ats > g.bestAts) g.bestAts = ats;
      const role = getJobTitle(r);
      if (role && !g.roles.includes(role)) g.roles.push(role);
      if (new Date(r.updatedAt || r.createdAt) > new Date(g.latestUpdated)) {
        g.latestUpdated = r.updatedAt || r.createdAt;
      }
    }

    return Array.from(map.values());
  }, [filtered]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !tenant?.id) return;
    setBusyDelete(true);
    try {
      await enterpriseApi.deleteResource(tenant.id, deleteTarget.id);
      setDeleteTarget(null);
      await loadResources();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setBusyDelete(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ─── Search, Filters & View Toggle ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface-raised/60 backdrop-blur-md border border-edge rounded-xl p-3 shadow-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-muted" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search talent by candidate name, target role, or email…"
              className="pl-9 text-xs h-9 bg-surface border-edge"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* ATS Filter Pills */}
          <div className="flex items-center gap-1 border border-edge rounded-lg p-0.5 bg-surface text-xs font-semibold">
            {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setAtsFilter(filter)}
                className={cn(
                  'px-2.5 py-1 rounded-md transition-colors',
                  atsFilter === filter
                    ? 'bg-accent text-white shadow-2xs'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                {filter === 'ALL' && 'All Scores'}
                {filter === 'HIGH' && 'ATS ≥80'}
                {filter === 'MEDIUM' && 'ATS 60–79'}
                {filter === 'LOW' && 'ATS <60'}
              </button>
            ))}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 border border-edge rounded-lg p-0.5 bg-surface text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              className={cn(
                'px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5',
                viewMode === 'grouped' ? 'bg-accent text-white shadow-2xs' : 'text-ink-muted hover:text-ink',
              )}
            >
              <Users className="size-3.5" />
              Candidate Club
            </button>
            <button
              type="button"
              onClick={() => setViewMode('flat')}
              className={cn(
                'px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5',
                viewMode === 'flat' ? 'bg-accent text-white shadow-2xs' : 'text-ink-muted hover:text-ink',
              )}
            >
              <Layers className="size-3.5" />
              All Resumes
            </button>
          </div>
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
                <FileText className="size-4 text-accent" />
                Enterprise Candidate Talent Pool
                <HelpTooltip text="All resumes and executive CVs created or shared across organizational workspaces with live ATS scoring." />
              </CardTitle>
              <CardDescription className="text-xs text-ink-muted mt-0.5">
                Showing {filtered.length} active documents across {grouped.length} candidate profiles.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {loading ? (
            <div className="py-12 text-center text-xs text-ink-muted">
              Loading enterprise resume repository…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-ink-muted border border-dashed border-edge rounded-xl">
              No candidate resumes matching the applied search or filter criteria.
            </div>
          ) : viewMode === 'grouped' ? (
            /* ─── Grouped Candidate View ─── */
            <div className="space-y-3">
              {grouped.map((group) => {
                const isExpanded = expandedKeys.has(group.key);
                return (
                  <div
                    key={group.key}
                    className="border border-edge rounded-xl overflow-hidden bg-surface/60 transition-colors"
                  >
                    <div
                      onClick={() => toggleExpand(group.key)}
                      className="p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-surface-raised/60 select-none"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          className="text-ink-muted hover:text-ink p-1"
                          aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>
                        <div className="size-9 rounded-xl bg-accent-soft flex items-center justify-center font-bold text-accent text-sm shrink-0">
                          {group.candidateName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-ink truncate">
                              {group.candidateName}
                            </h4>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              <Star className="size-3 fill-emerald-600" />
                              Best ATS: {group.bestAts}%
                            </span>
                            <span className="text-[11px] font-mono text-ink-muted">
                              ({group.resumes.length} document{group.resumes.length === 1 ? '' : 's'})
                            </span>
                          </div>
                          <div className="text-xs text-ink-muted mt-0.5 flex flex-wrap items-center gap-2">
                            <span>{group.roles.join(', ') || 'Professional'}</span>
                            {group.ownerEmail && (
                              <span>• {group.ownerEmail}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewResource(group.resumes[0]);
                          }}
                          className="text-xs"
                        >
                          <Eye className="size-3.5 mr-1" />
                          Preview Latest
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-edge/60 bg-surface-raised/30 divide-y divide-edge/40">
                        {group.resumes.map((r) => {
                          const ats = getAtsScore(r);
                          return (
                            <div
                              key={r.id}
                              className="px-6 py-3 flex items-center justify-between text-xs gap-3 hover:bg-surface-raised/50"
                            >
                              <div className="min-w-0">
                                <div className="font-semibold text-ink flex items-center gap-2">
                                  <span>{getJobTitle(r)}</span>
                                  <span className="font-mono text-[11px] text-ink-muted">
                                    #{r.id.slice(0, 8)}
                                  </span>
                                  <span className="text-emerald-600 font-bold">
                                    ATS {ats}%
                                  </span>
                                </div>
                                <div className="text-[11px] text-ink-muted mt-0.5">
                                  Template: {r.template || 'Cv1'} · Updated {new Date(r.updatedAt || r.createdAt).toLocaleDateString()}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setPreviewResource(r)}
                                  className="size-7 p-0"
                                  title="View full resume drawer"
                                >
                                  <Eye className="size-3.5" />
                                </Button>
                                {canManageResources && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setDeleteTarget(r)}
                                    className="size-7 p-0 text-rose-500 hover:text-rose-600"
                                    title="Delete document"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* ─── Flat Table View ─── */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-edge text-ink-muted font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3">Candidate</th>
                    <th className="py-3 px-3">Target Role</th>
                    <th className="py-3 px-3">ATS Score</th>
                    <th className="py-3 px-3">Template</th>
                    <th className="py-3 px-3">Updated</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {filtered.map((r) => {
                    const name = getCandidateName(r);
                    const role = getJobTitle(r);
                    const ats = getAtsScore(r);
                    return (
                      <tr key={r.id} className="hover:bg-surface-raised/40 transition-colors">
                        <td className="py-3 px-3 font-semibold text-ink">
                          {name}
                          {r.ownerEmail && (
                            <div className="text-[11px] font-normal text-ink-muted">{r.ownerEmail}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-ink-muted">{role}</td>
                        <td className="py-3 px-3">
                          <span className={cn(
                            'font-bold inline-flex items-center px-2 py-0.5 rounded text-[11px]',
                            ats >= 80 ? 'bg-emerald-500/10 text-emerald-600' : ats >= 60 ? 'bg-amber-500/10 text-amber-600' : 'bg-rose-500/10 text-rose-600',
                          )}>
                            {ats}%
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-ink-muted">{r.template || 'Cv1'}</td>
                        <td className="py-3 px-3 text-ink-muted">{new Date(r.updatedAt || r.createdAt).toLocaleDateString()}</td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPreviewResource(r)}
                              className="size-7 p-0"
                            >
                              <Eye className="size-3.5" />
                            </Button>
                            {canManageResources && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteTarget(r)}
                                className="size-7 p-0 text-rose-500 hover:text-rose-600"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Preview Modal ─── */}
      <EnterpriseResumePdfModal
        isOpen={Boolean(previewResource)}
        resume={previewResource}
        onClose={() => setPreviewResource(null)}
      />

      {/* ─── Delete Confirmation Modal ─── */}
      <EnterpriseConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete Enterprise Resume"
        message={`Are you sure you want to permanently delete this resume for "${deleteTarget ? getCandidateName(deleteTarget) : ''}"? This action cannot be undone.`}
        confirmLabel="Delete Resume"
        variant="danger"
        busy={busyDelete}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default EnterpriseResumesTab;
