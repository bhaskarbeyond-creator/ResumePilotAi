import fire from '../conf/fire';
import firebase from 'firebase/compat/app';

// Debug function to test Firebase rules and connectivity
export async function testFirebaseRules() {
    const db = fire.firestore();
    console.log('🧪 Testing Firebase rules and connectivity...');
    
    const tests = [
        {
            name: 'Public read /data/meta',
            test: () => db.collection('data').doc('meta').get()
        },
        {
            name: 'Public read /data/id', 
            test: () => db.collection('data').doc('id').get()
        },
        {
            name: 'Public read /pages',
            test: () => db.collection('pages').limit(1).get()
        }
    ];
    
    for (const { name, test } of tests) {
        try {
            await test();
            console.log(`✅ ${name}: PASSED`);
        } catch (error) {
            console.error(`❌ ${name}: FAILED - ${error.code}: ${error.message}`);
        }
    }
    
    console.log('🧪 Firebase rules test completed');
}

/**
 * updateUserOnLogin — Called on EVERY successful login (not just new users).
 * Keeps photoURL, displayName, lastLoginAt fresh for all auth providers.
 */
export async function updateUserOnLogin(userId, { photoURL, displayName, authProvider } = {}) {
    if (!userId) return;
    const db = fire.firestore();
    try {
        const updates = {
            lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        if (photoURL) updates.photoURL = photoURL;
        if (displayName) {
            const parts = displayName.trim().split(' ');
            updates.firstname = parts[0] || '';
            updates.lastname = parts.slice(1).join(' ') || '';
        }
        if (authProvider) updates.authProvider = authProvider;
        await db.collection('users').doc(userId).set(updates, { merge: true });
        console.log(`✅ User login record refreshed: ${userId} [${authProvider || 'unknown'}]`);
    } catch (err) {
        // Non-fatal — don't block auth flow
        console.warn('⚠️ updateUserOnLogin note:', err.message);
    }
}

async function addUser(userId, firstname, lastname, email, { authProvider = 'email', photoURL = null } = {}) {
    const db = fire.firestore();
    try {
        // Checking if user doc for this UID already exists
        const userRef = db.collection('users').doc(userId);
        const snapshot = await userRef.get();
        
        if (!snapshot.exists) {
            // Before creating a new doc, check if another user doc with the same email exists.
            // This handles the case where the same person signs in via a different auth provider
            // (e.g., Email/Password first, then Google OAuth) — Firebase creates separate UIDs
            // for each provider, but we want to preserve their existing membership/plan data.
            let existingMembership = 'Basic';
            let existingData = {};
            
            if (email) {
                try {
                    const existingUserQuery = await db.collection('users')
                        .where('email', '==', email.toLowerCase().trim())
                        .get();
                    
                    if (!existingUserQuery.empty) {
                        // Autonomous Deduplication: Find best existing doc
                        const existingDoc = existingUserQuery.docs.find(d => d.id !== userId) || existingUserQuery.docs[0];
                        if (existingDoc && existingDoc.id !== userId) {
                            existingData = existingDoc.data();
                            existingMembership = existingData.membership || 'Basic';
                            console.log(`⚡ Autonomous Merge: Existing account ${existingDoc.id} found for email ${email}. Merging new UID ${userId}...`);
                        }
                    }
                } catch (queryError) {
                    console.warn('⚠️ Could not check for existing user by email:', queryError.message);
                }
            }

            // Determine display name fields from existing data or email
            const derivedFirstName = existingData.firstname || (existingData.profile?.firstname) || (firstname && firstname !== 'User' ? firstname : '') || (email ? email.split('@')[0] : 'User');
            const derivedLastName = existingData.lastname || (existingData.profile?.lastname) || (lastname && lastname !== 'User' ? lastname : '') || '';

            // Create/update active user document, inheriting all metadata from existing account
            await db.collection('users')
                .doc(userId)
                .set({
                    userId: userId,
                    firstname: derivedFirstName,
                    lastname: derivedLastName,
                    email: email,
                    membership: existingMembership,
                    authProvider: authProvider,
                    ...(photoURL ? { photoURL } : (existingData.photoURL ? { photoURL: existingData.photoURL } : {})),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
                    ...(existingData.membershipEnds ? { membershipEnds: existingData.membershipEnds } : {}),
                    ...(existingData.isA ? { isA: existingData.isA } : {}),
                    ...(existingData.profile ? { profile: existingData.profile } : {}),
                }, { merge: true });

            // Copy existing user's resumes and cover letters to this active UID
            if (existingData && existingData.userId && existingData.userId !== userId) {
                try {
                    const oldUid = existingData.userId;
                    const resumesSnap = await db.collection('users').doc(oldUid).collection('resumes').get();
                    for (const rDoc of resumesSnap.docs) {
                        await db.collection('users').doc(userId).collection('resumes').doc(rDoc.id).set(rDoc.data(), { merge: true });
                    }
                    const coversSnap = await db.collection('users').doc(oldUid).collection('coverLetters').get();
                    for (const cDoc of coversSnap.docs) {
                        await db.collection('users').doc(userId).collection('coverLetters').doc(cDoc.id).set(cDoc.data(), { merge: true });
                    }
                    console.log(`⚡ Subcollections synced from ${oldUid} to active ${userId}`);
                } catch (subErr) {
                    console.warn('⚡ Subcollection sync note:', subErr.message);
                }
            }
            
            // Trigger autonomous merge: ALWAYS keep active session userId so current session doc is never deleted!
            if (existingData && existingData.userId && existingData.userId !== userId) {
                try {
                    const { mergeUserAccounts } = await import('./dbOperations');
                    const keepId = userId; // Active session UID MUST be kept!
                    const deleteId = existingData.userId;
                    await mergeUserAccounts(keepId, deleteId);
                    console.log(`⚡ Autonomous Merge Complete: Preserved active session ${keepId}, deleted inactive ${deleteId}.`);
                } catch (mergeErr) {
                    console.warn('Autonomous merge background notice:', mergeErr.message);
                }
            }
            
            // Update user stats
            await db.collection('data')
                .doc('stats')
                .update({
                    numberOfUsers: firebase.firestore.FieldValue.increment(1),
                })
                .catch(async (error) => {
                    // If stats document doesn't exist, create it
                    if (error.code === 'not-found') {
                        await db.collection('data').doc('stats').set({
                            numberOfUsers: 1,
                            numberOfResumesDownloaded: 0,
                            numberOfResumesCreated: 0,
                        });
                    } else {
                        throw error;
                    }
                });
            
            console.log(`✅ User created: ${userId} | Provider: ${authProvider} | Membership: ${existingMembership}`);
            return { success: true, isNewUser: true, message: 'User created successfully' };
        } else {
            // User exists — refresh login metadata (photo, lastLogin, provider tracking)
            await updateUserOnLogin(userId, { photoURL, authProvider });
            console.log(`ℹ️ User already exists: ${userId}`);
            return { success: true, isNewUser: false, message: 'User already exists' };
        }
    } catch (error) {
        console.error('❌ Error creating user:', error);
        throw error;
    }
}

export async function setA(userId) {
    const db = fire.firestore();
    console.log('🔧 Starting setA for userId:', userId);
    
    const results = {
        userUpdate: false,
        initData: false, 
        statsInit: false
    };
    
    // Step 1: Update user to have admin privileges FIRST (this should work since user doc exists)
    try {
        console.log('👤 Updating user document with admin privileges...');
        await db.collection('users')
            .doc(userId)
            .set({
                isA: true,
            }, { merge: true }); // Use merge to avoid overwriting existing data
        console.log('✅ User admin privileges updated successfully');
        results.userUpdate = true;
        
        // Add a small delay to ensure the user update is committed
        console.log('⏳ Waiting for user admin privileges to be committed...');
        await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
        console.error('❌ Step 1 failed - Updating user privileges:', error.code, error.message);
        throw new Error(`Failed to update user privileges: ${error.message}`);
    }
    
    // Step 2: Set initialization data (now user has isA=true, so isA() should work)
    try {
        console.log('📝 Setting initialization data in data/id...');
        await db.collection('data')
            .doc('id')
            .set({
                userId: userId,
                firstname: 'Welcome',
                lastname: 'Back',
                isA: true,
            });
        console.log('✅ Initialization data set successfully');
        results.initData = true;
    } catch (error) {
        console.error('❌ Step 2 failed - Setting initialization data:', error.code, error.message);
        
        // Try a fallback approach - maybe the issue is with timing
        console.log('⚠️ Trying fallback approach for initialization data...');
        try {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait longer
            await db.collection('data')
                .doc('id')
                .set({
                    userId: userId,
                    firstname: 'Welcome',
                    lastname: 'Back',
                    isA: true,
                });
            console.log('✅ Initialization data set successfully (fallback)');
            results.initData = true;
        } catch (fallbackError) {
            console.error('❌ Fallback also failed:', fallbackError.code, fallbackError.message);
            throw new Error(`Failed to set initialization data: ${error.message}`);
        }
    }
    
    // Step 3: Initialize stats
    try {
        console.log('📊 Initializing stats document...');
        await db.collection('data').doc('stats').set({
            numberOfResumesDownloaded: 0,
            numberOfUsers: 1, // Set to 1 since we have the admin user
            numberOfResumesCreated: 0,
        });
        console.log('✅ Stats document initialized successfully');
        results.statsInit = true;
    } catch (error) {
        console.error('❌ Step 3 failed - Initializing stats:', error.code, error.message);
        throw new Error(`Failed to initialize stats: ${error.message}`);
    }
    
    console.log('✅ All steps completed successfully:', results);
    console.log('✅ Admin privileges set successfully for user:', userId);
    return { success: true, message: 'Admin privileges set successfully', results };
}

export default addUser;
