import fire from '../conf/fire';
import axios from 'axios';
import config from '../conf/configuration';
import firebase from 'firebase/compat/app';
import { JOB_TRACKER_STATUSES, normalizeTrackedJob, validateTrackedJob } from '../utils/jobTracker';

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
    if (!snapshot.empty) {
        var messages = [];
        snapshot.forEach((doc) => {
            messages.push(doc.data());
        });
        return messages;
    } else {
        // if there is no documents return null
        return null;
    }
}

// Contact submissions cross the rate-limited server boundary; clients cannot write the
// moderation collection directly.
export async function addContactMessage(email, name, message) {
    const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, message, website: '' })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Unable to submit contact message.');
    return result;
}

// Edit Google track code. needs to bo with analytics
export function editTrackingCode(trackingCode) {
    const db = fire.firestore();
    db.collection('data').doc('meta').update({
        trackingCode: trackingCode,
    });
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
        .then((error) => console.log(error));
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
            console.log('Cover letter updated successfully');
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

            console.log('Cover letter created successfully with ID:', docRef.id);
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
export async function checkSbs(accountType, expDate) {
    const res = await axios.post(config.provider + '://' + config.backendUrl + '/api/check', {
        accountType: accountType,
        expDate: expDate,
    });
    var status = res.data['status'];
    return status;
}
// Check Sbs Date
export async function makeBasicAccount(userId) {
    const db = fire.firestore();
    await db
        .collection('users')
        .doc(userId)
        .update({
            membershipEnds: new Date('2017-05-05'),
            membership: 'Basic',
        })
        .then((error) => console.log(error));
}

// Get 7 Users
export async function get7Users() {
    const db = fire.firestore();
    const snapshot = await db.collection('users').limit(6).get();
    if (!snapshot.empty) {
        var users = [];
        snapshot.forEach((doc) => users.push(doc.data()));
        console.log(users);
        return users;
    } else {
        console.log('makan walo');
        return null;
    }
}

// Get All Users
export async function getAllUsers() {
    const db = fire.firestore();
    const snapshot = await db.collection('users').get();
    if (!snapshot.empty) {
        var users = [];
        snapshot.forEach((doc) => users.push(doc.data()));
        return users;
    } else {
        console.log('makan walo');
        return null;
    }
}

// Get All Subscriptuins
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
    if (!authUser || authUser.uid !== uid) return false;
    try {
        const token = await authUser.getIdTokenResult();
        return ['ADMIN', 'SUPER_ADMIN'].includes(String(token.claims.role || '').toUpperCase());
    } catch (error) {
        console.warn('Unable to verify admin claim:', error.message);
        return false;
    }
}
// Get User by id
export async function getUserById(id) {
    const db = fire.firestore();
    console.log(id);
    var user = null;
    await db
        .collection('users')
        .where('email', '==', id)
        .get()
        .then((snapshot) => {
            snapshot.forEach((doc) => {
                console.log(doc.data());
                user = doc.data();
            });
        });

    if (user !== null) {
        return user;
    } else {
        return false;
    }

    // console.log(snapshot);

    // if (snapshot.exists) {
    //   console.log(snapshot.data());
    //   return snapshot.data()
    // } else {
    //   console.log("not foiund");

    //   return false
    // }
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
            }, { merge: true }).then(() => console.log('User created successfully'));

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
    }).catch((error) => console.log('addUser error:', error));
}
async function updateUserByAdminApi(userId, changes) {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Administrative user update failed.');
    return result;
}

