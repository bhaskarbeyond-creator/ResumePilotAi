import React, { Component } from 'react';
import GoogleImage from '../../../assets/google.png';
import FacebookImage from '../../../assets/facebook.png';
import Input from '../../Form/simple-input/SimpleInput';
import { addUser, IncrementUsers } from '../../../firestore/dbOperations'
import fire from '../../../conf/fire';
import { withTranslation } from 'react-i18next';
class RecoverPassword extends Component {
    constructor(props) {
        super(props);
        this.state = {
            email: "",
            isSuccessToastShowed: true,
        }
        this.handleInputs = this.handleInputs.bind(this);
        this.recoverPassword = this.recoverPassword.bind(this);
    }
    handleInputs(title, value) {
        switch (title) {
            case "Email":
                this.setState((prevState, props) => ({
                    email: value
                }));
                break;
            default:
                break;
        }
    }
    async recoverPassword(event) {
        event.preventDefault();
        const emailAddress = (this.state.email || '').trim();
        if (!emailAddress) {
            if (this.props.throwError) this.props.throwError("Please enter your email address.");
            else alert("Please enter your email address.");
            return;
        }

        try {
            // Primary: Dispatch branded password reset email via Hostinger SMTP server
            const res = await fetch('/api/auth/custom-password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailAddress })
            });

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to dispatch custom password reset email.');
            }

            const successMsg = `A password reset email has been sent to ${emailAddress} from your custom mail server! Please check your inbox.`;
            if (this.props.throwSuccess) this.props.throwSuccess(successMsg);
            else alert(successMsg);

            if (this.props.closeModal) this.props.closeModal();
        } catch (err) {
            console.error('[Password Recovery Error]:', err);
            
            // Fallback: If custom SMTP server is unreachable, use Firebase client SDK
            try {
                await fire.auth().sendPasswordResetEmail(emailAddress);
                const fallbackMsg = `Password reset link sent to ${emailAddress}! Please check your inbox.`;
                if (this.props.throwSuccess) this.props.throwSuccess(fallbackMsg);
                else alert(fallbackMsg);
                if (this.props.closeModal) this.props.closeModal();
            } catch (fbErr) {
                const errMsg = fbErr.message || err.message;
                if (this.props.throwError) this.props.throwError(errMsg);
                else alert(errMsg);
            }
        }
    }
    render() {
        const { t } = this.props;
        return (
            <div className="auth">
                <div className="head">
                    <span> {t("login.passwordRecovery")}</span>
                </div>
                <div className="body">
                    <form onSubmit={this.recoverPassword} className="registerForm">
                        <Input  name='Email' title={t("login.email")} handleInputs={this.handleInputs} />
                        <input className="inputSubmit" value={t("login.recoverMyPassword")} type="submit" />
                    </form>
                </div>
                {/* Modal Footer */}
                <div className="modalFooter">
                    <span>{t("login.alreadyHaveAccount")}<a onClick={() => this.props.handleNavigationClick()}>{t("login.login")}</a></span>
                </div>
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(RecoverPassword)
export default MyComponent;