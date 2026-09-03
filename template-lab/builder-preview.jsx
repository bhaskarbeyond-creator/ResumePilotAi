import './i18n.bootstrap.js';
import '../src/tailwind.css';
import '../src/index.css';
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BuildResume from '../src/components/BuildResume/BuildResume.jsx';
import { AuthContext } from '../src/main';

const mockUser = {
    uid: 'qa-tester-uid-01',
    email: 'jane.doe@example.com',
    displayName: 'Jane Doe',
    getIdToken: async () => 'mock-token',
    getIdTokenResult: async () => ({ claims: {}, authTime: Date.now() / 1000 }),
};

const params = new URLSearchParams(window.location.search);
const activeStep = params.get('step') || 'heading';

document.documentElement.setAttribute('data-lab-state', 'rendering');

function AppHarness() {
    useEffect(() => {
        const t = setTimeout(() => {
            document.documentElement.setAttribute('data-lab-state', 'ready');
        }, 600);
        return () => clearTimeout(t);
    }, []);

    return (
        <AuthContext.Provider value={mockUser}>
            <MemoryRouter initialEntries={[`/create-resume/${activeStep}`]}>
                <div className="w-full min-h-screen bg-slate-50 flex flex-col">
                    <Routes>
                        <Route path="/create-resume/*" element={<BuildResume />} />
                    </Routes>
                </div>
            </MemoryRouter>
        </AuthContext.Provider>
    );
}

const container = document.getElementById('root');
if (!window.__builderPreviewRoot) {
    window.__builderPreviewRoot = createRoot(container);
}
window.__builderPreviewRoot.render(<AppHarness />);
