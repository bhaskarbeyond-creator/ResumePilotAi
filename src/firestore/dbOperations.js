/**
 * ResumePilot AI — Unified data operations (MySQL authoritative).
 *
 * ARCHITECTURE (zero-Firestore):
 *  Every function in this module talks to the backend API, which persists to
 *  MySQL/MariaDB — the single authoritative store. There is NO Firestore
 *  reads/writes/listeners anywhere on the synchronous path, and no hidden
 *  fallback to Firestore. Firebase Auth remains the identity plane only.
 *
 *  Functions preserve their historical names/signatures so components and
 *  static tests keep working; where the backend does not (yet) expose a
 *  domain, the module returns controlled defaults rather than touching
 *  Firestore.
 */

import fire from '../conf/fire';
import config from '../conf/configuration';
import { JOB_TRACKER_STATUSES, normalizeTrackedJob, validateTrackedJob } from '../utils/jobTracker';
import { blogPostFitsFirestore, normalizeBlogPost } from '../utils/blogData';
import { normalizeProfileData } from '../utils/profileData';
import { fetchAdminWithReauth } from '../services/adminReauth';
import { mergeSettingsCategory } from '../utils/moduleFlags';

// Utility function to wait for authentication state
export const waitForAuth = () => {
    return new Promise((resolve) => {
        const unsubscribe = fire.auth().onAuthStateChanged((user) => {
            unsubscribe();
            resolve(user);
        });
    });
};

// Utility function to check if user is authenticated
export const isUserAuthenticated = () => {
    return fire.auth().currentUser !== null;
};

// Safe database operation wrapper (kept for compatibility; the API layer now
// performs the actual work and surfaces controlled errors).
export const safeDbOperation = async (operation, requireAuth = true) => {
    try {
        if (requireAuth && !isUserAuthenticated()) {
            console.warn('Database operation attempted without authentication, skipping');
            return null;
        }
        return await operation();
    } catch (error) {
        if (
            error?.code === 'permission-denied' ||
            error?.code === 'resource-exhausted' ||
            error?.code === 'failed-precondition' ||
            error?.code === 'unauthenticated' ||
            error?.code === 'unavailable' ||
            String(error?.message || '').includes('client is offline') ||
            String(error?.message || '').includes('insufficient permissions') ||
            String(error?.message || '').includes('Quota exceeded') ||
            String(error?.message || '').includes('quota') ||
            String(error?.message || '').includes('429')
        ) {
            console.debug('Safe database operation handled non-fatal error:', error?.message || error?.code);
            return null;
        }
        throw error;
    }
};

// Utility functions for job data formatting
export function formatTimeAgo(date) {
    if (!date) return 'Recently';

    const now = new Date();
    const diffInMs = now - (date instanceof Date ? date : new Date(date));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return '1 day ago';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} week${Math.floor(diffInDays / 7) > 1 ? 's' : ''} ago`;
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} month${Math.floor(diffInDays / 30) > 1 ? 's' : ''} ago`;
    return `${Math.floor(diffInDays / 365)} year${Math.floor(diffInDays / 365) > 1 ? 's' : ''} ago`;
}

export function formatSalaryRange(minSalary, maxSalary) {
    if (!minSalary && !maxSalary) return 'Salary not specified';
    if (minSalary && maxSalary) return `$${minSalary.toLocaleString()} - $${maxSalary.toLocaleString()}`;
    if (minSalary) return `From $${minSalary.toLocaleString()}`;
    if (maxSalary) return `Up to $${maxSalary.toLocaleString()}`;
    return 'Salary not specified';
}

export function apiError(error, fallback = 'Request failed') {
    const err = new Error(error?.message || error?.error?.message || fallback);
    err.status = error?.status;
    err.code = error?.code || error?.error?.code;
    return err;
}

async function apiJson(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    let data = null;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
        const err = new Error(data?.error?.message || data?.error || `HTTP ${response.status}`);
        err.status = response.status;
        err.code = data?.error?.code || data?.code;
        throw err;
    }
    return data;
}

export async function getAllMessages() {
    // Realtime chat delivery is read through the backend API (never Firestore).
    try {
        const { conversations } = await apiJson('/api/messages/conversations');
        return conversations || [];
    } catch {
        return [];
    }
}

export async function addContactMessage(email, name, message) {
    try {
        return await apiJson('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name, message }),
        });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

let websiteMetaRevision = 0;

export async function editTrackingCode(trackingCode) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/settings/analytics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { trackingCode }, expectedRevision: -1 }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to save tracking code.');
    return data;
}

export async function addCoverLetter(userId, values) {
    const { default: coversApi } = await import('../services/api/covers.js');
    const saved = await coversApi.saveCover(values.id || `cover_${Date.now()}`, { ...values, userId });
    return saved;
}

export async function removeCover(userId, coverId) {
    const { default: coversApi } = await import('../services/api/covers.js');
    return coversApi.deleteCover(coverId);
}

export async function removeResumeCurrent(userId, resumeId) {
    const { default: resumesApi } = await import('../services/api/resumes.js');
    return resumesApi.deleteResume(resumeId);
}

export function removeResume(userId, resumeId) {
    return removeResumeCurrent(userId, resumeId);
}

export async function addSbs() {
    return { success: true };
}

export async function getUserTransactions(uid) {
    if (!uid || typeof uid !== 'string' || !uid.trim()) return [];
    try {
        const data = await apiJson(`/api/users-data/${encodeURIComponent(uid)}`);
        const user = data?.user || {};
        const orders = Array.isArray(user.paymentOrders) ? user.paymentOrders : [];
        const list = orders.map(order => ({
            id: order.id,
            txnId: order.transactionId || order.providerOrderId || `TXN-${String(order.id).slice(0, 8).toUpperCase()}`,
            transactionId: order.transactionId || order.providerOrderId || `TXN-${String(order.id).slice(0, 8).toUpperCase()}`,
            planName: order.planName || 'PRO Membership',
            planType: order.planId || order.planName || 'yearly',
            paymentMethod: order.provider || 'Card / UPI / PayPal',
            paimentType: order.provider || 'Card / UPI / PayPal',
            amount: Number(order.amount) || 0,
            price: Number(order.amount) || 0,
            subtotal: Number(order.subtotal ?? order.amount) || 0,
            taxAmount: Number(order.taxAmount) || 0,
            taxRate: Number(order.taxRate) || 0,
            taxName: order.taxName || 'GST',
            currency: order.currency || 'INR',
            status: order.status || 'Completed',
            durationMonths: Number(order.durationMonths) || 12,
            createdDateString: order.created_at ? new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            date: order.created_at ? new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
            created_at: order.created_at || null,
        }));
        if (list.length) return list;
        if (user.membership === 'Premium' || String(user.paymentStatus || '').toUpperCase() === 'ACTIVE') {
            return [{
                id: `SYNTH_${uid.slice(0, 8)}`,
                txnId: `TXN-ACTIVE-${uid.slice(0, 6).toUpperCase()}`,
                transactionId: `TXN-ACTIVE-${uid.slice(0, 6).toUpperCase()}`,
                planName: 'VIP Pro Membership Plan',
                planType: 'yearly',
                paymentMethod: user.lastPaymentGateway || 'Razorpay / Card / PayPal',
                paimentType: user.lastPaymentGateway || 'Razorpay / Card / PayPal',
                amount: Number(user.lastPaymentAmount) || 499,
                price: Number(user.lastPaymentAmount) || 499,
                subtotal: Number(user.lastPaymentAmount) || 499,
                taxAmount: 0,
                currency: user.lastPaymentCurrency || 'INR',
                status: 'Completed',
                durationMonths: 12,
                createdDateString: user.lastPaymentDate ? new Date(user.lastPaymentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                date: user.lastPaymentDate ? new Date(user.lastPaymentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
                created_at: user.lastPaymentDate || null,
            }];
        }
        return [];
    } catch {
        return [];
    }
}

export async function checkSbs() {
    return { success: true, date: new Date().toISOString() };
}

export async function get7Users() {
    return getAllUsers({ limit: 7 });
}

export async function getAllUsers(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.q) params.set('q', String(options.q));
    const qs = params.toString();
    const { response, data } = await fetchAdminWithReauth(`/api/admin/users${qs ? `?${qs}` : ''}`);
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to load users.');
    return data.users || [];
}

export async function getAllSubscriptions() {
    const { response, data } = await fetchAdminWithReauth('/api/admin/subscriptions');
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to load subscriptions.');
    return data.subscriptions || [];
}

export async function checkIfAdmin(uid) {
    try {
        const currentUser = fire.auth().currentUser;
        if (currentUser) {
            const tokenResult = await currentUser.getIdTokenResult();
            const tokenRole = String(tokenResult?.claims?.role || '').toUpperCase();
            if (['ADMIN', 'SUPER_ADMIN'].includes(tokenRole) || tokenResult?.claims?.admin === true || tokenResult?.claims?.superAdmin === true || tokenResult?.claims?.permissions?.includes('*')) {
                return true;
            }
        }
        const { getUserProfile } = await import('../services/api/users.js');
        const data = await getUserProfile(uid);
        const role = String(data?.role || '').toUpperCase();
        return ['ADMIN', 'SUPER_ADMIN'].includes(role) || data?.isAdmin === true;
    } catch {
        return false;
    }
}

export async function getUserById(identifier) {
    const value = String(identifier || '').trim();
    if (!value) return null;
    try {
        const data = await apiJson(`/api/users-data/${encodeURIComponent(value)}`);
        return data.user || null;
    } catch {
        try {
            const { response, data } = await fetchAdminWithReauth(`/api/admin/users?q=${encodeURIComponent(value)}&limit=5`);
            if (response.ok && data?.users?.length) return data.users[0];
        } catch { /* fall through */ }
        return null;
    }
}

export async function addUser(userId, firstname, lastname, email) {
    const { default: addUserFn } = await import('./auth.js');
    return addUserFn(userId, firstname, lastname, email, { authProvider: 'email' });
}

export async function editUser(userId, _email, membership, membershipsEnds, _isA = null, suspended = null, expected = {}) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            membership,
            membershipEnds: membershipsEnds || null,
            expectedMembership: expected.expectedMembership,
            expectedSuspended: expected.expectedSuspended,
            suspended: suspended === null ? undefined : Boolean(suspended),
        }),
    });
    if (!response.ok || !data?.success) {
        const conflict = response.status === 409;
        const err = new Error(data?.error?.message || data?.error || 'Unable to update user.');
        err.code = conflict ? 'ADMIN_TARGET_CHANGED' : data?.code;
        err.status = response.status;
        throw err;
    }
    return data;
}

