const crypto = require('crypto');
const dotenv = require('dotenv');
dotenv.config({ path: 'backend/.env' });

async function getAccessToken() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedClaim = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const signatureInput = `${encodedHeader}.${encodedClaim}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureInput);
  const signature = signer.sign(privateKey, 'base64url');

  const jwt = `${signatureInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error('Failed to get token: ' + JSON.stringify(tokenData));
  }
  return tokenData.access_token;
}

async function main() {
  console.log('Querying Firebase / Google Identity Platform Configuration...');
  const accessToken = await getAccessToken();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v2/projects/${projectId}/config`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await res.json();
  console.log(`HTTP Status: ${res.status}`);

  if (data.authorizedDomains) {
    console.log('\n======================================================');
    console.log('       CURRENT FIREBASE AUTHORIZED DOMAINS            ');
    console.log('======================================================');
    data.authorizedDomains.forEach(domain => {
      const isTarget = domain.includes('ime365.com');
      console.log(`  ${isTarget ? '👉 [ACTIVE]' : '   '} ${domain}`);
    });
    console.log('======================================================\n');

    const hasRootDomain = data.authorizedDomains.includes('ime365.com');
    const hasWwwDomain = data.authorizedDomains.includes('www.ime365.com');

    console.log(`ime365.com authorized:     ${hasRootDomain ? '✅ YES' : '❌ NO'}`);
    console.log(`www.ime365.com authorized: ${hasWwwDomain ? '✅ YES' : '❌ NO'}`);

    if (hasRootDomain && hasWwwDomain) {
      console.log('\n🎉 SUCCESS: Both ime365.com and www.ime365.com are active in Firebase Authorized Domains!');
    } else if (hasRootDomain) {
      console.log('\n⚠️ NOTICE: ime365.com is active, but www.ime365.com is missing (check for typos like space).');
    } else {
      console.log('\n❌ ERROR: ime365.com was not found in authorized domains.');
    }
  } else {
    console.log('Response payload:', JSON.stringify(data, null, 2));
  }
}

main().catch(err => {
  console.error('Check failed:', err);
  process.exit(1);
});
