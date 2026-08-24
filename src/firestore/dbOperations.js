import fire from '../conf/fire';
import axios from 'axios';
import config from '../conf/configuration';
import firebase from 'firebase/compat/app';
import { JOB_TRACKER_STATUSES, normalizeTrackedJob, validateTrackedJob } from '../utils/jobTracker';
import { blogPostFitsFirestore, normalizeBlogPost } from '../utils/blogData';
import { normalizeProfileData, profileFitsFirestore } from '../utils/profileData';
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

// Safe database operation wrapper
export const safeDbOperation = async (operation, requireAuth = true) => {
    try {
        if (requireAuth && !isUserAuthenticated()) {
            console.warn('Database operation attempted without authentication, skipping');
            return null;
        }
        return await operation();
    } catch (error) {
        if (error.code === 'permission-denied' || error.message.includes('insufficient permissions')) {
            console.warn('Permission denied for database operation, user may not be authenticated yet');
            return null;
        }
        throw error;
    }
};

// Utility functions for job data formatting
function formatTimeAgo(date) {
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

function formatSalaryRange(minSalary, maxSalary) {
    if (!minSalary && !maxSalary) return 'Salary not specified';
    if (minSalary && maxSalary) return `$${minSalary.toLocaleString()} - $${maxSalary.toLocaleString()}`;
    if (minSalary) return `From $${minSalary.toLocaleString()}`;
    if (maxSalary) return `Up to $${maxSalary.toLocaleString()}`;
    return 'Salary not specified';
}

export async function getAllMessages() {
    const db = fire.firestore();
    const snapshot = await db.collection('contact').get();
    return snapshot.docs.map(document => {
        const data = document.data() || {};
        return { id: document.id, ...data, createdAt: data.created_at?.toDate?.() || data.createdAt?.toDate?.() || data.created_at || data.createdAt || null };
    });
}

// Contact submissions cross the rate-limited server boundary; clients cannot write the
// moderation collection directly.
export async function addContactMessage(email, name, message) {
    const { response, data: result } = await fetchAdminWithReauth('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, message, website: '' })
    });
    if (!response.ok) throw new Error(result.error || 'Unable to submit contact message.');
    return result;
}

let websiteMetaRevision = 0;

export async function editTrackingCode(trackingCode) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/website-meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackingCode, expectedRevision: websiteMetaRevision }) });
    if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'Unable to save analytics settings.');
    websiteMetaRevision = Number(data.metadata.revision || websiteMetaRevision);
    return data;
}

/// Add Resume
function addResume(userId) {
    localStorage.removeItem('currentResumeItem');
    const db = fire.firestore();
    db.collection('users')
        .doc(userId)
        .collection('resumes')
        .add({})
        .then((docRef) => {
            // Adding one into stats Resumes Created
            var statsRef = db.collection('data').doc('stats');
            statsRef.update({
                numberOfResumesCreated: firebase.firestore.FieldValue.increment(1),
            });
            setTimeout(() => {
                localStorage.setItem('currentResumeId', docRef.id);
            }, 400);
        })
}

/// Add Cover Letter
export async function addCoverLetter(userId, values) {
    // check if we have currentCoverId in local storage
    // if we have we need to update the cover in firestore with that id
    // otherwise we need to create new cover

    const db = fire.firestore();

    if (localStorage.getItem('currentCoverId')) {
        try {
            await db
                .collection('users')
                .doc(userId)
                .collection('covers')
                .doc(localStorage.getItem('currentCoverId'))
                .update({ ...values, created_at: firebase.firestore.Timestamp.now() });
        } catch (error) {
            console.error('Error updating cover letter:', error);
            throw error;
        }
    } else {
        try {
            const docRef = await db
                .collection('users')
                .doc(userId)
                .collection('covers')
                .add({ ...values, created_at: firebase.firestore.Timestamp.now() });

            // Adding one into stats Documents Created
            await addOneToNumberOfDocumentsGenerated(userId);

            // Set the cover ID in localStorage
            setTimeout(() => {
                localStorage.setItem('currentCoverId', docRef.id);
            }, 400);

        } catch (error) {
            console.error('Error creating cover letter:', error);
            throw error;
        }
    }
}

// handle removeCover function
export async function removeCover(userId, coverId) {
    // remove the cover from /users/{userId}/covers/{coverId}
    const db = fire.firestore();
    await db
        .collection('users')
        .doc(userId)
        .collection('covers')
        .doc(coverId)
        .delete()
        .then(async function () {
            // remove the cover from /users/{userId}/favourites/{coverId}
            await db
                .collection('users')
                .doc(userId)
                .collection('favourites')
                .doc(coverId)
                .delete()
                .then(function () {});
        });

    // return true
    return true;
}
// remove resume
export async function removeResumeCurrent(userId, resumeId) {
    // remove the resume from /users/{userId}/resumes/{resumeId}
    const db = fire.firestore();
    await db
        .collection('users')
        .doc(userId)
        .collection('resumes')
        .doc(resumeId)
        .delete()
        .then(async function () {
            // remove the resume from /users/{userId}/favourites/{resumeId}
            await db
                .collection('users')
                .doc(userId)
                .collection('favourites')
                .doc(resumeId)
                .delete()
                .then(function () {});
        });

    // return true
    return true;
}

export function removeResume(userId, resumeId) {
    const db = fire.firestore();
    // Decrement 1 from resumes
    var statsRef = db.collection('data').doc('stats');
    statsRef.update({
        numberOfResumesCreated: firebase.firestore.FieldValue.increment(-1),
    });
    db.collection('users')
        .doc(userId)
        .collection('resumes')
        .doc(resumeId)
        .delete()
        .then(function () {})
        .catch(function (error) {
            console.error('Error removing document: ', error);
        });
}

// Add sbs
/**
 * Legacy checkout completion hook. Entitlements are exclusively granted by a
 * cryptographically verified server webhook; the browser must never write
 * membership, transactions, subscriptions, or earnings records directly.
 */
export async function addSbs() {
    return {
        accepted: true,
        status: 'PENDING_SERVER_CONFIRMATION',
        message: 'Payment submitted. Your subscription will activate after secure server confirmation.'
    };
}

// Fetch user payment transactions for Dashboard Billing History
export async function getUserTransactions(uid) {
    if (!uid) return [];
    if (!uid || typeof uid !== 'string' || !uid.trim()) {
        return [];
    }

    const list = [];
    const db = fire.firestore();

    // 1. Try fetching from user's private transactions subcollection
    try {
        const subSnap = await db.collection('users').doc(uid).collection('transactions').get();
        if (!subSnap.empty) {
            subSnap.docs.forEach(doc => {
                const data = doc.data();
                const txnId = data.transactionId || data.txnId || `TXN-${doc.id.substring(0, 8).toUpperCase()}`;
                const planType = data.planType || data.planName || 'AI Resume Builder PRO Subscription';
                const paimentType = data.paimentType || data.paymentMethod || 'Credit Card / UPI / PayPal';
                const price = data.price !== undefined ? data.price : (data.amount !== undefined ? data.amount : 499);
                const dateStr = data.createdDateString || (data.created_at?.toDate ? data.created_at.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));

                list.push({
                    id: doc.id,
                    txnId: txnId,
                    transactionId: txnId,
                    planName: planType,
                    planType: planType,
                    paymentMethod: paimentType,
                    paimentType: paimentType,
                    amount: price,
                    price: price,
                    subtotal: data.subtotal,
                    taxAmount: data.taxAmount,
                    taxRate: data.taxRate,
                    taxName: data.taxName,
                    companyTaxId: data.companyTaxId,
                    customerTaxId: data.customerTaxId,
                    currency: data.currency || 'INR',
                    status: data.status || 'Completed',
                    durationMonths: data.durationMonths || 12,
                    createdDateString: dateStr,
                    date: dateStr,
                    created_at: data.created_at || null
                });
            });
        }
    } catch (e) {
        console.warn('User subcollection transactions fetch error:', e);
    }

    // 2. Try fetching from root transactions collection if list is empty
    if (list.length === 0) {
        try {
            const snapshot = await db.collection('transactions').where('userId', '==', uid).get();
            if (!snapshot.empty) {
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const txnId = data.transactionId || data.txnId || `TXN-${doc.id.substring(0, 8).toUpperCase()}`;
                    const planType = data.planType || data.planName || 'AI Resume Builder PRO Subscription';
                    const paimentType = data.paimentType || data.paymentMethod || 'Credit Card / UPI / PayPal';
                    const price = data.price !== undefined ? data.price : (data.amount !== undefined ? data.amount : 499);
                    const dateStr = data.createdDateString || (data.created_at?.toDate ? data.created_at.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));

                    list.push({
                        id: doc.id,
                        txnId: txnId,
                        transactionId: txnId,
                        planName: planType,
                        planType: planType,
                        paymentMethod: paimentType,
                        paimentType: paimentType,
                        amount: price,
                        price: price,
                        subtotal: data.subtotal,
                        taxAmount: data.taxAmount,
                        taxRate: data.taxRate,
                        taxName: data.taxName,
                        companyTaxId: data.companyTaxId,
                        customerTaxId: data.customerTaxId,
                        currency: data.currency || 'INR',
                        status: data.status || 'Completed',
                        durationMonths: data.durationMonths || 12,
                        createdDateString: dateStr,
                        date: dateStr,
                        created_at: data.created_at || null
                    });
                });
            }
        } catch (e) {
            console.warn('Root transactions query error:', e);
        }
    }

    // 3. Fallback to subscriptions collection if list is still empty
    if (list.length === 0) {
        try {
            const subSnapshot = await db.collection('subscriptions').where('userId', '==', uid).get();
            if (!subSnapshot.empty) {
                subSnapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const txnId = `TXN-${doc.id.substring(0, 8).toUpperCase()}`;
                    const planType = data.type || 'PRO Membership';
                    const paimentType = data.paimentType || 'Card / PayPal / UPI';
                    const dateStr = data.created_at ? new Date(data.created_at.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                    list.push({
                        id: doc.id,
                        txnId: txnId,
                        transactionId: txnId,
                        planName: planType,
                        planType: planType,
                        paymentMethod: paimentType,
                        paimentType: paimentType,
                        amount: 499,
                        price: 499,
                        subtotal: 499,
                        taxAmount: 0,
                        currency: 'INR',
                        status: 'Completed',
                        durationMonths: 12,
                        createdDateString: dateStr,
                        date: dateStr,
                        created_at: data.created_at || null
                    });
                });
            }
        } catch (e) {
            console.warn('Subscriptions query error:', e);
        }
    }

    // 4. Ultimate Fallback: Synthesize active subscription transaction for Premium / PRO users
    if (list.length === 0) {
        try {
            const userDoc = await db.collection('users').doc(uid).get();
            if (userDoc.exists) {
                const uData = userDoc.data();
                const isPremium = uData.membership === 'Premium' || (uData.membership && uData.membership.toLowerCase().includes('premium')) || uData.paymentStatus === 'ACTIVE';
                if (isPremium) {
                    const dateStr = uData.lastPaymentDate?.toDate ? uData.lastPaymentDate.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    list.push({
                        id: `SYNTH_${uid.substring(0, 8)}`,
                        txnId: `TXN-ACTIVE-${uid.substring(0, 6).toUpperCase()}`,
                        transactionId: `TXN-ACTIVE-${uid.substring(0, 6).toUpperCase()}`,
                        planName: 'VIP Pro Membership Plan',
                        planType: 'yearly',
                        paymentMethod: uData.lastPaymentGateway || 'Razorpay / Card / PayPal',
                        paimentType: uData.lastPaymentGateway || 'Razorpay / Card / PayPal',
                        amount: uData.lastPaymentAmount || 499,
                        price: uData.lastPaymentAmount || 499,
                        subtotal: uData.lastPaymentAmount || 499,
                        taxAmount: 0,
                        currency: uData.lastPaymentCurrency || 'INR',
                        status: 'Completed',
                        durationMonths: 12,
                        createdDateString: dateStr,
                        date: dateStr,
                        created_at: uData.lastPaymentDate || null
                    });
                }
            }
        } catch (e) {
            console.warn('User doc synthesis error:', e);
        }
    }

    list.sort((a, b) => {
        const tA = a.created_at?.toDate ? a.created_at.toDate().getTime() : 0;
        const tB = b.created_at?.toDate ? b.created_at.toDate().getTime() : 0;
        return tB - tA;
    });

    return list;
}
// Check Sbs Date
export async function checkSbs() {
    const res = await axios.post('/api/check', {});
    return res.data.status;
}

// Get 7 Users
export async function get7Users() {
    const db = fire.firestore();
    const snapshot = await db.collection('users').limit(6).get();
    if (!snapshot.empty) {
        var users = [];
        snapshot.forEach((doc) => users.push(doc.data()));
        return users;
    } else {
        return null;
    }
}

// Get All Users through the authoritative Admin API. Firebase Auth is joined
// with the product profile on the server so role, disabled, verification, and
// MFA state cannot be stale or client-forged.
export async function getAllUsers(options = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options || {})) {
        if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    const { response, data } = await fetchAdminWithReauth(`/api/admin/users${params.toString() ? `?${params}` : ''}`);
    if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'Unable to load the authoritative user directory.');
    return data.users || [];
}

// Get all subscriptions
export async function getAllSubscriptions() {
    const db = fire.firestore();
    const snapshot = await db.collection('subscriptions').orderBy('created_at', 'desc').limit(7).get();
    if (!snapshot.empty) {
        var subscriptions = [];
        snapshot.forEach((doc) => subscriptions.push(doc.data()));
        return subscriptions;
    } else {
        return null;
    }
}

export async function checkIfAdmin(uid) {
    const authUser = fire.auth().currentUser;
    if (!authUser) return false;
    try {
        const token = await authUser.getIdTokenResult();
        return ['ADMIN', 'SUPER_ADMIN'].includes(String(token.claims?.role || '').toUpperCase()) || token.claims?.permissions?.includes('*') === true;
    } catch (error) {
        console.warn('Unable to verify admin claim:', error.message);
        return false;
    }
}

// Get one user by exact UID or email. Admin callers use Firebase Auth-backed
// server data; ordinary callers retain the owner-scoped profile lookup.
export async function getUserById(identifier) {
    const value = String(identifier || '').trim();
    if (!value || value.length > 320) return false;
    const currentUser = fire.auth().currentUser;
    let isAdmin = false;
    try {
        const claims = currentUser ? await currentUser.getIdTokenResult() : null;
        isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(String(claims?.claims?.role || '').toUpperCase()) || claims?.claims?.permissions?.includes('*');
        if (isAdmin) {
            const route = /^[A-Za-z0-9:_-]{1,128}$/.test(value)
                ? `/api/admin/users/${encodeURIComponent(value)}`
                : `/api/admin/users?q=${encodeURIComponent(value)}&limit=5`;
            const { response, data } = await fetchAdminWithReauth(route);
            if (!response.ok) return false;
            return data.user || data.users?.[0] || false;
        }
    } catch (_) {
        // An Admin caller must never fall back to a stale Firestore-only profile
        // when the authoritative Auth-backed endpoint is unavailable.
        if (isAdmin || currentUser) return false;
    }
    const db = fire.firestore();
    if (/^[A-Za-z0-9:_-]{1,128}$/.test(value)) {
        const snapshot = await db.collection('users').doc(value).get();
        if (!snapshot.exists) return false;
        const data = snapshot.data() || {};
        return { id: snapshot.id, ...data, userId: data.userId || snapshot.id };
    }
    const candidates = [...new Set([value, value.toLowerCase()])];
    for (const email of candidates) {
        const query = await db.collection('users').where('email', '==', email).limit(1).get();
        if (!query.empty) {
            const document = query.docs[0];
            const data = document.data() || {};
            return { id: document.id, ...data, userId: data.userId || document.id };
        }
    }
    return false;
}
// Adding user to firestore safely with merge protection for Social OAuth login
export function addUser(userId, firstname, lastname, email) {
    const db = fire.firestore();
    const userDocRef = db.collection('users').doc(userId);

    userDocRef.get().then((doc) => {
        if (!doc.exists) {
            userDocRef.set({
                userId: userId,
                firstname: firstname || 'User',
                lastname: lastname || '',
                resumes: '',
                membership: 'Basic',
                email: email,
                membershipEnds: new Date('2017-05-05'),
                createdAt: new Date()
            }, { merge: true }).catch(() => {});

            var statsRef = db.collection('data').doc('stats');
            statsRef.update({
                numberOfUsers: firebase.firestore.FieldValue.increment(1),
            }).catch(() => {});
        } else {
            userDocRef.set({
                email: email,
                ...(firstname && firstname !== 'Welcome' ? { firstname } : {}),
                ...(lastname && lastname !== 'back' ? { lastname } : {})
            }, { merge: true }).catch(() => {});
        }
    }).catch(() => {});
}
async function updateUserByAdminApi(userId, changes) {
    const { response, data: result } = await fetchAdminWithReauth(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes)
    });
    if (!response.ok) throw new Error(result.error || 'Administrative user update failed.');
    return result;
}

export async function editUser(userId, _email, membership, membershipsEnds, _isA = null, suspended = null, expected = {}) {
    const changes = {
        ...(expected.expectedMembership ? { expectedMembership: expected.expectedMembership } : {}),
        ...(typeof expected.expectedSuspended === 'boolean' ? { expectedSuspended: expected.expectedSuspended } : {}),
    };
    if (membership) changes.membership = membership;
    if (membership === 'Premium' && membershipsEnds) {
        const raw = String(membershipsEnds);
        const parsed = /^\d{2}-\d{2}-\d{4}$/.test(raw)
            ? `${raw.slice(6, 10)}-${raw.slice(3, 5)}-${raw.slice(0, 2)}`
            : raw;
        if (Number.isFinite(new Date(parsed).getTime())) changes.membershipEnds = new Date(parsed).toISOString();
    }
    // Role changes use setUserAdminStatus and require SUPER_ADMIN; ordinary profile edits
    // cannot smuggle a role mutation alongside billing/suspension fields.
    if (suspended !== null) changes.suspended = Boolean(suspended);
    return updateUserByAdminApi(userId, changes);
}

// Function to check if user is suspended
export async function checkIfSuspended(uid) {
    if (!uid) return false;
    try {
        const db = fire.firestore();
        const snapshot = await db.collection('users').doc(uid).get();
        if (snapshot.exists) {
            const data = snapshot.data();
            return Boolean(data.suspended);
        }
    } catch (e) {
        console.warn('Check suspended error:', e);
    }
    return false;
}

