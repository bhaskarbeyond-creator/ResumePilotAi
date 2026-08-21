import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FiX, FiPrinter, FiDownload, FiZoomIn, FiZoomOut,
  FiMaximize2, FiStar, FiFileText, FiCheck, FiLayers, FiExternalLink
} from 'react-icons/fi';
import TemplateRenderer from '../../components/TemplateRenderer';
import { executeDocxDownload } from '../../utils/docxDownload';
import fire from '../../conf/fire';

const TEMPLATE_NAMES = {
  Cv1: 'Minimalist Clean (ATS)',
  Cv2: 'Executive Slate',
  Cv3: 'Corporate Navy',
  Cv4: 'Modern Two-Column',
  Cv5: 'Tech Grid Specialist',
  Cv6: 'Nordic Clean',
  Cv7: 'Zurich Professional',
  Cv8: 'London Executive',
  Cv9: 'Tokyo Minimal',
  Cv10: 'Silicon Valley Pro',
  Cv11: 'Berlin Grid',
  Cv12: 'Oxford Academic',
  Cv13: 'Cambridge Elegant',
  Cv14: 'Manhattan Modern',
  Cv15: 'Stockholm Chic',
  Cv16: 'Parisian Creative',
  Cv17: 'Madrid Vivid',
  Cv18: 'Rome Traditional',
  Cv19: 'Sydney Compact',
  Cv20: 'Toronto Balanced',
  Cv50: 'Executive Right-Split',
  Cv51: 'Europass Modern Official'
};

export function normalizeResumeValues(resource) {
  if (!resource) return {};
  const p = resource.payload || resource;

  const fullName = p.personalInfo?.fullName ||
    (p.firstname || p.lastname ? `${p.firstname || ''} ${p.lastname || ''}`.trim() : '') ||
    resource.candidateName ||
    'Candidate Profile';

  const nameParts = fullName.split(' ');
  const firstname = p.firstname || nameParts[0] || 'Candidate';
  const lastname = p.lastname || nameParts.slice(1).join(' ') || 'Profile';

  const occupation = p.occupation ||
    p.jobTitle ||
    p.personalInfo?.jobTitle ||
    p.positionTitle ||
    resource.jobTitle ||
    'Executive Professional';

  const email = p.email || p.personalInfo?.email || resource.ownerEmail || '';
  const phone = p.phone || p.personalInfo?.phone || '';
  const city = p.city || p.location || p.personalInfo?.location || '';
  const summary = p.summary || p.personalInfo?.summary || resource.summary || '';

  const employment = Array.isArray(p.employment) && p.employment.length > 0
    ? p.employment
    : (Array.isArray(p.experience)
      ? p.experience.map(e => ({
          jobTitle: e.jobTitle || e.title || 'Role Title',
          employer: e.companyName || e.company || 'Enterprise Organization',
          startDate: e.startDate || e.date || '',
          endDate: e.endDate || (e.current ? 'Present' : ''),
          description: e.description || ''
        }))
      : []);

  const education = Array.isArray(p.education) ? p.education : [];
  const skills = Array.isArray(p.skills)
    ? p.skills.map(s => (typeof s === 'string' ? { name: s, level: 'Experienced' } : s))
    : [];
  const languages = Array.isArray(p.languages) ? p.languages : [];
  const certifications = Array.isArray(p.certifications) ? p.certifications : [];
  const projects = Array.isArray(p.projects) ? p.projects : [];
  const hobbies = Array.isArray(p.hobbies) ? p.hobbies : [];

  let templateId = p.templateId || p.template || resource.template || 'Cv1';
  if (!/^Cv\d+$/i.test(templateId)) {
    templateId = 'Cv1';
  } else {
    templateId = templateId.charAt(0).toUpperCase() + templateId.slice(1).toLowerCase();
  }

  return {
    ...p,
    id: resource.id,
    firstname,
    lastname,
    fullName,
    occupation,
    jobTitle: occupation,
    email,
    phone,
    city,
    summary,
    employment,
    education,
    skills,
    languages,
    certifications,
    projects,
    hobbies,
    templateId,
    template: templateId,
  };
}

