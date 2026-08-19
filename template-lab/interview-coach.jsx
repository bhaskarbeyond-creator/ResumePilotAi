import React from 'react';
import { createRoot } from 'react-dom/client';
import DashboardInterviews from '../src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx';
import { AuthContext } from '../src/main';
import '../src/tailwind.css';
import '../src/index.css';

const mockUser = {
    uid: 'candidate-coach-test-123',
    email: 'candidate@test.com',
    displayName: 'Test Candidate',
    getIdToken: async () => 'mock-test-token',
    getIdTokenResult: async () => ({ claims: {}, authTime: Date.now() / 1000, issuedAtTime: Date.now() / 1000 }),
};

document.documentElement.setAttribute('data-lab-state', 'rendering');

const container = document.getElementById('root');
if (!container._reactRoot) {
    container._reactRoot = createRoot(container);
}
container._reactRoot.render(
    <AuthContext.Provider value={mockUser}>
        <DashboardInterviews />
    </AuthContext.Provider>
);

requestAnimationFrame(() => {
    document.documentElement.setAttribute('data-lab-state', 'ready');
});