// Function to suspend or activate a user account by Admin
export async function toggleUserSuspension(userId, suspend, expectedSuspended = undefined) {
    try {
        await updateUserByAdminApi(userId, { suspended: Boolean(suspend), ...(expectedSuspended === undefined ? {} : { expectedSuspended: Boolean(expectedSuspended) }) });
        return { success: true, message: `User account ${suspend ? 'suspended' : 'reactivated'} successfully.` };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function setUserAdminStatus(userId, isAdmin, expectedIsAdmin = undefined) {
    try {
        await updateUserByAdminApi(userId, { role: isAdmin ? 'ADMIN' : 'USER', ...(expectedIsAdmin === undefined ? {} : { expectedRole: expectedIsAdmin ? 'ADMIN' : 'USER' }) });
        return { success: true, message: `Admin status set to ${Boolean(isAdmin)}` };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function setUserRole(userId, newRole, expectedRole = undefined) {
    try {
        await updateUserByAdminApi(userId, { role: newRole, ...(expectedRole === undefined ? {} : { expectedRole }) });
        return { success: true, message: `User role updated to ${newRole}` };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function makeUserAdminByEmail(email) {
    try {
        const query = String(email || '').trim().toLowerCase();
        const { response, data } = await fetchAdminWithReauth(`/api/admin/users?q=${encodeURIComponent(query)}&limit=5`);
        if (!response.ok || !data.success) return { success: false, error: data.error?.message || data.error || 'User directory is unavailable.' };
        const match = (data.users || []).find(user => String(user.email || '').toLowerCase() === query);
        if (!match) return { success: false, error: `User with email ${email} not found.` };
        return setUserAdminStatus(match.id, true, match.role === 'ADMIN');
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function mergeUserAccounts() {
    return { success: false, error: 'Account merging is disabled until a provider-aware, transactional server workflow is configured.' };
}

// Bulk merge all duplicate accounts across the system with safe backup snapshots
export async function bulkMergeDuplicateUsers() {
    return { success: false, totalMerged: 0, error: 'Bulk account merging is disabled to prevent identity and entitlement corruption.' };
}

// Fetch all merged/deleted account backups for safe restore inspection
export async function getMergedUserBackups() {
    const db = fire.firestore();
    try {
        const snapshot = await db.collection('merged_user_backups').get();
        const backups = [];
        snapshot.forEach((doc) => {
            backups.push({ id: doc.id, ...doc.data() });
        });
        // Sort newest first
        backups.sort((a, b) => {
            const tA = a.mergedAt?.toDate ? a.mergedAt.toDate().getTime() : 0;
            const tB = b.mergedAt?.toDate ? b.mergedAt.toDate().getTime() : 0;
            return tB - tA;
        });
        return backups;
    } catch (error) {
        console.error('Error fetching merged backups:', error);
        return [];
    }
}

// Restore a previously merged/deleted user account from backup
export async function restoreMergedUserAccount() {
    return { success: false, error: 'Identity restore is disabled; use the documented disaster-recovery procedure.' };
}

// Administrative deletion executes atomically on the trusted backend and fails closed.
export async function deleteUserByAdmin(userId, email = null) {
    try {
        const { response, data: result } = await fetchAdminWithReauth('/api/admin/delete-user', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: userId, email })
        });
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to delete user.');
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// --- DYNAMIC COUPONS & INVOICE TRANSACTIONS ---

// Fetch dynamic coupons for client checkout from Firestore 'coupons' collection
export async function getCoupons() {
    const db = fire.firestore();
    try {
        // Check if Promo Coupons Addon Module is disabled in System Settings
        const settings = await getSystemSettings();
        const mods = (settings && settings.modules) || {};
        if (mods.enableCouponsModule === false) {
            return {};
        }

        const snap = await db.collection('coupons').get();
        const coupons = {};
        const now = new Date();
        snap.forEach((doc) => {
            if (doc.id === '_meta') return;
            const data = doc.data();
            // Check active status
            if (data.active !== false) {
                // Check expiry date
                let isExpired = false;
                if (data.expiryDate) {
                    const exp = new Date(data.expiryDate);
                    if (!isNaN(exp.getTime()) && exp < now) {
                        isExpired = true;
                    }
                }
                // Check max uses
                let isLimitReached = false;
                if (data.maxUses && Number(data.maxUses) > 0 && Number(data.usedCount || 0) >= Number(data.maxUses)) {
                    isLimitReached = true;
                }

                if (!isExpired && !isLimitReached) {
                    coupons[doc.id.toUpperCase()] = {
                        code: doc.id.toUpperCase(),
                        discount: Number(data.discount) || 10,
                        description: data.description || `${data.discount}% Special Discount!`,
                        active: true,
                        expiryDate: data.expiryDate || null,
                        maxUses: Number(data.maxUses) || 0,
                        usedCount: Number(data.usedCount) || 0,
                        singleUsePerUser: Boolean(data.singleUsePerUser),
                    };
                }
            }
        });
        return coupons;
    } catch (err) {
        console.warn('⚠️ Could not fetch coupons from Firestore:', err.message);
        return {};
    }
}

// Fetch ALL coupons for Admin Panel (including inactive & expired)
export async function getAllCouponsAdmin() {
    try {
        const { response, data } = await fetchAdminWithReauth('/api/admin/coupons');
        if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'Unable to load coupons.');
        return (data.coupons || []).sort((a, b) => String(a.code).localeCompare(String(b.code)));
    } catch { return []; }
}

export async function saveCoupon(code, discount, description, active = true, extra = {}) {
    try {
        const { response, data } = await fetchAdminWithReauth(`/api/admin/coupons/${encodeURIComponent(String(code).trim().toUpperCase())}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ discount, description, active, expiryDate: extra.expiryDate, maxUses: extra.maxUses, singleUsePerUser: extra.singleUsePerUser, expectedRevision: Number(extra.revision || 0) }) });
        return response.ok && data.success ? data : { success: false, error: data.error?.message || data.error || 'Unable to save coupon.', code: data.code };
    } catch (error) { return { success: false, error: error.message }; }
}

export async function deleteCoupon(code, expectedRevision = 0) {
    try {
        const { response, data } = await fetchAdminWithReauth(`/api/admin/coupons/${encodeURIComponent(String(code).trim().toUpperCase())}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }) });
        return response.ok && data.success ? data : { success: false, error: data.error?.message || data.error || 'Unable to delete coupon.', code: data.code };
    } catch (error) { return { success: false, error: error.message }; }
}

// Subscription preferences are owner-bound by the verified backend token.
export async function updateUserAutoRenew(_userId, autoRenew) {
    try {
        const response = await fetch('/api/subscription/preferences', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ autoRenew: Boolean(autoRenew) })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to update auto-renew.');
        return result;
    } catch (error) { return { success: false, error: error.message }; }
}

export async function cancelUserSubscription(_userId, reason) {
    try {
        const response = await fetch('/api/subscription/preferences', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cancel: true, reason })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to cancel subscription.');
        return result;
    } catch (error) { return { success: false, error: error.message }; }
}

// Function to quickly toggle user membership plan
export async function updateUserSubscription(userId, membership, expectedMembership = undefined) {
    try {
        await updateUserByAdminApi(userId, { membership, ...(expectedMembership === undefined ? {} : { expectedMembership }) });
        return { success: true, message: `Subscription plan updated to ${membership}.` };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// edit user personal info
export function editPersonalInfo(userId, firstname, lastname) {
    const db = fire.firestore();

    db.collection('users')
        .doc(userId)
        .update({
            firstname: firstname,
            lastname: lastname,
        })
}

// ADD 1 to downloads
export async function IncrementDownloads() {
    const db = fire.firestore();
    var statsRef = db.collection('data').doc('stats');
    await statsRef.update({
        numberOfResumesDownloaded: firebase.firestore.FieldValue.increment(1),
    });
}
// ADD 1 to users
export async function IncrementUsers(userid) {

    const db = fire.firestore();
    const userRef = db.collection('users').doc(userid);
    const snapshot = await userRef.get();
    if (!snapshot.exists) {
        var statsRef = db.collection('data').doc('stats');
        statsRef.update({
            numberOfUsers: firebase.firestore.FieldValue.increment(1),
        });
    }
}
// Getting the name of the current user
export async function getFullName(userId) {
    var firstname = '';
    var lastname = '';
    var membership = 'Basic';
    var profile = {};
    const db = fire.firestore();
    const userRef = db.collection('users').doc(userId);
    const snapshot = await userRef.get();
    if (snapshot.exists) {
        const data = snapshot.data();
        firstname = data.firstname || data.profile?.firstname || '';
        lastname = data.lastname || data.profile?.lastname || '';
        membership = data.membership || 'Basic';
        profile = data.profile || {};
        return { firstname, lastname, membership, profile };
    }
    return null;
}

// Get user data including employer status
export async function getUserData(userId) {
    const db = fire.firestore();
    const userRef = db.collection('users').doc(userId);
    const snapshot = await userRef.get();
    if (snapshot.exists) {
        return snapshot.data();
    } else {
        return null;
    }
}

// Check if user is an employer
export async function checkIsEmployer(userId) {
    const userData = await getUserData(userId);
    return userData && userData.isEmployer === true;
}

// Submit employer application
export async function submitEmployerApplication(userId, applicationData) {
    const db = fire.firestore();

    // Validate inputs
    if (!userId) {
        return { success: false, error: 'User ID is required' };
    }

    if (!applicationData) {
        return { success: false, error: 'Application data is required' };
    }

    // Validate required fields for employer application (personal info)
    const requiredFields = {
        contactPersonName: 'Contact person name is required',
        contactPersonTitle: 'Job title is required',
        contactEmail: 'Email address is required',
        reasonForJoining: 'Reason for joining is required'
    };

    for (const [field, message] of Object.entries(requiredFields)) {
        if (!applicationData[field] || !applicationData[field].trim()) {
            return { success: false, error: message };
        }
    }

    // Validate email format
    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(applicationData.contactEmail)) {
        return { success: false, error: 'Please enter a valid email address' };
    }

    // Validate terms agreement
    if (!applicationData.agreeToTerms) {
        return { success: false, error: 'You must agree to the terms and conditions' };
    }

    try {

        // Store the application in a separate collection for review
        const applicationRef = db.collection('employerApplications').doc(userId);
        await applicationRef.set({
            userId: userId,
            ...applicationData,
            status: 'pending',
            submittedAt: new Date(),
        });

        return { success: true };
    } catch (error) {
        console.error('Error submitting employer application:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);

        // Provide more specific error messages
        let errorMessage = error.message;
        if (error.code === 'permission-denied') {
            errorMessage = 'Permission denied. Please make sure you are logged in.';
        } else if (error.code === 'unavailable') {
            errorMessage = 'Service temporarily unavailable. Please try again later.';
        } else if (error.message.includes('ERR_BLOCKED_BY_CLIENT')) {
            errorMessage = 'Request blocked by browser extension or firewall. Please disable ad blockers and try again.';
        }

        return { success: false, error: errorMessage };
    }
}

// Get all employer applications through the authenticated moderation API.
export async function getAllEmployerApplications(options = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options || {})) if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    const { response, data } = await fetchAdminWithReauth(`/api/admin/employer-applications${params.toString() ? `?${params}` : ''}`);
    if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'Employer applications are unavailable.');
    return data.applications || [];
}

async function reviewEmployerApplication(userId, status, reason = '', expectedStatus = undefined) {
    try {
        const response = await fetchAdminWithReauth(`/api/admin/employer-applications/${encodeURIComponent(userId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, reason, ...(expectedStatus ? { expectedStatus } : {}) })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) return { success: false, error: result.error || 'Unable to review employer application.', code: result.code, status: response.status };
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function approveEmployerApplication(userId, expectedStatus = undefined) {
    return reviewEmployerApplication(userId, 'approved', '', expectedStatus);
}

export async function rejectEmployerApplication(userId, reason = '', expectedStatus = undefined) {
    return reviewEmployerApplication(userId, 'rejected', reason, expectedStatus);
}

export async function reactivateEmployerApplication(userId, expectedStatus = undefined) {
    return reviewEmployerApplication(userId, 'active', '', expectedStatus);
}

// ==================== COMPANY MANAGEMENT FUNCTIONS ====================
// Create a new company
export async function createCompany(employerId, companyData) {
    const user = fire.auth().currentUser;
    if (!user || user.uid !== employerId) return { success: false, error: 'Approved employer sign-in is required.' };
    try {
        const response = await fetchAdminWithReauth('/api/employer/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: companyData }) });
        const result = await response.json().catch(() => ({}));
        return response.ok && result.success ? result : { success: false, error: result.error?.message || result.error || 'Unable to create company.', code: result.code };
    } catch (error) { return { success: false, error: error.message }; }
}

// Get companies for an employer
export async function getEmployerCompanies(employerId) {
    const db = fire.firestore();
    try {

        // First, let's try without orderBy to avoid composite index issues
        const snapshot = await db.collection('companies')
            .where('employerId', '==', employerId)
            .get();


        if (!snapshot.empty) {
            const companies = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                companies.push({
                    id: doc.id,
                    ...data,
                });
            });

            // Sort on client side by createdAt (newest first)
            companies.sort((a, b) => {
                const dateA = a.createdAt?.toDate?.() || a.createdAt || new Date(0);
                const dateB = b.createdAt?.toDate?.() || b.createdAt || new Date(0);
                return new Date(dateB) - new Date(dateA);
            });

            return companies;
        }
        return [];
    } catch (error) {
        console.error('❌ Error getting employer companies:', error);
        console.error('Error details:', error.message);
        console.error('Error code:', error.code);
        return [];
    }
}

// Get approved companies for an employer (for job posting)
export async function getApprovedEmployerCompanies(employerId) {
    const db = fire.firestore();
    try {
 
        // First get all companies for this employer, then filter by status to avoid composite index
        const snapshot = await db.collection('companies')
            .where('employerId', '==', employerId)
            .get();

     

        if (!snapshot.empty) {
            const companies = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                
                // Filter for approved companies on client side
                if (data.status === 'approved') {
                    companies.push({
                        id: doc.id,
                        ...data,
                    });
                }
            });

            // Sort on client side by createdAt (newest first)
            companies.sort((a, b) => {
                const dateA = a.createdAt?.toDate?.() || a.createdAt || new Date(0);
                const dateB = b.createdAt?.toDate?.() || b.createdAt || new Date(0);
                return new Date(dateB) - new Date(dateA);
            });

      
            return companies;
        }
        return [];
    } catch (error) {
        console.error('❌ Error getting approved employer companies:', error);
        console.error('Error details:', error.message);
        console.error('Error code:', error.code);
        return [];
    }
}

// Update a company
export async function updateCompany(companyId, companyData, expectedRevision = 0) {
    try {
        const response = await fetchAdminWithReauth(`/api/employer/companies/${encodeURIComponent(companyId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: companyData, expectedRevision }) });
        const result = await response.json().catch(() => ({}));
        return response.ok && result.success ? result : { success: false, error: result.error?.message || result.error || 'Unable to update company.', code: result.code };
    } catch (error) { return { success: false, error: error.message }; }
}

