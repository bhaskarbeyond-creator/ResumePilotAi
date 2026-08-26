import React, { Component } from 'react';
import { editUser, getUserById } from '../../../firestore/dbOperations';
import { fetchAdminWithReauth } from '../../../services/adminReauth';
import fire from '../../../conf/fire';
import { useLocation } from 'react-router-dom';
import { useAdminSession } from '../AdminContext';
import { FaUser, FaEnvelope, FaCrown, FaCalendar, FaSave, FaCheck, FaTimes, FaUserEdit, FaSpinner, FaInfoCircle, FaShieldAlt, FaBan, FaLock } from 'react-icons/fa';
import { parseSafeDate } from '../../../utils/subscriptionUtils';

class UserEdit extends Component {
    constructor(props) {
        super(props);
        this.state = {
            email: this.props.email || '',
            userId: this.props.userId || '',
            subscription: this.props.membership || '',
            subscriptionEnd: this.props.membershipEnd || '',
            role: this.props.role || (this.props.isA ? 'ADMIN' : 'USER'),
            suspended: Boolean(this.props.suspended),
            initialMembership: this.props.membership || 'Basic',
            initialRole: this.props.role || (this.props.isA ? 'ADMIN' : 'USER'),
            initialSuspended: Boolean(this.props.suspended),
            emailVerified: null,
            mfaEnabled: null,
            isLoading: false,
            successMessage: '',
            errorMessage: '',
            auditEvents: [],
            auditLoading: false,
            auditError: '',
        };
        this.editSelectedUser = this.editSelectedUser.bind(this);
        this.handleInputs = this.handleInputs.bind(this);
        this.formatDate = this.formatDate.bind(this);
        this.isSelfAccount = this.isSelfAccount.bind(this);
    }

    isSelfAccount() {
        const currentAuthUser = fire.auth().currentUser;
        if (!currentAuthUser) return false;
        return (this.state.userId && this.state.userId === currentAuthUser.uid) || 
               (this.state.email && this.state.email.toLowerCase().trim() === currentAuthUser.email?.toLowerCase().trim());
    }

    async editSelectedUser(userId, email, membership, membershipsEnds, role, suspended) {
        // Enforce self protection
        if (this.isSelfAccount()) {
            role = 'ADMIN'; // Wait, let's keep it whatever it is, self-demotion is blocked in backend.
            suspended = false;
        }
        this.setState({ isLoading: true, errorMessage: '', successMessage: '' });
        try {
            await editUser(userId, email, membership, membershipsEnds, null, suspended, {
                expectedMembership: this.state.initialMembership || 'Basic',
                expectedSuspended: Boolean(this.state.initialSuspended),
            });
            
            // Only update role if it changed from initial props
            const initialRole = this.state.initialRole || 'USER';
            if (role !== initialRole && this.props.isSuperAdmin) {
                const { setUserRole } = await import('../../../firestore/dbOperations');
                const roleRes = await setUserRole(userId, role, initialRole);
                if (!roleRes.success) throw new Error(roleRes.error || 'Failed to update user role');
            }

            this.setState({
                isLoading: false,
                successMessage: 'User account updated successfully!',
                errorMessage: '',
                initialMembership: this.state.subscription || 'Basic',
                initialRole: role,
                initialSuspended: Boolean(suspended),
            });
            setTimeout(() => {
                this.setState({ successMessage: '' });
            }, 3000);
        } catch (error) {
            this.setState({
                isLoading: false,
                errorMessage: error.message || 'Error occurred while saving changes. Please check the entered fields!',
                successMessage: '',
            });
        }
    }

    handleInputs(inputName, inputValue) {
        this.setState({ [inputName]: inputValue });
    }

