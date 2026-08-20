import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiFileText, FiPlus, FiDownload, FiEdit3, FiCopy, FiTrash2,
  FiSearch, FiCheck, FiFilter, FiExternalLink, FiShare2
} from 'react-icons/fi';

const SAMPLE_ENTERPRISE_RESUMES = [
  { id: 'res-ent-1', title: 'Senior Cloud Solutions Architect', candidate: 'Alexander Wright', templateId: 'Cv51', status: 'PUBLISHED', lastModified: 'Today at 10:14 AM', author: 'Alexander Wright' },
  { id: 'res-ent-2', title: 'Staff Frontend Infrastructure Engineer', candidate: 'Elena Rostova', templateId: 'Cv12', status: 'REVIEW', lastModified: 'Yesterday', author: 'Elena Rostova' },
  { id: 'res-ent-3', title: 'Principal Product Manager', candidate: 'Marcus Chen', templateId: 'Cv1', status: 'PUBLISHED', lastModified: 'Aug 18, 2026', author: 'Marcus Chen' },
  { id: 'res-ent-4', title: 'Director of Enterprise Security', candidate: 'Sarah Jenkins', templateId: 'Cv40', status: 'DRAFT', lastModified: 'Aug 15, 2026', author: 'Sarah Jenkins' },
  { id: 'res-ent-5', title: 'Lead AI & Machine Learning Scientist', candidate: 'David Kim', templateId: 'Cv50', status: 'PUBLISHED', lastModified: 'Aug 12, 2026', author: 'David Kim' },
];

export default function EnterpriseResumesTab({ _tenant, _workspace }) {
  const [resumes, setResumes] = useState(SAMPLE_ENTERPRISE_RESUMES);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [notification, setNotification] = useState(null);

  const filteredResumes = resumes.filter(r => {
    const matchesSearch = `${r.title} ${r.candidate} ${r.templateId}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDuplicate = (resume) => {
    const duplicate = {
      ...resume,
      id: `res-ent-${Date.now()}`,
      title: `${resume.title} (Copy)`,
      status: 'DRAFT',
      lastModified: 'Just now',
    };
    setResumes(prev => [duplicate, ...prev]);
    setNotification(`Duplicated "${resume.title}" into draft.`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDelete = (resumeId) => {
    setResumes(prev => prev.filter(r => r.id !== resumeId));
    setNotification('Document removed from enterprise workspace.');
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="enterprise-tab-content">
      {notification && (
        <div className="enterprise-toast enterprise-toast-success">
          <FiCheck aria-hidden="true" /> {notification}
        </div>
      )}

      {/* Header with Title and Create Button */}
      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h2 className="enterprise-tab-title">Enterprise Document Library</h2>
            <p className="enterprise-tab-subtitle">
              Workspace-scoped resumes and executive CVs with team collaboration and 51 certified design presets
            </p>
          </div>
          <Link
            to="/build-resume"
            className="enterprise-button enterprise-button-primary"
          >
            <FiPlus aria-hidden="true" /> Create Enterprise Resume
          </Link>
        </div>

        {/* Filter Bar */}
        <div className="enterprise-filter-bar">
          <div className="enterprise-search-wrapper">
            <FiSearch className="enterprise-search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search resumes by title, candidate name, or template ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="enterprise-input"
            />
          </div>

          <div className="enterprise-select-group">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="enterprise-select"
              aria-label="Filter by status"
            >
              <option value="ALL">All Statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="REVIEW">In Review</option>
              <option value="DRAFT">Draft</option>
            </select>
          </div>
        </div>

        {/* Resumes Table */}
        <div className="enterprise-table-wrapper">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Document Title / Candidate</th>
                <th>Template Preset</th>
                <th>Status</th>
                <th>Last Modified</th>
                <th>Owner / Collaborator</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredResumes.map(resume => (
                <tr key={resume.id}>
                  <td>
                    <div className="enterprise-user-cell">
                      <div className="enterprise-avatar enterprise-avatar-doc">
                        <FiFileText />
                      </div>
                      <div>
                        <strong>{resume.title}</strong>
                        <small>{resume.candidate}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="enterprise-pill enterprise-pill-template">
                      {resume.templateId} (Certified 51)
                    </span>
                  </td>
                  <td>
                    <span className={`enterprise-pill enterprise-pill-${resume.status === 'PUBLISHED' ? 'success' : (resume.status === 'REVIEW' ? 'warning' : 'secondary')}`}>
                      {resume.status}
                    </span>
                  </td>
                  <td>
                    <small className="text-muted">{resume.lastModified}</small>
                  </td>
                  <td>
                    <small>{resume.author}</small>
                  </td>
                  <td className="text-right">
                    <div className="enterprise-table-actions">
                      <Link
                        to={`/build-resume?id=${resume.id}`}
                        className="enterprise-button-icon"
                        title="Edit in Smart Composer"
                      >
                        <FiEdit3 />
                      </Link>
                      <button
                        type="button"
                        className="enterprise-button-icon"
                        title="Duplicate Document"
                        onClick={() => handleDuplicate(resume)}
                      >
                        <FiCopy />
                      </button>
                      <button
                        type="button"
                        className="enterprise-button-icon text-danger"
                        title="Delete Document"
                        onClick={() => handleDelete(resume.id)}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredResumes.length === 0 && (
                <tr>
                  <td colSpan="6" className="enterprise-empty-row">
                    No documents found matching the search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
