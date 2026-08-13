import React, { Suspense, lazy, useState, useEffect, createContext } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './tailwind.css';
import './index.scss';
import './cv-templates/css/globalTemplateEnhancements.css';
import './i18n'; // Import i18n configuration

import * as serviceWorker from './serviceWorker';
import Spinner from './components/Spinner/Spinner';
import PublicResume from './components/PublicResume/PublicResume';
import Cover4 from './cv-templates/cover4/Cover4';
import fire from './conf/fire'; // Import fire
import GA4Provider from './components/GA4Provider';
import i18n from './i18n';
import GoogleMapsProvider from './components/JobsListings/GoogleMapsProvider';

if (typeof window !== 'undefined') {
    window.fire = fire;
}

// Create a Context for authentication
export const AuthContext = createContext(null);

const Welcome = lazy(() => import('./components/welcome/Welcome'));
const Dashboard = lazy(() => import('./components/Dashboard/DashboardMain/DashboardMain'));
const Admin = lazy(() => import('./components/admin/Admin'));
const Contact = lazy(() => import('./components/Contact/Contact'));
const Front = lazy(() => import('./components/Front/Front'));
const Exporter = lazy(() => import('./components/Exporter/Exporter'));
const Billing = lazy(() => import('./components/Billing/Plans/Plans'));
const CustomePage = lazy(() => import('./components/CustomPage/CustomePage'));
const Dashboard2 = lazy(() => import('./components/Dashboard2/dashboard2'));
const CoverLetter = lazy(() => import('./components/CoverLetter/CoverLetter'));
const PortfolioBuilder = lazy(() => import('./components/PortfolioBuilder/PortfolioBuilder'));
const PublicPortfolio = lazy(() => import('./components/PublicPortfolio/PublicPortfolio'));
const PortfolioGallery = lazy(() => import('./components/PortfolioGallery/PortfolioGallery'));
const BuildResume = lazy(() => import('./components/BuildResume/BuildResume'));
const Features = lazy(() => import('./components/Features/Features'));
const JobsLanding = lazy(() => import('./components/JobsLanding/JobsLanding'));
const MainJobListings = lazy(() => import('./components/JobsListings/MainJobListings'));
const BlogList = lazy(() => import('./components/Blog/BlogList/BlogList'));
const BlogPost = lazy(() => import('./components/Blog/BlogPost/BlogPost'));
const BlogEditor = lazy(() => import('./components/Blog/BlogEditor/BlogEditor'));
import ResetPasswordModal from './components/auth/resetPassword/ResetPasswordModal';

