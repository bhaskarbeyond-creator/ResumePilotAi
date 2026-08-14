import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const config = {
    apiKey: "YOUR_FIREBASE_WEB_API_KEY",
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
        console.log("Simulating getResumes for Bhaskar Babu's resume ID resume_1786036591620...");
        
        // 1. Simulate the doc from users/{userId}/resumes/{resumeId}
        const docRef = await db.collection('users').doc('OsaV1gLpP3V2m9r1gLpP3V2m9r1g').collection('resumes').doc('resume_1786036591620').get();
        if (!docRef.exists) {
            console.log("Subcollection doc does not exist under that user ID!");
        } else {
            console.log("Subcollection doc data:", docRef.data());
        }

        // Let's search all users to find where resume_1786036591620 actually resides!
        console.log("\nSearching for user ID owning resume_1786036591620...");
        const usersSnapshot = await db.collection('users').get();
        let ownerUserId = null;
        let resumeDocData = null;
        
        for (const userDoc of usersSnapshot.docs) {
            const rRef = db.collection('users').doc(userDoc.id).collection('resumes').doc('resume_1786036591620');
            const rDoc = await rRef.get();
            if (rDoc.exists) {
                ownerUserId = userDoc.id;
                resumeDocData = rDoc.data();
                console.log(`Found owner user ID: ${userDoc.id}`);
                console.log(`Data inside subcollection doc:`, rDoc.data());
                break;
            }
        }
        
        if (!ownerUserId) {
            console.log("Resume resume_1786036591620 does not exist in any user's subcollection!");
            process.exit(0);
        }

        // 2. Simulate getResumes merging logic
        const resume = {
            id: 'resume_1786036591620',
            template: resumeDocData.template || 'Cv1',
            item: resumeDocData,
            employments: [],
            educations: [],
            languages: [],
            skills: [],
        };

        const pbDoc = await db.collection('pb').doc(resume.id).get();
        if (pbDoc.exists && pbDoc.data().object) {
            const parsed = JSON.parse(pbDoc.data().object);
            resume.item = {
                ...resume.item,
                ...parsed
            };
            resume.employments = parsed.employments || [];
            resume.educations = parsed.educations || [];
            resume.skills = parsed.skills || [];
            resume.languages = parsed.languages || [];
            resume.isNewStyle = true;
        }

        console.log("\nSimulated Dashboard Resume object:", JSON.stringify(resume, null, 2));

        // 3. Simulate BuildResume.jsx loading parsing logic
        console.log("\nSimulating BuildResume.jsx parsing logic...");
        const savedItem = JSON.stringify(resume);
        const parsed = JSON.parse(savedItem);
        const item = parsed.item ? parsed.item : parsed;
        const employments = parsed.employments || item.employments || [];
        const educations = parsed.educations || item.educations || [];
        const skills = parsed.skills || item.skills || [];
        const languages = parsed.languages || item.languages || [];

        console.log("Loaded item:", item);
        console.log("Loaded firstname:", item.firstname);
        console.log("Loaded lastname:", item.lastname);
        console.log("Loaded email:", item.email);
        console.log("Loaded phone:", item.phone);
        console.log("Loaded template:", item.template || parsed.template || 'Cv1');

    } catch (e) {
        console.error("Simulation failed:", e);
    }
    process.exit(0);
}

run();
