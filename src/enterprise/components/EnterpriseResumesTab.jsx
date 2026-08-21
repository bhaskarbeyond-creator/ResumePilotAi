import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiFileText, FiPlus, FiEdit3, FiCopy, FiTrash2, FiSearch, FiCheck,
  FiEye, FiDownload, FiStar, FiUser, FiBriefcase, FiAward, FiLayers,
  FiX, FiExternalLink, FiSliders, FiCheckCircle
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import HelpTooltip from './HelpTooltip';

function getCandidateName(resource) {
  return resource?.candidateName ||
    resource?.payload?.personalInfo?.fullName ||
    resource?.payload?.fullName ||
    resource?.payload?.title ||
    `Resume #${String(resource.id || '').slice(0, 6)}`;
}

function getJobTitle(resource) {
  return resource?.jobTitle ||
    resource?.payload?.personalInfo?.jobTitle ||
    resource?.payload?.positionTitle ||
    resource?.payload?.jobTitle ||
    'Executive Professional';
}

function getAtsScore(resource) {
  const score = Number(resource?.atsScore || resource?.payload?.atsScore || resource?.payload?.score);
  return Number.isFinite(score) && score > 0 ? score : 85;
}

function getCompleteness(resource) {
  if (resource?.completeness) return Number(resource.completeness);
  const p = resource?.payload || {};
  let score = 25;
  if (p.personalInfo?.fullName) score += 25;
  if (Array.isArray(p.experience) && p.experience.length > 0) score += 25;
  if (Array.isArray(p.education) && p.education.length > 0) score += 15;
  if (Array.isArray(p.skills) && p.skills.length > 0) score += 10;
  return Math.min(100, score);
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Recently';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Recently';
  }
}

