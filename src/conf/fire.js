import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';
import 'firebase/compat/database';

const config = {
    apiKey: import.meta.env.VITE_FIREBASE_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const fire = firebase.initializeApp(config);
export const googleProvider = new firebase.auth.GoogleAuthProvider();
export const facebookProvider = new firebase.auth.FacebookAuthProvider();

export default fire;
