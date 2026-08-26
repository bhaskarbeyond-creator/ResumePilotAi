import { normalizeProfileData, profileFitsFirestore } from '../utils/profileData.js';
import { apiFetch } from './api/client.js';

/**
 * Profile persistence — MySQL authoritative via the backend API.
 *
 * ARCHITECTURE: profiles live in the MySQL `users` table (extra_data /
 * profile envelope). There is NO Firestore involvement: saves go through
 * POST /api/users-data/profile with an optimistic-concurrency revision guard
 * enforced server-side inside a MySQL transaction (PROFILE_CONFLICT 409).
 * The in-memory store below exists only for tests.
 */
export function createInMemoryProfileStore(initial = {}) {
  const state = { exists: Object.keys(initial || {}).length > 0, profile: normalizeProfileData(initial) };
  return {
    state,
    runTransaction: async callback => callback({
      get: async () => ({ exists: state.exists, data: () => ({ profile: state.profile }) }),
      set: (_reference, data) => {
        state.exists = true;
        state.profile = normalizeProfileData(data.profile);
      },
    }),
  };
}

function failure(error) {
  return { success: false, error: error.message, code: error.code, remoteRevision: error.remoteRevision, remoteProfile: error.remoteProfile };
}

async function loadCurrentProfile(uid) {
  const data = await apiFetch(`/api/users-data/${encodeURIComponent(uid)}`);
  return data && data.user ? normalizeProfileData(data.user.profile || {}) : normalizeProfileData({});
}

async function saveProfileViaApi(uid, normalized, expectedRevision) {
  const data = await apiFetch('/api/users-data/profile', {
    method: 'POST',
    body: JSON.stringify({
      ...(normalized || {}),
      expectedRevision,
      profile: normalized,
    }),
  });
  const saved = data && data.user ? normalizeProfileData(data.user.profile || {}) : normalized;
  return { success: true, revision: saved.revision || (Number(expectedRevision || 0) + 1), profile: saved };
}

export async function saveProfile(referenceFactory, uid, inputProfile, expectedRevision, { runTransaction } = {}) {
  if (!uid) return { success: false, error: 'Sign in again before saving your profile.', code: 'AUTH_REQUIRED' };
  if (!profileFitsFirestore(inputProfile)) return { success: false, error: 'Profile is too large to save.', code: 'PROFILE_TOO_LARGE' };

  // Test-only injected store path (mirrors the previous transaction semantics).
  // Production passes `null` and uses the MySQL-backed API path above.
  if (referenceFactory && typeof referenceFactory.runTransaction === 'function') {
    const tx = runTransaction || referenceFactory.runTransaction.bind(referenceFactory);
    const reference = { id: uid };
    let result;
    try {
      await tx(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw Object.assign(new Error('Profile not found.'), { code: 'PROFILE_NOT_FOUND' });
        const current = normalizeProfileData(snapshot.data()?.profile || {});
        if (expectedRevision !== null && Number(expectedRevision) !== current.revision) {
          throw Object.assign(new Error('Profile changed in another tab or device.'), {
            code: 'PROFILE_CONFLICT',
            remoteRevision: current.revision,
            remoteProfile: current,
          });
        }
        const normalized = normalizeProfileData(inputProfile);
        normalized.revision = current.revision + 1;
        transaction.set(reference, { profile: normalized }, { merge: true });
        result = { success: true, revision: normalized.revision, profile: normalized };
      });
      return result;
    } catch (error) {
      return failure(error);
    }
  }

  try {
    // Server-side guarded save (MySQL transaction, PROFILE_CONFLICT on mismatch).
    return await saveProfileViaApi(uid, inputProfile, expectedRevision);
  } catch (error) {
    return failure(error);
  }
}

export async function saveProfileAvatar(referenceFactory, uid, selectedImage, expectedRevision, { runTransaction } = {}) {
  if (!uid) return { success: false, error: 'Sign in again before uploading an avatar.', code: 'AUTH_REQUIRED' };

  const normalizedImage = normalizeProfileData({ selectedImage }).selectedImage;
  if (!normalizedImage) return { success: false, error: 'Avatar must be a bounded PNG, JPEG, or WebP image.', code: 'INVALID_AVATAR' };

  if (referenceFactory && typeof referenceFactory.runTransaction === 'function') {
    const tx = runTransaction || referenceFactory.runTransaction.bind(referenceFactory);
    const reference = { id: uid };
    let result;
    try {
      await tx(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw Object.assign(new Error('Profile not found.'), { code: 'PROFILE_NOT_FOUND' });
        const current = normalizeProfileData(snapshot.data()?.profile || {});
        if (expectedRevision !== null && Number(expectedRevision) !== current.revision) {
          throw Object.assign(new Error('Profile changed elsewhere. Reload before replacing the avatar.'), {
            code: 'PROFILE_CONFLICT',
            remoteRevision: current.revision,
            remoteProfile: current,
          });
        }
        const profile = { ...current, selectedImage: normalizedImage, revision: current.revision + 1 };
        transaction.set(reference, { profile }, { merge: true });
        result = { success: true, revision: profile.revision, selectedImage: normalizedImage };
      });
      return result;
    } catch (error) {
      return failure(error);
    }
  }

  try {
    const current = await loadCurrentProfile(uid);
    const profile = { ...current, selectedImage: normalizedImage, revision: (Number(current.revision) || 0) + 1 };
    const saved = await saveProfileViaApi(uid, profile, expectedRevision);
    return { success: true, revision: saved.revision, selectedImage: normalizedImage };
  } catch (error) {
    return failure(error);
  }
}
