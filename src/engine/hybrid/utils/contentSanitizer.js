/**
 * Content Sanitizer & Meaningful Content Inspector
 * 
 * Truthful detection of empty strings, whitespace, empty HTML paragraphs,
 * empty arrays, null/undefined, and formatting-only markup.
 */

/**
 * Strips HTML tags, decodes common entities, and returns true if non-whitespace characters exist.
 * Correctly detects "<p></p>", "<p><br></p>", "<p class=\"editor-paragraph\"><br></p>", "&nbsp;", etc. as empty.
 */
export function hasMeaningfulText(value) {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  
  const str = String(value);
  if (!str.trim()) return false;

  // Strip all HTML tags
  const noTags = str.replace(/<[^>]*>/g, ' ');

  // Decode common HTML entities to whitespace or plain characters
  const decoded = noTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[\u00a0\u2000-\u200b\u2028\u2029]/g, ' ');

  return decoded.trim().length > 0;
}

/**
 * Filters employment list, removing any entries that have zero meaningful text in all fields.
 */
export function filterMeaningfulEmployments(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((job) => {
    if (!job || typeof job !== 'object') return false;
    return (
      hasMeaningfulText(job.jobTitle) ||
      hasMeaningfulText(job.title) ||
      hasMeaningfulText(job.role) ||
      hasMeaningfulText(job.position) ||
      hasMeaningfulText(job.employer) ||
      hasMeaningfulText(job.company) ||
      hasMeaningfulText(job.organization) ||
      hasMeaningfulText(job.city) ||
      hasMeaningfulText(job.country) ||
      hasMeaningfulText(job.begin) ||
      hasMeaningfulText(job.started) ||
      hasMeaningfulText(job.startDate) ||
      hasMeaningfulText(job.end) ||
      hasMeaningfulText(job.finished) ||
      hasMeaningfulText(job.endDate) ||
      hasMeaningfulText(job.description)
    );
  });
}

/**
 * Filters education list, removing blank records.
 */
export function filterMeaningfulEducations(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((edu) => {
    if (!edu || typeof edu !== 'object') return false;
    return (
      hasMeaningfulText(edu.school) ||
      hasMeaningfulText(edu.institution) ||
      hasMeaningfulText(edu.degree) ||
      hasMeaningfulText(edu.fieldOfStudy) ||
      hasMeaningfulText(edu.city) ||
      hasMeaningfulText(edu.started) ||
      hasMeaningfulText(edu.finished) ||
      hasMeaningfulText(edu.description)
    );
  });
}

/**
 * Filters skills list, removing empty string skills or objects without names.
 */
export function filterMeaningfulSkills(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((skill) => {
    if (!skill) return false;
    if (typeof skill === 'string') return hasMeaningfulText(skill);
    if (typeof skill === 'object') {
      return hasMeaningfulText(skill.name || skill.skillName || skill.skill || skill.title);
    }
    return false;
  });
}

/**
 * Filters projects list, removing blank records.
 */
export function filterMeaningfulProjects(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((proj) => {
    if (!proj || typeof proj !== 'object') return false;
    return (
      hasMeaningfulText(proj.title) ||
      hasMeaningfulText(proj.name) ||
      hasMeaningfulText(proj.description) ||
      hasMeaningfulText(proj.url) ||
      hasMeaningfulText(proj.link)
    );
  });
}

/**
 * Filters certifications list, removing blank records.
 */
export function filterMeaningfulCertifications(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((cert) => {
    if (!cert) return false;
    if (typeof cert === 'string') return hasMeaningfulText(cert);
    if (typeof cert === 'object') {
      return (
        hasMeaningfulText(cert.title) ||
        hasMeaningfulText(cert.name) ||
        hasMeaningfulText(cert.issuer) ||
        hasMeaningfulText(cert.authority) ||
        hasMeaningfulText(cert.date)
      );
    }
    return false;
  });
}

/**
 * Filters achievements list, removing blank records.
 */
export function filterMeaningfulAchievements(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((ach) => {
    if (!ach || typeof ach !== 'object') return false;
    return (
      hasMeaningfulText(ach.title) ||
      hasMeaningfulText(ach.name) ||
      hasMeaningfulText(ach.description) ||
      hasMeaningfulText(ach.issuer)
    );
  });
}

/**
 * Filters references list, removing blank records.
 */
export function filterMeaningfulReferences(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((ref) => {
    if (!ref || typeof ref !== 'object') return false;
    return (
      hasMeaningfulText(ref.name) ||
      hasMeaningfulText(ref.reference) ||
      hasMeaningfulText(ref.contact) ||
      hasMeaningfulText(ref.email) ||
      hasMeaningfulText(ref.phone)
    );
  });
}

/**
 * Filters languages list, removing blank records.
 */
export function filterMeaningfulLanguages(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((lang) => {
    if (!lang) return false;
    if (typeof lang === 'string') return hasMeaningfulText(lang);
    if (typeof lang === 'object') {
      return hasMeaningfulText(lang.name || lang.language);
    }
    return false;
  });
}

/**
 * Filters hobbies/interests list, supporting string, array of strings, or array of objects.
 */
export function filterMeaningfulHobbies(hobbies) {
  if (!hobbies) return [];
  if (typeof hobbies === 'string') {
    return hasMeaningfulText(hobbies) ? [hobbies.trim()] : [];
  }
  if (Array.isArray(hobbies)) {
    return hobbies.filter((h) => {
      if (!h) return false;
      if (typeof h === 'string') return hasMeaningfulText(h);
      if (typeof h === 'object') {
        return hasMeaningfulText(h.name || h.hobby || h.interest || h.title);
      }
      return false;
    });
  }
  return [];
}