const AuthWrapper = () => {         
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [resetOobCode, setResetOobCode] = useState(null);
    const [directResetEmail, setDirectResetEmail] = useState(null);
    const [verificationBanner, setVerificationBanner] = useState(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const oobCode = params.get('oobCode');
        const mode = params.get('mode');
        const reset = params.get('reset');
        const email = params.get('email');
        const token = params.get('token');
        const oauthSession = params.get('oauth_session');
        const provider = params.get('provider');

        if (mode === 'verifyEmail' && token && email) {
            console.log('[AuthWrapper] Verifying email token for:', email);
            fetch('/api/auth/verify-email-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, email })
            }).then(res => res.json()).then(data => {
                if (data.success) {
                    setVerificationBanner({ type: 'success', title: 'Account Verified! 🔑', text: data.message || 'Email verified successfully! You now have full access.' });
                    if (fire.auth().currentUser && typeof fire.auth().currentUser.reload === 'function') {
                        fire.auth().currentUser.reload().catch(() => {});
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
            console.log('[AuthWrapper] Detected password reset token in URL:', oobCode);
            setResetOobCode(oobCode);
        } else if ((mode === 'resetPassword' || reset === 'true' || token) && email) {
            console.log('[AuthWrapper] Detected tokenized custom reset link for:', email);
            setDirectResetEmail(email);
        }

        // ── STEP 1: Hydrate OAuth session from URL SYNCHRONOUSLY before onAuthStateChanged ─
        // LinkedIn / GitHub server-side OAuth redirects pass a base64url session payload in the
        // URL. Writing it to localStorage HERE — synchronously before the subscription below —
        // guarantees onAuthStateChanged always finds the mock-user session on its very first
        // tick, eliminating the null → user flicker race condition.
        if (oauthSession) {
            try {
                const decoded = JSON.parse(atob(oauthSession.replace(/-/g, '+').replace(/_/g, '/')));
                if (decoded && decoded.uid && decoded.email) {
                    const sessionKey = `${provider || 'oauth'}_user_session`;
                    localStorage.setItem(sessionKey, JSON.stringify(decoded));
                    // Generic key read by onAuthStateChanged fallback below
                    localStorage.setItem('oauth_user_session', JSON.stringify(decoded));
                    console.log(`[AuthWrapper] OAuth session stored: provider=${decoded.provider || provider}, uid=${decoded.uid}`);
                    // Clean URL so payload is not re-processed on page refresh
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            } catch (decodeErr) {
                console.error('[AuthWrapper] Failed to decode oauth_session param:', decodeErr);
            }
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
                import('./firestore/auth').then(({ default: addUser, updateUserOnLogin }) => {
                    addUser(u.uid, firstName, lastName, u.email, { authProvider, photoURL: u.photoURL || null }).then((userRes) => {
                        if (userRes && userRes.isNewUser) {
                            try {
                                fetch('/api/notify/user-signup', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userEmail: u.email, userName: u.displayName || firstName })
                                }).catch(() => {});
                            } catch (e) {}
                        } else {
                            // Returning user — keep provider and avatar fresh
                            updateUserOnLogin(u.uid, { photoURL: u.photoURL, displayName: u.displayName, authProvider }).catch(() => {});
                        }
                    });
                }).catch(() => {});
            }
        }).catch((err) => {
            console.error('[OAuth Redirect Error]:', err);
        });

        // ── STEP 3: Subscribe to auth state (localStorage already hydrated above) ──────────
        const makeMockFirebaseUser = (rawObj) => {
            if (!rawObj) return null;
            return {
                uid: rawObj.uid || 'user',
                email: rawObj.email || '',
                displayName: rawObj.displayName || 'User',
                photoURL: rawObj.photoURL || '',
                getIdToken: async () => '',
                getIdTokenResult: async () => ({ token: '' }),
                reload: async () => {},
                ...rawObj
            };
        };

        const unsubscribe = fire.auth().onAuthStateChanged((user) => {
            if (user) {
                setUser(user);
            } else {
                // Check all OAuth mock-user sessions — written before this subscription
                const fbSession = localStorage.getItem('fb_user_session');
                const googleSession = localStorage.getItem('google_user_session');
                const linkedInGitHubSession = localStorage.getItem('oauth_user_session');
                if (fbSession) {
                    try { setUser(makeMockFirebaseUser(JSON.parse(fbSession))); } catch (e) { setUser(null); }
                } else if (googleSession) {
                    try { setUser(makeMockFirebaseUser(JSON.parse(googleSession))); } catch (e) { setUser(null); }
                } else if (linkedInGitHubSession) {
                    try { setUser(makeMockFirebaseUser(JSON.parse(linkedInGitHubSession))); } catch (e) { setUser(null); }
                } else {
                    setUser(null);
                }
            }
            setAuthLoading(false);
        });

        // Cleanup auth subscription on unmount
        return () => unsubscribe();
    }, []);

    // Add global language change listener to persist language changes
    useEffect(() => {
        const handleLanguageChanged = (lng) => {
            // Save language preference whenever it changes
            localStorage.setItem('preferredLanguage', lng);
        };

        // Listen for language changes
        i18n.on('languageChanged', handleLanguageChanged);

        // Cleanup
        return () => {
            i18n.off('languageChanged', handleLanguageChanged);
        };
    }, []);

    if (authLoading) {
        return <Spinner />; // Or any loading indicator
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
                <GA4Provider>
                    <Suspense fallback={<Spinner />}>
                        <Routes>
                            <Route path="/" element={<Welcome />} />
                            <Route path="/login" element={<Welcome />} />
                            <Route path="/coverletter" element={<CoverLetter />} />
                            <Route path="/dashboard/*" element={<Dashboard />} />
                            <Route path="/contact" element={<Contact user={user} />} />
                            <Route path="/build-resume/*" element={<BuildResume />} />
                            <Route path="/create-resume/*" element={<BuildResume />} />
                            <Route path="/create-resume" element={<BuildResume />} />
                            <Route path="/resume/:step" element={<Welcome />} />
                            <Route path="/billing/plans" element={<Billing user={user} />} />
                            <Route path="/p/:custompage" element={<CustomePage user={user} />} />
                            <Route path="/shared/:resumeId" element={<PublicResume />} />
                            <Route path="/pricing" element={<Billing user={user} />} />
                            <Route path="/portfolio/builder" element={<PortfolioBuilder />} />
                            <Route path="/portfolio/:slug" element={<PublicPortfolio />} />
                            <Route path="/portfolios" element={<PortfolioGallery />} />
                            <Route path="/adm/*" element={<Admin />} />
                            <Route path="/front" element={<Front />} />
                            <Route path="/features" element={<Features user={user} />} />
                            <Route path="/jobs" element={<JobsLanding />} />
                            <Route path="/jobs/portal" element={<MainJobListings />} />
                            <Route path="/jobs/portal/:jobId" element={<MainJobListings />} />
                            <Route path="/jobs/browse" element={<MainJobListings />} />
                            <Route path="/jobs/categories" element={<JobsLanding />} />
                            <Route path="/jobs/category/:catName" element={<MainJobListings />} />
                            <Route path="/blog" element={<BlogList />} />
                            <Route path="/blog/:slug" element={<BlogPost />} />
                            <Route path="/blog-editor" element={<BlogEditor />} />
                            <Route path="/blog-editor/:postId" element={<BlogEditor />} />
                          {/* Export routes*/}
                            {/* Generate CV template routes dynamically */}
                            {Array.from({ length: 51 }, (_, i) => i + 1).map((num) => (
                                <Route key={`cv-route-${num}`} path={`/export/Cv${num}/:resumeId/:language`} element={<Exporter resumeName={`Cv${num}`} export={true} />} />
                            ))}
                             {/* Dashboard2 mapped to main User Dashboard */}
                             <Route path="/dashboard2/*" element={<Dashboard />} />
                             <Route path="/dashboard2" element={<Dashboard />} />
                            {/* Covers export routes */}
                            {/* Generate Cover Letter routes dynamically */}
                            {Array.from({ length: 4 }, (_, i) => i + 1).map((num) => (
                                <Route key={`cover-route-${num}`} path={`/export/Cover${num}/:resumeId/:language`} element={<Exporter resumeName={`Cover${num}`} export={true} />} />
                            ))}
                            {/* just a route  to test a n */}
                            <Route path="/cvtest" element={<Cover4 />} />
                        </Routes>
                    </Suspense>
                </GA4Provider>
            </BrowserRouter>
            </GoogleMapsProvider>
        </AuthContext.Provider>
    );
};

const container = document.getElementById('root');
const root = createRoot(container);

root.render(<AuthWrapper />);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
