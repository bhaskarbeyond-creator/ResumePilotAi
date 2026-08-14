import React, { Component, Suspense, lazy } from 'react';
import './DashboardMain.scss';
import { Link, Route, Routes } from 'react-router-dom';
import Toasts from '../../Toasts/Toats';
import fire from '../../../conf/fire';
import ProfileDisplay from '../ProfileDisplay/ProfileDisplay';
import Spinner from '../../Spinner/Spinner';
import { FaBars, FaEnvelope, FaCheckCircle, FaTimes, FaRedo } from 'react-icons/fa';

import { getFullName, getAds } from '../../../firestore/dbOperations';
// Animation Library
import { motion, AnimatePresence, transform } from 'framer-motion';
import { withTranslation } from 'react-i18next';
import { trackEvent, trackUserLogin, trackEngagement } from '../../../utils/ga4';
import signOutUser from '../../../utils/signOut';

import { getWebsiteData } from '../../../firestore/dbOperations';

import DashboardToast from '../DashboardToast/DashboardToast';
import i18n from '../../../i18n';

const DashboardHomepage = lazy(() => import('../DashboardHomepage/DashboardHomepage'));
const DashboardSettings = lazy(() => import('../DashboardSettings/DashboardSettings'));
const DashboardFavourites = lazy(() => import('../DashboardFavourites/DashboardFavourites'));
const DashboardInterviews = lazy(() => import('../DashboardInterviews/DashboardInterviews'));
const DashboardPortfolios = lazy(() => import('../DashboardPortfolios/DashboardPortfolios'));
const DashboardJobMatching = lazy(() => import('../DashbaordJobMatching/DashboardJobMatching'));
const AppliedJobs = lazy(() => import('../../AppliedJobs/AppliedJobs'));
const EmployerDashboard = lazy(() => import('../EmployerDashboard/EmployerDashboard'));
const CompaniesManagement = lazy(() => import('../EmployerDashboard/CompaniesManagement'));
const DashboardMessages = lazy(() => import('../DashboardMessages/DashboardMessages'));
const CoverLetter = lazy(() => import('../../CoverLetter/CoverLetter'));
const Billing = lazy(() => import('../../Billing/Plans/Plans'));
class DashboardMain extends Component {
    constructor(props) {
        super(props);
        this.authListener = this.authListener.bind(this);
        this._isMounted = false;
        this.unsubscribeAuth = null;
        this.state = {
            user: null,
            role: 'user',
            toast: {
                isShowed: false,
                type: '', // success , error , warning
                title: '',
                text: '',
            },
            membership: '',
            firstname: '',
            lastname: '',
            displayDocuments: [],
            fetchedDocuments: [],
            activeNav: 'Dashboard',
            isDeleteToastShowed: false,
            isDropdownShowed: false,
            isCommingSoonShowed: false,
            pageNumber: 1,
            perPage: 2,
            isSettingsShowed: false,
            isAdsManagerShowed: false,
            isDashboardShowed: true,
            isAddPagesShowed: false,
            isFavoritesShowed: false,
            sidebarCollapsed: false,
            // Email verification banner
            showVerifyBanner: false,
            verifyBannerDismissed: false,
            verifyResending: false,
            verifyResendSuccess: false,
            // Meta data
            metaDataFetched: false,
            websiteTitle: '',
            websiteDescription: '',
            profile: {},
            websiteKeywords: '',
        };
        this.dropdownHandler = this.dropdownHandler.bind(this);
        this.settingsClickHandler = this.settingsClickHandler.bind(this);
        this.handleAdsClick = this.handleAdsClick.bind(this);
        this.handlePagesClick = this.handlePagesClick.bind(this);
        this.logout = this.logout.bind(this);
        this.showFavorites = this.showFavorites.bind(this);
        this.isSettingsPath = this.isSettingsPath.bind(this);
        this.handleSidebarToggle = this.handleSidebarToggle.bind(this);

        this.showToast = this.showToast.bind(this);
    }

