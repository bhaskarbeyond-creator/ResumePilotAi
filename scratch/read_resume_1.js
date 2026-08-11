import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const config = {
    apiKey: "AIzaSyDigXT7n4Pyf-8WHQtvjHa0wGvJ86nmrwc",
    authDomain: "ai-resume-builder-424cf.firebaseapp.com",
    databaseURL: "https://ai-resume-builder-424cf-default-rtdb.firebaseio.com",
    projectId: "ai-resume-builder-424cf",
    storageBucket: "ai-resume-builder-424cf.firebasestorage.app",
    messagingSenderId: "211275319433",
    appId: "1:211275319433:web:74ed0f5b652865422e1e58",
};

const app = firebase.initializeApp(config);
const db = app.firestore();

async function run() {
    try {
        console.log("Checking pb/resume_1786035058728...");
        const doc = await db.collection('pb').doc('resume_1786035058728').get();
        if (doc.exists) {
            console.log("pbDoc exists. Object data:", doc.data().object);
        } else {
            console.log("pbDoc does not exist!");
        }
    } catch (e) {
        console.error("Read failed with error:", e);
    }
    process.exit(0);
}

run();
