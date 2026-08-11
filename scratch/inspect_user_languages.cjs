const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: "ai-resume-builder-c67b9"
    });
}

const db = admin.firestore();

async function inspectResumes() {
    console.log("Searching for resumes in Firestore...");
    
    const pbSnap = await db.collection('pb').get();
    console.log(`Found ${pbSnap.size} documents in 'pb' collection:`);
    
    pbSnap.forEach(doc => {
        try {
            const data = doc.data();
            if (data.object) {
                const parsed = JSON.parse(data.object);
                console.log(`\n--- Resume ID: ${doc.id} ---`);
                console.log(`Name: ${parsed.firstname} ${parsed.lastname}`);
                console.log(`Languages:`, JSON.stringify(parsed.languages));
            }
        } catch (e) {
            console.log(`Doc ${doc.id} error:`, e.message);
        }
    });
}

inspectResumes().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
