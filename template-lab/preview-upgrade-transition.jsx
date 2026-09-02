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

const sampleResumeData = {
  firstname: 'Alexander',
  lastname: 'Morgan',
  email: 'alex.morgan@example.com',
  phone: '+1 (555) 019-2834',
  occupation: 'Principal Cloud Architect',
  city: 'San Francisco',
  country: 'USA',
  summary: 'Architecting ultra-resilient distributed systems with 99.999% uptime SLA.',
  workHistory: [
    {
      jobTitle: 'Principal Architect',
      employer: 'Apex Cloud Solutions',
      city: 'San Francisco',
      state: 'CA',
      startDate: '2022-01',
      endDate: '',
      current: true,
      description: 'Lead architect for global serverless control planes.'
    }
  ],
  educations: [
    {
      school: 'Stanford University',
      degree: 'B.S. Computer Science',
      startDate: '2016-09',
      endDate: '2020-06'
    }
  ],
  skills: ['Kubernetes', 'Go', 'Node.js', 'PostgreSQL', 'Distributed Systems'],
  languages: ['English', 'German'],
  completedSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
};

function TransitionHarness() {
  const [showPreview, setShowPreview] = useState(true);
  const [showPremiumUpgradeModal, setShowPremiumUpgradeModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [pendingExportType, setPendingExportType] = useState(null);
  const [completedAction, setCompletedAction] = useState(null);

  // Gated download handlers matching BuildResume.jsx state machine
  const handleDownload = () => {
    // Free user attempting PDF download
    setShowPreview(false);
    setPendingExportType('pdf');
    setShowPremiumUpgradeModal(true);
  };

  const handleDocxDownload = () => {
    // Free user attempting DOCX download
    setShowPreview(false);
    setPendingExportType('docx');
    setShowPremiumUpgradeModal(true);
  };

  return (
    <BrowserRouter>
      <RouteErrorBoundary>
        <div className="p-8">
          <h1 className="text-xl font-bold mb-4 text-slate-900">Preview to Upgrade Transition Harness</h1>
          
          <div className="flex gap-3 mb-6">
            <button
              id="reopen-preview-btn"
              onClick={() => setShowPreview(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors"
            >
              Open Resume Preview
            </button>
            <button
              id="open-upgrade-btn"
              onClick={() => setShowPremiumUpgradeModal(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold transition-colors"
            >
              Open Upgrade Modal Directly
            </button>
          </div>

          <div id="state-debugger" className="p-4 bg-white rounded-xl border border-slate-200 text-xs font-mono space-y-1">
            <p>showPreview: <span id="state-showPreview">{String(showPreview)}</span></p>
            <p>showPremiumUpgradeModal: <span id="state-showUpgrade">{String(showPremiumUpgradeModal)}</span></p>
            <p>showSubscriptionModal: <span id="state-showSubscription">{String(showSubscriptionModal)}</span></p>
            <p>pendingExportType: <span id="state-exportType">{String(pendingExportType)}</span></p>
            <p>completedAction: <span id="state-completedAction">{String(completedAction)}</span></p>
          </div>

          {/* Resume Preview Modal */}
          <PreviewModal
            showPreview={showPreview}
            setShowPreview={setShowPreview}
            resumeData={sampleResumeData}
            currentTemplate="Cv1"
            getTemplateName={() => 'Professional Classic'}
            onDownload={handleDownload}
            isDownloading={false}
            onDownloadDocx={handleDocxDownload}
            isDownloadingDocx={false}
          />

          {/* PRO CAREER PASS Upgrade Modal */}
          <PremiumUpgradeModal
            isOpen={showPremiumUpgradeModal}
            onClose={() => {
              setShowPremiumUpgradeModal(false);
              setPendingExportType(null);
            }}
            onUpgrade={() => {
              setShowPremiumUpgradeModal(false);
              setShowSubscriptionModal(true);
            }}
            downloadType={pendingExportType || 'pdf'}
            resumeTitle="Alexander's Resume"
          />

          {/* Checkout & Subscription Modal */}
          <SubscriptionModal
            isOpen={showSubscriptionModal}
            onClose={() => {
              setShowSubscriptionModal(false);
              setPendingExportType(null);
            }}
            user={{ uid: 'free-user-transition-test' }}
            onSuccess={() => {
              setShowSubscriptionModal(false);
              setCompletedAction(pendingExportType);
              document.body.setAttribute('data-completed-action', pendingExportType || 'none');
            }}
          />
        </div>
      </RouteErrorBoundary>
    </BrowserRouter>
  );
}

const root = createRoot(document.getElementById('lab-root'));
root.render(<TransitionHarness />);
document.documentElement.setAttribute('data-lab-state', 'ready');
