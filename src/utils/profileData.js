const clean = (value, max) => String(value || '').replace(/[^\P{Cc}\r\n\t]/gu, ' ').trim().slice(0, max);
const list = (value, max) => Array.isArray(value) ? value.slice(0, max) : [];

export function normalizeProfileData(input = {}) {
  const profile = input && typeof input === 'object' ? input : {};
  const simple = ['firstname','lastname','name','email','phone','address','city','postalCode','postalcode','country','occupation','linkedinUrl','githubUrl','websiteUrl','website'];
  const result = Object.fromEntries(simple.map(key => [key, clean(profile[key], ['address'].includes(key) ? 500 : 240)]));
  result.summary = clean(profile.summary, 5000);
  result.selectedImage = normalizeProfileImage(profile.selectedImage);
  result.workExperiences = list(profile.workExperiences, 50).map(item => normalizeEntry(item, ['jobTitle','company','city','startDate','endDate','description']));
  result.education = list(profile.education, 50).map(item => normalizeEntry(item, ['degree','school','city','startDate','endDate','description']));
  result.skills = list(profile.skills, 100).map(item => normalizeEntry(item, ['name','level']));
  result.languages = list(profile.languages, 30).map(item => normalizeEntry(item, ['name','level']));
  result.hobbies = list(profile.hobbies || profile.interests, 50).map(item => typeof item === 'string' ? clean(item, 200) : (item && typeof item === 'object' ? clean(item.name || item.hobby || item.title || '', 200) : '')).filter(Boolean);
  result.certifications = list(profile.certifications, 50).map(item => normalizeEntry(item, ['title','issuer','date','url','link']));
  result.projects = list(profile.projects, 50).map(item => normalizeEntry(item, ['title','description','link','url']));
  result.achievements = list(profile.achievements || profile.awards, 50).map(item => normalizeEntry(item, ['title','name','issuer','awarder','date','description']));
  result.references = list(profile.references, 30).map(item => normalizeEntry(item, ['name','position','company','email','phone','reference','description']));
  result.customSections = list(profile.customSections, 20).map((section, sIdx) => {
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
  result.revision = Math.max(0, Number(profile.revision) || 0);
  return result;
}

function normalizeEntry(value, fields) {
  const item = value && typeof value === 'object' ? value : (typeof value === 'string' ? { [fields[0]]: value } : {});
  return { id: clean(item.id, 128), ...Object.fromEntries(fields.map(field => [field, clean(item[field], field === 'description' ? 5000 : 500)])) };
}

export function normalizeProfileImage(value) {
  const image = String(value || '').trim();
  if (!image) return null;
  if (/^https:\/\//i.test(image) || (image.startsWith('/') && !image.startsWith('//'))) return image.slice(0, 2048);
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(image) && image.length <= 1_000_000) return image;
  return null;
}

export function profileFitsPersistenceLimit(profile) {
  return new Blob([JSON.stringify(normalizeProfileData(profile))]).size <= 850_000;
}
