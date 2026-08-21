import React, { useState, useEffect } from 'react';
import fire from '../../../conf/fire';
import { FaLock, FaCheckCircle, FaSpinner, FaExclamationTriangle, FaEye, FaEyeSlash } from 'react-icons/fa';

const ResetPasswordModal = ({ oobCode, initialEmail, onClose }) => {
    const [email, setEmail] = useState(initialEmail || '');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(!!oobCode);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    useEffect(() => {
        if (initialEmail) {
            setEmail(initialEmail);
            setLoading(false);
            return;
        }

        if (!oobCode) {
            setErrorMessage('Invalid or expired password reset link.');
            setLoading(false);
            return;
        }

        // Verify the password reset code with Firebase Auth
        fire.auth().verifyPasswordResetCode(oobCode)
            .then((userEmail) => {
                setEmail(userEmail);
                setLoading(false);
            })
            .catch((err) => {
                console.error('[Verify Code Error]:', err);
                setErrorMessage('This password reset link is invalid, expired, or has already been used.');
                setLoading(false);
            });
    }, [oobCode, initialEmail]);

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setErrorMessage(null);

        if (!newPassword || newPassword.length < 6) {
            setErrorMessage('Password must be at least 6 characters long.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setErrorMessage('Passwords do not match. Please re-type your confirm password.');
            return;
        }

        setSubmitting(true);
        try {
            if (oobCode) {
                // Firebase standard flow: confirm password reset with Firebase oobCode
                await fire.auth().confirmPasswordReset(oobCode, newPassword);
            } else {
                const params = new URLSearchParams(window.location.search);
                const token = params.get('token');

                // Call custom backend API — Admin SDK updates Firebase Auth password server-side
                const res = await fetch('/api/auth/set-user-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, newPassword, token })
                });

                const contentType = res.headers.get('content-type') || '';
                let data = {};
                if (contentType.includes('application/json')) {
                    data = await res.json();
                }

                if (!data.success) {
                    throw new Error(data.error || 'Failed to update password. Please try again.');
                }

            }

            setSuccessMessage(`Password updated successfully for ${email}! Logging you in...`);

            // Auto sign-in with the new password
            try {
                const userCred = await fire.auth().signInWithEmailAndPassword(email, newPassword);
                if (userCred && userCred.user) {
                    const u = userCred.user;
                    const nameParts = (u.displayName || email.split('@')[0] || 'User').split(' ');
                    const { default: addUser } = await import('../../../firestore/auth');
                    await addUser(u.uid, nameParts[0] || 'User', nameParts.slice(1).join(' ') || '', u.email);
                }
            } catch (loginErr) {
                console.warn('[Auto Login Note]:', loginErr.message);
            }

            setTimeout(async () => {
                if (onClose) onClose();
                try {
                    const { getPostLoginRedirectPath, clearPostLoginRedirectPath, isSafeInternalPath } = await import('../../../utils/safeInternalPath');
                    const targetPath = getPostLoginRedirectPath(window.location.search);
                    if (targetPath && isSafeInternalPath(targetPath)) {
                        clearPostLoginRedirectPath();
                        window.location.href = targetPath;
                        return;
                    }
                    const currentPath = window.location.pathname;
                    if (
                        currentPath.startsWith('/enterprise') ||
                        currentPath.startsWith('/dashboard') ||
                        currentPath.startsWith('/build') ||
                        currentPath.startsWith('/portfolio') ||
                        currentPath.startsWith('/adm')
                    ) {
                        return;
                    }
                    window.location.href = '/dashboard';
                } catch (_) {
                    window.location.href = '/dashboard';
                }
            }, 2000);
        } catch (err) {
            console.error('[Confirm Password Reset Error]:', err);
            setErrorMessage(err.message || 'Failed to reset password. Link may have expired.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-5 relative animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="text-center space-y-1">
                    <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 mx-auto mb-2">
                        <FaLock className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-extrabold text-slate-900">Set New Account Password</h3>
                    {email && (
                        <p className="text-xs text-slate-500">
                            Resetting password for: <strong className="text-indigo-600 font-mono">{email}</strong>
                        </p>
                    )}
                </div>

                {loading && (
                    <div className="flex flex-col items-center justify-center py-6 space-y-2 text-slate-500">
                        <FaSpinner className="animate-spin w-6 h-6 text-indigo-600" />
                        <span className="text-xs font-semibold">Verifying reset token...</span>
                    </div>
                )}

                {!loading && errorMessage && !email && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-3 text-center">
                        <FaExclamationTriangle className="w-6 h-6 text-rose-500 mx-auto" />
                        <p className="text-xs font-bold text-rose-800">{errorMessage}</p>
                        <button
                            onClick={() => { if (onClose) onClose(); window.location.href = '/'; }}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all"
                        >
                            Return to Sign In
                        </button>
                    </div>
                )}

                {!loading && email && (
                    <form onSubmit={handleResetPassword} className="space-y-4">
                        {errorMessage && (
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-800 flex items-center space-x-2">
                                <FaExclamationTriangle className="text-rose-600 shrink-0" />
                                <span>{errorMessage}</span>
                            </div>
                        )}

                        {successMessage && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center space-x-2">
                                <FaCheckCircle className="text-emerald-600 shrink-0" />
                                <span>{successMessage}</span>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">New Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Enter new password"
                                    className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-600 font-mono pr-10"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 text-xs"
                                >
                                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Confirm New Password</label>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Re-type new password..."
                                className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-600 font-mono"
                                required
                            />
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-md flex items-center justify-center space-x-2 disabled:opacity-50"
                            >
                                {submitting ? (
                                    <>
                                        <FaSpinner className="animate-spin w-4 h-4" />
                                        <span>Updating Password...</span>
                                    </>
                                ) : (
                                    <span>Set New Password &amp; Log In →</span>
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ResetPasswordModal;
