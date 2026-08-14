import React, { Component } from 'react';
import './Login.scss'
import GoogleImage from '../../../assets/google.png'
import FacebookImage from '../../../assets/facebook.png'
import Input from '../../Form/simple-input/SimpleInput'
import firebase from 'firebase/compat/app';
import fire, { googleProvider, facebookProvider } from '../../../conf/fire';
import addUser from '../../../firestore/auth'
import { withTranslation } from 'react-i18next';
import { resolveOAuthSettings } from '../../../utils/oauthResolver';
import { getTotpSignInResolver, completeTotpSignIn } from '../../../services/mfaService';

// LinkedIn & GitHub SVG icons (inline — no extra dependencies)
const LinkedInIcon = () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="white" style={{ flexShrink: 0 }}>
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
);

const GitHubIcon = () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="white" style={{ flexShrink: 0 }}>
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
);

class Login extends Component {
    constructor(props) {
        super(props);
        let cachedSettings = null;
        try {
            const raw = localStorage.getItem('system_settings');
            if (raw) cachedSettings = JSON.parse(raw);
        } catch (e) {}

        const { enableGoogle, enableFacebook, enableLinkedIn, enableGitHub } = resolveOAuthSettings(cachedSettings);

        let savedEmail = '';
        try {
            savedEmail = localStorage.getItem('remember_email') || '';
        } catch (e) {}

        this.state = {
            email: savedEmail,
            password: "",
            rememberMe: !!savedEmail,
            enableGoogle,
            enableFacebook,
            enableLinkedIn,
            enableGitHub,
            oauthLoading: null, // tracks which provider is loading
            isSubmitting: false, // GAP-01: prevents double-submit
            mfaResolver: null,
            mfaCode: '',
            errors: {}, // Validation errors
        };
        this.handleInputs = this.handleInputs.bind(this);
        this.handleBlur = this.handleBlur.bind(this);
        this.toggleRememberMe = this.toggleRememberMe.bind(this);
        this.signInWithGoogle = this.signInWithGoogle.bind(this);
        this.signInWithFacebook = this.signInWithFacebook.bind(this);
        this.signInWithLinkedIn = this.signInWithLinkedIn.bind(this);
        this.signInWithGitHub = this.signInWithGitHub.bind(this);
        this.login = this.login.bind(this);
        this.completeMfaLogin = this.completeMfaLogin.bind(this);
        this._postAuth = this._postAuth.bind(this);
        this._handleRedirect = this._handleRedirect.bind(this);
    }

    toggleRememberMe(e) {
        this.setState({ rememberMe: e.target.checked });
    }

    componentDidMount() {
        import('../../../firestore/dbOperations').then(({ getSystemSettings }) => {
            getSystemSettings().then(settings => {
                try {
                    localStorage.setItem('system_settings', JSON.stringify(settings));
                } catch (e) {}

                const { enableGoogle, enableFacebook, enableLinkedIn, enableGitHub } = resolveOAuthSettings(settings);

                this.setState({
                    enableGoogle,
                    enableFacebook,
                    enableLinkedIn,
                    enableGitHub
                });
            }).catch(() => {});
        }).catch(() => {});
    }

    login(event) {
        event.preventDefault();
        if (this.state.isSubmitting) return; // GAP-01: prevent double-submit
        const email = (this.state.email || '').trim();
        const password = this.state.password || '';

        if (!email) {
            if (this.props.throwError) this.props.throwError('Please enter your email address.');
            return;
        }
        // GAP-04: basic email format check
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (this.props.throwError) this.props.throwError('Please enter a valid email address.');
            return;
        }
        if (!password) {
            if (this.props.throwError) this.props.throwError('Please enter your password.');
            return;
        }

        this.setState({ isSubmitting: true }); // GAP-01: lock submit

        const persistenceType = this.state.rememberMe 
            ? (firebase?.auth?.Auth?.Persistence?.LOCAL || 'local')
            : (firebase?.auth?.Auth?.Persistence?.SESSION || 'session');

        const executeLogin = () => {
            return fire.auth().signInWithEmailAndPassword(email, password).then((u) => {
                if (this.state.rememberMe) {
                    try { localStorage.setItem('remember_email', email); } catch(e) {}
                } else {
                    try { localStorage.removeItem('remember_email'); } catch(e) {}
                }
                if (this.props.throwSuccess) {
                    this.props.throwSuccess(`Welcome back, ${u.user.displayName || email.split('@')[0]}!`);
                }
                setTimeout(() => {
                    if (this.props.closeModal) this.props.closeModal();
                    this._handleRedirect(u.user.uid);
                }, 1000);
            });
        };

