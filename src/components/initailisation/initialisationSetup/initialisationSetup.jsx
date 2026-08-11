import React, { Component } from 'react';

import './initialisationSetup.scss'
import successAnimation from '../../../assets/animations/lottie-success.json'
import Input from '../../Form/simple-input/SimpleInput'
import conf from '../../../conf/configuration'
import fire from '../../../conf/fire';
import addUser, { setA, testFirebaseRules } from '../../../firestore/auth'
import { cleanupAuthState } from '../../../utils/adminSetup'

import { useLottie } from 'lottie-react';

const View = () => {
    const successOptions = {
        loop: false,
        autoplay: true,
        animationData: successAnimation,
        rendererSettings: {
            preserveAspectRatio: 'xMidYMid slice'
        }
    };
    const { View } = useLottie(successOptions);
    return View;
  };

class initialisationSetup extends Component {
    constructor(props) {
        super(props);
        this.state = {
            email: conf.adminEmail,
            password: "",
            passwordRepeat: "",
        }
        this.handleInputs = this.handleInputs.bind(this);
        this.signUp = this.signUp.bind(this);
    }
    async signUp(event) {
        event.preventDefault();
        
        if (this.state.passwordRepeat == this.state.password && this.state.email == conf.adminEmail) {
            try {
                console.log('🚀 Starting admin user creation...');
                
                // Clean up any existing auth state
                await cleanupAuthState();
                
                // Test Firebase rules comprehensively
                await testFirebaseRules();
                
                // Create Firebase Auth user
                console.log('👤 Attempting to create Firebase Auth user with email:', this.state.email);
                const userCredential = await fire.auth().createUserWithEmailAndPassword(this.state.email, this.state.password);
                const userId = userCredential.user.uid;
                
                console.log('✅ Firebase Auth user created:', userId);
                
                // Create user document in Firestore
                await addUser(userId, 'Admin', 'User', this.state.email);
                console.log('✅ User document created in Firestore');
                
                // Small delay to ensure user document is fully committed
                console.log('⏳ Waiting for user document to be fully committed...');
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Set admin privileges
                await setA(userId);
                console.log('✅ Admin privileges set');
                
                // Close initialization modal
                this.props.closeInitialisation();
                console.log('✅ Initialization completed successfully');
                
            } catch (error) {
                console.error('❌ Error during admin setup:', {
                    code: error.code,
                    message: error.message,
                    fullError: error
                });
                
                // Handle specific Firebase Auth error codes
                let userFriendlyMessage = '';
                switch (error.code) {
                    case 'auth/email-already-in-use':
                        userFriendlyMessage = 'This email is already registered. This might be a false positive - trying to continue...';
                        console.log('⚠️ Email already in use error detected - this might be a caching issue');
                        break;
                    case 'auth/weak-password':
                        userFriendlyMessage = 'Password is too weak. Please use a stronger password.';
                        break;
                    case 'auth/invalid-email':
                        userFriendlyMessage = 'Invalid email address format.';
                        break;
                    case 'auth/network-request-failed':
                        userFriendlyMessage = 'Network error. Please check your internet connection.';
                        break;
                    default:
                        userFriendlyMessage = `Error creating admin user: ${error.message}`;
                        break;
                }
                
                // If it's the email-already-in-use error, let's try a different approach
                if (error.code === 'auth/email-already-in-use') {
                    console.log('🔄 Attempting to sign in with existing credentials instead...');
                    try {
                        const signInResult = await fire.auth().signInWithEmailAndPassword(this.state.email, this.state.password);
                        console.log('✅ Successfully signed in with existing account:', signInResult.user.uid);
                        
                        // Continue with the setup process using the existing user
                        const userId = signInResult.user.uid;
                        
                        // Create user document in Firestore if it doesn't exist
                        await addUser(userId, 'Admin', 'User', this.state.email);
                        console.log('✅ User document created/verified in Firestore');
                        
                        // Small delay to ensure user document is fully committed
                        console.log('⏳ Waiting for user document to be fully committed...');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // Set admin privileges
                        await setA(userId);
                        console.log('✅ Admin privileges set');
                        
                        // Close initialization modal
                        this.props.closeInitialisation();
                        console.log('✅ Initialization completed successfully with existing account');
                        
                        return; // Success, exit the function
                    } catch (signInError) {
                        console.error('❌ Failed to sign in with existing credentials:', signInError);
                        alert(`Failed to sign in with existing account: ${signInError.message}`);
                        return;
                    }
                }
                
                alert(userFriendlyMessage);
            }
        } else {
            alert('Passwords do not match or email is incorrect');
        }
    }
    handleInputs(title, value) {
        switch (title) {
            case "Email":
                this.setState((prevState, props) => ({
                    email: value
                }));
                break;
            case "Password":
                this.setState((prevState, props) => ({
                    password: value
                }));
                break;
            case "Repeat Password":
                this.setState((prevState, props) => ({
                    passwordRepeat: value
                }));
                break;
            default:
                break;
        }
    }
    render() {


        return (
            <div className="instalationSuccess">
                <form onSubmit={this.signUp} className="registerForm">
                    <Input disabled={true} name="Email" title="Email" value={conf.adminEmail} handleInputs={this.handleInputs} />
                    <Input  type="Password"  name="Password" title="Password" handleInputs={this.handleInputs} />
                    <Input  type="Password" name="Repeat Password" title="Repeat Password" handleInputs={this.handleInputs} />
                    <input className="inputSubmit" value="Register" type="submit" />
                </form>
            </div>
        )
    }
}
export default initialisationSetup