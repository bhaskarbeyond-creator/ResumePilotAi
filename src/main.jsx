import './bootstrap';
import React, { Suspense, lazy, useState, useEffect, useRef, createContext } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { isSafeInternalPath, loginPathWithNext, getPostLoginRedirectPath, clearPostLoginRedirectPath } from './utils/safeInternalPath';
import './tailwind.css';
import './index.scss';
import './index.css';
import './cv-templates/css/globalTemplateEnhancements.css';
import './i18n'; // Import i18n configuration

import * as serviceWorker from './serviceWorker';
import Spinner from './components/Spinner/Spinner';
import PublicResume from './components/PublicResume/PublicResume';
import fire from './conf/fire'; // Import fire
import GA4Provider from './components/GA4Provider';
import PrivacyConsentBanner from './components/PrivacyConsentBanner';
import i18n, { SUPPORTED_LANGUAGES } from './i18n';
import GoogleMapsProvider from './components/JobsListings/GoogleMapsProvider';
import axios from 'axios';

// Attach Firebase ID tokens at the browser-to-API trust boundary. The backend never
// accepts identity, role, or entitlement from request bodies.
async function getApiAuthorization() {
    let user = fire.auth().currentUser;
    if (!user) {
        try {
            user = await new Promise((resolve) => {
                const unsubscribe = fire.auth().onAuthStateChanged((u) => {
                    unsubscribe();
                    resolve(u);
                });
                setTimeout(() => resolve(fire.auth().currentUser), 1500);
            });
        } catch {
            user = fire.auth().currentUser;
        }
    }
    return user ? `Bearer ${await user.getIdToken()}` : null;
}

function isSameOriginApiUrl(value, baseUrl) {
    if (typeof window === 'undefined' || !value) return false;
    try {
        const parsed = new URL(String(value), baseUrl || window.location.origin);
        return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/');
    } catch (_) { return false; }
}

axios.interceptors.request.use(async (request) => {
    if (isSameOriginApiUrl(request.url, request.baseURL)) {
        const authorization = await getApiAuthorization();
        if (authorization) request.headers.Authorization = authorization;
    }
    return request;
});

if (typeof window !== 'undefined') {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input?.url;
        if (!isSameOriginApiUrl(url)) return nativeFetch(input, init);
        const authorization = await getApiAuthorization();
        const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
        if (authorization) headers.set('Authorization', authorization);
        return nativeFetch(input, { ...init, headers });
    };
    window.fire = fire;
}

// Create a Context for authentication
export const AuthContext = createContext(null);

const Welcome = lazy(() => import('./components/welcome/Welcome'));
const Dashboard = lazy(() => import('./components/Dashboard/DashboardMain/DashboardMain'));
const Admin = lazy(() => import('./components/admin/Admin'));
const Contact = lazy(() => import('./components/Contact/Contact'));

const Exporter = lazy(() => import('./components/Exporter/Exporter'));
const Billing = lazy(() => import('./components/Billing/Plans/Plans'));
const CustomePage = lazy(() => import('./components/CustomPage/CustomePage'));
const Dashboard2 = lazy(() => import('./components/Dashboard2/dashboard2'));
const CoverLetter = lazy(() => import('./components/CoverLetter/CoverLetter'));
const PortfolioBuilder = lazy(() => import('./components/PortfolioBuilder/PortfolioBuilder'));
const PublicPortfolio = lazy(() => import('./components/PublicPortfolio/PublicPortfolio'));
const PortfolioGallery = lazy(() => import('./components/PortfolioGallery/PortfolioGallery'));
const BuildResume = lazy(() => import('./components/BuildResume/BuildResume'));
const EnterpriseConsole = lazy(() => import('./enterprise/EnterpriseConsole'));
const Features = lazy(() => import('./components/Features/Features'));
const JobsLanding = lazy(() => import('./components/JobsLanding/JobsLanding'));
const MainJobListings = lazy(() => import('./components/JobsListings/MainJobListings'));
const BlogList = lazy(() => import('./components/Blog/BlogList/BlogList'));
const BlogPost = lazy(() => import('./components/Blog/BlogPost/BlogPost'));
const BlogEditor = lazy(() => import('./components/Blog/BlogEditor/BlogEditor'));
// eslint-disable-next-line react-refresh/only-export-components
const NotFound = () => <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="text-center"><h1 className="text-3xl font-bold text-slate-900">Page not found</h1><p className="mt-3 text-slate-600">The requested page does not exist or is no longer available.</p><Link to="/" className="mt-5 inline-block rounded-lg bg-slate-900 px-4 py-2 text-white">Return home</Link></div></main>;
// eslint-disable-next-line react-refresh/only-export-components
function RequireAuthenticated({ user, children }) {
    const location = useLocation();
    if (user) return children;
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={loginPathWithNext(next)} replace />;
}

