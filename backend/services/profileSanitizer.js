'use strict';

const SIMPLE_LIMITS = Object.freeze({
  firstname: 120,
  lastname: 120,
  name: 240,
  phone: 50,
  address: 500,
  city: 100,
  postalCode: 32,
  postalcode: 32,
  country: 100,
  occupation: 255,
  jobTitle: 255,
  bio: 5000,
  linkedinUrl: 1024,
  githubUrl: 1024,
  websiteUrl: 1024,
  website: 1024,
  displayName: 255,
  summary: 5000,
});

const LIST_FIELDS = Object.freeze({
  workExperiences: { max: 50, fields: { id: 128, jobTitle: 500, company: 500, city: 500, startDate: 500, endDate: 500, description: 5000 } },
  education: { max: 50, fields: { id: 128, degree: 500, school: 500, city: 500, startDate: 500, endDate: 500, description: 5000 } },
  skills: { max: 100, fields: { id: 128, name: 500, level: 500 } },
  languages: { max: 30, fields: { id: 128, name: 500, level: 500 } },
  certifications: { max: 50, fields: { id: 128, title: 500, issuer: 500, date: 500, url: 1024, link: 1024 } },
  projects: { max: 50, fields: { id: 128, title: 500, description: 5000, link: 1024, url: 1024 } },
  achievements: { max: 50, fields: { id: 128, title: 500, name: 500, issuer: 500, awarder: 500, date: 500, description: 5000 } },
  references: { max: 30, fields: { id: 128, name: 500, position: 500, company: 500, email: 255, phone: 50, reference: 5000, description: 5000 } },
});

const ALLOWED_INPUT_FIELDS = new Set([
  ...Object.keys(SIMPLE_LIMITS), ...Object.keys(LIST_FIELDS),
  'awards', 'customSections', 'hobbies', 'interests', 'selectedImage', 'photoURL', 'photoUrl',
  'preferences', 'revision', 'email',
]);

const FORBIDDEN_PROFILE_FIELDS = new Set([
  'role', 'permissions', 'isAdmin', 'isA', 'superAdmin', 'suspended', 'disabled',
  'membership', 'membershipEnds', 'paymentStatus', 'lastPaymentGateway',
  'lastPaymentOrderId', 'lastPaymentAmount', 'lastPaymentCurrency',
  'cancellationRequested', 'emailVerified', 'mfaEnabled', 'mfaEnrolledAt',
  'aiQuotaOverride', 'aiQuotaLastResetAt', 'deleted_at', 'created_at', 'updated_at',
]);

const LANGUAGES = new Set(['en', 'hi', 'es', 'fr', 'de', 'pt', 'it', 'nl']);

function httpError(message, code, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function clean(value, max) {
  return String(value ?? '').replace(/\p{Cc}/gu, ' ').trim().slice(0, max);
}

function safeImage(value) {
  const image = String(value || '').trim();
  if (!image) return null;
  if (/^https:\/\//i.test(image) || (image.startsWith('/') && !image.startsWith('//'))) return image.slice(0, 2048);
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(image) && image.length <= 1_000_000) return image;
  throw httpError('Avatar must be a bounded PNG, JPEG, or WebP image.', 'INVALID_AVATAR');
}

function sanitizeList(value, definition, field) {
  if (!Array.isArray(value)) throw httpError(`${field} must be an array.`, 'INVALID_PROFILE_FIELD');
  return value.slice(0, definition.max).map(item => {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    return Object.fromEntries(Object.entries(definition.fields).map(([key, max]) => [key, clean(source[key], max)]));
  });
}

function sanitizeHobbies(value) {
  if (!Array.isArray(value)) throw httpError('hobbies must be an array.', 'INVALID_PROFILE_FIELD');
  return value.slice(0, 50).map(item => clean(typeof item === 'string' ? item : item?.name || item?.title, 200)).filter(Boolean);
}

function sanitizeCustomSections(value) {
  if (!Array.isArray(value)) throw httpError('customSections must be an array.', 'INVALID_PROFILE_FIELD');
  return value.slice(0, 20).map((section, sIdx) => {
    if (!section || typeof section !== 'object') return null;
    const id = clean(section.id || `custom-${sIdx}`, 128);
    const title = clean(section.title || section.heading, 500);
    const content = clean(section.content, 5000);
    const rawItems = Array.isArray(section.items) ? section.items.slice(0, 50) : [];
    const items = rawItems.map((item, iIdx) => {
      if (typeof item === 'string') {
        const itemTitle = clean(item, 500);
        return itemTitle ? { id: `custom-${sIdx}-item-${iIdx}`, title: itemTitle, description: '' } : null;
      }
      if (!item || typeof item !== 'object') return null;
      return {
        id: clean(item.id || `custom-${sIdx}-item-${iIdx}`, 128),
        title: clean(item.title || item.name, 500),
        description: clean(item.description || item.content, 5000),
      };
    }).filter(Boolean);
    return { id, title, content, items };
  }).filter(Boolean);
}

function sanitizePreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError('preferences must be an object.', 'INVALID_PREFERENCES');
  const language = String(value.language || 'en').toLowerCase();
  if (!LANGUAGES.has(language)) throw httpError('Unsupported preference language.', 'INVALID_PREFERENCES');
  return {
    language,
    emailNotifications: value.emailNotifications !== false,
    securityNotifications: value.securityNotifications !== false,
    productUpdates: value.productUpdates === true,
    profileDiscoverable: value.profileDiscoverable === true,
  };
}