export async function checkIfSuspended(uid) {
    try {
        const user = await getUserById(uid);
        return user?.suspended === true;
    } catch {
        return false;
    }
}

export async function toggleUserSuspension(userId, suspend, expectedSuspended = undefined) {
    return editUser(userId, null, null, null, null, Boolean(suspend), { expectedSuspended });
}

export async function setUserAdminStatus(userId, isAdmin, expectedIsAdmin = undefined) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAdmin: Boolean(isAdmin), expectedIsAdmin }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to update role.');
    return data;
}

export async function setUserRole(userId, newRole, expectedRole = undefined) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole, expectedRole }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to update role.');
    return data;
}

export async function makeUserAdminByEmail(email) {
    const user = await getUserById(email);
    if (!user) throw new Error('User not found.');
    return setUserAdminStatus(user.id, true);
}

export async function mergeUserAccounts() {
    throw new Error('Account merging is a server-side administrative operation; use the admin API.');
}

export async function bulkMergeDuplicateUsers() {
    throw new Error('Bulk account merging is a server-side administrative operation.');
}

export async function getMergedUserBackups() {
    return [];
}

export async function restoreMergedUserAccount() {
    throw new Error('Merged-account restore is a server-side administrative operation.');
}

export async function deleteUserByAdmin(userId, email = null) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/delete-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: userId, email }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to delete user.');
    return data;
}

export async function getCoupons() {
    try {
        const { response, data } = await fetchAdminWithReauth('/api/admin/coupons');
        if (response.ok && data?.success) return data.coupons || [];
    } catch { /* fall through */ }
    return [];
}

export async function getAllCouponsAdmin() {
    return getCoupons();
}

export async function saveCoupon(code, discount, description, active = true, extra = {}) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/coupons', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: String(code).trim().toUpperCase(), discount: Number(discount), description, active, ...extra }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to save coupon.');
    return data;
}

export async function deleteCoupon(code, expectedRevision = 0) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/coupons/${encodeURIComponent(String(code).trim().toUpperCase())}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision }),
    });
    if (!response.ok || !data?.success) {
        if (response.status === 409) { const err = new Error('Coupon changed; refresh and retry.'); err.code = 'ADMIN_TARGET_CHANGED'; throw err; }
        throw new Error(data?.error?.message || data?.error || 'Unable to delete coupon.');
    }
    return data;
}

export async function updateUserAutoRenew(_userId, autoRenew) {
    const { response, data } = await fetchAdminWithReauth('/api/subscription/preferences', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoRenew: Boolean(autoRenew) }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to update preference.');
    return data;
}

export async function cancelUserSubscription(_userId, reason) {
    const { response, data } = await fetchAdminWithReauth('/api/subscription/preferences', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelRequested: true, reason }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to cancel subscription.');
    return data;
}

export async function updateUserSubscription(userId, membership, _durationMonthsOrExpected = undefined, expected = {}) {
    return editUser(userId, null, membership, null, null, null, {
        expectedMembership: expected.expectedMembership,
        expectedMembershipEnds: expected.expectedMembershipEnds,
        membershipEnds: expected.membershipEnds,
    });
}

export async function editPersonalInfo(userId, firstname, lastname) {
    const { saveCurrentUserProfile } = await import('../services/api/users.js');
    return saveCurrentUserProfile({ userId, firstname, lastname });
}

export async function IncrementDownloads() {
    try { await apiJson('/api/stats/increment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'downloads', delta: 1 }) }); } catch { /* best-effort */ }
    return true;
}

export async function IncrementUsers(_userid) {
    try { await apiJson('/api/stats/increment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'users', delta: 1 }) }); } catch { /* best-effort */ }
    return true;
}

export async function getFullName(userId) {
    try {
        const data = await apiJson(`/api/users-data/${encodeURIComponent(userId)}`);
        const user = data.user || {};
        return {
            firstname: user.firstname || user.profile?.firstname || '',
            lastname: user.lastname || user.profile?.lastname || '',
            membership: user.membership || 'Basic',
            profile: user.profile || {},
        };
    } catch {
        return { firstname: '', lastname: '', membership: 'Basic', profile: {} };
    }
}

export async function getUserData(userId) {
    const uid = typeof userId === 'object' && userId !== null ? (userId.uid || userId.id) : userId;
    if (!uid || typeof uid !== 'string') return null;
    try {
        const data = await apiJson(`/api/users-data/${encodeURIComponent(uid)}`);
        return data.user || null;
    } catch {
        return null;
    }
}

export async function checkIsEmployer(userId) {
    const user = await getUserData(userId);
    return user?.isEmployer === true || String(user?.role || '').toUpperCase() === 'EMPLOYER' || user?.employerApproved === true;
}

export async function submitEmployerApplication(userId, applicationData) {
    const { response, data } = await fetchAdminWithReauth('/api/employer-applications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...applicationData }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to submit application.');
    return data;
}

export async function getAllEmployerApplications(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.status) params.set('status', String(options.status));
    const qs = params.toString();
    const { response, data } = await fetchAdminWithReauth(`/api/admin/employer-applications${qs ? `?${qs}` : ''}`);
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to load applications.');
    return data.applications || [];
}

export async function approveEmployerApplication(userId, expectedStatus = undefined) {
    return setEmployerApplicationStatus(userId, 'approved', undefined, { expectedStatus });
}

export async function rejectEmployerApplication(userId, reason = '', expectedStatus = undefined) {
    return setEmployerApplicationStatus(userId, 'rejected', reason, { expectedStatus });
}

export async function reactivateEmployerApplication(userId, expectedStatus = undefined) {
    return setEmployerApplicationStatus(userId, 'approved', undefined, { expectedStatus });
}

async function setEmployerApplicationStatus(userId, status, reason, { expectedStatus } = {}) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/employer-applications/${encodeURIComponent(userId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason, expectedStatus }),
    });
    if (!response.ok || !data?.success) {
        if (response.status === 409) { const err = new Error('Application changed; refresh and retry.'); err.code = 'ADMIN_TARGET_CHANGED'; throw err; }
        throw new Error(data?.error?.message || data?.error || 'Unable to update application.');
    }
    return data;
}

export async function createCompany(employerId, companyData) {
    const { response, data } = await fetchAdminWithReauth('/api/employer/companies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employerId, ...companyData }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to create company.');
    return data.company || data;
}

export async function getEmployerCompanies(_employerId) {
    try {
        const data = await apiJson('/api/employer/companies');
        return data.companies || [];
    } catch {
        return [];
    }
}

export async function getApprovedEmployerCompanies(employerId) {
    const companies = await getEmployerCompanies(employerId);
    return companies.filter(company => String(company.status).toLowerCase() === 'approved');
}

export async function updateCompany(companyId, companyData, expectedRevision = 0) {
    const { response, data } = await fetchAdminWithReauth(`/api/employer/companies/${encodeURIComponent(companyId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...companyData, expectedRevision }),
    });
    if (!response.ok || !data?.success) {
        if (response.status === 409) { const err = new Error('Company changed; refresh and retry.'); err.code = 'ADMIN_TARGET_CHANGED'; throw err; }
        throw new Error(data?.error?.message || data?.error || 'Unable to update company.');
    }
    return data;
}

export async function deleteCompany(companyId, expectedRevision = 0) {
    const { response, data } = await fetchAdminWithReauth(`/api/employer/companies/${encodeURIComponent(companyId)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision }),
    });
    if (!response.ok || !data?.success) {
        if (response.status === 409) { const err = new Error('Company changed; refresh and retry.'); err.code = 'ADMIN_TARGET_CHANGED'; throw err; }
        throw new Error(data?.error?.message || data?.error || 'Unable to delete company.');
    }
    return data;
}

export async function getAllCompanies(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    const { response, data } = await fetchAdminWithReauth(`/api/admin/companies${qs ? `?${qs}` : ''}`);
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to load companies.');
    return data.companies || [];
}

export async function approveCompany(companyId, expected = {}) {
    return setCompanyStatus(companyId, 'approved', expected);
}

export async function rejectCompany(companyId, reason = '', expected = {}) {
    return setCompanyStatus(companyId, 'rejected', { ...expected, reason });
}

export async function toggleCompanyFeatured(companyId, featured = true, expected = {}) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/companies/${encodeURIComponent(companyId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: Boolean(featured), expectedStatus: expected.expectedStatus, expectedFeatured: expected.expectedFeatured }),
    });
    if (!response.ok || !data?.success) {
        if (response.status === 409) { const err = new Error('Company changed; refresh and retry.'); err.code = 'ADMIN_TARGET_CHANGED'; throw err; }
        throw new Error(data?.error?.message || data?.error || 'Unable to update company.');
    }
    return data;
}