        fire.auth().setPersistence(persistenceType)
            .then(() => executeLogin())
            .catch(() => executeLogin())
            .catch((error) => {
                this.setState({ isSubmitting: false }); // GAP-01: unlock on error
                console.error('[Login Auth Error]:', error);
                const mfaResolver = getTotpSignInResolver(error);
                if (mfaResolver) {
                    this.setState({ mfaResolver, mfaCode: '', isSubmitting: false });
                    return;
                }
                let msg = error.message;
                if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                    msg = `Invalid credentials for ${email}. Please check your password or click "Forgot password?" to reset it.`;
                } else if (error.code === 'auth/invalid-email') {
                    msg = 'Please enter a valid email address.';
                } else if (error.code === 'auth/too-many-requests') {
                    msg = 'Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password.';
                }
                if (this.props.throwError) this.props.throwError(msg);
            });
    }

    async completeMfaLogin(event) {
        event.preventDefault();
        if (this.state.isSubmitting || !/^\d{6}$/.test(this.state.mfaCode)) return;
        this.setState({ isSubmitting: true });
        try {
            const credential = await completeTotpSignIn(this.state.mfaResolver, this.state.mfaCode);
            this.setState({ mfaResolver: null, mfaCode: '', isSubmitting: false });
            if (this.props.throwSuccess) this.props.throwSuccess('Two-factor authentication successful.');
            setTimeout(() => {
                if (this.props.closeModal) this.props.closeModal();
                this._handleRedirect(credential.user.uid);
            }, 500);
        } catch (error) {
            this.setState({ isSubmitting: false, mfaCode: '' });
            if (this.props.throwError) this.props.throwError('Invalid or expired authenticator code. Please try again.');
        }
    }

    handleInputs(title, value) {
        switch (title) {
            case "Email": this.setState({ email: value }); break;
            case "Password": this.setState({ password: value }); break;
            default: break;
        }
        // Clear error when user types
        this.setState(prevState => ({
            errors: { ...prevState.errors, [title]: '' }
        }));
    }

    handleBlur(title, value) {
        let errors = { ...this.state.errors };
        if (title === 'Email') {
            if (!value) {
                errors['Email'] = 'Please enter your email address.';
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                errors['Email'] = 'Please enter a valid email address.';
            }
        } else if (title === 'Password') {
            if (!value) {
                errors['Password'] = 'Please enter your password.';
            }
        }
        this.setState({ errors });
    }

    // ─── Post-OAuth shared logic ───────────────────────────────────────────────
    async _handleRedirect(uid) {
        try {
            const { checkIfAdmin } = await import('../../../firestore/dbOperations');
            const isAdmin = await checkIfAdmin(uid);
            if (isAdmin) {
                window.location.href = '/adm/dashboard';
            } else if (!window.location.pathname.startsWith('/dashboard') && !window.location.pathname.startsWith('/build')) {
                window.location.href = '/dashboard';
            }
        } catch (err) {
            if (!window.location.pathname.startsWith('/dashboard') && !window.location.pathname.startsWith('/build')) {
                window.location.href = '/dashboard';
            }
        }
    }

    async _postAuth(uid, displayName, email, photoURL, provider) {
        try {
            const firstName = (displayName || '').split(' ')[0] || 'User';
            const lastName = (displayName || '').split(' ').slice(1).join(' ') || '';
            const res = await addUser(uid, firstName, lastName, email, { authProvider: provider, photoURL });
            
            if (res && res.isNewUser) {
                fetch('/api/notify/user-signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userEmail: email, userName: displayName || firstName })
                }).catch(() => {});
            } else {
                import('../../../firestore/auth').then(({ updateUserOnLogin }) => {
                    updateUserOnLogin(uid, { photoURL, displayName, authProvider: provider }).catch(() => {});
                }).catch(() => {});
            }
        } catch (err) {
            console.warn('[Login postAuth notice]:', err.message);
        }
    }

    // ─── Google ─────────────────────────────────────────────────────────────────
    signInWithGoogle() {
        if (this.state.oauthLoading) return;
        this.setState({ oauthLoading: 'google' });
        const self = this;
        fire.auth().signInWithPopup(googleProvider).then(async (result) => {
            const u = result.user;
            await self._postAuth(u.uid, u.displayName, u.email, u.photoURL, 'google');
            self.setState({ oauthLoading: null });
            if (self.props.closeModal) self.props.closeModal();
            self._handleRedirect(u.uid);
        }).catch((error) => {
            self.setState({ oauthLoading: null });
            const mfaResolver = getTotpSignInResolver(error);
            if (mfaResolver) { self.setState({ mfaResolver, mfaCode: '' }); return; }
            if (error.code === 'auth/popup-blocked') {
                fire.auth().signInWithRedirect(googleProvider); return;
            }
            if (['auth/operation-not-allowed', 'auth/unauthorized-domain', 'auth/configuration-not-found'].includes(error.code)) {
                import('../../../utils/googleSdkAuth').then(({ directGoogleAuthFallback }) => {
                    directGoogleAuthFallback(self.props.closeModal, self.props.throwError);
                }).catch(e => { if (self.props.throwError) self.props.throwError(e.message); });
                return;
            }
            if (error.code !== 'auth/popup-closed-by-user') {
                if (self.props.throwError) self.props.throwError(error.message);
            }
        });
    }

    // ─── Facebook ────────────────────────────────────────────────────────────────
    signInWithFacebook() {
        if (this.state.oauthLoading) return;
        this.setState({ oauthLoading: 'facebook' });
        const self = this;
        fire.auth().signInWithPopup(facebookProvider).then(async (result) => {
            const u = result.user;
            await self._postAuth(u.uid, u.displayName, u.email, u.photoURL, 'facebook');
            self.setState({ oauthLoading: null });
            if (self.props.closeModal) self.props.closeModal();
            self._handleRedirect(u.uid);
        }).catch((error) => {
            self.setState({ oauthLoading: null });
            const mfaResolver = getTotpSignInResolver(error);
            if (mfaResolver) { self.setState({ mfaResolver, mfaCode: '' }); return; }
            if (error.code === 'auth/popup-blocked') {
                fire.auth().signInWithRedirect(facebookProvider); return;
            }
            if (['auth/operation-not-allowed', 'auth/unauthorized-domain', 'auth/configuration-not-found'].includes(error.code)) {
                import('../../../utils/facebookSdkAuth').then(({ directFacebookAuthFallback }) => {
                    directFacebookAuthFallback(self.props.closeModal, self.props.throwError);
                }).catch(e => { if (self.props.throwError) self.props.throwError(e.message); });
                return;
            }
            if (error.code !== 'auth/popup-closed-by-user') {
                if (self.props.throwError) self.props.throwError(error.message);
            }
        });
    }

    // ─── LinkedIn (server-side redirect) ─────────────────────────────────────────
    signInWithLinkedIn() {
        if (this.state.oauthLoading) return;
        this.setState({ oauthLoading: 'linkedin' });
        window.location.href = '/api/auth/linkedin';
    }

    // ─── GitHub (server-side redirect) ───────────────────────────────────────────
    signInWithGitHub() {
        if (this.state.oauthLoading) return;
        this.setState({ oauthLoading: 'github' });
        window.location.href = '/api/auth/github';
    }

    render() {
        const { t } = this.props;
        const { enableGoogle, enableFacebook, enableLinkedIn, enableGitHub, oauthLoading } = this.state;
        const anySocial = enableGoogle || enableFacebook || enableLinkedIn || enableGitHub;

        return (
            <div className="auth">
                <div className="head">
                    <div className="brandBadge">ResumePilot AI 🚀</div>
                    <span>{t("login.login")}</span>
                    <p>Enter your credentials to access your dashboard</p>
                </div>
                <div className="body">
                    <div className="socialAuth" role="group" aria-label="Sign in with social account">
                        {/* Google — GAP-07: button element for keyboard/a11y */}
                        {enableGoogle && (
                            <button type="button" onClick={this.signInWithGoogle} className={`googleAuthItem${oauthLoading === 'google' ? ' is-loading' : ''}`} id="btn-login-google" aria-label="Continue with Google" title="Continue with Google" disabled={!!oauthLoading}>
                                <img src={GoogleImage} alt="" aria-hidden="true" />
                            </button>
                        )}
                        {/* Facebook */}
                        {enableFacebook && (
                            <button type="button" onClick={this.signInWithFacebook} className={`facebookAuthItem${oauthLoading === 'facebook' ? ' is-loading' : ''}`} id="btn-login-facebook" aria-label="Continue with Facebook" title="Continue with Facebook" disabled={!!oauthLoading}>
                                <img src={FacebookImage} alt="" aria-hidden="true" />
                            </button>
                        )}
                        {/* LinkedIn */}
                        {enableLinkedIn && (
                            <button type="button" onClick={this.signInWithLinkedIn} className={`linkedinAuthItem${oauthLoading === 'linkedin' ? ' is-loading' : ''}`} id="btn-login-linkedin" aria-label="Continue with LinkedIn" title="Continue with LinkedIn" disabled={!!oauthLoading}>
                                <LinkedInIcon />
                            </button>
                        )}
                        {/* GitHub */}
                        {enableGitHub && (
                            <button type="button" onClick={this.signInWithGitHub} className={`githubAuthItem${oauthLoading === 'github' ? ' is-loading' : ''}`} id="btn-login-github" aria-label="Continue with GitHub" title="Continue with GitHub" disabled={!!oauthLoading}>
                                <GitHubIcon />
                            </button>
                        )}
                    </div>
                    {/* Divider */}
                    {anySocial && (
                        <div className="devider">
                            <hr />
                            <span>{t("login.or")}</span>
                        </div>
                    )}
                        {this.state.mfaResolver && (
                            <form onSubmit={this.completeMfaLogin} className="w-full flex flex-col gap-3" autoComplete="one-time-code">
                                <label htmlFor="mfa-code" className="text-sm font-semibold text-slate-700">Authenticator code</label>
                                <p className="text-xs text-slate-500">Enter the 6-digit code from your authenticator app to finish signing in.</p>
                                <input
                                    id="mfa-code"
                                    inputMode="numeric"
                                    autoFocus
                                    maxLength={6}
                                    value={this.state.mfaCode}
                                    onChange={(event) => this.setState({ mfaCode: event.target.value.replace(/\D/g, '') })}
                                    className="w-full p-3 text-center text-xl tracking-[0.4em] border border-slate-300 rounded-xl"
                                />
                                <button type="submit" disabled={this.state.isSubmitting || this.state.mfaCode.length !== 6} className="inputSubmit mt-2">
                                    {this.state.isSubmitting ? 'Verifying…' : 'Verify & Sign In'}
                                </button>
                                <button type="button" onClick={() => this.setState({ mfaResolver: null, mfaCode: '', password: '' })} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
                            </form>
                        )}
                        {/* Login Form */}
                        <form onSubmit={this.login} className={`w-full flex-col ${this.state.mfaResolver ? 'hidden' : 'flex'}`} autoComplete="on" noValidate>
                            <Input 
                                name="Email" 
                                title={t("login.email")} 
                                value={this.state.email} 
                                handleInputs={this.handleInputs} 
                                onBlur={this.handleBlur}
                                errorMessage={this.state.errors['Email']}
                            />
                            <Input
                                name="Password"
                                type="Password"
                                title={t("login.password")}
                                value={this.state.password}
                                handleInputs={this.handleInputs}
                                onBlur={this.handleBlur}
                                errorMessage={this.state.errors['Password']}
                            />
                            
                            {/* Remember Me & Forgot Password Row */}
                            <div className="flex items-center justify-between my-2.5 text-[13.5px] text-[#475569]">
                                <label className="flex items-center gap-2 cursor-pointer select-none font-medium hover:text-[#1e293b] transition-colors">
                                    <input 
                                        type="checkbox" 
                                        id="remember-me-checkbox"
                                        checked={this.state.rememberMe} 
                                        onChange={this.toggleRememberMe}
                                        className="w-4 h-4 rounded-md border-slate-300 text-[#6366f1] focus:ring-[#6366f1]/20 accent-[#6366f1] cursor-pointer"
                                    />
                                    <span>Remember me</span>
                                </label>
                                <a 
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && this.props.showPasswordRecovery && this.props.showPasswordRecovery()}
                                    onClick={() => this.props.showPasswordRecovery && this.props.showPasswordRecovery()}
                                    className="text-[#6366f1] hover:text-[#4f46e5] font-semibold text-[13px] hover:underline cursor-pointer transition-all duration-200"
                                >
                                    Forgot password?
                                </a>
                            </div>

                            {/* GAP-01: Loading state on submit button */}
                            <input
                                className="inputSubmit mt-2"
                                value={this.state.isSubmitting ? 'Signing in…' : t('login.login')}
                                type="submit"
                                disabled={this.state.isSubmitting}
                                style={{ opacity: this.state.isSubmitting ? 0.75 : 1, cursor: this.state.isSubmitting ? 'not-allowed' : 'pointer' }}
                            />
                        </form>
                    </div>
                {/* Modal Footer */}
                <div className="modalFooter">
                    <span>{t("login.dontHaveAcc")}<a onClick={() => this.props.handleNavigationClick()}>{t("login.signup")}</a></span>
                </div>
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(Login)
export default MyComponent;