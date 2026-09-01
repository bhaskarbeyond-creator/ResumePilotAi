import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import fire from '../../../conf/fire';
import { TEMPLATE_CATALOG } from '../../../utils/templateCatalog';
import { getWebsiteData } from '../../../services/api/platform';
import { 
  FaLayerGroup, FaCheckCircle, FaEye, FaArrowRight, FaTimes, FaShieldAlt, 
  FaStar, FaLock, FaCheck, FaCrown
} from 'react-icons/fa';

export default function HomepageTemplates({ onOpenAuthModal }) {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [proTemplateIds, setProTemplateIds] = useState(['Cv1', 'Cv2', 'Cv5']);
  const [disabledTemplateIds, setDisabledTemplateIds] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    let unsubscribe = () => {};
    if (fire?.auth) {
      try {
        unsubscribe = fire.auth().onAuthStateChanged((user) => {
          setCurrentUser(user);
        });
      } catch (_) {}
    }
    return () => unsubscribe();
  }, []);

  // Fetch authoritative template management flags from MariaDB via public-config
  useEffect(() => {
    let mounted = true;
    getWebsiteData()
      .then((data) => {
        if (mounted && data?.templateManager) {
          if (Array.isArray(data.templateManager.proCvTemplates)) {
            setProTemplateIds(data.templateManager.proCvTemplates);
          }
          if (Array.isArray(data.templateManager.disabledCvTemplates)) {
            setDisabledTemplateIds(data.templateManager.disabledCvTemplates);
          }
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const categories = [
    { id: 'all', label: 'All Formats (51)' },
    { id: 'professional', label: 'Executive Leadership' },
    { id: 'modern', label: 'Modern Split' },
    { id: 'simple', label: 'Minimalist ATS Pure' },
    { id: 'creative', label: 'Technical & Engineering' },
    { id: 'europass', label: 'Europass Standard' }
  ];

  // Filter out any templates disabled in MariaDB settings
  const activeCatalog = TEMPLATE_CATALOG.filter(t => !disabledTemplateIds.includes(t.id));

  const filteredTemplates = selectedCategory === 'all'
    ? activeCatalog.slice(0, 6) // Show top 6 diverse curated formats on landing
    : activeCatalog.filter(t => t.category === selectedCategory).slice(0, 6);

  const handleUseTemplate = (templateId) => {
    const user = fire?.auth?.()?.currentUser;
    if (user) {
      navigate(`/build-resume/heading?template=${templateId}`);
    } else if (onOpenAuthModal) {
      const tpl = TEMPLATE_CATALOG.find(t => t.id === templateId);
      onOpenAuthModal('signup', `Create your free account to use the "${tpl?.name || templateId}" template`);
    } else {
      window.location.href = `/login?next=%2Fbuild-resume%2Fheading%3Ftemplate%3D${templateId}`;
    }
  };

  return (
    <section id="templates" className="rp-section-pad" style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
      <div className="rp-container" style={{ textAlign: 'center' }}>
        
        {/* Section Header */}
        <div style={{ maxWidth: '820px', margin: '0 auto 40px auto' }}>
          <div className="rp-story-tag blue">
            <FaLayerGroup />
            <span>51 Enterprise ATS Layouts</span>
          </div>
          <h2 style={{ fontSize: 'clamp(2rem, 3.2vw + 0.5rem, 3rem)', fontWeight: '800', color: 'var(--rp-text-title)', letterSpacing: '-0.03em', margin: '0 0 16px 0' }}>
            Recruiter-Tested Templates Built for Every Career Stage
          </h2>
          <p style={{ fontSize: '1.125rem', color: 'var(--rp-text-body)', margin: 0, lineHeight: 1.7 }}>
            Every layout is mathematically tested against Workday, Greenhouse, Taleo, and Lever parsing engines. Preview any template for free — register your free account to build and export.
          </p>
        </div>

        {/* Category Switcher */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginBottom: '48px' }}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                padding: '8px 20px',
                borderRadius: '9999px',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                border: selectedCategory === cat.id ? '1px solid #1a73e8' : '1px solid #cbd5e1',
                background: selectedCategory === cat.id ? '#1a73e8' : '#ffffff',
                color: selectedCategory === cat.id ? '#ffffff' : '#475569',
                boxShadow: selectedCategory === cat.id ? '0 2px 8px rgba(26, 115, 232, 0.3)' : 'none'
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Large Template Showcase Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '32px', marginBottom: '48px' }}>
          {filteredTemplates.map((tpl) => {
            const isPro = proTemplateIds.includes(tpl.id);
            return (
              <div key={tpl.id} className="rp-template-hero-card rp-template-card">
                
                {/* Large Sheet Mockup Frame */}
                <div className="rp-template-sheet-mockup">
                  
                  {/* Header band */}
                  <div style={{ borderLeft: `4px solid ${tpl.primary || '#1a73e8'}`, paddingLeft: '14px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>Jordan Vance</div>
                      {isPro && (
                        <span style={{ fontSize: '10px', fontWeight: '800', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '9999px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FaCrown /> PRO
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: tpl.primary || '#1a73e8' }}>
                      Senior Systems Architect
                    </div>
                  </div>

                  {/* Summary Lines */}
                  <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
                    <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.5 }}>
                      Seasoned architect leading cloud transformation and distributed microservices with 99.99% SLA.
                    </div>
                  </div>

                  {/* Experience & Skills */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#0f172a' }}>• Lead Infrastructure Engineer — Nexus Corp</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Engineered auto-scaling Kubernetes clusters saving $180K annually.</div>
                  </div>

                  {/* ATS Compliance Tag & Archetype */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #cbd5e1', marginTop: 'auto' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
                      {tpl.archetype.replace('-', ' ')}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#137333', background: '#e6f4ea', padding: '3px 8px', borderRadius: '9999px' }}>
                      ATS 100%
                    </span>
                  </div>

                </div>

                {/* Card Meta & Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: '17px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                      {tpl.name}
                    </h3>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8' }}>
                      {tpl.id}
                    </span>
                  </div>
                  
                  <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                    {tpl.description}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: 'auto' }}>
                    <button
                      type="button"
                      onClick={() => setPreviewTemplate(tpl)}
                      style={{
                        padding: '10px 18px',
                        borderRadius: '9999px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#334155',
                        fontSize: '13px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <FaEye />
                      <span>Preview</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUseTemplate(tpl.id)}
                      className="rp-btn-hero-primary"
                      style={{ padding: '10px 20px', fontSize: '13px', flexGrow: 1, justifyContent: 'center' }}
                    >
                      <span>{currentUser ? 'Use Template' : 'Use This Template'}</span>
                      <FaArrowRight style={{ fontSize: '11px' }} />
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>

        {/* Global Library Callout */}
        <p style={{ fontSize: '14px', color: '#64748b' }}>
          Showing curated formats from the authoritative 51-template catalog. All templates support custom palettes and drag-and-drop section reordering in the Resume Studio.
        </p>

      </div>

      {/* Template Preview Modal */}
      {previewTemplate && (
        <div 
          className="rp-modal-overlay"
          onClick={() => setPreviewTemplate(null)}
          role="dialog"
          aria-modal="true"
        >
          <div 
            className="rp-modal-container"
            style={{ maxWidth: '780px', padding: '32px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0' }}>
                  {previewTemplate.name}
                </h3>
                <span style={{ fontSize: '12px', fontWeight: '800', color: '#1a73e8' }}>
                  Format ID: {previewTemplate.id} • {previewTemplate.archetype || 'ATS Certified'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <FaTimes />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', textAlign: 'left', marginBottom: '28px' }}>
              <div style={{ background: '#f8fafd', padding: '20px', borderRadius: '16px', border: '1px solid #cbd5e1' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>ATS Certified Extraction</h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                  Guaranteed 100% readability across Workday, Greenhouse, Taleo, and Lever parsing algorithms.
                </p>
              </div>

              <div style={{ background: '#f8fafd', padding: '20px', borderRadius: '16px', border: '1px solid #cbd5e1' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>Dual Export Pipeline</h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                  Export pixel-perfect vector PDF and fully editable native Microsoft Word (.docx) documents.
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '14px', paddingTop: '18px', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                style={{ padding: '10px 22px', borderRadius: '9999px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155', fontWeight: '700', cursor: 'pointer' }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = previewTemplate.id;
                  setPreviewTemplate(null);
                  handleUseTemplate(id);
                }}
                className="rp-btn-hero-primary"
              >
                <span>{currentUser ? 'Use Template' : 'Use This Template'}</span>
                <FaArrowRight />
              </button>
            </div>

          </div>
        </div>
      )}
    </section>
  );
}

