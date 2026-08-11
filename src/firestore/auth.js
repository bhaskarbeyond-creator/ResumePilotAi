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
        // Checking if user exists
        const userRef = db.collection('users').doc(userId);
        const snapshot = await userRef.get();
        
        if (!snapshot.exists) {
            // Create user document
            await db.collection('users')
                .doc(userId)
                .set({
                    userId: userId,
                    firstname: firstname,
                    lastname: lastname,
                    email: email,
                    membership: 'Basic',
                });
            
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
            
            console.log('✅ User created successfully:', userId);
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