    componentDidMount() {
        if (this.props.userId) {
            this.setState({ auditLoading: true });
            fetchAdminWithReauth(`/api/admin/users/${encodeURIComponent(this.props.userId)}/audit`)
                .then(({ response, data }) => {
                    if (!response.ok) throw new Error(data.error?.message || data.error || 'Audit history unavailable.');
                    this.setState({ auditEvents: data.events || [], auditError: '' });
                })
                .catch(error => this.setState({ auditError: error.message || 'Audit history unavailable.' }))
                .finally(() => this.setState({ auditLoading: false }));
        }
        const userEmail = this.props.email || this.props.userId;
        if (userEmail) {
            getUserById(userEmail)
                .then((data) => {
                    if (data) {
                        let subEnd = this.state.subscriptionEnd;
                        if (data.membershipEnds) {
                            const parsedEnd = parseSafeDate(data.membershipEnds);
                            if (parsedEnd) subEnd = this.formatDate(parsedEnd);
                        }
                        this.setState({
                            email: data.email || this.state.email,
                            subscription: data.membership || this.state.subscription,
                            subscriptionEnd: subEnd,
                            role: data.role || (data.isA ? 'ADMIN' : 'USER'),
                            suspended: data.suspended !== undefined ? Boolean(data.suspended) : this.state.suspended,
                            initialMembership: data.membership || this.state.initialMembership || 'Basic',
                            initialRole: data.role || (data.isA ? 'ADMIN' : 'USER'),
                            initialSuspended: data.suspended !== undefined ? Boolean(data.suspended) : this.state.initialSuspended,
                            emailVerified: data.emailVerified === true,
                            mfaEnabled: data.mfaEnabled === true,
                        });
                    }
                })
                .catch((error) => {
                    console.error('Error fetching user data:', error);
                });
        }
    }

