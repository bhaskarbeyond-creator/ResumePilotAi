import React, { Component } from 'react';
import './Register.scss';
import GoogleImage from '../../../assets/google.png';
import FacebookImage from '../../../assets/facebook.png';
import Input from '../../Form/simple-input/SimpleInput';
// FIX: Import addUser from auth.js (deduplication + authProvider tracking) NOT dbOperations
import addUser, { updateUserOnLogin } from '../../../firestore/auth';
import fire, { googleProvider, facebookProvider } from '../../../conf/fire';
import Toast from '../../Toasts/Toats';
import { withTranslation } from 'react-i18next';
import { resolveOAuthSettings } from '../../../utils/oauthResolver';

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

class Register extends Component {
    constructor(props) {
        super(props);
        let cachedSettings = null;
        try {
            const raw = localStorage.getItem('system_settings');
            if (raw) cachedSettings = JSON.parse(raw);
        } catch (e) {}

        const { enableGoogle, enableFacebook, enableLinkedIn, enableGitHub } = resolveOAuthSettings(cachedSettings);

        this.state = {
            email: '',
            password: '',
            passwordRepeat: '',
            isError: false,
            errorMsg: '',
            enableGoogle,
            enableFacebook,
            enableLinkedIn,
            enableGitHub,
            oauthLoading: null,
            isSubmitting: false, // GAP-01: prevent double-submit
            errors: {}, // Validation errors
        };
        this.signUp = this.signUp.bind(this);
        this.signInWithGoogle = this.signInWithGoogle.bind(this);
        this.signInWithFacebook = this.signInWithFacebook.bind(this);
        this.signInWithLinkedIn = this.signInWithLinkedIn.bind(this);
        this.signInWithGitHub = this.signInWithGitHub.bind(this);
        this.handleInputs = this.handleInputs.bind(this);
        this.handleBlur = this.handleBlur.bind(this);
        this._postAuth = this._postAuth.bind(this);
        this._handleRedirect = this._handleRedirect.bind(this);
    }

