// Development-only component test entry. No auth bypass is installed in application routes.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AdminAiSettingsTab } from '../../src/components/admin/AdminAiSettingsTab';
import '../../src/index.css';
createRoot(document.getElementById('root')!).render(<BrowserRouter><main className="p-2"><AdminAiSettingsTab /></main></BrowserRouter>);