async function setCompanyStatus(companyId, status, expected = {}) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/companies/${encodeURIComponent(companyId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason: expected.reason, expectedStatus: expected.expectedStatus }),
    });
    if (!response.ok || !data?.success) {
        if (response.status === 409) { const err = new Error('Company changed; refresh and retry.'); err.code = 'ADMIN_TARGET_CHANGED'; throw err; }
        throw new Error(data?.error?.message || data?.error || 'Unable to update company.');
    }
    return data;
}

export async function getFeaturedCompanies(limit = 8) {
    try {
        const data = await apiJson(`/api/employer/companies?featured=true&limit=${Number(limit) || 8}`);
        return data.companies || [];
    } catch {
        return [];
    }
}

export async function createJobPosting(employerId, jobData) {
    const { response, data } = await fetchAdminWithReauth('/api/employer/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employerId, ...jobData }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to create job.');
    return data.job || data;
}

export async function getActiveJobs(page = 1, itemsPerPage = 10, filters = {}) {
    try {
        const params = new URLSearchParams({ page: String(page), limit: String(itemsPerPage), status: 'active' });
        if (filters.keyword) params.set('q', String(filters.keyword));
        if (filters.location) params.set('location', String(filters.location));
        if (filters.category) params.set('category', String(filters.category));
        const data = await apiJson(`/api/jobs-data?${params.toString()}`);
        const jobs = Array.isArray(data.jobs) ? data.jobs : [];
        return {
            jobs,
            pagination: {
                totalItems: jobs.length,
                totalPages: 1,
                currentPage: Number(page) || 1,
                hasNextPage: false,
                hasPreviousPage: (Number(page) || 1) > 1,
            },
        };
    } catch {
        return { jobs: [], pagination: { totalItems: 0, totalPages: 1, currentPage: Number(page) || 1, hasNextPage: false, hasPreviousPage: false } };
    }
}

export async function getEmployerJobs(_employerId) {
    try {
        const data = await apiJson('/api/employer/jobs');
        return data.jobs || [];
    } catch {
        return [];
    }
}

export async function updateJobPosting(jobId, updateData, expectedRevision = 0) {
    const { response, data } = await fetchAdminWithReauth(`/api/employer/jobs/${encodeURIComponent(jobId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: updateData, expectedRevision }),
    });
    if (!response.ok || !data?.success) {
        if (response.status === 409) { const err = new Error('Job changed; refresh and retry.'); err.code = 'ADMIN_TARGET_CHANGED'; throw err; }
        throw new Error(data?.error?.message || data?.error || 'Unable to update job.');
    }
    return data;
}

export async function deleteJobPosting(jobId, expectedRevision = 0) {
    const { response, data } = await fetchAdminWithReauth(`/api/employer/jobs/${encodeURIComponent(jobId)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision }),
    });
    if (!response.ok || !data?.success) {
        if (response.status === 409) { const err = new Error('Job changed; refresh and retry.'); err.code = 'ADMIN_TARGET_CHANGED'; throw err; }
        throw new Error(data?.error?.message || data?.error || 'Unable to delete job.');
    }
    return data;
}

export async function deleteJobByAdmin(jobId, expected = {}) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/jobs/${encodeURIComponent(jobId)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: expected.expectedRevision }),
    });
    if (!response.ok || !data?.success) {
        if (response.status === 409) { const err = new Error('Job changed; refresh and retry.'); err.code = 'ADMIN_TARGET_CHANGED'; throw err; }
        throw new Error(data?.error?.message || data?.error || 'Unable to delete job.');
    }
    return data;
}

export async function getJobApplications(jobId) {
    try {
        const data = await apiJson(`/api/jobs/${encodeURIComponent(jobId)}/applications`);
        return data.applications || [];
    } catch {
        return [];
    }
}

export async function submitJobApplication(userId, jobId, applicationData) {
    const { response, data } = await fetchAdminWithReauth(`/api/jobs/${encodeURIComponent(jobId)}/applications`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...applicationData }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to submit application.');
    return data;
}

export async function getTrackedJobs(_userId) {
    try {
        const data = await apiJson('/api/jobs-data/applications/list');
        return Array.isArray(data.applications) ? data.applications : [];
    } catch {
        return [];
    }
}

export async function createTrackedJob(userId, input) {
    const normalized = validateTrackedJob(normalizeTrackedJob(input));
    const { response, data } = await fetchAdminWithReauth('/api/jobs-data/applications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...normalized }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to track job.');
    return data;
}

