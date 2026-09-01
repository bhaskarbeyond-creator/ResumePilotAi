import React, { Component } from 'react';
import './AuthWrapper.scss'
import Login from '../login/Login'
import { motion, AnimatePresence } from 'framer-motion'
import Register from '../register/Register'
import RecoverPassword from '../recoverPassword/RecoverPassword';
import Toast from '../../Toasts/Toats';
class AuthWrapper extends Component {
    constructor(props) {
        super(props);
        const isRegister = props?.initialMode === 'signup' || props?.mode === 'signup' || props?.initialTab === 'register';
        this.state = {
            isLoggedInShowed: !isRegister,
            isRecoverPasswordShowed: false,
            isErrorToastShowed: false,
            isSuccessToastShowed: false,
            errorMessage: "",
            successMessage: ""
        }
        this.handleClickOutside = this.handleClickOutside.bind(this)
        this.handleNavigationClick = this.handleNavigationClick.bind(this);
        this.showPasswordRecovery = this.showPasswordRecovery.bind(this);
        this.throwError = this.throwError.bind(this);
        this.throwSuccess = this.throwSuccess.bind(this);
    }
    componentDidMount() {
        document.getElementById("authWrapper").addEventListener('mousedown', this.handleClickOutside);
    }
    handleClickOutside(e) {
        if (e.target !== e.currentTarget) return;
        this.props.closeModal();
    }
    handleNavigationClick() {
        this.setState((prevState, _props) => ({
            isLoggedInShowed: prevState.isLoggedInShowed ? false : true,
            isRecoverPasswordShowed: false,
        }));
    }
    showPasswordRecovery() {
        this.setState((_prevState, _props) => ({
            isLoggedInShowed: false,
            isRecoverPasswordShowed: true,
        }));
    }
    throwError(message) {
        this.setState({
            isErrorToastShowed: true,
            errorMessage: message
        });
        setTimeout(() => {
            this.setState({
                isErrorToastShowed: false
            });
        }, 4000);
    }
    throwSuccess(message) {
        this.setState({
            isSuccessToastShowed: true,
            successMessage: message || ''
        });
        setTimeout(() => {
            this.setState({
                isSuccessToastShowed: false,
                successMessage: ''
            });
        }, 5000);
    }
    render() {
        return (
            <div id="authWrapper" className="authWrapper ">
                <AnimatePresence>
                    {this.state.isErrorToastShowed && (
                        <motion.div
                            style={{ position: 'fixed', top: 24, right: 24, zIndex: 100000, pointerEvents: 'none' }}
                            initial={{ opacity: 0, y: -20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.95 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        >
                            <Toast type="Error" message={this.state.errorMessage}></Toast>
                        </motion.div>
                    )}
                </AnimatePresence>
                <AnimatePresence>
                    {this.state.isSuccessToastShowed && (
                        <motion.div
                            style={{ position: 'fixed', top: 24, right: 24, zIndex: 100000, pointerEvents: 'none' }}
                            initial={{ opacity: 0, y: -20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.95 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        >
                            {/* GAP-05: Pass title based on message content for correct semantic heading */}
                            <Toast
                                type="SuccessEmail"
                                title={
                                    (this.state.successMessage || '').startsWith('Welcome back')
                                        ? ''
                                        : (this.state.successMessage || '').startsWith('Welcome aboard')
                                        ? 'Account Created!'
                                        : (this.state.successMessage || '').startsWith('Password reset')
                                        ? 'Email Sent'
                                        : 'Success'
                                }
                                message={this.state.successMessage}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
                <div className="authModal">
                    <button className="closeModalBtn" onClick={this.props.closeModal} title="Close Modal">✕</button>
                    <AnimatePresence mode="wait">
                        {
                            this.state.isLoggedInShowed &&
                            <motion.div key="login" className="motionDivAuth" initial={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
                                <Login showPasswordRecovery={this.showPasswordRecovery} throwError={this.throwError} throwSuccess={this.throwSuccess} closeModal={this.props.closeModal} handleNavigationClick={this.handleNavigationClick} />
                            </motion.div>
                        }
                        {
                            this.state.isLoggedInShowed === false && this.state.isRecoverPasswordShowed === false &&
                            <motion.div key="register" className="motionDivAuth" initial={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
                                <Register closeModal={this.props.closeModal} throwError={this.throwError} throwSuccess={this.throwSuccess} handleNavigationClick={this.handleNavigationClick} />
                            </motion.div>
                        }
                        {
                            this.state.isRecoverPasswordShowed === true &&
                            <motion.div key="recover" style={{ display: "flex", justifyContent: "center" }} className="motionDivAuth" initial={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
                                <RecoverPassword throwSuccess={this.throwSuccess} closeModal={this.props.closeModal} throwError={this.throwError} handleNavigationClick={this.handleNavigationClick} />
                            </motion.div>
                        }
                    </AnimatePresence>
                </div>
            </div>
        )
    }
}
export default AuthWrapper;