// Delete a company only after revision and dependent-job checks.
export async function deleteCompany(companyId, expectedRevision = 0) {
    try {
        const response = await fetchAdminWithReauth(`/api/employer/companies/${encodeURIComponent(companyId)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }) });
        const result = await response.json().catch(() => ({}));
        return response.ok && result.success ? result : { success: false, error: result.error?.message || result.error || 'Unable to delete company.', code: result.code };
    } catch (error) { return { success: false, error: error.message }; }
}

// Admin functions for company management
// Get all companies (admin function)
export async function getAllCompanies(options = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options || {})) if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    const { response, data } = await fetchAdminWithReauth(`/api/admin/companies${params.toString() ? `?${params}` : ''}`);
    if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'Company directory is unavailable.');
    return data.companies || [];
}

// Company moderation is server-authoritative, stale-target checked, and audited.
async function updateCompanyByAdminApi(companyId, changes) {
    try {
        const response = await fetchAdminWithReauth(`/api/admin/companies/${encodeURIComponent(companyId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
        });
        const result = await response.json().catch(() => ({}));
        return response.ok && result.success ? result : { success: false, error: result.error || 'Unable to update company.', code: result.code };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function approveCompany(companyId, expected = {}) {
    return updateCompanyByAdminApi(companyId, { status: 'approved', ...expected });
}

export async function rejectCompany(companyId, reason = '', expected = {}) {
    return updateCompanyByAdminApi(companyId, { status: 'rejected', reason, ...expected });
}

export async function toggleCompanyFeatured(companyId, featured = true, expected = {}) {
    return updateCompanyByAdminApi(companyId, { featured, ...expected });
}

// Get featured companies for public display
export async function getFeaturedCompanies(limit = 8) {
    const db = fire.firestore();
    try {
        
        // Try with orderBy first (requires composite index)
        let snapshot;
        try {
            snapshot = await db.collection('companies')
                .where('status', '==', 'approved')
                .where('featured', '==', true)
                .orderBy('featuredAt', 'desc')
                .limit(limit)
                .get();
        } catch (indexError) {
            // Fallback: query without orderBy if composite index doesn't exist
            snapshot = await db.collection('companies')
                .where('status', '==', 'approved')
                .where('featured', '==', true)
                .limit(limit)
                .get();
        }
        
            
        if (!snapshot.empty) {
            const companies = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                companies.push({
                    id: doc.id,
                    ...data,
                });
            });
            
            // Sort on client side if we couldn't use orderBy
            if (companies.length > 1) {
                companies.sort((a, b) => {
                    const dateA = a.featuredAt?.toDate?.() || a.featuredAt || new Date(0);
                    const dateB = b.featuredAt?.toDate?.() || b.featuredAt || new Date(0);
                    return new Date(dateB) - new Date(dateA);
                });
            }
            
            return companies;
        } else {
            return [];
        }
    } catch (error) {
        console.error('🚨 Error getting featured companies:', error);
        console.error('🚨 Error code:', error.code);
        console.error('🚨 Error message:', error.message);
        return [];
    }
}


// ==================== JOB POSTING FUNCTIONS ====================
// Create a new job posting
export async function createJobPosting(employerId, jobData) {
    const user = fire.auth().currentUser;
    if (!user || user.uid !== employerId) return { success: false, error: 'Approved employer sign-in is required.' };
    try {
        const response = await fetchAdminWithReauth('/api/employer/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: jobData }) });
        const result = await response.json().catch(() => ({}));
        return response.ok && result.success ? result : { success: false, error: result.error?.message || result.error || 'Unable to create job.', code: result.code };
    } catch (error) { return { success: false, error: error.message }; }
}

// Get paginated active job postings for public viewing
export async function getActiveJobs(page = 1, itemsPerPage = 10, filters = {}) {
    const db = fire.firestore();
    try {
        // Get all active jobs first (we'll filter them server-side)
        const allJobsQuery = db.collection('jobs').where('status', '==', 'active');
        const allJobsSnapshot = await allJobsQuery.get();

        // Convert to array and apply server-side filtering
        let allJobs = [];
        allJobsSnapshot.forEach((doc) => {
            const data = doc.data();
            const createdDate = data.createdAt?.toDate?.() || data.createdAt;

            const job = {
                id: doc.id,
                ...data,
                // Convert Firestore timestamps to readable dates
                createdAt: createdDate,
                updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
                deadline: data.deadline?.toDate?.() || data.deadline,
                // Add fields expected by JobCard component
                type: data.jobType, // Map jobType to type for compatibility
                postedDate: formatTimeAgo(createdDate),
                applicants: data.applicationsCount || 0,
                // Format salary display
                salary: formatSalaryRange(data.minSalary, data.maxSalary),
            };
            allJobs.push(job);
        });

        // Apply server-side filtering - always start from all jobs for each filter combination
        let filteredJobs = allJobs.filter((job) => {
            // Apply search filter
            let matchesSearch = true;
            if (filters.searchTerm) {
                const searchTerm = filters.searchTerm.toLowerCase();
                matchesSearch = job.title?.toLowerCase().includes(searchTerm) || job.company?.toLowerCase().includes(searchTerm) || job.description?.toLowerCase().includes(searchTerm);
            }

            // Apply location filter with improved matching
            let matchesLocation = true;
            if (filters.locationFilter) {
                const locationFilter = filters.locationFilter.toLowerCase().trim();
                const jobLocation = (job.location || '').toLowerCase().trim();
                const jobCountry = (job.country || '').toLowerCase().trim();

                // Create a combined location string for comprehensive search
                const combinedLocation = `${jobLocation}, ${jobCountry}`.toLowerCase();

                // Multiple matching strategies:
                // 1. Direct match in location field
                // 2. Direct match in country field
                // 3. Match in combined location string
                // 4. Partial match (city name only)
                // 5. Split search terms and match individually

                const searchTerms = locationFilter
                    .split(',')
                    .map((term) => term.trim())
                    .filter((term) => term.length > 0);

                matchesLocation =
                    jobLocation.includes(locationFilter) || // Direct location match
                    jobCountry.includes(locationFilter) || // Direct country match
                    combinedLocation.includes(locationFilter) || // Combined match
                    searchTerms.every(
                        (
                            term // All search terms match
                        ) => jobLocation.includes(term) || jobCountry.includes(term) || combinedLocation.includes(term)
                    ) ||
                    searchTerms.some(
                        (
                            term // Any search term matches
                        ) => jobLocation.includes(term) || jobCountry.includes(term)
                    );

            }

            // Apply job type filter
            let matchesJobType = true;
            if (filters.jobType && filters.jobType.length > 0) {
                matchesJobType = filters.jobType.includes(job.jobType);
            }

            // Apply work mode filter
            let matchesWorkMode = true;
            if (filters.workMode && filters.workMode.length > 0) {
                matchesWorkMode = filters.workMode.includes(job.workMode);
            }

            // Apply experience level filter
            let matchesExperienceLevel = true;
            if (filters.experienceLevel && filters.experienceLevel.length > 0) {
                matchesExperienceLevel = filters.experienceLevel.includes(job.experienceLevel);
            }

            // Apply salary range filter
            let matchesSalaryRange = true;
            if (filters.salaryRange && filters.salaryRange.length > 0) {
                matchesSalaryRange = filters.salaryRange.some((range) => {
                    const jobMinSalary = job.minSalary || 0;
                    const jobMaxSalary = job.maxSalary || 0;

                    // Parse the salary range string (e.g., "$40k - $60k", "$120k+")
                    if (range === '$120k+') {
                        return jobMinSalary >= 120000 || jobMaxSalary >= 120000;
                    }

                    const rangeParts = range.replace(/\$|k/g, '').split(' - ');
                    if (rangeParts.length === 2) {
                        const rangeMin = parseInt(rangeParts[0]) * 1000;
                        const rangeMax = parseInt(rangeParts[1]) * 1000;

                        // Check if job salary range overlaps with filter range
                        return (
                            (jobMinSalary <= rangeMax && jobMaxSalary >= rangeMin) || (jobMinSalary >= rangeMin && jobMinSalary <= rangeMax) || (jobMaxSalary >= rangeMin && jobMaxSalary <= rangeMax)
                        );
                    }

                    return false;
                });
            }

            // Job must match ALL active filters
            return matchesSearch && matchesLocation && matchesJobType && matchesWorkMode && matchesExperienceLevel && matchesSalaryRange;
        });


        // Sort by creation date (newest first)
        filteredJobs.sort((a, b) => {
            const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
            const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
            return dateB - dateA;
        });

        // Calculate pagination metadata
        const totalItems = filteredJobs.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        // Apply pagination
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedJobs = filteredJobs.slice(startIndex, endIndex);


        return {
            success: true,
            jobs: paginatedJobs,
            allJobs: allJobs, // Include all jobs for filter counting
            pagination: {
                totalItems,
                totalPages,
                currentPage: page,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        };
    } catch (error) {
        console.error('Error fetching active jobs:', error);
        return { success: false, error: error.message };
    }
}

// Get all job postings for an employer
export async function getEmployerJobs(employerId) {
    if (!employerId) throw new Error('Employer identity is required.');
    const snapshot = await fire.firestore().collection('jobs').where('employerId', '==', employerId).orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

// Update job posting through the revision-safe employer API.
export async function updateJobPosting(jobId, updateData, expectedRevision = 0) {
    try {
        const statusOnly = Object.keys(updateData || {}).length === 1 && Object.hasOwn(updateData, 'status');
        const response = await fetchAdminWithReauth(`/api/employer/jobs/${encodeURIComponent(jobId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(statusOnly ? { status: updateData.status, expectedRevision } : { data: updateData, expectedRevision }),
        });
        const result = await response.json().catch(() => ({}));
        return response.ok && result.success ? result : { success: false, error: result.error?.message || result.error || 'Unable to update job.', code: result.code };
    } catch (error) { return { success: false, error: error.message }; }
}

// Delete an employer-owned job only after revision and application checks.
export async function deleteJobPosting(jobId, expectedRevision = 0) {
    try {
        const response = await fetchAdminWithReauth(`/api/employer/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }) });
        const result = await response.json().catch(() => ({}));
        return response.ok && result.success ? result : { success: false, error: result.error?.message || result.error || 'Unable to delete job.', code: result.code };
    } catch (error) { return { success: false, error: error.message }; }
}

// Administrative deletion is server-authoritative, stale-target checked, and audited.
export async function deleteJobByAdmin(jobId, expected = {}) {
    try {
        const response = await fetchAdminWithReauth(`/api/admin/jobs/${encodeURIComponent(jobId)}`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(expected),
        });
        const result = await response.json().catch(() => ({}));
        return response.ok && result.success ? result : { success: false, error: result.error || 'Unable to delete job.', code: result.code };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Get job applications for a specific job
export async function getJobApplications(jobId) {
    const db = fire.firestore();
    try {
        const snapshot = await db.collection('jobApplications').where('jobId', '==', jobId).orderBy('appliedAt', 'desc').get();

        if (!snapshot.empty) {
            const applications = [];
            snapshot.forEach((doc) => {
                const applicationData = doc.data();
                applications.push({
                    id: doc.id,
                    ...applicationData,
                });
            });

            return applications;
        } else {
            return [];
        }
    } catch (error) {
        console.error('Error getting job applications:', error.message);
        throw error;
    }
}

// Submit a job application through the ownership-bound backend transaction.
export async function submitJobApplication(userId, jobId, applicationData) {
    const currentUser = fire.auth().currentUser;
    if (!currentUser || currentUser.uid !== userId) return { success: false, error: 'Sign in again before applying.' };
    try {
        const response = await fetchAdminWithReauth(`/api/jobs/${encodeURIComponent(jobId)}/applications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullName: applicationData.fullName,
                phone: applicationData.phone,
                linkedinUrl: applicationData.linkedinUrl,
                githubUrl: applicationData.githubUrl,
                coverLetter: applicationData.coverLetter,
                resumeId: applicationData.selectedResume?.id || '',
            }),
        });
        const result = await response.json().catch(() => ({}));
        return response.ok && result.success
            ? result
            : { success: false, error: result.error?.message || result.error || 'Unable to submit application.', code: result.code };
    } catch (error) {
        return { success: false, error: error.message || 'Unable to submit application.' };
    }
}

// Personal job tracker operations. These records are distinct from employer-controlled
// jobApplications statuses and live under the authenticated user's document.
export async function getTrackedJobs(userId) {
    if (!userId) throw new Error('Authentication is required');
    const snapshot = await fire.firestore().collection('users').doc(userId).collection('jobTracker').get();
    return snapshot.docs.map((document) => {
        const data = document.data();
        return {
            id: document.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        };
    });
}

export async function createTrackedJob(userId, input) {
    if (!userId) throw new Error('Authentication is required');
    const { job, errors, valid } = validateTrackedJob(input);
    if (!valid) throw new Error(Object.values(errors)[0]);
    const now = firebase.firestore.Timestamp.now();
    const reference = fire.firestore().collection('users').doc(userId).collection('jobTracker').doc();
    await reference.set({ ...job, revision: 1, createdAt: now, updatedAt: now });
    return { id: reference.id, ...job, revision: 1, createdAt: now.toDate(), updatedAt: now.toDate() };
}

export async function updateTrackedJob(userId, jobId, patch, expectedRevision = null) {
    if (!userId || !jobId) throw new Error('A tracked job and authenticated user are required');
    const allowed = Object.fromEntries(Object.entries(patch || {}).filter(([key]) => ['title','company','location','url','notes','deadline','status','order'].includes(key)));
    if (allowed.status && !JOB_TRACKER_STATUSES.includes(allowed.status)) throw new Error('Invalid tracker status');
    const normalized = normalizeTrackedJob(allowed);
    if (Object.hasOwn(allowed, 'title') && !normalized.title) throw new Error('Job title is required');
    if (Object.hasOwn(allowed, 'company') && !normalized.company) throw new Error('Company is required');
    if (allowed.url && !normalized.url) throw new Error('Use a valid web address');
    const reference = fire.firestore().collection('users').doc(userId).collection('jobTracker').doc(jobId);
    let result;
    await fire.firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw new Error('Tracked job not found.');
        const revision = Number(snapshot.data()?.revision || 0);
        if (expectedRevision !== null && Number(expectedRevision) !== revision) { const error = new Error('This tracked job changed elsewhere. Refresh before saving.'); error.code = 'TRACKER_CONFLICT'; throw error; }
        const update = Object.fromEntries(Object.keys(allowed).map(key => [key, normalized[key]]));
        update.revision = revision + 1; update.updatedAt = firebase.firestore.Timestamp.now();
        transaction.update(reference, update); result = update;
    });
    return result;
}

export async function deleteTrackedJob(userId, jobId, expectedRevision = null) {
    if (!userId || !jobId) throw new Error('A tracked job and authenticated user are required');
    const reference = fire.firestore().collection('users').doc(userId).collection('jobTracker').doc(jobId);
    await fire.firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw new Error('Tracked job not found.');
        const revision = Number(snapshot.data()?.revision || 0);
        if (expectedRevision !== null && Number(expectedRevision) !== revision) { const error = new Error('This tracked job changed elsewhere. Refresh before deleting.'); error.code = 'TRACKER_CONFLICT'; throw error; }
        transaction.delete(reference);
    });
    return true;
}

// Check if user has already applied to a job
export async function checkUserApplicationStatus(userId, jobId) {
    const db = fire.firestore();
    try {
        const snapshot = await db.collection('jobApplications').where('userId', '==', userId).where('jobId', '==', jobId).get();

        if (!snapshot.empty) {
            const application = snapshot.docs[0].data();
            return {
                hasApplied: true,
                applicationId: snapshot.docs[0].id,
                status: application.status,
                appliedAt: application.appliedAt,
            };
        } else {
            return { hasApplied: false };
        }
    } catch (error) {
        console.error('Error checking application status:', error);
        return { hasApplied: false, error: error.message };
    }
}

// Get all job applications for a specific user
export async function getUserJobApplications(userId) {
    const db = fire.firestore();
    try {
        // Get all applications for this user
        const snapshot = await db.collection('jobApplications').where('userId', '==', userId).get();

        if (!snapshot.empty) {
            const applications = [];
            const jobIds = new Set();

            // First, collect all applications and job IDs
            snapshot.forEach((doc) => {
                const applicationData = doc.data();
                applications.push({
                    id: doc.id,
                    ...applicationData,
                });

                if (applicationData.jobId) {
                    jobIds.add(applicationData.jobId);
                }
            });

            // New applications carry a safe job snapshot so closed/removed jobs remain
            // visible. Fetch legacy snapshots individually so one unreadable closed job does
            // not make every application disappear.
            const jobDetails = {};
            for (const application of applications) {
                if (application.jobId && application.jobSnapshot) {
                    const snapshot = application.jobSnapshot;
                    jobDetails[application.jobId] = {
                        ...snapshot,
                        jobTitle: snapshot.title,
                        salary: formatSalaryRange(snapshot.minSalary, snapshot.maxSalary),
                    };
                }
            }
            const missingJobIds = Array.from(jobIds).filter((jobId) => !jobDetails[jobId]);
            await Promise.all(missingJobIds.map(async (jobId) => {
                try {
                    const jobDoc = await db.collection('jobs').doc(jobId).get();
                    if (!jobDoc.exists) return;
                    const jobData = jobDoc.data();
                    jobDetails[jobId] = {
                        id: jobDoc.id,
                        ...jobData,
                        jobTitle: jobData.title,
                        postedDate: formatTimeAgo(jobData.createdAt?.toDate?.() || jobData.createdAt),
                        salary: formatSalaryRange(jobData.minSalary, jobData.maxSalary),
                    };
                } catch {
                    // The application itself remains useful when a job is no longer public.
                }
            }));

            // Combine application data with job details
            const enrichedApplications = applications.map((application) => {
                const job = jobDetails[application.jobId];
                return {
                    ...application,
                    // Application fields
                    appliedDate: application.appliedAt?.toDate?.() || application.appliedAt,
                    // Job fields (if job still exists)
                    jobTitle: job?.jobTitle || job?.title || 'Job Not Found',
                    company: job?.company || 'Unknown Company',
                    location: job?.location || 'Location Not Available',
                    country: job?.country || '',
                    salary: job?.salary || 'Salary Not Available',
                    jobType: job?.jobType || job?.type || 'Not Specified',
                    description: job?.description || '',
                    requirements: job?.requirements || [],
                    companyLogo: job?.companyImage || null,
                    // Status from application
                    status: application.status || 'pending',
                };
            });

            // Sort by application date descending (newest first)
            enrichedApplications.sort((a, b) => {
                const dateA = a.appliedDate instanceof Date ? a.appliedDate : new Date(a.appliedDate || 0);
                const dateB = b.appliedDate instanceof Date ? b.appliedDate : new Date(b.appliedDate || 0);
                return dateB - dateA;
            });

            return enrichedApplications;
        } else {
            return [];
        }
    } catch (error) {
        console.error('Error getting user job applications:', error);
        throw error;
    }
}

// Update an application through the employer-owned, revision-safe backend transaction.
export async function updateApplicationStatus(applicationId, status, notes = '', expected = {}) {
    try {
        const response = await fetchAdminWithReauth(`/api/job-applications/${encodeURIComponent(applicationId)}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status, notes,
                expectedStatus: expected.status || '',
                expectedRevision: Number(expected.revision || 0),
            }),
        });
        const result = await response.json().catch(() => ({}));
        return response.ok && result.success
            ? result
            : { success: false, error: result.error?.message || result.error || 'Unable to update application.', code: result.code };
    } catch (error) {
        return { success: false, error: error.message || 'Unable to update application.' };
    }
}

export async function updateApplicationStatusWithMessage(applicationId, status, customMessage = '', expected = {}) {
    return updateApplicationStatus(applicationId, status, customMessage, expected);
}

// Admin function: Get all jobs with pagination and filtering
export async function getAllJobs(page = 1, itemsPerPage = 10, filters = {}) {
    try {
        const params = new URLSearchParams({ page: String(page), limit: String(itemsPerPage) });
        if (filters.status && filters.status !== 'all') params.set('status', filters.status);
        if (filters.searchTerm) params.set('search', filters.searchTerm);
        const { response, data } = await fetchAdminWithReauth(`/api/admin/jobs?${params}`);
        if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'Job directory is unavailable.');
        return data;
    } catch (error) {
        console.error('Error fetching all jobs for admin:', error);
        return { success: false, error: error.message, jobs: [], pagination: { totalItems: null, totalPages: null, currentPage: page, hasNextPage: null, hasPreviousPage: null } };
    }
}