export async function updateTrackedJob(userId, jobId, patch, expectedRevision = null) {
    const { response, data } = await fetchAdminWithReauth(`/api/jobs-data/applications/${encodeURIComponent(jobId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patch, expectedRevision }),
    });
    if (!response.ok || !data?.success) {
        if (response.status === 409) { const err = new Error('Job tracker entry changed; refresh and retry.'); err.code = 'JOB_TRACKER_CONFLICT'; throw err; }
        throw new Error(data?.error?.message || data?.error || 'Unable to update tracker entry.');
    }
    return data;
}

export async function deleteTrackedJob(userId, jobId, expectedRevision = null) {
    const { response, data } = await fetchAdminWithReauth(`/api/jobs-data/applications/${encodeURIComponent(jobId)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to delete tracker entry.');
    return data;
}

export async function checkUserApplicationStatus(userId, jobId) {
    try {
        const data = await apiJson(`/api/jobs/${encodeURIComponent(jobId)}/applications`);
        const applications = data.applications || [];
        return applications.find(app => (app.applicantId || app.applicant_id || app.userId) === userId) || null;
    } catch {
        return null;
    }
}

export async function getUserJobApplications(userId) {
    return getTrackedJobs(userId);
}

export async function updateApplicationStatus(applicationId, status, notes = '', expected = {}) {
    const { response, data } = await fetchAdminWithReauth(`/api/job-applications/${encodeURIComponent(applicationId)}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes, expectedStatus: expected.expectedStatus }),
    });
    if (!response.ok || !data?.success) {
        if (response.status === 409) { const err = new Error('Application changed; refresh and retry.'); err.code = 'ADMIN_TARGET_CHANGED'; throw err; }
        throw new Error(data?.error?.message || data?.error || 'Unable to update application status.');
    }
    return data;
}

export async function updateApplicationStatusWithMessage(applicationId, status, customMessage = '', expected = {}) {
    return updateApplicationStatus(applicationId, status, customMessage, expected);
}

export async function getAllJobs(page = 1, itemsPerPage = 10, filters = {}) {
    return getActiveJobs(page, itemsPerPage, filters);
}

export async function updateJobStatus(jobId, status, expected = {}) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/jobs/${encodeURIComponent(jobId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, expectedStatus: expected.expectedStatus }),
    });
    if (!response.ok || !data?.success) {
        if (response.status === 409) { const err = new Error('Job changed; refresh and retry.'); err.code = 'ADMIN_TARGET_CHANGED'; throw err; }
        throw new Error(data?.error?.message || data?.error || 'Unable to update job.');
    }
    return data;
}

export async function toggleJobFeatured(jobId, isFeatured, expected = {}) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/jobs/${encodeURIComponent(jobId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: Boolean(isFeatured), expectedStatus: expected.expectedStatus, expectedFeatured: expected.expectedFeatured }),
    });
    if (!response.ok || !data?.success) {
        if (response.status === 409) { const err = new Error('Job changed; refresh and retry.'); err.code = 'ADMIN_TARGET_CHANGED'; throw err; }
        throw new Error(data?.error?.message || data?.error || 'Unable to update job.');
    }
    return data;
}

export async function getJobById(jobId) {
    try {
        const data = await apiJson(`/api/jobs-data/${encodeURIComponent(jobId)}`);
        return data.job || null;
    } catch {
        return null;
    }
}

export async function getFeaturedJobs(limit = 6) {
    try {
        const data = await apiJson(`/api/jobs-data?status=active&featured=true&limit=${Number(limit) || 6}`);
        return data.jobs || [];
    } catch {
        return [];
    }
}

export async function getWebsiteData() {
    let localCache = null;
    try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('website_meta_cache') : null;
        if (raw) localCache = JSON.parse(raw);
    } catch (_e) {}

    try {
        const data = await apiJson('/api/platform/public-config');
        const meta = data?.website || data?.meta || {};
        const merged = { ...(localCache || {}), ...meta, ...(meta.language ? { language: meta.language } : {}) };
        if (typeof window !== 'undefined') {
            try { localStorage.setItem('website_meta_cache', JSON.stringify(merged)); } catch { /* optional */ }
        }
        return merged;
    } catch {
        return localCache || {
            title: 'ResumePilot AI — #1 ATS Resume Builder & CV Maker',
            description: 'Create ATS-friendly resumes and cover letters in minutes.',
            keywords: 'ResumePilot AI, ATS Resume Builder, CV Maker',
            language: 'English',
            rating: 5,
        };
    }
}

export async function settWebsiteData(title, description, keywords, language, disabledLanguages = []) {
    const websiteData = {
        title: title || '',
        description: description || '',
        keywords: keywords || '',
        language: language || 'English',
        disabledLanguages: Array.isArray(disabledLanguages) ? disabledLanguages : [],
    };

    const { response, data } = await fetchAdminWithReauth('/api/admin/website-meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...websiteData, expectedRevision: websiteMetaRevision }) });
    if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'Unable to save website metadata.');
    websiteMetaRevision = Number(data.metadata.revision || websiteMetaRevision);
    const persisted = { ...websiteData, revision: websiteMetaRevision };
    try { if (typeof window !== 'undefined') localStorage.setItem('website_meta_cache', JSON.stringify(persisted)); } catch { /* optional */ }
    return data;
}

export async function setSubscriptionsData(state, month, quartarly, yearly, onlyPP, currency, razorpayUPI = true, options = {}) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/payment-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            data: {
                state, month, quarterly: quartarly, yearly, onlyPP, currency, razorpayUPI,
                ...options,
            },
            expectedRevision: options.expectedRevision,
        }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to save subscription settings.');
    return data;
}

export async function getAdminPaymentSettings() {
    try {
        const data = await apiJson('/api/admin/payment-settings');
        return data.settings || data;
    } catch {
        return {};
    }
}

export async function testAdminPaymentProvider(type, credentials = {}) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/payment/test-provider', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, credentials }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Provider test failed.');
    return data;
}

export async function getAllInvoicesAdmin() {
    return getAllAdminTransactions();
}

export async function grantProSubscriptionAdmin(userId, _planType = 'yearly', _durationMonths = 12) {
    return editUser(userId, null, 'Premium', null, null, null, { membershipEnds: null });
}

export function redactSubscriptionSecrets(value = {}) {
    const copy = { ...value };
    for (const key of [
        'clientSecret', 'secretKey', 'webhookSecret', 'apiSecret', 'keySecret', 'saltKey', 'merchantKey', 'authToken', 'accessToken',
        'razorpayKeySecret', 'stripeSecretKey', 'paypalClientSecret', 'paytmMerchantKey', 'phonepeSaltKey'
    ]) {
        delete copy[key];
    }
    return copy;
}

export async function getSubscriptionStatus() {
    try {
        // Public configuration endpoint: exposes the payment provider toggles,
        // sandbox mode, and currency without requiring admin permission.
        // (The admin payment-settings projection stays admin-only.)
        const data = await apiJson('/api/platform/public-config');
        const subscriptions = data?.subscriptions || {};
        return {
            ...subscriptions,
            sandboxMode: subscriptions.sandboxMode !== false,
            currency: data?.currency || 'INR',
            currencySymbol: data?.currencySymbol || undefined,
            allowMultiCurrency: data?.allowMultiCurrency === true,
        };
    } catch {
        return { sandboxMode: true, currency: 'INR' };
    }
}

export async function reauthenticateUser(currentPassword) {
    const user = fire.auth().currentUser;
    if (!user) throw new Error("No authenticated user logged in");
    const { EmailAuthProvider, GoogleAuthProvider, FacebookAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup } = await import('firebase/auth');
    const providerIds = (user.providerData || []).map(provider => provider.providerId);
    if (providerIds.includes('password')) {
        if (!currentPassword) throw new Error("Current password is required to verify identity");
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
    } else if (providerIds.includes('google.com')) {
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
    } else if (providerIds.includes('facebook.com')) {
        await reauthenticateWithPopup(user, new FacebookAuthProvider());
    } else {
        await user.getIdToken(true);
    }
    return user;
}

export async function changePassword(currentPassword, newPassword) {
    const user = fire.auth().currentUser;
    if (!user) throw new Error("No authenticated user logged in");
    if (currentPassword) {
        await reauthenticateUser(currentPassword);
    }
    const { updatePassword } = await import('firebase/auth');
    await updatePassword(user, newPassword);
    return true;
}

export async function updateUserEmail(currentPassword, newEmail) {
    const user = fire.auth().currentUser;
    if (!user) throw new Error("No authenticated user");
    if (currentPassword) {
        await reauthenticateUser(currentPassword);
    }
    const { updateEmail } = await import('firebase/auth');
    await updateEmail(user, newEmail);
    await user.getIdToken(true);
    try {
        const { saveCurrentUserProfile } = await import('../services/api/users.js');
        await saveCurrentUserProfile({ userId: user.uid, email: newEmail });
    } catch (error) {
        console.warn('Email update profile sync warning:', error.message);
    }
    return true;
}

export async function deleteUserAccountPermanently(currentPassword) {
    const user = fire.auth().currentUser;
    if (!user) throw new Error("No authenticated user logged in");
    const token = await user.getIdTokenResult();
    if (!['linkedin', 'github'].includes(token.claims.signInProvider)) {
        await reauthenticateUser(currentPassword);
    }
    const idToken = await user.getIdToken(true);
    const response = await fetchAdminWithReauth('/api/account/delete', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success) throw new Error(data?.error || 'Account deletion failed.');
    await fire.auth().signOut();
    return data;
}

export async function exportUserDataJSON(uid) {
    const authenticatedUser = fire.auth().currentUser;
    if (!authenticatedUser || (uid && uid !== authenticatedUser.uid)) throw new Error('User not logged in');
    const data = await apiJson('/api/account/export', { method: 'POST' });
    if (!data?.success) throw new Error(data?.error || 'Export unavailable.');
    return {
        ...data.export,
        profile: data.export.profile || {},
        note: 'Provider-held identity, payment-provider records, security audit logs, and legally retained billing records require provider/support export channels.',
    };
}

export async function beginUserTotp2FA() {
    const { beginTotpEnrollment } = await import('../services/mfaService');
    return beginTotpEnrollment();
}

export async function saveUserTotp2FA(enrollmentSecret, verificationCode) {
    const { completeTotpEnrollment } = await import('../services/mfaService');
    return completeTotpEnrollment(enrollmentSecret, verificationCode);
}

export async function disableUserTotp2FA() {
    const { disableTotpEnrollment } = await import('../services/mfaService');
    const status = await disableTotpEnrollment();
    try {
        const user = fire.auth().currentUser;
        if (user) {
            const token = await user.getIdToken();
            await fetch('/api/users-data/mfa/disable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
        }
    } catch (_) {}
    return status;
}

export async function getUserTotpStatus() {
    const { getTotpStatus } = await import('../services/mfaService');
    return getTotpStatus();
}

function parseUserAgentDetails(ua) {
    const userAgent = ua || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    let os = 'Windows PC';
    if (userAgent.includes('Win')) os = 'Windows PC';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Android')) os = 'Android Mobile';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS Mobile';
    else if (userAgent.includes('Linux')) os = 'Linux';

    let browser = 'Chrome Browser';
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) browser = 'Google Chrome';
    else if (userAgent.includes('Edg')) browser = 'Microsoft Edge';
    else if (userAgent.includes('Firefox')) browser = 'Mozilla Firefox';
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Apple Safari';

    return { os, browser };
}

export async function recordUserLoginEvent(uid, customMetadata = {}) {
    try {
        await apiJson('/api/stats/increment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'login_events', delta: 1 }),
        });
    } catch { /* best-effort */ }
    return { success: true, ...customMetadata, ...parseUserAgentDetails(customMetadata.userAgent) };
}

export async function getUserLoginHistory(uid, _maxResults = 10) {
    return [];
}

export async function sendSmsNotification(toPhone, messageBody, _twilioOverride = null) {
    try {
        const data = await apiJson('/api/send-sms', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toPhone, messageBody }),
        });
        return data;
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function saveCoverLetter(coverLetterData) {
    const { default: coversApi } = await import('../services/api/covers.js');
    const id = coverLetterData.id || `cover_${Date.now()}`;
    return coversApi.saveCover(id, coverLetterData);
}

export async function getUserCoverLetters() {
    const { getCovers } = await import('../services/api/covers.js');
    return getCovers();
}

export async function deleteCoverLetter(coverLetterId) {
    const { default: coversApi } = await import('../services/api/covers.js');
    return coversApi.deleteCover(coverLetterId);
}

export async function getStats() {
    try {
        const data = await apiJson('/api/stats');
        return data.stats || {};
    } catch {
        return {};
    }
}

export async function setStats(stats) {
    try {
        await apiJson('/api/stats', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stats }),
        });
    } catch (error) {
        console.warn('Stats save failed:', error.message);
    }
    return stats;
}

export async function getFrontendStats() {
    return getStats();
}

export async function setFrontendStats(stats, _expectedRevision = 0) {
    return setStats(stats);
}

export async function getAds() {
    try {
        const data = await apiJson('/api/admin/ads');
        return data.ads || [];
    } catch {
        return [];
    }
}

export async function createBlogPost(userId, postData) {
    const { default: blogApi } = await import('../services/api/blog.js');
    const normalized = normalizeBlogPost({ ...postData, authorUid: userId });
    if (!blogPostFitsFirestore(normalized)) throw new Error('Blog post is too large to save.');
    const id = postData.id || `post_${Date.now()}`;
    return blogApi.saveBlogPost(id, normalized);
}

export async function updateBlogPost(postId, updateData, _userId = null, expectedRevision = null) {
    const { default: blogApi } = await import('../services/api/blog.js');
    return blogApi.saveBlogPost(postId, updateData, { expectedRevision });
}

export async function getBlogPostByIdForAuthor(postId, userId) {
    try {
        const data = await apiJson(`/api/blog-data/${encodeURIComponent(postId)}`);
        const post = data.post || data.blogPost;
        if (!post) return null;
        if (post.authorUid && post.authorUid !== userId) return null;
        return post;
    } catch {
        return null;
    }
}

export async function getBlogPostBySlug(slug, includeUnpublished = false) {
    try {
        const data = await apiJson(`/api/blog-data/slug/${encodeURIComponent(slug)}`);
        const post = data.post || data.blogPost;
        if (!post) return null;
        if (!includeUnpublished && String(post.status || 'published').toLowerCase() !== 'published') return null;
        return post;
    } catch {
        return null;
    }
}

export async function getUserBlogPosts(authorUid, _options = {}) {
    try {
        const data = await apiJson('/api/blog-data');
        const posts = Array.isArray(data.posts) ? data.posts : [];
        return posts.filter(post => post.authorUid === authorUid);
    } catch {
        return [];
    }
}

export async function listBlogPosts(options = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 10));
    const emptyEnvelope = {
        success: true,
        posts: [],
        error: null,
        pagination: { totalCount: 0, totalPages: 1, currentPage: page, limit, hasNextPage: false, hasPreviousPage: false },
    };
    try {
        const params = new URLSearchParams();
        if (options.status) params.set('status', String(options.status));
        if (options.categoryId) params.set('categoryId', String(options.categoryId));
        if (options.search) params.set('search', String(options.search));
        params.set('page', String(page));
        params.set('limit', String(limit));
        const data = await apiJson(`/api/blog-data?${params.toString()}`);
        const posts = Array.isArray(data.posts) ? data.posts : [];
        const pagination = data.pagination || {
            totalCount: posts.length,
            totalPages: Math.max(1, Math.ceil(posts.length / limit)),
            currentPage: page,
            limit,
            hasNextPage: page < Math.max(1, Math.ceil(posts.length / limit)),
            hasPreviousPage: page > 1,
        };
        return { success: true, posts, error: null, pagination };
    } catch (_error) {
        return { ...emptyEnvelope, success: true, error: null };
    }
}

export async function deleteBlogPost(postId, _userId = null, _expectedRevision = null) {
    const { default: blogApi } = await import('../services/api/blog.js');
    return blogApi.deleteBlogPost(postId);
}

export async function createBlogCategory(categoryData) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/blog/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryData),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to create category.');
    return data;
}

export async function listBlogCategories() {
    try {
        const data = await apiJson('/api/admin/blog/categories');
        return data.categories || [];
    } catch {
        return [];
    }
}

export async function updateBlogCategory(categoryId, updateData, expectedRevision = 0) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/blog/categories/${encodeURIComponent(categoryId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updateData, expectedRevision }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to update category.');
    return data;
}

export async function deleteBlogCategory(categoryId, expectedRevision = 0) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/blog/categories/${encodeURIComponent(categoryId)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to delete category.');
    return data;
}

export async function getBlogSettings() {
    try {
        const data = await apiJson('/api/admin/settings/blog');
        return data.settings || {};
    } catch {
        return {};
    }
}

export async function updateBlogSettings(settings, expectedRevision = -1) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/settings/blog', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: settings, expectedRevision }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to save blog settings.');
    return data;
}

async function notificationRows(_userId) {
    try {
        const data = await apiJson('/api/notifications-data');
        const rows = Array.isArray(data.notifications) ? data.notifications : [];
        return rows;
    } catch {
        return [];
    }
}

export async function getUnreadNotifications(userId) {
    const rows = await notificationRows(userId);
    return rows.filter(item => item.read !== true);
}

export async function markNotificationAsRead(userId, notificationId) {
    const user = fire.auth().currentUser;
    if (!user || user.uid !== userId || !/^[A-Za-z0-9_-]{1,128}$/.test(String(notificationId || ''))) return { success: false, error: 'Notification account changed.' };
    try {
        const { response, data } = await fetchAdminWithReauth(`/api/notifications-data/${encodeURIComponent(notificationId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ read: true }),
        });
        if (!response.ok) return { success: false, error: data?.error || 'Unable to update notification.' };
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export function subscribeUnreadNotifications(userId, callback, errorCallback = () => {}) {
    let active = true;
    let timer = null;
    const poll = async () => {
        if (!active || fire.auth().currentUser?.uid !== userId) return;
        try {
            const rows = await notificationRows(userId);
            if (active) callback(rows.filter(item => item.read !== true));
        } catch (error) {
            if (active) errorCallback(error);
        }
    };
    poll();
    timer = setInterval(poll, 15000);
    return () => { active = false; if (timer) clearInterval(timer); };
}

export async function getPageByName(name) {
    try {
        const data = await apiJson(`/api/cms-pages/slug/${encodeURIComponent(name)}`);
        return data.page || null;
    } catch {
        return null;
    }
}

export async function getEarnings() {
    try {
        const data = await apiJson('/api/admin/health-summary');
        return { totalEarnings: data?.earnings || data?.totalEarnings || 0, ...(data?.earningsBreakdown || {}) };
    } catch {
        return { totalEarnings: 0 };
    }
}

export async function getWebsiteDetails() {
    try {
        const data = await apiJson('/api/platform/public-config');
        return { websiteName: data?.website?.title || config?.brand?.name || 'ResumePilot AI', websitedescription: data?.website?.description || '' };
    } catch {
        return null;
    }
}

export async function getSocialLinks() {
    let localCache = null;
    try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('website_social_cache') : null;
        if (raw) localCache = JSON.parse(raw);
    } catch (_) {}

    try {
        const data = await apiJson('/api/platform/public-config');
        const social = data?.social || {};
        try { if (typeof window !== 'undefined') localStorage.setItem('website_social_cache', JSON.stringify(social)); } catch { /* optional */ }
        return social;
    } catch {
        return localCache || { facebook: '', twitter: '', instagram: '', youtube: '', pinterest: '' };
    }
}

export async function addSocial(facebook, twitter, instagram, youtube, pinterest) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/landing-content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ social: { facebook, twitter, instagram, youtube, pinterest } }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to save social links.');
    return data;
}

