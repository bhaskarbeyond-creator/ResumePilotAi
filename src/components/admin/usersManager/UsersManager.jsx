import React, { Component } from 'react';
import { getAllUsers, getUserById, setUserAdminStatus, makeUserAdminByEmail, deleteUserByAdmin, updateUserSubscription, toggleUserSuspension, mergeUserAccounts, bulkMergeDuplicateUsers, getMergedUserBackups, restoreMergedUserAccount } from '../../../firestore/dbOperations';
import fire from '../../../conf/fire';
import { Navigate } from 'react-router-dom';
import { FaUsers, FaSearch, FaCrown, FaUser, FaEnvelope, FaCheck, FaShieldAlt, FaUserPlus, FaSpinner, FaTimes, FaTrashAlt, FaEdit, FaBan, FaCheckCircle, FaLock, FaExclamationTriangle, FaLink, FaHistory, FaUndo, FaLayerGroup } from 'react-icons/fa';

class UsersManager extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showUsers: false,
            loadingUsers: false,
            rows: null,
            isRedirectToUser: false,
            enteredUser: '',
            newAdminEmail: '',
            isAddingAdmin: false,
            statusMessage: null,
            userToDelete: null, // confirmation modal target
            pendingUserAction: null,
            isUserActionRunning: false,
            isDeleting: false,
            mergeTarget: null, // { keepId, deleteId, email } for merge modal
            isMerging: false,
            openActionMenuId: null,
            // Bulk merge & Backup restore state
            showBulkMergeModal: false,
            isBulkMerging: false,
            showBackupsModal: false,
            backupsList: [],
            isLoadingBackups: false,
            restoringBackupId: null,
            /// Selected User data for edit redirect
            selectedId: null,
            selectedEmail: null,
            selectedSubscription: null,
            selectedSubscriptionEnd: null,
            selectedIsA: false,
            selectedSuspended: false,
        };
        this.createData = this.createData.bind(this);
        this.showTable = this.showTable.bind(this);
        this.redirectToUser = this.redirectToUser.bind(this);
        this.findUserById = this.findUserById.bind(this);
        this.handleInput = this.handleInput.bind(this);
        this.handleToggleAdmin = this.handleToggleAdmin.bind(this);
        this.handleAddAdminByEmail = this.handleAddAdminByEmail.bind(this);
        this.handleTogglePlan = this.handleTogglePlan.bind(this);
        this.handleToggleSuspension = this.handleToggleSuspension.bind(this);
        this.handleConfirmDelete = this.handleConfirmDelete.bind(this);
        this.isSelfAccount = this.isSelfAccount.bind(this);
        this.toggleActionMenu = this.toggleActionMenu.bind(this);
    }

    toggleActionMenu(id) {
        this.setState(prevState => ({
            openActionMenuId: prevState.openActionMenuId === id ? null : id
        }));
    }

    exportUsersToCsv() {
        if (!this.state.rows || this.state.rows.length === 0) {
            this.setState({ statusMessage: { type: 'error', text: 'No user data is available for export.' } });
            return;
        }
        const csvCell = value => {
            let text = String(value ?? '').replaceAll('"', '""');
            if (/^[=+\-@]/.test(text)) text = `'${text}`;
            return `"${text}"`;
        };
        let csv = 'User ID,Email,Membership Plan,Is Admin,Suspended\n';
        this.state.rows.forEach(row => {
            csv += [row.id, row.email, row.subscription, row.isA, row.suspended].map(csvCell).join(',') + '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = 'admin-users-report.csv'; anchor.click();
        URL.revokeObjectURL(url);
    }

    isSelfAccount(userId, email) {
        const currentAuthUser = fire.auth().currentUser;
        if (!currentAuthUser) return false;
        return (userId && userId === currentAuthUser.uid) || (email && email.toLowerCase().trim() === currentAuthUser.email?.toLowerCase().trim());
    }

    createData(id, email, subscription, isA, suspended, rawElement) {
        const rawRole = String(rawElement.role || '').toUpperCase();
        const role = rawRole || (isA ? 'ADMIN' : 'USER');
        const emailVerified = Boolean(rawElement.emailVerified);
        const mfaEnabled = Boolean(rawElement.mfaEnabled);
        return { id, email, subscription, isA, role, emailVerified, mfaEnabled, suspended: Boolean(suspended), rawElement };
    }

    // Load users without mutating identities as a side effect.
    async showTable() {
        this.setState({ loadingUsers: true });
        try {
            const value = await getAllUsers();
            const rows = (value || []).map((element) => this.createData(
                element.userId || element.id,
                element.email !== undefined ? element.email : 'Not Provided',
                element.membership !== undefined ? element.membership : 'Basic',
                Boolean(element.isA || ['ADMIN', 'SUPER_ADMIN'].includes(String(element.role || '').toUpperCase())),
                Boolean(element.suspended),
                element
            ));
            // Duplicate accounts require an explicit, provider-aware server operation.
            // Never mutate or delete identities automatically while rendering a table.
            this.setState({ rows, showUsers: true });
        } catch (error) {
            console.error('Error fetching users:', error);
            this.setState({ statusMessage: { type: 'error', text: 'Unable to load users. Retry when the data service is available.' } });
        } finally {
            this.setState({ loadingUsers: false });
        }
    }

    // Redirect to user edit page
    redirectToUser(id, email, subscription, subscriptionEnd, isA, role, suspended) {
        this.setState({
            isRedirectToUser: true,
            selectedId: id,
            selectedEmail: email,
            selectedSubscription: subscription,
            selectedSubscriptionEnd: subscriptionEnd,
            selectedIsA: isA,
            selectedRole: role,
            selectedSuspended: suspended,
        });
    }

    /// Find user by email or ID
    findUserById() {
        if (!this.state.enteredUser || !this.state.enteredUser.trim()) {
            this.showTable();
            return;
        }
        getUserById(this.state.enteredUser.trim()).then((element) => {
            if (element === false || !element) {
                this.setState({
                    statusMessage: { type: 'error', text: `User "${this.state.enteredUser}" not found. Please verify the email address!` }
                });
            } else {
                var Rows = [
                    this.createData(
                        element.userId,
                        element.email !== undefined ? element.email : 'Not Provided',
                        element.membership || 'Basic',
                        Boolean(element.isA || ['ADMIN', 'SUPER_ADMIN'].includes(String(element.role || '').toUpperCase())),
                        Boolean(element.suspended),
                        element
                    )
                ];
                this.setState({ showUsers: true, rows: Rows });
            }
        });
    }

    handleInput(inputName, value) {
        this.setState({ [inputName]: value });
    }

    async handleToggleAdmin(userId, email, currentIsA, confirmed = false) {
        const newIsA = !currentIsA;
        if (!newIsA && this.isSelfAccount(userId, email)) {
            this.setState({ statusMessage: { type: 'error', text: 'You cannot revoke your own Admin status to ensure one admin remains active.' } });
            setTimeout(() => this.setState({ statusMessage: null }), 4000);
            return;
        }
        if (!confirmed) {
            this.setState({ pendingUserAction: {
                title: newIsA ? 'Grant administrator access?' : 'Revoke administrator access?',
                message: `${email} will ${newIsA ? 'receive privileged administrative access' : 'lose administrative access'}. The current target state will be verified before applying this change.`,
                confirmLabel: newIsA ? 'Grant access' : 'Revoke access',
                onConfirm: () => this.handleToggleAdmin(userId, email, currentIsA, true),
            } });
            return;
        }
        this.setState({ isUserActionRunning: true });
        try {
            // Import and use setUserRole dynamically if we were setting role, but for toggle it's boolean logic:
            const { setUserRole } = await import('../../../firestore/dbOperations');
            const res = await setUserRole(userId, newIsA ? 'ADMIN' : 'USER', currentIsA ? 'ADMIN' : 'USER');
            if (res.success) {
                this.setState({
                    statusMessage: { type: 'success', text: `Successfully ${newIsA ? 'granted' : 'revoked'} Admin access!` }
                });
                this.showTable();
            } else {
                this.setState({ statusMessage: { type: 'error', text: res.error } });
            }
        } catch (err) {
            this.setState({ statusMessage: { type: 'error', text: err.message } });
        } finally {
            this.setState({ isUserActionRunning: false, pendingUserAction: null });
            setTimeout(() => this.setState({ statusMessage: null }), 4000);
        }
    }

    async handleSetRole(userId, email, currentRole, targetRole, confirmed = false) {
        if (!confirmed) {
            this.setState({ pendingUserAction: {
                title: `Assign ${targetRole} role?`,
                message: `${email} will be assigned the ${targetRole} role. The current target state will be verified before applying this change.`,
                confirmLabel: `Assign ${targetRole}`,
                onConfirm: () => this.handleSetRole(userId, email, currentRole, targetRole, true),
            } });
            return;
        }
        this.setState({ isUserActionRunning: true });
        try {
            const { setUserRole } = await import('../../../firestore/dbOperations');
            const res = await setUserRole(userId, targetRole, currentRole);
            if (res.success) {
                this.setState({
                    statusMessage: { type: 'success', text: `Successfully assigned ${targetRole} role!` }
                });
                this.showTable();
            } else {
                this.setState({ statusMessage: { type: 'error', text: res.error } });
            }
        } catch (err) {
            this.setState({ statusMessage: { type: 'error', text: err.message } });
        } finally {
            this.setState({ isUserActionRunning: false, pendingUserAction: null });
            setTimeout(() => this.setState({ statusMessage: null }), 4000);
        }
    }

    async handleToggleSuspension(userId, email, currentSuspended, confirmed = false) {
        const newSuspended = !currentSuspended;
        if (newSuspended && this.isSelfAccount(userId, email)) {
            this.setState({
                statusMessage: { type: 'error', text: 'Self admin account cannot be suspended to ensure at least one active administrator.' }
            });
            setTimeout(() => this.setState({ statusMessage: null }), 4000);
            return;
        }
        if (!confirmed) {
            this.setState({ pendingUserAction: {
                title: newSuspended ? 'Suspend user account?' : 'Reactivate user account?',
                message: `${email} will be ${newSuspended ? 'disabled and signed out of active sessions' : 'allowed to authenticate again'}. The current target state will be verified first.`,
                confirmLabel: newSuspended ? 'Suspend account' : 'Reactivate account',
                onConfirm: () => this.handleToggleSuspension(userId, email, currentSuspended, true),
            } });
            return;
        }
        this.setState({ isUserActionRunning: true });
        try {
            const res = await toggleUserSuspension(userId, newSuspended, currentSuspended);
            if (res.success) {
                this.setState({
                    statusMessage: { type: 'success', text: res.message }
                });
                this.showTable();
            } else {
                this.setState({ statusMessage: { type: 'error', text: res.error } });
            }
        } catch (err) {
            this.setState({ statusMessage: { type: 'error', text: err.message } });
        } finally {
            this.setState({ isUserActionRunning: false, pendingUserAction: null });
            setTimeout(() => this.setState({ statusMessage: null }), 4000);
        }
    }

    async handleTogglePlan(userId, email, currentPlan, confirmed = false) {
        const newPlan = currentPlan === 'Premium' ? 'Basic' : 'Premium';
        if (!confirmed) {
            this.setState({ pendingUserAction: {
                title: `Change membership to ${newPlan}?`,
                message: `${email} will be changed from ${currentPlan} to ${newPlan}. Premium grants default to 12 months and this administrative entitlement change is audited.`,
                confirmLabel: `Change to ${newPlan}`,
                onConfirm: () => this.handleTogglePlan(userId, email, currentPlan, true),
            } });
            return;
        }
        this.setState({ isUserActionRunning: true });
        try {
            const res = await updateUserSubscription(userId, newPlan, currentPlan);
            if (res.success) {
                this.setState({
                    statusMessage: { type: 'success', text: res.message }
                });
                this.showTable();
            } else {
                this.setState({ statusMessage: { type: 'error', text: res.error } });
            }
        } catch (err) {
            this.setState({ statusMessage: { type: 'error', text: err.message } });
        } finally {
            this.setState({ isUserActionRunning: false, pendingUserAction: null });
            setTimeout(() => this.setState({ statusMessage: null }), 4000);
        }
    }

    async handleAddAdminByEmail(e, confirmed = false) {
        e?.preventDefault?.();
        const email = this.state.newAdminEmail.trim();
        if (!email) return;
        if (!confirmed) {
            this.setState({ pendingUserAction: {
                title: 'Grant administrator access?',
                message: `${email} will receive privileged administrative access. The backend requires role-management permission and audits the change.`,
                confirmLabel: 'Grant access',
                onConfirm: () => this.handleAddAdminByEmail(null, true),
            } });
            return;
        }
        this.setState({ isAddingAdmin: true, isUserActionRunning: true, statusMessage: null });
        try {
            const res = await makeUserAdminByEmail(email);
            if (res.success) {
                this.setState({
                    statusMessage: { type: 'success', text: res.message },
                    newAdminEmail: ''
                });
                this.showTable();
            } else {
                this.setState({ statusMessage: { type: 'error', text: res.error } });
            }
        } catch (err) {
            this.setState({ statusMessage: { type: 'error', text: err.message } });
        } finally {
            this.setState({ isAddingAdmin: false, isUserActionRunning: false, pendingUserAction: null });
            setTimeout(() => this.setState({ statusMessage: null }), 5000);
        }
    }

    async handleConfirmDelete() {
        if (!this.state.userToDelete) return;
        if (this.isSelfAccount(this.state.userToDelete.id, this.state.userToDelete.email)) {
            this.setState({
                statusMessage: { type: 'error', text: 'You cannot delete your own active admin account.' },
                userToDelete: null
            });
            setTimeout(() => this.setState({ statusMessage: null }), 4000);
            return;
        }
        this.setState({ isDeleting: true });
        try {
            const res = await deleteUserByAdmin(this.state.userToDelete.id, this.state.userToDelete.email);
            if (res.success) {
                this.setState({
                    statusMessage: { type: 'success', text: res.message || `User ${this.state.userToDelete.email} deleted successfully.` },
                    userToDelete: null
                });
                this.showTable();
            } else {
                this.setState({ statusMessage: { type: 'error', text: res.error }, userToDelete: null });
            }
        } catch (err) {
            this.setState({ statusMessage: { type: 'error', text: err.message }, userToDelete: null });
        } finally {
            this.setState({ isDeleting: false });
            setTimeout(() => this.setState({ statusMessage: null }), 4000);
        }
    }

    // Compute duplicate emails from current rows
    getDuplicateEmails() {
        if (!this.state.rows) return new Set();
        const emailCount = {};
        this.state.rows.forEach(row => {
            if (row.email && row.email !== 'Not Provided') {
                const key = row.email.toLowerCase().trim();
                emailCount[key] = (emailCount[key] || 0) + 1;
            }
        });
        return new Set(Object.keys(emailCount).filter(e => emailCount[e] > 1));
    }

    // Handle merge: keep the account with higher-tier membership, delete the other
    async handleMergeAccounts() {
        if (!this.state.mergeTarget) return;
        const { keepId, deleteId } = this.state.mergeTarget;
        this.setState({ isMerging: true });
        try {
            const res = await mergeUserAccounts(keepId, deleteId);
            if (res.success) {
                this.setState({
                    statusMessage: { type: 'success', text: res.message },
                    mergeTarget: null,
                });
                this.showTable();
            } else {
                this.setState({ statusMessage: { type: 'error', text: res.error }, mergeTarget: null });
            }
        } catch (err) {
            this.setState({ statusMessage: { type: 'error', text: err.message }, mergeTarget: null });
        } finally {
            this.setState({ isMerging: false });
            setTimeout(() => this.setState({ statusMessage: null }), 5000);
        }
    }

    // Fetch merged account backups for restore history
    async loadBackups() {
        this.setState({ isLoadingBackups: true });
        try {
            const backups = await getMergedUserBackups();
            this.setState({ backupsList: backups });
        } catch (e) {
            console.error('Error loading backups:', e);
        } finally {
            this.setState({ isLoadingBackups: false });
        }
    }

    // Execute bulk merge of all duplicate accounts
    async handleExecuteBulkMerge() {
        this.setState({ isBulkMerging: true, statusMessage: null });
        try {
            const res = await bulkMergeDuplicateUsers();
            if (res.success) {
                this.setState({
                    statusMessage: { type: 'success', text: res.message },
                    showBulkMergeModal: false,
                });
                this.showTable();
                this.loadBackups();
            } else {
                this.setState({ statusMessage: { type: 'error', text: res.error }, showBulkMergeModal: false });
            }
        } catch (err) {
            this.setState({ statusMessage: { type: 'error', text: err.message }, showBulkMergeModal: false });
        } finally {
            this.setState({ isBulkMerging: false });
            setTimeout(() => this.setState({ statusMessage: null }), 6000);
        }
    }

    // Restore a merged account from backup
    async handleRestoreAccount(backupId) {
        this.setState({ restoringBackupId: backupId });
        try {
            const res = await restoreMergedUserAccount(backupId);
            if (res.success) {
                this.setState({ statusMessage: { type: 'success', text: res.message } });
                this.showTable();
                this.loadBackups();
            } else {
                this.setState({ statusMessage: { type: 'error', text: res.error } });
            }
        } catch (err) {
            this.setState({ statusMessage: { type: 'error', text: err.message } });
        } finally {
            this.setState({ restoringBackupId: null });
            setTimeout(() => this.setState({ statusMessage: null }), 5000);
        }
    }

    componentDidMount() {
        this.showTable();
        this.loadBackups();
    }

    render() {
        return (
            <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
                {this.state.isRedirectToUser && (
                    <Navigate
                        to="/adm/user/ss"
                        state={{
                            userId: this.state.selectedId,
                            email: this.state.selectedEmail,
                            membership: this.state.selectedSubscription,
                            membershipEnd: this.state.selectedSubscriptionEnd,
                            isA: this.state.selectedIsA,
                            role: this.state.selectedRole,
                            suspended: this.state.selectedSuspended,
                        }}
                        replace
                    />
                )}

                {this.state.pendingUserAction && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" role="presentation" onKeyDown={event => { if (event.key === 'Escape' && !this.state.isUserActionRunning) this.setState({ pendingUserAction: null }); }}>
                        <div role="alertdialog" aria-modal="true" aria-labelledby="user-action-title" aria-describedby="user-action-message" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700"><FaExclamationTriangle aria-hidden="true" /></div>
                            <h2 id="user-action-title" className="text-center text-lg font-bold text-slate-900">{this.state.pendingUserAction.title}</h2>
                            <p id="user-action-message" className="mt-2 text-center text-sm text-slate-600">{this.state.pendingUserAction.message}</p>
                            <div className="mt-6 flex gap-3">
                                <button type="button" autoFocus onClick={() => this.setState({ pendingUserAction: null })} disabled={this.state.isUserActionRunning} className="flex-1 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50">Cancel</button>
                                <button type="button" onClick={this.state.pendingUserAction.onConfirm} disabled={this.state.isUserActionRunning} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                                    {this.state.isUserActionRunning && <FaSpinner className="animate-spin" aria-hidden="true" />}{this.state.pendingUserAction.confirmLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {this.state.userToDelete && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="presentation" onKeyDown={event => { if (event.key === 'Escape' && !this.state.isDeleting) this.setState({ userToDelete: null }); }}>
                        <div role="alertdialog" aria-modal="true" aria-labelledby="delete-user-title" aria-describedby="delete-user-message" className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4 mx-auto">
                                <FaTrashAlt className="w-6 h-6" />
                            </div>
                            <h3 id="delete-user-title" className="text-lg font-bold text-slate-900 text-center mb-2">Delete User Account</h3>
                            <p id="delete-user-message" className="text-sm text-slate-500 text-center mb-6">
                                Are you sure you want to permanently delete account <strong className="text-slate-800">{this.state.userToDelete.email}</strong>? This action cannot be undone.
                            </p>
                            <div className="flex items-center space-x-3">
                                <button
                                    type="button"
                                    autoFocus
                                    onClick={() => this.setState({ userToDelete: null })}
                                    className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={this.handleConfirmDelete}
                                    disabled={this.state.isDeleting}
                                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center space-x-2"
                                >
                                    {this.state.isDeleting ? <FaSpinner className="w-4 h-4 animate-spin" /> : <FaTrashAlt className="w-4 h-4" />}
                                    <span>Delete Account</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Merge Confirmation Modal */}
                {this.state.mergeTarget && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
                            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 mb-4 mx-auto">
                                <FaLink className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 text-center mb-2">Merge Duplicate Accounts</h3>
                            <p className="text-sm text-slate-500 text-center mb-4">
                                Two accounts found for <strong className="text-slate-800">{this.state.mergeTarget.keepEmail}</strong>. The merge will combine membership data and delete the duplicate.
                            </p>
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                                    <div className="text-[10px] font-bold text-emerald-700 uppercase mb-1">✅ Keeping</div>
                                    <div className="text-xs font-mono text-slate-600 mb-1">{this.state.mergeTarget.keepId?.slice(0, 12)}...</div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${this.state.mergeTarget.keepPlan === 'Premium' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                                        {this.state.mergeTarget.keepPlan} {this.state.mergeTarget.keepIsA ? '+ Admin' : ''}
                                    </span>
                                </div>
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                                    <div className="text-[10px] font-bold text-red-700 uppercase mb-1">🗑️ Deleting</div>
                                    <div className="text-xs font-mono text-slate-600 mb-1">{this.state.mergeTarget.deleteId?.slice(0, 12)}...</div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${this.state.mergeTarget.deletePlan === 'Premium' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                                        {this.state.mergeTarget.deletePlan} {this.state.mergeTarget.deleteIsA ? '+ Admin' : ''}
                                    </span>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-400 text-center mb-4">
                                Admin status, premium membership, and expiry dates will be merged into the kept account.
                            </p>
                            <div className="flex items-center space-x-3">
                                <button
                                    type="button"
                                    onClick={() => this.setState({ mergeTarget: null })}
                                    className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => this.handleMergeAccounts()}
                                    disabled={this.state.isMerging}
                                    className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center space-x-2"
                                >
                                    {this.state.isMerging ? <FaSpinner className="w-4 h-4 animate-spin" /> : <FaLink className="w-4 h-4" />}
                                    <span>Merge Accounts</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Bulk Merge Confirmation Modal */}
                {this.state.showBulkMergeModal && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200">
                            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 mb-4 mx-auto">
                                <FaLayerGroup className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 text-center mb-2">Bulk Merge All Duplicates</h3>
                            <p className="text-sm text-slate-500 text-center mb-4">
                                Found <strong className="text-orange-600 font-bold">{this.getDuplicateEmails().size} email address(es)</strong> with duplicate accounts.
                            </p>
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-6 space-y-1">
                                <p className="font-semibold">🛡️ Safe Restore System:</p>
                                <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                                    <li>Primary accounts (Premium/Admin) are automatically preserved.</li>
                                    <li>Complete backup snapshots are saved before deletion.</li>
                                    <li>You can view & restore merged accounts anytime from <strong>Backup History</strong>.</li>
                                </ul>
                            </div>
                            <div className="flex items-center space-x-3">
                                <button
                                    type="button"
                                    onClick={() => this.setState({ showBulkMergeModal: false })}
                                    className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => this.handleExecuteBulkMerge()}
                                    disabled={this.state.isBulkMerging}
                                    className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center space-x-2 shadow-sm"
                                >
                                    {this.state.isBulkMerging ? <FaSpinner className="w-4 h-4 animate-spin" /> : <FaLayerGroup className="w-4 h-4" />}
                                    <span>Start Bulk Merge</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Backup & Restore History Modal */}
                {this.state.showBackupsModal && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col animate-in fade-in zoom-in duration-200">
                            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                                        <FaHistory className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900">Merged Account Backup &amp; Restore History</h3>
                                        <p className="text-xs text-slate-500">Safely restore any user account that was previously merged or deleted</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => this.setState({ showBackupsModal: false })}
                                    className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
                                >
                                    <FaTimes className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="overflow-y-auto flex-1 pr-1">
                                {this.state.isLoadingBackups ? (
                                    <div className="text-center py-12 text-slate-400">
                                        <FaSpinner className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                                        <p className="text-sm">Loading backup snapshots...</p>
                                    </div>
                                ) : this.state.backupsList.length === 0 ? (
                                    <div className="text-center py-12 text-slate-400">
                                        <FaHistory className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                                        <p className="text-sm font-medium text-slate-600">No Merged Backups Found</p>
                                        <p className="text-xs text-slate-400">When duplicate accounts are merged, backup snapshots will appear here for safe restore.</p>
                                    </div>
                                ) : (
                                    <table className="min-w-full divide-y divide-slate-200 text-xs">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-500">Email</th>
                                                <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-500">Original UID</th>
                                                <th scope="col" className="px-3 py-2 text-center font-semibold text-slate-500">Reason</th>
                                                <th scope="col" className="px-3 py-2 text-center font-semibold text-slate-500">Plan</th>
                                                <th scope="col" className="px-3 py-2 text-center font-semibold text-slate-500">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {this.state.backupsList.map((backup) => (
                                                <tr key={backup.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-3 py-3 font-medium text-slate-900">{backup.email || '—'}</td>
                                                    <td className="px-3 py-3 font-mono text-slate-500">{backup.originalUserId ? `${backup.originalUserId.slice(0, 10)}...` : '—'}</td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${backup.status === 'deleted' ? 'bg-rose-100 text-rose-800' : 'bg-orange-100 text-orange-800'}`}>
                                                            {backup.status === 'deleted' ? '🗑️ DELETED' : '⚡ MERGED'}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${backup.membership === 'Premium' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                                                            {backup.membership || 'Basic'}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => this.handleRestoreAccount(backup.id)}
                                                            disabled={this.state.restoringBackupId === backup.id}
                                                            className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-200 transition-colors flex items-center justify-center space-x-1 mx-auto"
                                                            title="Restore this account back to active users list"
                                                        >
                                                            {this.state.restoringBackupId === backup.id ? <FaSpinner className="w-3 h-3 animate-spin" /> : <FaUndo className="w-3 h-3 text-indigo-600" />}
                                                            <span>Restore</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            <div className="pt-4 border-t border-slate-200 mt-4 flex justify-between items-center text-xs text-slate-400">
                                <span>Total Backups: {this.state.backupsList.length}</span>
                                <button
                                    onClick={() => this.setState({ showBackupsModal: false })}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Header Section */}
                <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
                    <div className="flex items-center justify-between space-x-3 mb-4">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                                <FaUsers className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900">Users & Admin Manager</h1>
                                <p className="text-sm text-slate-500">Manage user accounts, roles, subscription plans, suspension, and permissions</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => {
                                    this.loadBackups();
                                    this.setState({ showBackupsModal: true });
                                }}
                                className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center space-x-1.5"
                            >
                                <FaHistory className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Backup History</span>
                                {this.state.backupsList.length > 0 && (
                                    <span className="px-1.5 py-0.2 bg-indigo-600 text-white rounded-full text-[10px] font-bold">
                                        {this.state.backupsList.length}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => this.exportUsersToCsv()}
                                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors">
                                Export CSV Report
                            </button>
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                        <div className="bg-slate-50 rounded-lg p-4">
                            <div className="flex items-center space-x-2">
                                <FaUser className="w-4 h-4 text-slate-600" />
                                <span className="text-sm text-slate-600">Total Users</span>
                            </div>
                            <p className="text-lg font-semibold text-slate-900">{this.state.rows ? this.state.rows.length : '—'}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <div className="flex items-center space-x-2">
                                <FaShieldAlt className="w-4 h-4 text-red-600" />
                                <span className="text-sm text-slate-600">Administrators</span>
                            </div>
                            <p className="text-lg font-semibold text-slate-900">
                                {this.state.rows ? this.state.rows.filter(row => row.isA).length : '—'}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <div className="flex items-center space-x-2">
                                <FaCrown className="w-4 h-4 text-amber-500" />
                                <span className="text-sm text-slate-600">Premium Users</span>
                            </div>
                            <p className="text-lg font-semibold text-slate-900">
                                {this.state.rows ? this.state.rows.filter(row => row.subscription === 'Premium').length : '—'}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <div className="flex items-center space-x-2">
                                <FaBan className="w-4 h-4 text-rose-600" />
                                <span className="text-sm text-slate-600">Suspended Users</span>
                            </div>
                            <p className="text-lg font-semibold text-rose-700">
                                {this.state.rows ? this.state.rows.filter(row => row.suspended).length : '—'}
                            </p>
                        </div>
                        <div className={`rounded-lg p-4 transition-all ${this.getDuplicateEmails().size > 0 ? 'bg-orange-50/80 border border-orange-200' : 'bg-slate-50'}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                    <FaExclamationTriangle className={`w-4 h-4 ${this.getDuplicateEmails().size > 0 ? 'text-orange-500' : 'text-emerald-500'}`} />
                                    <span className="text-sm text-slate-600">Duplicates</span>
                                </div>
                                {this.getDuplicateEmails().size > 0 && (
                                    <button
                                        onClick={() => this.setState({ showBulkMergeModal: true })}
                                        className="px-2 py-0.5 text-[10px] font-bold bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors flex items-center space-x-1 shadow-xs"
                                        title="Bulk merge all duplicate accounts safely"
                                    >
                                        <FaLayerGroup className="w-2.5 h-2.5" />
                                        <span>Bulk Merge</span>
                                    </button>
                                )}
                            </div>
                            <p className={`text-lg font-semibold mt-1 ${this.getDuplicateEmails().size > 0 ? 'text-orange-700' : 'text-slate-900'}`}>
                                {this.getDuplicateEmails().size > 0 ? `${this.getDuplicateEmails().size} email(s)` : 'None'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Status Message */}
                {this.state.statusMessage && (
                    <div role={this.state.statusMessage.type === 'success' ? 'status' : 'alert'} aria-live="polite" className={`p-4 rounded-lg flex items-center justify-between text-sm mb-6 ${
                        this.state.statusMessage.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'
                    }`}>
                        <div className="flex items-center space-x-2">
                            {this.state.statusMessage.type === 'success' ? <FaCheck className="text-emerald-600" /> : <FaTimes className="text-red-600" />}
                            <span>{this.state.statusMessage.text}</span>
                        </div>
                    </div>
                )}

                {/* Grant New Admin Section */}
                <div className="bg-white border border-red-200 rounded-lg p-6 mb-6">
                    <div className="flex items-center space-x-3 mb-4">
                        <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                            <FaUserPlus className="w-4 h-4 text-red-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Grant Admin Privileges</h3>
                            <p className="text-sm text-slate-500">Enter a user's email address to assign them Administrator access</p>
                        </div>
                    </div>

                    <form onSubmit={this.handleAddAdminByEmail} className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 relative">
                            <FaEnvelope className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="email"
                                value={this.state.newAdminEmail}
                                onChange={(e) => this.handleInput('newAdminEmail', e.target.value)}
                                placeholder="Enter user email (e.g. bhaskar.beyond@gmail.com)"
                                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={this.state.isAddingAdmin}
                            className="flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200 shadow-sm"
                        >
                            {this.state.isAddingAdmin ? <FaSpinner className="w-4 h-4 animate-spin" /> : <FaShieldAlt className="w-4 h-4" />}
                            <span>Make Admin</span>
                        </button>
                    </form>
                </div>

                {/* Search Section */}
                <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
                    <div className="flex items-center space-x-3 mb-4">
                        <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center">
                            <FaSearch className="w-4 h-4 text-slate-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Find User</h3>
                            <p className="text-sm text-slate-500">Search for a specific user by email or user ID</p>
                        </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 relative">
                            <FaEnvelope className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="search"
                                aria-label="User email or UID"
                                value={this.state.enteredUser}
                                onChange={(event) => this.handleInput('enteredUser', event.target.value)}
                                placeholder="Enter exact user email or UID"
                                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <button
                            onClick={() => this.findUserById()}
                            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200">
                            <FaSearch className="w-4 h-4" />
                            <span>Search User</span>
                        </button>
                    </div>
                </div>

                {/* Users Table Section */}
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Registered Users</h3>
                            <p className="text-sm text-slate-500">Perform user edits, plan upgrades, account suspension/activation, or account deletion</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => this.showTable()}
                            disabled={this.state.loadingUsers}
                            className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center space-x-1 disabled:opacity-50"
                        >
                            {this.state.loadingUsers ? <FaSpinner className="w-4 h-4 animate-spin" aria-hidden="true" /> : <FaUsers className="w-4 h-4" aria-hidden="true" />}
                            <span>{this.state.loadingUsers ? 'Refreshing…' : 'Refresh Users'}</span>
                        </button>
                    </div>

                    {this.state.loadingUsers && !this.state.showUsers ? (
                        <div className="py-12 text-center text-sm text-slate-500" role="status"><FaSpinner className="mx-auto mb-3 animate-spin" aria-hidden="true" />Loading users…</div>
                    ) : !this.state.showUsers ? (
                        <div className="text-center py-12">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FaUsers className="w-8 h-8 text-slate-400" />
                            </div>
                            <h4 className="text-lg font-medium text-slate-900 mb-2">Load User Data</h4>
                            <p className="text-sm text-slate-500 mb-6">Click the button below to fetch and display all users</p>
                            <button
                                onClick={() => this.showTable()}
                                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200 mx-auto">
                                <FaUsers className="w-4 h-4" />
                                <span>Load All Users</span>
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                                        <th scope="col" className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                        <th scope="col" className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                                        <th scope="col" className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Subscription</th>
                                        <th scope="col" className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {this.state.rows?.length === 0 && <tr><td colSpan="5" className="px-6 py-10 text-center text-sm text-slate-500">No users matched this view.</td></tr>}
                                    {this.state.rows?.map((row, index) => {
                                        const isSelf = this.isSelfAccount(row.id, row.email);
                                        const isDuplicate = row.email && row.email !== 'Not Provided' && this.getDuplicateEmails().has(row.email.toLowerCase().trim());
                                        return (
                                            <tr key={row.id || index} className={`hover:bg-slate-50 transition-colors duration-150 ${row.suspended ? 'bg-rose-50/30' : ''} ${isDuplicate ? 'bg-orange-50/60 border-l-4 border-l-orange-400' : ''}`}>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                                                            <FaUser className="w-4 h-4 text-slate-600" />
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-bold text-slate-900 flex items-center space-x-2 flex-wrap gap-1">
                                                                <span>{row.email}</span>
                                                                {isSelf && (
                                                                    <span className="px-2 py-0.5 text-[10px] bg-blue-100 text-blue-700 font-bold rounded border border-blue-200">
                                                                        (You)
                                                                    </span>
                                                                )}
                                                                {isDuplicate && (
                                                                    <span className="px-2 py-0.5 text-[10px] bg-orange-100 text-orange-700 font-bold rounded border border-orange-300 flex items-center gap-0.5">
                                                                        <FaExclamationTriangle className="w-2.5 h-2.5" /> DUPLICATE
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                                                                <span>ID: {row.id ? (row.id.length > 12 ? row.id.slice(0, 10) + '...' : row.id) : '—'}</span>
                                                                {row.emailVerified && <span className="text-emerald-600 flex items-center gap-0.5" title="Email Verified"><FaCheckCircle className="w-3 h-3"/></span>}
                                                                {row.mfaEnabled && <span className="text-indigo-600 flex items-center gap-0.5" title="MFA Enabled"><FaLock className="w-3 h-3"/></span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                                        row.suspended ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-emerald-100 text-emerald-800'
                                                    }`}>
                                                        {row.suspended ? <FaBan className="w-3 h-3 mr-1 text-rose-600" /> : <FaCheck className="w-3 h-3 mr-1 text-emerald-600" />}
                                                        {row.suspended ? 'Suspended' : 'Active'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                                        row.role === 'SUPER_ADMIN' ? 'bg-indigo-100 text-indigo-800' :
                                                        row.role === 'ADMIN' ? 'bg-red-100 text-red-800' :
                                                        row.role === 'SUPPORT' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-slate-100 text-slate-700'
                                                    }`}>
                                                        {row.role === 'SUPER_ADMIN' ? <FaCrown className="w-3 h-3 mr-1 text-indigo-600" /> :
                                                         row.role === 'ADMIN' ? <FaShieldAlt className="w-3 h-3 mr-1 text-red-600" /> : 
                                                         row.role === 'SUPPORT' ? <FaUser className="w-3 h-3 mr-1 text-blue-600" /> :
                                                         <FaUser className="w-3 h-3 mr-1 text-slate-500" />}
                                                        {row.role === 'SUPER_ADMIN' ? 'Super Admin' :
                                                         row.role === 'ADMIN' ? 'Admin' :
                                                         row.role === 'SUPPORT' ? 'Support' : 'User'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                                        row.subscription === 'Premium'
                                                            ? 'bg-amber-100 text-amber-800'
                                                            : 'bg-blue-100 text-blue-800'
                                                    }`}>
                                                        {row.subscription === 'Premium' && <FaCrown className="w-3 h-3 mr-1" />}
                                                        {row.subscription}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    <div className="relative inline-block text-left">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); this.toggleActionMenu(row.id); }}
                                                            className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none"
                                                        >
                                                            <FaLayerGroup className="w-4 h-4" />
                                                        </button>
                                                        
                                                        {this.state.openActionMenuId === row.id && (
                                                            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 overflow-hidden" style={{ top: '100%' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { this.toggleActionMenu(null); this.redirectToUser(row.id, row.email, row.subscription, row.rawElement?.membershipsEnds, row.isA, row.role, row.suspended); }}
                                                                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
                                                                >
                                                                    <FaEdit className="w-3.5 h-3.5 text-slate-400" />
                                                                    <span>Edit User</span>
                                                                </button>
                                                                
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { this.toggleActionMenu(null); this.handleTogglePlan(row.id, row.email, row.subscription); }}
                                                                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
                                                                >
                                                                    <FaCrown className={`w-3.5 h-3.5 ${row.subscription === 'Premium' ? 'text-slate-400' : 'text-amber-500'}`} />
                                                                    <span>{row.subscription === 'Premium' ? 'Downgrade to Basic' : 'Upgrade to Premium'}</span>
                                                                </button>
                                                                
                                                                {row.role !== 'SUPER_ADMIN' && (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => { this.toggleActionMenu(null); this.handleSetRole(row.id, row.email, row.role, 'ADMIN'); }}
                                                                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
                                                                        >
                                                                            <FaShieldAlt className={`w-3.5 h-3.5 ${row.role === 'ADMIN' ? 'text-red-500' : 'text-slate-400'}`} />
                                                                            <span className={row.role === 'ADMIN' ? 'font-bold' : ''}>Assign Admin Role</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => { this.toggleActionMenu(null); this.handleSetRole(row.id, row.email, row.role, 'SUPPORT'); }}
                                                                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
                                                                        >
                                                                            <FaUser className={`w-3.5 h-3.5 ${row.role === 'SUPPORT' ? 'text-blue-500' : 'text-slate-400'}`} />
                                                                            <span className={row.role === 'SUPPORT' ? 'font-bold' : ''}>Assign Support Role</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => { this.toggleActionMenu(null); this.handleSetRole(row.id, row.email, row.role, 'USER'); }}
                                                                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
                                                                        >
                                                                            <FaUser className={`w-3.5 h-3.5 ${row.role === 'USER' ? 'text-slate-900' : 'text-slate-400'}`} />
                                                                            <span className={row.role === 'USER' ? 'font-bold' : ''}>Revert to User</span>
                                                                        </button>
                                                                    </>
                                                                )}

                                                                {isDuplicate && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            this.toggleActionMenu(null);
                                                                            const duplicates = this.state.rows.filter(r => r.email && r.email.toLowerCase().trim() === row.email.toLowerCase().trim());
                                                                            if (duplicates.length === 2) {
                                                                                const tierRank = (r) => (r.subscription === 'Premium' ? 10 : 0) + (r.isA ? 5 : 0);
                                                                                const sorted = [...duplicates].sort((a, b) => tierRank(b) - tierRank(a));
                                                                                this.setState({
                                                                                    mergeTarget: {
                                                                                        keepId: sorted[0].id, deleteId: sorted[1].id, keepEmail: sorted[0].email,
                                                                                        keepPlan: sorted[0].subscription, keepIsA: sorted[0].isA,
                                                                                        deletePlan: sorted[1].subscription, deleteIsA: sorted[1].isA,
                                                                                    }
                                                                                });
                                                                            }
                                                                        }}
                                                                        className="w-full text-left px-4 py-2 text-sm text-orange-700 hover:bg-orange-50 flex items-center space-x-2"
                                                                    >
                                                                        <FaLink className="w-3.5 h-3.5" />
                                                                        <span>Merge Duplicates</span>
                                                                    </button>
                                                                )}

                                                                <div className="border-t border-slate-100 my-1"></div>

                                                                {isSelf ? (
                                                                    <>
                                                                        <div className="px-4 py-2 text-sm text-slate-400 flex items-center space-x-2 cursor-not-allowed">
                                                                            <FaLock className="w-3.5 h-3.5" /> <span>Suspend (Self)</span>
                                                                        </div>
                                                                        <div className="px-4 py-2 text-sm text-slate-400 flex items-center space-x-2 cursor-not-allowed">
                                                                            <FaLock className="w-3.5 h-3.5" /> <span>Revoke Admin (Self)</span>
                                                                        </div>
                                                                        <div className="px-4 py-2 text-sm text-slate-400 flex items-center space-x-2 cursor-not-allowed">
                                                                            <FaLock className="w-3.5 h-3.5" /> <span>Delete (Self)</span>
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => { this.toggleActionMenu(null); this.handleToggleAdmin(row.id, row.email, row.isA); }}
                                                                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
                                                                        >
                                                                            <FaShieldAlt className={`w-3.5 h-3.5 ${row.isA ? 'text-red-500' : 'text-slate-400'}`} />
                                                                            <span>{row.isA ? 'Revoke Admin' : 'Make Admin'}</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => { this.toggleActionMenu(null); this.handleToggleSuspension(row.id, row.email, row.suspended); }}
                                                                            className={`w-full text-left px-4 py-2 text-sm flex items-center space-x-2 ${row.suspended ? 'text-emerald-700 hover:bg-emerald-50' : 'text-orange-700 hover:bg-orange-50'}`}
                                                                        >
                                                                            {row.suspended ? <FaCheckCircle className="w-3.5 h-3.5" /> : <FaBan className="w-3.5 h-3.5" />}
                                                                            <span>{row.suspended ? 'Activate User' : 'Suspend User'}</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => { this.toggleActionMenu(null); this.setState({ userToDelete: row }); }}
                                                                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                                                                        >
                                                                            <FaTrashAlt className="w-3.5 h-3.5" />
                                                                            <span>Delete User</span>
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

export default UsersManager;