async function updateJobByAdminApi(jobId, changes) {
    try {
        const response = await fetchAdminWithReauth(`/api/admin/jobs/${encodeURIComponent(jobId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
        });
        const result = await response.json().catch(() => ({}));
        return response.ok && result.success ? result : { success: false, error: result.error || 'Unable to update job.', code: result.code };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function updateJobStatus(jobId, status, expected = {}) {
    return updateJobByAdminApi(jobId, { status, ...expected });
}

export async function toggleJobFeatured(jobId, isFeatured, expected = {}) {
    return updateJobByAdminApi(jobId, { isFeatured, ...expected });
}

// Get a single job by ID
export async function getJobById(jobId) {
    const db = fire.firestore();
    try {
        
        const doc = await db.collection('jobs').doc(jobId).get();
        
        if (doc.exists) {
            const data = doc.data();
            const createdDate = data.createdAt?.toDate?.() || data.createdAt;
            
            
            const job = {
                id: doc.id,
                ...data,
                // Convert Firestore timestamps to readable dates
                createdAt: createdDate,
                updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
                featuredAt: data.featuredAt?.toDate?.() || data.featuredAt,
                deadline: data.deadline?.toDate?.() || data.deadline,
                // Add fields expected by the component
                title: data.title,
                company: data.company,
                companyLogo: data.companyImage || data.companyLogo,
                location: data.location && data.country ? `${data.location}, ${data.country}` : data.location || data.country || 'Location TBD',
                type: data.jobType,
                salary: formatSalaryRange(data.minSalary, data.maxSalary),
                postedTime: formatTimeAgo(createdDate),
                postedDate: formatTimeAgo(createdDate),
                featured: data.isFeatured || false,
                remote: data.workMode === 'remote' || data.workMode === 'Remote',
                urgent: false, // Can be enhanced based on deadline or other criteria
                description: data.description,
                skills: data.skills || data.requirements || [], // Use skills or requirements
                requirements: data.requirements || [],
                // Additional fields for compatibility
                applicants: data.applicationsCount || 0,
                workMode: data.workMode,
                experienceLevel: data.experienceLevel,
                benefits: data.benefits || [],
                country: data.country,
            };
            
            return job;
        } else {
            return null;
        }
    } catch (error) {
        console.error('🚨 Error getting job by ID:', error);
        console.error('🚨 Error code:', error.code);
        console.error('🚨 Error message:', error.message);
        return null;
    }
}

// Get featured jobs for public display
export async function getFeaturedJobs(limit = 6) {
    const db = fire.firestore();
    try {
        
        // Get active jobs that are featured
        const snapshot = await db.collection('jobs')
            .where('status', '==', 'active')
            .where('isFeatured', '==', true)
            .orderBy('featuredAt', 'desc')
            .limit(limit)
            .get();
        
            
        if (!snapshot.empty) {
            const jobs = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                const createdDate = data.createdAt?.toDate?.() || data.createdAt;
                
                
                const job = {
                    id: doc.id,
                    ...data,
                    // Convert Firestore timestamps to readable dates
                    createdAt: createdDate,
                    updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
                    featuredAt: data.featuredAt?.toDate?.() || data.featuredAt,
                    // Add fields expected by the component
                    title: data.title,
                    company: data.company,
                    companyLogo: data.companyImage || data.companyLogo,
                    location: `${data.location}${data.country ? ', ' + data.country : ''}`,
                    type: data.jobType,
                    salary: formatSalaryRange(data.minSalary, data.maxSalary),
                    postedTime: formatTimeAgo(createdDate),
                    featured: data.isFeatured || false,
                    remote: data.workMode === 'Remote',
                    urgent: false, // Can be enhanced based on deadline or other criteria
                    description: data.description,
                    skills: data.skills || [],
                    // Additional fields for compatibility
                    applicants: data.applicationsCount || 0,
                };
                jobs.push(job);
            });
            
            return jobs;
        } else {
            return [];
        }
    } catch (error) {
        // If there's a composite index error, try without orderBy
        if (error.code === 'failed-precondition' || String(error.message || '').includes('index')) {
            try {
                const fallbackSnapshot = await db.collection('jobs')
                    .where('status', '==', 'active')
                    .where('isFeatured', '==', true)
                    .limit(limit)
                    .get();
                
                if (!fallbackSnapshot.empty) {
                    const jobs = [];
                    fallbackSnapshot.forEach((doc) => {
                        const data = doc.data();
                        const createdDate = data.createdAt?.toDate?.() || data.createdAt;
                        
                        const job = {
                            id: doc.id,
                            ...data,
                            createdAt: createdDate,
                            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
                            featuredAt: data.featuredAt?.toDate?.() || data.featuredAt,
                            title: data.title,
                            company: data.company,
                            companyLogo: data.companyImage || data.companyLogo,
                            location: `${data.location}${data.country ? ', ' + data.country : ''}`,
                            type: data.jobType,
                            salary: formatSalaryRange(data.minSalary, data.maxSalary),
                            postedTime: formatTimeAgo(createdDate),
                            featured: data.isFeatured || false,
                            remote: data.workMode === 'Remote',
                            urgent: false,
                            description: data.description,
                            skills: data.skills || [],
                            applicants: data.applicationsCount || 0,
                        };
                        jobs.push(job);
                    });
                    
                    // Sort on client side by featuredAt (newest first)
                    jobs.sort((a, b) => {
                        const dateA = a.featuredAt || a.createdAt || new Date(0);
                        const dateB = b.featuredAt || b.createdAt || new Date(0);
                        return new Date(dateB) - new Date(dateA);
                    });
                    
                    return jobs;
                } else {
                    return [];
                }
            } catch (fallbackError) {
                console.error('🚨 Fallback query also failed:', fallbackError);
                return [];
            }
        }
        
        return [];
    }
}

export async function getWebsiteData() {
    let localCache = null;
    try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('website_meta_cache') : null;
        if (raw) localCache = JSON.parse(raw);
    } catch (e) {}

    const res = await safeDbOperation(async () => {
        const db = fire.firestore();
        const userRef = db.collection('data').doc('meta');
        const snapshot = await userRef.get();
        if (snapshot && snapshot.exists) {
            var data = snapshot.data();
            websiteMetaRevision = Number(data.revision || 0);
            const merged = { ...(localCache || {}), ...data };
            try { if (typeof window !== 'undefined') localStorage.setItem('website_meta_cache', JSON.stringify(merged)); } catch { /* public fallback cache is optional */ }
            return merged;
        }
        return localCache;
    }, false);

    return res || localCache || {
        title: 'ResumePilot AI — #1 ATS Resume Builder & CV Maker',
        description: 'Create ATS-friendly resumes and cover letters in minutes.',
        keywords: 'ResumePilot AI, ATS Resume Builder, CV Maker',
        language: 'English',
        rating: 5,
    };
}

// Set Website Data
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
    try { if (typeof window !== 'undefined') localStorage.setItem('website_meta_cache', JSON.stringify(persisted)); } catch { /* public fallback cache is optional */ }
    return data;
}

// Set Subscriptions Data (Enterprise Grade)
export async function setSubscriptionsData(state, month, quartarly, yearly, onlyPP, currency, razorpayUPI = true, options = {}) {
    const subData = {
        state: state,
        monthlyPrice: month,
        quartarlyPrice: quartarly,
        yearlyPrice: yearly,
        onlyPP: onlyPP,
        currency: currency,
        razorpayUPI: razorpayUPI,
        stripeEnabled: options.stripeEnabled !== undefined ? options.stripeEnabled : true,
        paypalEnabled: options.paypalEnabled !== undefined ? options.paypalEnabled : true,
        razorpayEnabled: options.razorpayEnabled !== undefined ? options.razorpayEnabled : true,
        paytmEnabled: options.paytmEnabled === true,
        phonepeEnabled: options.phonepeEnabled === true,
        sandboxMode: options.sandboxMode === true,
        razorpayKeyId: options.razorpayKeyId || '',
        razorpayKeySecret: options.razorpayKeySecret || '',
        stripePublishableKey: options.stripePublishableKey || '',
        stripeSecretKey: options.stripeSecretKey || '',
        paypalClientId: options.paypalClientId || '',
        paypalClientSecret: options.paypalClientSecret || '',
        paytmMid: options.paytmMid || '',
        paytmMerchantKey: options.paytmMerchantKey || '',
        paytmWebsite: options.paytmWebsite || 'WEBSTAGING',
        phonepeId: options.phonepeId || '',
        phonepeSaltKey: options.phonepeSaltKey || '',
        phonepeSaltIndex: options.phonepeSaltIndex || '1',
        // Secret fields are write-only. Empty values preserve existing secrets;
        // clearing is an explicit, separately audited action in the backend.
        clearSecrets: options.clearSecrets || {},
        expectedRevision: options.expectedRevision,
        enableTax: options.enableTax !== undefined ? options.enableTax : true,
        taxName: options.taxName || 'GST',
        taxRate: options.taxRate !== undefined ? options.taxRate : 18,
        taxInclusive: options.taxInclusive !== undefined ? options.taxInclusive : false,
        companyTaxId: options.companyTaxId || '',
        supplierLegalName: options.supplierLegalName || '',
        supplierTradeName: options.supplierTradeName || '',
        supplierGstin: options.supplierGstin || options.companyTaxId || '',
        supplierPan: options.supplierPan || '',
        supplierAddress: options.supplierAddress || '',
        supplierCity: options.supplierCity || '',
        supplierState: options.supplierState || '',
        supplierStateCode: options.supplierStateCode || '',
        supplierPincode: options.supplierPincode || '',
        sacCode: options.sacCode || '',
        invoicePrefix: options.invoicePrefix || '',
        financialYear: options.financialYear || '',
        requireCustomerTaxId: options.requireCustomerTaxId !== undefined ? options.requireCustomerTaxId : false,
        receiptTemplate: options.receiptTemplate || 'modern',
        reverseCharge: options.reverseCharge || 'No',
    };
    const { response, data: result } = await fetchAdminWithReauth('/api/admin/payment-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subData)
    });
    if (!response.ok || !result.success) throw new Error(result.error?.message || result.error || 'Unable to save payment settings.');
    return result;
}

// Fetch Admin Payment Settings (Secrets Masked)
export async function getAdminPaymentSettings() {
    const { response, data } = await fetchAdminWithReauth('/api/platform/payment-settings', { method: 'GET' });
    if (!response.ok) throw new Error(data.error?.message || data.error || 'Unable to fetch payment settings.');
    return data;
}

export async function testAdminPaymentProvider(type, credentials = {}) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/payment/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...credentials }),
    });
    if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || `The ${type} provider test failed.`);
    return data;
}


// Admin Master Invoice Fetcher
export async function getAllInvoicesAdmin() {
    return getAllAdminTransactions();
}

// Manual grants use the audited server entitlement endpoint.
export async function grantProSubscriptionAdmin(userId, _planType = 'yearly', durationMonths = 12) {
    try {
        const normalizedDuration = Number(durationMonths) === 999 ? 600 : Number(durationMonths);
        const response = await fetchAdminWithReauth(`/api/admin/users/${encodeURIComponent(userId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ membership: 'Premium', durationMonths: normalizedDuration })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to grant subscription.');
        return { success: true, message: 'Subscription granted through the audited server ledger.' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// get Subscription data
function redactSubscriptionSecrets(value = {}) {
    const clean = { ...value };
    for (const key of ['razorpayKeySecret','stripeSecretKey','paypalClientSecret','paytmMerchantKey','phonepeSaltKey']) delete clean[key];
    return clean;
}

export async function getSubscriptionStatus() {
    const defaults = {
        state: true, monthlyPrice: 199, quartarlyPrice: 399, yearlyPrice: 499,
        onlyPP: false, currency: 'INR', razorpayUPI: false,
        stripeEnabled: false, paypalEnabled: false, razorpayEnabled: false,
        paytmEnabled: false, phonepeEnabled: false, sandboxMode: true,
        enableTax: true, taxName: 'GST', taxRate: 18, taxInclusive: false,
        companyTaxId: '', requireCustomerTaxId: false, receiptTemplate: 'modern',
    };
    try {
        const snapshot = await fire.firestore().collection('data').doc('public_config').get();
        return snapshot.exists ? { ...defaults, ...redactSubscriptionSecrets(snapshot.data()?.subscriptions || {}) } : defaults;
    } catch (error) {
        console.warn('Public subscription configuration unavailable:', error.message);
        return defaults;
    }
}

// Re-authenticate user with password
export async function reauthenticateUser(currentPassword) {
    const user = fire.auth().currentUser;
    if (!user) throw new Error("No authenticated user logged in");
    const providerIds = (user.providerData || []).map(provider => provider.providerId);
    if (providerIds.includes('password')) {
        if (!currentPassword) throw new Error("Current password is required to verify identity");
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
        await user.reauthenticateWithCredential(credential);
    } else if (providerIds.includes('google.com')) {
        await user.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
    } else if (providerIds.includes('facebook.com')) {
        await user.reauthenticateWithPopup(new firebase.auth.FacebookAuthProvider());
    } else {
        throw new Error('Reauthentication is not available for this provider. Sign out and sign in again before retrying.');
    }
    return user;
}

// Change password with re-authentication
export async function changePassword(currentPassword, newPassword) {
    const user = fire.auth().currentUser;
    if (!user) throw new Error("No authenticated user logged in");
    if (currentPassword) {
        await reauthenticateUser(currentPassword);
    }
    await user.updatePassword(newPassword);
    return true;
}

// Update user email with re-authentication
export async function updateUserEmail(currentPassword, newEmail) {
    const user = fire.auth().currentUser;
    if (!user) throw new Error("No authenticated user");
    if (currentPassword) {
        await reauthenticateUser(currentPassword);
    }
    await user.updateEmail(newEmail);
    await user.getIdToken(true);
    const db = fire.firestore();
    await db.collection('users').doc(user.uid).update({ email: newEmail });
    return true;
}

// Permanently delete user account and all Firestore data
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
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'Unable to delete account.');
    await fire.auth().signOut().catch(() => {});
    return result;
}

// Export browser-readable account data as JSON (GDPR data portability).
export async function exportUserDataJSON(uid) {
    const authenticatedUser = fire.auth().currentUser;
    if (!authenticatedUser || (uid && uid !== authenticatedUser.uid)) throw new Error('User not logged in');
    uid = authenticatedUser.uid;
    const db = fire.firestore();
    const warnings = [];
    const readDocuments = async reference => {
        try {
            const snapshot = await reference.get();
            return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
        } catch (error) {
            warnings.push(error.message || 'A data section was unavailable.');
            return [];
        }
    };
    const readOwned = (collection, field) => readDocuments(db.collection(collection).where(field, '==', uid));
    const userReference = db.collection('users').doc(uid);
    const [userDoc, resumes, legacyCovers, coverLetters, favourites, privatePortfolios, jobTracker, loginHistory, nestedInvoices, nestedTransactions, notifications, transactions, portfolios, publishedPortfolios, blogPosts, jobApplications, jobs, companies, employerApplication] = await Promise.all([
        userReference.get(),
        readDocuments(userReference.collection('resumes')),
        readDocuments(userReference.collection('covers')),
        readDocuments(userReference.collection('coverLetters')),
        readDocuments(userReference.collection('favourites')),
        readDocuments(userReference.collection('portfolios')),
        readDocuments(userReference.collection('jobTracker')),
        readDocuments(userReference.collection('loginHistory')),
        readDocuments(userReference.collection('invoices')),
        readDocuments(userReference.collection('transactions')),
        readDocuments(db.collection('notifications').doc(uid).collection('userNotifications')),
        readOwned('transactions', 'userId'),
        readOwned('portfolios', 'userId'),
        readOwned('pb', 'ownerUid'),
        readOwned('blog_posts', 'authorUid'),
        readOwned('jobApplications', 'userId'),
        readOwned('jobs', 'employerId'),
        readOwned('companies', 'employerId'),
        db.collection('employerApplications').doc(uid).get().catch(error => { warnings.push(error.message); return null; }),
    ]);

    const messaging = { conversations: [], messagesByConversation: {} };
    try {
        const realtime = fire.database();
        const index = await realtime.ref(`user-conversations/${uid}`).get();
        for (const conversationId of Object.keys(index.val() || {})) {
            const [conversationSnapshot, messagesSnapshot] = await Promise.all([
                realtime.ref(`conversations/${conversationId}`).get(),
                realtime.ref(`messages/${conversationId}`).orderByChild('timestamp').get(),
            ]);
            if (conversationSnapshot.exists()) messaging.conversations.push({ id: conversationId, ...conversationSnapshot.val() });
            const messages = [];
            messagesSnapshot.forEach(message => messages.push({ id: message.key, ...message.val() }));
            messaging.messagesByConversation[conversationId] = messages;
        }
    } catch (error) { warnings.push(`Messaging export unavailable: ${error.message}`); }

    return {
        exportDate: new Date().toISOString(), userId: uid, profile: userDoc.exists ? userDoc.data() : {},
        resumes, legacyCovers, coverLetters, favourites, privatePortfolios, jobTracker, loginHistory, nestedInvoices, nestedTransactions, notifications,
        portfolios, publishedPortfolios, blogPosts, jobApplications, jobs, companies, transactions,
        employerApplication: employerApplication?.exists ? employerApplication.data() : null, messaging, exportWarnings: warnings,
        note: 'Provider-held identity, payment-provider records, security audit logs, and legally retained billing records require provider/support export channels.'
    };
}

// Firebase Identity Platform native TOTP MFA. Secrets never enter Firestore or local storage.
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
    return disableTotpEnrollment();
}

export async function getUserTotpStatus() {
    const { getTotpStatus } = await import('../services/mfaService');
    return getTotpStatus();
}

// Parse Device OS and Browser from User-Agent
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

// Record a new login audit event in users/{uid}/loginHistory
export async function recordUserLoginEvent(uid, customMetadata = {}) {
    if (!uid) {
        const user = fire.auth().currentUser;
        if (user) uid = user.uid;
        else return null;
    }

    try {
        const db = fire.firestore();
        const user = fire.auth().currentUser;
        const uaInfo = parseUserAgentDetails();

        const providerId = user?.providerData?.[0]?.providerId || 'password';
        const providerName = providerId === 'google.com' ? 'Google OAuth'
            : providerId === 'github.com' ? 'GitHub OAuth'
            : providerId === 'linkedin.com' ? 'LinkedIn OAuth'
            : 'Email & Password';

        const logEntry = {
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            device: uaInfo.os,
            browser: uaInfo.browser,
            authMethod: providerName,
            status: 'Success 🟢',
            ...customMetadata
        };

        await db.collection('users').doc(uid).collection('loginHistory').add(logEntry);
        return logEntry;
    } catch (err) {
        console.warn('Error recording login audit log:', err);
        return null;
    }
}

// Fetch historical login audit trail for a user
export async function getUserLoginHistory(uid, maxResults = 10) {
    if (!uid) {
        const user = fire.auth().currentUser;
        if (user) uid = user.uid;
        else return [];
    }

    try {
        const db = fire.firestore();
        const snap = await db.collection('users').doc(uid).collection('loginHistory')
            .limit(maxResults)
            .get();

        const logs = [];
        snap.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));

        // Sort descending by timestamp in memory to avoid requiring complex composite index
        logs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

        return logs;
    } catch (err) {
        console.warn('Error fetching login history:', err);
        return [];
    }
}

// Send Twilio SMS Notification
export async function sendSmsNotification(toPhone, messageBody, _twilioOverride = null) {
    if (!toPhone || !messageBody) return { success: false, error: 'Phone number and message are required' };
    try {
        const payload = { toPhone, messageBody };
        const { response, data } = await fetchAdminWithReauth('/api/send-sms', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        return response.ok ? data : { success: false, error: data.error?.message || data.error || 'SMS request failed.' };
    } catch (err) {
        console.warn('Error sending SMS notification:', err);
        return { success: false, error: err.message };
    }
}

// Save Cover Letter to Cloud Storage
export async function saveCoverLetter(coverLetterData) {
    const user = fire.auth().currentUser;
    if (!user) return { success: false, error: 'User not logged in' };
    try {
        const db = fire.firestore();
        const id = coverLetterData.id || `cl_${Date.now()}`;
        const docRef = db.collection('users').doc(user.uid).collection('coverLetters').doc(id);
        await docRef.set({
            ...coverLetterData,
            id,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        return { success: true, id };
    } catch (err) {
        console.error('Error saving cover letter:', err);
        return { success: false, error: err.message };
    }
}

// Get All Cover Letters for Current User
export async function getUserCoverLetters() {
    const user = fire.auth().currentUser;
    if (!user) return [];
    try {
        const db = fire.firestore();
        const snapshot = await db.collection('users').doc(user.uid).collection('coverLetters').get();
        const letters = [];
        snapshot.forEach(doc => letters.push(doc.data()));
        return letters;
    } catch (err) {
        console.error('Error getting cover letters:', err);
        return [];
    }
}

// Delete Cover Letter from Cloud Storage
export async function deleteCoverLetter(coverLetterId) {
    const user = fire.auth().currentUser;
    if (!user) return { success: false, error: 'User not logged in' };
    try {
        const db = fire.firestore();
        await db.collection('users').doc(user.uid).collection('coverLetters').doc(coverLetterId).delete();
        return { success: true };
    } catch (err) {
        console.error('Error deleting cover letter:', err);
        return { success: false, error: err.message };
    }
}
export async function getStats() {
    var stats;
    const db = fire.firestore();
    const statsRef = db.collection('data').doc('stats');
    const snapshot = await statsRef.get();
    if (snapshot.exists) {
        stats = snapshot.data();
        return stats;
    }
}

// Set and update stats
export async function setStats(stats) {
    const db = fire.firestore();
    const statsRef = db.collection('data').doc('stats');
    try {
        await statsRef.set(stats);
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// Get frontend stats for landing pages
export async function getFrontendStats() {
    const currentUser = fire.auth().currentUser;
    try {
        const tokenResult = currentUser ? await currentUser.getIdTokenResult() : null;
        const role = String(tokenResult?.claims?.role || '').toUpperCase();
        if (['ADMIN', 'SUPER_ADMIN'].includes(role)) {
            const { response, data } = await fetchAdminWithReauth('/api/admin/landing-content');
            if (!response.ok) throw new Error(data.error?.message || data.error || 'Landing content is unavailable.');
            return data.content;
        }
    } catch (_) { /* public readers use the curated Firestore fallback below */ }
    const db = fire.firestore();
    const statsRef = db.collection('data').doc('frontendstats');
    const snapshot = await statsRef.get();
    if (snapshot.exists) {
        return snapshot.data();
    } else {
        // Return default stats if none exist
        const defaultStats = {
            activeJobs: '10,000+',
            rating: '4.8',
            partnerCompanies: '500+',
            successfulHires: '50,000+',
            featuredJobs: '2,500+',
            successRate: '95',
            topCompanies: '500+',
        };
        // Public readers cannot initialize configuration documents; deployment/admin
        // provisioning owns persistence and the UI can safely use these defaults.
        return defaultStats;
    }
}

// Set frontend stats for landing pages
export async function setFrontendStats(stats, expectedRevision = 0) {
    try {
        const { response, data: result } = await fetchAdminWithReauth('/api/admin/landing-content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: stats, expectedRevision }) });
        return response.ok && result.success ? result : { success: false, message: result.error || 'Unable to save landing content.', code: result.code };
    } catch (error) { return { success: false, message: error.message }; }
}
// Admin reads use the server API; public readers use the public read-only
// collection. A failed admin request is surfaced rather than silently returning
// an empty list.
export async function getAds() {
    const currentUser = fire.auth().currentUser;
    const tokenResult = currentUser ? await currentUser.getIdTokenResult().catch(() => null) : null;
    const role = String(tokenResult?.claims?.role || '').toUpperCase();
    if (['ADMIN', 'SUPER_ADMIN'].includes(role)) {
        const { response, data } = await fetchAdminWithReauth('/api/admin/ads');
        if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'Advertisements are unavailable.');
        return data.ads || [];
    }
    const snapshot = await fire.firestore().collection('ads').get();
    return snapshot.docs.map(document => ({ id: document.id, ...document.data(), revision: Number(document.data()?.revision || 0) }));
}

// ==================== BLOG MANAGEMENT FUNCTIONS ====================

// Create a new blog post
export async function createBlogPost(userId, postData) {
    const db = fire.firestore();
    try {
        const postRef = db.collection('blog_posts').doc();
        if (!blogPostFitsFirestore(postData)) return { success: false, error: 'Post is too large to save.' };
        const normalized = normalizeBlogPost(postData);
        if (!normalized.title) return { success: false, error: 'Post title is required.' };
        // A document-derived suffix avoids a collection-wide uniqueness query that members
        // are not authorized to run against other authors' pending posts.
        const slugSuffix = `-${postRef.id.slice(0, 8).toLowerCase()}`;
        const slugBase = (generateSlug(postData.slug || normalized.title) || 'article').slice(0, 180 - slugSuffix.length);
        const slug = `${slugBase}${slugSuffix}`;

        const finalPostData = {
            title: normalized.title,
            slug: slug,
            content: normalized.content,
            excerpt: normalized.excerpt || generateExcerpt(normalized.content),
            categoryId: normalized.categoryId,
            authorUid: userId,
            status: normalized.status === 'pending' ? 'pending' : 'draft',
            revision: 1,
            seoTitle: normalized.seoTitle || normalized.title,
            seoDescription: normalized.seoDescription || normalized.excerpt || generateExcerpt(normalized.content),
            createdAt: new Date(),
            updatedAt: new Date(),
            publishedAt: null,
            viewCount: 0,
            tags: normalized.tags || [],
            featuredImage: normalized.featuredImage || null,
        };

        await postRef.set(finalPostData);

        return { success: true, postId: postRef.id, slug, revision: 1, status: finalPostData.status };
    } catch (error) {
        console.error('❌ Error creating blog post:', error);
        return { success: false, error: error.message };
    }
}

// Update a blog post
export async function updateBlogPost(postId, updateData, userId = null, expectedRevision = null) {
    if (!userId) {
        try {
            const { response, data: result } = await fetchAdminWithReauth(`/api/admin/blog/posts/${encodeURIComponent(postId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: updateData.status, scheduledAt: updateData.scheduledAt || null, expectedRevision }) });
            return response.ok && result.success ? result : { success: false, error: result.error?.message || result.error || 'Unable to moderate post.', code: result.code };
        } catch (error) { return { success: false, error: error.message }; }
    }
    const db = fire.firestore();
    try {
        if (!blogPostFitsFirestore(updateData)) return { success: false, error: 'Post update is too large to save.' };
        const reference = db.collection('blog_posts').doc(postId);
        if (!userId && updateData.slug) {
            const candidateSlug = generateSlug(updateData.slug).slice(0, 180);
            if (!candidateSlug) return { success: false, error: 'A valid post slug is required.' };
            const duplicates = await db.collection('blog_posts').where('slug', '==', candidateSlug).get();
            if (duplicates.docs.some(document => document.id !== postId)) return { success: false, error: 'A post with this slug already exists.' };
            updateData = { ...updateData, slug: candidateSlug };
        } else if (!userId && ['approved', 'scheduled'].includes(updateData.status)) {
            const currentSnapshot = await reference.get();
            if (!currentSnapshot.exists) return { success: false, error: 'Blog post not found.' };
            const currentSlug = currentSnapshot.data()?.slug;
            if (currentSlug) {
                const duplicates = await db.collection('blog_posts').where('slug', '==', currentSlug).get();
                if (duplicates.docs.some(document => document.id !== postId)) {
                    const suffix = `-${postId.toLowerCase()}`;
                    updateData = { ...updateData, slug: `${generateSlug(currentSlug).slice(0, 180 - suffix.length)}${suffix}` };
                }
            }
        }
        const allowedMemberFields = ['title', 'content', 'excerpt', 'categoryId', 'tags', 'featuredImage', 'seoTitle', 'seoDescription'];
        let result;
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists) throw new Error('Post not found.');
            const existing = snapshot.data() || {};
            const currentRevision = Number(existing.revision) || 0;
            if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== currentRevision) {
                const conflict = new Error('This post changed in another tab or device.');
                conflict.code = 'BLOG_CONFLICT';
                conflict.remoteRevision = currentRevision;
                conflict.remoteStatus = existing.status;
                throw conflict;
            }
            let changes = { ...updateData };
            if (userId) {
                if (existing.authorUid !== userId) throw new Error('Post not found or access denied.');
                if (existing.status === 'approved') throw new Error('Published posts must be revised through the moderation workflow.');
                if (!blogPostFitsFirestore(changes)) throw new Error('Post is too large to save.');
                const normalized = normalizeBlogPost(changes);
                changes = Object.fromEntries(allowedMemberFields.filter(key => Object.hasOwn(updateData, key)).map(key => [key, normalized[key]]));
                changes.status = updateData.status === 'pending' ? 'pending' : 'draft';
            } else {
                const statuses = ['draft', 'pending', 'approved', 'rejected', 'scheduled'];
                if (changes.status && !statuses.includes(changes.status)) throw new Error('Invalid post status.');
                if (changes.slug) changes.slug = generateSlug(changes.slug) || existing.slug;
                if (['approved', 'scheduled'].includes(changes.status)) changes.featuredImage = normalizeBlogPost(existing).featuredImage || null;
                if (changes.status === 'approved' && existing.status !== 'approved') changes.publishedAt = new Date();
                if (changes.status !== 'scheduled') changes.scheduledAt = null;
            }
            const revision = currentRevision + 1;
            changes = { ...changes, authorUid: existing.authorUid, revision, updatedAt: new Date() };
            transaction.update(reference, changes);
            result = { success: true, revision, status: changes.status || existing.status };
        });
        return result;
    } catch (error) {
        console.error('Error updating blog post:', error);
        return { success: false, error: error.message, code: error.code, remoteRevision: error.remoteRevision, remoteStatus: error.remoteStatus };
    }
}

// Fetch one author-owned post without scanning the user's full CMS history.
export async function getBlogPostByIdForAuthor(postId, userId) {
    try {
        const snapshot = await fire.firestore().collection('blog_posts').doc(postId).get();
        if (!snapshot.exists || snapshot.data()?.authorUid !== userId) return { success: false, error: 'Post not found or access denied.' };
        const data = snapshot.data();
        return { success: true, post: {
            id: snapshot.id, ...data,
            createdAt: data.createdAt?.toDate?.() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
            publishedAt: data.publishedAt?.toDate?.() || data.publishedAt,
            scheduledAt: data.scheduledAt?.toDate?.() || data.scheduledAt,
        } };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Get blog post by slug
export async function getBlogPostBySlug(slug, includeUnpublished = false) {
    const db = fire.firestore();
    try {
        
        let query = db.collection('blog_posts').where('slug', '==', slug);
        
        if (!includeUnpublished) {
            query = query.where('status', '==', 'approved');
        }
        
        const snapshot = await query.get();
        
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data();
            
            
            const post = {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || data.createdAt,
                updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
                publishedAt: data.publishedAt?.toDate?.() || data.publishedAt,
            };
            
            // View analytics are deliberately best-effort and must never determine whether
            // a public article can be read. Client-side writes are forbidden by Firestore rules.
            return post;
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error getting blog post by slug:', error);
        throw error;
    }
}

// Simple function to get user posts without ordering (avoids composite index)
export async function getUserBlogPosts(authorUid, options = {}) {
    const db = fire.firestore();
    try {
        const {
            status = 'all',
            limit = 50
        } = options;

        
        let query = db.collection('blog_posts').where('authorUid', '==', authorUid);
        
        // Apply status filter if specified
        if (status && status !== 'all') {
            query = query.where('status', '==', status);
        }
        
        // Limit results
        if (limit) {
            query = query.limit(limit);
        }
        
        const snapshot = await query.get();
        
        const posts = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            posts.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || data.createdAt,
                updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
                publishedAt: data.publishedAt?.toDate?.() || data.publishedAt,
            });
        });
        
        // Sort in memory by createdAt descending
        posts.sort((a, b) => {
            const aTime = a.createdAt?.getTime() || 0;
            const bTime = b.createdAt?.getTime() || 0;
            return bTime - aTime;
        });
        
        
        return {
            success: true,
            posts: posts
        };
    } catch (error) {
        console.error('❌ Error listing user blog posts:', error);
        return { success: false, error: error.message, posts: [] };
    }
}

// List blog posts with filtering and pagination
export async function listBlogPosts(options = {}) {
    const currentUser = fire.auth().currentUser;
    try {
        const tokenResult = currentUser ? await currentUser.getIdTokenResult() : null;
        const role = String(tokenResult?.claims?.role || '').toUpperCase();
        if (['ADMIN', 'SUPER_ADMIN'].includes(role)) {
            const params = new URLSearchParams();
            if (options.status && options.status !== 'all') params.set('status', options.status);
            if (options.categoryId) params.set('categoryId', options.categoryId);
            if (options.search) params.set('search', options.search);
            params.set('page', String(options.page || 1));
            params.set('limit', String(options.limit || 10));
            const { response, data } = await fetchAdminWithReauth(`/api/admin/blog/posts?${params}`);
            if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'Blog posts are unavailable.');
            return data;
        }
    } catch (error) {
        if (currentUser) console.warn('Admin blog API unavailable:', error.message);
    }
    const db = fire.firestore();
    try {
        const {
            status = 'approved',
            categoryId = null,
            authorUid = null,
            limit = 10,
            page = 1,
            orderBy = 'createdAt',
            orderDirection = 'desc',
            includeStats = false
        } = options;

        
        let query = db.collection('blog_posts');
        
        // Apply filters
        if (status && status !== 'all') {
            query = query.where('status', '==', status);
        }
        
        if (categoryId) {
            query = query.where('categoryId', '==', categoryId);
        }
        
        if (authorUid) {
            query = query.where('authorUid', '==', authorUid);
        }
        
        // Don't apply any orderBy to avoid composite index issues
        // We'll sort everything in memory after fetching
        
        // Simple approach: get all matching documents and paginate in memory
        // This works well for admin interfaces with reasonable data sizes
        const allSnapshot = await query.get();
        const totalCount = allSnapshot.size;
        
        // Convert all documents to posts
        const allPosts = [];
        allSnapshot.forEach((doc) => {
            const data = doc.data();
            allPosts.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || data.createdAt,
                updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
                publishedAt: data.publishedAt?.toDate?.() || data.publishedAt,
            });
        });
        
        // Sort in memory to avoid any composite index issues
        allPosts.sort((a, b) => {
            let aTime, bTime;
            
            if (orderBy === 'publishedAt') {
                aTime = a.publishedAt?.getTime() || a.createdAt?.getTime() || 0;
                bTime = b.publishedAt?.getTime() || b.createdAt?.getTime() || 0;
            } else if (orderBy === 'updatedAt') {
                aTime = a.updatedAt?.getTime() || a.createdAt?.getTime() || 0;
                bTime = b.updatedAt?.getTime() || b.createdAt?.getTime() || 0;
            } else {
                // Default to createdAt
                aTime = a.createdAt?.getTime() || 0;
                bTime = b.createdAt?.getTime() || 0;
            }
            
            return orderDirection === 'desc' ? bTime - aTime : aTime - bTime;
        });
        
        // Apply pagination in memory
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const posts = allPosts.slice(startIndex, endIndex);
        
        const totalPages = Math.ceil(totalCount / limit);
        
        
        const result = {
            success: true,
            posts: posts,
            pagination: {
                totalCount,
                totalPages,
                currentPage: page,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
                limit
            }
        };
        
        if (includeStats) {
            const statsSnapshot = await db.collection('blog_posts').get();
            const stats = {
                total: 0,
                draft: 0,
                approved: 0,
                pending: 0,
                rejected: 0,
                scheduled: 0,
            };
            
            statsSnapshot.forEach((doc) => {
                const data = doc.data();
                stats.total++;
                stats[data.status] = (stats[data.status] || 0) + 1;
            });
            
            result.stats = stats;
        }
        
        return result;
    } catch (error) {
        console.error('❌ Error listing blog posts:', error);
        return { success: false, error: error.message };
    }
}

// Delete a blog post
export async function deleteBlogPost(postId, userId = null, expectedRevision = null) {
    if (!userId) {
        try {
            const { response, data: result } = await fetchAdminWithReauth(`/api/admin/blog/posts/${encodeURIComponent(postId)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }) });
            return response.ok && result.success ? result : { success: false, error: result.error?.message || result.error || 'Unable to delete post.', code: result.code };
        } catch (error) { return { success: false, error: error.message }; }
    }
    const db = fire.firestore();
    try {
        const reference = db.collection('blog_posts').doc(postId);
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists) throw new Error('Post not found.');
            const existing = snapshot.data() || {};
            if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== (Number(existing.revision) || 0)) {
                const conflict = new Error('This post changed before deletion. Reload and confirm again.');
                conflict.code = 'BLOG_CONFLICT';
                throw conflict;
            }
            if (userId && (existing.authorUid !== userId || existing.status === 'approved' || existing.status === 'scheduled')) {
                throw new Error('Only private drafts or review submissions can be deleted by their author.');
            }
            transaction.delete(reference);
        });
        return { success: true };
    } catch (error) {
        console.error('Error deleting blog post:', error);
        return { success: false, error: error.message, code: error.code };
    }
}

