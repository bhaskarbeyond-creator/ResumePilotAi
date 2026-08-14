const ACCOUNT_SCOPED_LOCAL_KEYS = [
  'user', 'firebase_user', 'user_session',
  'currentResumeId', 'currentResumeItem', 'resumeData',
  'currentCoverId', 'currentCoverItem', 'interviewProgress',
  'oauth_user_session', 'linkedin_user_session', 'github_user_session', 'google_user_session', 'fb_user_session',
];
const ACCOUNT_SCOPED_LOCAL_PREFIXES = ['resume_recovery:'];

export function clearAccountScopedBrowserState(options = {}) {
  try {
    const local = options.local ?? globalThis.localStorage;
    for (const key of ACCOUNT_SCOPED_LOCAL_KEYS) local?.removeItem(key);
    const dynamicKeys = [];
    for (let index = 0; index < Number(local?.length || 0); index += 1) {
      const key = local?.key(index);
      if (key && ACCOUNT_SCOPED_LOCAL_PREFIXES.some(prefix => key.startsWith(prefix))) dynamicKeys.push(key);
    }
    for (const key of dynamicKeys) local?.removeItem(key);
  } catch { /* storage may be unavailable */ }
  try { (options.session ?? globalThis.sessionStorage)?.clear(); } catch { /* optional browser storage */ }
  // Service workers are disabled, but remove any cache left by an older deployed worker
  // so authenticated responses cannot survive a logout on shared devices.
  try {
    const cacheStorage = options.cacheStorage ?? globalThis.caches;
    cacheStorage?.keys().then(keys => Promise.all(keys.map(key => cacheStorage.delete(key)))).catch(() => {});
  } catch { /* CacheStorage is optional */ }
}