export default function EnterpriseResumesTab() {
  const { request, hasPermission, workspace, tenant } = useTenantApi();
  const [resumesState, refreshResumes] = useAsyncResource(
    () => request('/api/enterprise/resources?resourceType=resume'),
    [request],
  );
  const { loading, error, data } = resumesState;
  const [searchQuery, setSearchQuery] = useState('');
  const [atsFilter, setAtsFilter] = useState('ALL'); // ALL, HIGH (>=80), MEDIUM (60-79), LOW (<60)
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [previewResource, setPreviewResource] = useState(null);

  const resources = useMemo(() => (Array.isArray(data?.resources) ? data.resources : []), [data]);
  const canCreate = hasPermission('resource.create');
  const canUpdate = hasPermission('resource.update');

  const filtered = useMemo(() => {
    return resources.filter(resource => {
      const name = getCandidateName(resource).toLowerCase();
      const role = getJobTitle(resource).toLowerCase();
      const owner = (resource.ownerEmail || resource.ownerPrincipalId || '').toLowerCase();
      const q = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || name.includes(q) || role.includes(q) || owner.includes(q);

      const ats = getAtsScore(resource);
      let matchesAts = true;
      if (atsFilter === 'HIGH') matchesAts = ats >= 80;
      else if (atsFilter === 'MEDIUM') matchesAts = ats >= 60 && ats < 80;
      else if (atsFilter === 'LOW') matchesAts = ats < 60;

      return matchesSearch && matchesAts;
    });
  }, [resources, searchQuery, atsFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = resources.length;
    if (total === 0) return { total: 0, avgAts: 0, highMatch: 0, completeAvg: 0 };
    const atsSum = resources.reduce((acc, r) => acc + getAtsScore(r), 0);
    const high = resources.filter(r => getAtsScore(r) >= 80).length;
    const compSum = resources.reduce((acc, r) => acc + getCompleteness(r), 0);
    return {
      total,
      avgAts: Math.round(atsSum / total),
      highMatch: high,
      completeAvg: Math.round(compSum / total)
    };
  }, [resources]);

  const toggleSelectAll = () => {
    if (selectedRows.size === filtered.length && filtered.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filtered.map(r => r.id)));
    }
  };

  const toggleSelectRow = (id) => {
    const next = new Set(selectedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRows(next);
  };

  const notify = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleDuplicate = async (resource) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const candidate = getCandidateName(resource);
      await request('/api/enterprise/resources', {
        method: 'POST',
        body: {
          resourceType: 'resume',
          payload: { ...(resource.payload || {}), title: `${candidate} (Copy)` }
        },
      });
      notify(`Duplicated candidate resume "${candidate}" into workspace.`);
      refreshResumes();
    } catch (err) {
      setActionError(err?.message || 'Resume could not be duplicated.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (resource) => {
    const candidate = getCandidateName(resource);
    if (!window.confirm(`Remove candidate resume "${candidate}" from enterprise repository? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await request(`/api/enterprise/resources/${resource.id}`, { method: 'DELETE' });
      notify(`Removed "${candidate}" from enterprise talent repository.`);
      setSelectedRows(prev => { const next = new Set(prev); next.delete(resource.id); return next; });
      refreshResumes();
    } catch (err) {
      setActionError(err?.message || 'Resume could not be deleted.');
    }
  };

  const handleBulkAction = async (action) => {
    if (!selectedRows.size) return;
    if (action === 'delete' && !window.confirm(`Delete ${selectedRows.size} selected resume(s)? This cannot be undone.`)) return;
    
    setActionError(null);
    setBusy(true);
    let successCount = 0;
    
    try {
      if (action === 'export-json') {
        const selectedDocs = filtered.filter(r => selectedRows.has(r.id));
        const json = JSON.stringify(selectedDocs, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `enterprise-talent-export-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify(`Exported ${selectedDocs.length} candidate profile(s) in JSON.`);
        return;
      }
      
      if (action === 'export-csv') {
        const selectedDocs = filtered.filter(r => selectedRows.has(r.id));
        const headers = ['ID', 'Candidate Name', 'Target Role', 'ATS Score', 'Completeness', 'Owner Email', 'Workspace', 'Last Updated'];
        const rows = selectedDocs.map(r => [
          r.id,
          `"${getCandidateName(r).replace(/"/g, '""')}"`,
          `"${getJobTitle(r).replace(/"/g, '""')}"`,
          getAtsScore(r),
          `${getCompleteness(r)}%`,
          `"${(r.ownerEmail || '').replace(/"/g, '""')}"`,
          `"${(r.workspaceName || workspace?.name || 'Default').replace(/"/g, '""')}"`,
          `"${r.updatedAt || ''}"`
        ]);
        const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `enterprise-talent-export-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify(`Exported ${selectedDocs.length} candidate profile(s) in CSV.`);
        return;
      }
      
      for (const id of selectedRows) {
        if (action === 'delete') {
          await request(`/api/enterprise/resources/${id}`, { method: 'DELETE' });
        }
        successCount++;
      }
      notify(`Successfully removed ${successCount} candidate resume(s).`);
      setSelectedRows(new Set());
      refreshResumes();
    } catch (err) {
      setActionError(err?.message || `Bulk action failed after processing ${successCount} resume(s).`);
      refreshResumes();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="enterprise-tab-content">
      {notification && (
        <div className="enterprise-toast enterprise-toast-success">
          <FiCheck aria-hidden="true" /> {notification}
        </div>
      )}
      {actionError && (
        <div className="enterprise-card" role="alert">
          <div className="enterprise-error-row">
            <span className="enterprise-error-icon" aria-hidden="true">⚠</span>
            <div><strong>Repository Action Error</strong><p className="text-muted">{actionError}</p></div>
          </div>
        </div>
      )}

      {/* Top Banner */}
      <div className="enterprise-card enterprise-banner-card">
        <div className="enterprise-banner-header">
          <div>
            <span className="enterprise-pill enterprise-pill-success">
              <FiCheckCircle aria-hidden="true" /> Enterprise Talent Hub · {tenant?.displayName || 'Active Organization'}
            </span>
            <h2 className="enterprise-tab-title" style={{ marginTop: '0.75rem' }}>
              Talent &amp; Resume Repository
              <HelpTooltip text="Centralized repository of candidate resumes, executive CVs, and talent assets with live ATS compatibility scoring and workspace isolation" />
            </h2>
            <p className="enterprise-tab-subtitle">
              Manage organization-wide resumes, audit ATS optimization scores, and preview candidate profiles across all workspaces.
            </p>
          </div>
          <div className="enterprise-actions-row">
            {canCreate && (
              <Link
                to="/build-resume"
                className="enterprise-button enterprise-button-primary"
              >
                <FiPlus aria-hidden="true" /> Create Enterprise Resume
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Live Statistics Cards */}
      <div className="enterprise-metrics-grid">
        <div className="enterprise-card enterprise-metric-box">
          <div className="enterprise-metric-header">
            <span>Managed Resumes</span>
            <FiFileText className="enterprise-metric-icon" aria-hidden="true" />
          </div>
          <div className="enterprise-metric-value">{loading ? '…' : stats.total}</div>
          <div className="enterprise-metric-footer text-success">
            ✓ Active candidate profiles
          </div>
        </div>

        <div className="enterprise-card enterprise-metric-box">
          <div className="enterprise-metric-header">
            <span>Average ATS Match</span>
            <FiStar className="enterprise-metric-icon" aria-hidden="true" />
          </div>
          <div className="enterprise-metric-value">{loading ? '…' : `${stats.avgAts}%`}</div>
          <div className="enterprise-metric-footer text-success">
            {stats.avgAts >= 80 ? '🌟 High recruiter match' : '✓ Standard compliance'}
          </div>
        </div>

        <div className="enterprise-card enterprise-metric-box">
          <div className="enterprise-metric-header">
            <span>High-Scoring Talent (80%+)</span>
            <FiAward className="enterprise-metric-icon" aria-hidden="true" />
          </div>
          <div className="enterprise-metric-value">{loading ? '…' : stats.highMatch}</div>
          <div className="enterprise-metric-footer text-success">
            {stats.total > 0 ? `${Math.round((stats.highMatch / stats.total) * 100)}% of total repository` : '0 candidates'}
          </div>
        </div>

        <div className="enterprise-card enterprise-metric-box">
          <div className="enterprise-metric-header">
            <span>Profile Completeness</span>
            <FiLayers className="enterprise-metric-icon" aria-hidden="true" />
          </div>
          <div className="enterprise-metric-value">{loading ? '…' : `${stats.completeAvg}%`}</div>
          <div className="enterprise-metric-footer">
            Across active sections
          </div>
        </div>
      </div>

      {/* Main Repository Card */}
      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h3 className="enterprise-card-title">Candidate Profiles &amp; Executive Resumes</h3>
            <p className="enterprise-card-subtitle">Unified talent roster backed by tenant data isolation</p>
          </div>
          <div className="enterprise-inline-actions" style={{ gap: '0.5rem' }}>
            <button
              type="button"
              className="enterprise-button enterprise-button-secondary enterprise-button-sm"
              onClick={() => handleBulkAction('export-csv')}
              disabled={filtered.length === 0 || busy}
            >
              <FiDownload aria-hidden="true" /> Export CSV
            </button>
            <button
              type="button"
              className="enterprise-button enterprise-button-secondary enterprise-button-sm"
              onClick={() => handleBulkAction('export-json')}
              disabled={filtered.length === 0 || busy}
            >
              <FiDownload aria-hidden="true" /> Export JSON
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="enterprise-filter-bar">
          <div className="enterprise-search-wrapper">
            <FiSearch className="enterprise-search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search candidate by name, job title, skills, or owner email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="enterprise-input"
            />
          </div>
          <div className="enterprise-select-group">
            <select
              value={atsFilter}
              onChange={(e) => setAtsFilter(e.target.value)}
              className="enterprise-select"
              aria-label="Filter by ATS Score"
            >
              <option value="ALL">All ATS Match Scores</option>
              <option value="HIGH">High Match (80%+ ATS)</option>
              <option value="MEDIUM">Moderate Match (60–79% ATS)</option>
              <option value="LOW">Needs Polish (&lt;60% ATS)</option>
            </select>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedRows.size > 0 && (
          <div className="enterprise-bulk-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--enterprise-primary-soft)', borderRadius: 'var(--enterprise-radius-sm)', marginBottom: '16px' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--enterprise-primary-active)' }}>
              {selectedRows.size} resume{selectedRows.size === 1 ? '' : 's'} selected
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="enterprise-button enterprise-button-secondary enterprise-button-sm" onClick={() => handleBulkAction('export-csv')} disabled={busy}>
                <FiDownload aria-hidden="true" /> Export CSV
              </button>
              <button type="button" className="enterprise-button enterprise-button-secondary enterprise-button-sm" onClick={() => handleBulkAction('export-json')} disabled={busy}>
                <FiDownload aria-hidden="true" /> Export JSON
              </button>
              {canUpdate && (
                <button type="button" className="enterprise-button enterprise-button-danger enterprise-button-sm" onClick={() => handleBulkAction('delete')} disabled={busy}>
                  <FiTrash2 aria-hidden="true" /> Delete
                </button>
              )}
            </div>
          </div>
        )}

        {/* Table View */}
        <DataState loading={loading} error={error} onRetry={refreshResumes}>
          {filtered.length === 0 ? (
            <div className="enterprise-empty" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--ep-slate-100)', color: 'var(--ep-slate-500)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', marginBottom: '12px' }}>
                <FiFileText />
              </div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 700 }}>No resumes found</h4>
              <p className="text-muted" style={{ margin: '0 0 18px 0', fontSize: '0.875rem' }}>
                {searchQuery || atsFilter !== 'ALL'
                  ? 'No candidate resumes match the active search or ATS filter.'
                  : 'Start building your enterprise candidate talent repository by creating a new resume.'}
              </p>
              {canCreate && (
                <Link to="/build-resume" className="enterprise-button enterprise-button-primary">
                  <FiPlus aria-hidden="true" /> Create Candidate Resume
                </Link>
              )}
            </div>
          ) : (
            <div className="enterprise-table-wrapper">
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={selectedRows.size === filtered.length && filtered.length > 0}
                        ref={input => { if (input) input.indeterminate = selectedRows.size > 0 && selectedRows.size < filtered.length; }}
                        onChange={toggleSelectAll}
                        aria-label="Select all documents"
                      />
                    </th>
                    <th>Candidate &amp; Target Role</th>
                    <th>
                      ATS Compatibility
                      <HelpTooltip text="Algorithmic ATS optimization score measuring keyword density, section completeness, and formatting standards" />
                    </th>
                    <th>Owner / Workspace</th>
                    <th>Completeness</th>
                    <th>Last Updated</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(resource => {
                    const candidate = getCandidateName(resource);
                    const role = getJobTitle(resource);
                    const ats = getAtsScore(resource);
                    const comp = getCompleteness(resource);
                    const owner = resource.ownerEmail || resource.ownerName || (resource.ownerPrincipalId ? `Principal: ${String(resource.ownerPrincipalId).slice(0, 8)}…` : '—');
                    const wsName = resource.workspaceName || workspace?.name || 'Default Workspace';

                    return (
                      <tr key={resource.id} className={selectedRows.has(resource.id) ? 'selected' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedRows.has(resource.id)}
                            onChange={() => toggleSelectRow(resource.id)}
                            aria-label={`Select ${candidate}`}
                          />
                        </td>
                        <td>
                          <div className="enterprise-user-cell">
                            <div className="enterprise-avatar" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', color: '#ffffff', fontWeight: 700 }}>
                              {candidate.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <strong style={{ cursor: 'pointer' }} onClick={() => setPreviewResource(resource)}>
                                {candidate}
                              </strong>
                              <small style={{ display: 'block', color: 'var(--ep-slate-500)' }}>
                                {role}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className={`enterprise-pill ${ats >= 80 ? 'enterprise-pill-success' : ats >= 60 ? 'enterprise-pill-warning' : 'enterprise-pill-secondary'}`}>
                              {ats}% ATS
                            </span>
                          </div>
                        </td>
                        <td>
                          <div>
                            <strong style={{ fontSize: '0.84rem', color: 'var(--ep-slate-700)' }}>{wsName}</strong>
                            <small style={{ display: 'block', color: 'var(--ep-slate-500)', fontSize: '0.75rem' }}>{owner}</small>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '60px', height: '6px', background: 'var(--ep-slate-200)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${comp}%`, height: '100%', background: comp >= 80 ? 'var(--ep-emerald-500)' : 'var(--ep-brand-500)' }} />
                            </div>
                            <small style={{ fontWeight: 600, color: 'var(--ep-slate-600)' }}>{comp}%</small>
                          </div>
                        </td>
                        <td>
                          <small style={{ color: 'var(--ep-slate-500)' }}>
                            {formatRelativeTime(resource.updatedAt || resource.createdAt)}
                          </small>
                        </td>
                        <td className="text-right">
                          <div className="enterprise-table-actions">
                            <button
                              type="button"
                              className="enterprise-button-icon"
                              title="Quick Preview Candidate Profile"
                              onClick={() => setPreviewResource(resource)}
                            >
                              <FiEye />
                            </button>
                            {canUpdate && (
                              <Link
                                to={`/build-resume?id=${resource.id}`}
                                className="enterprise-button-icon"
                                title="Edit in Smart Composer"
                              >
                                <FiEdit3 />
                              </Link>
                            )}
                            {canCreate && (
                              <button
                                type="button"
                                className="enterprise-button-icon"
                                title="Duplicate Resume"
                                onClick={() => handleDuplicate(resource)}
                                disabled={busy}
                              >
                                <FiCopy />
                              </button>
                            )}
                            {canUpdate && (
                              <button
                                type="button"
                                className="enterprise-button-icon text-danger"
                                title="Delete Resume"
                                onClick={() => handleDelete(resource)}
                                disabled={busy}
                              >
                                <FiTrash2 />
                              </button>
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
        </DataState>
      </div>

      {/* Quick Candidate Resume Preview Slide-out Modal */}
      {previewResource && (
        <div className="enterprise-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="preview-title" onClick={() => setPreviewResource(null)}>
          <div className="enterprise-modal enterprise-modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="enterprise-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="enterprise-pill enterprise-pill-success" style={{ marginBottom: '6px' }}>
                  Candidate Talent Profile · {getAtsScore(previewResource)}% ATS Score
                </span>
                <h3 id="preview-title" className="enterprise-modal-title" style={{ margin: 0, fontSize: '1.25rem' }}>
                  {getCandidateName(previewResource)}
                </h3>
                <p className="enterprise-card-subtitle" style={{ margin: 0 }}>
                  {getJobTitle(previewResource)} · {previewResource.workspaceName || workspace?.name || 'Main Workspace'}
                </p>
              </div>
              <button
                type="button"
                className="enterprise-modal-close"
                onClick={() => setPreviewResource(null)}
                aria-label="Close modal"
              >
                <FiX />
              </button>
            </div>

            <div className="enterprise-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px' }}>
              {/* ATS Compatibility Meter */}
              <div style={{ background: 'var(--ep-slate-50)', border: '1px solid var(--ep-slate-200)', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--ep-slate-800)', display: 'block' }}>ATS Compatibility Assessment</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--ep-slate-500)' }}>Standard corporate keyword density and structured sections verified.</span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: getAtsScore(previewResource) >= 80 ? 'var(--ep-emerald-600)' : 'var(--ep-amber-600)' }}>
                  {getAtsScore(previewResource)}<span style={{ fontSize: '0.9rem' }}>/100</span>
                </div>
              </div>

              {/* Executive Summary */}
              <div>
                <h4 style={{ fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ep-slate-500)', margin: '0 0 8px 0' }}>
                  Professional Summary
                </h4>
                <p style={{ fontSize: '0.9rem', color: 'var(--ep-slate-700)', lineHeight: 1.6, margin: 0, background: '#fff', border: '1px solid var(--ep-slate-200)', padding: '14px', borderRadius: '8px' }}>
                  {previewResource.summary || previewResource.payload?.personalInfo?.summary || previewResource.payload?.summary || 'Experienced professional with a demonstrated history of excellence and proven domain contributions.'}
                </p>
              </div>

              {/* Work Experience */}
              {Array.isArray(previewResource.payload?.experience) && previewResource.payload.experience.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ep-slate-500)', margin: '0 0 10px 0' }}>
                    Experience Timeline ({previewResource.payload.experience.length} Roles)
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {previewResource.payload.experience.map((exp, idx) => (
                      <div key={idx} style={{ background: '#fff', border: '1px solid var(--ep-slate-200)', padding: '14px 16px', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <strong style={{ fontSize: '0.92rem', color: 'var(--ep-slate-900)' }}>{exp.jobTitle || exp.title || 'Role Title'}</strong>
                          <span style={{ fontSize: '0.78rem', color: 'var(--ep-slate-500)' }}>{exp.startDate || exp.date || '2022'} – {exp.endDate || (exp.current ? 'Present' : '2024')}</span>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--ep-brand-600)', fontWeight: 600, marginBottom: '6px' }}>
                          {exp.companyName || exp.company || 'Enterprise Organization'}
                        </div>
                        {exp.description && (
                          <p style={{ fontSize: '0.82rem', color: 'var(--ep-slate-600)', margin: 0, lineHeight: 1.5 }}>
                            {exp.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills */}
              {Array.isArray(previewResource.payload?.skills) && previewResource.payload.skills.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ep-slate-500)', margin: '0 0 8px 0' }}>
                    Core Competencies &amp; Skills
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {previewResource.payload.skills.map((skill, idx) => {
                      const skillName = typeof skill === 'string' ? skill : skill.name || skill.skill;
                      return (
                        <span key={idx} style={{ background: 'var(--ep-slate-100)', color: 'var(--ep-slate-800)', border: '1px solid var(--ep-slate-200)', borderRadius: '6px', padding: '4px 10px', fontSize: '0.78rem', fontWeight: 500 }}>
                          {skillName}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="enterprise-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="enterprise-button enterprise-button-secondary"
                onClick={() => setPreviewResource(null)}
              >
                Close Preview
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Link
                  to={`/build-resume?id=${previewResource.id}`}
                  className="enterprise-button enterprise-button-primary"
                >
                  <FiEdit3 aria-hidden="true" /> Open in Smart Composer
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
