// Test script to debug Firebase initialization issues
// Run this in the browser console to test Firebase Auth behavior

import fire from './conf/fire.js';
import { cleanupAuthState, runAdminDiagnostics } from './utils/adminSetup.js';

// Test function to replicate the initialization issue
async function testInitializationFlow(email, password) {
    console.log('🧪 Testing initialization flow...');
    console.log('================================');
    
    try {
        // Step 1: Cleanup
        console.log('🧹 Step 1: Cleaning up auth state...');
        await cleanupAuthState();
        
        // Step 2: Check current state
        console.log('🔍 Step 2: Checking current auth state...');
        const currentUser = fire.auth().currentUser;
        console.log('Current user:', currentUser ? currentUser.email : 'None');
        
        // Step 3: Attempt to create user
        console.log('👤 Step 3: Attempting to create user...');
        try {
            const userCredential = await fire.auth().createUserWithEmailAndPassword(email, password);
            console.log('✅ User created successfully:', userCredential.user.uid);
            return { success: true, user: userCredential.user };
        } catch (createError) {
            console.log('❌ Create user failed:', createError.code, createError.message);
            
            if (createError.code === 'auth/email-already-in-use') {
                console.log('🔄 Attempting to sign in with existing credentials...');
                try {
                    const signInResult = await fire.auth().signInWithEmailAndPassword(email, password);
                    console.log('✅ Signed in successfully:', signInResult.user.uid);
                    return { success: true, user: signInResult.user, wasExisting: true };
                } catch (signInError) {
                    console.log('❌ Sign in also failed:', signInError.code, signInError.message);
                    return { success: false, error: signInError };
                }
            }
            
            return { success: false, error: createError };
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        return { success: false, error };
    }
}

// Export for use in browser console
window.testInitializationFlow = testInitializationFlow;
window.runAdminDiagnostics = runAdminDiagnostics;
window.cleanupAuthState = cleanupAuthState;

console.log('🧪 Test functions loaded. Use:');
console.log('- testInitializationFlow(email, password)');
console.log('- runAdminDiagnostics()');
console.log('- cleanupAuthState()');