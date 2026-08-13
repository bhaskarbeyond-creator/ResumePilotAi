import React, { Component } from 'react';
import './Login.scss'
import GoogleImage from '../../../assets/google.png'
import FacebookImage from '../../../assets/facebook.png'
import Input from '../../Form/simple-input/SimpleInput'
import fire,{googleProvider,facebookProvider} from '../../../conf/fire';
//import firebase from 'firebase';
import addUser from '../../../firestore/auth'
import { IncrementUsers } from '../../../firestore/dbOperations';
import { withTranslation } from 'react-i18next';
class Login extends Component {
    constructor(props) {
        super(props);
        this.state = {
            email: "",
            password: "",
            enableGoogle: true,
            enableFacebook: true
        }
        this.handleInputs = this.handleInputs.bind(this);
        this.signInWithGoogle = this.signInWithGoogle.bind(this);
        this.signInWithFacebook = this.signInWithFacebook.bind(this);
        this.login = this.login.bind(this);
    }
    componentDidMount() {
        import('../../../firestore/dbOperations').then(({ getSystemSettings }) => {
            getSystemSettings().then((settings) => {
                const mods = settings?.modules || {};
                this.setState({
                    enableGoogle: mods.enableGoogleAuthModule !== false,
                    enableFacebook: mods.enableFacebookAuthModule !== false
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
            // Successfully Logged in 
            if (this.props.closeModal) this.props.closeModal();
        }).catch((error) => {
            console.error('[Login Auth Error]:', error);
            let msg = error.message;
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                msg = `Invalid password for ${email}. If you signed up via Google, please click Google Sign-In above, or click "Recover Password" below to reset your password.`;
            } else if (error.code === 'auth/invalid-email') {
                msg = 'Please enter a valid email address.';
            } else if (error.code === 'auth/too-many-requests') {
                msg = 'Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore access by resetting your password.';
            }
            if (this.props.throwError) this.props.throwError(msg);
            else alert(msg);
        });
    }
    handleInputs(title, value) {
        switch (title) {
            case "Email":
                this.setState({ email: value });
                break;
            case "Password":
                this.setState({ password: value });
                break;
            default:
                break;
        }
    }
    signInWithGoogle() {
        const self = this;
        fire.auth().signInWithPopup(googleProvider).then(function (result) {
            var user = result.user;
            const nameParts = (user.displayName || '').trim().split(' ');
            const firstName = nameParts[0] || 'User';
            const lastName = nameParts.slice(1).join(' ') || '';
            addUser(user.uid, firstName, lastName, user.email).then((userRes) => {
                if (userRes && userRes.isNewUser) {
                    try {
                        fetch('/api/notify/user-signup', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userEmail: user.email, userName: user.displayName || firstName })
                        }).catch(e => {});
                    } catch (e) {}
                }
            });
            if (self.props.closeModal) self.props.closeModal();
        }).catch(function (error) {
            console.error("Google Auth Error:", error);
            let msg = error.message;
            if (error.code === 'auth/popup-blocked') {
                msg = 'Popup was blocked by your browser. Attempting redirect login...';
                fire.auth().signInWithRedirect(googleProvider);
                return;
            } else if (error.code === 'auth/operation-not-allowed' || error.code === 'auth/unauthorized-domain' || error.code === 'auth/configuration-not-found') {
                console.log('[Google Fallback] Firebase Auth not configured. Attempting Direct Google GIS login...');
                import('../../../utils/googleSdkAuth').then(({ directGoogleAuthFallback }) => {
                    directGoogleAuthFallback(self.props.closeModal, self.props.throwError);
                }).catch((e) => {
                    if (self.props.throwError) self.props.throwError('Google login error: ' + e.message);
                    else alert(e.message);
                });
                return;
            } else if (error.code === 'auth/popup-closed-by-user') {
                msg = 'Sign-in popup was closed before completing login.';
            }
            if (self.props.throwError) self.props.throwError(msg);
            else alert(msg);
        });
    }
    signInWithFacebook() {
        const self = this;
        fire.auth().signInWithPopup(facebookProvider).then(function (result) {
            var user = result.user;
            const nameParts = (user.displayName || '').trim().split(' ');
            const firstName = nameParts[0] || 'User';
            const lastName = nameParts.slice(1).join(' ') || '';
            addUser(user.uid, firstName, lastName, user.email);
            if (self.props.closeModal) self.props.closeModal();
        }).catch(function (error) {
            console.error("Facebook Auth Error:", error);
            let msg = error.message;
            if (error.code === 'auth/popup-blocked') {
                msg = 'Popup was blocked by your browser. Attempting redirect login...';
                fire.auth().signInWithRedirect(facebookProvider);
                return;
            } else if (error.code === 'auth/operation-not-allowed' || error.code === 'auth/unauthorized-domain' || error.code === 'auth/configuration-not-found') {
                console.log('[FB Fallback] Firebase Auth not configured. Attempting Direct Admin Facebook SDK login...');
                import('../../../utils/facebookSdkAuth').then(({ directFacebookAuthFallback }) => {
                    directFacebookAuthFallback(self.props.closeModal, self.props.throwError);
                }).catch((e) => {
                    if (self.props.throwError) self.props.throwError('Facebook login error: ' + e.message);
                    else alert(e.message);
                });
                return;
            } else if (error.code === 'auth/popup-closed-by-user') {
                msg = 'Sign-in popup was closed before completing login.';
            }
            if (self.props.throwError) self.props.throwError(msg);
            else alert(msg);
        });
    }
    render() {
        const { t } = this.props;
        return (
            <div className="auth ">
                <div className="head">
                    <span> {t("login.login")}</span>
                </div>
                <div className="body">
                    <div className="socialAuth">
                        {/* Google */}
                        {this.state.enableGoogle !== false && (
                            <div onClick={() => { this.signInWithGoogle() }} className="googleAuthItem">
                                <img src={GoogleImage} />
                                <span>{t("login.googleLogin")} Google</span>
                            </div>
                        )}
                        {/* Facebook */}
                        {this.state.enableFacebook !== false && (
                            <div onClick={() => { this.signInWithFacebook() }} className="facebookAuthItem">
                                <img src={FacebookImage} />
                                <span>{t("login.facebookLogin")} Facebook</span>
                            </div>
                        )}
                        {/* Devider */}
                        {(this.state.enableGoogle !== false || this.state.enableFacebook !== false) && (
                            <div className="devider">
                                <hr />
                                <span>{t("login.or")}</span>
                            </div>
                        )}
                        {/* Login Form  */}
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