function sanitizeProfilePatch(input, { identityEmail = null } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('profile must be an object.', 'INVALID_PROFILE');
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 850_000) throw httpError('Profile is too large to save.', 'PROFILE_TOO_LARGE', 413);

  for (const key of Object.keys(input)) {
    if (FORBIDDEN_PROFILE_FIELDS.has(key)) throw httpError(`Profile field ${key} is server-owned.`, 'PROFILE_FIELD_FORBIDDEN', 403);
    if (!ALLOWED_INPUT_FIELDS.has(key)) throw httpError(`Unsupported profile field: ${key}.`, 'UNSUPPORTED_PROFILE_FIELD');
  }
  if (Object.hasOwn(input, 'email') && input.email && identityEmail
    && String(input.email).trim().toLowerCase() !== String(identityEmail).trim().toLowerCase()) {
    throw httpError('Profile email must match the authenticated identity.', 'IDENTITY_EMAIL_MISMATCH', 403);
  }

  const output = {};
  for (const [key, max] of Object.entries(SIMPLE_LIMITS)) {
    if (Object.hasOwn(input, key)) output[key] = clean(input[key], max);
  }
  for (const [key, definition] of Object.entries(LIST_FIELDS)) {
    if (Object.hasOwn(input, key)) output[key] = sanitizeList(input[key], definition, key);
  }
  if (Object.hasOwn(input, 'awards') && !Object.hasOwn(input, 'achievements')) {
    output.achievements = sanitizeList(input.awards, LIST_FIELDS.achievements, 'achievements');
  }
  if (Object.hasOwn(input, 'customSections')) output.customSections = sanitizeCustomSections(input.customSections);
  if (Object.hasOwn(input, 'hobbies') || Object.hasOwn(input, 'interests')) output.hobbies = sanitizeHobbies(input.hobbies || input.interests);
  if (Object.hasOwn(input, 'selectedImage')) output.selectedImage = safeImage(input.selectedImage);
  if (Object.hasOwn(input, 'photoURL') || Object.hasOwn(input, 'photoUrl')) output.photoURL = safeImage(input.photoURL || input.photoUrl);
  if (Object.hasOwn(input, 'preferences')) output.preferences = sanitizePreferences(input.preferences);
  return output;
}

function projectEditableProfile(user = {}) {
  const projected = {};
  for (const key of Object.keys(SIMPLE_LIMITS)) {
    if (user[key] !== undefined && user[key] !== null) projected[key] = clean(user[key], SIMPLE_LIMITS[key]);
  }
  for (const [key, definition] of Object.entries(LIST_FIELDS)) {
    if (Array.isArray(user[key])) projected[key] = sanitizeList(user[key], definition, key);
  }
  if (Array.isArray(user.awards) && !Array.isArray(user.achievements)) {
    projected.achievements = sanitizeList(user.awards, LIST_FIELDS.achievements, 'achievements');
  }
  if (Array.isArray(user.customSections)) projected.customSections = sanitizeCustomSections(user.customSections);
  if (Array.isArray(user.hobbies)) projected.hobbies = sanitizeHobbies(user.hobbies);
  if (user.selectedImage) projected.selectedImage = safeImage(user.selectedImage);
  if (user.photoURL || user.photoUrl) projected.photoURL = safeImage(user.photoURL || user.photoUrl);
  if (user.preferences) projected.preferences = { ...sanitizePreferences(user.preferences), revision: Number(user.revision || 0) };
  projected.email = clean(user.email, 255);
  projected.revision = Number(user.revision || 0);
  return projected;
}

module.exports = {
  sanitizeProfilePatch,
  projectEditableProfile,
  FORBIDDEN_PROFILE_FIELDS,
};