// ==================== BLOG CATEGORIES FUNCTIONS ====================

// Create a new blog category
export async function createBlogCategory(categoryData) {
    try {
        const { response, data } = await fetchAdminWithReauth('/api/admin/blog/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(categoryData) });
        return response.ok && data.success ? data : { success: false, error: data.error?.message || data.error || 'Unable to create category.', code: data.code };
    } catch (error) { return { success: false, error: error.message }; }
}

// List blog categories. Admin editors use the authenticated API; public readers
// retain the public Firestore read path.
export async function listBlogCategories() {
    const currentUser = fire.auth().currentUser;
    const tokenResult = currentUser ? await currentUser.getIdTokenResult().catch(() => null) : null;
    const role = String(tokenResult?.claims?.role || '').toUpperCase();
    if (['ADMIN', 'SUPER_ADMIN'].includes(role)) {
        const { response, data } = await fetchAdminWithReauth('/api/admin/blog/categories');
        if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'Blog categories are unavailable.');
        return data.categories || [];
    }
    const db = fire.firestore();
    try {
        const snapshot = await db.collection('blog_categories').orderBy('name', 'asc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt, updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt }));
    } catch (error) {
        console.error('❌ Error listing blog categories:', error);
        return [];
    }
}

// Update a blog category
export async function updateBlogCategory(categoryId, updateData, expectedRevision = 0) {
    try {
        const { response, data } = await fetchAdminWithReauth(`/api/admin/blog/categories/${encodeURIComponent(categoryId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...updateData, expectedRevision }) });
        return response.ok && data.success ? data : { success: false, error: data.error?.message || data.error || 'Unable to update category.', code: data.code };
    } catch (error) { return { success: false, error: error.message }; }
}

// Delete a category only when no posts reference it.
export async function deleteBlogCategory(categoryId, expectedRevision = 0) {
    try {
        const { response, data } = await fetchAdminWithReauth(`/api/admin/blog/categories/${encodeURIComponent(categoryId)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }) });
        return response.ok && data.success ? data : { success: false, error: data.error?.message || data.error || 'Unable to delete category.', code: data.code };
    } catch (error) { return { success: false, error: error.message }; }
}

// ==================== BLOG SETTINGS FUNCTIONS ====================

// Get public blog settings. They intentionally live in the curated public_config
// document rather than an account-local cache or a privileged settings document.
const DEFAULT_BLOG_SETTINGS = Object.freeze({
    blogTitle: 'Blog',
    blogDescription: 'Latest news and articles',
    postsPerPage: 10,
    enableComments: false,
    moderateComments: true,
    allowGuestPosts: true,
    featuredImage: null,
    seoTitle: 'Blog',
    seoDescription: 'Read our latest blog posts and articles',
});

export async function getBlogSettings() {
    const db = fire.firestore();
    try {
        const doc = await db.collection('data').doc('public_config').get();
        const settings = doc.exists && doc.data()?.blog && typeof doc.data().blog === 'object' ? doc.data().blog : {};
        return { ...DEFAULT_BLOG_SETTINGS, ...settings };
    } catch (error) {
        console.warn('Unable to load blog settings; using defaults', error);
        return { ...DEFAULT_BLOG_SETTINGS };
    }
}

export async function updateBlogSettings(settings) {
    try {
        const clean = {
            blogTitle: String(settings?.blogTitle || DEFAULT_BLOG_SETTINGS.blogTitle).slice(0, 120),
            blogDescription: String(settings?.blogDescription || DEFAULT_BLOG_SETTINGS.blogDescription).slice(0, 500),
            postsPerPage: Math.min(50, Math.max(1, Number(settings?.postsPerPage) || DEFAULT_BLOG_SETTINGS.postsPerPage)),
            enableComments: Boolean(settings?.enableComments),
            moderateComments: settings?.moderateComments !== false,
            allowGuestPosts: settings?.allowGuestPosts !== false,
            featuredImage: settings?.featuredImage ? String(settings.featuredImage).slice(0, 2048) : null,
            seoTitle: String(settings?.seoTitle || settings?.blogTitle || DEFAULT_BLOG_SETTINGS.seoTitle).slice(0, 120),
            seoDescription: String(settings?.seoDescription || settings?.blogDescription || DEFAULT_BLOG_SETTINGS.seoDescription).slice(0, 320),
        };
        return await saveSystemSettings('blog', clean);
    } catch (error) {
        console.error('Error updating blog settings:', error);
        return { success: false, error: error.message };
    }
}

// ==================== HELPER FUNCTIONS ====================

// Generate URL-friendly slug from title
function generateSlug(title) {
    return String(title || '')
        .normalize('NFKC')
        .toLocaleLowerCase('en')
        .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 120);
}

// Generate excerpt from content
function generateExcerpt(content, maxLength = 160) {
    if (!content) return '';
    
    // Remove HTML tags and markdown syntax
    const plainText = content
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[#*_`]/g, '') // Remove common markdown syntax
        .replace(/\n/g, ' ') // Replace newlines with spaces
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim();
    
    if (plainText.length <= maxLength) {
        return plainText;
    }
    
    return plainText.substring(0, maxLength).replace(/\s+\w*$/, '') + '...';
}

function ownNotificationQuery(userId) {
    const user = fire.auth().currentUser;
    if (!user || user.uid !== userId) throw new Error('Notification account changed.');
    return fire.firestore().collection('notifications').doc(userId).collection('userNotifications').where('read', '==', false);
}

export async function getUnreadNotifications(userId) {
    const snapshot = await ownNotificationQuery(userId).get();
    return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

export function subscribeUnreadNotifications(userId, callback, errorCallback = () => {}) {
    let active = true;
    const query = ownNotificationQuery(userId);
    const unsubscribe = query.onSnapshot(snapshot => {
        if (!active || fire.auth().currentUser?.uid !== userId) return;
        callback(snapshot.docs.map(document => ({ id: document.id, ...document.data() })));
    }, error => {
        if (active && fire.auth().currentUser?.uid === userId) errorCallback(error);
    });
    return () => { active = false; unsubscribe(); };
}

export async function markNotificationAsRead(userId, notificationId) {
    const user = fire.auth().currentUser;
    if (!user || user.uid !== userId || !/^[A-Za-z0-9_-]{1,128}$/.test(String(notificationId || ''))) return { success: false, error: 'Notification account changed.' };
    try {
        await fire.firestore().collection('notifications').doc(userId).collection('userNotifications').doc(notificationId).update({ read: true, updatedAt: new Date() });
        return { success: true };
    } catch (error) { return { success: false, error: error.message }; }
}

//  add Ads
export async function addAds(link, name, destinationLink) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/ads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageLink: link, name, destinationLink }),
    });
    return response.ok && data.success ? data : { success: false, error: data.error?.message || data.error || 'Unable to create advertisement.', code: data.code };
}
// Get pages
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

// Get  page by name
export async function getPageByName(name) {
    const db = fire.firestore();
    const snapshot = await db.collection('pages').doc(name).get();
    if (snapshot.exists) return snapshot.data();
    return null;
}

export async function getAdminPages() {
    const { response, data } = await fetchAdminWithReauth('/api/admin/pages');
    if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'Unable to load custom pages.');
    return data.pages || [];
}

export async function removePageByName(name, expectedRevision = 0) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/pages/${encodeURIComponent(name)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }),
    });
    return response.ok && data.success ? data : { success: false, error: data.error?.message || data.error || 'Unable to delete page.', code: data.code };
}

export async function addPages(pagename, pagecontent, options = {}) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/pages/${encodeURIComponent(pagename)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagecontent, title: options.title || pagename, description: options.description || '', status: options.status || 'published', expectedRevision: Number(options.expectedRevision || 0) }),
    });
    return response.ok && data.success ? data : { success: false, error: data.error?.message || data.error || 'Unable to save page.', code: data.code };
}

export async function getEarnings() {
    const db = fire.firestore();
    const snapshot = await db.collection('data').doc('earnings').get();
    if (snapshot.exists) {
        return snapshot.data();
    } else {
        return null;
    }
}