export async function editUser(userId, _email, membership, _membershipsEnds, _isA = null, suspended = null) {
    const changes = {};
    if (membership) changes.membership = membership;
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
export async function toggleUserSuspension(userId, suspend) {
    try {
        await updateUserByAdminApi(userId, { suspended: Boolean(suspend) });
        return { success: true, message: `User account ${suspend ? 'suspended' : 'reactivated'} successfully.` };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function setUserAdminStatus(userId, isAdmin) {
    try {
        await updateUserByAdminApi(userId, { role: isAdmin ? 'ADMIN' : 'USER' });
        return { success: true, message: `Admin status set to ${Boolean(isAdmin)}` };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function makeUserAdminByEmail(email) {
    const db = fire.firestore();
    try {
        const query = await db.collection('users').where('email', '==', email.trim().toLowerCase()).limit(1).get();
        if (query.empty) return { success: false, error: `User with email ${email} not found.` };
        return setUserAdminStatus(query.docs[0].id, true);
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
        const response = await fetch('/api/admin/delete-user', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: userId, email })
        });
        const result = await response.json().catch(() => ({}));
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
            console.log('ℹ️ Promo Coupons Module is DISABLED in Admin Module Settings.');
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
    const db = fire.firestore();
    try {
        const snap = await db.collection('coupons').get();
        const list = [];
        snap.forEach((doc) => {
            if (doc.id === '_meta') return;
            const data = doc.data();
            list.push({
                code: doc.id.toUpperCase(),
                discount: Number(data.discount) || 10,
                description: data.description || `${data.discount}% Discount`,
                active: data.active !== false,
                expiryDate: data.expiryDate || '',
                maxUses: Number(data.maxUses) || 0,
                usedCount: Number(data.usedCount) || 0,
                singleUsePerUser: Boolean(data.singleUsePerUser),
            });
        });
        list.sort((a, b) => a.code.localeCompare(b.code));
        return list;
    } catch (err) {
        console.warn('⚠️ Could not fetch admin coupons:', err.message);
        return [];
    }
}

// Create or update a coupon doc in Firestore (Admin)
export async function saveCoupon(code, discount, description, active = true, extra = {}) {
    const db = fire.firestore();
    try {
        const cleanCode = code.trim().toUpperCase();
        await db.collection('coupons').doc(cleanCode).set({
            code: cleanCode,
            discount: Number(discount),
            description: description || `${discount}% Discount`,
            active: Boolean(active),
            expiryDate: extra.expiryDate || '',
            maxUses: Number(extra.maxUses) || 0,
            singleUsePerUser: Boolean(extra.singleUsePerUser),
            usedCount: Number(extra.usedCount) || 0,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return { success: true, message: `Coupon ${cleanCode} saved successfully!` };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// Increment coupon usage count when redeemed
export async function incrementCouponUsage(code) {
    const db = fire.firestore();
    try {
        const cleanCode = code.trim().toUpperCase();
        await db.collection('coupons').doc(cleanCode).set({
            usedCount: firebase.firestore.FieldValue.increment(1),
        }, { merge: true });
    } catch (e) {
        console.warn('⚠️ Could not increment coupon usage:', e.message);
    }
}

// Delete a coupon doc from Firestore (Admin)
export async function deleteCoupon(code) {
    const db = fire.firestore();
    try {
        await db.collection('coupons').doc(code.toUpperCase()).delete();
        return { success: true, message: `Coupon ${code} deleted!` };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// Record a user billing transaction in 'transactions' collection
export async function recordTransaction(userId, details) {
    const db = fire.firestore();
    try {
        const txnId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
        await db.collection('transactions').doc(txnId).set({
            txnId,
            userId,
            email: details.email || '',
            amount: Number(details.amount) || 0,
            currency: details.currency || 'USD',
            planName: details.planName || 'PRO Membership',
            durationMonths: Number(details.durationMonths) || 12,
            paymentMethod: details.paymentMethod || 'Card/PayPal/UPI',
            couponUsed: details.couponUsed || null,
            status: details.status || 'Completed',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdDateString: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        });
        return { success: true, txnId };
    } catch (err) {
        console.warn('⚠️ Could not record transaction:', err.message);
        return { success: false, error: err.message };
    }
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
export async function updateUserSubscription(userId, membership) {
    try {
        await updateUserByAdminApi(userId, { membership });
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
        .then((error) => console.log(error));
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
    console.log('in incrementing function  ' + userid);

    const db = fire.firestore();
    const userRef = db.collection('users').doc(userid);
    const snapshot = await userRef.get();
    if (!snapshot.exists) {
        console.log('iNCREMENTING ONE ' + userid);
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
    } else {
        console.log('notfound');
    }
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
        console.log('Submitting employer application for user:', userId);
        console.log('Application data:', applicationData);

        // Store the application in a separate collection for review
        const applicationRef = db.collection('employerApplications').doc(userId);
        await applicationRef.set({
            userId: userId,
            ...applicationData,
            status: 'pending',
            submittedAt: new Date(),
        });

        console.log('Application document created successfully');
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

// Get all employer applications (admin function)
export async function getAllEmployerApplications() {
    const db = fire.firestore();
    try {
        const snapshot = await db.collection('employerApplications').orderBy('submittedAt', 'desc').get();
        if (!snapshot.empty) {
            const applications = [];
            snapshot.forEach((doc) => {
                applications.push({
                    id: doc.id,
                    ...doc.data(),
                });
            });
            return applications;
        } else {
            return [];
        }
    } catch (error) {
        console.error('Error getting employer applications:', error);
        return [];
    }
}

async function reviewEmployerApplication(userId, status, reason = '') {
    try {
        const response = await fetch(`/api/admin/employer-applications/${encodeURIComponent(userId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, reason })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to review employer application.');
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function approveEmployerApplication(userId) {
    return reviewEmployerApplication(userId, 'approved');
}

export async function rejectEmployerApplication(userId, reason = '') {
    return reviewEmployerApplication(userId, 'rejected', reason);
}

export async function reactivateEmployerApplication(userId) {
    return reviewEmployerApplication(userId, 'active');
}

// ==================== COMPANY MANAGEMENT FUNCTIONS ====================
// Create a new company
export async function createCompany(employerId, companyData) {
    const db = fire.firestore();
    try {
        console.log('=== CREATING COMPANY ===');
        console.log('Collection: companies');
        console.log('Employer ID:', employerId);
        console.log('Company data:', JSON.stringify(companyData, null, 2));

        const finalCompanyData = {
            employerId: employerId,
            ...companyData,
            status: 'pending', // Companies need approval
            // Job statistics - initialized when company is created
            stats: {
                totalJobs: 0,
                activeJobs: 0,
                expiredJobs: 0,
                totalApplications: 0,
                lastJobPosted: null,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        console.log('Final company data to be saved:', JSON.stringify(finalCompanyData, null, 2));

        const companyRef = await db.collection('companies').add(finalCompanyData);

        console.log('✅ Company created successfully!');
        console.log('Company ID:', companyRef.id);
        console.log('Collection path: companies/' + companyRef.id);

        return { success: true, companyId: companyRef.id };
    } catch (error) {
        console.error('❌ Error creating company:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Full error:', error);
        return { success: false, error: error.message };
    }
}

// Get companies for an employer
export async function getEmployerCompanies(employerId) {
    const db = fire.firestore();
    try {
        console.log('=== GETTING EMPLOYER COMPANIES ===');
        console.log('Employer ID:', employerId);
        console.log('Query: companies collection where employerId ==', employerId);

        // First, let's try without orderBy to avoid composite index issues
        const snapshot = await db.collection('companies')
            .where('employerId', '==', employerId)
            .get();

        console.log('Query executed. Snapshot empty?', snapshot.empty);
        console.log('Snapshot size:', snapshot.size);

        if (!snapshot.empty) {
            const companies = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                console.log('Found company document:', doc.id, data);
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

            console.log('✅ Found companies:', companies.length);
            console.log('Companies data:', companies);
            return companies;
        } else {
            console.log('❌ No companies found for employer:', employerId);
            
            // Let's also check if there are ANY companies in the collection
            const allCompaniesSnapshot = await db.collection('companies').limit(5).get();
            console.log('Total companies in collection (first 5):');
            allCompaniesSnapshot.forEach((doc) => {
                const data = doc.data();
                console.log('  Company ID:', doc.id, 'employerId:', data.employerId, 'name:', data.name);
            });
            
            return [];
        }
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
        } else {
            console.log('❌ No companies found for employer:', employerId);
            
            // Let's also check if there are ANY companies in the collection
            const allCompaniesSnapshot = await db.collection('companies').limit(5).get();
            allCompaniesSnapshot.forEach((doc) => {
                const data = doc.data();
                console.log('  Company ID:', doc.id, 'employerId:', data.employerId, 'status:', data.status, 'name:', data.name);
            });
            
            return [];
        }
    } catch (error) {
        console.error('❌ Error getting approved employer companies:', error);
        console.error('Error details:', error.message);
        console.error('Error code:', error.code);
        return [];
    }
}

// Update a company
export async function updateCompany(companyId, companyData) {
    const db = fire.firestore();
    try {
        console.log('=== UPDATING COMPANY ===');
        console.log('Company ID:', companyId);
        console.log('Update data:', JSON.stringify(companyData, null, 2));

        const updateData = {
            ...companyData,
            updatedAt: new Date(),
        };

        await db.collection('companies').doc(companyId).update(updateData);

        console.log('✅ Company updated successfully!');
        return { success: true };
    } catch (error) {
        console.error('❌ Error updating company:', error);
        return { success: false, error: error.message };
    }
}

// Delete a company
export async function deleteCompany(companyId) {
    const db = fire.firestore();
    try {
        console.log('=== DELETING COMPANY ===');
        console.log('Company ID:', companyId);

        await db.collection('companies').doc(companyId).delete();

        console.log('✅ Company deleted successfully!');
        return { success: true };
    } catch (error) {
        console.error('❌ Error deleting company:', error);
        return { success: false, error: error.message };
    }
}

// Admin functions for company management
// Get all companies (admin function)
export async function getAllCompanies() {
    const db = fire.firestore();
    try {
        const snapshot = await db.collection('companies').orderBy('createdAt', 'desc').get();
        if (!snapshot.empty) {
            const companies = [];
            snapshot.forEach((doc) => {
                companies.push({
                    id: doc.id,
                    ...doc.data(),
                });
            });
            return companies;
        } else {
            return [];
        }
    } catch (error) {
        console.error('Error getting all companies:', error);
        return [];
    }
}

// Approve company (admin function)
export async function approveCompany(companyId) {
    const db = fire.firestore();
    try {
        await db.collection('companies').doc(companyId).update({
            status: 'approved',
            approvedAt: new Date(),
        });
        return { success: true };
    } catch (error) {
        console.error('Error approving company:', error);
        return { success: false, error: error.message };
    }
}

// Reject company (admin function)
export async function rejectCompany(companyId, reason = '') {
    const db = fire.firestore();
    try {
        await db.collection('companies').doc(companyId).update({
            status: 'rejected',
            rejectedAt: new Date(),
            rejectionReason: reason,
        });
        return { success: true };
    } catch (error) {
        console.error('Error rejecting company:', error);
        return { success: false, error: error.message };
    }
}

// Toggle company featured status (admin function)
export async function toggleCompanyFeatured(companyId, featured = true) {
    const db = fire.firestore();
    try {
        const updateData = {
            featured: featured,
            updatedAt: new Date(),
        };
        
        if (featured) {
            updateData.featuredAt = new Date();
        }
        
        await db.collection('companies').doc(companyId).update(updateData);
        console.log(`Company ${companyId} featured status updated to: ${featured}`);
        return { success: true };
    } catch (error) {
        console.error('Error updating company featured status:', error);
        return { success: false, error: error.message };
    }
}

// Get featured companies for public display
export async function getFeaturedCompanies(limit = 8) {
    const db = fire.firestore();
    try {
        console.log('🔍 Getting featured companies from Firestore...');
        
        // Try with orderBy first (requires composite index)
        let snapshot;
        try {
            snapshot = await db.collection('companies')
                .where('status', '==', 'approved')
                .where('featured', '==', true)
                .orderBy('featuredAt', 'desc')
                .limit(limit)
                .get();
            console.log('✅ Query with orderBy succeeded');
        } catch (indexError) {
            console.log('⚠️ Composite index not available, trying without orderBy:', indexError.message);
            // Fallback: query without orderBy if composite index doesn't exist
            snapshot = await db.collection('companies')
                .where('status', '==', 'approved')
                .where('featured', '==', true)
                .limit(limit)
                .get();
            console.log('✅ Query without orderBy succeeded');
        }
        
        console.log('📊 Featured companies snapshot empty?', snapshot.empty);
        console.log('📊 Featured companies snapshot size:', snapshot.size);
            
        if (!snapshot.empty) {
            const companies = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                console.log('📄 Featured company found:', doc.id, data.name, data.featured);
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
            
            console.log('✅ Returning', companies.length, 'featured companies');
            return companies;
        } else {
            console.log('❌ No featured companies found in Firestore');
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
    const db = fire.firestore();
    try {
        console.log('=== CREATING JOB POSTING ===');
        console.log('Collection: jobs');
        console.log('Employer ID:', employerId);
        console.log('Job data:', JSON.stringify(jobData, null, 2));

        const finalJobData = {
            employerId: employerId,
            ...jobData,
            // Don't override status if it's already set in jobData
            status: jobData.status || 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
            applicationsCount: 0,
            viewsCount: 0,
        };

        console.log('Final job data to be saved:', JSON.stringify(finalJobData, null, 2));

        const jobRef = await db.collection('jobs').add(finalJobData);

        console.log('✅ Job created successfully!');
        console.log('Job ID:', jobRef.id);
        console.log('Collection path: jobs/' + jobRef.id);

        return { success: true, jobId: jobRef.id };
    } catch (error) {
        console.error('❌ Error creating job posting:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Full error:', error);
        return { success: false, error: error.message };
    }
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

        console.log(`✅ Filtered ${filteredJobs.length} jobs from ${allJobs.length} total jobs`);

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

        console.log(`✅ Fetched ${paginatedJobs.length} active jobs for page ${page} (${totalItems} total after filtering)`);

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
    const db = fire.firestore();
    try {
        console.log('🔍 getEmployerJobs called with employerId:', employerId);
        console.log('🔍 Querying jobs collection where employerId ==', employerId);

        // Temporarily remove orderBy to avoid index requirement
        // TODO: Add back orderBy('createdAt', 'desc') after creating the composite index
        const snapshot = await db.collection('jobs').where('employerId', '==', employerId).get();

        console.log('📊 Query snapshot empty?', snapshot.empty);
        console.log('📊 Query snapshot size:', snapshot.size);

        if (!snapshot.empty) {
            const jobs = [];
            snapshot.forEach((doc) => {
                const jobData = doc.data();
                console.log('📄 Job document:', doc.id, jobData);
                jobs.push({
                    id: doc.id,
                    ...jobData,
                });
            });

            // Sort by createdAt descending (newest first) on client side
            jobs.sort((a, b) => {
                const dateA = a.createdAt?.toDate?.() || a.createdAt || new Date(0);
                const dateB = b.createdAt?.toDate?.() || b.createdAt || new Date(0);
                return new Date(dateB) - new Date(dateA);
            });

            console.log('✅ Returning sorted jobs:', jobs);
            return jobs;
        } else {
            console.log('❌ No jobs found for employerId:', employerId);
            console.log('❌ Possible issues:');
            console.log('   1. No jobs exist with this employerId');
            console.log('   2. employerId field name might be different');
            console.log('   3. employerId value might be stored differently');

            // Let's also check if there are any jobs at all in the collection
            const allJobsSnapshot = await db.collection('jobs').limit(5).get();
            console.log('🔍 Sample jobs in collection (first 5):');
            allJobsSnapshot.forEach((doc) => {
                const data = doc.data();
                console.log('   Job ID:', doc.id, 'employerId:', data.employerId, 'title:', data.title);
            });

            return [];
        }
    } catch (error) {
        console.error('❌ Error getting employer jobs:', error);
        console.error('❌ Error details:', error.message);
        console.error('❌ Error code:', error.code);
        return [];
    }
}

// Update job posting
export async function updateJobPosting(jobId, updateData) {
    const db = fire.firestore();
    try {
        await db
            .collection('jobs')
            .doc(jobId)
            .update({
                ...updateData,
                updatedAt: new Date(),
            });

        return { success: true };
    } catch (error) {
        console.error('Error updating job posting:', error);
        return { success: false, error: error.message };
    }
}

// Delete job posting
export async function deleteJobPosting(jobId) {
    const db = fire.firestore();
    try {
        await db.collection('jobs').doc(jobId).delete();
        return { success: true };
    } catch (error) {
        console.error('Error deleting job posting:', error);
        return { success: false, error: error.message };
    }
}

// Get job applications for a specific job
export async function getJobApplications(jobId) {
    const db = fire.firestore();
    try {
        // Temporarily remove orderBy to avoid index requirement
        // TODO: Add back orderBy('appliedAt', 'desc') after creating the composite index
        const snapshot = await db.collection('jobApplications').where('jobId', '==', jobId).get();

        if (!snapshot.empty) {
            const applications = [];
            snapshot.forEach((doc) => {
                const applicationData = doc.data();
                applications.push({
                    id: doc.id,
                    ...applicationData,
                });
            });

            // Sort by appliedAt descending (newest first) on client side
            applications.sort((a, b) => {
                const dateA = a.appliedAt?.toDate?.() || a.appliedAt || new Date(0);
                const dateB = b.appliedAt?.toDate?.() || b.appliedAt || new Date(0);
                return new Date(dateB) - new Date(dateA);
            });

            return applications;
        } else {
            return [];
        }
    } catch (error) {
        console.error('Error getting job applications:', error);
        return [];
    }
}

// Submit a job application
export async function submitJobApplication(userId, jobId, applicationData) {
    const db = fire.firestore();
    try {
        // Validate required fields
        if (!userId) {
            return { success: false, error: 'User ID is required' };
        }
        if (!jobId) {
            return { success: false, error: 'Job ID is required' };
        }
        if (!applicationData.fullName || !applicationData.email) {
            return { success: false, error: 'Full name and email are required' };
        }

        // Check if user has already applied to this job
        const existingApplicationQuery = await db.collection('jobApplications').where('userId', '==', userId).where('jobId', '==', jobId).get();

        if (!existingApplicationQuery.empty) {
            return { success: false, error: 'You have already applied to this job' };
        }

        // Get job details for notification
        const jobDoc = await db.collection('jobs').doc(jobId).get();
        const jobData = jobDoc.exists ? jobDoc.data() : null;

        // Prepare application data - ensure no undefined values
        const finalApplicationData = {
            userId: userId || '',
            jobId: jobId || '',
            applicantName: applicationData.fullName || '',
            applicantEmail: applicationData.email || '',
            fullName: applicationData.fullName || '',
            email: applicationData.email || '',
            phone: applicationData.phone || '',
            linkedinUrl: applicationData.linkedinUrl || '',
            githubUrl: applicationData.githubUrl || '',
            coverLetter: applicationData.coverLetter || '',
            selectedResume: applicationData.selectedResume ? {
                id: applicationData.selectedResume.id || '',
                name: applicationData.selectedResume.name || '',
                shareableLink: applicationData.selectedResume.shareableLink || '',
                data: applicationData.selectedResume.data || null
            } : null,
            resumeId: applicationData.selectedResume?.id || '',
            resumeUrl: applicationData.selectedResume?.shareableLink || '',
            status: 'pending',
            appliedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            jobSnapshot: jobData ? {
                title: jobData.title || '',
                company: jobData.company || '',
                location: jobData.location || '',
                country: jobData.country || '',
                minSalary: jobData.minSalary ?? null,
                maxSalary: jobData.maxSalary ?? null,
                jobType: jobData.jobType || jobData.type || '',
                workMode: jobData.workMode || '',
                description: String(jobData.description || '').slice(0, 10000),
                requirements: Array.isArray(jobData.requirements) ? jobData.requirements.slice(0, 50) : [],
            } : null,
            // Add fields that might be missing to prevent undefined values
            skills: [], // Initialize as empty array
            experience: '', // Initialize as empty string
            appliedDate: new Date(), // Ensure we have a date field
        };

        // Deep sanitization function to remove undefined values recursively
        const sanitizeObject = (obj) => {
            if (obj === null || obj === undefined) {
                return null;
            }
            
            if (Array.isArray(obj)) {
                return obj.map(item => sanitizeObject(item));
            }
            
            if (typeof obj === 'object') {
                const sanitized = {};
                Object.keys(obj).forEach(key => {
                    const value = obj[key];
                    if (value !== undefined) {
                        sanitized[key] = sanitizeObject(value);
                    }
                });
                return sanitized;
            }
            
            return obj;
        };

        // Apply deep sanitization
        const sanitizedApplicationData = sanitizeObject(finalApplicationData);

        // Deterministic ownership-bound IDs plus a transaction prevent simultaneous tabs
        // from creating duplicate applications or double-incrementing the job counter.
        const applicationRef = db.collection('jobApplications').doc(`${userId}_${jobId}`);
        const jobRef = db.collection('jobs').doc(jobId);
        await db.runTransaction(async (transaction) => {
            const existing = await transaction.get(applicationRef);
            if (existing.exists) {
                const duplicateError = new Error('You have already applied to this job');
                duplicateError.code = 'already-exists';
                throw duplicateError;
            }
            transaction.set(applicationRef, sanitizedApplicationData);
            transaction.update(jobRef, {
                applicationsCount: firebase.firestore.FieldValue.increment(1),
                updatedAt: new Date(),
            });
        });

        // Create notification for job application
        const jobTitle = jobData?.title || 'Unknown Job';
        const companyName = jobData?.company || 'Unknown Company';
        try {
            await createNotification(userId, {
                type: 'job_application',
                title: 'Application Submitted',
                message: `Your application for ${jobTitle} at ${companyName} has been submitted successfully.`,
                data: {
                    jobId: jobId,
                    applicationId: applicationRef.id,
                    jobTitle: jobTitle,
                    company: companyName
                }
            });
        } catch (notificationError) {
            console.warn('Application saved but confirmation notification failed', notificationError);
        }

        return { success: true, applicationId: applicationRef.id };
    } catch (error) {
        console.error('❌ Error submitting job application:', error);
        console.error('❌ Error details:', error.message);
        console.error('❌ Error code:', error.code);

        // Provide more specific error messages
        let errorMessage = error.message;
        if (error.code === 'permission-denied') {
            errorMessage = 'Permission denied. Please make sure you are logged in.';
        } else if (error.code === 'unavailable') {
            errorMessage = 'Service temporarily unavailable. Please try again later.';
        }

        return { success: false, error: errorMessage };
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
    await reference.set({ ...job, createdAt: now, updatedAt: now });
    return { id: reference.id, ...job, createdAt: now.toDate(), updatedAt: now.toDate() };
}

export async function updateTrackedJob(userId, jobId, patch) {
    if (!userId || !jobId) throw new Error('A tracked job and authenticated user are required');
    const allowed = Object.fromEntries(Object.entries(patch || {}).filter(([key]) =>
        ['title', 'company', 'location', 'url', 'notes', 'deadline', 'status', 'order'].includes(key)));
    if (allowed.status && !JOB_TRACKER_STATUSES.includes(allowed.status)) throw new Error('Invalid tracker status');
    const normalized = normalizeTrackedJob(allowed);
    if (Object.hasOwn(allowed, 'title') && !normalized.title) throw new Error('Job title is required');
    if (Object.hasOwn(allowed, 'company') && !normalized.company) throw new Error('Company is required');
    if (allowed.url && !normalized.url) throw new Error('Use a valid web address');
    const update = Object.fromEntries(Object.keys(allowed).map((key) => [key, normalized[key]]));
    update.updatedAt = firebase.firestore.Timestamp.now();
    await fire.firestore().collection('users').doc(userId).collection('jobTracker').doc(jobId).update(update);
    return update;
}

export async function deleteTrackedJob(userId, jobId) {
    if (!userId || !jobId) throw new Error('A tracked job and authenticated user are required');
    await fire.firestore().collection('users').doc(userId).collection('jobTracker').doc(jobId).delete();
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

// Update application status
export async function updateApplicationStatus(applicationId, status, notes = '') {
    const db = fire.firestore();
    try {
        // Get the application and job details for the notification
        const applicationDoc = await db.collection('jobApplications').doc(applicationId).get();
        if (!applicationDoc.exists) {
            return { success: false, error: 'Application not found' };
        }
        
        const applicationData = applicationDoc.data();
        const jobDoc = await db.collection('jobs').doc(applicationData.jobId).get();
        const jobData = jobDoc.exists ? jobDoc.data() : null;
        
        // Update the application status
        await db.collection('jobApplications').doc(applicationId).update({
            status: status,
            statusUpdatedAt: new Date(),
            employerNotes: notes,
        });

        // Create notification for the applicant
        const jobTitle = jobData?.title || 'Unknown Job';
        const companyName = jobData?.company || 'Unknown Company';
        
        let notificationData = {
            data: {
                jobId: applicationData.jobId,
                applicationId: applicationId,
                jobTitle: jobTitle,
                company: companyName
            }
        };
        
        switch (status) {
            case 'interview':
                notificationData = {
                    ...notificationData,
                    type: 'application_interview',
                    title: 'Interview Invitation',
                    message: `Good news! You've been invited for an interview for ${jobTitle} at ${companyName}.${notes ? ' Additional notes: ' + notes : ''}`
                };
                break;
            case 'accepted':
                notificationData = {
                    ...notificationData,
                    type: 'application_accepted',
                    title: 'Application Accepted',
                    message: `Congratulations! Your application for ${jobTitle} at ${companyName} has been accepted.${notes ? ' Additional notes: ' + notes : ''}`
                };
                break;
            case 'rejected':
                notificationData = {
                    ...notificationData,
                    type: 'application_rejected',
                    title: 'Application Update',
                    message: `Thank you for your interest in ${jobTitle} at ${companyName}. Unfortunately, we have decided to move forward with other candidates.${notes ? ' Feedback: ' + notes : ''}`
                };
                break;
            default:
                notificationData = {
                    ...notificationData,
                    type: 'application_status_update',
                    title: 'Application Status Update',
                    message: `Your application status for ${jobTitle} at ${companyName} has been updated to ${status}.${notes ? ' Notes: ' + notes : ''}`
                };
        }
        
        // Send notification to the applicant
        await createNotification(applicationData.userId, notificationData);
        
        console.log('✅ Application status updated and notification sent');
        return { success: true };
    } catch (error) {
        console.error('Error updating application status:', error);
        return { success: false, error: error.message };
    }
}

// Update application status with custom rejection message
export async function updateApplicationStatusWithMessage(applicationId, status, customMessage = '') {
    return await updateApplicationStatus(applicationId, status, customMessage);
}

// Admin function: Get all jobs with pagination and filtering
export async function getAllJobs(page = 1, itemsPerPage = 10, filters = {}) {
    const db = fire.firestore();
    try {
        console.log('Fetching all jobs for admin - page:', page, 'itemsPerPage:', itemsPerPage, 'filters:', filters);

        // Get all jobs (not just active ones)
        const allJobsQuery = db.collection('jobs');
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

        // Apply server-side filtering
        let filteredJobs = allJobs;

        // Apply search filter
        if (filters.searchTerm) {
            const searchTerm = filters.searchTerm.toLowerCase();
            filteredJobs = filteredJobs.filter(
                (job) => job.title?.toLowerCase().includes(searchTerm) || job.company?.toLowerCase().includes(searchTerm) || job.description?.toLowerCase().includes(searchTerm)
            );
        }

        // Apply status filter
        if (filters.status && filters.status !== 'all') {
            filteredJobs = filteredJobs.filter((job) => job.status === filters.status);
        }

        // Apply job type filter
        if (filters.jobType && filters.jobType.length > 0) {
            filteredJobs = filteredJobs.filter((job) => filters.jobType.includes(job.jobType));
        }

        // Apply work mode filter
        if (filters.workMode && filters.workMode.length > 0) {
            filteredJobs = filteredJobs.filter((job) => filters.workMode.includes(job.workMode));
        }

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

        console.log(`✅ Fetched ${paginatedJobs.length} jobs for admin page ${page} (${totalItems} total after filtering)`);

        return {
            success: true,
            jobs: paginatedJobs,
            pagination: {
                totalItems,
                totalPages,
                currentPage: page,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        };
    } catch (error) {
        console.error('Error fetching all jobs for admin:', error);
        return { success: false, error: error.message };
    }
}

// Admin function: Update job status
export async function updateJobStatus(jobId, status) {
    const db = fire.firestore();
    try {
        await db.collection('jobs').doc(jobId).update({
            status: status,
            updatedAt: new Date(),
        });

        return { success: true };
    } catch (error) {
        console.error('Error updating job status:', error);
        return { success: false, error: error.message };
    }
}

// Admin function: Toggle job featured status
export async function toggleJobFeatured(jobId, isFeatured) {
    const db = fire.firestore();
    try {
        console.log(`🌟 Toggling job featured status: ${jobId} -> ${isFeatured}`);
        
        await db.collection('jobs').doc(jobId).update({
            isFeatured: isFeatured,
            featuredAt: isFeatured ? new Date() : null,
            updatedAt: new Date(),
        });

        console.log('✅ Job featured status updated successfully');
        return { success: true };
    } catch (error) {
        console.error('❌ Error updating job featured status:', error);
        return { success: false, error: error.message };
    }
}

// Get a single job by ID
export async function getJobById(jobId) {
    const db = fire.firestore();
    try {
        console.log('🔍 Getting job by ID:', jobId);
        
        const doc = await db.collection('jobs').doc(jobId).get();
        
        if (doc.exists) {
            const data = doc.data();
            const createdDate = data.createdAt?.toDate?.() || data.createdAt;
            
            console.log('📄 Job found:', doc.id, data.title);
            
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
            
            console.log('✅ Returning job details:', job);
            return job;
        } else {
            console.log('❌ Job not found with ID:', jobId);
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
        console.log('🔍 Getting featured jobs from Firestore...');
        
        // Get active jobs that are featured
        const snapshot = await db.collection('jobs')
            .where('status', '==', 'active')
            .where('isFeatured', '==', true)
            .orderBy('featuredAt', 'desc')
            .limit(limit)
            .get();
        
        console.log('📊 Featured jobs snapshot empty?', snapshot.empty);
        console.log('📊 Featured jobs snapshot size:', snapshot.size);
            
        if (!snapshot.empty) {
            const jobs = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                const createdDate = data.createdAt?.toDate?.() || data.createdAt;
                
                console.log('📄 Featured job found:', doc.id, data.title, data.isFeatured);
                
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
            
            console.log('✅ Returning', jobs.length, 'featured jobs');
            return jobs;
        } else {
            console.log('❌ No featured jobs found in Firestore');
            return [];
        }
    } catch (error) {
        console.error('🚨 Error getting featured jobs:', error);
        console.error('🚨 Error code:', error.code);
        console.error('🚨 Error message:', error.message);
        
        // If there's a composite index error, try without orderBy
        if (error.code === 'failed-precondition' || error.message.includes('index')) {
            console.log('⚠️ Composite index not available, trying without orderBy');
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
                    
                    console.log('✅ Fallback query succeeded, returning', jobs.length, 'featured jobs');
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
            return {
                ...data,
                ...(localCache || {})
            };
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
export function settWebsiteData(title, description, keywords, language, disabledLanguages = []) {
    const websiteData = {
        title: title || '',
        description: description || '',
        keywords: keywords || '',
        language: language || 'English',
        disabledLanguages: Array.isArray(disabledLanguages) ? disabledLanguages : [],
    };

    try {
        if (typeof window !== 'undefined') {
            localStorage.setItem('website_meta_cache', JSON.stringify(websiteData));
        }
    } catch (e) {}

    const db = fire.firestore();
    const userRef = db.collection('data').doc('meta');
    
    userRef.set(websiteData, { merge: true }).catch((error) => {
        console.error('Error saving website data:', error);
    });
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
    const response = await fetch('/api/admin/payment-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subData)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save payment settings.');
    try {
        if (typeof window !== 'undefined') {
            // Cache only the backend-curated public projection; never persist secrets.
            localStorage.setItem('subscriptions_cache', JSON.stringify(result.settings || {}));
        }
    } catch (error) {
        console.warn('Could not cache public subscription settings:', error);
    }
    return result;
}

// Admin Master Invoice Fetcher
export async function getAllInvoicesAdmin() {
    return getAllAdminTransactions();
}

// Manual grants use the audited server entitlement endpoint.
export async function grantProSubscriptionAdmin(userId, _planType = 'yearly', durationMonths = 12) {
    try {
        const normalizedDuration = Number(durationMonths) === 999 ? 600 : Number(durationMonths);
        const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
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
    let localCache = null;
    try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('subscriptions_cache') : null;
        if (raw) {
            localCache = redactSubscriptionSecrets(JSON.parse(raw));
            localStorage.setItem('subscriptions_cache', JSON.stringify(localCache));
        }
    } catch (e) {
        console.warn('Could not read subscriptions_cache from localStorage:', e);
    }

    const res = await safeDbOperation(async () => {
        const db = fire.firestore();
        const userRef = db.collection('data').doc('public_config');
        const snapshot = await userRef.get();
        if (snapshot && snapshot.exists) {
            const data = redactSubscriptionSecrets(snapshot.data()?.subscriptions || {});
            return {
                ...(localCache || {}),
                ...data
            };
        }
        return localCache;
    }, false);

    return res || localCache || {
        state: true,
        monthlyPrice: 199,
        quartarlyPrice: 399,
        yearlyPrice: 499,
        onlyPP: false,
        currency: 'INR',
        razorpayUPI: true,
        stripeEnabled: true,
        paypalEnabled: true,
        razorpayEnabled: true,
        sandboxMode: false,
        enableTax: true,
        taxName: 'GST',
        taxRate: 18,
        taxInclusive: false,
        companyTaxId: '27AAAAA0000A1Z5',
        requireCustomerTaxId: false,
        receiptTemplate: 'modern',
    };
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
    const db = fire.firestore();
    await db.collection('users').doc(user.uid).update({
        email: newEmail
    }).catch(() => {});
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
    const response = await fetch('/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'Unable to delete account.');
    await fire.auth().signOut().catch(() => {});
    return true;
}

// Export all user data as JSON (GDPR Compliant Data Portability)
export async function exportUserDataJSON(uid) {
    if (!uid) {
        const user = fire.auth().currentUser;
        if (user) uid = user.uid;
        else throw new Error("User not logged in");
    }

    const db = fire.firestore();

    const userDoc = await db.collection('users').doc(uid).get();
    const profile = userDoc.exists ? userDoc.data() : {};

    const resumesSnap = await db.collection('users').doc(uid).collection('resumes').get();
    const resumes = [];
    resumesSnap.forEach(doc => resumes.push({ id: doc.id, ...doc.data() }));

    const coverSnap = await db.collection('users').doc(uid).collection('coverLetters').get();
    const coverLetters = [];
    coverSnap.forEach(doc => coverLetters.push({ id: doc.id, ...doc.data() }));

    let transactions = [];
    try {
        const txnSnap = await db.collection('transactions').where('userId', '==', uid).get();
        txnSnap.forEach(doc => transactions.push({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.warn('Transactions export notice:', e);
    }

    return {
        exportDate: new Date().toISOString(),
        userId: uid,
        profile: profile,
        resumes: resumes,
        coverLetters: coverLetters,
        transactions: transactions
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
        const res = await fetch('/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        return data;
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
export async function setFrontendStats(stats) {
    const db = fire.firestore();
    const statsRef = db.collection('data').doc('frontendstats');
    try {
        await statsRef.set(stats);
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
}
// Get ads
export async function getAds() {
    const db = fire.firestore();
    const adsRef = db.collection('ads');
    var allDocs = [];
    await adsRef.get().then((snapshot) => {
        snapshot.forEach((item) => {
            allDocs.push(item.data());
        });
    });
    if (allDocs.length > 0) {
        return allDocs;
    } else {
        return null;
    }
}

// ==================== BLOG MANAGEMENT FUNCTIONS ====================

// Create a new blog post
export async function createBlogPost(userId, postData) {
    const db = fire.firestore();
    try {
        const postRef = db.collection('blog_posts').doc();
        // A document-derived suffix avoids a collection-wide uniqueness query that members
        // are not authorized to run against other authors' pending posts.
        const slugBase = generateSlug(postData.slug || postData.title) || 'article';
        const slug = `${slugBase}-${postRef.id.slice(0, 8).toLowerCase()}`;

        const finalPostData = {
            title: postData.title,
            slug: slug,
            content: postData.content,
            excerpt: postData.excerpt || generateExcerpt(postData.content),
            categoryId: postData.categoryId,
            authorUid: userId,
            status: 'pending', // Always pending for new posts from members
            createdAt: new Date(),
            updatedAt: new Date(),
            publishedAt: null,
            viewCount: 0,
            tags: postData.tags || [],
            featuredImage: postData.featuredImage || null,
        };

        await postRef.set(finalPostData);

        return { success: true, postId: postRef.id, slug: slug };
    } catch (error) {
        console.error('❌ Error creating blog post:', error);
        return { success: false, error: error.message };
    }
}

// Update a blog post
export async function updateBlogPost(postId, updateData, userId = null) {
    const db = fire.firestore();
    try {
        if (userId) {
            const existing = await db.collection('blog_posts').doc(postId).get();
            if (!existing.exists || existing.data().authorUid !== userId) {
                return { success: false, error: 'Post not found or access denied.' };
            }
            const allowedFields = ['title', 'content', 'excerpt', 'categoryId', 'tags', 'featuredImage'];
            updateData = Object.fromEntries(Object.entries(updateData).filter(([key]) => allowedFields.includes(key)));
            updateData.status = 'pending';
        }

        // If slug is being updated, check for conflicts (admin-managed slugs only).
        if (updateData.slug) {
            const existingPost = await db.collection('blog_posts')
                .where('slug', '==', updateData.slug)
                .where(firebase.firestore.FieldPath.documentId(), '!=', postId)
                .get();
            if (!existingPost.empty) {
                return { success: false, error: 'A post with this slug already exists.' };
            }
        }

        const finalUpdateData = {
            ...updateData,
            updatedAt: new Date(),
        };

        // Set publishedAt when status changes to approved
        if (updateData.status === 'approved') {
            const postDoc = await db.collection('blog_posts').doc(postId).get();
            const currentPost = postDoc.data();
            if (currentPost && currentPost.status !== 'approved') {
                finalUpdateData.publishedAt = new Date();
            }
        }

        await db.collection('blog_posts').doc(postId).update(finalUpdateData);

        console.log('✅ Blog post updated successfully!');
        return { success: true };
    } catch (error) {
        console.error('❌ Error updating blog post:', error);
        return { success: false, error: error.message };
    }
}

// Get blog post by slug
export async function getBlogPostBySlug(slug, includeUnpublished = false) {
    const db = fire.firestore();
    try {
        console.log('🔍 Getting blog post by slug:', slug);
        
        let query = db.collection('blog_posts').where('slug', '==', slug);
        
        if (!includeUnpublished) {
            query = query.where('status', '==', 'approved');
        }
        
        const snapshot = await query.get();
        
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data();
            
            console.log('📄 Blog post found:', doc.id, data.title);
            
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
            console.log('❌ Blog post not found with slug:', slug);
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

        console.log('🔍 Getting user blog posts for:', authorUid);
        
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
        
        console.log(`✅ Found ${posts.length} user blog posts`);
        
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

        console.log('🔍 Listing blog posts with options:', options);
        
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
        
        console.log(`✅ Found ${posts.length} blog posts (page ${page}/${totalPages})`);
        
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
                approved: 0,
                pending: 0,
                rejected: 0
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
export async function deleteBlogPost(postId) {
    const db = fire.firestore();
    try {
        console.log('=== DELETING BLOG POST ===');
        console.log('Post ID:', postId);

        await db.collection('blog_posts').doc(postId).delete();

        console.log('✅ Blog post deleted successfully!');
        return { success: true };
    } catch (error) {
        console.error('❌ Error deleting blog post:', error);
        return { success: false, error: error.message };
    }
}

// ==================== BLOG CATEGORIES FUNCTIONS ====================

// Create a new blog category
export async function createBlogCategory(categoryData) {
    const db = fire.firestore();
    try {
        console.log('=== CREATING BLOG CATEGORY ===');
        console.log('Category data:', JSON.stringify(categoryData, null, 2));

        const slug = generateSlug(categoryData.name);
        
        // Check if slug already exists
        const existingCategory = await db.collection('blog_categories').where('slug', '==', slug).get();
        if (!existingCategory.empty) {
            return { success: false, error: 'A category with this name already exists.' };
        }

        const finalCategoryData = {
            name: categoryData.name,
            slug: slug,
            description: categoryData.description || '',
            color: categoryData.color || '#6366f1',
            postCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const categoryRef = await db.collection('blog_categories').add(finalCategoryData);

        console.log('✅ Blog category created successfully!');
        console.log('Category ID:', categoryRef.id);

        return { success: true, categoryId: categoryRef.id, slug: slug };
    } catch (error) {
        console.error('❌ Error creating blog category:', error);
        return { success: false, error: error.message };
    }
}

// List all blog categories
export async function listBlogCategories() {
    const db = fire.firestore();
    try {
        console.log('🔍 Listing blog categories');
        
        const snapshot = await db.collection('blog_categories')
            .orderBy('name', 'asc')
            .get();
        
        const categories = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            categories.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || data.createdAt,
                updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
            });
        });
        
        console.log(`✅ Found ${categories.length} blog categories`);
        return categories;
    } catch (error) {
        console.error('❌ Error listing blog categories:', error);
        return [];
    }
}

// Update a blog category
export async function updateBlogCategory(categoryId, updateData) {
    const db = fire.firestore();
    try {
        console.log('=== UPDATING BLOG CATEGORY ===');
        console.log('Category ID:', categoryId);
        console.log('Update data:', JSON.stringify(updateData, null, 2));

        const finalUpdateData = {
            ...updateData,
            updatedAt: new Date(),
        };

        // If name is being updated, regenerate slug
        if (updateData.name) {
            const newSlug = generateSlug(updateData.name);
            const existingCategory = await db.collection('blog_categories')
                .where('slug', '==', newSlug)
                .where(firebase.firestore.FieldPath.documentId(), '!=', categoryId)
                .get();
            if (!existingCategory.empty) {
                return { success: false, error: 'A category with this name already exists.' };
            }
            finalUpdateData.slug = newSlug;
        }

        await db.collection('blog_categories').doc(categoryId).update(finalUpdateData);

        console.log('✅ Blog category updated successfully!');
        return { success: true };
    } catch (error) {
        console.error('❌ Error updating blog category:', error);
        return { success: false, error: error.message };
    }
}

// Delete a blog category
export async function deleteBlogCategory(categoryId) {
    const db = fire.firestore();
    try {
        console.log('=== DELETING BLOG CATEGORY ===');
        console.log('Category ID:', categoryId);

        // Check if category has posts
        const postsWithCategory = await db.collection('blog_posts')
            .where('categoryId', '==', categoryId)
            .limit(1)
            .get();
            
        if (!postsWithCategory.empty) {
            return { success: false, error: 'Cannot delete category that has posts. Please move or delete the posts first.' };
        }

        await db.collection('blog_categories').doc(categoryId).delete();

        console.log('✅ Blog category deleted successfully!');
        return { success: true };
    } catch (error) {
        console.error('❌ Error deleting blog category:', error);
        return { success: false, error: error.message };
    }
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
    const db = fire.firestore();
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
            updatedAt: new Date(),
        };
        await db.collection('data').doc('public_config').set({ blog: clean }, { merge: true });
        return { success: true };
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

// Create a notification in the notifications collection
export async function createNotification(userId, notificationData) {
    const db = fire.firestore();
    try {
        console.log('🔔 Creating notification for user:', userId);
        console.log('🔔 Notification data:', notificationData);
        
        const notificationRef = db.collection('notifications').doc(userId).collection('userNotifications').doc();
        console.log('🔔 Notification ref path:', notificationRef.path);

        const finalNotificationData = {
            ...notificationData,
            read: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        
        console.log('🔔 Final notification data:', finalNotificationData);

        await notificationRef.set(finalNotificationData);
        console.log('✅ Notification created successfully for user:', userId);
        console.log('✅ Notification ID:', notificationRef.id);
        return { success: true, notificationId: notificationRef.id };
    } catch (error) {
        console.error('❌ Error creating notification:', error);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);
        return { success: false, error: error.message };
    }
}

// Get unread notifications for a user
export async function getUnreadNotifications(userId) {
    const db = fire.firestore();
    try {
        const snapshot = await db.collection('notifications').doc(userId).collection('userNotifications').where('read', '==', false).get();

        const notifications = [];
        snapshot.forEach((doc) => {
            notifications.push({ id: doc.id, ...doc.data() });
        });

        return notifications;
    } catch (error) {
        console.error('❌ Error getting notifications:', error);
        return [];
    }
}

// Mark notification as read
export async function markNotificationAsRead(userId, notificationId) {
    const db = fire.firestore();
    try {
        await db.collection('notifications').doc(userId).collection('userNotifications').doc(notificationId).update({
            read: true,
            updatedAt: new Date(),
        });
        console.log('✅ Marked as read:', notificationId);
        return { success: true };
    } catch (error) {
        console.error('❌ Error marking notification as read:', error);
        return { success: false, error: error.message };
    }
}

// Test function to create a sample notification (for debugging)
export async function testCreateNotification(userId) {
    console.log('🧪 Testing notification creation for user:', userId);
    
    const testNotification = {
        type: 'test',
        title: 'Test Notification',
        message: 'This is a test notification to verify the system is working.',
        data: {
            testId: 'test-123',
            timestamp: new Date().toISOString()
        }
    };
    
    const result = await createNotification(userId, testNotification);
    console.log('🧪 Test notification result:', result);
    return result;
}

//  add Ads
export async function addAds(link, name, destinationLink) {
    var id = makeid(5);
    const db = fire.firestore();
    const adsRef = db.collection('ads');
    //  Getting the date
    let date = new Date();

    let day = date.getDate();
    let month = date.getMonth() + 1;
    let year = date.getFullYear();

    if (month < 10) {
        await adsRef
            .doc(id)
            .set({
                id: id,
                name: name,
                imageLink: link,
                date: `${day}-0${month}-${year}`,
                destinationLink: destinationLink,
            })
            .then((value) => {
                return true;
            });
    } else {
        await adsRef
            .doc(id)
            .set({
                id: id,
                name: name,
                imageLink: link,
                date: `${day}-${month}-${year}`,
                destinationLink: destinationLink,
            })
            .then((value) => {
                return true;
            });
    }
}
// Get pages
export async function getPages() {
    return safeDbOperation(async () => {
        const db = fire.firestore();
        const adsRef = db.collection('pages');
        var allDocs = [];
        const snapshot = await adsRef.get();
        snapshot.forEach((item) => {
            allDocs.push(item.data());
        });
        return allDocs.length > 0 ? allDocs : [];
    }, false); // Set requireAuth to false for public pages
}

// Get  page by name
export async function getPageByName(name) {
    const db = fire.firestore();
    const snapshot = await db.collection('pages').doc(name).get();
    if (snapshot.exists) {
        return snapshot.data();
    }
}

// Remove  page by name
export async function removePageByName(name) {
    const db = fire.firestore();
    await db
        .collection('pages')
        .doc(name)
        .delete()
        .then((value) => {
            console.log('Succefully delete');
            return true;
        });
}

// Add Pages

export async function addPages(pagename, pagecontent) {
    const db = fire.firestore();
    const adsRef = db.collection('pages');
    //  Getting the date
    let date = new Date();
    let day = date.getDate();
    let month = date.getMonth() + 1;
    let year = date.getFullYear();

    if (month < 10) {
        await adsRef
            .doc(pagename)
            .set({ id: pagename, pagecontent: pagecontent, date: `${day}-0${month}-${year}` })
            .then((value) => {
                return true;
            });
    } else {
        await adsRef
            .doc(pagename)
            .set({ id: pagename, pagecontent: pagecontent, date: `${day}-${month}-${year}` })
            .then((value) => {
                return true;
            });
    }
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
export async function removeAd(id) {
    const db = fire.firestore();
    await db
        .collection('ads')
        .doc(id)
        .delete()
        .then((value) => {
            return true;
        });
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
        .then((value) => console.log('Succefully added Social Links'));
}

export async function addDetails(websitename, websitedescription) {
    const db = fire.firestore();
    db.collection('data')
        .doc('details')
        .set({
            websiteName: websitename,
            websitedescription: websitedescription,
        })
        .then((value) => console.log('Succefully added webiste details'));
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
            //   console.log("Found employments in"+ resumes[index].id);
            educationSnapshot.forEach((value) => {
                // assigning data into our resumes[using the index of the target resume] array
                resumes[index].educations[educationIndex] = value.data();
                resumes[index].educations[educationIndex].educationId = value.id;
                // console.log( "The id of the employment is"+ resumes[index].employments[employmentIndex].employmentId)
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
            //   console.log("Found employments in"+ resumes[index].id);
            skillSnapshot.forEach((value) => {
                // assigning data into our resumes[using the index of the target resume] array
                resumes[index].skills[skillIndex] = value.data();
                resumes[index].skills[skillIndex].skillId = value.id;
                // console.log( "The id of the employment is"+ resumes[index].employments[employmentIndex].employmentId)
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
            //   console.log("Found employments in"+ resumes[index].id);
            skillSnapshot.forEach((value) => {
                // assigning data into our resumes[using the index of the target resume] array
                resumes[index].languages[languageIndex] = value.data();
                resumes[index].languages[languageIndex].skillId = value.id;
                // console.log( "The id of the employment is"+ resumes[index].employments[employmentIndex].employmentId)
                languageIndex++;
            });
        }
    }
    //  console.log("Resumes final result ");
    //console.log(resumes);
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
        .then((value) => console.log('Succefully added to favourites'));
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
        .then((value) => console.log('Succefully removed from favourites'));
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
        console.log('Job added to favourites');
        return true; // Added
    } else {
        // Remove from favourites
        await docRef.delete();
        console.log('Job removed from favourites');
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
    var res;
    for (let index = 0; index < employmentsToAdd.length; index++) {
        const employmentRef = db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('employments');
        employmentsToAdd[index] !== null
            ? (res = await employmentRef.add({
                  id: employmentsToAdd[index].id,
                  date: employmentsToAdd[index].date,
                  jobTitle: employmentsToAdd[index].jobTitle,
                  employer: employmentsToAdd[index].employer,
                  begin: employmentsToAdd[index].begin,
                  end: employmentsToAdd[index].end,
                  description: employmentsToAdd[index].description,
              }))
            : console.log('kk');
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
    var res;
    for (let index = 0; index < educatiionsToAdd.length; index++) {
        const educationRef = db.collection('users').doc(userId).collection('resumes').doc(resumeId).collection('educations');
        educatiionsToAdd[index] !== null
            ? (res = await educationRef.add({
                  id: educatiionsToAdd[index].id,
                  date: educatiionsToAdd[index].date,

                  school: educatiionsToAdd[index].school,
                  started: educatiionsToAdd[index].started,
                  finished: educatiionsToAdd[index].finished,
                  degree: educatiionsToAdd[index].degree,
                  description: educatiionsToAdd[index].description,
              }))
            : console.log();
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

export async function setJsonPb(resumeId, resumeObject, { isPublished = false } = {}) {
    const db = fire.firestore();
    const ownerUid = fire.auth().currentUser?.uid;
    if (!ownerUid) throw new Error('Authentication is required');
    const objectToSave = { ...resumeObject };
    delete objectToSave.user;
    if (isPublished === true) {
        await db.collection('pb').doc(resumeId).set({
            id: resumeId, ownerUid, isPublished: true, publicationMode: 'explicit', object: JSON.stringify(objectToSave),
            publishedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return;
    }
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
export async function uploadImageToFirebase(dataUrl, uid) {
    const db = fire.firestore();
    const userRef = await db.collection('users').doc(uid);
    const user = await userRef.get();
    if (user.exists) {
        var profile = user.data().profile;
        if (profile == undefined) {
            profile = {};
        }
        // Save under 'selectedImage' — consistent with the front-end state key
        profile.selectedImage = dataUrl;
        userRef.set(
            {
                profile: profile,
            },
            { merge: true }
        );
    }
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

export async function addProfileToUser(uid, profile) {
    const db = fire.firestore();
    const userRef = await db.collection('users').doc(uid);
    const user = await userRef.get();
    if (user.exists) {
        userRef.set(
            {
                profile: profile,
            },
            { merge: true }
        );
        return true;
    } else {
        return false;
    }
}

// get account info

// /users/uid

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
    const db = fire.firestore();
    const reviewRef = await db.collection('reviews').doc();
    reviewRef.set(review);
    return true;
}

// add a trusted by

export async function addTrustedBy(trustedBy) {
    const db = fire.firestore();
    const trustedByRef = await db.collection('trustedBy').doc();
    trustedByRef.set(trustedBy);
    return true;
}

// get trusted by

export async function getTrustedBy() {
    const db = fire.firestore();
    const trustedByRef = await db.collection('trustedBy').get();
    const trustedBy = trustedByRef.docs.map((doc) => doc.data());
    return trustedBy;
}

// remove trusted by where id ==

export async function removeTrustedBy(id) {
    try {
        const db = fire.firestore();
        const trustedByRef = await db.collection('trustedBy').where('id', '==', id).get();
        trustedByRef.docs.forEach((doc) => doc.ref.delete());
        return true;
    } catch (error) {
        console.log(error);
        return false;
    }
}

// update trusted by  we need to use where id ==

export async function updateTrustedBy(id, trustedBy) {
    const db = fire.firestore();
    const trustedByRef = await db.collection('trustedBy').where('id', '==', id).get();
    trustedByRef.docs.forEach((doc) => doc.ref.update(trustedBy));
    return true;
}

// add global rating to a /data/meta
// make sure to note remove the current data that is in meta

export async function addGlobalRating(rating) {
    const db = fire.firestore();
    const metaRef = await db.collection('data').doc('meta');
    const meta = await metaRef.get();
    if (meta.exists) {
        var metaRating = meta.data().rating;
        if (metaRating === undefined) {
            metaRating = 0;
        }
        metaRating = rating;
        metaRef.set(
            {
                rating: metaRating,
            },
            { merge: true }
        );
        return true;
    } else {
        return false;
    }
}

// get all reviews make sure every id is with there response

export async function getAllReviews() {
    const db = fire.firestore();
    const reviewsRef = await db.collection('reviews').get();
    const reviews = reviewsRef.docs.map((doc) => {
        return { id: doc.id, ...doc.data() };
    });
    return reviews;
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

export async function deleteReview(id) {
    const db = fire.firestore();
    const reviewRef = await db.collection('reviews').doc(id);
    reviewRef.delete();
    return true;
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
        const response = await fetch('/api/messages/conversations', {
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

export async function sendMessage(conversationId, _senderId, text) {
    try {
        const response = await fetch('/api/messages/send', {
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
    console.log('🔥 getConversations called with userId:', userId);
    
    return safeRealtimeDbOperation(() => {
        const db = fire.database();
        const conversationsRef = db.ref(`user-conversations/${userId}`);
        console.log('🔥 Database reference created for path:', `user-conversations/${userId}`);
        
        // Add error handler for the database reference
        conversationsRef.on('value', async (snapshot) => {
            console.log('🔥 Firebase callback triggered, snapshot exists:', snapshot.exists());
            console.log('🔥 Snapshot value:', snapshot.val());
            
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
        console.log('⚠️ Realtime Database not available, returning empty conversations');
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
        console.log('🔍 getMessagesPaginated called:', { conversationId, limit, startAfter });
        
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
            console.log('🔍 No messages found');
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
        
        console.log('🔍 Retrieved messages:', messages.length, 'hasMore:', hasMore);
        
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
        });
        await batch.commit();

        return { id: docRef.id, slug: slug };
    } catch (error) {
        console.error('Error publishing portfolio:', error);
        throw error;
    }
}

export async function updateExistingPortfolio(portfolioId, userId, portfolioData, theme = 'default') {
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

        const batch = db.batch();
        batch.update(db.collection('portfolios').doc(portfolioId), updateData);
        batch.set(db.collection('users').doc(userId).collection('portfolios').doc(portfolioId), subCollectionUpdate, { merge: true });
        await batch.commit();

        return {
            id: portfolioId,
            slug: updateData.slug || existingPortfolio.slug,
            isNewlyPublished: !existingPortfolio.isPublished,
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
            console.log('No portfolios found in subcollection, trying direct query...');
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
        }

        const batch = db.batch();
        batch.update(db.collection('portfolios').doc(portfolioId), updateData);
        batch.set(db.collection('users').doc(userId).collection('portfolios').doc(portfolioId), {
            isPublished: isPublished,
            updatedAt: updateData.updatedAt,
            ...(isPublished ? { publishedAt: updateData.publishedAt } : {}),
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
        console.error('Error getting public portfolios:', error);
        throw error;
    }
}

// System Settings DB Operations
function redactClientSecrets(settings = {}) {
    const copy = typeof structuredClone === 'function' ? structuredClone(settings) : JSON.parse(JSON.stringify(settings || {}));
    const secretFields = [
        ['ai', ['geminiApiKey','nvidiaApiKey','openaiApiKey','groqApiKey','openrouterApiKey','deepseekApiKey']],
        ['payments', ['stripeSecretKey','razorpayKeySecret','razorpayWebhookSecret','paytmMerchantKey','phonepeSaltKey']],
        ['smtp', ['password']], ['fallbackSmtp', ['password']], ['imap', ['password']],
        ['socialAuth', ['linkedinClientSecret','githubClientSecret']],
        ['facebook', ['facebookAppSecret','facebookClientToken']],
        ['storage', ['cloudinaryApiSecret','s3AccessKeyId','s3SecretAccessKey']],
        ['twilio', ['authToken']], ['firebase', ['privateKey']]
    ];
    for (const [section, fields] of secretFields) {
        if (!copy[section]) continue;
        for (const field of fields) delete copy[section][field];
    }
    return copy;
}

export async function getSystemSettings() {
    let localCache = {};
    try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('system_settings_cache') : null;
        if (raw) localCache = redactClientSecrets(JSON.parse(raw));
    } catch (e) {
        console.warn('Could not read system_settings_cache from localStorage:', e);
    }

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
            nvidiaModel: 'meta/llama-3.1-8b-instruct',
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
            enablePortfolioModule: true,
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

    try {
        const fetchWithTimeout = Promise.race([
            safeDbOperation(async () => {
                const db = fire.firestore();
                const docRef = db.collection('data').doc('public_config');
                const snapshot = await docRef.get();

                let remoteData = {};
                if (snapshot && snapshot.exists) {
                    remoteData = redactClientSecrets(snapshot.data() || {});
                }

                const allKeys = new Set([
                    ...Object.keys(envDefaults),
                    ...Object.keys(localCache || {}),
                    ...Object.keys(remoteData || {})
                ]);

                const merged = {};
                for (const key of allKeys) {
                    merged[key] = {
                        ...(envDefaults[key] || {}),
                        ...(localCache[key] || {}),
                        ...(remoteData[key] || {})
                    };
                }
                try {
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('system_settings_cache', JSON.stringify(merged));
                    }
                } catch (e) {
                    // ignore local storage errors
                }
                return merged;
            }, false),
            new Promise((resolve) => setTimeout(() => resolve(null), 1200))
        ]);

        const result = await fetchWithTimeout;
        return result || getFallback();
    } catch (err) {
        return getFallback();
    }
}

export async function saveSystemSettings(category, data) {
    // 1. Update local cache immediately for guaranteed persistence across reloads
    try {
        if (typeof window !== 'undefined') {
            const raw = localStorage.getItem('system_settings_cache');
            const cache = raw ? JSON.parse(raw) : {};
            cache[category] = redactClientSecrets({ [category]: data })[category] || {};
            localStorage.setItem('system_settings_cache', JSON.stringify(cache));
        }
    } catch (e) {
        console.warn('Could not write system_settings_cache to localStorage:', e);
    }

    // 2. Dispatch custom event for real-time reactivity
    // 3. Save to Firestore (passing false for requireAuth so unauthenticated or dev admin sessions persist safely)
    return safeDbOperation(async () => {
        const db = fire.firestore();
        const docRef = db.collection('data').doc('system_settings');
        await docRef.set({
            [category]: data
        }, { merge: true });
        return true;
    }, false);
}

export async function getAllAdminTransactions() {
    try {
        const db = fire.firestore();
        const invoices = [];
        const seenTxnIds = new Set();

        // Authoritative provider orders are the primary billing ledger.
        try {
            const ordersSnap = await db.collection('payment_orders').orderBy('createdAt', 'desc').limit(200).get();
            for (const orderDoc of ordersSnap.docs) {
                const data = orderDoc.data();
                if (seenTxnIds.has(orderDoc.id)) continue;
                seenTxnIds.add(orderDoc.id);
                let customerEmail = '';
                let customerName = '';
                try {
                    const user = await db.collection('users').doc(data.uid).get();
                    customerEmail = user.data()?.email || '';
                    customerName = user.data()?.displayName || customerEmail.split('@')[0] || data.uid;
                } catch (_) {}
                invoices.push({
                    docId: orderDoc.id,
                    transactionId: data.providerPaymentId || data.providerOrderId || orderDoc.id,
                    userId: data.uid,
                    customerEmail,
                    customerName,
                    planType: data.planId || 'Plan',
                    paimentType: data.provider || 'Payment provider',
                    price: Number(data.amount || 0) / 100,
                    currency: data.currency || 'INR',
                    subtotal: Number(data.amount || 0) / 100,
                    taxAmount: 0,
                    status: data.status === 'ACTIVE' ? 'Completed' : (data.status === 'REFUNDED' ? 'Refunded' : data.status),
                    created_at: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()
                });
            }
        } catch (error) {
            console.warn('Payment orders query error:', error);
        }

        // Legacy global transaction records
        try {
            const txnsSnap = await db.collection('transactions').orderBy('created_at', 'desc').limit(200).get();
            txnsSnap.forEach(doc => {
                const data = doc.data();
                const id = data.transactionId || doc.id;
                if (!seenTxnIds.has(id)) {
                    seenTxnIds.add(id);

                    let status = 'Completed';
                    const rawStatus = (data.status || data.paymentStatus || '').toUpperCase();
                    if (rawStatus === 'REFUNDED') status = 'Refunded';
                    else if (rawStatus === 'FAILED' || rawStatus === 'CANCELLED' || rawStatus === 'DECLINED') status = 'Failed';
                    else if (rawStatus === 'PENDING' || rawStatus === 'INITIATED') status = 'Pending';
                    else if (rawStatus === 'COMPLETED' || rawStatus === 'SUCCESS' || rawStatus === 'PAID') status = 'Completed';

                    invoices.push({
                        docId: doc.id,
                        ...data,
                        status: status,
                        created_at: data.created_at ? (data.created_at.toDate ? data.created_at.toDate().toISOString() : data.created_at) : new Date().toISOString()
                    });
                }
            });
        } catch (e) {
            console.warn('Global transactions collection query error:', e);
        }

        // 2. Fetch from global 'subscriptions' collection
        try {
            const subsSnap = await db.collection('subscriptions').limit(200).get();
            subsSnap.forEach(doc => {
                const data = doc.data();
                const id = data.transactionId || `SUB_${doc.id}`;
                if (!seenTxnIds.has(id)) {
                    seenTxnIds.add(id);

                    let status = 'Completed';
                    const rawStatus = (data.status || data.paymentStatus || '').toUpperCase();
                    if (rawStatus === 'REFUNDED') status = 'Refunded';
                    else if (rawStatus === 'FAILED' || rawStatus === 'CANCELLED') status = 'Failed';
                    else if (rawStatus === 'PENDING') status = 'Pending';

                    invoices.push({
                        docId: doc.id,
                        transactionId: id,
                        userId: data.userId,
                        planType: data.type || 'Pro Plan',
                        paimentType: data.paimentType || 'Card/UPI',
                        price: data.price || 199,
                        currency: data.currency || 'INR',
                        subtotal: data.price || 199,
                        taxAmount: 0,
                        status: status,
                        created_at: data.created_at ? (data.created_at.toDate ? data.created_at.toDate().toISOString() : data.created_at) : new Date().toISOString()
                    });
                }
            });
        } catch (e) {
            console.warn('Global subscriptions collection query error:', e);
        }

        // 3. Scan 'users' collection to capture all user transactions
        try {
            const usersSnap = await db.collection('users').get();
            for (const userDoc of usersSnap.docs) {
                const uData = userDoc.data();
                const uid = userDoc.id;
                
                if (uData.lastPaymentAmount || uData.membership === 'Premium') {
                    const fallbackTxnId = `TXN_${uData.lastPaymentDate ? (uData.lastPaymentDate.toMillis ? uData.lastPaymentDate.toMillis() : Date.now()) : Date.now()}_${uid.substring(0,5).toUpperCase()}`;
                    if (!seenTxnIds.has(fallbackTxnId)) {
                        seenTxnIds.add(fallbackTxnId);

                        let status = 'Failed';
                        const rawStatus = (uData.paymentStatus || uData.lastPaymentStatus || uData.status || '').toUpperCase();
                        
                        if (rawStatus === 'REFUNDED') {
                            status = 'Refunded';
                        } else if (rawStatus === 'ACTIVE' || rawStatus === 'PAID' || rawStatus === 'SUCCESS' || rawStatus === 'COMPLETED') {
                            status = 'Completed';
                        } else if (rawStatus === 'FAILED' || rawStatus === 'CANCELLED' || rawStatus === 'DECLINED') {
                            status = 'Failed';
                        } else if (rawStatus === 'PENDING' || rawStatus === 'INITIATED') {
                            status = 'Pending';
                        } else if (uData.membership === 'Premium' && uData.lastPaymentAmount > 0) {
                            status = 'Completed';
                        } else {
                            status = 'Failed';
                        }

                        const displayName = uData.name || uData.displayName || (uData.email ? uData.email.split('@')[0] : `Candidate (${uid.substring(0,6)})`);

                        invoices.push({
                            docId: `USR_${uid}`,
                            transactionId: fallbackTxnId,
                            userId: uid,
                            customerName: displayName,
                            customerEmail: uData.email || '',
                            customerGstin: uData.gstin || '',
                            planType: uData.membership || 'Pro',
                            paimentType: uData.lastPaymentGateway || 'Razorpay UPI',
                            price: uData.lastPaymentAmount || 199,
                            currency: uData.lastPaymentCurrency || 'INR',
                            subtotal: uData.lastPaymentAmount || 199,
                            taxAmount: 0,
                            status: status,
                            created_at: uData.lastPaymentDate ? (uData.lastPaymentDate.toDate ? uData.lastPaymentDate.toDate().toISOString() : uData.lastPaymentDate) : new Date().toISOString()
                        });
                    }
                }
            }
        } catch (e) {
            console.warn('Users scanner error:', e);
        }

        return invoices;
    } catch (err) {
        console.error('getAllAdminTransactions error:', err);
        return [];
    }
}

export async function refundOrderTransaction(docId, _transactionId, _userId, reason = 'Customer requested refund') {
    try {
        const response = await fetch('/api/admin/payments/refund', {
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



