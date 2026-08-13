import React, { Component } from 'react';
import './Register.scss';
import GoogleImage from '../../../assets/google.png';
import FacebookImage from '../../../assets/facebook.png';
import Input from '../../Form/simple-input/SimpleInput';
import { addUser, IncrementUsers } from '../../../firestore/dbOperations'
import fire, { googleProvider, facebookProvider } from '../../../conf/fire';
import Toast from '../../Toasts/Toats';
import { withTranslation } from 'react-i18next';

class Register extends Component {
    constructor(props) {
        super(props);
        this.state = {
            email: "",
            password: "",
            passwordRepeat: "",
            enableGoogle: true,
            enableFacebook: true
        }
        this.handleInputs = this.handleInputs.bind(this);
        this.signUp = this.signUp.bind(this);
        this.signInWithGoogle = this.signInWithGoogle.bind(this);
        this.signInWithFacebook = this.signInWithFacebook.bind(this);
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
    signInWithGoogle() {
        const self = this;
        fire.auth().signInWithPopup(googleProvider).then(function (result) {
            var user = result.user;
            const nameParts = (user.displayName || '').trim().split(' ');
            const firstName = nameParts[0] || 'User';
            const lastName = nameParts.slice(1).join(' ') || '';
            import('../../../firestore/dbOperations').then(({ addUser }) => {
                addUser(user.uid, firstName, lastName, user.email);
            }).catch(() => {});
            try {
                fetch('/api/notify/user-signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userEmail: user.email, userName: user.displayName || firstName })
                }).catch(e => {});
            } catch (e) {}
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
            import('../../../firestore/dbOperations').then(({ addUser }) => {
                addUser(user.uid, firstName, lastName, user.email);
            }).catch(() => {});
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
            }
            if (self.props.throwError) self.props.throwError(msg);
            else alert(msg);
        });
    }
    handleInputs(title, value) {
        switch (title) {
            case "Email":
                this.setState((prevState, props) => ({
                    email: value
                }));
                break;
            case "Password":
                this.setState((prevState, props) => ({
                    password: value
                }));
                break;
            case "Repeat Password":
                this.setState((prevState, props) => ({
                    passwordRepeat: value
                }));
                break;
            default:
                break;
        }
    }
    signUp(event) {
        event.preventDefault();
        if (this.state.passwordRepeat == this.state.password) {
            fire.auth().createUserWithEmailAndPassword(this.state.email, this.state.password).then((u) => {
                addUser(u.user.uid, "Welcome", "back", this.state.email);
                
                // Automatically dispatch Welcome Email to User & Admin Registration Alert
                try {
                    fetch('/api/notify/user-signup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userEmail: this.state.email, userName: this.state.email.split('@')[0] })
                    }).catch(e => console.warn('Signup email notice:', e.message));
                } catch (e) {}
            }).then((u) => {
                //    console.log(u)
                this.props.closeModal();
            }).catch((error) => {
                let msg = error.message;
                if (error.code === 'auth/email-already-in-use') {
                    msg = 'An account with this email already exists. Please click Login to sign in.';
                } else if (error.code === 'auth/weak-password') {
                    msg = 'Password should be at least 6 characters long.';
                } else if (error.code === 'auth/invalid-email') {
                    msg = 'Please enter a valid email address.';
                }
                this.props.throwError(msg);
                console.log(error);
            });
        } else {
            this.props.throwError("Passwords does not match");
        }
    }
    render() {
        const { t } = this.props;
        return (
            <div className="auth">
                <div className="head">
                    <span> {t("login.register")}</span>
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
                        {/* Divider */}
                        {(this.state.enableGoogle !== false || this.state.enableFacebook !== false) && (
                            <div className="devider">
                                <hr />
                                <span>{t("login.or")}</span>
                            </div>
                        )}
                    </div>
                    <form onSubmit={this.signUp} className="registerForm">
                        <Input name= "Email"  title= {t("login.email")} handleInputs={this.handleInputs} />
                        <Input name="Password" type="Password" title= {t("login.password")} handleInputs={this.handleInputs} />
                        <Input  name="Repeat Password"type="Password" title= {t("login.passwordRepeat")} handleInputs={this.handleInputs} />
                        <input className="inputSubmit" value= {t("login.register")} type="submit" />
                    </form>
                </div>
                {/* Modal Footer */}
                <div className="modalFooter">
                    <span> {t("login.alreadyHaveAccount")} <a onClick={() => this.props.handleNavigationClick()}> {t("login.login")}</a></span>
                </div>
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(Register)
export default MyComponent;