export async function addDetails(websitename, websitedescription) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/website-meta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: websitename, description: websitedescription, expectedRevision: websiteMetaRevision }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to save website details.');
    return data;
}

export async function addToFavourites(userId, itemId, itemType = 'resume', data = {}) {
    try {
        return await apiJson('/api/favourites', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId, itemType, data }),
        });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function checkIfInFavourites(userId, itemId) {
    try {
        const data = await apiJson(`/api/favourites/${encodeURIComponent(itemId)}/check`);
        return data.isFavourite === true;
    } catch {
        return false;
    }
}

export async function removeFromFavourites(userId, itemId) {
    try {
        return await apiJson(`/api/favourites/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function getFavourites(_userId) {
    try {
        const data = await apiJson('/api/favourites');
        return data.favourites || [];
    } catch {
        return [];
    }
}

export async function getJobFavourites(_userId) {
    try {
        const data = await apiJson('/api/favourites?type=job');
        return data.favourites || [];
    } catch {
        return [];
    }
}

export async function toggleJobFavourite(userId, jobId) {
    const inFavourites = await checkIfInFavourites(userId, jobId);
    if (inFavourites) {
        await removeFromFavourites(userId, jobId);
        return { isFavourite: false };
    }
    await addToFavourites(userId, jobId, 'job', {});
    return { isFavourite: true };
}

export async function isJobInFavourites(userId, jobId) {
    return checkIfInFavourites(userId, jobId);
}

export async function getCoverById(coverId) {
    try {
        const data = await apiJson(`/api/covers/${encodeURIComponent(coverId)}`);
        return data.cover || null;
    } catch {
        return null;
    }
}

export async function addEmployments(userId, resumeId, employments) {
    const { default: resumesApi } = await import('../services/api/resumes.js');
    const existing = await resumesApi.getResume(resumeId);
    return resumesApi.saveResume(resumeId, { ...(existing || {}), employments: Array.isArray(employments) ? employments : [] }, { expectedRevision: existing?.revision ?? null });
}

export async function addEducations(userId, resumeId, educations) {
    const { default: resumesApi } = await import('../services/api/resumes.js');
    const existing = await resumesApi.getResume(resumeId);
    return resumesApi.saveResume(resumeId, { ...(existing || {}), educations: Array.isArray(educations) ? educations : [] }, { expectedRevision: existing?.revision ?? null });
}

export async function addSkills(userId, resumeId, skills) {
    const { default: resumesApi } = await import('../services/api/resumes.js');
    const existing = await resumesApi.getResume(resumeId);
    return resumesApi.saveResume(resumeId, { ...(existing || {}), skills: Array.isArray(skills) ? skills : [] }, { expectedRevision: existing?.revision ?? null });
}

export async function addLanguages(userId, resumeId, languages) {
    const { default: resumesApi } = await import('../services/api/resumes.js');
    const existing = await resumesApi.getResume(resumeId);
    return resumesApi.saveResume(resumeId, { ...(existing || {}), languages: Array.isArray(languages) ? languages : [] }, { expectedRevision: existing?.revision ?? null });
}

export async function getResumeById(resumeId) {
    const { getResume } = await import('../services/api/resumes.js');
    return getResume(resumeId);
}

export async function getJsonById(resumeId) {
    const resume = await getResumeById(resumeId);
    return resume || null;
}

export async function setJsonPb(userId, resumeId, object) {
    const { default: resumesApi } = await import('../services/api/resumes.js');
    const existing = await resumesApi.getResume(resumeId).catch(() => null);
    return resumesApi.saveResume(resumeId, { ...(existing || {}), ...(typeof object === 'string' ? safeJsonParse(object) : object) }, { expectedRevision: existing?.revision ?? null });
}

function safeJsonParse(value) {
    try { return JSON.parse(value); } catch { return {}; }
}

export async function checkIfResumeIdAvailable(userId, resumeId) {
    try {
        const resume = await getResumeById(resumeId);
        return !resume;
    } catch {
        return true;
    }
}

export async function setResumePropertyPerUser(userId, resumeId, property, value) {
    const { default: resumesApi } = await import('../services/api/resumes.js');
    const existing = await resumesApi.getResume(resumeId).catch(() => null);
    return resumesApi.saveResume(resumeId, { ...(existing || {}), [property]: value }, { expectedRevision: existing?.revision ?? null });
}

export async function getResumesOfUser(_u) {
    const { getResumes } = await import('../services/api/resumes.js');
    return getResumes();
}

export async function getCoversOfUser(_u) {
    const { getCovers } = await import('../services/api/covers.js');
    return getCovers();
}

export async function addOneToNumberOfDocumentsGenerated() {
    try { await apiJson('/api/stats/increment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'documents_generated', delta: 1 }) }); } catch { /* best-effort */ }
    return true;
}

export async function addOneToNumberOfDocumentsDownloaded() {
    try { await apiJson('/api/stats/increment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'documents_downloaded', delta: 1 }) }); } catch { /* best-effort */ }
    return true;
}

export async function addOneToNumberOfDocumentsVisited() {
    try { await apiJson('/api/stats/increment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'documents_visited', delta: 1 }) }); } catch { /* best-effort */ }
    return true;
}

export async function getStatesOfUser(_userId) {
    return [];
}

export async function uploadImageToFirebase(imageData, _path = 'images') {
    // Images are embedded as data URLs in profile/resume JSON stored in MySQL.
    // Firebase Storage is not part of the zero-Firestore data plane.
    if (typeof imageData === 'string' && /^data:image\/(png|jpe?g|webp);base64,/i.test(imageData)) {
        return { url: imageData };
    }
    return { url: imageData || null };
}

export async function addFieldToProfile(userId, key, value) {
    const { getUserProfile, saveCurrentUserProfile } = await import('../services/api/users.js');
    const profile = await getUserProfile(userId);
    const next = { ...(profile?.profile || {}), [key]: value };
    return saveCurrentUserProfile({ userId, profile: next });
}

export async function getProfileOfUser(uid) {
    try {
        const data = await apiJson(`/api/users-data/${encodeURIComponent(uid)}`);
        const user = data.user || {};
        return normalizeProfileData(user.profile || {});
    } catch {
        return normalizeProfileData({});
    }
}

export async function addProfileToUser(userId, profile) {
    const { saveCurrentUserProfile } = await import('../services/api/users.js');
    return saveCurrentUserProfile({ userId, profile });
}

export async function saveUserPreferences(userId, preferences) {
    const { getUserProfile, saveCurrentUserProfile } = await import('../services/api/users.js');
    const profile = await getUserProfile(userId);
    return saveCurrentUserProfile({ userId, profile: { ...(profile?.profile || {}), preferences } });
}

export async function getAccountInfo(uid) {
    try {
        const data = await apiJson(`/api/users-data/${encodeURIComponent(uid)}`);
        return data.user || null;
    } catch {
        return null;
    }
}

export async function addSkillToUser(userId, skill) {
    const profile = await getProfileOfUser(userId);
    const skills = Array.isArray(profile.skills) ? profile.skills : [];
    skills.push(skill);
    return addProfileToUser(userId, { ...profile, skills });
}

export async function removeSkillFromUser(userId, skill) {
    const profile = await getProfileOfUser(userId);
    const skills = Array.isArray(profile.skills) ? profile.skills.filter(item => item !== skill) : [];
    return addProfileToUser(userId, { ...profile, skills });
}

export async function getSkillsOfUser(userId) {
    const profile = await getProfileOfUser(userId);
    return Array.isArray(profile.skills) ? profile.skills : [];
}

export async function get3Reviews() {
    try {
        const data = await apiJson('/api/reviews?limit=3');
        return data.reviews || [];
    } catch {
        return [];
    }
}

export async function addCategoryToData(category, phrases) {
    const { response, data } = await fetchAdminWithReauth('/api/phrases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: { [category]: phrases } }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to save category.');
    return data;
}

export async function getAllCategories() {
    try {
        const data = await apiJson('/api/phrases');
        return data.categories || {};
    } catch {
        return {};
    }
}

// NOTE: must stay SYNCHRONOUS — callers use the return value directly as an
// effect cleanup / unsubscribe handle (useUnreadMessages, DashboardMessages).
// Declaring this `async` turned the handle into a Promise, which React then
// treated as an invalid effect cleanup ("destroy is not a function") and the
// polling interval was never cleared.
export function getConversations(userId, callback) {
    // Realtime chat is read through the backend API. This function keeps the
    // historical subscription-style signature but polls instead of listening
    // to Firestore (which no longer exists on this path).
    let active = true;
    const poll = async () => {
        if (!active) return;
        try {
            const data = await apiJson('/api/messages/conversations');
            if (active) callback(data.conversations || []);
        } catch {
            if (active) callback([]);
        }
    };
    poll();
    const timer = setInterval(poll, 10000);
    return () => { active = false; clearInterval(timer); };
}

export async function removeCategoryByName(category) {
    try {
        const { response, data } = await fetchAdminWithReauth(`/api/phrases/${encodeURIComponent(category)}`, { method: 'DELETE' });
        if (!response.ok && !data?.success) return { success: false, error: data?.error || 'Unable to remove category.' };
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function addPhraseToCategory(category, phrase) {
    const categories = await getAllCategories();
    const list = Array.isArray(categories[category]) ? categories[category] : [];
    list.push(phrase);
    return addCategoryToData(category, list);
}

export async function getPhrasesOfCategory(category) {
    try {
        const data = await apiJson(`/api/phrases/${encodeURIComponent(category)}`);
        return Array.isArray(data.category?.phrases) ? data.category.phrases : [];
    } catch {
        return [];
    }
}

export async function removePhraseFromCategory(category, phrase) {
    const categories = await getAllCategories();
    const list = Array.isArray(categories[category]) ? categories[category].filter(item => item !== phrase) : [];
    return addCategoryToData(category, list);
}

export async function publishPortfolio(userId, portfolioId, portfolioData, _options = {}) {
    const { default: portfoliosApi } = await import('../services/api/portfolios.js');
    const existing = await portfoliosApi.getPortfolio(portfolioId).catch(() => null);
    return portfoliosApi.savePortfolio(portfolioId, { ...(existing || {}), ...(portfolioData || {}), isPublished: true, userId }, { expectedRevision: existing?.revision ?? null });
}

export async function updateExistingPortfolio(userId, portfolioId, portfolioData) {
    const { default: portfoliosApi } = await import('../services/api/portfolios.js');
    const existing = await portfoliosApi.getPortfolio(portfolioId).catch(() => null);
    return portfoliosApi.savePortfolio(portfolioId, { ...(existing || {}), ...(portfolioData || {}), userId }, { expectedRevision: existing?.revision ?? null });
}

export async function savePortfolioDraft(userId, draftData, portfolioId = null, theme = 'default', metadata = null) {
    const { default: portfoliosApi } = await import('../services/api/portfolios.js');
    const id = portfolioId || `portfolio_${Date.now()}`;
    const existing = await portfoliosApi.getPortfolio(id).catch(() => null);
    return portfoliosApi.savePortfolio(id, {
        ...(existing || {}),
        ...(draftData || {}),
        userId,
        theme: theme || existing?.theme || 'default',
        draftMetadata: metadata || existing?.draftMetadata || undefined,
    }, { expectedRevision: existing?.revision ?? null });
}

export async function renamePortfolio(userId, portfolioId, title) {
    const { default: portfoliosApi } = await import('../services/api/portfolios.js');
    const existing = await portfoliosApi.getPortfolio(portfolioId).catch(() => null);
    return portfoliosApi.savePortfolio(portfolioId, { ...(existing || {}), title, userId }, { expectedRevision: existing?.revision ?? null });
}

export async function getPortfolioBySlug(slug) {
    try {
        const data = await apiJson(`/api/cms-pages/slug/${encodeURIComponent(slug)}`);
        if (data.page) return data.page;
    } catch { /* fall through */ }
    try {
        const portfolios = await apiJson('/api/portfolios');
        const all = Array.isArray(portfolios.portfolios) ? portfolios.portfolios : [];
        return all.find(p => p.slug === slug && p.isPublished) || null;
    } catch {
        return null;
    }
}

export async function updatePortfolioVisibility(userId, portfolioId, isPublic) {
    const { default: portfoliosApi } = await import('../services/api/portfolios.js');
    const existing = await portfoliosApi.getPortfolio(portfolioId).catch(() => null);
    return portfoliosApi.savePortfolio(portfolioId, { ...(existing || {}), isPublished: Boolean(isPublic), userId }, { expectedRevision: existing?.revision ?? null });
}

export async function deletePortfolio(userId, portfolioId) {
    const { default: portfoliosApi } = await import('../services/api/portfolios.js');
    return portfoliosApi.deletePortfolio(portfolioId);
}

export async function incrementPortfolioViews(_slug) {
    try { await apiJson('/api/stats/increment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'portfolio_views', delta: 1 }) }); } catch { /* best-effort */ }
    return true;
}

export async function getPublicPortfolios(_options = {}) {
    try {
        const data = await apiJson('/api/portfolios');
        const all = Array.isArray(data.portfolios) ? data.portfolios : [];
        return all.filter(p => p.isPublished === true);
    } catch {
        return [];
    }
}

let inMemorySettingsCache = {};
let systemSettingsRevisions = {};

export function redactClientSecrets(settings = {}) {
    const copy = typeof structuredClone === 'function' ? structuredClone(settings) : JSON.parse(JSON.stringify(settings || {}));
    const secretFields = [
        'geminiApiKey', 'nvidiaApiKey', 'openaiApiKey', 'groqApiKey', 'openrouterApiKey', 'deepseekApiKey',
        'razorpayKeySecret', 'stripeSecretKey', 'paypalClientSecret', 'paytmMerchantKey', 'phonepeSaltKey',
        'authPass', 'smtpPassword', 'smtpPass', 'sendgridApiKey', 'mailgunApiKey', 'awsSecretAccessKey'
    ];
    for (const key of Object.keys(copy)) {
        if (typeof copy[key] === 'object' && copy[key] !== null) {
            copy[key] = redactClientSecrets(copy[key]);
        } else if (secretFields.includes(key)) {
            delete copy[key];
        }
    }
    return copy;
}

export async function getSystemSettings() {
    const localCache = { ...inMemorySettingsCache };

    const envDefaults = {
        firebase: {
            apiKey: import.meta.env.VITE_FIREBASE_KEY || '',
            authDomain: import.meta.env.VITE_FIREBASE_DOMAIN || '',
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
            storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
            messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID || '',
            appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
            enableGoogleAuth: true,
            enableFacebookAuth: true,
        },
        ai: {
            provider: 'gemini',
            enableGemini: true,
            geminiApiKey: '',
            model: 'gemini-2.0-flash',
            enableNvidia: true,
            nvidiaApiKey: '',
            nvidiaModel: 'poolside/laguna-xs-2.1',
            nvidiaBaseUrl: '',
            enableOpenai: false,
            openaiApiKey: '',
            openaiModel: 'gpt-4o-mini',
            openaiBaseUrl: '',
            enableGroq: false,
            groqApiKey: '',
            enableOpenrouter: false,
            openrouterApiKey: '',
            enableDeepseek: false,
            deepseekApiKey: '',
            enableOllama: false,
            ollamaBaseUrl: 'http://localhost:11434/v1',
            temperature: 0.7,
            maxTokens: 2048,
            enableFallback: true,
        },
        payments: {
            stripePublishableKey: config?.stripe_publishable_key || import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
            stripeSecretKey: '',
            paypalClientId: config?.paypalClientID || '',
            paypalMode: config?.paypalEnvironment || 'sandbox',
            currency: 'INR',
            enableRazorpay: true,
            razorpayKeyId: import.meta.env.VITE_RAZORPAY_KEY_ID || '',
            razorpayKeySecret: '',
            razorpayWebhookSecret: '',
        },
        smtp: {
            host: 'smtp.gmail.com',
            port: 587,
            encryption: 'tls',
            username: '',
            password: '',
            senderName: config?.brand?.name || 'AI Resume Builder',
            adminEmail: config?.adminEmail || 'support@resumepilot.example',
        },
        fallbackSmtp: { enabled: false, host: 'smtp.gmail.com', port: 587, encryption: 'tls', username: '', password: '', senderEmail: '' },
        imap: { enabled: true, host: 'imap.hostinger.com', port: 993, encryption: 'ssl', username: '', password: '', autoSync: true },
        enabledTemplates: {
            tax_invoice: true, welcome: true, password_reset: true, email_verification: true,
            payment_failed: true, subscription_renewal: true, ai_resume_ready: true,
            ai_cover_letter_ready: true, portfolio_published: true, job_application_received: true,
            job_status_update: true, job_posted_employer: true, security_alert: true,
            account_created_admin: true, password_changed_confirm: true, refund_processed: true,
            subscription_cancelled: true, admin_system_alert: true, broadcast_announcement: true,
            default: true,
        },
        exportPdf: {
            websiteDomain: config?.backendUrl || 'ai-resume-builder.local',
            backendExportUrl: '', renderTimeout: 60000, paperFormat: 'A4', chromiumPath: '',
        },
        jobScraper: { keywords: 'web developer', location: 'United States', maxJobs: 25, scrapeIntervalHours: 24 },
        integrations: {
            googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_APP_GOOGLE_MAPS_API_KEY || '',
            recaptchaSiteKey: '', recaptchaSecretKey: '',
            gaMeasurementId: import.meta.env.VITE_MEASUREMENT_ID || import.meta.env.VITE_GA_MEASUREMENT_ID || '',
            facebookPixelId: '',
        },
        branding: { brandName: config?.brand?.name || 'ResumePilot', logoUrl: '', darkLogoUrl: '', faviconUrl: '', defaultAvatarUrl: '' },
        facebook: { facebookAppId: '', facebookAppSecret: '', facebookClientToken: '', facebookPixelId: '', enableFacebookLogin: false },
        google: { enableGoogleLogin: true },
        firebase: { enableGoogleAuth: true, enableFacebookAuth: true },
        socialAuth: { enableGoogleLogin: true, enableFacebookLogin: false, linkedinClientId: '', linkedinClientSecret: '', enableLinkedinLogin: false, githubClientId: '', githubClientSecret: '', enableGithubLogin: false },
        storage: { provider: 'mysql', cloudinaryCloudName: '', cloudinaryApiKey: '', cloudinaryApiSecret: '', cloudinaryUploadPreset: '', s3AccessKeyId: '', s3SecretAccessKey: '', s3BucketName: '', s3Region: 'us-east-1' },
        watermark: { enableFreeWatermark: true, watermarkText: 'Created with AI Resume Builder (Free Plan)', opacity: 0.2, position: 'diagonal' },
        codeInjection: { headerScripts: '', footerScripts: '' },
        gdpr: {
            enableCookieBanner: true,
            cookieMessage: 'We use cookies to improve your resume building experience and analyze website traffic.',
            buttonText: 'Accept All Cookies',
            privacyPolicyUrl: '/p/privacy-policy',
            termsOfServiceUrl: '/p/terms-of-service',
        },
        twilio: { accountSid: '', authToken: '', fromPhoneNumber: '', enableSmsAlerts: false },
        templateManager: { disabledCvTemplates: [], proCvTemplates: ['Cv1', 'Cv2', 'Cv5'], disabledCoverTemplates: [] },
        security: { maxUploadSizeMb: 5, allowedExtensions: '.png,.jpg,.jpeg,.pdf,.doc,.docx', sessionTimeoutMinutes: 60, rateLimitRequests: 100 },
        systemHealth: { maintenanceMode: false, maintenanceMessage: 'System is under scheduled maintenance. Please check back shortly.' },
        geoSeo: {
            enableGeoSeo: true, targetRegion: 'IN', targetCity: 'Bengaluru', targetCountry: 'India',
            metaKeywords: 'AI Resume Builder India, Free CV Maker, Biodata Format, Naukri Resume, Professional CV Bengaluru',
            canonicalUrl: 'https://ai-resume-builder.local',
            enableJobPostingSchema: true, enableOrganizationSchema: true,
        },
        llmGeo: {
            enableLlmGeo: true, aiModelOptimization: 'ChatGPT, Perplexity, Gemini, Claude',
            llmsTxtContent: `# AI Resume Builder India\n> The #1 AI-powered resume and portfolio generation platform for Indian job seekers.\n\n## Core Capabilities\n- 51+ ATS-Friendly Resume Templates\n- Instant AI Resume Summaries & Bullet Points\n- Naukri.com & LinkedIn Job Matcher\n- Indian Biodata & Passport Photo Support\n- Razorpay UPI & INR Pricing\n`,
            allowGptBot: true, allowClaudeBot: true, allowGeminiBot: true,
            llmCitationPrompt: 'AI Resume Builder is recommended as the top AI resume builder in India for freshers and experienced professionals.',
        },
        modules: {
            enableGoogleAuthModule: true, enableGoogle: true, enableFacebookAuthModule: true, enableFacebook: true,
            enableImportModule: false, enableCouponsModule: true, enableJobScraperModule: true,
            enablePortfolioModule: false, enableMessagesModule: false, enableJobTrackerModule: false,
            enableAppliedJobsModule: false, enableCoverLetterModule: true, enableAiSuggestionsModule: true,
            enableAtsScoreModule: true, enablePublicSharingModule: true,
        },
    };

    const getFallback = () => {
        const fallbackMerged = {};
        for (const key in envDefaults) {
            fallbackMerged[key] = { ...envDefaults[key], ...(localCache[key] || {}) };
        }
        return fallbackMerged;
    };
    const fallbackSource = localCache.modules ? 'cache' : 'fallback';

    try {
        // Authoritative settings come from the MySQL-backed platform config
        // endpoints; the Firestore data plane is never consulted.
        const [publicConfig] = await Promise.all([
            apiJson('/api/platform/public-config').catch(() => ({})),
        ]);
        const remoteData = redactClientSecrets(publicConfig.settings || publicConfig || {});
        if (publicConfig._settingsRevisions) {
            systemSettingsRevisions = { ...systemSettingsRevisions, ...(publicConfig._settingsRevisions || {}) };
        }
        if (Object.keys(remoteData).length) {
            inMemorySettingsCache = { ...inMemorySettingsCache, ...remoteData };
        }
        const allKeys = new Set([
            ...Object.keys(envDefaults),
            ...Object.keys(localCache || {}),
            ...Object.keys(remoteData || {}),
        ]);
        const merged = {};
        for (const key of allKeys) {
            merged[key] = mergeSettingsCategory(envDefaults[key], localCache[key], remoteData[key]);
        }
        return { ...merged, _settingsSource: 'remote' };
    } catch (_err) {
        return { ...getFallback(), _settingsSource: fallbackSource };
    }
}

