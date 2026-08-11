/**
 * Data Flow Trace Script
 * 
 * Traces exactly what happens in the "Edit Resume" flow:
 * 
 * 1. Dashboard stores document via setAsCurrentResume(resumeId, document)
 *    - document shape from getResumes: { id, item: {...merged}, employments: [...], educations: [...], skills: [...], languages: [...], template, isNewStyle }
 *    - localStorage.setItem('currentResumeItem', JSON.stringify(document))
 * 
 * 2. BuildResume reads it back:
 *    - parsed = JSON.parse(localStorage.getItem('currentResumeItem'))
 *    - item = parsed.item ? parsed.item : parsed
 *    - employments = parsed.employments || item.employments || []
 *    - educations = parsed.educations || item.educations || []
 *    - rawSkills = parsed.skills || item.skills || []
 *    - languages = parsed.languages || item.languages || []
 * 
 * PROBLEM IDENTIFIED:
 * 
 * When getResumes loads from pb collection (line 3127-3136), it does:
 *   resumes[index].item = { ...resumes[index].item, ...parsed };
 *   resumes[index].employments = parsed.employments || [];
 *   resumes[index].educations = parsed.educations || [];
 *   resumes[index].skills = parsed.skills || [];
 *   resumes[index].languages = parsed.languages || [];
 * 
 * So the document object stored in localStorage looks like:
 * {
 *   id: "resume_xxx",
 *   item: { firstname: "Bhaskar", ..., employments: [...], skills: [...], ... },  <-- flat fields from pb merged in
 *   employments: [...],  <-- duplicated at top level
 *   skills: [...],       <-- duplicated at top level
 *   educations: [...],
 *   languages: [...]
 * }
 * 
 * In BuildResume loading:
 *   item = parsed.item  (has firstname, lastname, etc. - CORRECT)
 *   employments = parsed.employments  (from top-level - should work)
 *   
 * The key question: Does item.firstname exist? Let's test with the actual data.
 * 
 * SECOND PROBLEM:
 * The `user` field is explicitly set to null in setJsonPb (line 3586):
 *   resumeObject.user = null;
 * 
 * When this gets merged back into item via getResumes:
 *   resumes[index].item = { ...resumes[index].item, ...parsed };
 * 
 * The `user` field in item becomes null. This shouldn't affect personal fields though.
 * 
 * THIRD PROBLEM (LIKELY ROOT CAUSE):
 * In setJsonPb, line 3586 does: `resumeObject.user = null;`
 * This MUTATES the original object! When called from updateResumeData/autoSaveResumeDraft,
 * the payload object is mutated. But since it's a copy (spread), this shouldn't affect React state.
 * 
 * Let me check if the useEffect dependency on [authChecked, userData.user, hasLoaded] 
 * could cause a re-trigger that resets data...
 * 
 * ACTUAL ROOT CAUSE FOUND:
 * The useEffect at line 874 has dependencies: [authChecked, userData.user, hasLoaded]
 * 
 * When the component first mounts:
 * 1. authChecked = false, hasLoaded = false → useEffect skips (line 876: if (!authChecked || hasLoaded) return)
 * 2. Auth listener fires → sets authChecked = true, sets userData.user
 * 3. useEffect re-runs with authChecked=true, hasLoaded=false → loads data from localStorage ✓
 * 4. Loading completes → sets hasLoaded=true
 * 5. BUT: userData.user is also a dependency. If it changes after step 3 (e.g., membership lookup updates userData),
 *    the effect re-runs. However, hasLoaded is now true, so line 876 would skip it. This seems fine.
 * 
 * So the localStorage loading SHOULD work. Let me re-examine the actual data more carefully.
 * 
 * WAIT - I found it. Look at the condition on line 924:
 *   if (item && (item.firstname !== undefined || item.lastname !== undefined || employments.length > 0))
 * 
 * When the dashboard stores document with shape { id, item: {...}, employments: [...] }:
 *   parsed.item = { firstname: "Bhaskar", ..., employments: [...], created_at: Timestamp, template: "Cv9", ... }
 *   item = parsed.item  (has firstname = "Bhaskar")
 *   item.firstname !== undefined → TRUE → condition passes ✓
 * 
 * So data should load. The question is: does item.firstname actually have the value "Bhaskar"?
 * 
 * Let me check what getResumes returns for item. At line 3114:
 *   item: doc.data()
 * 
 * doc.data() returns the Firestore document data for /users/{userId}/resumes/{resumeId}
 * This typically has: { template, firstname, lastname, occupation, created_at }
 * These are set by setResumePropertyPerUser at lines 773-776.
 * 
 * Then at line 3129-3131:
 *   resumes[index].item = { ...resumes[index].item, ...parsed };
 * 
 * Where parsed = JSON.parse(pbDoc.data().object) = the full flat resume data from pb collection.
 * 
 * So item = { ...doc.data(), ...parsedFromPb }
 * 
 * The parsed data from pb collection (via getPreviewData) includes:
 *   { firstname, lastname, email, phone, ..., employments: [...], skills: [{name, rating, date}], ... }
 * 
 * So item should have firstname = "Bhaskar". This should work.
 * 
 * THE REAL ISSUE might be a TIMING problem:
 * When user clicks Edit on dashboard:
 * 1. setAsCurrentResume clears localStorage items first (lines 334-336)
 * 2. Sets new values
 * 3. Navigates to /build-resume/heading
 * 
 * When BuildResume mounts:
 * 1. authChecked is initially false
 * 2. Auth listener fires asynchronously
 * 3. Once authChecked becomes true, useEffect runs and reads from localStorage
 * 
 * This seems fine since localStorage is synchronous and the values are set before navigation.
 * 
 * WAIT - I need to check if there's a Firestore Timestamp serialization issue!
 * When doc.data() includes a Firestore Timestamp (created_at), and this gets spread into the 
 * document object, then JSON.stringify will serialize it. But Timestamps have a special structure
 * { seconds, nanoseconds } or may use toJSON(). If JSON.parse fails or returns something unexpected,
 * the whole thing breaks.
 * 
 * But the user confirmed the resume WAS showing in the dashboard with correct name,
 * so getResumes is working. The issue is specifically when clicking Edit.
 * 
 * Let me just check if there could be a race condition where localStorage is written
 * but BuildResume's useEffect hasn't picked it up...
 * 
 * Actually, I think the REAL issue might be simpler:
 * The Firestore Timestamp object in doc.data() cannot be properly JSON.stringified and parsed back.
 * When setAsCurrentResume does JSON.stringify(document), the Timestamp becomes { seconds: X, nanoseconds: Y }.
 * Then JSON.parse gives back a plain object, not a Timestamp. This shouldn't cause the personal fields to be empty though.
 * 
 * Let me just read the actual stored data from Firestore to understand what shape it is.
 */

