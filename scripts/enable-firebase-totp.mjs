import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';

async function main() {
  console.log('--- Enabling Firebase TOTP Multi-Factor Authentication ---');
  
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
  console.log(`Target Project: ${projectId}`);

  if (getApps().length === 0) {
    if (credential) {
      initializeApp({ credential, projectId });
    } else {
      initializeApp({ projectId });
    }
  }

  try {
    const auth = getAuth();
    const configManager = auth.projectConfigManager();
    
    console.log('Fetching current project config...');
    const currentConfig = await configManager.getProjectConfig();
    console.log('Current MultiFactor Config:', JSON.stringify(currentConfig.multiFactorConfig, null, 2));

    console.log('Updating project config to enable TOTP MFA...');
    const updated = await configManager.updateProjectConfig({
      multiFactorConfig: {
        providerConfigs: [
          {
            state: 'ENABLED',
            totpProviderConfig: {
              adjacentIntervals: 5
            }
          }
        ]
      }
    });

    console.log('SUCCESS! Updated MultiFactor Config:', JSON.stringify(updated.multiFactorConfig, null, 2));
    console.log('✅ TOTP MFA is now enabled on the Firebase project!');
  } catch (err) {
    console.error('Error updating project config:', err.message || err);
    if (err.code === 'auth/insufficient-permission' || err.message.includes('credentials')) {
      console.log('\nNOTE: To run this script directly, ensure GOOGLE_APPLICATION_CREDENTIALS or a Firebase service account JSON is configured in backend/.env.');
    }
  }
}

main().catch(console.error);
