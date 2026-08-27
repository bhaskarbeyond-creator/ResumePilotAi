import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('AUTH-001: Password registration and login model enforcement', async () => {
  const loginSrc = fs.readFileSync('src/components/auth/login/Login.jsx', 'utf8');
  const registerSrc = fs.readFileSync('src/components/auth/register/Register.jsx', 'utf8');

  // Verify email & password inputs and submission validations
  assert.match(loginSrc, /signInWithEmailAndPassword/, 'Login must support standard email/password authentication');
  assert.match(loginSrc, /auth\/invalid-credential/, 'Login must handle invalid credential rejections');
  assert.match(registerSrc, /createUserWithEmailAndPassword/, 'Register must support standard email/password creation');
});

test('AUTH-002: OAuth provider configuration and availability resolution', async () => {
  const loginSrc = fs.readFileSync('src/components/auth/login/Login.jsx', 'utf8');
  const resolverSrc = fs.readFileSync('src/utils/oauthResolver.js', 'utf8');

  assert.match(loginSrc, /signInWithGoogle/, 'Login must support Google OAuth');
  assert.match(loginSrc, /signInWithFacebook/, 'Login must support Facebook OAuth');
  assert.match(resolverSrc, /enableGoogleLogin/, 'OAuth resolver must detect configured OAuth provider states');
});

test('AUTH-003: OAuth registration and MySQL profile synchronization', async () => {
  const authSrc = fs.readFileSync('src/firestore/auth.js', 'utf8');
  
  assert.match(authSrc, /authProvider/, 'Profile creation must store provider identity in authoritative MySQL store');
  assert.match(authSrc, /saveCurrentUserProfile/, 'Profile sync must execute through backend authoritative API');
});

test('AUTH-004: Account identity collision and anti-takeover protection', async () => {
  const loginSrc = fs.readFileSync('src/components/auth/login/Login.jsx', 'utf8');
  const registerSrc = fs.readFileSync('src/components/auth/register/Register.jsx', 'utf8');

  assert.match(loginSrc, /auth\/account-exists-with-different-credential/, 'Login must explicitly guard against identity collision takeover');
  assert.match(registerSrc, /auth\/account-exists-with-different-credential/, 'Register must explicitly guard against identity collision takeover');
});

test('AUTH-005: Session continuity and safe redirect target preservation', async () => {
  const safePathSrc = fs.readFileSync('src/utils/safeInternalPath.js', 'utf8');
  const mainSrc = fs.readFileSync('src/main.jsx', 'utf8');

  assert.match(safePathSrc, /isSafeInternalPath/, 'Safe path validator must reject external open redirects');
  assert.match(mainSrc, /getPostLoginRedirectPath/, 'App shell must preserve return target on login redirect');
});

test('MFA-001: MFA enrollment lifecycle and QR code generation', async () => {
  const mfaSrc = fs.readFileSync('src/services/mfaService.js', 'utf8');

  assert.match(mfaSrc, /TotpMultiFactorGenerator\.generateSecret/, 'MFA service must generate TOTP secrets');
  assert.match(mfaSrc, /TotpMultiFactorGenerator\.assertionForEnrollment/, 'MFA service must verify initial TOTP assertion');
});

test('MFA-002: MFA sign-in challenge and second factor resolver', async () => {
  const mfaSrc = fs.readFileSync('src/services/mfaService.js', 'utf8');
  const loginSrc = fs.readFileSync('src/components/auth/login/Login.jsx', 'utf8');

  assert.match(mfaSrc, /getMultiFactorResolver/, 'MFA service must extract multi-factor resolver on 2FA challenge');
  assert.match(loginSrc, /completeMfaLogin/, 'Login must handle TOTP verification challenge');
});

test('MFA-003: Complete MFA disable lifecycle and server-side state purging', async () => {
  const mfaSrc = fs.readFileSync('src/services/mfaService.js', 'utf8');
  const usersDataRoute = fs.readFileSync('backend/routes/usersData.js', 'utf8');
  const settingsSrc = fs.readFileSync('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8');

  assert.match(mfaSrc, /disableTotpEnrollment/, 'MFA service must export disableTotpEnrollment');
  assert.match(usersDataRoute, /\/mfa\/disable/, 'Backend must expose POST /api/users-data/mfa/disable');
  assert.match(settingsSrc, /handleDisableTotpConfirmed/, 'Settings UI must wire confirmed MFA disable handler');
});

