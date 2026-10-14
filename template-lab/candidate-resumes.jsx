// DEV-ONLY isolated harness. All resume reads and writes are intercepted in
// memory; no real candidate account, database, or resume is touched.
import React, { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import '../src/tailwind.css';
import '../src/index.css';
import { AuthContext } from '../src/context/AuthContext';
import DashboardResumes from '../src/components/Dashboard/DashboardResumes/DashboardResumes';
import { calculateAtsScore } from '../src/utils/atsScore';

const strongResume = {
    firstname: 'Maya', lastname: 'Iyer', email: 'maya.iyer@example.com', phone: '+1 415 555 0199',
    city: 'San Francisco', country: 'US', occupation: 'Senior Software Engineer',
    summary: 'Senior engineer who ships reliable product surfaces. I lead cross-functional delivery, coach teammates, and keep production incidents rare.',
    employments: [
        {
            jobTitle: 'Senior Software Engineer', employer: 'Northwind Labs', begin: '2021', end: 'Present',
            description: '<ul><li>Led a 6-person platform team that reduced checkout latency 37% for 2.1 million monthly buyers.</li><li>Shipped a billing rewrite that cut failed payments by 18% and recovered $1.4M annual revenue.</li><li>Mentored four engineers through on-call ownership and design reviews.</li></ul>',
        },
        {
            jobTitle: 'Software Engineer', employer: 'Harbor Systems', begin: '2018', end: '2021',
            description: '<ul><li>Built event-driven services that processed 12 million daily messages with 99.95% success.</li><li>Automated release checks and reduced rollback time from 40 minutes to 8 minutes.</li></ul>',
        },
    ],
    educations: [{ school: 'Carnegie Mellon University', degree: 'B.S. Computer Science', started: '2014', finished: '2018' }],
    skills: [
        { name: 'React Native' }, { name: 'Node.js' }, { name: 'TypeScript' }, { name: 'PostgreSQL' },
        { name: 'Google Cloud' }, { name: 'CI/CD' }, { name: 'System Design' }, { name: 'Product Discovery' },
    ],
    projects: [{ title: 'Field Ops Companion', url: 'https://github.com/example/field-ops', description: 'Mobile React Native app that routed 400 field techs and cut idle travel time 22% using live telemetry.' }],
    certifications: [{ title: 'Professional Cloud Architect', issuer: 'Google Cloud', date: '2023' }],
    achievements: [{ title: 'Delivery Excellence Award', description: 'Recognized for a zero-downtime migration serving 3M users.' }],
};

const fromSearch = new URLSearchParams(window.location.search);
const count = fromSearch.get('mode') === 'empty' ? 0 : 37;
const fixtures = Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const item = index === 1
        ? { ...strongResume, title: 'Resume 01' }
        : {
            ...strongResume,
            title: `Resume ${String(index).padStart(2, '0')}`,
            firstname: `Candidate ${String(index).padStart(2, '0')}`,
            lastname: 'Example',
            occupation: index === 2 ? 'Resume 02' : (index % 3 === 0 ? 'Product Manager' : 'Software Engineer'),
        };
    const updated = new Date(Date.UTC(2026, 0, index)).toISOString();
    return {
        id: `resume-${String(index).padStart(2, '0')}`,
        revision: 1,
        template: index % 2 === 0 ? 'Cv1' : 'Cv2',
        updated_at: updated,
        ...item,
    };
});

window.__resumeLab = {
    mode: fromSearch.get('mode') || 'success',
    fixtures,
    requests: [],
    toasts: [],
    location: '',
    blockStorage: false,
    scoreById: Object.fromEntries(fixtures.map((item) => [item.id, calculateAtsScore(item).qualityScore])),
};

const originalStorage = {
    getItem: Storage.prototype.getItem,
    setItem: Storage.prototype.setItem,
    removeItem: Storage.prototype.removeItem,
};
for (const method of ['getItem', 'setItem', 'removeItem']) {
    Storage.prototype[method] = function guardedStorage(...args) {
        if (window.__resumeLab?.blockStorage) throw new DOMException('Storage is blocked', 'SecurityError');
        return originalStorage[method].apply(this, args);
    };
}

const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
});
window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.origin);
    const method = String(options.method || 'GET').toUpperCase();
    window.__resumeLab.requests.push({ path: url.pathname, method });
    if (url.pathname === '/api/resumes' && method === 'GET') {
        if (window.__resumeLab.mode === 'error') return jsonResponse({ error: 'SIMULATED read failure' }, 503);
        return jsonResponse({ resumes: window.__resumeLab.fixtures });
    }
    if (url.pathname.startsWith('/api/resumes/') && method === 'POST') {
        if (window.__resumeLab.mode === 'save-error') return jsonResponse({ error: 'SIMULATED save failure' }, 503);
        const id = url.pathname.split('/').pop();
        const item = { ...JSON.parse(options.body || '{}'), id, revision: 1, updated_at: new Date().toISOString() };
        window.__resumeLab.fixtures.unshift(item);
        window.__resumeLab.scoreById[id] = calculateAtsScore(item).qualityScore;
        return jsonResponse({ resume: item });
    }
    if (url.pathname.startsWith('/api/resumes/') && method === 'DELETE') {
        if (window.__resumeLab.mode === 'delete-error') return jsonResponse({ error: 'SIMULATED delete failure' }, 503);
        const id = url.pathname.split('/').pop();
        window.__resumeLab.fixtures = window.__resumeLab.fixtures.filter((item) => item.id !== id);
        delete window.__resumeLab.scoreById[id];
        return jsonResponse({}, 200);
    }
    if (url.pathname.startsWith('/api/users-data/')) {
        return jsonResponse({ user: { firstname: 'Maya', lastname: 'Iyer' } });
    }
    return jsonResponse({});
};

function LocationProbe() {
    const location = useLocation();
    useEffect(() => {
        window.__resumeLab.location = `${location.pathname}${location.search}`;
    }, [location.pathname, location.search]);
    return null;
}

const i18n = i18next.createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common'],
    resources: { en: { common: {} } },
    interpolation: { escapeValue: false },
});

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <I18nextProvider i18n={i18n}>
            <MemoryRouter initialEntries={['/dashboard/resumes']}>
                <LocationProbe />
                <AuthContext.Provider value={{ uid: 'simulated-candidate' }}>
                    <DashboardResumes showToast={(...toast) => window.__resumeLab.toasts.push(toast)} />
                </AuthContext.Provider>
            </MemoryRouter>
        </I18nextProvider>
    </StrictMode>,
);