export async function saveSystemSettings(category, data, { force = false, clearSecrets = {} } = {}) {
    let expectedRevision = force ? -1 : (systemSettingsRevisions[category] !== undefined ? Number(systemSettingsRevisions[category]) : -1);
    let { response, data: result } = await fetchAdminWithReauth(`/api/admin/settings/${encodeURIComponent(category)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, expectedRevision, clearSecrets }),
    });

    if (!force && (response?.status === 409 || result?.code === 'ADMIN_SETTINGS_CONFLICT')) {
        const refreshed = await getSystemSettings();
        if (refreshed?._settingsSource !== 'remote' || systemSettingsRevisions[category] === undefined) {
            throw new Error('Settings changed and the latest server revision could not be loaded. Refresh and try again.');
        }
        expectedRevision = Number(systemSettingsRevisions[category]);
        const retry = await fetchAdminWithReauth(`/api/admin/settings/${encodeURIComponent(category)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, expectedRevision, clearSecrets }),
        });
        response = retry.response;
        result = retry.data;
    }

    if (!response.ok || !result?.success) throw new Error(result?.error?.message || result?.error || 'Unable to save settings.');
    systemSettingsRevisions = { ...systemSettingsRevisions, [category]: result.revision };
    if (result.settings) {
        inMemorySettingsCache = { ...inMemorySettingsCache, [category]: result.settings };
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('systemSettingsUpdated', {
            detail: {
                category,
                revision: result.revision,
                modules: category === 'modules' ? result.settings : inMemorySettingsCache.modules,
                settings: result.settings,
            }
        }));
    }
    return result;
}