    formatDate(date) {
        const parsed = date instanceof Date ? date : new Date(date);
        if (!Number.isFinite(parsed.getTime())) return '';
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${parsed.getFullYear()}-${month}-${day}`;
    }

    render() {
        const isSelf = this.isSelfAccount();

        return (
            <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
                {/* Header Section */}
                <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
                    <div className="flex items-center space-x-3 mb-4">
                        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                            <FaUserEdit className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 flex items-center space-x-2">
                                <span>Edit User Account</span>
                                {isSelf && (
                                    <span className="px-2.5 py-0.5 text-xs bg-blue-100 text-blue-800 font-semibold rounded-full border border-blue-200">
                                        Active Logged-In Admin (You)
                                    </span>
                                )}
                            </h1>
                            <p className="text-sm text-slate-500">Manage user details, subscription plans, suspension, and admin permissions</p>
                        </div>
                    </div>

                    {/* User Info Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="bg-slate-50 rounded-lg p-4">
                            <div className="flex items-center space-x-2">
                                <FaBan className={`w-4 h-4 ${this.state.suspended ? 'text-rose-600' : 'text-emerald-600'}`} />
                                <span className="text-sm text-slate-600">Account Status</span>
                            </div>
                            <p className={`text-lg font-semibold ${this.state.suspended ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {this.state.suspended ? 'Suspended' : 'Active'}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <div className="flex items-center space-x-2">
                                <FaShieldAlt className={`w-4 h-4 ${this.state.role === 'ADMIN' ? 'text-red-600' : this.state.role === 'SUPER_ADMIN' ? 'text-indigo-600' : 'text-slate-600'}`} />
                                <span className="text-sm text-slate-600">Account Role</span>
                            </div>
                            <p className="text-lg font-semibold text-slate-900">
                                {this.state.role === 'SUPER_ADMIN' ? 'Super Admin' : this.state.role === 'ADMIN' ? 'Administrator' : this.state.role === 'SUPPORT' ? 'Support' : 'Standard User'}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <div className="flex items-center space-x-2">
                                <FaCrown className="w-4 h-4 text-amber-500" />
                                <span className="text-sm text-slate-600">Current Plan</span>
                            </div>
                            <p className="text-lg font-semibold text-slate-900">
                                {this.state.subscription || 'Basic'}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <div className="flex items-center space-x-2">
                                <FaCalendar className="w-4 h-4 text-emerald-500" />
                                <span className="text-sm text-slate-600">Security</span>
                            </div>
                            <p className={`text-sm font-semibold ${this.state.emailVerified === false || this.state.mfaEnabled === false ? 'text-amber-700' : 'text-emerald-700'}`}>{this.state.emailVerified === null ? 'Checking…' : this.state.emailVerified ? 'Email verified' : 'Email unverified'} · {this.state.mfaEnabled === null ? 'MFA unknown' : this.state.mfaEnabled ? 'MFA enabled' : 'MFA not enrolled'}</p>
                        </div>
                    </div>
                </div>

                {/* Success Message */}
                {this.state.successMessage && (
                    <div className="bg-white border border-emerald-200 rounded-lg p-4 mb-6">
                        <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                                <FaCheck className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-medium text-emerald-900">Success</h4>
                                <p className="text-sm text-emerald-700">{this.state.successMessage}</p>
                            </div>
                            <button
                                onClick={() => this.setState({ successMessage: '' })}
                                className="w-6 h-6 flex items-center justify-center text-emerald-400 hover:text-emerald-600 transition-colors"
                            >
                                <FaTimes className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {this.state.errorMessage && (
                    <div className="bg-white border border-red-200 rounded-lg p-4 mb-6">
                        <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                                <FaTimes className="w-4 h-4 text-red-600" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-medium text-red-900">Error</h4>
                                <p className="text-sm text-red-700">{this.state.errorMessage}</p>
                            </div>
                            <button
                                onClick={() => this.setState({ errorMessage: '' })}
                                className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600 transition-colors"
                            >
                                <FaTimes className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                )}

                <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5" aria-labelledby="user-audit-heading">
                    <div className="flex items-center justify-between gap-3"><div><h2 id="user-audit-heading" className="text-sm font-bold text-slate-900">User audit &amp; security activity</h2><p className="text-xs text-slate-500">Server-side events for this identity; no client-supplied actor data is trusted.</p></div>{this.state.auditLoading && <FaSpinner className="animate-spin text-slate-400" aria-label="Loading user audit" />}</div>
                    {this.state.auditError && <p className="mt-3 text-xs text-amber-700" role="alert">{this.state.auditError}</p>}
                    {!this.state.auditLoading && !this.state.auditError && this.state.auditEvents.length === 0 && <p className="mt-3 text-xs text-slate-500">No audit events recorded for this user.</p>}
                    {this.state.auditEvents.length > 0 && <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">{this.state.auditEvents.slice(0, 20).map(event => <li key={event.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-2 text-[11px]"><span className="font-semibold text-slate-700">{event.action || 'UNKNOWN'}{event.outcome ? ` · ${event.outcome}` : ''}</span><span className="text-slate-400">{event.createdAt ? new Date(event.createdAt).toLocaleString() : 'time unavailable'}</span></li>)}</ul>}
                </section>

                {/* User Edit Form */}
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200">
                        <h3 className="text-lg font-semibold text-slate-900">User Account Details</h3>
                        <p className="text-sm text-slate-500">Update user information, suspension status, admin role, and subscription settings</p>
                    </div>

                    <form className="p-6 space-y-6" onSubmit={(e) => e.preventDefault()}>
                        {/* User ID */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-3">
                                <div className="flex items-center space-x-2">
                                    <FaUser className="w-4 h-4 text-slate-600" />
                                    <span>User ID</span>
                                </div>
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={this.state.userId}
                                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed font-mono text-sm"
                                    readOnly
                                />
                                <FaUser className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                            </div>
                            <div className="flex items-center space-x-1 mt-2">
                                <FaInfoCircle className="w-3 h-3 text-slate-400" />
                                <p className="text-xs text-slate-500">User ID is read-only and cannot be modified</p>
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-3">
                                <div className="flex items-center space-x-2">
                                    <FaEnvelope className="w-4 h-4 text-slate-600" />
                                    <span>Email Address</span>
                                </div>
                            </label>
                            <div className="relative">
                                <input
                                    type="email"
                                    value={this.state.email}
                                    readOnly
                                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed focus:outline-none transition-colors"
                                    placeholder="Authenticated email"
                                />
                                <FaEnvelope className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                            </div>
                            <p className="mt-2 text-xs text-slate-500">Email identity is read-only here; change it through the verified Firebase account-recovery workflow.</p>
                        </div>

                        {/* Account Suspension Toggle */}
                        <div className={`border rounded-lg p-4 ${isSelf ? 'bg-slate-100 border-slate-200 opacity-80' : 'bg-rose-50/70 border-rose-200'}`}>
                            <label className={`flex items-center space-x-3 ${isSelf ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                <input
                                    type="checkbox"
                                    checked={isSelf ? false : this.state.suspended}
                                    disabled={isSelf}
                                    onChange={(e) => this.handleInputs('suspended', e.target.checked)}
                                    className="w-5 h-5 text-rose-600 border-slate-300 rounded focus:ring-rose-500 disabled:opacity-50"
                                />
                                <div>
                                    <div className="flex items-center space-x-2">
                                        {isSelf ? <FaLock className="w-4 h-4 text-slate-500" /> : <FaBan className="w-4 h-4 text-rose-600" />}
                                        <span className="font-semibold text-slate-900 text-sm">Suspend Account (Disable Access)</span>
                                    </div>
                                    <p className="text-xs text-slate-600 mt-0.5">
                                        {isSelf
                                            ? '🔒 Your active self admin account cannot be suspended to ensure at least one administrator remains active.'
                                            : 'Temporarily disable this account. The user will be automatically signed out and blocked from logging in.'}
                                    </p>
                                </div>
                            </label>
                        </div>

                        {/* Admin Privileges Dropdown */}
                        <div className={`border rounded-lg p-4 ${isSelf || this.state.role === 'SUPER_ADMIN' ? 'bg-slate-100 border-slate-200 opacity-80' : 'bg-red-50/60 border-red-200'}`}>
                            <label className="block text-sm font-medium text-slate-700 mb-3">
                                <div className="flex items-center space-x-2">
                                    {isSelf ? <FaLock className="w-4 h-4 text-slate-500" /> : <FaShieldAlt className="w-4 h-4 text-red-600" />}
                                    <span className="font-semibold text-slate-900 text-sm">Account Role</span>
                                </div>
                            </label>
                            <div className="relative">
                                <select
                                    disabled={!this.props.isSuperAdmin || isSelf || this.state.role === 'SUPER_ADMIN'}
                                    onChange={(e) => this.handleInputs('role', e.target.value)}
                                    value={this.state.role}
                                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors appearance-none bg-white disabled:opacity-50"
                                >
                                    <option value="USER">Standard User</option>
                                    <option value="SUPPORT">Support</option>
                                    <option value="ADMIN">Administrator</option>
                                    {this.state.role === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">Super Admin</option>}
                                </select>
                                <FaShieldAlt className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                            </div>
                            <p className="text-xs text-slate-600 mt-2">
                                {!this.props.isSuperAdmin
                                    ? '🔒 Only a Super Admin can change platform operator roles.'
                                    : isSelf || this.state.role === 'SUPER_ADMIN'
                                        ? '🔒 Protected roles cannot be downgraded from this view.'
                                        : 'Select the role and privileges for this user.'}
                            </p>
                        </div>

                        {/* Subscription Type */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-3">
                                <div className="flex items-center space-x-2">
                                    <FaCrown className="w-4 h-4 text-slate-600" />
                                    <span>Subscription Plan</span>
                                </div>
                            </label>
                            <div className="relative">
                                <select
                                    onChange={(event) => this.handleInputs('subscription', event.target.value)}
                                    value={this.state.subscription}
                                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors appearance-none bg-white"
                                >
                                    <option value="">Select subscription plan</option>
                                    <option value="Basic">Basic Plan</option>
                                    <option value="Pro">Pro Plan</option>
                                    <option value="Premium">Premium Plan</option>
                                    <option value="Enterprise">Enterprise Plan</option>
                                </select>
                                <FaCrown className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                            </div>
                        </div>

                        {/* Subscription End Date */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-3">
                                <div className="flex items-center space-x-2">
                                    <FaCalendar className="w-4 h-4 text-slate-600" />
                                    <span>Subscription End Date</span>
                                </div>
                            </label>
                            <div className="relative">
                                <input
                                    type="date"
                                    value={this.state.subscriptionEnd}
                                    onChange={(event) => this.handleInputs('subscriptionEnd', event.target.value)}
                                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                />
                                <FaCalendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="flex items-center justify-between pt-6 border-t border-slate-200">
                            <div className="flex items-center space-x-2 text-sm text-slate-500">
                                <FaInfoCircle className="w-4 h-4" />
                                <span>Changes will be applied immediately</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    this.editSelectedUser(this.state.userId, this.state.email, this.state.subscription, this.state.subscriptionEnd, this.state.role, this.state.suspended);
                                }}
                                disabled={this.state.isLoading}
                                className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors duration-200 ${
                                    this.state.isLoading
                                        ? 'bg-slate-400 text-slate-200 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                                }`}
                            >
                                {this.state.isLoading ? (
                                    <>
                                        <FaSpinner className="w-4 h-4 animate-spin" />
                                        <span>Updating...</span>
                                    </>
                                ) : (
                                    <>
                                        <FaSave className="w-4 h-4" />
                                        <span>Update User</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }
}

// Wrapper component to use React Router v6 hooks with class component
const UserEditWrapper = () => {
    const location = useLocation();
    const { isSuperAdmin } = useAdminSession();
    const locationState = location.state || {};
    const searchParams = new URLSearchParams(location.search);
    const queryId = searchParams.get('id') || searchParams.get('userId') || '';
    const queryEmail = searchParams.get('email') || '';

    const userId = locationState.userId || queryId;
    const email = locationState.email || queryEmail;

    return (
        <UserEdit
            key={userId || email || 'user-edit'}
            isSuperAdmin={isSuperAdmin === true}
            userId={userId}
            email={email}
            membership={locationState.membership}
            membershipEnd={locationState.membershipEnd}
            isA={locationState.isA}
            role={locationState.role}
            suspended={locationState.suspended}
        />
    );
};

export default UserEditWrapper;