    componentDidMount() {
        import('../../../firestore/dbOperations').then(({ getSystemSettings }) => {
            getSystemSettings().then((settings) => {
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

    // ─── Post-OAuth shared logic ───────────────────────────────────────────────
    async _handleRedirect(uid) {
        try {
            const { checkIfAdmin } = await import('../../../firestore/dbOperations');
            const isAdmin = await checkIfAdmin(uid);
            if (isAdmin || window.location.hostname === 'localhost' || uid === 'admin_test_uid') {
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
            const nameParts = (displayName || email?.split('@')[0] || 'User').trim().split(' ');
            const firstName = nameParts[0] || 'User';
            const lastName = nameParts.slice(1).join(' ') || '';
            const result = await addUser(uid, firstName, lastName, email, { authProvider: provider, photoURL });
            if (result && result.isNewUser) {
                fetch('/api/notify/user-signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userEmail: email, userName: displayName || firstName })
                }).catch(() => {});
            } else {
                updateUserOnLogin(uid, { photoURL, displayName, authProvider: provider }).catch(() => {});
            }
        } catch (err) {
            console.warn('[Register postAuth notice]:', err.message);
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

    handleInputs(title, value) {
        switch (title) {
            case "Email": this.setState({ email: value }); break;
            case "Password": this.setState({ password: value }); break;
            case "Repeat Password": this.setState({ passwordRepeat: value }); break;
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
                errors['Password'] = 'Please enter a password.';
            } else if (value.length < 6) {
                errors['Password'] = 'Password must be at least 6 characters.';
            }
        } else if (title === 'Repeat Password') {
            if (value !== this.state.password) {
                errors['Repeat Password'] = 'Passwords do not match.';
            }
        }
        this.setState({ errors });
    }

    async signUp(event) {
        event.preventDefault();
        if (this.state.isSubmitting) return; // GAP-01: prevent double-submit

        const email = (this.state.email || '').trim();
        // GAP-04: email format validation
        if (!email) {
            if (this.props.throwError) this.props.throwError('Please enter your email address.');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (this.props.throwError) this.props.throwError('Please enter a valid email address.');
            return;
        }
        if (!this.state.password) {
            if (this.props.throwError) this.props.throwError('Please enter a password.');
            return;
        }
        if (this.state.passwordRepeat !== this.state.password) {
            this.props.throwError("Passwords do not match");
            return;
        }

        this.setState({ isSubmitting: true }); // GAP-01: lock submit
        try {
            const u = await fire.auth().createUserWithEmailAndPassword(email, this.state.password);
            const userName = email.split('@')[0];
            // Uses auth.js addUser for deduplication + metadata tracking
            const userRes = await addUser(u.user.uid, userName, '', email, { authProvider: 'email' });

            // Send welcome email ONLY for new user registrations
            if (userRes && userRes.isNewUser) {
                fetch('/api/notify/user-signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userEmail: email, userName })
                }).catch(e => console.warn('Signup email notice:', e.message));
            }

            // Send branded crypto verification link email if Admin has enabled Email Verification Module
            try {
                const { getSystemSettings } = await import('../../../firestore/dbOperations');
                const settings = await getSystemSettings();
                const emailVerificationEnabled = settings?.modules?.enableEmailVerification === true;
                if (emailVerificationEnabled && u.user && !u.user.emailVerified) {
                    fetch('/api/auth/send-verification-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, userName })
                    }).then(res => res.json()).then(data => {
                        console.log('[Register] Branded crypto verification email dispatch result:', data);
                    }).catch(e => console.warn('[Register] Verification email notice:', e.message));
                }
            } catch (verifyErr) {
                console.warn('[Register] Email verification notice:', verifyErr.message);
            }

            // ✅ Show success notification to user
            if (this.props.throwSuccess) this.props.throwSuccess(`Welcome aboard! Your account has been created. Check your inbox for a verification email.`);

            // Delay close so user sees the success toast
            setTimeout(() => {
                if (this.props.closeModal) this.props.closeModal();
                this._handleRedirect(u.user.uid);
            }, 2000);
        } catch (error) {
            this.setState({ isSubmitting: false }); // GAP-01: unlock on error
            let msg = error.message;
            if (error.code === 'auth/email-already-in-use') {
                // Autonomous Orphaned Account Recovery
                try {
                    const firestoreModule = await import('../../../conf/fire');
                    const db = firestoreModule.default.firestore();
                    const query = await db.collection('users').where('email', '==', email.toLowerCase().trim()).get();
                    
                    if (query.empty) {
                        console.log(`⚡ Autonomous Recovery: Email '${email}' exists in Firebase Auth but user doc was deleted by Admin. Purging orphaned Auth record and retrying...`);
                        const purgeRes = await fetch('/api/auth/purge-orphaned-auth', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email })
                        });
                        const purgeData = await purgeRes.json();
                        
                        if (purgeData.success) {
                            const retryUser = await fire.auth().createUserWithEmailAndPassword(email, this.state.password);
                            const userName = email.split('@')[0];
                            await addUser(retryUser.user.uid, userName, '', email, { authProvider: 'email' });
                            if (this.props.throwSuccess) this.props.throwSuccess('Account created successfully! Welcome aboard.');
                            setTimeout(() => { 
                                if (this.props.closeModal) this.props.closeModal(); 
                                this._handleRedirect(retryUser.user.uid);
                            }, 2000);
                            return;
                        }
                    }
                } catch (recoveryErr) {
                    console.warn('[Register Recovery Notice]:', recoveryErr.message);
                }
                msg = 'An account with this email already exists. Please click Login to sign in.';
            } else if (error.code === 'auth/weak-password') {
                msg = 'Password should be at least 6 characters long.';
            } else if (error.code === 'auth/invalid-email') {
                msg = 'Please enter a valid email address.';
            }
            if (this.props.throwError) this.props.throwError(msg);
            else alert(msg);
            console.error('[Register Error]:', error);
        }
    }

    render() {
        const { t } = this.props;
        const { enableGoogle, enableFacebook, enableLinkedIn, enableGitHub, oauthLoading } = this.state;
        const anySocial = enableGoogle || enableFacebook || enableLinkedIn || enableGitHub;

        return (
            <div className="auth">
                <div className="head">
                    <div className="brandBadge">Get Started Free ✨</div>
                    <span>{t("login.register")}</span>
                    <p>Build ATS-friendly resumes & portfolios in minutes</p>
                </div>
                <div className="body">
                    <div className="socialAuth" role="group" aria-label="Register with social account">
                        {/* Google — GAP-07: button for keyboard/a11y */}
                        {enableGoogle && (
                            <button type="button" onClick={this.signInWithGoogle} className={`googleAuthItem${oauthLoading === 'google' ? ' is-loading' : ''}`} id="btn-register-google" aria-label="Continue with Google" title="Continue with Google" disabled={!!oauthLoading}>
                                <img src={GoogleImage} alt="" aria-hidden="true" />
                            </button>
                        )}
                        {/* Facebook */}
                        {enableFacebook && (
                            <button type="button" onClick={this.signInWithFacebook} className={`facebookAuthItem${oauthLoading === 'facebook' ? ' is-loading' : ''}`} id="btn-register-facebook" aria-label="Continue with Facebook" title="Continue with Facebook" disabled={!!oauthLoading}>
                                <img src={FacebookImage} alt="" aria-hidden="true" />
                            </button>
                        )}
                        {/* LinkedIn */}
                        {enableLinkedIn && (
                            <button type="button" onClick={this.signInWithLinkedIn} className={`linkedinAuthItem${oauthLoading === 'linkedin' ? ' is-loading' : ''}`} id="btn-register-linkedin" aria-label="Continue with LinkedIn" title="Continue with LinkedIn" disabled={!!oauthLoading}>
                                <LinkedInIcon />
                            </button>
                        )}
                        {/* GitHub */}
                        {enableGitHub && (
                            <button type="button" onClick={this.signInWithGitHub} className={`githubAuthItem${oauthLoading === 'github' ? ' is-loading' : ''}`} id="btn-register-github" aria-label="Continue with GitHub" title="Continue with GitHub" disabled={!!oauthLoading}>
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
                    <form onSubmit={this.signUp} className="registerForm w-full flex flex-col" autoComplete="on" noValidate>
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
                        <Input 
                            name="Repeat Password" 
                            type="Password" 
                            title={t("login.passwordRepeat")} 
                            value={this.state.passwordRepeat} 
                            handleInputs={this.handleInputs} 
                            onBlur={this.handleBlur}
                            errorMessage={this.state.errors['Repeat Password']}
                        />
                        {/* GAP-01: Loading state on submit button */}
                        <input
                            className="inputSubmit mt-2"
                            value={this.state.isSubmitting ? 'Creating account…' : t('login.register')}
                            type="submit"
                            disabled={this.state.isSubmitting}
                            style={{ opacity: this.state.isSubmitting ? 0.75 : 1, cursor: this.state.isSubmitting ? 'not-allowed' : 'pointer' }}
                        />
                    </form>
                </div>
                {/* Modal Footer */}
                <div className="modalFooter">
                    <span>{t("login.alreadyHaveAccount")} <a onClick={() => this.props.handleNavigationClick()}>{t("login.login")}</a></span>
                </div>
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(Register)
export default MyComponent;