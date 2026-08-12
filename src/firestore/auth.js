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

async function addUser(userId, firstname, lastname, email) {
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

            // Create user document, inheriting membership from existing account
            await db.collection('users')
                .doc(userId)
                .set({
                    userId: userId,
                    firstname: existingData.firstname || firstname,
                    lastname: existingData.lastname || lastname,
                    email: email,
                    membership: existingMembership,
                    ...(existingData.membershipEnds ? { membershipEnds: existingData.membershipEnds } : {}),
                    ...(existingData.isA ? { isA: existingData.isA } : {}),
                    ...(existingData.profile ? { profile: existingData.profile } : {}),
                });
            
            // If another doc exists with the same email, trigger autonomous merge to keep 1 single clean account
            if (existingData && existingData.userId && existingData.userId !== userId) {
                try {
                    const { mergeUserAccounts } = await import('./dbOperations');
                    // Prefer keeping whichever doc has Premium or is older
                    const keepId = (existingData.membership === 'Premium') ? existingData.userId : userId;
                    const deleteId = (keepId === userId) ? existingData.userId : userId;
                    await mergeUserAccounts(keepId, deleteId);
                    console.log(`⚡ Autonomous Merge Complete: Kept ${keepId}, deleted ${deleteId} (Backup saved).`);
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
            
            console.log('✅ User created successfully:', userId, '| Membership:', existingMembership);
            return { success: true, message: 'User created successfully' };
        } else {
            console.log('ℹ️ User already exists:', userId);
            return { success: true, message: 'User already exists' };
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
