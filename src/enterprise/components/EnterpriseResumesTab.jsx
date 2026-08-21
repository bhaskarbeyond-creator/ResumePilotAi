import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiFileText, FiPlus, FiEdit3, FiCopy, FiTrash2, FiSearch, FiCheck,
  FiEye, FiDownload, FiStar, FiUser, FiBriefcase, FiAward, FiLayers,
  FiX, FiExternalLink, FiSliders, FiCheckCircle, FiChevronDown, FiChevronRight,
  FiUsers, FiMaximize2, FiPrinter
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import HelpTooltip from './HelpTooltip';
import EnterpriseConfirmModal from './EnterpriseConfirmModal';
import EnterpriseResumePdfModal, { normalizeResumeValues } from './EnterpriseResumePdfModal';

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
    resource?.payload?.occupation ||
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
  if (p.personalInfo?.fullName || p.firstname) score += 25;
  if (Array.isArray(p.experience) && p.experience.length > 0) score += 25;
  else if (Array.isArray(p.employment) && p.employment.length > 0) score += 25;
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
  const navigate = useNavigate();
  const { request, hasPermission, workspace, tenant } = useTenantApi();
  const [resumesState, refreshResumes] = useAsyncResource(
    () => request('/api/enterprise/resources?resourceType=resume'),
    [request],
  );
  const { loading, error, data } = resumesState;
  const [searchQuery, setSearchQuery] = useState('');
  const [atsFilter, setAtsFilter] = useState('ALL'); // ALL, HIGH (>=80), MEDIUM (60-79), LOW (<60)
  const [viewMode, setViewMode] = useState('grouped'); // 'grouped' (Club by Candidate) or 'flat' (All Resumes)
  const [expandedCandidateKeys, setExpandedCandidateKeys] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [previewResource, setPreviewResource] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState(null);

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

  // Group resumes by Candidate identity for clean UX clubbing
  const groupedCandidates = useMemo(() => {
    const map = new Map();

    for (const resource of filtered) {
      const email = (resource.ownerEmail || '').trim().toLowerCase();
      const principal = (resource.ownerPrincipalId || '').trim();
      const name = getCandidateName(resource).trim();
      
      // Group key: email first, then principal ID, then lowercase candidate name
      const key = email || (principal ? `uid:${principal}` : `name:${name.toLowerCase()}`);

      if (!map.has(key)) {
        map.set(key, {
          key,
          candidateName: name,
          ownerEmail: resource.ownerEmail || null,
          ownerPrincipalId: resource.ownerPrincipalId || null,
          resumes: [],
          bestAtsScore: 0,
          rolesSet: new Set(),
          workspacesSet: new Set(),
          completenessSum: 0,
          latestUpdatedAt: '',
        });
      }

      const group = map.get(key);
      group.resumes.push(resource);

      const ats = getAtsScore(resource);
      if (ats > group.bestAtsScore) group.bestAtsScore = ats;

      const role = getJobTitle(resource);
      if (role) group.rolesSet.add(role);

      const ws = resource.workspaceName || workspace?.name || 'Main Workspace';
      group.workspacesSet.add(ws);

      group.completenessSum += getCompleteness(resource);

      const updated = resource.updatedAt || resource.createdAt || '';
      if (!group.latestUpdatedAt || new Date(updated) > new Date(group.latestUpdatedAt)) {
        group.latestUpdatedAt = updated;
        group.candidateName = name; // Prefer latest candidate name
      }
    }

    const list = Array.from(map.values()).map(group => {
      // Sort individual resumes by latest updated descending
      group.resumes.sort((a, b) => {
        const da = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const db = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return db - da;
      });
      group.rolesList = Array.from(group.rolesSet);
      group.workspacesList = Array.from(group.workspacesSet);
      group.avgCompleteness = Math.round(group.completenessSum / group.resumes.length);
      group.latestResume = group.resumes[0];
      return group;
    });

    // Sort candidate groups by most recent activity
    list.sort((a, b) => {
      const da = new Date(a.latestUpdatedAt || 0).getTime();
      const db = new Date(b.latestUpdatedAt || 0).getTime();
      return db - da;
    });

    return list;
  }, [filtered, workspace]);

  // Statistics
  const stats = useMemo(() => {
    const total = resources.length;
    if (total === 0) return { total: 0, uniqueCandidates: 0, avgAts: 0, highMatch: 0, completeAvg: 0 };
    const atsSum = resources.reduce((acc, r) => acc + getAtsScore(r), 0);
    const high = resources.filter(r => getAtsScore(r) >= 80).length;
    const compSum = resources.reduce((acc, r) => acc + getCompleteness(r), 0);
    
    const candidateKeys = new Set(resources.map(r => (r.ownerEmail || r.ownerPrincipalId || getCandidateName(r)).toLowerCase()));

    return {
      total,
      uniqueCandidates: candidateKeys.size,
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

  const toggleSelectCandidate = (candidateGroup) => {
    const resumeIds = candidateGroup.resumes.map(r => r.id);
    const allSelected = resumeIds.every(id => selectedRows.has(id));
    const next = new Set(selectedRows);

    if (allSelected) {
      resumeIds.forEach(id => next.delete(id));
    } else {
      resumeIds.forEach(id => next.add(id));
    }
    setSelectedRows(next);
  };

  const toggleExpandCandidate = (key) => {
    const next = new Set(expandedCandidateKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedCandidateKeys(next);
  };

  const expandAllCandidates = () => {
    setExpandedCandidateKeys(new Set(groupedCandidates.map(g => g.key)));
  };

  const collapseAllCandidates = () => {
    setExpandedCandidateKeys(new Set());
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

  const handleDelete = (resource) => {
    const candidate = getCandidateName(resource);
    setConfirmConfig({
      title: 'Remove Candidate Resume',
      message: `Are you sure you want to remove "${candidate}" from the enterprise talent repository? This action cannot be undone.`,
      confirmLabel: 'Remove Resume',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmConfig(null);
        setActionError(null);
        try {
          await request(`/api/enterprise/resources/${resource.id}`, { method: 'DELETE' });
          notify(`Removed "${candidate}" from enterprise talent repository.`);
          setSelectedRows(prev => { const next = new Set(prev); next.delete(resource.id); return next; });
          refreshResumes();
        } catch (err) {
          setActionError(err?.message || 'Resume could not be deleted.');
        }
      }
    });
  };

  const handleBulkAction = (action) => {
    if (!selectedRows.size) return;
    
    if (action === 'delete') {
      setConfirmConfig({
        title: 'Bulk Remove Candidate Resumes',
        message: `Are you sure you want to delete ${selectedRows.size} selected candidate resume(s)? This cannot be undone.`,
        confirmLabel: `Delete ${selectedRows.size} Resume(s)`,
        variant: 'danger',
        onConfirm: async () => {
          setConfirmConfig(null);
          setActionError(null);
          setBusy(true);
          let successCount = 0;
          try {
            for (const id of selectedRows) {
              await request(`/api/enterprise/resources/${id}`, { method: 'DELETE' });
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
        }
      });
      return;
    }

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
              Manage organization-wide resumes, audit ATS optimization scores, and preview candidate profiles with high-fidelity PDF rendering across all workspaces.
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
            ✓ Across {stats.uniqueCandidates} candidate{stats.uniqueCandidates === 1 ? '' : 's'}
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
            <p className="enterprise-card-subtitle">
              {viewMode === 'grouped'
                ? `Clubbed Candidate Roster (${groupedCandidates.length} Candidates · ${filtered.length} Resumes)`
                : `Individual Resume Catalog (${filtered.length} Resumes)`}
            </p>
          </div>
          <div className="enterprise-inline-actions" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* View Mode Toggle Switcher */}
            <div
              style={{
                display: 'inline-flex',
                background: 'var(--ep-slate-100)',
                borderRadius: '8px',
                padding: '3px',
                border: '1px solid var(--ep-slate-200)'
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode('grouped')}
                style={{
                  border: 'none',
                  background: viewMode === 'grouped' ? '#ffffff' : 'transparent',
                  color: viewMode === 'grouped' ? 'var(--ep-brand-600)' : 'var(--ep-slate-600)',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  boxShadow: viewMode === 'grouped' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <FiUsers aria-hidden="true" /> Club by Candidate
              </button>
              <button
                type="button"
                onClick={() => setViewMode('flat')}
                style={{
                  border: 'none',
                  background: viewMode === 'flat' ? '#ffffff' : 'transparent',
                  color: viewMode === 'flat' ? 'var(--ep-brand-600)' : 'var(--ep-slate-600)',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  boxShadow: viewMode === 'flat' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <FiFileText aria-hidden="true" /> All Resumes (Flat)
              </button>
            </div>

            {viewMode === 'grouped' && groupedCandidates.length > 0 && (
              <div style={{ display: 'inline-flex', gap: '4px' }}>
                <button
                  type="button"
                  className="enterprise-button enterprise-button-secondary enterprise-button-sm"
                  onClick={expandAllCandidates}
                  title="Expand all candidate resumes"
                  style={{ fontSize: '0.76rem', padding: '5px 10px' }}
                >
                  Expand All
                </button>
                <button
                  type="button"
                  className="enterprise-button enterprise-button-secondary enterprise-button-sm"
                  onClick={collapseAllCandidates}
                  title="Collapse all candidate resumes"
                  style={{ fontSize: '0.76rem', padding: '5px 10px' }}
                >
                  Collapse All
                </button>
              </div>
            )}

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
          ) : viewMode === 'grouped' ? (
            /* =========================================================================
               GROUPED / CLUBBED BY CANDIDATE VIEW
               ========================================================================= */
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
                    <th>Candidate &amp; Identity</th>
                    <th>Resumes &amp; Versions</th>
                    <th>Target Roles</th>
                    <th>
                      Best ATS Match
                      <HelpTooltip text="Highest algorithmic ATS optimization score across all candidate resume versions" />
                    </th>
                    <th>Completeness</th>
                    <th>Latest Activity</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedCandidates.map(group => {
                    const isExpanded = expandedCandidateKeys.has(group.key);
                    const resumeIds = group.resumes.map(r => r.id);
                    const allSelected = resumeIds.every(id => selectedRows.has(id));
                    const someSelected = !allSelected && resumeIds.some(id => selectedRows.has(id));

                    return (
                      <React.Fragment key={group.key}>
                        {/* Parent Candidate Row */}
                        <tr
                          className={`${allSelected ? 'selected' : ''}`}
                          style={{
                            background: isExpanded ? 'var(--ep-slate-50)' : undefined,
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={input => { if (input) input.indeterminate = someSelected; }}
                              onChange={() => toggleSelectCandidate(group)}
                              aria-label={`Select all resumes for ${group.candidateName}`}
                            />
                          </td>
                          <td>
                            <div className="enterprise-user-cell">
                              <div
                                className="enterprise-avatar"
                                style={{
                                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                  color: '#ffffff',
                                  fontWeight: 700,
                                  boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)'
                                }}
                              >
                                {group.candidateName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <strong
                                  style={{ cursor: 'pointer', color: 'var(--ep-slate-900)' }}
                                  onClick={() => toggleExpandCandidate(group.key)}
                                  title="Click to expand candidate resume versions"
                                >
                                  {group.candidateName}
                                </strong>
                                <small style={{ display: 'block', color: 'var(--ep-slate-500)', fontSize: '0.75rem' }}>
                                  {group.ownerEmail || (group.ownerPrincipalId ? `UID: ${String(group.ownerPrincipalId).slice(0, 10)}…` : 'Direct Profile')}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => toggleExpandCandidate(group.key)}
                              style={{
                                background: isExpanded ? 'var(--ep-brand-50)' : 'var(--ep-slate-100)',
                                color: isExpanded ? 'var(--ep-brand-700)' : 'var(--ep-slate-700)',
                                border: `1px solid ${isExpanded ? 'var(--ep-brand-200)' : 'var(--ep-slate-200)'}`,
                                borderRadius: '20px',
                                padding: '4px 10px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <FiFileText aria-hidden="true" style={{ fontSize: '0.75rem' }} />
                              <span>{group.resumes.length} {group.resumes.length === 1 ? 'Version' : 'Versions'}</span>
                              {isExpanded ? <FiChevronDown aria-hidden="true" /> : <FiChevronRight aria-hidden="true" />}
                            </button>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '280px' }}>
                              {group.rolesList.slice(0, 2).map((role, rIdx) => (
                                <span
                                  key={rIdx}
                                  style={{
                                    background: 'var(--ep-slate-100)',
                                    color: 'var(--ep-slate-700)',
                                    border: '1px solid var(--ep-slate-200)',
                                    borderRadius: '4px',
                                    padding: '2px 6px',
                                    fontSize: '0.74rem',
                                    fontWeight: 500,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: '130px'
                                  }}
                                  title={role}
                                >
                                  {role}
                                </span>
                              ))}
                              {group.rolesList.length > 2 && (
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    color: 'var(--ep-slate-500)',
                                    fontWeight: 600,
                                    alignSelf: 'center'
                                  }}
                                >
                                  +{group.rolesList.length - 2} more
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className={`enterprise-pill ${group.bestAtsScore >= 80 ? 'enterprise-pill-success' : group.bestAtsScore >= 60 ? 'enterprise-pill-warning' : 'enterprise-pill-secondary'}`}>
                                {group.bestAtsScore}% ATS
                              </span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '55px', height: '6px', background: 'var(--ep-slate-200)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${group.avgCompleteness}%`, height: '100%', background: group.avgCompleteness >= 80 ? 'var(--ep-emerald-500)' : 'var(--ep-brand-500)' }} />
                              </div>
                              <small style={{ fontWeight: 600, color: 'var(--ep-slate-600)' }}>{group.avgCompleteness}%</small>
                            </div>
                          </td>
                          <td>
                            <small style={{ color: 'var(--ep-slate-500)' }}>
                              {formatRelativeTime(group.latestUpdatedAt)}
                            </small>
                          </td>
                          <td className="text-right">
                            <div className="enterprise-table-actions">
                              {/* EYE ICON: Opens Full-Fidelity PDF Resume Popup Modal */}
                              <button
                                type="button"
                                className="enterprise-button-icon"
                                title="View Resume in Full-Screen PDF Popup"
                                onClick={() => setPreviewResource(group.latestResume)}
                                style={{
                                  color: 'var(--ep-brand-600)',
                                  background: 'var(--ep-brand-50)'
                                }}
                              >
                                <FiEye aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="enterprise-button-icon"
                                title={isExpanded ? 'Collapse versions' : 'Expand all candidate versions'}
                                onClick={() => toggleExpandCandidate(group.key)}
                              >
                                {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Nested Sub-Table: All Resume Versions for this Candidate */}
                        {isExpanded && (
                          <tr style={{ background: '#f8fafc' }}>
                            <td colSpan={8} style={{ padding: '0 0 14px 44px', borderBottom: '2px solid var(--ep-slate-200)' }}>
                              <div
                                style={{
                                  background: '#ffffff',
                                  border: '1px solid var(--ep-slate-200)',
                                  borderLeft: '4px solid var(--ep-brand-600)',
                                  borderRadius: '8px',
                                  overflow: 'hidden',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                  margin: '8px 16px 8px 0'
                                }}
                              >
                                <div
                                  style={{
                                    padding: '8px 14px',
                                    background: 'var(--ep-slate-50)',
                                    borderBottom: '1px solid var(--ep-slate-200)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                  }}
                                >
                                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--ep-slate-700)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    All Versions for {group.candidateName} ({group.resumes.length})
                                  </span>
                                  {canCreate && (
                                    <Link
                                      to={`/build-resume?clone=${group.latestResume?.id || ''}`}
                                      className="enterprise-button enterprise-button-secondary enterprise-button-sm"
                                      style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                                    >
                                      <FiPlus aria-hidden="true" /> New Version
                                    </Link>
                                  )}
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                  <thead>
                                    <tr style={{ background: 'var(--ep-slate-50)', borderBottom: '1px solid var(--ep-slate-200)', color: 'var(--ep-slate-500)', fontSize: '0.72rem' }}>
                                      <th style={{ width: '36px', padding: '6px 12px' }}>#</th>
                                      <th style={{ padding: '6px 12px', textAlign: 'left' }}>Target Role &amp; Version</th>
                                      <th style={{ padding: '6px 12px', textAlign: 'left' }}>Template Preset</th>
                                      <th style={{ padding: '6px 12px', textAlign: 'left' }}>ATS Match</th>
                                      <th style={{ padding: '6px 12px', textAlign: 'left' }}>Completeness</th>
                                      <th style={{ padding: '6px 12px', textAlign: 'left' }}>Workspace</th>
                                      <th style={{ padding: '6px 12px', textAlign: 'left' }}>Updated</th>
                                      <th style={{ padding: '6px 12px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.resumes.map((resume, idx) => {
                                      const ats = getAtsScore(resume);
                                      const comp = getCompleteness(resume);
                                      const isRowSelected = selectedRows.has(resume.id);
                                      const tmpl = resume.payload?.templateId || resume.payload?.template || resume.template || 'Cv1';

                                      return (
                                        <tr
                                          key={resume.id}
                                          style={{
                                            borderBottom: idx === group.resumes.length - 1 ? 'none' : '1px solid var(--ep-slate-100)',
                                            background: isRowSelected ? 'var(--enterprise-primary-soft)' : undefined
                                          }}
                                        >
                                          <td style={{ padding: '8px 12px' }}>
                                            <input
                                              type="checkbox"
                                              checked={isRowSelected}
                                              onChange={() => toggleSelectRow(resume.id)}
                                              aria-label={`Select resume ${resume.id}`}
                                            />
                                          </td>
                                          <td style={{ padding: '8px 12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                              <strong
                                                style={{ color: 'var(--ep-slate-800)', cursor: 'pointer' }}
                                                onClick={() => setPreviewResource(resume)}
                                                title="Click to preview in PDF"
                                              >
                                                {getJobTitle(resume)}
                                              </strong>
                                              {idx === 0 && (
                                                <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: 'var(--ep-emerald-50)', color: 'var(--ep-emerald-700)', border: '1px solid var(--ep-emerald-200)' }}>
                                                  Latest
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                          <td style={{ padding: '8px 12px' }}>
                                            <span style={{ fontSize: '0.74rem', background: 'var(--ep-slate-100)', padding: '2px 6px', borderRadius: '4px', color: 'var(--ep-slate-700)' }}>
                                              {tmpl}
                                            </span>
                                          </td>
                                          <td style={{ padding: '8px 12px' }}>
                                            <span className={`enterprise-pill ${ats >= 80 ? 'enterprise-pill-success' : ats >= 60 ? 'enterprise-pill-warning' : 'enterprise-pill-secondary'}`} style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                                              {ats}% ATS
                                            </span>
                                          </td>
                                          <td style={{ padding: '8px 12px' }}>
                                            <small style={{ fontWeight: 600, color: 'var(--ep-slate-600)' }}>{comp}%</small>
                                          </td>
                                          <td style={{ padding: '8px 12px', color: 'var(--ep-slate-500)', fontSize: '0.78rem' }}>
                                            {resume.workspaceName || workspace?.name || 'Main Workspace'}
                                          </td>
                                          <td style={{ padding: '8px 12px', color: 'var(--ep-slate-400)', fontSize: '0.75rem' }}>
                                            {formatRelativeTime(resume.updatedAt || resume.createdAt)}
                                          </td>
                                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                            <div className="enterprise-table-actions" style={{ justifyContent: 'flex-end', gap: '4px' }}>
                                              {/* EYE ICON: Opens Full-Fidelity PDF Resume Popup Modal */}
                                              <button
                                                type="button"
                                                className="enterprise-button-icon"
                                                title="View Resume in PDF Popup"
                                                onClick={() => setPreviewResource(resume)}
                                                style={{ color: 'var(--ep-brand-600)' }}
                                              >
                                                <FiEye />
                                              </button>
                                              {canUpdate && (
                                                <Link
                                                  to={`/build-resume?id=${resume.id}`}
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
                                                  onClick={() => handleDuplicate(resume)}
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
                                                  onClick={() => handleDelete(resume)}
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
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* =========================================================================
               FLAT ALL RESUMES LIST VIEW
               ========================================================================= */
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
                            {/* EYE ICON: Opens Full-Fidelity PDF Resume Popup Modal */}
                            <button
                              type="button"
                              className="enterprise-button-icon"
                              title="View Resume in PDF Popup"
                              onClick={() => setPreviewResource(resource)}
                              style={{ color: 'var(--ep-brand-600)' }}
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

      {/* FULL-FIDELITY PDF RESUME PREVIEW POPUP MODAL */}
      <EnterpriseResumePdfModal
        isOpen={!!previewResource}
        resume={previewResource}
        onClose={() => setPreviewResource(null)}
        onEdit={(id) => navigate(`/build-resume?id=${id}`)}
      />

      {confirmConfig && (
        <EnterpriseConfirmModal
          isOpen={!!confirmConfig}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          cancelLabel={confirmConfig.cancelLabel}
          variant={confirmConfig.variant}
          busy={busy}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(null)}
        />
      )}
    </div>
  );
}
