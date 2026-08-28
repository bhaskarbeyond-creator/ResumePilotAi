import { normalizeProfileData, profileFitsPersistenceLimit } from '../utils/profileData.js';
import { apiFetch } from './api/client.js';

/** Profile persistence through the revision-guarded MariaDB API boundary. */
function failure(error) {
  return {
    success: false,
    error: error.message,
    code: error.code,
    remoteRevision: error.remoteRevision ?? error.details?.remoteRevision ?? error.details?.error?.remoteRevision,
    remoteProfile: error.remoteProfile ?? error.details?.remoteProfile ?? error.details?.error?.remoteProfile,
  };
}

function profileFromResponse(data) {
  const user = data?.user;
  if (!user || typeof user !== 'object') throw Object.assign(new Error('Profile API returned an invalid response.'), { code: 'INVALID_PROFILE_RESPONSE' });
  return normalizeProfileData(user.profile || user);
}

async function loadCurrentProfile(api) {
  const data = await api('/api/users-data/profile');
  return profileFromResponse(data);
}


async function saveProfileViaApi(api, normalized, expectedRevision) {
  const data = await api('/api/users-data/profile', {
    method: 'POST',
    body: JSON.stringify({ expectedRevision, profile: normalized }),
  });
  const saved = profileFromResponse(data);
  if (!Number.isInteger(Number(saved.revision)) || Number(saved.revision) <= Number(expectedRevision)) {
    throw Object.assign(new Error('Profile API returned an invalid revision.'), { code: 'INVALID_PROFILE_REVISION' });
  }
  return { success: true, revision: Number(saved.revision), profile: saved };
}

export async function saveProfile(uid, inputProfile, expectedRevision, { api = apiFetch } = {}) {
  if (!uid) return { success: false, error: 'Sign in again before saving your profile.', code: 'AUTH_REQUIRED' };
  if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) < 0) {
    return { success: false, error: 'A valid profile revision is required.', code: 'PROFILE_REVISION_REQUIRED' };
  }
  if (!profileFitsPersistenceLimit(inputProfile)) {
    return { success: false, error: 'Profile is too large to save.', code: 'PROFILE_TOO_LARGE' };
  }
  try {
    return await saveProfileViaApi(api, normalizeProfileData(inputProfile), Number(expectedRevision));
  } catch (error) {
    return failure(error);
  }
}

export async function saveProfileAvatar(uid, selectedImage, expectedRevision, { api = apiFetch } = {}) {
  if (!uid) return { success: false, error: 'Sign in again before uploading an avatar.', code: 'AUTH_REQUIRED' };
  if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) < 0) {
    return { success: false, error: 'A valid profile revision is required.', code: 'PROFILE_REVISION_REQUIRED' };
  }
  const normalizedImage = normalizeProfileData({ selectedImage }).selectedImage;
  if (!normalizedImage) {
    return { success: false, error: 'Avatar must be a bounded PNG, JPEG, or WebP image.', code: 'INVALID_AVATAR' };
  }
  try {
    const current = await loadCurrentProfile(api);
    const profile = { ...current, selectedImage: normalizedImage };
    const saved = await saveProfileViaApi(api, profile, Number(expectedRevision));
    return { success: true, revision: saved.revision, selectedImage: normalizedImage };
  } catch (error) {
    return failure(error);
  }
}
