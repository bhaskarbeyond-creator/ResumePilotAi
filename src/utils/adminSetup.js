import fire from '../conf/fire';

// Function to check current user's admin status
export async function checkCurrentUserAdminStatus() {
    const user = fire.auth().currentUser;
    if (!user) {
        console.log('❌ No user is currently logged in');
        return false;
    }

    console.log('👤 Current user ID:', user.uid);
    console.log('📧 Current user email:', user.email);

    const db = fire.firestore();
    try {
        const snapshot = await db.collection('users').doc(user.uid).get();
        if (snapshot.exists) {
            const userData = snapshot.data();
            console.log('📊 User data:', userData);
            console.log('🔐 Admin status (isA):', userData.isA);
            return userData.isA === true;
        } else {
            console.log('❌ User document does not exist in Firestore');
            return false;
        }
    } catch (error) {
        console.error('❌ Error checking admin status:', error);
        return false;
    }
}

// Function to make current user an admin (use with caution!)
export async function makeCurrentUserAdmin() {
    const user = fire.auth().currentUser;
    if (!user) {
        console.log('❌ No user is currently logged in');
        return false;
    }

    const db = fire.firestore();
    try {
        await db.collection('users').doc(user.uid).update({
            isA: true
        });
        console.log('✅ Successfully made user admin:', user.email);
        return true;
    } catch (error) {
        console.error('❌ Error making user admin:', error);
        return false;
    }
}

// Function to test frontend stats permissions
export async function testFrontendStatsPermissions() {
    const db = fire.firestore();
    
    console.log('🧪 Testing frontend stats permissions...');
    
    try {
        // Test read permission
        console.log('📖 Testing read permission...');
        const readSnapshot = await db.collection('data').doc('frontendstats').get();
        console.log('✅ Read permission works');
        console.log('📊 Current data:', readSnapshot.exists ? readSnapshot.data() : 'Document does not exist');
        
        // Test write permission
        console.log('✏️ Testing write permission...');
        await db.collection('data').doc('frontendstats').set({
            activeJobs: '12,500+',
            rating: '4.9',
            successfulHires: '75,000+',
            partnerCompanies: '650+',
            featuredJobs: '3,200+',
            successRate: '97%',
            topCompanies: '750+',
            lastUpdated: new Date()
        });
        console.log('✅ Write permission works');
        
        return true;
    } catch (error) {
        console.error('❌ Permission test failed:', error);
        return false;
    }
}

// Function to clean up Firebase Auth state before initialization
export async function cleanupAuthState() {
    console.log('🧹 Cleaning up Firebase Auth state...');
    
    try {
        const currentUser = fire.auth().currentUser;
        if (currentUser) {
            console.log(`🔄 Signing out current user: ${currentUser.email}`);
            await fire.auth().signOut();
            
            // Wait for the state change to propagate
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Verify the user is actually signed out
            const afterSignOut = fire.auth().currentUser;
            if (!afterSignOut) {
                console.log('✅ User successfully signed out');
            } else {
                console.log('⚠️ User might still be signed in after signOut attempt');
            }
        } else {
            console.log('✅ No user currently signed in - auth state is clean');
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error cleaning up auth state:', error);
        return false;
    }
}

// Function to check if admin user already exists in Firebase Auth
export async function checkIfAdminEmailExists(adminEmail) {
    console.log(`🔍 Checking if admin email exists: ${adminEmail}`);
    
    // Note: Firebase doesn't provide a direct way to check if an email exists
    // without trying to create an account or having admin privileges
    // This is a security feature. We'll rely on error handling instead.
    
    console.log('ℹ️ Email existence check will be handled through creation attempt');
    return false; // Always return false since we can't actually check
}

// Helper function to run all diagnostics
export async function runAdminDiagnostics() {
    console.log('🔍 Running admin diagnostics...');
    console.log('================================');
    
    const isAdmin = await checkCurrentUserAdminStatus();
    console.log('================================');
    
    if (isAdmin) {
        console.log('✅ User has admin permissions');
        await testFrontendStatsPermissions();
    } else {
        console.log('❌ User does not have admin permissions');
        console.log('💡 You can run makeCurrentUserAdmin() to fix this');
    }
    
    console.log('================================');
    console.log('🏁 Diagnostics complete');
}