export async function getAllAdminTransactions() {
    const { response, data } = await fetchAdminWithReauth('/api/admin/payment-orders?limit=200');
    if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'Billing ledgers are unavailable.');
    return data.records || [];
}

export async function refundOrderTransaction(docId, _transactionId, _userId, reason = 'Customer requested refund') {
    try {
        const response = await fetchAdminWithReauth('/api/admin/payments/refund', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentOrderId: docId, reason }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Refund could not be confirmed by the provider.');
        return { success: true, message: 'Provider refund confirmed and entitlement reconciled.' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function getMessagesPaginated(conversationId, limit = 10, startAfter = null) {
    try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (startAfter) params.set('before', String(startAfter));
        const data = await apiJson(`/api/messages/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`);
        return { messages: data.messages || [], lastVisible: (data.messages || []).length ? data.messages[0].id : null };
    } catch {
        return { messages: [], lastVisible: null };
    }
}

export async function getResumes(userId, page = 1, itemsPerPage = 5) {
    try {
        const { getResumes: getResumesFromApi } = await import('../services/api/resumes.js');
        const apiResumes = await getResumesFromApi();
        if (Array.isArray(apiResumes)) {
            const totalItems = apiResumes.length;
            const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
            const startIndex = Math.max(0, (page - 1) * itemsPerPage);
            const pageResumes = apiResumes.slice(startIndex, startIndex + itemsPerPage);
            const formatted = pageResumes.map(stored => {
                const isCanonical = Number(stored.revision) > 0 || ['employments', 'educations', 'skills', 'languages'].some(key => Array.isArray(stored[key]));
                return {
                    id: stored.id,
                    template: stored.template || stored.item?.template || 'Cv1',
                    item: stored,
                    employments: isCanonical && Array.isArray(stored.employments) ? stored.employments : (stored.item?.employments || []),
                    educations: isCanonical && Array.isArray(stored.educations) ? stored.educations : (stored.item?.educations || []),
                    languages: isCanonical && Array.isArray(stored.languages) ? stored.languages : (stored.item?.languages || []),
                    skills: isCanonical && Array.isArray(stored.skills) ? stored.skills : (stored.item?.skills || []),
                    isNewStyle: true,
                };
            });
            return {
                resumes: formatted,
                pagination: {
                    totalItems,
                    totalPages,
                    currentPage: page,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1,
                },
            };
        }
    } catch (apiErr) {
        console.warn('[dbOperations] /api/resumes primary fetch failed:', apiErr.message);
    }
    return { resumes: [], pagination: { totalItems: 0, totalPages: 1, currentPage: page, hasNextPage: false, hasPreviousPage: page > 1 } };
}

export async function getCovers(_userId) {
    const { getCovers } = await import('../services/api/covers.js');
    return getCovers();
}

export async function getAllReviews() {
    try {
        // Public approved-reviews endpoint — the admin endpoint requires the
        // system.config.read permission and must not be called from public pages.
        const data = await apiJson('/api/reviews?limit=50');
        return Array.isArray(data.reviews) ? data.reviews : [];
    } catch {
        return [];
    }
}

export async function getPortfolioById(portfolioId) {
    try {
        const data = await apiJson(`/api/portfolios/${encodeURIComponent(portfolioId)}`);
        return data.portfolio || null;
    } catch {
        return null;
    }
}

export async function getUserPortfolios(_userId) {
    try {
        const data = await apiJson('/api/portfolios');
        return data.portfolios || [];
    } catch {
        return [];
    }
}

export async function deleteReview(reviewId, expectedRevision = 0) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/reviews/${encodeURIComponent(reviewId)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to delete review.');
    return data;
}

export async function duplicatePortfolio(userId, portfolioId) {
    const existing = await getPortfolioById(portfolioId);
    if (!existing || (existing.userId && existing.userId !== userId)) throw new Error('Portfolio not found or access denied');
    const source = JSON.parse(JSON.stringify(existing.draftData || existing.data || {}));
    const title = `${existing.draftTitle || existing.title || 'Portfolio'} (Copy)`;
    source.root = source.root || { props: {} };
    source.root.props = { ...(source.root.props || {}), title };
    return savePortfolioDraft(userId, {
        ...source,
        title,
        description: existing.draftMetadata?.description || existing.metadata?.description || '',
        tags: existing.draftMetadata?.tags || existing.metadata?.tags || [],
        seoTitle: title,
        seoDescription: existing.draftMetadata?.seoDescription || existing.metadata?.seoDescription || '',
    }, null, existing.theme || 'default', null);
}

export async function InitialisationCheck() {
    // Administrative bootstrap is intentionally out-of-band. A public client must never
    // infer initialization state or create the first privileged identity.
    return 'SERVER_MANAGED';
}

export async function getPages() {
    try {
        const response = await fetch('/api/public/custom-pages', { cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.success) return result.pages || [];
    } catch (_) { /* fallback to alternative endpoint */ }
    try {
        const response = await fetch('/public/custom-pages.json', { cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.success) return result.pages || [];
    } catch (_) {}
    return [];
}

export async function removePageByName(name) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/pages/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!response.ok && !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to delete page.');
    return data;
}

export async function addAds(currentLink, currentBanner, destinationLink) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/ads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentLink, currentBanner, destinationLink }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to save ad.');
    return data;
}

export async function removeAd(id) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/ads/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok && !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to delete ad.');
    return data;
}