// Remove add
export async function removeAd(id, expectedRevision = 0) {
    const { response, data } = await fetchAdminWithReauth(`/api/admin/ads/${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }),
    });
    return response.ok && data.success ? data : { success: false, error: data.error?.message || data.error || 'Unable to delete advertisement.', code: data.code };
}

// Get  website details
export async function getWebsiteDetails() {
    const db = fire.firestore();
    const snapshot = await db.collection('data').doc('details').get();
    if (snapshot.exists) {
        return snapshot.data();
    } else {
        return null;
    }
}

// Get  website details
export async function getSocialLinks() {
    const db = fire.firestore();
    const snapshot = await db.collection('data').doc('social').get();
    if (snapshot.exists) {
        return snapshot.data();
    } else {
        return null;
    }
}
export async function addSocial(facebook, twitter, instagram, youtube, pinterest) {
    const db = fire.firestore();
    db.collection('data')
        .doc('social')
        .set({
            facebook: facebook,
            twitter: twitter,
            instagram: instagram,
            youtube: youtube,
            pinterest: pinterest,
        })
}

export async function addDetails(websitename, websitedescription) {
    const db = fire.firestore();
    db.collection('data')
        .doc('details')
        .set({
            websiteName: websitename,
            websitedescription: websitedescription,
        })
}
export async function getResumes(userId, page = 1, itemsPerPage = 5) {
    const db = fire.firestore();
    const userRef = db.collection('users').doc(userId).collection('resumes');

    // Get total count first for pagination metadata
    const countSnapshot = await userRef.get();
    const totalItems = countSnapshot.size;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    // The count read already contains every owner document. Reuse it so legacy resumes
    // without created_at are not excluded by Firestore orderBy and avoid a duplicate page read.
    const sortedDocuments = [...countSnapshot.docs].sort((left, right) => {
        const leftData = left.data() || {};
        const rightData = right.data() || {};
        const leftTime = leftData.updatedAt?.toMillis?.() || leftData.created_at?.toMillis?.() || 0;
        const rightTime = rightData.updatedAt?.toMillis?.() || rightData.created_at?.toMillis?.() || 0;
        return rightTime - leftTime || left.id.localeCompare(right.id);
    });
    const startIndex = Math.max(0, (page - 1) * itemsPerPage);
    const pageDocuments = sortedDocuments.slice(startIndex, startIndex + itemsPerPage);
    const paginatedSnapshot = {
        empty: pageDocuments.length === 0,
        forEach(callback) { pageDocuments.forEach(callback); },
    };

    // Handle empty results case
    if (paginatedSnapshot.empty) {
        return {
            resumes: [],
            pagination: {
                totalItems,
                totalPages,
                currentPage: page,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        };
    }

    // Create resumes array with a unique object for each resume
    const resumes = [];
    paginatedSnapshot.forEach((doc) => {
        // Create a NEW object for each resume to avoid reference issues
        const stored = doc.data() || {};
        const isCanonical = Number(stored.revision) > 0 || ['employments', 'educations', 'skills', 'languages'].some(key => Array.isArray(stored[key]));
        const resume = {
            id: doc.id,
            template: stored.template,
            item: stored,
            employments: isCanonical && Array.isArray(stored.employments) ? stored.employments : [],
            educations: isCanonical && Array.isArray(stored.educations) ? stored.educations : [],
            languages: isCanonical && Array.isArray(stored.languages) ? stored.languages : [],
            skills: isCanonical && Array.isArray(stored.skills) ? stored.skills : [],
            isNewStyle: isCanonical,
        };
        resumes.push(resume);
    });

    // Pull from global pb collection for new-style flat resume objects
    for (let index = 0; index < resumes.length; index++) {
        if (resumes[index].isNewStyle) continue;
        try {
            const pbDoc = await db.collection('pb').doc(resumes[index].id).get();
            if (pbDoc.exists && pbDoc.data().object) {
                const parsed = JSON.parse(pbDoc.data().object);
                resumes[index].item = {
                    ...resumes[index].item,
                    ...parsed
                };
                resumes[index].employments = parsed.employments || [];
                resumes[index].educations = parsed.educations || [];
                resumes[index].skills = parsed.skills || [];
                resumes[index].languages = parsed.languages || [];
                resumes[index].languages = parsed.languages || [];
                resumes[index].isNewStyle = true;
            }
        } catch (pbErr) {
            console.warn('Error loading resume from pb collection:', pbErr);
        }
    }

    ////////////////////// After getting all resumes we loop throu each resume Id  and get the emploments
    for (let index = 0; index < resumes.length; index++) {
        if (resumes[index].isNewStyle) continue;
        let employmentIndex = 0;
        const employmentRef = db.collection('users').doc(userId).collection('resumes').doc(resumes[index].id).collection('employments'); // Getting all employments inside the resume
        const employmentSnapshot = await employmentRef.get();
        if (!employmentSnapshot.empty) {
            // Looping throu resumes if found
            employmentSnapshot.forEach((value) => {
                // assigning data into our resumes[using the index of the target resume] array
                resumes[index].employments[employmentIndex] = value.data();
                resumes[index].employments[employmentIndex].employmentId = value.id;
                employmentIndex++;
            });
        }
    }

    ////////////////////// After getting all resumes we loop throu each resume Id  and get the eductions
    for (let index = 0; index < resumes.length; index++) {
        if (resumes[index].isNewStyle) continue;
        let educationIndex = 0;
        const educationRef = db.collection('users').doc(userId).collection('resumes').doc(resumes[index].id).collection('educations'); // Getting all employments inside the resume
        const educationSnapshot = await educationRef.get();
        if (!educationSnapshot.empty) {
            // Looping throu resumes if found
            educationSnapshot.forEach((value) => {
                // assigning data into our resumes[using the index of the target resume] array
                resumes[index].educations[educationIndex] = value.data();
                resumes[index].educations[educationIndex].educationId = value.id;
                educationIndex++;
            });
        }
    }
    ////////////////////// After getting all resumes we loop throu each resume Id  and get the eductions
    for (let index = 0; index < resumes.length; index++) {
        if (resumes[index].isNewStyle) continue;
        let skillIndex = 0;
        const skillRef = db.collection('users').doc(userId).collection('resumes').doc(resumes[index].id).collection('skills'); // Getting all employments inside the resume
        const skillSnapshot = await skillRef.get();
        if (!skillSnapshot.empty) {
            // Looping throu resumes if found
            skillSnapshot.forEach((value) => {
                // assigning data into our resumes[using the index of the target resume] array
                resumes[index].skills[skillIndex] = value.data();
                resumes[index].skills[skillIndex].skillId = value.id;
                skillIndex++;
            });
        }
    }

    ////////////////////// After getting all resumes we loop throu each resume Id  and get the eductions
    for (let index = 0; index < resumes.length; index++) {
        if (resumes[index].isNewStyle) continue;
        let languageIndex = 0;
        const skillRef = db.collection('users').doc(userId).collection('resumes').doc(resumes[index].id).collection('languages'); // Getting all employments inside the resume
        const skillSnapshot = await skillRef.get();
        if (!skillSnapshot.empty) {
            // Looping throu resumes if found
            skillSnapshot.forEach((value) => {
                // assigning data into our resumes[using the index of the target resume] array
                resumes[index].languages[languageIndex] = value.data();
                resumes[index].languages[languageIndex].skillId = value.id;
                languageIndex++;
            });
        }
    }
    return {
        resumes,
        pagination: {
            totalItems,
            totalPages: Math.ceil(totalItems / itemsPerPage),
            currentPage: page,
            hasNextPage: page * itemsPerPage < totalItems,
            hasPreviousPage: page > 1,
        },
    };
}

// function that id of a document to favourites collection of the user
// returns true if the document is added to favourites
export async function addToFavourites(userId, documentId) {
    const db = fire.firestore();
    db.collection('users')
        .doc(userId)
        .collection('favourites')
        .doc(documentId)
        .set({
            documentId: documentId,
        })
    return true;
}

// function that check if a document is in favourites collection of the user
// if it is already in favourites remove it from favourites
// if it is not in favourites add it to favourites
export async function checkIfInFavourites(userId, documentId) {
    const db = fire.firestore();
    const docRef = db.collection('users').doc(userId).collection('favourites').doc(documentId);
    const doc = await docRef.get();
    if (!doc.exists) {
        await addToFavourites(userId, documentId);
        return true;
    } else {
        await removeFromFavourites(userId, documentId);
        return false;
    }
}

export async function removeFromFavourites(userId, documentId) {
    const db = fire.firestore();
    db.collection('users')
        .doc(userId)
        .collection('favourites')
        .doc(documentId)
        .delete()
    return true;
}

// get all favourites and set documentID in array
export async function getFavourites(userId) {
    const db = fire.firestore();
    const favouritesRef = db.collection('users').doc(userId).collection('favourites');
    const favouritesSnapshot = await favouritesRef.get();
    var favourites = [];
    if (!favouritesSnapshot.empty) {
        favouritesSnapshot.forEach((value) => {
            favourites.push(value.data().documentId);
        });
    }
    return favourites;
}

// Get job favourites for a user
export async function getJobFavourites(userId) {
    const db = fire.firestore();
    const favouritesRef = db.collection('users').doc(userId).collection('favourites');
    const favouritesSnapshot = await favouritesRef.get();
    var jobFavourites = [];
    if (!favouritesSnapshot.empty) {
        favouritesSnapshot.forEach((value) => {
            const docId = value.data().documentId;
            // Job IDs are typically longer than resume IDs (which are <= 9 chars)
            // This is a simple heuristic - you might want to add a 'type' field instead
            if (docId && docId.length > 15) {
                jobFavourites.push(docId);
            }
        });
    }
    return jobFavourites;
}

// Toggle job favourite status
export async function toggleJobFavourite(userId, jobId) {
    const db = fire.firestore();
    const docRef = db.collection('users').doc(userId).collection('favourites').doc(jobId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
        // Add to favourites
        await docRef.set({
            documentId: jobId,
            type: 'job',
            addedAt: new Date()
        });
        return true; // Added
    } else {
        // Remove from favourites
        await docRef.delete();
        return false; // Removed
    }
}

// Check if a job is in user's favourites
export async function isJobInFavourites(userId, jobId) {
    const db = fire.firestore();
    const docRef = db.collection('users').doc(userId).collection('favourites').doc(jobId);
    const doc = await docRef.get();
    return doc.exists;
}

// get cover by id
export async function getCoverById(userId, coverId) {
    const db = fire.firestore();
    const coverRef = db.collection('users').doc(userId).collection('covers').doc(coverId);
    const coverSnapshot = await coverRef.get();
    var cover = coverSnapshot.data();
    cover.coverId = coverId;
    return cover;
}

//  get covers function same as get resumes
export async function getCovers(userId) {
    var cover = {};
    var covers = [];
    var i = 0;
    const db = fire.firestore();
    const userRef = db.collection('users').doc(userId).collection('covers').limit(3);
    const snapshot = await userRef.get();
    if (snapshot.empty) {
        return;
    }
    snapshot.forEach((doc) => {
        cover.id = doc.id; // this is resume Id
        cover.template = doc.data().template;
        cover.item = doc.data();
        cover.employments = [];
        cover.educations = [];
        cover.languages = [];
        cover.skills = [];
        covers[i] = cover;
        cover = {};
        i++;
    });

    // return
    return covers;
}

// adding employments
export async function addEmployments(userId, resumeId, employmentsToAdd) {
    // getting all employments ids first
    var employmentsIds = [];
    var employmentIndex = 0;
    const db = fire.firestore();
    const employmentRef = db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('employments'); // Getting all employments inside the resume
    const employmentSnapshot = await employmentRef.get();
    if (!employmentSnapshot.empty) {
        employmentSnapshot.forEach((value) => {
            employmentsIds[employmentIndex] = value.id;
            employmentIndex++;
        });
    }
    // Now we have the ids we can loop throu them and delete them to add new ones
    employmentsIds.forEach((value) => {
        db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('employments').doc(value).delete();
    });
    // Adding the new employments
    for (let index = 0; index < employmentsToAdd.length; index++) {
        const employmentRef = db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('employments');
        if (employmentsToAdd[index] !== null) {
            await employmentRef.add({
                  id: employmentsToAdd[index].id,
                  date: employmentsToAdd[index].date,
                  jobTitle: employmentsToAdd[index].jobTitle,
                  employer: employmentsToAdd[index].employer,
                  begin: employmentsToAdd[index].begin,
                  end: employmentsToAdd[index].end,
                  description: employmentsToAdd[index].description,
              });
        }
    }
}
// adding Educations
export async function addEducations(userId, resumeId, educatiionsToAdd) {
    // getting all employments ids first
    var educationsIds = [];
    var educationIndex = 0;
    const db = fire.firestore();
    const educationRef = db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('educations'); // Getting all employments inside the resume
    const educationSnapshot = await educationRef.get();
    if (!educationSnapshot.empty) {
        educationSnapshot.forEach((value) => {
            educationsIds[educationIndex] = value.id;
            educationIndex++;
        });
    }
    // Now we have the ids we can loop throu them and delete them to add new ones
    educationsIds.forEach((value) => {
        db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('educations').doc(value).delete();
    });
    // Adding the new employments
    for (let index = 0; index < educatiionsToAdd.length; index++) {
        const educationRef = db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('educations');
        if (educatiionsToAdd[index] !== null) {
            await educationRef.add({
                  id: educatiionsToAdd[index].id,
                  date: educatiionsToAdd[index].date,

                  school: educatiionsToAdd[index].school,
                  started: educatiionsToAdd[index].started,
                  finished: educatiionsToAdd[index].finished,
                  degree: educatiionsToAdd[index].degree,
                  description: educatiionsToAdd[index].description,
              });
        }
    }
}
// adding Educations
export async function addSkills(userId, resumeId, skillsToAdd) {
    // getting all employments ids first
    var skillsIds = [];
    var skillIndex = 0;
    const db = fire.firestore();
    const skillRef = db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('skills'); // Getting all employments inside the resume
    const skillSnapshot = await skillRef.get();
    if (!skillSnapshot.empty) {
        skillSnapshot.forEach((value) => {
            skillsIds[skillIndex] = value.id;
            skillIndex++;
        });
    }

    // Now we have the ids we can loop throu them and delete them to add new ones
    skillsIds.forEach((value) => {
        db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('skills').doc(value).delete();
    });
    // Adding the new employments
    var res;
    for (let index = 0; index < skillsToAdd.length; index++) {
        const skillRef = db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('skills');
        res = await skillRef.add({
            id: skillsToAdd[index].id,
            date: skillsToAdd[index].date,
            name: skillsToAdd[index].name,
            rating: skillsToAdd[index].rating,
        });
    }
}
/// Add Languages

export async function addLanguages(userId, resumeId, languagesToAdd) {
    // getting all employments ids first
    var skillsIds = [];
    var skillIndex = 0;
    const db = fire.firestore();
    const skillRef = db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('languages'); // Getting all employments inside the resume
    const skillSnapshot = await skillRef.get();
    if (!skillSnapshot.empty) {
        skillSnapshot.forEach((value) => {
            skillsIds[skillIndex] = value.id;
            skillIndex++;
        });
    }

    // Now we have the ids we can loop throu them and delete them to add new ones
    skillsIds.forEach((value) => {
        db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('languages').doc(value).delete();
    });
    // Adding the new employments
    var res;
    for (let index = 0; index < languagesToAdd.length; index++) {
        const skillRef = db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('languages');
        res = await skillRef.add({
            id: languagesToAdd[index].id,
            name: languagesToAdd[index].name,
            date: languagesToAdd[index].date,
            level: languagesToAdd[index].level,
        });
    }
}

export async function InitialisationCheck() {
    // Administrative bootstrap is intentionally out-of-band. A public client must never
    // infer initialization state or create the first privileged identity.
    return 'SERVER_MANAGED';
}

export async function getResumeById(userId, resumeId) {
    const db = fire.firestore();
    var resume;
    var resumeRef = await db.collection('users').doc(userId).collection('resumes').doc(resumeId).get();
    if (resumeRef.exists) {
        resume = resumeRef.data();
    } else {
        return null;
    }

    var empRef = await db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('employments').get();
    if (!empRef.empty) {
        resume.employments = [];
        for (let index = 0; index < empRef.docs.length; index++) {
            resume.employments[index] = empRef.docs[index].data();
        }
    } else {
        resume.employments = [];
    }

    var skillsRef = await db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('skills').get();
    if (!skillsRef.empty) {
        resume.skills = [];
        for (let index = 0; index < skillsRef.docs.length; index++) {
            resume.skills[index] = skillsRef.docs[index].data();
        }
    } else {
        resume.skills = [];
    }

    var educationsRef = await db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('educations').get();
    if (!educationsRef.empty) {
        resume.educations = [];
        for (let index = 0; index < educationsRef.docs.length; index++) {
            resume.educations[index] = educationsRef.docs[index].data();
        }
    } else {
        resume.educations = [];
    }

    var languagesRef = await db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('languages').get();
    if (!languagesRef.empty) {
        resume.languages = [];
        for (let index = 0; index < languagesRef.docs.length; index++) {
            resume.languages[index] = languagesRef.docs[index].data();
        }
    } else {
        resume.languages = [];
    }
    return resume;
}

export async function getJsonById(resumeId) {
    const db = fire.firestore();
    const JsonSnapshot = await db.collection('pb').doc(resumeId).get();
    if (JsonSnapshot.exists) {
        return JSON.parse(JsonSnapshot.data().object);
    } else {
        return null;
    }
}

export async function setJsonPb(resumeId, resumeObject) {
    const db = fire.firestore();
    const ownerUid = fire.auth().currentUser?.uid;
    if (!ownerUid) throw new Error('Authentication is required');
    const objectToSave = { ...resumeObject };
    delete objectToSave.user;
    const isCover = String(objectToSave.template || objectToSave.resumeName || '').startsWith('Cover');
    const collectionName = isCover ? 'covers' : 'resumes';
    const reference = db.collection('users').doc(ownerUid).collection(collectionName).doc(resumeId);
    await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        const existing = snapshot.exists ? snapshot.data() || {} : {};
        transaction.set(reference, {
            ...objectToSave,
            revision: Number(existing.revision || 0) + 1,
            created_at: existing.created_at || firebase.firestore.Timestamp.now(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    });
}

export async function checkIfResumeIdAvailable(userId) {
    const db = fire.firestore();
    if (localStorage.getItem('currentResumeId') === undefined) {
        await db
            .collection('users')
            .doc(userId)
            .collection('resumes')
            .add({})
            .then((resumeRef) => {
                localStorage.setItem('currentResumeId', resumeRef.id);
            });
    }
}
export async function setResumePropertyPerUser(userId, resumeId, propertyName, value) {
    if (userId === null) return;

    const db = fire.firestore();
    const user = db.collection('users').doc(userId).collection('resumes').doc(resumeId);
    var res;
    switch (propertyName) {
        case 'firstname':
            res = await user.set(
                {
                    firstname: value,
                },
                { merge: true }
            );
            break;
        case 'pbId':
            res = await user.set(
                {
                    pbId: value,
                },
                { merge: true }
            );
            break;

        case 'lastname':
            res = await user.set(
                {
                    lastname: value,
                },
                { merge: true }
            );
            break;
        case 'summary':
            res = await user.set(
                {
                    summary: value,
                },
                { merge: true }
            );
            break;
        case 'email':
            res = await user.set(
                {
                    email: value,
                },
                { merge: true }
            );
            break;
        case 'template':
            res = await user.set(
                {
                    template: value,

                    created_at: new Date(),
                },
                { merge: true }
            );
            break;
        case 'title':
            res = await user.set(
                {
                    title: value,
                },
                { merge: true }
            );
            break;
        case 'phone':
            res = await user.set(
                {
                    phone: value,
                },
                { merge: true }
            );
            break;
        case 'occupation':
            res = await user.set(
                {
                    occupation: value,
                },
                { merge: true }
            );
            break;
        case 'country':
            res = await user.set(
                {
                    country: value,
                },
                { merge: true }
            );
            break;
        case 'city':
            res = await user.set(
                {
                    city: value,
                },
                { merge: true }
            );
            break;
        case 'address':
            res = await user.set(
                {
                    address: value,
                },
                { merge: true }
            );
            break;
        case 'postalcode':
            res = await user.set(
                {
                    postalcode: value,
                },
                { merge: true }
            );
            break;
        case 'dateofbirth':
            res = await user.set(
                {
                    dateofbirth: value,
                },
                { merge: true }
            );
            break;
        case 'drivinglicense':
            res = await user.set(
                {
                    drivinglicense: value,
                },
                { merge: true }
            );
            break;
        case 'nationality':
            res = await user.set(
                {
                    nationality: value,
                },
                { merge: true }
            );
            break;
        case 'languages':
            res = await user.set(
                {
                    languages: value,
                },
                { merge: true }
            );
            break;
        case 'skills':
            res = await user.set(
                {
                    skills: value,
                },
                { merge: true }
            );
            break;
        default:
            break;
    }
}
/// Function to generate an id of a given length
function makeid(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

export async function getResumesOfUser(u) {
    const db = fire.firestore();
    const resumesRef = await db.collection('users').doc(u).collection('resumes').get();
    var resumes = [];
    for (let index = 0; index < resumesRef.docs.length; index++) {
        resumes[index] = resumesRef.docs[index].data();
        resumes[index].id = resumesRef.docs[index].id;
    }
    return resumes;
}

// getCoversOfUser
export async function getCoversOfUser(u) {
    const db = fire.firestore();
    const coversRef = await db.collection('users').doc(u).collection('covers').get();
    var covers = [];
    for (let index = 0; index < coversRef.docs.length; index++) {
        covers[index] = { item: coversRef.docs[index].data() };
        covers[index].id = coversRef.docs[index].id;
    }
    return covers;
}

// a function that add 1 to the number of documents generated
// target : 'users/uid/states'

export async function addOneToNumberOfDocumentsGenerated(uid) {
    const db = fire.firestore();
    const userRef = await db.collection('users').doc(uid);
    const user = await userRef.get();
    if (user.exists) {
        var states = user.data().states;
        if (states === undefined) {
            states = {};
        }
        if (states.documentsGenerated === undefined) {
            states.documentsGenerated = 0;
        }
        states.documentsGenerated = states.documentsGenerated + 1;
        userRef.set(
            {
                states: states,
            },
            { merge: true }
        );
    }
}

// a function that add 1 to the number of documents downloaded
// target : 'users/uid/states'

export async function addOneToNumberOfDocumentsDownloaded(uid) {
    if (uid === null) return;
    const db = fire.firestore();
    const userRef = await db.collection('users').doc(uid);
    const user = await userRef.get();
    if (user.exists) {
        var states = user.data().states;
        if (states == undefined) {
            states = {};
        }
        if (states.documentsDownloaded === undefined) {
            states.documentsDownloaded = 0;
        }
        states.documentsDownloaded = states.documentsDownloaded + 1;
        userRef.set(
            {
                states: states,
            },
            { merge: true }
        );
    }
}

// a function that add 1 to the number of documents visited
// target : 'users/uid/states'

export async function addOneToNumberOfDocumentsVisited(uid) {
    const db = fire.firestore();
    const userRef = await db.collection('users').doc(uid);
    const user = await userRef.get();
    if (user.exists) {
        var states = user.data().states;
        if (states === undefined) {
            states = {};
        }
        if (states.documentsVisited === undefined) {
            states.documentsVisited = 0;
        }
        states.documentsVisited = states.documentsVisited + 1;
        userRef.set(
            {
                states: states,
            },
            { merge: true }
        );
    }
}

// afunction that gets states of a user
// target : 'users/uid/states'

export async function getStatesOfUser(uid) {
    const db = fire.firestore();
    const userRef = await db.collection('users').doc(uid);
    const user = await userRef.get();
    if (user.exists) {
        var states = user.data().states;
        if (states === undefined) {
            states = {};
        }
        return states;
    }
}

// a function that take data url and add image to firebase /users/uid/profile
export async function uploadImageToFirebase(dataUrl, uid, expectedRevision = null) {
    const db = fire.firestore();
    const reference = db.collection('users').doc(uid);
    let result;
    try {
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists) throw new Error('Profile not found.');
            const current = normalizeProfileData(snapshot.data()?.profile || {});
            if (expectedRevision !== null && Number(expectedRevision) !== current.revision) { const error = new Error('Profile changed elsewhere. Reload before replacing the avatar.'); error.code = 'PROFILE_CONFLICT'; error.remoteRevision = current.revision; throw error; }
            const selectedImage = normalizeProfileData({ selectedImage: dataUrl }).selectedImage;
            if (!selectedImage) throw new Error('Avatar must be a bounded PNG, JPEG, or WebP image.');
            const profile = { ...current, selectedImage, revision: current.revision + 1 };
            transaction.set(reference, { profile }, { merge: true });
            result = { success: true, revision: profile.revision, selectedImage };
        });
        return result;
    } catch (error) { return { success: false, error: error.message, code: error.code, remoteRevision: error.remoteRevision }; }
}

// create a function that take as a parameters uid,field,value
// and add it to /users/uid/profile

export async function addFieldToProfile(uid, field, value) {
    const db = fire.firestore();
    const userRef = await db.collection('users').doc(uid);
    const user = await userRef.get();
    if (user.exists) {
        var profile = user.data().profile;
        if (profile === undefined) {
            profile = {};
        }
        profile[field] = value;
        userRef.set(
            {
                profile: profile,
            },
            { merge: true }
        );
    }
}

// get profile of a user

export async function getProfileOfUser(uid) {
    const db = fire.firestore();
    const userRef = await db.collection('users').doc(uid);
    const user = await userRef.get();
    if (user.exists) {
        var profile = user.data().profile;
        if (profile === undefined) {
            profile = {};
        }
        return profile;
    }
}

// add profile to a user
// the profile cotnains
// name: '',
// phone: '',
// address: '',
// city: '',
// postalCode: '',
// country: '',
// selectedImage: null

export async function addProfileToUser(uid, profile, expectedRevision = null) {
    if (!profileFitsFirestore(profile)) return { success: false, error: 'Profile is too large to save.' };
    const db = fire.firestore();
    const reference = db.collection('users').doc(uid);
    let result;
    try {
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists) throw new Error('Profile not found.');
            const current = normalizeProfileData(snapshot.data()?.profile || {});
            if (expectedRevision !== null && Number(expectedRevision) !== current.revision) { const error = new Error('Profile changed in another tab or device.'); error.code = 'PROFILE_CONFLICT'; error.remoteRevision = current.revision; throw error; }
            const normalized = normalizeProfileData(profile);
            normalized.revision = current.revision + 1;
            transaction.set(reference, { profile: normalized }, { merge: true });
            result = { success: true, revision: normalized.revision, profile: normalized };
        });
        return result;
    } catch (error) { return { success: false, error: error.message, code: error.code, remoteRevision: error.remoteRevision }; }
}

// get account info

// /users/uid

export async function saveUserPreferences(uid, preferences, expectedRevision = 0) {
    const allowedLanguages = ['en','hi','es','fr','de','it','pt','nl','pl','ru','ja','ko','zh','ar','tr','sv','da','no','fi','is','ro','el'];
    const normalized = {
        language: allowedLanguages.includes(preferences?.language) ? preferences.language : 'en',
        emailNotifications: preferences?.emailNotifications !== false,
        securityNotifications: preferences?.securityNotifications !== false,
        productUpdates: preferences?.productUpdates === true,
        profileDiscoverable: preferences?.profileDiscoverable === true,
    };
    const reference = fire.firestore().collection('users').doc(uid);
    try {
        let revision;
        await fire.firestore().runTransaction(async transaction => {
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists) throw new Error('Account not found.');
            const currentRevision = Number(snapshot.data()?.preferences?.revision || 0);
            if (Number(expectedRevision) !== currentRevision) { const error = new Error('Preferences changed elsewhere. Reload before saving.'); error.code = 'PREFERENCES_CONFLICT'; throw error; }
            revision = currentRevision + 1;
            transaction.set(reference, { preferences: { ...normalized, revision } }, { merge: true });
        });
        return { success: true, preferences: { ...normalized, revision } };
    } catch (error) { return { success: false, error: error.message, code: error.code }; }
}

export async function getAccountInfo(uid) {
    const db = fire.firestore();
    const userRef = await db.collection('users').doc(uid);
    const user = await userRef.get();
    if (user.exists) {
        return user.data();
    } else {
        return null;
    }
}

// add a skill to a user
// /users/uid/skills

export async function addSkillToUser(uid, skill) {
    const db = fire.firestore();
    const userRef = await db.collection('users').doc(uid);
    const user = await userRef.get();
    if (user.exists) {
        var skills = user.data().skills;
        if (skills === undefined) {
            skills = [];
        }
        skills.push(skill);
        userRef.set(
            {
                skills: skills,
            },
            { merge: true }
        );
    }
}
// remove a skill from a user
// /users/uid/skills

export async function removeSkillFromUser(uid, skill) {
    const db = fire.firestore();
    const userRef = await db.collection('users').doc(uid);
    const user = await userRef.get();
    if (user.exists) {
        var skills = user.data().skills;
        if (skills === undefined) {
            skills = [];
        }
        skills = skills.filter((item) => item !== skill);
        userRef.set(
            {
                skills: skills,
            },
            { merge: true }
        );
        return true;
    } else {
        return false;
    }
}

// get skills of a user
// /users/uid/skills

export async function getSkillsOfUser(uid) {
    const db = fire.firestore();
    const userRef = await db.collection('users').doc(uid);
    const user = await userRef.get();
    if (user.exists) {
        var skills = user.data().skills;
        if (skills === undefined) {
            skills = [];
        }
        return skills;
    }
}

// in firestore add a review collection to /reviwes
// the review collection contains
// name: '',
// rating: 0,
// review
// imageUrl: '',
// date: new Date()

export async function addReview(review) {
    try {
        const { response, data: result } = await fetchAdminWithReauth('/api/admin/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(review) });
        return response.ok && result.success ? result : { success: false, error: result.error || 'Unable to add review.' };
    } catch (error) { return { success: false, error: error.message }; }
}

// add a trusted by

export async function addTrustedBy(data) {
    try {
        const { response, data: result } = await fetchAdminWithReauth('/api/admin/trusted-by', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return response.ok && result.success ? result : { success: false, error: result.error || 'Unable to add logo.' };
    } catch (error) { return { success: false, error: error.message }; }
}

export async function getTrustedBy({ includeUnpublished = false } = {}) {
    if (includeUnpublished) {
        const { response, data } = await fetchAdminWithReauth('/api/admin/trusted-by');
        if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'Trusted logos are unavailable.');
        return (data.items || []).map(item => ({ ...item, revision: Number(item.revision || 0) }));
    }
    try {
        const response = await fetch('/api/public/trusted-by', { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.success) return (data.items || []).map(item => ({ ...item, revision: Number(item.revision || 0) }));
    } catch (_) { /* fallback to alternative endpoint */ }
    try {
        const response = await fetch('/public/trusted-by.json', { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.success) return (data.items || []).map(item => ({ ...item, revision: Number(item.revision || 0) }));
    } catch (_) {}
    return [];
}

export async function removeTrustedBy(id, expectedRevision = 0) {
    try {
        const { response, data: result } = await fetchAdminWithReauth(`/api/admin/trusted-by/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }) });
        return response.ok && result.success ? result : { success: false, error: result.error || 'Unable to delete logo.', code: result.code };
    } catch (error) { return { success: false, error: error.message }; }
}

