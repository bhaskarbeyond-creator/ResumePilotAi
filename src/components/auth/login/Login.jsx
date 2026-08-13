import React, { Component } from 'react';
import './Login.scss'
import GoogleImage from '../../../assets/google.png'
import FacebookImage from '../../../assets/facebook.png'
import Input from '../../Form/simple-input/SimpleInput'
import fire, { googleProvider, facebookProvider } from '../../../conf/fire';
import addUser from '../../../firestore/auth'
import { withTranslation } from 'react-i18next';

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
        this.state = {
            email: "",
            password: "",
            enableGoogle: true,
            enableFacebook: true,
            enableLinkedIn: true,
            enableGitHub: true,
            oauthLoading: null, // tracks which provider is loading
        };
        this.handleInputs = this.handleInputs.bind(this);
        this.signInWithGoogle = this.signInWithGoogle.bind(this);
        this.signInWithFacebook = this.signInWithFacebook.bind(this);
        this.signInWithLinkedIn = this.signInWithLinkedIn.bind(this);
        this.signInWithGitHub = this.signInWithGitHub.bind(this);
        this.login = this.login.bind(this);
        this._postAuth = this._postAuth.bind(this);
    }

    componentDidMount() {
        import('../../../firestore/dbOperations').then(({ getSystemSettings }) => {
            getSystemSettings().then(settings => {
                const modules = settings?.modules || {};
                const socialAuth = settings?.socialAuth || {};

                const enableGoogle = modules.enableGoogleAuthModule !== undefined ? !!modules.enableGoogleAuthModule : (modules.enableGoogle !== undefined ? !!modules.enableGoogle : true);
                const enableFacebook = modules.enableFacebookAuthModule !== undefined ? !!modules.enableFacebookAuthModule : (modules.enableFacebook !== undefined ? !!modules.enableFacebook : true);
                const enableLinkedIn = modules.enableLinkedinAuthModule !== undefined ? !!modules.enableLinkedinAuthModule : (modules.enableLinkedinLogin !== undefined ? !!modules.enableLinkedinLogin : (modules.enableLinkedIn !== undefined ? !!modules.enableLinkedIn : true));
                const enableGitHub = modules.enableGithubAuthModule !== undefined ? !!modules.enableGithubAuthModule : (modules.enableGithubLogin !== undefined ? !!modules.enableGithubLogin : (modules.enableGitHub !== undefined ? !!modules.enableGitHub : true));

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
        const email = (this.state.email || '').trim();
        const password = this.state.password || '';

        if (!email) {
            this.props.throwError('Please enter your email address.');
            return;
        }

        fire.auth().signInWithEmailAndPassword(email, password).then((u) => {
            if (this.props.closeModal) this.props.closeModal();
        }).catch((error) => {
            console.error('[Login Auth Error]:', error);
            let msg = error.message;
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                msg = `Invalid password for ${email}. If you signed up via Google or another provider, please use that sign-in button, or click "Recover Password" below to reset your password.`;
            } else if (error.code === 'auth/invalid-email') {
                msg = 'Please enter a valid email address.';
            } else if (error.code === 'auth/too-many-requests') {
                msg = 'Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password.';
            }
            if (this.props.throwError) this.props.throwError(msg);
            else alert(msg);
        });
    }

    handleInputs(title, value) {
        switch (title) {
            case "Email": this.setState({ email: value }); break;
            case "Password": this.setState({ password: value }); break;
            default: break;
        }
    }

    // ─── Post-OAuth shared logic ───────────────────────────────────────────────
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

    render() {
        const { t } = this.props;
        const { enableGoogle, enableFacebook, enableLinkedIn, enableGitHub, oauthLoading } = this.state;
        const anySocial = enableGoogle || enableFacebook || enableLinkedIn || enableGitHub;

        return (
            <div className="auth">
                <div className="head">
                    <span>{t("login.login")}</span>
                </div>
                <div className="body">
                    <div className="socialAuth">
                        {/* Google */}
                        {enableGoogle && (
                            <div onClick={this.signInWithGoogle} className={`googleAuthItem${oauthLoading === 'google' ? ' is-loading' : ''}`} id="btn-login-google">
                                <img src={GoogleImage} alt="Google" />
                                <span>{oauthLoading === 'google' ? 'Signing in...' : `${t("login.googleLogin")} Google`}</span>
                            </div>
                        )}
                        {/* Facebook */}
                        {enableFacebook && (
                            <div onClick={this.signInWithFacebook} className={`facebookAuthItem${oauthLoading === 'facebook' ? ' is-loading' : ''}`} id="btn-login-facebook">
                                <img src={FacebookImage} alt="Facebook" />
                                <span>{oauthLoading === 'facebook' ? 'Signing in...' : `${t("login.facebookLogin")} Facebook`}</span>
                            </div>
                        )}
                        {/* LinkedIn */}
                        {enableLinkedIn && (
                            <div 
                                onClick={this.signInWithLinkedIn} 
                                className={`linkedinAuthItem${oauthLoading === 'linkedin' ? ' is-loading' : ''}`} 
                                id="btn-login-linkedin"
                                style={{
                                    cursor: 'pointer',
                                    width: '100%',
                                    maxWidth: '350px',
                                    backgroundColor: '#0A66C2',
                                    color: '#ffffff',
                                    border: '1px solid #0A66C2',
                                    borderRadius: '5px',
                                    textAlign: 'center',
                                    padding: '10px 16px',
                                    marginBottom: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px',
                                    boxSizing: 'border-box',
                                    marginLeft: 'auto',
                                    marginRight: 'auto'
                                }}
                            >
                                <LinkedInIcon />
                                <span style={{ color: '#ffffff', fontFamily: 'Poppins, sans-serif', fontSize: '14px', fontWeight: 600 }}>
                                    {oauthLoading === 'linkedin' ? 'Redirecting...' : 'Continue with LinkedIn'}
                                </span>
                            </div>
                        )}
                        {/* GitHub */}
                        {enableGitHub && (
                            <div 
                                onClick={this.signInWithGitHub} 
                                className={`githubAuthItem${oauthLoading === 'github' ? ' is-loading' : ''}`} 
                                id="btn-login-github"
                                style={{
                                    cursor: 'pointer',
                                    width: '100%',
                                    maxWidth: '350px',
                                    backgroundColor: '#24292e',
                                    color: '#ffffff',
                                    border: '1px solid #24292e',
                                    borderRadius: '5px',
                                    textAlign: 'center',
                                    padding: '10px 16px',
                                    marginBottom: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px',
                                    boxSizing: 'border-box',
                                    marginLeft: 'auto',
                                    marginRight: 'auto'
                                }}
                            >
                                <GitHubIcon />
                                <span style={{ color: '#ffffff', fontFamily: 'Poppins, sans-serif', fontSize: '14px', fontWeight: 600 }}>
                                    {oauthLoading === 'github' ? 'Redirecting...' : 'Continue with GitHub'}
                                </span>
                            </div>
                        )}
                        {/* Divider */}
                        {anySocial && (
                            <div className="devider">
                                <hr />
                                <span>{t("login.or")}</span>
                            </div>
                        )}
                        {/* Login Form */}
                        <form onSubmit={this.login}>
                            <div>
                                <Input name="Email" title={t("login.email")} handleInputs={this.handleInputs} />
                            </div>
                            <div>
                                <Input name="Password" type="Password" title={t("login.password")} handleInputs={this.handleInputs} />
                            </div>
                            <input className="inputSubmit" value={t("login.login")} type="submit" />
                        </form>
                    </div>
                </div>
                {/* Modal Footer */}
                <div className="modalFooter">
                    <span>{t("login.dontHaveAcc")}<a onClick={() => this.props.handleNavigationClick()}>{t("login.signup")}</a></span>
                    <span>{t("login.passwordLost")} <a onClick={() => this.props.showPasswordRecovery()}>{t("login.recoverPassword")}</a></span>
                </div>
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(Login)
export default MyComponent;