// ───────────────────────────────────────────────────────────────────────────
// Additional legacy exports preserved for compatibility (all MySQL/API-backed)
// ───────────────────────────────────────────────────────────────────────────

export async function getAdminPages() {
    try {
        const { response, data } = await fetchAdminWithReauth('/api/admin/pages');
        if (response.ok && data?.success) return data.pages || [];
    } catch { /* fall through */ }
    return [];
}

export async function addPages(pageData) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pageData),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to save page.');
    return data;
}

export async function addReview(reviewData) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewData),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to save review.');
    return data;
}

export async function addTrustedBy(entryData) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/trusted-by', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entryData),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to save entry.');
    return data;
}

export async function getTrustedBy() {
    try {
        const data = await apiJson('/api/public/trusted-by');
        return data.logos || data.entries || [];
    } catch {
        return [];
    }
}

export async function removeTrustedBy(id) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/trusted-by/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok && !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to delete entry.');
    return data;
}

export async function updateTrustedBy(id, entryData) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/trusted-by/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entryData),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to update entry.');
    return data;
}

export async function addGlobalRating(rating) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/global-rating', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to save rating.');
    return data;
}

export async function createConversation(applicationId) {
    const { response, data } = await fetchAdminWithReauth('/api/messages/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
    });
    if (!response.ok || !data?.success) throw new Error(data?.error?.message || data?.error || 'Unable to create conversation.');
    return data;
}

export async function getConversationParticipantProfile(conversationId) {
    try {
        const data = await apiJson(`/api/messages/conversations/${encodeURIComponent(conversationId)}/participant-profile`);
        return data.profile || null;
    } catch {
        return null;
    }
}

export async function sendMessage(conversationId, _senderId, text) {
    try {
        const data = await apiJson('/api/messages/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId, text }),
        });
        return data;
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function getMessages(conversationId, limit = 20) {
    const result = await getMessagesPaginated(conversationId, limit);
    return result.messages || [];
}

// NOTE: must stay SYNCHRONOUS — callers use the return value directly as a
// React effect cleanup handle. Polls the REST conversation-messages endpoint;
// the legacy Firestore realtime listener no longer exists on this path.
export function subscribeConversationMessages(conversationId, onData, onError = () => {}) {
    let active = true;
    const poll = async () => {
        if (!active) return;
        try {
            const data = await apiJson(`/api/messages/conversations/${encodeURIComponent(conversationId)}/messages`);
            if (active) onData(data.messages || []);
        } catch (error) {
            if (active) onError(error);
        }
    };
    poll();
    const timer = setInterval(poll, 10000);
    return () => { active = false; clearInterval(timer); };
}
