import { normalizeProfileData, profileFitsFirestore } from '../utils/profileData.js';

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

export async function saveProfile(referenceFactory, uid, inputProfile, expectedRevision, { runTransaction } = {}) {
  if (!uid) return { success: false, error: 'Sign in again before saving your profile.', code: 'AUTH_REQUIRED' };
  if (!profileFitsFirestore(inputProfile)) return { success: false, error: 'Profile is too large to save.', code: 'PROFILE_TOO_LARGE' };

  const tx = runTransaction || referenceFactory.runTransaction.bind(referenceFactory);
  const reference = referenceFactory.collection('users').doc(uid);
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

export async function saveProfileAvatar(referenceFactory, uid, selectedImage, expectedRevision, { runTransaction } = {}) {
  if (!uid) return { success: false, error: 'Sign in again before uploading an avatar.', code: 'AUTH_REQUIRED' };

  const normalizedImage = normalizeProfileData({ selectedImage }).selectedImage;
  if (!normalizedImage) return { success: false, error: 'Avatar must be a bounded PNG, JPEG, or WebP image.', code: 'INVALID_AVATAR' };

  const tx = runTransaction || referenceFactory.runTransaction.bind(referenceFactory);
  const reference = referenceFactory.collection('users').doc(uid);
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