export default function EnterpriseResumePdfModal({
  isOpen,
  resume,
  onClose
}) {
  const [zoom, setZoom] = useState(0.72);
  const [selectedTemplate, setSelectedTemplate] = useState('Cv1');
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const modalRef = useRef(null);

  const normalizedData = useMemo(() => {
    if (!resume) return null;
    return normalizeResumeValues(resume);
  }, [resume]);

  useEffect(() => {
    if (normalizedData?.templateId) {
      setSelectedTemplate(normalizedData.templateId);
    }
  }, [normalizedData]);

  // Adjust default zoom based on screen width
  useEffect(() => {
    if (isOpen) {
      const width = window.innerWidth;
      if (width < 640) setZoom(0.42);
      else if (width < 1024) setZoom(0.58);
      else if (width < 1440) setZoom(0.70);
      else setZoom(0.78);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ESC keyboard listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !normalizedData) return null;

  const atsScore = Number(resume.atsScore || resume.payload?.atsScore || 85);
  const candidateName = normalizedData.fullName || `${normalizedData.firstname} ${normalizedData.lastname}`.trim();
  const jobTitle = normalizedData.occupation || 'Executive Professional';

  const handlePrint = () => {
    window.print();
  };

  const handleDocx = async () => {
    if (downloadingDocx) return;
    setDownloadingDocx(true);
    setStatusMessage('Generating high-fidelity DOCX export…');
    try {
      const currentUid = fire.auth()?.currentUser?.uid || resume.ownerPrincipalId || 'enterprise-admin';
      await executeDocxDownload({
        resumeId: resume.id,
        resumeName: selectedTemplate,
        language: 'en',
        firstname: normalizedData.firstname,
        lastname: normalizedData.lastname,
        userId: currentUid,
      });
      setStatusMessage('DOCX downloaded successfully!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('Enterprise DOCX export failed:', err);
      setStatusMessage('DOCX download failed. Please try again.');
      setTimeout(() => setStatusMessage(null), 3500);
    } finally {
      setDownloadingDocx(false);
    }
  };

  return (
    <div
      className="enterprise-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-preview-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px'
      }}
    >
      <div
        ref={modalRef}
        className="enterprise-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '1180px',
          height: '94vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Topbar Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#ffffff',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            flexShrink: 0
          }}
        >
          {/* Candidate Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.1rem',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)'
              }}
            >
              {candidateName.charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3
                  id="pdf-preview-title"
                  style={{
                    margin: 0,
                    fontSize: '1.08rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {candidateName}
                </h3>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '20px',
                    background: atsScore >= 80 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    color: atsScore >= 80 ? '#34d399' : '#fbbf24',
                    border: `1px solid ${atsScore >= 80 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <FiStar aria-hidden="true" style={{ fontSize: '0.68rem' }} /> {atsScore}% ATS Match
                </span>
              </div>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '0.8rem',
                  color: '#94a3b8',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {jobTitle} &bull; {resume.workspaceName || 'Enterprise Workspace'} &bull; Rev {resume.revision || 1}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {/* Template Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="enterprise-pdf-template-select" style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                Template:
              </label>
              <select
                id="enterprise-pdf-template-select"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {Array.from({ length: 51 }, (_, i) => {
                  const id = `Cv${i + 1}`;
                  const label = TEMPLATE_NAMES[id] ? `${id} — ${TEMPLATE_NAMES[id]}` : `${id} Professional`;
                  return (
                    <option key={id} value={id} style={{ background: '#1e293b', color: '#ffffff' }}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Zoom Controls */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                padding: '2px'
              }}
            >
              <button
                type="button"
                onClick={() => setZoom(z => Math.max(0.35, Number((z - 0.08).toFixed(2))))}
                title="Zoom Out"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <FiZoomOut />
              </button>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, minWidth: '42px', textAlign: 'center', color: '#e2e8f0' }}>
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom(z => Math.min(1.3, Number((z + 0.08).toFixed(2))))}
                title="Zoom In"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <FiZoomIn />
              </button>
              <button
                type="button"
                onClick={() => setZoom(0.72)}
                title="Fit to Screen (Reset Zoom)"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '0.75rem'
                }}
              >
                <FiMaximize2 />
              </button>
            </div>

            {/* Print / Download PDF */}
            <button
              type="button"
              onClick={handlePrint}
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.35)'
              }}
              title="Print or Save as PDF"
            >
              <FiPrinter aria-hidden="true" />
              <span>Print / PDF</span>
            </button>

            {/* Download DOCX */}
            <button
              type="button"
              onClick={handleDocx}
              disabled={downloadingDocx}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                padding: '7px 12px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: downloadingDocx ? 'not-allowed' : 'pointer'
              }}
              title="Download Microsoft Word .docx format"
            >
              <FiDownload aria-hidden="true" />
              <span>{downloadingDocx ? 'Exporting…' : 'Word (.docx)'}</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close PDF preview"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#ffffff',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                marginLeft: '4px'
              }}
            >
              <FiX style={{ fontSize: '1.2rem' }} />
            </button>
          </div>
        </div>

        {/* Status Notification Banner */}
        {statusMessage && (
          <div
            style={{
              background: '#047857',
              color: '#ffffff',
              padding: '8px 16px',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <FiCheck /> {statusMessage}
          </div>
        )}

        {/* Canvas & A4 Document Viewport */}
        <div
          style={{
            flex: 1,
            backgroundColor: '#0f172a',
            overflow: 'auto',
            padding: '32px 16px 64px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        >
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              width: '794px',
              backgroundColor: '#ffffff',
              boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.1)',
              borderRadius: '2px',
              transition: 'transform 0.15s ease-out'
            }}
          >
            <TemplateRenderer
              templateId={selectedTemplate}
              values={normalizedData}
              language="en"
              onError={(err) => console.error('Enterprise PDF preview error:', err)}
            />
          </div>
        </div>

        {/* Footer Hint Bar */}
        <div
          style={{
            padding: '8px 20px',
            background: '#1e293b',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.74rem',
            color: '#94a3b8',
            flexShrink: 0
          }}
        >
          <div>
            Press <kbd style={{ background: 'rgba(255, 255, 255, 0.15)', padding: '2px 6px', borderRadius: '4px', color: '#ffffff' }}>ESC</kbd> to close &bull; High-Fidelity Enterprise Render Engine
          </div>
          <div>
            Template: <strong>{selectedTemplate}</strong> &bull; Showing authentic A4 pagination
          </div>
        </div>
      </div>
    </div>
  );
}