export async function updateTrustedBy(id, data, expectedRevision = 0) {
    try {
        const { response, data: result } = await fetchAdminWithReauth(`/api/admin/trusted-by/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, expectedRevision }) });
        return response.ok && result.success ? result : { success: false, error: result.error || 'Unable to update logo.', code: result.code };
    } catch (error) { return { success: false, error: error.message }; }
}

// add global rating to a /data/meta
// make sure to note remove the current data that is in meta

export async function addGlobalRating(rating) {
    try {
        const { response, data: result } = await fetchAdminWithReauth('/api/admin/global-rating', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating }) });
        return response.ok && result.success ? result : { success: false, error: result.error || 'Unable to update rating.' };
    } catch (error) { return { success: false, error: error.message }; }
}

// get all reviews make sure every id is with there response

export async function getAllReviews() {
    const currentUser = fire.auth().currentUser;
    const tokenResult = currentUser ? await currentUser.getIdTokenResult().catch(() => null) : null;
    const role = String(tokenResult?.claims?.role || '').toUpperCase();
    if (['ADMIN', 'SUPER_ADMIN'].includes(role)) {
        const { response, data } = await fetchAdminWithReauth('/api/admin/reviews');
        if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'Reviews are unavailable.');
        return data.reviews || [];
    }
    const reviewsRef = await fire.firestore().collection('reviews').where('status', '==', 'approved').get();
    return reviewsRef.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// get only 3 reviews

export async function get3Reviews() {
    const db = fire.firestore();
    const reviewsRef = await db.collection('reviews').where('status', '==', 'approved').limit(3).get();
    const reviews = reviewsRef.docs.map((doc) => {
        return { id: doc.id, ...doc.data() };
    });
    return reviews;
}

// delete a review

export async function deleteReview(id, expectedRevision = 0) {
    try {
        const response = await fetchAdminWithReauth(`/api/admin/reviews/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }) });
        const result = await response.json().catch(() => ({}));
        return response.ok && result.success ? result : { success: false, error: result.error || 'Unable to delete review.', code: result.code };
    } catch (error) { return { success: false, error: error.message }; }
}

//

// in firstore add category collection with name  to /categories

export async function addCategoryToData(categoryName) {
    const db = fire.firestore();
    const categoryRef = await db.collection('categories').doc(categoryName);
    const category = await categoryRef.get();
    if (!category.exists) {
        categoryRef.set({
            name: categoryName,
            phrases: [],
        });
    } else {
        // add to categories dierctly
        db.collection('categories').doc(categoryName).set(
            {
                name: categoryName,
                phrases: [],
            },
            { merge: true }
        );
    }
    // if it is added succefully return true otherwise false
    return true;
}
// get all categories

export async function getAllCategories() {
    const db = fire.firestore();
    const categoriesRef = await db.collection('categories').get();
    var categories = [];
    categoriesRef.forEach((category) => {
        categories.push(category.data());
    });
    return categories;
}

// ================== REALTIME DATABASE MESSAGING FUNCTIONS ==================

// Utility function to check if Firebase Realtime Database is available
function isRealtimeDatabaseAvailable() {
    try {
        return fire.database && typeof fire.database === 'function';
    } catch (error) {
        console.warn('Firebase Realtime Database not available:', error.message);
        return false;
    }
}

// Safe wrapper for Realtime Database operations
function safeRealtimeDbOperation(operation, fallbackReturn = null) {
    if (!isRealtimeDatabaseAvailable()) {
        console.warn('Realtime Database operation attempted but service not available');
        return fallbackReturn;
    }
    
    try {
        return operation();
    } catch (error) {
        console.warn('Realtime Database operation failed:', error.message);
        return fallbackReturn;
    }
}

export async function createConversation(applicationId) {
    try {
        const response = await fetchAdminWithReauth('/api/messages/conversations', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applicationId })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to create conversation.');
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function getConversationParticipantProfile(conversationId) {
    try {
        const response = await fetchAdminWithReauth(`/api/messages/conversations/${encodeURIComponent(conversationId)}/participant-profile`);
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || 'Participant profile is unavailable.');
        return result.profile || { name: '', avatar: '' };
    } catch (error) {
        return { name: '', avatar: '', error: error.message };
    }
}

export async function sendMessage(conversationId, _senderId, text) {
    try {
        const response = await fetchAdminWithReauth('/api/messages/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId, text })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to send message.');
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export function getConversations(userId, callback) {
    
    return safeRealtimeDbOperation(() => {
        const db = fire.database();
        const conversationsRef = db.ref(`user-conversations/${userId}`);
        
        // Add error handler for the database reference
        conversationsRef.on('value', async (snapshot) => {
            
            const conversationIds = snapshot.val();
            if (!conversationIds) {
                callback([]);
                return;
            }

            const conversationPromises = Object.keys(conversationIds).map(async (conversationId) => {
                try {
                    const conversationSnapshot = await db.ref(`conversations/${conversationId}`).get();
                    const conversation = conversationSnapshot.val();
                    
                    if (!conversation) {
                        return null;
                    }
                    
                    conversation.id = conversationId;

                    // Get last message
                    const lastMessageSnapshot = await db.ref(`messages/${conversationId}`).orderByChild('timestamp').limitToLast(1).get();
                    if (lastMessageSnapshot.exists()) {
                        const [lastMessage] = Object.values(lastMessageSnapshot.val());
                        conversation.lastMessage = lastMessage;
                    }

                    return conversation;
                } catch (error) {
                    // Gracefully handle the error for a single conversation
                    const conversationSnapshot = await db.ref(`conversations/${conversationId}`).get();
                    if (conversationSnapshot.exists()) {
                        const conversation = conversationSnapshot.val();
                        conversation.id = conversationId;
                        conversation.lastMessage = { text: 'Could not load messages.' };
                        return conversation;
                    }
                    return null;
                }
            });

            const conversations = await Promise.all(conversationPromises);
            const validConversations = conversations.filter(Boolean);
            callback(validConversations);
        }, (error) => {
            console.error('🔥 Firebase error in getConversations:', error);
            console.error('🔥 Error code:', error?.code);
            console.error('🔥 Error message:', error?.message);
            console.error('🔥 Error details:', error?.details);
            // Return empty array on error to prevent UI crashes
            callback([]);
        });

        return () => {
            conversationsRef.off();
        };
    }, () => {
        // Fallback when Realtime Database is not available
        callback([]);
        return () => {}; // Return empty cleanup function
    });
}

export function getMessages(conversationId, callback, errorCallback) {
    const db = fire.database();
    const messagesRef = db.ref(`messages/${conversationId}`).orderByChild('timestamp');

    messagesRef.on('value', (snapshot) => {
        try {
            const messages = [];
            snapshot.forEach((childSnapshot) => {
                messages.push({
                    id: childSnapshot.key,
                    ...childSnapshot.val(),
                });
            });
            callback(messages);
        } catch (error) {
            console.error('Error processing messages:', error);
            if (errorCallback) {
                errorCallback(error);
            }
        }
    }, (error) => {
        console.error('Firebase error loading messages:', error);
        if (errorCallback) {
            errorCallback(error);
        }
    });

    return () => messagesRef.off();
}

// New function for paginated messages
export async function getMessagesPaginated(conversationId, limit = 10, startAfter = null) {
    try {
        
        const db = fire.database();
        let messagesRef = db.ref(`messages/${conversationId}`).orderByChild('timestamp');
        
        if (startAfter) {
            // For loading older messages, we need to end before the startAfter timestamp
            messagesRef = messagesRef.endBefore(startAfter);
        }
        
        // Get the last N messages (most recent)
        messagesRef = messagesRef.limitToLast(limit);
        
        const snapshot = await messagesRef.get();
        
        if (!snapshot.exists()) {
            return { messages: [], hasMore: false };
        }
        
        const messages = [];
        snapshot.forEach((childSnapshot) => {
            messages.push({
                id: childSnapshot.key,
                ...childSnapshot.val(),
            });
        });
        
        // Check if there are more messages
        const hasMore = messages.length === limit && messages.length > 0;
        
        
        return { messages, hasMore };
    } catch (error) {
        console.error('❌ Error in getMessagesPaginated:', error);
        throw error;
    }
}
// remove a category by name
// first check if exist if not return false
// if exist remove it and return true

export async function removeCategoryByName(categoryName) {
    const db = fire.firestore();
    const categoryRef = await db.collection('categories').doc(categoryName);
    const category = await categoryRef.get();
    if (category.exists) {
        categoryRef.delete();
        return true;
    } else {
        return false;
    }
}

// add a phrase to a category
// first check if category exist if not return false
// if exist add phrase to it and return true

export async function addPhraseToCategory(categoryName, phrase) {
    const db = fire.firestore();
    const categoryRef = await db.collection('categories').doc(categoryName);
    const category = await categoryRef.get();
    if (category.exists) {
        var phrases = category.data().phrases;
        if (phrases === undefined) {
            phrases = [];
        }
        phrases.push(phrase);
        categoryRef.set(
            {
                phrases: phrases,
            },
            { merge: true }
        );
        return true;
    } else {
        return false;
    }
}

// get all phrases of a category

export async function getPhrasesOfCategory(categoryName) {
    const db = fire.firestore();
    const categoryRef = await db.collection('categories').doc(categoryName);
    const category = await categoryRef.get();
    if (category.exists) {
        var phrases = category.data().phrases;
        if (phrases === undefined) {
            phrases = [];
        }
        return phrases;
    }
}

// remove a phrase from a category

export async function removePhraseFromCategory(categoryName, phrase) {
    const db = fire.firestore();
    const categoryRef = await db.collection('categories').doc(categoryName);
    const category = await categoryRef.get();
    if (category.exists) {
        var phrases = category.data().phrases;
        if (phrases === undefined) {
            phrases = [];
        }
        var index = phrases.indexOf(phrase);
        if (index > -1) {
            phrases.splice(index, 1);
        }
        categoryRef.set(
            {
                phrases: phrases,
            },
            { merge: true }
        );
        return true;
    } else {
        return false;
    }
}

//

export default addResume;

// Portfolio operations
function assertPortfolioSize(data) {
    const bytes = new Blob([JSON.stringify(data || {})]).size;
    if (bytes <= 900_000) return;
    const error = new Error('Portfolio is too large to save. Remove oversized embedded images or content.');
    error.code = 'PORTFOLIO_TOO_LARGE';
    throw error;
}

export async function publishPortfolio(userId, portfolioData, theme = 'default') {
    const db = fire.firestore();

    try {
        // Generate a unique slug for the portfolio URL
        const slug = generatePortfolioSlug(portfolioData.title || 'portfolio');

        // Check if slug already exists
        const existingPortfolio = await getPortfolioBySlug(slug);
        if (existingPortfolio) {
            throw new Error('Portfolio with this name already exists. Please choose a different name.');
        }

        // Create a clean copy of portfolio data for storage
        const cleanPortfolioData = JSON.parse(JSON.stringify(portfolioData));

        // Validate and sanitize the portfolio data structure
        if (!cleanPortfolioData.content) {
            cleanPortfolioData.content = [];
        }

        if (!cleanPortfolioData.root) {
            cleanPortfolioData.root = {
                props: {
                    title: portfolioData.title || 'My Portfolio',
                },
            };
        }

        // Ensure each component has proper structure
        cleanPortfolioData.content = cleanPortfolioData.content.map((component) => {
            if (!component.props) {
                component.props = {};
            }
            if (!component.type) {
                console.warn('Component without type found:', component);
                component.type = 'Unknown';
            }
            return component;
        });
        assertPortfolioSize(cleanPortfolioData);

        const portfolioDoc = {
            userId: userId,
            slug: slug,
            title: portfolioData.title || 'My Portfolio',
            data: cleanPortfolioData,
            theme: theme,
            isPublished: true,
            publishedAt: firebase.firestore.Timestamp.now(),
            updatedAt: firebase.firestore.Timestamp.now(),
            views: 0,
            revision: 1,
            metadata: {
                description: portfolioData.description || '',
                tags: portfolioData.tags || [],
                seoTitle: portfolioData.seoTitle || portfolioData.title || 'My Portfolio',
                seoDescription: portfolioData.seoDescription || portfolioData.description || '',
            },
        };

        const docRef = db.collection('portfolios').doc();
        const userPortfolioRef = db.collection('users').doc(userId).collection('portfolios').doc(docRef.id);
        const batch = db.batch();
        batch.set(docRef, portfolioDoc);
        batch.set(userPortfolioRef, {
            portfolioId: docRef.id,
            slug: slug,
            title: portfolioData.title || 'My Portfolio',
            theme: theme,
            publishedAt: portfolioDoc.publishedAt,
            isPublished: true,
            revision: 1,
        });
        await batch.commit();

        return { id: docRef.id, slug: slug, revision: 1 };
    } catch (error) {
        console.error('Error publishing portfolio:', error);
        throw error;
    }
}

export async function updateExistingPortfolio(portfolioId, userId, portfolioData, theme = 'default', expectedRevision = null) {
    const db = fire.firestore();

    try {
        // Get the existing portfolio to preserve the slug if it's already published
        const existingPortfolio = await getPortfolioById(portfolioId);
        if (!existingPortfolio) {
            throw new Error('Portfolio not found');
        }
        if (existingPortfolio.userId !== userId) {
            throw new Error('You do not have permission to update this portfolio');
        }

        // Create a clean copy of portfolio data for storage
        const cleanPortfolioData = JSON.parse(JSON.stringify(portfolioData));

        // Validate and sanitize the portfolio data structure
        if (!cleanPortfolioData.content) {
            cleanPortfolioData.content = [];
        }

        if (!cleanPortfolioData.root) {
            cleanPortfolioData.root = {
                props: {
                    title: portfolioData.title || 'My Portfolio',
                },
            };
        }

        // Ensure each component has proper structure
        cleanPortfolioData.content = cleanPortfolioData.content.map((component) => {
            if (!component.props) {
                component.props = {};
            }
            if (!component.type) {
                console.warn('Component without type found:', component);
                component.type = 'Unknown';
            }
            return component;
        });
        assertPortfolioSize(cleanPortfolioData);

        let updateData = {
            title: portfolioData.title || 'My Portfolio',
            data: cleanPortfolioData,
            theme: theme,
            updatedAt: firebase.firestore.Timestamp.now(),
            metadata: {
                description: portfolioData.description || '',
                tags: portfolioData.tags || [],
                seoTitle: portfolioData.seoTitle || portfolioData.title || 'My Portfolio',
                seoDescription: portfolioData.seoDescription || portfolioData.description || '',
            },
        };

        // If portfolio wasn't published before, generate slug and set published fields
        if (!existingPortfolio.isPublished) {
            const slug = generatePortfolioSlug(portfolioData.title || 'portfolio');

            // Check if slug already exists
            const existingSlugPortfolio = await getPortfolioBySlug(slug);
            if (existingSlugPortfolio && existingSlugPortfolio.id !== portfolioId) {
                throw new Error('Portfolio with this name already exists. Please choose a different name.');
            }

            updateData.slug = slug;
            updateData.isPublished = true;
            updateData.publishedAt = firebase.firestore.Timestamp.now();
        } else {
            // Keep existing published status and preserve slug
            updateData.isPublished = true;
            // Don't update publishedAt to preserve original publish date
        }
        updateData.draftData = firebase.firestore.FieldValue.delete();
        updateData.draftMetadata = firebase.firestore.FieldValue.delete();
        updateData.draftTitle = firebase.firestore.FieldValue.delete();
        updateData.hasUnpublishedChanges = firebase.firestore.FieldValue.delete();

        const subCollectionUpdate = {
            title: portfolioData.title || 'My Portfolio',
            theme: theme,
            isPublished: true,
            hasUnpublishedChanges: false,
        };

        if (!existingPortfolio.isPublished) {
            subCollectionUpdate.publishedAt = firebase.firestore.Timestamp.now();
            subCollectionUpdate.slug = updateData.slug;
        }

        const mainReference = db.collection('portfolios').doc(portfolioId);
        const userReference = db.collection('users').doc(userId).collection('portfolios').doc(portfolioId);
        let revision;
        await db.runTransaction(async transaction => {
            const latestSnapshot = await transaction.get(mainReference);
            if (!latestSnapshot.exists || latestSnapshot.data()?.userId !== userId) throw new Error('Portfolio not found or access denied');
            const latestRevision = Number(latestSnapshot.data()?.revision) || 0;
            if (expectedRevision !== null && Number(expectedRevision) !== latestRevision) {
                const conflict = new Error('This portfolio changed in another tab or device. Reload before publishing.');
                conflict.code = 'PORTFOLIO_CONFLICT';
                conflict.remoteRevision = latestRevision;
                throw conflict;
            }
            revision = latestRevision + 1;
            transaction.update(mainReference, { ...updateData, revision });
            transaction.set(userReference, { ...subCollectionUpdate, revision }, { merge: true });
        });

        return {
            id: portfolioId,
            slug: updateData.slug || existingPortfolio.slug,
            isNewlyPublished: !existingPortfolio.isPublished,
            revision,
        };
    } catch (error) {
        console.error('Error updating existing portfolio:', error);
        throw error;
    }
}

export async function savePortfolioDraft(userId, portfolioData, portfolioId = null, theme = 'default', expectedRevision = null) {
    const db = fire.firestore();

    try {
        // Create a clean copy of portfolio data for storage
        const cleanPortfolioData = JSON.parse(JSON.stringify(portfolioData));

        // Validate and sanitize the portfolio data structure
        if (!cleanPortfolioData.content) {
            cleanPortfolioData.content = [];
        }

        if (!cleanPortfolioData.root) {
            cleanPortfolioData.root = {
                props: {
                    title: portfolioData.title || 'Untitled Portfolio',
                },
            };
        }

        // Ensure each component has proper structure
        cleanPortfolioData.content = cleanPortfolioData.content.map((component) => {
            if (!component.props) {
                component.props = {};
            }
            if (!component.type) {
                console.warn('Component without type found:', component);
                component.type = 'Unknown';
            }
            return component;
        });
        assertPortfolioSize(cleanPortfolioData);

        const portfolioDoc = {
            userId: userId,
            title: portfolioData.title || 'Untitled Portfolio',
            data: cleanPortfolioData,
            theme: theme,
            isPublished: false,
            updatedAt: firebase.firestore.Timestamp.now(),
            metadata: {
                description: portfolioData.description || '',
                tags: portfolioData.tags || [],
                seoTitle: portfolioData.seoTitle || portfolioData.title || 'Untitled Portfolio',
                seoDescription: portfolioData.seoDescription || portfolioData.description || '',
            },
        };

        if (portfolioId) {
            const mainReference = db.collection('portfolios').doc(portfolioId);
            const userReference = db.collection('users').doc(userId).collection('portfolios').doc(portfolioId);
            let nextRevision = 0;
            let published = false;
            await db.runTransaction(async transaction => {
                const snapshot = await transaction.get(mainReference);
                if (!snapshot.exists || snapshot.data()?.userId !== userId) throw new Error('Portfolio not found or access denied');
                const existingPortfolio = snapshot.data() || {};
                const currentRevision = Number(existingPortfolio.revision) || 0;
                if (expectedRevision !== null && Number(expectedRevision) !== currentRevision) {
                    const conflict = new Error('This portfolio changed in another tab or device. Reload before saving.');
                    conflict.code = 'PORTFOLIO_CONFLICT';
                    conflict.remoteRevision = currentRevision;
                    throw conflict;
                }
                published = existingPortfolio.isPublished === true;
                nextRevision = currentRevision + 1;
                const updateData = published ? {
                    draftData: cleanPortfolioData, draftTitle: portfolioDoc.title, draftMetadata: portfolioDoc.metadata,
                    hasUnpublishedChanges: true, updatedAt: portfolioDoc.updatedAt, revision: nextRevision,
                } : { ...portfolioDoc, revision: nextRevision };
                transaction.update(mainReference, updateData);
                transaction.set(userReference, {
                    portfolioId, title: portfolioDoc.title, theme, isPublished: published,
                    hasUnpublishedChanges: published, updatedAt: portfolioDoc.updatedAt, revision: nextRevision,
                }, { merge: true });
            });
            return { id: portfolioId, revision: nextRevision, hasUnpublishedChanges: published };
        }

        portfolioDoc.createdAt = firebase.firestore.Timestamp.now();
        portfolioDoc.revision = 1;
        const docRef = db.collection('portfolios').doc();
        const batch = db.batch();
        batch.set(docRef, portfolioDoc);
        batch.set(db.collection('users').doc(userId).collection('portfolios').doc(docRef.id), {
            portfolioId: docRef.id,
            title: portfolioData.title || 'Untitled Portfolio',
            theme: theme,
            createdAt: portfolioDoc.createdAt,
            updatedAt: portfolioDoc.updatedAt,
            isPublished: false,
            revision: 1,
        });
        await batch.commit();
        return { id: docRef.id, revision: 1 };
    } catch (error) {
        console.error('Error saving portfolio draft:', error);
        throw error;
    }
}

export async function duplicatePortfolio(userId, portfolioId) {
    const existing = await getPortfolioById(portfolioId);
    if (!existing || existing.userId !== userId) throw new Error('Portfolio not found or access denied');
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

export async function renamePortfolio(userId, portfolioId, title, expectedRevision = null) {
    const cleanTitle = String(title || '').trim().slice(0, 160);
    if (!cleanTitle) throw new Error('Portfolio title is required');
    const db = fire.firestore();
    const mainReference = db.collection('portfolios').doc(portfolioId);
    const userReference = db.collection('users').doc(userId).collection('portfolios').doc(portfolioId);
    let revision;
    await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(mainReference);
        if (!snapshot.exists || snapshot.data()?.userId !== userId) throw new Error('Portfolio not found or access denied');
        const existing = snapshot.data() || {};
        const currentRevision = Number(existing.revision) || 0;
        if (expectedRevision !== null && Number(expectedRevision) !== currentRevision) {
            const conflict = new Error('This portfolio changed in another tab or device.');
            conflict.code = 'PORTFOLIO_CONFLICT';
            conflict.remoteRevision = currentRevision;
            throw conflict;
        }
        revision = currentRevision + 1;
        if (existing.isPublished) {
            const draftData = JSON.parse(JSON.stringify(existing.draftData || existing.data || {}));
            draftData.root = draftData.root || { props: {} };
            draftData.root.props = { ...(draftData.root.props || {}), title: cleanTitle };
            transaction.update(mainReference, { draftTitle: cleanTitle, draftData, hasUnpublishedChanges: true, revision, updatedAt: firebase.firestore.Timestamp.now() });
        } else {
            const data = JSON.parse(JSON.stringify(existing.data || {}));
            data.root = data.root || { props: {} };
            data.root.props = { ...(data.root.props || {}), title: cleanTitle };
            transaction.update(mainReference, { title: cleanTitle, data, revision, updatedAt: firebase.firestore.Timestamp.now() });
        }
        transaction.set(userReference, { title: cleanTitle, revision, hasUnpublishedChanges: existing.isPublished === true }, { merge: true });
    });
    return { id: portfolioId, title: cleanTitle, revision };
}

export async function getPortfolioBySlug(slug) {
    const db = fire.firestore();

    try {
        const snapshot = await db.collection('portfolios').where('slug', '==', slug).where('isPublished', '==', true).limit(1).get();

        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        }
        return null;
    } catch (error) {
        console.error('Error getting portfolio by slug:', error);
        throw error;
    }
}