// eslint-disable-next-line react-refresh/only-export-components
function AdminAliasRedirect() {
    const location = useLocation();
    const suffix = location.pathname.replace(/^\/admin/, '') || '/';
    return <Navigate to={`/adm${suffix}${location.search}${location.hash}`} replace />;
}

// eslint-disable-next-line react-refresh/only-export-components
function PlatformAliasRedirect() {
    const location = useLocation();
    const suffix = location.pathname.replace(/^\/platform/, '') || '/';
    return <Navigate to={`/adm${suffix}${location.search}${location.hash}`} replace />;
}

// eslint-disable-next-line react-refresh/only-export-components
function PostLoginRedirect({ user }) {
    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => {
        if (!user) return;
        const target = getPostLoginRedirectPath(location.search);
        if (target && isSafeInternalPath(target)) {
            clearPostLoginRedirectPath();
            navigate(target, { replace: true });
        } else if (location.pathname === '/login') {
            navigate('/dashboard', { replace: true });
        }
    }, [user, location.pathname, location.search, navigate]);
    return null;
}

const AuthenticatedAppShell = lazy(() => import('./components/AppShell/AuthenticatedAppShell'));
// eslint-disable-next-line react-refresh/only-export-components
const MaybeApplicationShell = ({ user, children }) => (
    user ? <AuthenticatedAppShell>{children}</AuthenticatedAppShell> : children
);
import ResetPasswordModal from './components/auth/resetPassword/ResetPasswordModal';
import RouteSeo from './components/RouteSeo';
import RequireExportAccess from './components/Exporter/RequireExportAccess';
import RouteFocus from './components/RouteFocus';
import { clearAccountScopedBrowserState } from './utils/signOut';

