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
            isSubmitting: false,
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

        this.setState({ isSubmitting: true });

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

            const successMsg = `Password reset link sent to ${emailAddress}! Please check your inbox.`;
            if (this.props.throwSuccess) this.props.throwSuccess(successMsg);
            else alert(successMsg);

            this.setState({ isSubmitting: false });
            // Delay closing so user can see the success toast
            setTimeout(() => {
                if (this.props.closeModal) this.props.closeModal();
            }, 2500);
        } catch (err) {
            console.error('[Password Recovery Error]:', err);
            
            // Fallback: If custom SMTP server is unreachable, use Firebase client SDK
            try {
                await fire.auth().sendPasswordResetEmail(emailAddress);
                const fallbackMsg = `Password reset link sent to ${emailAddress}! Please check your inbox.`;
                if (this.props.throwSuccess) this.props.throwSuccess(fallbackMsg);
                else alert(fallbackMsg);
                this.setState({ isSubmitting: false });
                setTimeout(() => {
                    if (this.props.closeModal) this.props.closeModal();
                }, 2500);
            } catch (fbErr) {
                this.setState({ isSubmitting: false });
                const errMsg = fbErr.message || err.message;
                if (this.props.throwError) this.props.throwError(errMsg);
                else alert(errMsg);
            }
        }
    }
    render() {
        const { t } = this.props;
        const { isSubmitting } = this.state;
        return (
            <div className="auth">
                <div className="head">
                    <div className="brandBadge">🔒 Password Recovery</div>
                    <span>{t("login.passwordRecovery")}</span>
                    <p>Enter your email and we'll send you a reset link instantly.</p>
                </div>
                <div className="body">
                    <form onSubmit={this.recoverPassword} className="w-full flex flex-col">
                        <Input name='Email' title={t("login.email")} value={this.state.email} handleInputs={this.handleInputs} />
                        <input
                            className="inputSubmit mt-2"
                            value={isSubmitting ? "Sending reset link…" : t("login.recoverMyPassword")}
                            type="submit"
                            disabled={isSubmitting}
                            style={{ opacity: isSubmitting ? 0.7 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
                        />
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