    /// Check if the user is authenticated
    authListener() {
        const initialUser = localStorage.getItem('user') || 'active_user';
        this.setState({ user: initialUser });

        this.unsubscribeAuth = fire.auth().onAuthStateChanged(async (user) => {
            if (!this._isMounted) return; // Prevent state updates if component is unmounted

            if (user) {
                this.setState({ user: user.uid });

                // Track user login
                trackUserLogin('firebase');
                trackEngagement('dashboard_access', { user_id: user.uid });

                const idToken = await user.getIdTokenResult();
                const isAdminUser = ['ADMIN', 'SUPER_ADMIN'].includes(String(idToken.claims.role || '').toUpperCase());
                getFullName(user.uid).then((value) => {
                    if (!this._isMounted) return; // Prevent state updates if component is unmounted
                    if (value !== undefined) {
                        const resolvedMembership = isAdminUser
                            ? 'Admin Tier'
                            : (value.membership && value.membership !== ';' ? value.membership : 'Basic');

                        this.setState({
                            firstname: value.firstname,
                            lastname: value.lastname,
                            membership: resolvedMembership,
                            profile: {
                                ...(value.profile || {}),
                                membership: resolvedMembership,
                            },
                        });
                    }
                });
                localStorage.setItem('user', user.uid);
                /// Checking if user ad
                if (isAdminUser) {
                    this.setState({ role: 'admin' });
                    getAds();
                }

                // ─── Email Verification Banner Logic ───────────────────────────────
                // Only show for email/password users who haven't verified yet
                const isEmailProvider = user.providerData && user.providerData.some(p => p.providerId === 'password');
                if (isEmailProvider && !user.emailVerified && !this.state.verifyBannerDismissed) {
                    try {
                        const { getSystemSettings } = await import('../../../firestore/dbOperations');
                        const settings = await getSystemSettings();
                        const verificationEnabled = settings?.modules?.enableEmailVerification === true;
                        if (verificationEnabled && this._isMounted) {
                            this.setState({ showVerifyBanner: true });
                        }
                    } catch (e) {
                        // Non-fatal — don't block dashboard load
                    }
                }
                // ────────────────────────────────────────────────────────────────────

            } else {
                const storedUser = localStorage.getItem('user');
                if (storedUser) {
                    this.setState({ user: storedUser });
                } else {
                    // Default to guest session on local environment
                    const fallbackUser = 'guest_user';
                    localStorage.setItem('user', fallbackUser);
                    this.setState({ user: fallbackUser });
                }
            }
        });
    }
    // Show Drop down
    dropdownHandler() {
        this.setState((prevState, props) => ({
            isDropdownShowed: !prevState.isDropdownShowed,
        }));
    }
    // Handle Settings Click
    settingsClickHandler() {
        this.setState((prevState, props) => ({
            isSettingsShowed: !prevState.isSettingsShowed,
            isAdsManagerShowed: false,
        }));
    }

    // Handle Ads Click
    handleAdsClick() {
        this.setState((prevState, props) => ({
            isSettingsShowed: false,
            activeNav: 'Ads Manager',
            isDashboardShowed: false,
            isAdsManagerShowed: true,
        }));
    }
    // Handle Ads Click
    handlePagesClick() {
        this.setState((prevState, props) => ({
            isSettingsShowed: false,
            activeNav: 'Pages',
            isDashboardShowed: false,
            isAdsManagerShowed: false,
            isAddPagesShowed: true,
        }));
    }
    // Logout
    logout() {
        // Track logout event
        trackEvent('logout', 'User', 'Dashboard logout');

        signOutUser();
        this.currentResume = null;
    }
    // Handling cover letter click to show coming soon message
    handleCoverLetter() {
        setTimeout(() => {
            this.setState((prevStat, props) => ({
                isCommingSoonShowed: !prevStat.isCommingSoonShowed,
            }));
        }, 2000);
        this.setState((prevStat, props) => ({
            isCommingSoonShowed: !prevStat.isCommingSoonShowed,
        }));
    }

    //show toast with a message
    showToast = (type, title, text) => {
        this.setState({
            toast: {
                isShowed: true,
                type: type, // success , error , warning
                title: title,
                text: text,
            },
        });
        // hide toast after 3 seconds
        setTimeout(() => {
            this.setState({
                toast: {
                    isShowed: false,
                    type: '', // success , error , warning
                    title: '',
                    text: '',
                },
            });
        }, 1000);
    };
    // show favorites
    showFavorites = () => {
        // Track favorites interaction
        trackEvent('show_favorites', 'Dashboard', 'Favorites section toggled');

        this.setState((prevState, props) => ({
            isFavoritesShowed: !prevState.isFavoritesShowed,
        }));
    };

    // Handle sidebar toggle
    handleSidebarToggle(collapsed) {
        this.setState({ sidebarCollapsed: collapsed });
    }

    // Note: Language initialization is now handled globally in main.jsx
    // This method is kept for backward compatibility but does nothing
    initializeLanguage() {
        // Language initialization is now handled globally - no action needed
    }

    componentDidMount() {
        this._isMounted = true;
        this.authListener();

        // Initialize language from localStorage
        this.initializeLanguage();

        getWebsiteData().then((data) => {
            if (!this._isMounted) return; // Prevent state updates if component is unmounted
            this.setState({
                metaDataFetched: true,
                websiteTitle: data.title,
                websiteDescription: data.description,
                websiteKeywords: data.keywords,
            });
        });
        // set currentResumeItem to null
        // set currentResumeId to null
        localStorage.removeItem('currentResumeId');
        localStorage.removeItem('currentResumeItem');
    }