// eslint-disable-next-line react-refresh/only-export-components
const AuthWrapper = () => {         
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [resetOobCode, setResetOobCode] = useState(null);
    const [directResetEmail, setDirectResetEmail] = useState(null);
    const [verificationBanner, setVerificationBanner] = useState(null);
    const [maintenance, setMaintenance] = useState({ loading: true, enabled: false, title: '', message: '', admin: false });
    const previousUserUid = useRef(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const authParam = key => params.get(key) || hashParams.get(key);
        const oobCode = params.get('oobCode'); // Firebase-managed links continue to use query parameters.
        const mode = authParam('mode');
        const reset = authParam('reset');
        const email = authParam('email');
        const token = authParam('token');
        const oauthCode = hashParams.get('oauth_code');

        if (mode === 'verifyEmail' && token && email) {
            fetch('/api/auth/verify-email-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, email })
            }).then(res => res.json()).then(data => {
                if (data.success) {
                    setVerificationBanner({ type: 'success', title: 'Account Verified! 🔑', text: data.message || 'Email verified successfully! You now have full access.' });
                    const curr = fire.auth().currentUser;
                    if (curr) {
                        if (typeof curr.reload === 'function') {
                            curr.reload().then(() => {
                                if (typeof curr.getIdToken === 'function') curr.getIdToken(true).catch(() => {});
                            }).catch(() => {});
                        } else if (typeof curr.getIdToken === 'function') {
                            curr.getIdToken(true).catch(() => {});
                        }
                    }
                    window.history.replaceState({}, document.title, window.location.pathname);
                } else {
                    setVerificationBanner({ type: 'error', title: 'Verification Notice', text: data.error || 'Token invalid or expired.' });
                }
            }).catch(e => {
                console.error('[AuthWrapper] Token verification error:', e);
                setVerificationBanner({ type: 'error', title: 'Verification Error', text: e.message });
            });
        } else if (oobCode && (mode === 'resetPassword' || !mode)) {
            setResetOobCode(oobCode);
        } else if ((mode === 'resetPassword' || reset === 'true' || token) && email) {
            setDirectResetEmail(email);
        }

        // Exchange the short-lived, single-use OAuth code for a genuine Firebase session.
        // Remove it from browser history before any later navigation can leak it via referrers.
        if (oauthCode && /^[A-Za-z0-9_-]{43}$/.test(oauthCode)) {
            window.history.replaceState({}, document.title, window.location.pathname);
            fetch('/api/auth/oauth/exchange', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: oauthCode })
            })
                .then(response => response.ok ? response.json() : Promise.reject(new Error('OAuth exchange failed')))
                .then(({ customToken }) => fire.auth().signInWithCustomToken(customToken))
                .catch(error => {
                    console.error('[OAuth exchange]', error.message);
                    setVerificationBanner({ type: 'error', title: 'Sign-in failed', text: 'The social sign-in link expired. Please try again.' });
                });
        }

        // ── STEP 2: Handle Google/Facebook Firebase Redirect Result ────────────────────────
        fire.auth().getRedirectResult().then((result) => {
            if (result && result.user) {
                const u = result.user;
                // Resolve actual provider (google.com → 'google', facebook.com → 'facebook')
                const rawProvider = result.additionalUserInfo?.providerId || u.providerData?.[0]?.providerId || '';
                const authProvider = rawProvider.replace('.com', '').split('.')[0] || 'google';
                const nameParts = (u.displayName || '').trim().split(' ');
                const firstName = nameParts[0] || 'User';
                const lastName = nameParts.slice(1).join(' ') || '';
                import('./services/api/users').then(({ default: addUser, updateUserOnLogin }) => {
                    addUser(u.uid, firstName, lastName, u.email, { authProvider, photoURL: u.photoURL || null }).then((userRes) => {
                        // New-account mail is enqueued atomically by the profile-create transaction.
                        if (!userRes?.isNewUser) {
                            updateUserOnLogin(u.uid, { photoURL: u.photoURL, displayName: u.displayName, authProvider }).catch(() => {});
                        }
                    });
                }).catch(() => {});
            }
        }).catch((err) => {
            console.error('[OAuth Redirect Error]:', err);
        });

        // ── STEP 3: Subscribe only to cryptographically verified Firebase sessions. ───────
        const unsubscribe = fire.auth().onAuthStateChanged((authenticatedUser) => {
            const nextUid = authenticatedUser?.uid || null;
            if (!nextUid || (previousUserUid.current && previousUserUid.current !== nextUid)) {
                clearAccountScopedBrowserState();
            }
            previousUserUid.current = nextUid;
            if (nextUid) {
                try { localStorage.setItem('user', nextUid); } catch { /* compatibility storage */ }
            }
            setUser(authenticatedUser || null);
            setAuthLoading(false);
        });

        // Cleanup auth subscription on unmount
        return () => unsubscribe();
    }, []);

    // App-shell relay for server-confirmed module configuration.
    // Fetches from the backend REST API (/api/platform/public-config),
    // eliminating any direct browser network dependency on Firestore.
    // Server configuration updates are propagated through the API-backed application event.
    useEffect(() => {
        let active = true;
        fetch('/api/platform/public-config')
            .then(response => {
                if (!response.ok) throw new Error('Public configuration is unavailable.');
                return response.json();
            })
            .then(settings => {
                if (!active) return;
                if (!/^mariadb(?:$|-)/.test(String(settings?._settingsSource || ''))) {
                    throw new Error('Public configuration is not MariaDB-authoritative.');
                }
                if (!settings?.modules || typeof settings.modules !== 'object') return;
                window.dispatchEvent(new CustomEvent('systemSettingsUpdated', {
                    detail: {
                        source: 'backend-api',
                        modules: settings.modules,
                        settings,
                    },
                }));
            })
            .catch(() => {
                if (active) window.dispatchEvent(new CustomEvent('systemSettingsUnavailable', {
                    detail: {
                        scope: 'public',
                        source: 'unavailable',
                        message: 'Authoritative MariaDB public configuration is unavailable.',
                    },
                }));
            });

        return () => { active = false; };
    }, []);

    // Public configuration and maintenance state come from the backend REST API;
    // MariaDB is the sole application-data owner and Firebase remains identity-only.
    useEffect(() => {
        if (authLoading) return undefined;
        let active = true;

        Promise.all([
            fetch('/api/platform/public-config', { cache: 'no-store' })
                .then(async response => response.ok ? response.json() : null)
                .catch(() => null),
            user?.getIdTokenResult?.().catch(() => null) || Promise.resolve(null),
        ]).then(([publicConfig, token]) => {
            if (!active) return;
            const role = String(token?.claims?.role || '').toUpperCase();
            const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(role);
            const authoritative = /^mariadb(?:$|-)/.test(String(publicConfig?._settingsSource || ''));
            if (!authoritative) {
                setMaintenance({
                    loading: false,
                    enabled: true,
                    title: 'Service temporarily unavailable',
                    message: 'Authoritative platform configuration is temporarily unavailable. Please try again later.',
                    admin: isAdmin,
                });
                return;
            }
            const config = publicConfig.systemHealth || {};
            setMaintenance({
                loading: false,
                enabled: config.maintenanceMode === true,
                title: 'Scheduled maintenance',
                message: String(config.maintenanceMessage || 'Scheduled maintenance is in progress.'),
                admin: isAdmin,
            });
        });

        return () => { active = false; };
    }, [authLoading, user]);

    // Add global language change listener to persist language changes
    useEffect(() => {
        const handleLanguageChanged = (lng) => {
            const language = SUPPORTED_LANGUAGES.includes(lng) ? lng : 'en';
            try {
                localStorage.setItem('preferredLanguage', language);
            } catch {
                // Language switching still works when storage is unavailable.
            }
            document.documentElement.lang = language;
            document.documentElement.dir = i18n.dir(language);
        };
        handleLanguageChanged(i18n.resolvedLanguage || i18n.language);

        // Listen for language changes
        i18n.on('languageChanged', handleLanguageChanged);

        // Cleanup
        return () => {
            i18n.off('languageChanged', handleLanguageChanged);
        };
    }, []);

    if (authLoading || maintenance.loading) return <Spinner />;

    const emergencyPath = window.location.pathname === '/login' || window.location.pathname.startsWith('/adm');
    if (maintenance.enabled && !maintenance.admin && !emergencyPath) {
        return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white"><div className="max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center shadow-2xl" role="status"><h1 className="text-2xl font-bold">{maintenance.title || 'Scheduled maintenance'}</h1><p className="mt-4 text-slate-300">{maintenance.message}</p><p className="mt-6 text-sm text-slate-400">Administrators can use the protected console during maintenance.</p><a href="/login" className="mt-5 inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900">Administrator sign in</a></div></main>;
    }

    return (
        <AuthContext.Provider value={user}>
            {verificationBanner && (
                <div style={{
                    position: 'fixed',
                    top: '24px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 99999,
                    background: verificationBanner.type === 'success' ? 'rgba(15, 23, 42, 0.92)' : 'rgba(15, 23, 42, 0.92)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: verificationBanner.type === 'success' ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(248, 113, 113, 0.4)',
                    boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)',
                    borderRadius: '16px',
                    padding: '16px 24px',
                    color: '#ffffff',
                    maxWidth: '480px',
                    width: '90%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '22px' }}>{verificationBanner.type === 'success' ? '🔑' : '⚠️'}</span>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '14px', color: verificationBanner.type === 'success' ? '#34d399' : '#f87171' }}>{verificationBanner.title}</div>
                            <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px', lineHeight: 1.4 }}>{verificationBanner.text}</div>
                        </div>
                    </div>
                    <button
                        onClick={() => setVerificationBanner(null)}
                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#94a3b8', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                    >Dismiss</button>
                </div>
            )}
            {(resetOobCode || directResetEmail) && (
                <ResetPasswordModal
                    oobCode={resetOobCode}
                    initialEmail={directResetEmail}
                    onClose={() => { setResetOobCode(null); setDirectResetEmail(null); }}
                />
            )}
            <GoogleMapsProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_APP_GOOGLE_MAPS_API_KEY}>
            <BrowserRouter>
                <PostLoginRedirect user={user} />
                <GA4Provider>
                    <RouteSeo />
                    <RouteFocus />
                    <Suspense fallback={<Spinner />}>
                        <Routes>
                            <Route path="/" element={<Welcome key={user?.uid || 'guest'} user={user} />} />
                            <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Welcome key="guest" user={null} />} />
                            <Route path="/sign-up" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
                            <Route path="/coverletter" element={<RequireAuthenticated user={user}><CoverLetter key={user?.uid || 'unauthenticated'} /></RequireAuthenticated>} />
                            <Route path="/coverletter/*" element={<RequireAuthenticated user={user}><CoverLetter key={user?.uid || 'unauthenticated'} /></RequireAuthenticated>} />
                            <Route path="/cover-letter" element={<RequireAuthenticated user={user}><CoverLetter key={user?.uid || 'unauthenticated'} /></RequireAuthenticated>} />
                            <Route path="/cover-letter/*" element={<RequireAuthenticated user={user}><CoverLetter key={user?.uid || 'unauthenticated'} /></RequireAuthenticated>} />
                            <Route path="/dashboard/*" element={<RequireAuthenticated user={user}><Dashboard key={user?.uid || 'unauthenticated'} /></RequireAuthenticated>} />
                            <Route path="/enterprise/*" element={<RequireAuthenticated user={user}><EnterpriseConsole key={user?.uid || 'unauthenticated'} /></RequireAuthenticated>} />
                            <Route path="/contact" element={<Contact user={user} />} />
                            <Route path="/build-resume/*" element={<MaybeApplicationShell user={user}><BuildResume key={user?.uid || 'guest'} /></MaybeApplicationShell>} />
                            <Route path="/create-resume/*" element={<MaybeApplicationShell user={user}><BuildResume key={user?.uid || 'guest'} /></MaybeApplicationShell>} />
                            <Route path="/create-resume" element={<MaybeApplicationShell user={user}><BuildResume key={user?.uid || 'guest'} /></MaybeApplicationShell>} />
                            {/* Legacy in-page builder URLs previously mounted an obsolete client-only workflow.
                                Keep old links useful, but route every variant into the maintained,
                                MariaDB-backed builder rather than reviving two competing drafts. */}
                            <Route path="/resume/:step" element={<Navigate to="/build-resume/heading" replace />} />
                            <Route path="/billing/plans" element={<Billing key={user?.uid || 'guest'} user={user} />} />
                            <Route path="/p/:custompage" element={<CustomePage user={user} />} />
                            <Route path="/shared/:resumeId" element={<PublicResume />} />
                            <Route path="/pricing" element={<Billing key={user?.uid || 'guest'} user={user} />} />
                            <Route path="/portfolio/builder" element={<RequireAuthenticated user={user}><PortfolioBuilder key={user?.uid || 'unauthenticated'} /></RequireAuthenticated>} />
                            <Route path="/portfolio/:slug" element={<PublicPortfolio />} />
                            <Route path="/portfolios" element={<PortfolioGallery key={user?.uid || 'guest'} />} />
                            {/* Compatibility alias used by the Enterprise app switcher. The
                                canonical console namespace is /adm; both paths land in the
                                same authenticated Admin shell rather than a blank route. */}
                            <Route path="/admin/*" element={<AdminAliasRedirect />} />
                            <Route path="/platform/*" element={<PlatformAliasRedirect />} />
                            <Route path="/adm/*" element={<RequireAuthenticated user={user}><Admin key={user?.uid || 'unauthenticated'} /></RequireAuthenticated>} />
                            <Route path="/front" element={<Navigate to="/" replace />} />
                            <Route path="/features" element={<Features user={user} />} />
                            <Route path="/jobs" element={<JobsLanding />} />
                            <Route path="/jobs/portal" element={<MainJobListings key={user?.uid || 'guest'} />} />
                            <Route path="/jobs/portal/:jobId" element={<MainJobListings key={user?.uid || 'guest'} />} />
                            <Route path="/jobs/browse" element={<MainJobListings key={user?.uid || 'guest'} />} />
                            <Route path="/jobs/categories" element={<JobsLanding />} />
                            <Route path="/jobs/category/:catName" element={<MainJobListings key={user?.uid || 'guest'} />} />
                            <Route path="/blog" element={<BlogList />} />
                            <Route path="/blog/:slug" element={<BlogPost />} />
                            <Route path="/blog-editor" element={<RequireAuthenticated user={user}><BlogEditor key={user?.uid || 'unauthenticated'} /></RequireAuthenticated>} />
                            <Route path="/blog-editor/:postId" element={<RequireAuthenticated user={user}><BlogEditor key={user?.uid || 'unauthenticated'} /></RequireAuthenticated>} />
                          {/* Export routes*/}
                            {/* Generate CV template routes dynamically */}
                            {Array.from({ length: 51 }, (_, i) => i + 1).map((num) => (
                                <Route key={`cv-route-${num}`} path={`/export/Cv${num}/:resumeId/:language`} element={<RequireExportAccess user={user}><Exporter key={user?.uid || 'render'} resumeName={`Cv${num}`} export={true} /></RequireExportAccess>} />
                            ))}
                             {/* Dashboard2 mapped to main User Dashboard */}
                             <Route path="/dashboard2/*" element={<RequireAuthenticated user={user}><Dashboard key={user?.uid || 'unauthenticated'} /></RequireAuthenticated>} />
                             <Route path="/dashboard2" element={<RequireAuthenticated user={user}><Dashboard key={user?.uid || 'unauthenticated'} /></RequireAuthenticated>} />
                            {/* Covers export routes */}
                            {/* Generate Cover Letter routes dynamically */}
                            {Array.from({ length: 4 }, (_, i) => i + 1).map((num) => (
                                <Route key={`cover-route-${num}`} path={`/export/Cover${num}/:resumeId/:language`} element={<RequireExportAccess user={user}><Exporter key={user?.uid || 'render'} resumeName={`Cover${num}`} export={true} /></RequireExportAccess>} />
                            ))}
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </Suspense>
                    <PrivacyConsentBanner />
                </GA4Provider>
            </BrowserRouter>
            </GoogleMapsProvider>
        </AuthContext.Provider>
    );
};

const container = document.getElementById('root');
if (container && !container.dataset.lab && !window.__isTemplateLab) {
    const root = createRoot(container);
    root.render(<AuthWrapper />);
}

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