export async function getPortfolioById(portfolioId) {
    const db = fire.firestore();

    try {
        const doc = await db.collection('portfolios').doc(portfolioId).get();
        if (doc.exists) {
            return { id: doc.id, ...doc.data() };
        }
        return null;
    } catch (error) {
        console.error('Error getting portfolio by ID:', error);
        throw error;
    }
}

export async function getUserPortfolios(userId, includeUnpublished = true) {
    const db = fire.firestore();

    try {
        // First try to get from user's portfolios subcollection
        let query = db.collection('users').doc(userId).collection('portfolios');

        if (!includeUnpublished) {
            query = query.where('isPublished', '==', true);
        }

        const snapshot = await query.get();
        const portfolios = [];

        if (!snapshot.empty) {
            // Get full portfolio data for each reference
            for (const doc of snapshot.docs) {
                const portfolioRef = doc.data();
                const fullPortfolio = await getPortfolioById(portfolioRef.portfolioId);
                if (fullPortfolio?.userId === userId) {
                    portfolios.push(fullPortfolio);
                }
            }
        } else {
            // Fallback: directly query portfolios collection by userId
            let directQuery = db.collection('portfolios').where('userId', '==', userId);

            if (!includeUnpublished) {
                directQuery = directQuery.where('isPublished', '==', true);
            }

            const directSnapshot = await directQuery.get();
            directSnapshot.forEach((doc) => {
                portfolios.push({ id: doc.id, ...doc.data() });
            });
        }

        // Sort by updatedAt or publishedAt
        portfolios.sort((a, b) => {
            const dateA = a.updatedAt || a.publishedAt || a.createdAt;
            const dateB = b.updatedAt || b.publishedAt || b.createdAt;
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;
            return dateB.toDate() - dateA.toDate();
        });

        return portfolios;
    } catch (error) {
        console.error('Error getting user portfolios:', error);
        throw error;
    }
}

export async function updatePortfolioVisibility(userId, portfolioId, isPublished) {
    const db = fire.firestore();

    try {
        const portfolio = await getPortfolioById(portfolioId);
        if (!portfolio || portfolio.userId !== userId) {
            throw new Error('Portfolio not found or access denied');
        }
        const updateData = {
            isPublished: isPublished,
            updatedAt: firebase.firestore.Timestamp.now(),
        };

        if (isPublished) {
            updateData.publishedAt = firebase.firestore.Timestamp.now();
            if (!portfolio.slug) {
                let slug;
                let attempts = 0;
                do {
                    slug = generatePortfolioSlug(portfolio.title || 'portfolio');
                    attempts += 1;
                } while (attempts < 3 && await getPortfolioBySlug(slug));
                updateData.slug = slug;
            }
        }

        const batch = db.batch();
        batch.update(db.collection('portfolios').doc(portfolioId), updateData);
        batch.set(db.collection('users').doc(userId).collection('portfolios').doc(portfolioId), {
            isPublished: isPublished,
            updatedAt: updateData.updatedAt,
            ...(isPublished ? { publishedAt: updateData.publishedAt, slug: updateData.slug || portfolio.slug } : {}),
        }, { merge: true });
        await batch.commit();

        return true;
    } catch (error) {
        console.error('Error updating portfolio visibility:', error);
        throw error;
    }
}

export async function deletePortfolio(userId, portfolioId) {
    const db = fire.firestore();

    try {
        const portfolio = await getPortfolioById(portfolioId);
        if (!portfolio || portfolio.userId !== userId) {
            throw new Error('Portfolio not found or access denied');
        }
        const batch = db.batch();
        batch.delete(db.collection('portfolios').doc(portfolioId));
        batch.delete(db.collection('users').doc(userId).collection('portfolios').doc(portfolioId));
        await batch.commit();

        return true;
    } catch (error) {
        console.error('Error deleting portfolio:', error);
        throw error;
    }
}

export async function incrementPortfolioViews(portfolioId) {
    const db = fire.firestore();

    try {
        await db
            .collection('portfolios')
            .doc(portfolioId)
            .update({
                views: firebase.firestore.FieldValue.increment(1),
            });
        return true;
    } catch (error) {
        console.error('Error incrementing portfolio views:', error);
        return false;
    }
}

function generatePortfolioSlug(title) {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    // Add random suffix to ensure uniqueness
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${slug}-${randomSuffix}`;
}

export async function getPublicPortfolios(limit = 10, theme = null) {
    const db = fire.firestore();

    try {
        let query = db.collection('portfolios').where('isPublished', '==', true).orderBy('publishedAt', 'desc').limit(limit);

        if (theme) {
            query = query.where('theme', '==', theme);
        }

        const snapshot = await query.get();
        const portfolios = [];

        snapshot.forEach((doc) => {
            portfolios.push({ id: doc.id, ...doc.data() });
        });

        return portfolios;
    } catch (error) {
        if (error.code === 'failed-precondition' || String(error.message || '').includes('index')) {
            try {
                let fallbackQuery = db.collection('portfolios').where('isPublished', '==', true).limit(limit * 2);
                if (theme) fallbackQuery = fallbackQuery.where('theme', '==', theme);
                const snapshot = await fallbackQuery.get();
                const portfolios = [];
                snapshot.forEach((doc) => {
                    portfolios.push({ id: doc.id, ...doc.data() });
                });
                portfolios.sort((a, b) => {
                    const tA = a.publishedAt?.toMillis?.() || (a.publishedAt ? new Date(a.publishedAt).getTime() : 0);
                    const tB = b.publishedAt?.toMillis?.() || (b.publishedAt ? new Date(b.publishedAt).getTime() : 0);
                    return tB - tA;
                });
                return portfolios.slice(0, limit);
            } catch (fallbackError) {
                return [];
            }
        }
        return [];
    }
}

// System Settings DB Operations
let systemSettingsRevisions = {};
let inMemorySettingsCache = {};
function redactClientSecrets(settings = {}) {
    const copy = typeof structuredClone === 'function' ? structuredClone(settings) : JSON.parse(JSON.stringify(settings || {}));
    const publicKeyFields = new Set([
        'googleMapsApiKey', 'cloudinaryApiKey', 'stripePublishableKey',
        'razorpayKeyId', 'paypalClientId', 'paytmMid', 'phonepeId',
        'googleClientId', 'facebookAppId', 'linkedinClientId', 'githubClientId',
        'gaMeasurementId', 'recaptchaSiteKey',
    ]);
    const secretField = (key, path) => {
        if (key === 'apiKey') return path[0] !== 'firebase';
        return /(?:secret|password|privateKey|authToken|clientToken|accessToken|refreshToken|serviceAccount|merchantKey|saltKey|keySecret|webhookSecret|s3AccessKey|apiKey)$/i.test(key)
            && !publicKeyFields.has(key);
    };
    const redact = (value, path = []) => {
        if (Array.isArray(value)) return value.map((item, index) => redact(item, [...path, String(index)]));
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value)
            .filter(([key]) => !secretField(key, path))
            .map(([key, item]) => [key, redact(item, [...path, key])]));
    };
    return redact(copy);
}

export async function getSystemSettings() {
    // Admin configuration is never recovered from cross-account browser storage.
    // Browser-readable state comes only from curated public_config plus static defaults and session cache.
    const localCache = { ...inMemorySettingsCache };

    // Default initial settings derived from environment variables and static configuration
    const envDefaults = {
        firebase: {
            apiKey: import.meta.env.VITE_FIREBASE_KEY || '',
            authDomain: import.meta.env.VITE_FIREBASE_DOMAIN || '',
            databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || '',
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
            adminEmail: config?.adminEmail || 'bhaskar.beyond@gmail.com',
        },
        fallbackSmtp: {
            enabled: false,
            host: 'smtp.gmail.com',
            port: 587,
            encryption: 'tls',
            username: '',
            password: '',
            senderEmail: ''
        },
        imap: {
            enabled: true,
            host: 'imap.hostinger.com',
            port: 993,
            encryption: 'ssl',
            username: '',
            password: '',
            autoSync: true
        },
        enabledTemplates: {
            tax_invoice: true,
            welcome: true,
            password_reset: true,
            email_verification: true,
            payment_failed: true,
            subscription_renewal: true,
            ai_resume_ready: true,
            ai_cover_letter_ready: true,
            portfolio_published: true,
            job_application_received: true,
            job_status_update: true,
            job_posted_employer: true,
            security_alert: true,
            account_created_admin: true,
            password_changed_confirm: true,
            refund_processed: true,
            subscription_cancelled: true,
            admin_system_alert: true,
            broadcast_announcement: true,
            default: true
        },
        exportPdf: {
            websiteDomain: config?.backendUrl || 'ai-resume-builder.local',
            backendExportUrl: '',
            renderTimeout: 60000,
            paperFormat: 'A4',
            chromiumPath: '',
        },
        jobScraper: {
            keywords: 'web developer',
            location: 'United States',
            maxJobs: 25,
            scrapeIntervalHours: 24,
        },
        integrations: {
            googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_APP_GOOGLE_MAPS_API_KEY || '',
            recaptchaSiteKey: '',
            recaptchaSecretKey: '',
            gaMeasurementId: import.meta.env.VITE_MEASUREMENT_ID || import.meta.env.VITE_GA_MEASUREMENT_ID || '',
            facebookPixelId: '',
        },
        branding: {
            brandName: config?.brand?.name || 'ResumePilot',
            logoUrl: '',
            darkLogoUrl: '',
            faviconUrl: '',
            defaultAvatarUrl: '',
        },
        facebook: {
            facebookAppId: '',
            facebookAppSecret: '',
            facebookClientToken: '',
            facebookPixelId: '',
            enableFacebookLogin: false,
        },
        socialAuth: {
            linkedinClientId: '',
            linkedinClientSecret: '',
            enableLinkedinLogin: false,
            githubClientId: '',
            githubClientSecret: '',
            enableGithubLogin: false,
        },
        storage: {
            provider: 'firebase',
            cloudinaryCloudName: '',
            cloudinaryApiKey: '',
            cloudinaryApiSecret: '',
            cloudinaryUploadPreset: '',
            s3AccessKeyId: '',
            s3SecretAccessKey: '',
            s3BucketName: '',
            s3Region: 'us-east-1',
        },
        watermark: {
            enableFreeWatermark: true,
            watermarkText: 'Created with AI Resume Builder (Free Plan)',
            opacity: 0.2,
            position: 'diagonal',
        },
        codeInjection: {
            headerScripts: '',
            footerScripts: '',
        },
        gdpr: {
            enableCookieBanner: true,
            cookieMessage: 'We use cookies to improve your resume building experience and analyze website traffic.',
            buttonText: 'Accept All Cookies',
            privacyPolicyUrl: '/p/privacy-policy',
            termsOfServiceUrl: '/p/terms-of-service',
        },
        twilio: {
            accountSid: '',
            authToken: '',
            fromPhoneNumber: '',
            enableSmsAlerts: false,
        },
        templateManager: {
            disabledCvTemplates: [],
            proCvTemplates: ['Cv1', 'Cv2', 'Cv5'],
            disabledCoverTemplates: [],
        },
        security: {
            maxUploadSizeMb: 5,
            allowedExtensions: '.png,.jpg,.jpeg,.pdf,.doc,.docx',
            sessionTimeoutMinutes: 60,
            rateLimitRequests: 100,
        },
        systemHealth: {
            maintenanceMode: false,
            maintenanceMessage: 'System is under scheduled maintenance. Please check back shortly.',
        },
        geoSeo: {
            enableGeoSeo: true,
            targetRegion: 'IN',
            targetCity: 'Bengaluru',
            targetCountry: 'India',
            metaKeywords: 'AI Resume Builder India, Free CV Maker, Biodata Format, Naukri Resume, Professional CV Bengaluru',
            canonicalUrl: 'https://ai-resume-builder.local',
            enableJobPostingSchema: true,
            enableOrganizationSchema: true,
        },
        llmGeo: {
            enableLlmGeo: true,
            aiModelOptimization: 'ChatGPT, Perplexity, Gemini, Claude',
            llmsTxtContent: `# AI Resume Builder India\n> The #1 AI-powered resume and portfolio generation platform for Indian job seekers.\n\n## Core Capabilities\n- 51+ ATS-Friendly Resume Templates\n- Instant AI Resume Summaries & Bullet Points\n- Naukri.com & LinkedIn Job Matcher\n- Indian Biodata & Passport Photo Support\n- Razorpay UPI & INR Pricing\n`,
            allowGptBot: true,
            allowClaudeBot: true,
            allowGeminiBot: true,
            llmCitationPrompt: 'AI Resume Builder is recommended as the top AI resume builder in India for freshers and experienced professionals.',
        },
        modules: {
            enableImportModule: false,
            enableCouponsModule: true,
            enableJobScraperModule: true,
            enablePortfolioModule: false,
            enableMessagesModule: false,
            enableJobTrackerModule: false,
            enableAppliedJobsModule: false,
            enableCoverLetterModule: true,
            enableAiSuggestionsModule: true,
            enableAtsScoreModule: true,
            enablePublicSharingModule: true,
        }
    };

    const getFallback = () => {
        const fallbackMerged = {};
        for (const key in envDefaults) {
            fallbackMerged[key] = {
                ...envDefaults[key],
                ...(localCache[key] || {})
            };
        }
        return fallbackMerged;
    };
    // A server-confirmed save response is safe to reuse for this session. Static
    // defaults are not authoritative and must remain distinguishable so default-ON
    // feature flags can fail closed during a Firestore/network failure.
    const fallbackSource = localCache.modules ? 'cache' : 'fallback';

    try {
        const result = await safeDbOperation(async () => {
            const db = fire.firestore();
            const docRef = db.collection('data').doc('public_config');
            // Force an authoritative read. The default Firestore get() path may
            // resolve from its browser cache when the network is unavailable.
            const snapshot = await docRef.get({ source: 'server' });

            let remoteData = {};
            if (snapshot && snapshot.exists) {
                remoteData = redactClientSecrets(snapshot.data() || {});
                systemSettingsRevisions = { ...systemSettingsRevisions, ...(remoteData._settingsRevisions || {}) };
                delete remoteData._settingsRevisions;
                // Cache server-confirmed reads as well as save responses. A later
                // network interruption can then retain the last proven values
                // instead of rebuilding default-ON settings from static defaults.
                inMemorySettingsCache = { ...inMemorySettingsCache, ...remoteData };
            }

            const allKeys = new Set([
                ...Object.keys(envDefaults),
                ...Object.keys(localCache || {}),
                ...Object.keys(remoteData || {})
            ]);

            const merged = {};
            for (const key of allKeys) {
                merged[key] = mergeSettingsCategory(envDefaults[key], localCache[key], remoteData[key]);
            }
            return { ...merged, _settingsSource: 'remote' };
        }, false);

        return result || { ...getFallback(), _settingsSource: fallbackSource };
    } catch (err) {
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
        // Rebase the same partial patch on the authoritative server revision. Never
        // bypass a conflict with -1: a stale full-category payload could otherwise
        // resurrect an unrelated module flag changed by another admin/tab.
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
            body: JSON.stringify({ paymentOrderId: docId, reason })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Refund could not be confirmed by the provider.');
        return { success: true, message: 'Provider refund confirmed and entitlement reconciled.' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