    componentWillUnmount() {
        this._isMounted = false;
        // Clean up Firebase auth listener
        if (this.unsubscribeAuth) {
            this.unsubscribeAuth();
        }
    }
    // a function that returns true if we are in this path /dashboard/settings
    isSettingsPath = () => {
        return window.location.pathname === '/dashboard/settings';
    };

    render() {
        const { t } = this.props;
        const { showVerifyBanner, verifyBannerDismissed, verifyResending, verifyResendSuccess } = this.state;

        // ─── Resend Branded Crypto Verification Email Handler ─────────────────
        const handleResendVerification = async () => {
            const currentUser = fire.auth().currentUser;
            const userEmail = currentUser?.email || this.state.profile?.email;
            if (!userEmail || verifyResending) return;
            this.setState({ verifyResending: true, verifyResendSuccess: false });
            try {
                const res = await fetch('/api/auth/send-verification-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: userEmail,
                        userName: currentUser?.displayName || this.state.firstname || userEmail.split('@')[0]
                    })
                });
                const data = await res.json();
                if (data.success) {
                    this.setState({ verifyResendSuccess: true });
                } else {
                    console.warn('[VerifyBanner] Resend notice:', data.error);
                }
                // Poll until emailVerified flips true (max 5 mins, every 10s)
                let attempts = 0;
                const poll = setInterval(async () => {
                    attempts++;
                    try {
                        if (currentUser && typeof currentUser.reload === 'function') {
                            await currentUser.reload();
                            if (fire.auth().currentUser?.emailVerified) {
                                clearInterval(poll);
                                if (this._isMounted) this.setState({ showVerifyBanner: false });
                            }
                        }
                    } catch (e) { /* non-fatal */ }
                    if (attempts >= 30) clearInterval(poll);
                }, 10000);
            } catch (e) {
                console.warn('[VerifyBanner] Resend error:', e.message);
            } finally {
                this.setState({ verifyResending: false });
            }
        };
        // ────────────────────────────────────────────────────────────────────────

        return this.state.user !== null ? (
            <div className="dashboardWrapper" style={{ overflow: 'hidden' }}>
                {/* Floating Mobile Sidebar Toggle */}
                <button
                    onClick={() => {
                        const newCollapsed = !this.state.sidebarCollapsed;
                        this.handleSidebarToggle(newCollapsed);
                        
                        // Handle mobile body scroll prevention
                        const isMobile = window.innerWidth < 1024;
                        if (isMobile) {
                            if (newCollapsed) {
                                // Remove the class to allow scrolling
                                document.body.classList.remove('mobile-sidebar-open');
                            } else {
                                // Add class to prevent scrolling
                                document.body.classList.add('mobile-sidebar-open');
                            }
                        }
                    }}
                    className="fixed top-4 left-4 z-40 lg:hidden w-10 h-10 bg-white border border-slate-200 rounded-lg shadow-lg flex items-center justify-center hover:bg-slate-50 transition-colors duration-200"
                    aria-label="Toggle sidebar"
                >
                    <FaBars className="w-4 h-4 text-slate-600" />
                </button>

                <AnimatePresence>
                    {this.state.isDeleteToastShowed && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <Toasts type="Delete" />
                        </motion.div>
                    )}
                </AnimatePresence>
                <DashboardToast isShowed={this.state.toast.isShowed} type={this.state.toast.type} title={this.state.toast.title} text={this.state.toast.text} />

                {/* ─── Email Verification Banner ────────────────────────────────────── */}
                {showVerifyBanner && !verifyBannerDismissed && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        zIndex: 9999,
                        background: 'linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%)',
                        padding: '10px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        boxShadow: '0 4px 16px -2px rgba(79,70,229,0.4)',
                        flexWrap: 'wrap',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                            <FaEnvelope style={{ color: '#c7d2fe', flexShrink: 0, fontSize: '16px' }} />
                            <span style={{
                                color: '#ffffff',
                                fontSize: '13px',
                                fontWeight: 600,
                                fontFamily: '\'Poppins\', sans-serif',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}>
                                {verifyResendSuccess
                                    ? '✅ Verification email sent! Check your inbox and click the link to verify.'
                                    : '⚠️ Your email address is not verified. Please check your inbox for a verification link.'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <button
                                onClick={handleResendVerification}
                                disabled={verifyResending}
                                style={{
                                    background: 'rgba(255,255,255,0.18)',
                                    border: '1px solid rgba(255,255,255,0.35)',
                                    borderRadius: '6px',
                                    color: '#ffffff',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    padding: '5px 12px',
                                    cursor: verifyResending ? 'wait' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    transition: 'background 0.2s',
                                    opacity: verifyResending ? 0.7 : 1,
                                    fontFamily: '\'Poppins\', sans-serif',
                                }}
                            >
                                <FaRedo style={{ fontSize: '10px' }} />
                                {verifyResending ? 'Sending...' : 'Resend Email'}
                            </button>
                            <button
                                onClick={() => this.setState({ verifyBannerDismissed: true, showVerifyBanner: false })}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'rgba(255,255,255,0.7)',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    borderRadius: '4px',
                                    transition: 'color 0.2s',
                                }}
                                title="Dismiss"
                            >
                                <FaTimes style={{ fontSize: '14px' }} />
                            </button>
                        </div>
                    </div>
                )}
                {/* ──────────────────────────────────────────────────────────────────── */}

                <DashboardFavourites showFavorites={this.showFavorites} isFavoritesShowed={this.state.isFavoritesShowed} />

                <ProfileDisplay
                    user={this.state.user}
                    profile={{
                        name: (this.state.firstname && this.state.lastname) ? `${this.state.firstname} ${this.state.lastname}`.trim() : (this.state.profile?.name || `${this.state.profile?.firstname || ''} ${this.state.profile?.lastname || ''}`.trim() || ''),
                        firstname: this.state.firstname || this.state.profile?.firstname || '',
                        lastname: this.state.lastname || this.state.profile?.lastname || '',
                        email: this.state.profile?.email || '',
                        phone: this.state.profile?.phone || '',
                        address: this.state.profile?.address || '',
                        city: this.state.profile?.city || '',
                        country: this.state.profile?.country || '',
                        occupation: this.state.profile?.occupation || '',
                        membership: this.state.membership || this.state.profile?.membership,
                        selectedImage: this.state.profile?.selectedImage || this.state.profile?.image,
                        image: this.state.profile?.image || this.state.profile?.selectedImage,
                    }}
                    image={this.state.profile}
                    sidebarCollapsed={this.state.sidebarCollapsed}
                    onSidebarToggle={this.handleSidebarToggle}
                />

                <div className={`dashboardContentWrapper ${this.state.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
                    <div className="dashboardMainContent">
                        <Suspense fallback={<Spinner />}>
                            <Routes>
                                <Route
                                    index
                                    element={
                                        <DashboardHomepage
                                            profile={{
                                                name: this.state.firstname + ' ' + this.state.lastname,
                                                email: this.state.profile?.email || '',
                                                phone: this.state.profile?.phone || '',
                                                address: this.state.profile?.address || '',
                                                city: this.state.profile?.city || '',
                                                country: this.state.profile?.country || '',
                                                occupation: this.state.profile?.occupation || '',
                                            }}
                                            showFavorites={this.showFavorites}
                                            showToast={this.showToast}
                                            sidebarCollapsed={this.state.sidebarCollapsed}
                                            handleSidebarToggle={this.handleSidebarToggle}
                                        />
                                    }
                                />
                                <Route path="settings" element={<DashboardSettings showToast={this.showToast} sidebarCollapsed={this.state.sidebarCollapsed} handleSidebarToggle={this.handleSidebarToggle} />} />
                                <Route path="messages" element={<DashboardMessages showToast={this.showToast} sidebarCollapsed={this.state.sidebarCollapsed} handleSidebarToggle={this.handleSidebarToggle} />} />     
                                <Route path="favorites" element={<DashboardFavourites showToast={this.showToast} />} />
                                <Route path="interview" element={<DashboardInterviews showToast={this.showToast} sidebarCollapsed={this.state.sidebarCollapsed} handleSidebarToggle={this.handleSidebarToggle} />} />
                                <Route path="cover-letters" element={<CoverLetter />} />
                                <Route path="portfolios" element={<DashboardPortfolios showToast={this.showToast} sidebarCollapsed={this.state.sidebarCollapsed} handleSidebarToggle={this.handleSidebarToggle} />} />
                                <Route path="applied-jobs" element={<AppliedJobs showToast={this.showToast} sidebarCollapsed={this.state.sidebarCollapsed} handleSidebarToggle={this.handleSidebarToggle} />} />
                                <Route path="my-employments" element={<EmployerDashboard showToast={this.showToast} sidebarCollapsed={this.state.sidebarCollapsed} handleSidebarToggle={this.handleSidebarToggle} />} />
                                <Route path="my-companies" element={<CompaniesManagement showToast={this.showToast} sidebarCollapsed={this.state.sidebarCollapsed} />} />
                                <Route path="job-matching" element={<DashboardJobMatching showToast={this.showToast} sidebarCollapsed={this.state.sidebarCollapsed} />} />
                                <Route path="plans" element={<Billing user={this.state.user} showToast={this.showToast} />} />
                            </Routes>
                        </Suspense>
                    </div>
                </div>
            </div>
        ) : (
            ' '
        );
    }
}
const MyComponent = withTranslation('common')(DashboardMain);
export default MyComponent;
