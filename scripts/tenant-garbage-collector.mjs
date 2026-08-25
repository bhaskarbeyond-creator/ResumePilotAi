import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// Use dynamic import to get the Enterprise Service since it's CommonJS
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { FirestoreTenantRegistry } = require('../backend/enterprise/tenantRegistry.js');
const { TenantService } = require('../backend/enterprise/tenantService.js');

async function main() {
  console.log('--- Enterprise Tenant Garbage Collection Daemon ---');
  
  let credential;
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (saPath && fs.existsSync(saPath)) {
    credential = cert(JSON.parse(fs.readFileSync(saPath, 'utf8')));
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
    } catch {}
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
  
  const app = getApps().length === 0 ? initializeApp({
    credential: credential || undefined,
    projectId
  }) : getApps()[0];

  const db = getFirestore(app);
  
  // Initialize the enterprise service
  const registry = new FirestoreTenantRegistry({ db, admin: require('firebase-admin') });
  const tenantService = new TenantService({ 
    db, 
    admin: require('firebase-admin'),
    registry 
  });
  
  // Set the grace period for hard deletion (default 7 days if not provided as argument)
  const gracePeriodArg = process.argv.find(arg => arg.startsWith('--grace-period='));
  const gracePeriodDays = gracePeriodArg ? parseInt(gracePeriodArg.split('=')[1], 10) : 7;
  
  console.log(`Starting garbage collection with ${gracePeriodDays} days grace period...`);
  
  try {
    const result = await tenantService.executeTenantGarbageCollection({ gracePeriodDays, requestId: 'daemon-gc-' + Date.now() });
    console.log(`Garbage collection completed successfully. Purged ${result.purgedCount} tenants.`);
    process.exit(0);
  } catch (err) {
    console.error('Failed to execute garbage collection:', err);
    process.exit(1);
  }
}

main();