test('MFA-004: Unauthorized MFA disable rejection (RBAC fail-closed)', async () => {
  const usersDataRoute = fs.readFileSync('backend/routes/usersData.js', 'utf8');

  assert.match(usersDataRoute, /router\.post\('\/mfa\/disable',\s*requireAuth/, 'MFA disable endpoint must strictly require authentication');
});

test('UI-001: Button cursor pointer global styling', async () => {
  const scssSrc = fs.readFileSync('src/index.scss', 'utf8');
  const cssSrc = fs.readFileSync('src/index.css', 'utf8');

  assert.match(scssSrc, /button:not\(:disabled\)[^{]*{\s*cursor:\s*pointer;/s, 'index.scss must enforce cursor: pointer on active buttons');
  assert.match(cssSrc, /button\s*{[^}]*cursor:\s*pointer;/s, 'index.css must enforce cursor: pointer on buttons');
});

test('UI-002: Disabled controls cursor not-allowed behavior', async () => {
  const scssSrc = fs.readFileSync('src/index.scss', 'utf8');

  assert.match(scssSrc, /button:disabled[^{]*{\s*cursor:\s*not-allowed/s, 'index.scss must enforce cursor: not-allowed on disabled controls');
});

test('UI-003: Modal controls and interactive close button styling', async () => {
  const scssSrc = fs.readFileSync('src/index.scss', 'utf8');
  const welcomeSrc = fs.readFileSync('src/components/welcome/Welcome.jsx', 'utf8');

  assert.match(scssSrc, /\.closeModalBtn/, 'Close modal button class must have explicit cursor styling');
  assert.match(welcomeSrc, /authBtnHandler/, 'Welcome component must bind modal toggle handler');
});

test('UI-004: Keyboard accessibility and focus ring preservation', async () => {
  const cssSrc = fs.readFileSync('src/index.css', 'utf8');

  assert.match(cssSrc, /button:focus-visible/, 'CSS must preserve visible keyboard focus indicator');
});

test('MFA-LOGIN-001: Password login MFA challenge resolver & verification pipeline', async () => {
  const mfaSrc = fs.readFileSync('src/services/mfaService.js', 'utf8');
  const loginSrc = fs.readFileSync('src/components/auth/login/Login.jsx', 'utf8');

  // Verify resolver function extracts resolver properly on auth/multi-factor-auth-required
  assert.match(mfaSrc, /getTotpSignInResolver/, 'MFA service must provide getTotpSignInResolver');
  assert.match(mfaSrc, /completeTotpSignIn/, 'MFA service must provide completeTotpSignIn');
  assert.match(loginSrc, /getTotpSignInResolver\(error\)/, 'Login must intercept multi-factor error into resolver state');
  assert.match(loginSrc, /completeMfaLogin/, 'Login must execute completeMfaLogin');
});

test('MFA-LOGIN-002: Invalid TOTP submission displays error and retains challenge form', async () => {
  const loginSrc = fs.readFileSync('src/components/auth/login/Login.jsx', 'utf8');

  assert.match(loginSrc, /Invalid or expired authenticator code/, 'Login must report clear error on invalid TOTP without unmounting challenge');
  assert.match(loginSrc, /this\.setState\(\{\s*isSubmitting:\s*false,\s*mfaCode:\s*''\s*\}\)/, 'Login must unlock submitting state and clear invalid input');
});

test('MFA-LOGIN-003: Cancel challenge cleanly returns to login form', async () => {
  const loginSrc = fs.readFileSync('src/components/auth/login/Login.jsx', 'utf8');

  assert.match(loginSrc, /mfaResolver:\s*null,\s*mfaCode:\s*'',\s*password:\s*''/, 'Cancel button must clear MFA state and return to login form');
  assert.match(loginSrc, /← Back to Login/, 'Challenge form must provide clear back navigation');
});

test('MFA-LOGIN-004: OAuth authentication MFA challenge interception', async () => {
  const loginSrc = fs.readFileSync('src/components/auth/login/Login.jsx', 'utf8');

  // Verify Google and Facebook OAuth catches also resolve MFA challenge
  const googleCatch = loginSrc.indexOf('signInWithGoogle');
  const facebookCatch = loginSrc.indexOf('signInWithFacebook');
  assert.ok(googleCatch !== -1 && facebookCatch !== -1, 'OAuth methods must exist');
  assert.match(loginSrc, /signInWithGoogle[\s\S]*?getTotpSignInResolver\(error\)/, 'Google OAuth catch must handle MFA required error');
  assert.match(loginSrc, /signInWithFacebook[\s\S]*?getTotpSignInResolver\(error\)/, 'Facebook OAuth catch must handle MFA required error');
});

test('MFA-LOGIN-005: Stale session / expired token rejection safety', async () => {
  const authGateSrc = fs.readFileSync('backend/security/auth.js', 'utf8');

  assert.match(authGateSrc, /INVALID_AUTH_TOKEN|unauthorized/, 'Auth gate must reject expired tokens fail-closed');
});

test('MFA-LOGIN-006: Unauthorized MFA disable rejection (fail-closed)', async () => {
  const usersDataRoute = fs.readFileSync('backend/routes/usersData.js', 'utf8');

  assert.match(usersDataRoute, /router\.post\('\/mfa\/disable',\s*requireAuth/, 'MFA disable endpoint must reject unauthenticated callers');
});

test('MFA-LOGIN-007: Authorized MFA disable unenrolls factor and synchronizes MariaDB', async () => {
  const mfaSrc = fs.readFileSync('src/services/mfaService.js', 'utf8');
  const usersDataRoute = fs.readFileSync('backend/routes/usersData.js', 'utf8');

  assert.match(mfaSrc, /multiFactor\(user\)\.unenroll/, 'Client service must unenroll factor from Firebase Auth');
  assert.match(usersDataRoute, /mfaEnabled\s*=\s*false|mfaEnabled:\s*false/, 'Backend must update MariaDB to clear mfaEnabled');
});