const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

const config = {
    apiKey: "AIzaSyDigXT7n4Pyf-8WHQtvjHa0wGvJ86nmrwc",
    authDomain: "ai-resume-builder-424cf.firebaseapp.com",
    databaseURL: "https://ai-resume-builder-424cf.firebaseio.com",
    projectId: "ai-resume-builder-424cf",
    storageBucket: "ai-resume-builder-424cf.firebasestorage.app",
    messagingSenderId: "559498498498"
};

if (!firebase.apps.length) {
    firebase.initializeApp(config);
}

const db = firebase.firestore();

async function traceDataFlow() {
    // 1. Find Bhaskar Babu's resume ID
    const userId = '8WTgy0JWcSZwxMlJFPbHdKJP0Yi2';  // From previous investigation

    // 2. Get resume from user subcollection (what getResumes does)
    console.log('=== Step 1: Read from /users/{userId}/resumes ===');
    const resumesRef = db.collection('users').doc(userId).collection('resumes');
    const resumeSnap = await resumesRef.get();
    
    for (const doc of resumeSnap.docs) {
        const data = doc.data();
        console.log(`\nResume ID: ${doc.id}`);
        console.log('Subcollection data keys:', Object.keys(data));
        console.log('firstname:', data.firstname);
        console.log('lastname:', data.lastname);
        console.log('template:', data.template);
        
        // 3. Get from pb collection (what getResumes also does)
        console.log(`\n=== Step 2: Read from /pb/${doc.id} ===`);
        const pbDoc = await db.collection('pb').doc(doc.id).get();
        if (pbDoc.exists && pbDoc.data().object) {
            const parsed = JSON.parse(pbDoc.data().object);
            console.log('pb data keys:', Object.keys(parsed));
            console.log('pb firstname:', parsed.firstname);
            console.log('pb lastname:', parsed.lastname);
            console.log('pb employments count:', (parsed.employments || []).length);
            console.log('pb skills count:', (parsed.skills || []).length);
            console.log('pb educations count:', (parsed.educations || []).length);
            
            // 4. Simulate what getResumes builds as the document object
            const mergedItem = { ...data, ...parsed };
            const dashboardDocument = {
                id: doc.id,
                template: data.template,
                item: mergedItem,
                employments: parsed.employments || [],
                educations: parsed.educations || [],
                skills: parsed.skills || [],
                languages: parsed.languages || [],
                isNewStyle: true,
            };
            
            // 5. Simulate what setAsCurrentResume stores
            const storedJson = JSON.stringify(dashboardDocument);
            console.log(`\n=== Step 3: Simulated localStorage value (${storedJson.length} chars) ===`);
            
            // 6. Simulate what BuildResume reads back
            const parsedBack = JSON.parse(storedJson);
            const item = parsedBack.item ? parsedBack.item : parsedBack;
            const employments = parsedBack.employments || item.employments || [];
            const educations = parsedBack.educations || item.educations || [];
            const rawSkills = parsedBack.skills || item.skills || [];
            const languages = parsedBack.languages || item.languages || [];
            
            console.log('\n=== Step 4: BuildResume extraction ===');
            console.log('item.firstname:', item.firstname);
            console.log('item.lastname:', item.lastname);
            console.log('item.email:', item.email);
            console.log('item.phone:', item.phone);
            console.log('item.occupation:', item.occupation);
            console.log('item.city:', item.city);
            console.log('item.country:', item.country);
            console.log('employments.length:', employments.length);
            console.log('educations.length:', educations.length);
            console.log('rawSkills.length:', rawSkills.length);
            console.log('languages.length:', languages.length);
            
            // Check the condition
            const conditionResult = item && (item.firstname !== undefined || item.lastname !== undefined || employments.length > 0);
            console.log('\nCondition check (line 924):', conditionResult);
            console.log('  item truthy:', !!item);
            console.log('  item.firstname !== undefined:', item.firstname !== undefined);
            console.log('  item.lastname !== undefined:', item.lastname !== undefined);
            console.log('  employments.length > 0:', employments.length > 0);
            
            if (conditionResult) {
                console.log('\n✅ Data SHOULD load correctly into BuildResume');
                console.log('Resume data would be set to:');
                console.log({
                    firstname: item.firstname || '',
                    lastname: item.lastname || '',
                    email: item.email || '',
                    phone: item.phone || '',
                    occupation: item.occupation || '',
                    city: item.city || '',
                    country: item.country || '',
                    address: item.address || '',
                    postalcode: item.postalcode || '',
                    summary: item.summary || '',
                });
            } else {
                console.log('\n❌ Data would NOT load - condition fails!');
            }
            
            // Check if first employment sample
            if (employments.length > 0) {
                console.log('\nFirst employment:', JSON.stringify(employments[0], null, 2));
            }
            if (rawSkills.length > 0) {
                console.log('First skill:', JSON.stringify(rawSkills[0], null, 2));
            }
        } else {
            console.log('No pb document found for this resume ID');
        }
    }
    
    process.exit(0);
}

traceDataFlow().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
