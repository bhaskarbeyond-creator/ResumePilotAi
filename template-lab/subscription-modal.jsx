import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/tailwind.css';
import '../src/index.scss';
import '../src/index.css';
import { BrowserRouter } from 'react-router-dom';
import RouteErrorBoundary from '../src/components/common/RouteErrorBoundary.jsx';
import SubscriptionModal from '../src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx';

function Harness() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <BrowserRouter>
      <RouteErrorBoundary>
        <div className="p-8">
          <h1 className="text-xl font-bold mb-4">Subscription Modal Harness</h1>
          <button
            id="open-modal-btn"
            onClick={() => setIsOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold"
          >
            Open Modal
          </button>

          <SubscriptionModal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            user={{ uid: 'test-user-browser-1' }}
            onSuccess={() => {
              document.body.setAttribute('data-payment-status', 'SUCCESS');
            }}
          />
        </div>
      </RouteErrorBoundary>
    </BrowserRouter>
  );
}

const root = createRoot(document.getElementById('lab-root'));
root.render(<Harness />);
document.documentElement.setAttribute('data-lab-state', 'ready');
