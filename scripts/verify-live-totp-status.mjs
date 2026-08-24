import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  multiFactor, 
  TotpMultiFactorGenerator 
} from 'firebase/auth';
import dotenv from 'dotenv';

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_KEY,
  authDomain: process.env.VITE_FIREBASE_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function testLiveTotp() {
  console.log('--- Testing Live Firebase Project TOTP MFA Status ---');
  console.log('Project ID:', firebaseConfig.projectId);

  // We can query the Identity Toolkit public endpoint to check enabled MFA factors
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${firebaseConfig.projectId}?key=${firebaseConfig.apiKey}`);
    const data = await res.json();
    console.log('Project Public Auth Config Response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('Public endpoint check note:', e.message);
  }

  // Also query identitytoolkit v2 projects createSession endpoint or similar
  try {
    const resp = await fetch(`https://identitytoolkit.googleapis.com/v2/projects/${firebaseConfig.projectId}:sendVerificationCode?key=${firebaseConfig.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const result = await resp.json();
    console.log('MFA Check Endpoint Response:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.log('V2 Endpoint note:', e.message);
  }
}

testLiveTotp();
