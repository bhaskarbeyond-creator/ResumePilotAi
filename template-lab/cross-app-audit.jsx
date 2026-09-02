import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/tailwind.css';
import '../src/index.scss';
import '../src/index.css';
import { BrowserRouter } from 'react-router-dom';
import RouteErrorBoundary from '../src/components/common/RouteErrorBoundary.jsx';
import PreviewModal from '../src/components/BuildResume/PreviewModal.jsx';
import PremiumUpgradeModal from '../src/components/common/PremiumUpgradeModal.jsx';
import SubscriptionModal from '../src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx';
import ShareModal from '../src/components/Dashboard/ShareModal/ShareModal.jsx';
import { FaShareAlt, FaDownload, FaFileAlt, FaEye, FaPencilAlt, FaCheck, FaEllipsisH } from 'react-icons/fa';

const sampleDocument = {
  id: 'resume-audit-101',
  revision: 3,
  firstname: 'Alexander',
  lastname: 'Morgan',
  template: 'Cv1',
  item: {
    firstname: 'Alexander',
    lastname: 'Morgan',
    template: 'Cv1',
    title: 'Alexander Morgan - Senior Cloud Architect',
    summary: 'Senior Cloud Architect with 12 years of experience.',
  }
};

function CrossAppAuditHarness() {
  const [userRole, setUserRole] = useState('FREE'); // 'FREE', 'PREMIUM', 'ENTERPRISE'
  const [allowFreePdfDownload, setAllowFreePdfDownload] = useState(false);
  const [allowFreeDocxDownload, setAllowFreeDocxDownload] = useState(false);
  const [allowFreeShareLink, setAllowFreeShareLink] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showPremiumUpgradeModal, setShowPremiumUpgradeModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [shareModal, setShareModal] = useState({ isOpen: false, documentId: null, documentTitle: '' });
  const [pendingDownloadDocument, setPendingDownloadDocument] = useState(null);
  const [pendingDownloadType, setPendingDownloadType] = useState('pdf');
  const [isPublishing, setIsPublishing] = useState(false);
  const [downloadSuccessCount, setDownloadSuccessCount] = useState(0);
  const [lastAction, setLastAction] = useState('none');
  const [openDropdown, setOpenDropdown] = useState(false);

  // Download PDF Handler matching DashboardHomepage.jsx
  const handleDownloadPdf = async (doc) => {
    if (showPremiumUpgradeModal || showSubscriptionModal) return;
    setLastAction('download-pdf-initiated');

    if (userRole === 'FREE' && !allowFreePdfDownload) {
      // Backend returns 402 ACTIVE_SUBSCRIPTION_REQUIRED
      setShowPreviewModal(false);
      setPendingDownloadDocument(doc);
      setPendingDownloadType('pdf');
      setShowPremiumUpgradeModal(true);
      setLastAction('pdf-upgrade-modal-opened');
    } else {
      // Authorized download proceeds
      setDownloadSuccessCount((c) => c + 1);
      setLastAction('pdf-download-authorized');
    }
  };

  // Download DOCX Handler matching DashboardHomepage.jsx
  const handleDownloadDocx = async (doc) => {
    if (showPremiumUpgradeModal || showSubscriptionModal) return;
    setLastAction('download-docx-initiated');

    if (userRole === 'FREE' && !allowFreeDocxDownload) {
      // Backend returns 402 ACTIVE_SUBSCRIPTION_REQUIRED
      setShowPreviewModal(false);
      setPendingDownloadDocument(doc);
      setPendingDownloadType('docx');
      setShowPremiumUpgradeModal(true);
      setLastAction('docx-upgrade-modal-opened');
    } else {
      // Authorized download proceeds
      setDownloadSuccessCount((c) => c + 1);
      setLastAction('docx-download-authorized');
    }
  };

  // Share Resume Handler matching updated DashboardHomepage.jsx
  const handleShareResume = async (doc) => {
    if (showPremiumUpgradeModal || showSubscriptionModal) return;
    if (isPublishing) return;

    if (userRole === 'FREE' && !allowFreeShareLink) {
      setShowPreviewModal(false);
      setPendingDownloadDocument(doc);
      setPendingDownloadType('share');
      setShowPremiumUpgradeModal(true);
      setLastAction('share-upgrade-modal-opened');
      return;
    }

    setIsPublishing(true);
    setLastAction('share-publishing');

    // Simulate backend publication to MariaDB public_resumes for paid members or allowed free members
    setTimeout(() => {
      setIsPublishing(false);
      setShareModal({
        isOpen: true,
        documentId: doc.id,
        documentTitle: doc.item?.title || 'Resume',
      });
      setLastAction('share-modal-opened');
    }, 50);
  };

  return (
    <BrowserRouter>
      <RouteErrorBoundary>
        <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8">
          {/* Header & Role Switcher */}
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                Cross-App Download & Share Entitlement Audit
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1">
                Visualizing Free tier gating ("PRO CAREER PASS") vs Paid allowances across all viewports.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Role Switcher */}
              <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 pl-2">Role:</span>
                <button
                  id="role-free-btn"
                  type="button"
                  onClick={() => setUserRole('FREE')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                    userRole === 'FREE' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Free Candidate
                </button>
                <button
                  id="role-premium-btn"
                  type="button"
                  onClick={() => setUserRole('PREMIUM')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                    userRole === 'PREMIUM' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Pro / Premium
                </button>
                <button
                  id="role-enterprise-btn"
                  type="button"
                  onClick={() => setUserRole('ENTERPRISE')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                    userRole === 'ENTERPRISE' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Enterprise
                </button>
              </div>

              {/* Free Tier Granular Toggles */}
              <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm text-xs">
                <span className="font-semibold text-slate-700">Free Toggles:</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    id="toggle-free-pdf"
                    type="checkbox"
                    checked={allowFreePdfDownload}
                    onChange={(e) => setAllowFreePdfDownload(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span>Allow PDF</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    id="toggle-free-docx"
                    type="checkbox"
                    checked={allowFreeDocxDownload}
                    onChange={(e) => setAllowFreeDocxDownload(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span>Allow DOCX</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    id="toggle-free-share"
                    type="checkbox"
                    checked={allowFreeShareLink}
                    onChange={(e) => setAllowFreeShareLink(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span>Allow Share</span>
                </label>
              </div>
            </div>
          </header>

          {/* State Debugger */}
          <div id="state-debugger" className="my-4 p-3 bg-white rounded-xl border border-slate-200 text-xs font-mono grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>userRole: <span id="state-role" className="font-bold">{userRole}</span></div>
            <div>allowPdf: <span id="state-allowPdf">{String(allowFreePdfDownload)}</span></div>
            <div>allowDocx: <span id="state-allowDocx">{String(allowFreeDocxDownload)}</span></div>
            <div>allowShare: <span id="state-allowShare">{String(allowFreeShareLink)}</span></div>
            <div>showPreview: <span id="state-showPreview">{String(showPreviewModal)}</span></div>
            <div>showUpgrade: <span id="state-showUpgrade">{String(showPremiumUpgradeModal)}</span></div>
            <div>showShare: <span id="state-showShare">{String(shareModal.isOpen)}</span></div>
            <div>downloadType: <span id="state-downloadType">{pendingDownloadType}</span></div>
            <div>downloadSuccess: <span id="state-downloadSuccess">{downloadSuccessCount}</span></div>
            <div className="col-span-2">lastAction: <span id="state-lastAction">{lastAction}</span></div>
          </div>

          {/* Simulated "My Resumes" Card matching DashboardHomepage.jsx exact DOM */}
          <section className="mt-8 max-w-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">My Resumes</h2>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 relative">
              {/* Header with ellipsis dropdown */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{sampleDocument.item.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Template: {sampleDocument.template} • Updated recently</p>
                </div>
                <div className="relative">
                  <button
                    id="card-dropdown-btn"
                    type="button"
                    onClick={() => setOpenDropdown(!openDropdown)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                    aria-label="More options"
                  >
                    <FaEllipsisH />
                  </button>
                  {openDropdown && (
                    <div id="card-dropdown-menu" className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-20">
                      <button
                        type="button"
                        className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        onClick={() => {
                          setShowPreviewModal(true);
                          setOpenDropdown(false);
                        }}
                      >
                        <FaEye className="text-indigo-600" /> Full Size Preview
                      </button>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        onClick={() => {
                          handleShareResume(sampleDocument);
                          setOpenDropdown(false);
                        }}
                      >
                        <FaShareAlt className="text-indigo-600" /> Share Resume
                      </button>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        onClick={() => {
                          handleDownloadPdf(sampleDocument);
                          setOpenDropdown(false);
                        }}
                      >
                        <FaDownload className="text-emerald-600" /> Download PDF
                      </button>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        onClick={() => {
                          handleDownloadDocx(sampleDocument);
                          setOpenDropdown(false);
                        }}
                      >
                        <FaFileAlt className="text-blue-600" /> Download Word (DOCX)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons as seen in Screenshot */}
              <div className="space-y-2.5 pt-2">
                {/* 1. Edit Resume */}
                <button
                  id="card-edit-btn"
                  type="button"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
                  onClick={() => setLastAction('edit-resume-clicked')}
                >
                  <FaPencilAlt className="w-3.5 h-3.5" />
                  <span>Edit Resume</span>
                </button>

                {/* 2. Share Resume */}
                <button
                  id="card-share-btn"
                  type="button"
                  className="w-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
                  onClick={() => handleShareResume(sampleDocument)}
                  disabled={isPublishing}
                >
                  <FaShareAlt className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{isPublishing ? 'Publishing…' : 'Share Resume'}</span>
                </button>

                {/* 3. Download PDF */}
                <button
                  id="card-download-pdf-btn"
                  type="button"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
                  onClick={() => handleDownloadPdf(sampleDocument)}
                >
                  <FaDownload className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>

                {/* 4. Download Word (DOCX) - Visible to all, free users routed to PRO CAREER PASS */}
                <button
                  id="card-download-docx-btn"
                  type="button"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
                  onClick={() => handleDownloadDocx(sampleDocument)}
                >
                  <FaFileAlt className="w-3.5 h-3.5" />
                  <span>Download Word (DOCX)</span>
                </button>
              </div>
            </div>
          </section>

          {/* Full Size Preview Modal */}
          <PreviewModal
            showPreview={showPreviewModal}
            setShowPreview={setShowPreviewModal}
            resumeData={sampleDocument.item}
            currentTemplate="Cv1"
            getTemplateName={() => 'Cv1'}
            onShare={() => handleShareResume(sampleDocument)}
            isSharing={isPublishing}
            onDownload={() => handleDownloadPdf(sampleDocument)}
            isDownloading={false}
            onDownloadDocx={() => handleDownloadDocx(sampleDocument)}
            isDownloadingDocx={false}
          />

          {/* PRO CAREER PASS Premium Upgrade Modal */}
          <PremiumUpgradeModal
            isOpen={showPremiumUpgradeModal}
            onClose={() => {
              setShowPremiumUpgradeModal(false);
              setPendingDownloadDocument(null);
            }}
            onUpgrade={() => {
              setShowPremiumUpgradeModal(false);
              setShowSubscriptionModal(true);
            }}
            downloadType={pendingDownloadType}
            resumeTitle={sampleDocument.item.firstname}
          />

          {/* In-Place Checkout Subscription Modal */}
          <SubscriptionModal
            isOpen={showSubscriptionModal}
            onClose={() => {
              setShowSubscriptionModal(false);
              setPendingDownloadDocument(null);
            }}
            user={{ uid: 'audit-test-user' }}
            onSuccess={() => {
              setShowSubscriptionModal(false);
              const type = pendingDownloadType;
              setPendingDownloadDocument(null);
              setDownloadSuccessCount((c) => c + 1);
              setLastAction(`upgraded-and-downloaded-${type}`);
            }}
          />

          {/* Authoritative Share Modal */}
          {shareModal.isOpen && (
            <ShareModal
              isOpen={shareModal.isOpen}
              onClose={() => setShareModal({ isOpen: false, documentId: null, documentTitle: '' })}
              documentId={shareModal.documentId}
              documentTitle={shareModal.documentTitle}
            />
          )}
        </div>
      </RouteErrorBoundary>
    </BrowserRouter>
  );
}

const root = createRoot(document.getElementById('audit-root'));
root.render(<CrossAppAuditHarness />);
document.documentElement.setAttribute('data-lab-state', 'ready');
