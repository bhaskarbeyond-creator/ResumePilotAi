// DEV-ONLY harness. The support component mounts without a signed-in user, so
// the ticket list remains empty and no candidate data or live API is used.
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/tailwind.css';
import '../src/index.css';
import DashboardSupport from '../src/components/Dashboard/DashboardSupport/DashboardSupport';

window.supportToasts = [];
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DashboardSupport showToast={(...args) => window.supportToasts.push(args)} />
  </StrictMode>,
);
